-- ============================================================
-- Migration 056 – Phase B: helpers, RLS policies, log_document_access RPC
--
-- Builds on:
--   054_child_documents.sql   (schema, enums, integrity triggers)
--   055_child_documents_storage.sql (bucket + storage policies)
--
-- Sections:
--   1. Helper functions
--      - parent_guardian_ids()
--      - external_contact_ids_for_caller()
--      - teacher_visible_student_ids()
--      - accessible_document_ids()
--   2. document_access_events refinements
--      (extend actor_kind CHECK to include 'unauthenticated' and 'super_admin'
--       so the RPC can log denied attempts from those actor classes)
--   3. RLS policies on the 7 application tables
--   4. Parent-consent transition guard trigger (column-level enforcement)
--   5. log_document_access(p_doc_id, p_action, p_ip, p_user_agent) RPC
--
-- super_admin posture: NO bypass policies on any of the 7 new tables.
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. HELPER FUNCTIONS
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1.1 parent_guardian_ids() — guardian rows whose email matches the JWT
-- This is how email-keyed JWTs are bound to guardian_id (the source
-- of truth for parent identity throughout the document system).
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION parent_guardian_ids()
  RETURNS UUID[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT id FROM guardians
      WHERE lower(email) = lower(coalesce(auth.jwt()->>'email',''))
    ),
    '{}'::UUID[]
  );
$$;


-- ─────────────────────────────────────────────────────────────────
-- 1.2 external_contact_ids_for_caller()
-- Resolves JWT email → external_contacts.id rows (across all schools
-- the caller is registered with). Filters out deactivated rows.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION external_contact_ids_for_caller()
  RETURNS UUID[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT id FROM external_contacts
      WHERE lower(email)   = lower(coalesce(auth.jwt()->>'email',''))
        AND deactivated_at IS NULL
    ),
    '{}'::UUID[]
  );
$$;


-- ─────────────────────────────────────────────────────────────────
-- 1.3 teacher_visible_student_ids()
-- Returns the set of student_ids reachable by the current caller via
-- (class_teachers ⨝ enrollments where status='enrolled'). Returns
-- '{}'::UUID[] if the caller is not a teacher (composes safely with
-- accessible_document_ids).
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION teacher_visible_student_ids()
  RETURNS UUID[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT e.student_id
      FROM class_teachers ct
      JOIN enrollments    e ON e.class_id = ct.class_id
      WHERE ct.teacher_id = auth.uid()
        AND e.status      = 'enrolled'
    ),
    '{}'::UUID[]
  );
$$;


-- ─────────────────────────────────────────────────────────────────
-- 1.4 accessible_document_ids()
-- The single SELECT-policy primitive for child_documents and dependants.
-- Returns the set of document ids the caller can see via any path.
-- Strict v1 teacher scope: class-enrolled students plus explicit grants.
-- Parents: only shared/archived OR own (source_kind='parent') uploads.
-- Grantees: active grants only, with consent re-validated when present.
-- Documents in status='revoked' are excluded except for in-school staff.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accessible_document_ids()
  RETURNS UUID[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  WITH candidates AS (

    -- (1) school_admin: every document in their school (incl. 'revoked' for audit)
    SELECT id FROM child_documents
    WHERE current_user_role() = 'school_admin'
      AND school_id = current_user_school_id()

    UNION

    -- (2) teacher: documents for students they currently teach (incl. 'revoked')
    SELECT d.id FROM child_documents d
    WHERE current_user_role() = 'teacher'
      AND d.school_id = current_user_school_id()
      AND d.student_id = ANY(teacher_visible_student_ids())

    UNION

    -- (3) school_user grant: any role who has an active grant pointing at them
    --     (consent_id NULL only allowed for in-school grants per Phase A trigger;
    --      consent_id NOT NULL must be 'granted' and not expired)
    SELECT g.document_id
    FROM document_access_grants g
    JOIN child_documents d ON d.id = g.document_id
    LEFT JOIN document_consents c ON c.id = g.consent_id
    WHERE g.grantee_kind = 'school_user'
      AND g.grantee_user_id = auth.uid()
      AND g.revoked_at IS NULL
      AND g.expires_at > NOW()
      AND d.status <> 'revoked'
      AND (
        g.consent_id IS NULL
        OR (c.status = 'granted' AND c.expires_at > NOW())
      )

    UNION

    -- (4) school grant: caller belongs to a school that was granted access
    SELECT g.document_id
    FROM document_access_grants g
    JOIN child_documents d ON d.id = g.document_id
    LEFT JOIN document_consents c ON c.id = g.consent_id
    WHERE g.grantee_kind = 'school'
      AND g.grantee_school_id = current_user_school_id()
      AND current_user_role() IN ('school_admin','teacher')
      AND g.revoked_at IS NULL
      AND g.expires_at > NOW()
      AND d.status <> 'revoked'
      AND (
        g.consent_id IS NULL
        OR (c.status = 'granted' AND c.expires_at > NOW())
      )

    UNION

    -- (5) parent: kid is theirs AND (own upload OR explicitly shared/archived)
    SELECT id FROM child_documents
    WHERE student_id = ANY(parent_student_ids())
      AND status <> 'revoked'
      AND (
        source_kind = 'parent'
        OR status IN ('shared','archived')
      )

    UNION

    -- (6) external_contact: active grant + consent granted + not expired
    SELECT g.document_id
    FROM document_access_grants g
    JOIN child_documents d ON d.id = g.document_id
    JOIN document_consents c ON c.id = g.consent_id
    WHERE g.grantee_kind = 'external_contact'
      AND g.grantee_external_contact_id = ANY(external_contact_ids_for_caller())
      AND g.revoked_at IS NULL
      AND g.expires_at > NOW()
      AND d.status <> 'revoked'
      AND c.status = 'granted'
      AND c.expires_at > NOW()
  )
  SELECT COALESCE(ARRAY(SELECT DISTINCT id FROM candidates), '{}'::UUID[]);
$$;


-- ════════════════════════════════════════════════════════════════
-- 2. document_access_events — actor_kind CHECK refinement
-- The RPC needs to log 'unauthenticated' and 'super_admin' attempts.
-- Phase A's CHECK only allowed the four roles. Replace it.
-- ════════════════════════════════════════════════════════════════
ALTER TABLE document_access_events
  DROP CONSTRAINT IF EXISTS document_access_events_actor_kind_chk;

ALTER TABLE document_access_events
  ADD CONSTRAINT document_access_events_actor_kind_chk
  CHECK (actor_kind IN (
    'school_admin','teacher','parent','external_contact',
    'super_admin','unauthenticated'
  ));


-- ════════════════════════════════════════════════════════════════
-- 3. RLS POLICIES
--
-- super_admin: NO policies added to any of the 7 new tables.
-- Service-role bypasses RLS by design — that is the only path for
-- platform-owner data access, and it must be logged separately.
-- ════════════════════════════════════════════════════════════════


-- ── Idempotency: drop any pre-existing copies of every policy this
-- migration creates. Same pattern used by 014/022/038/055. Order
-- mirrors the CREATE POLICY blocks below.
-- ─────────────────────────────────────────────────────────────────

-- 3.1 external_contacts
DROP POLICY IF EXISTS "school_staff_select_external_contacts"        ON external_contacts;
DROP POLICY IF EXISTS "external_contact_select_self"                 ON external_contacts;
DROP POLICY IF EXISTS "school_admin_insert_external_contacts"        ON external_contacts;
DROP POLICY IF EXISTS "school_admin_update_external_contacts"        ON external_contacts;
DROP POLICY IF EXISTS "school_admin_delete_external_contacts"        ON external_contacts;

-- 3.2 child_documents
DROP POLICY IF EXISTS "child_documents_select"                       ON child_documents;
DROP POLICY IF EXISTS "school_staff_insert_child_documents"          ON child_documents;
DROP POLICY IF EXISTS "parent_insert_child_documents"                ON child_documents;
DROP POLICY IF EXISTS "school_admin_update_child_documents"          ON child_documents;
DROP POLICY IF EXISTS "teacher_update_own_child_documents"           ON child_documents;
DROP POLICY IF EXISTS "parent_update_own_draft_child_documents"      ON child_documents;
DROP POLICY IF EXISTS "school_admin_delete_draft_child_documents"    ON child_documents;
DROP POLICY IF EXISTS "teacher_delete_own_draft_child_documents"     ON child_documents;
DROP POLICY IF EXISTS "parent_delete_own_draft_child_documents"      ON child_documents;

-- 3.3 child_document_versions
DROP POLICY IF EXISTS "school_staff_select_child_document_versions"        ON child_document_versions;
DROP POLICY IF EXISTS "non_staff_select_current_child_document_version"    ON child_document_versions;
DROP POLICY IF EXISTS "school_staff_insert_child_document_versions"        ON child_document_versions;
DROP POLICY IF EXISTS "parent_insert_child_document_versions"              ON child_document_versions;
DROP POLICY IF EXISTS "school_admin_update_child_document_versions"        ON child_document_versions;
DROP POLICY IF EXISTS "school_admin_delete_draft_child_document_versions"  ON child_document_versions;
DROP POLICY IF EXISTS "parent_delete_own_draft_child_document_versions"    ON child_document_versions;

-- 3.4 document_consents
DROP POLICY IF EXISTS "school_staff_select_document_consents"        ON document_consents;
DROP POLICY IF EXISTS "parent_select_document_consents"              ON document_consents;
DROP POLICY IF EXISTS "school_staff_insert_document_consents"        ON document_consents;
DROP POLICY IF EXISTS "school_admin_update_document_consents"        ON document_consents;
DROP POLICY IF EXISTS "teacher_update_own_document_consents"         ON document_consents;
DROP POLICY IF EXISTS "parent_update_document_consents"              ON document_consents;
DROP POLICY IF EXISTS "school_admin_delete_pending_document_consents" ON document_consents;

-- 3.5 document_access_grants
DROP POLICY IF EXISTS "school_staff_select_document_access_grants"           ON document_access_grants;
DROP POLICY IF EXISTS "parent_select_document_access_grants"                 ON document_access_grants;
DROP POLICY IF EXISTS "school_user_select_own_document_access_grants"        ON document_access_grants;
DROP POLICY IF EXISTS "external_contact_select_own_document_access_grants"   ON document_access_grants;
DROP POLICY IF EXISTS "school_admin_insert_document_access_grants"           ON document_access_grants;
DROP POLICY IF EXISTS "school_admin_update_document_access_grants"           ON document_access_grants;

-- 3.6 document_requests
DROP POLICY IF EXISTS "school_staff_select_document_requests"                ON document_requests;
DROP POLICY IF EXISTS "parent_select_document_requests_to_self"              ON document_requests;
DROP POLICY IF EXISTS "external_contact_select_own_document_requests"        ON document_requests;
DROP POLICY IF EXISTS "school_staff_insert_document_requests"                ON document_requests;
DROP POLICY IF EXISTS "school_staff_update_document_requests"                ON document_requests;
DROP POLICY IF EXISTS "parent_fulfill_document_requests"                     ON document_requests;
DROP POLICY IF EXISTS "external_contact_fulfill_document_requests"           ON document_requests;
DROP POLICY IF EXISTS "school_admin_delete_cancelled_document_requests"      ON document_requests;

-- 3.7 document_access_events
DROP POLICY IF EXISTS "school_admin_select_document_access_events"           ON document_access_events;
DROP POLICY IF EXISTS "teacher_select_scoped_document_access_events"         ON document_access_events;
DROP POLICY IF EXISTS "parent_select_own_child_document_access_events"       ON document_access_events;
DROP POLICY IF EXISTS "external_contact_select_own_document_access_events"   ON document_access_events;


-- ─────────────────────────────────────────────────────────────────
-- 3.1 external_contacts
-- ─────────────────────────────────────────────────────────────────

CREATE POLICY "school_staff_select_external_contacts"
  ON external_contacts FOR SELECT
  TO authenticated
  USING (
    current_user_role() IN ('school_admin','teacher')
    AND school_id = current_user_school_id()
  );

CREATE POLICY "external_contact_select_self"
  ON external_contacts FOR SELECT
  TO authenticated
  USING (id = ANY(external_contact_ids_for_caller()));

CREATE POLICY "school_admin_insert_external_contacts"
  ON external_contacts FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  );

CREATE POLICY "school_admin_update_external_contacts"
  ON external_contacts FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  )
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  );

CREATE POLICY "school_admin_delete_external_contacts"
  ON external_contacts FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  );


-- ─────────────────────────────────────────────────────────────────
-- 3.2 child_documents
-- ─────────────────────────────────────────────────────────────────

-- SELECT: unified across roles via the helper.
CREATE POLICY "child_documents_select"
  ON child_documents FOR SELECT
  TO authenticated
  USING (id = ANY(accessible_document_ids()));

-- INSERT: school staff for school/external_contact source docs.
CREATE POLICY "school_staff_insert_child_documents"
  ON child_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() IN ('school_admin','teacher')
    AND school_id   = current_user_school_id()
    AND source_kind IN ('school','external_contact')
    AND created_by  = auth.uid()
    -- teacher additionally must scope to a student they teach
    AND (
      current_user_role() = 'school_admin'
      OR student_id = ANY(teacher_visible_student_ids())
    )
  );

-- INSERT: parent for parent_provided drafts on own child.
CREATE POLICY "parent_insert_child_documents"
  ON child_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'parent'
    AND source_kind = 'parent'
    AND student_id  = ANY(parent_student_ids())
    AND status      = 'draft'
    AND created_by  = auth.uid()
  );

-- UPDATE: school_admin within school (any field).
CREATE POLICY "school_admin_update_child_documents"
  ON child_documents FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  )
  WITH CHECK (school_id = current_user_school_id());

-- UPDATE: teacher only on docs they authored, within school.
CREATE POLICY "teacher_update_own_child_documents"
  ON child_documents FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'teacher'
    AND school_id  = current_user_school_id()
    AND created_by = auth.uid()
  )
  WITH CHECK (
    school_id  = current_user_school_id()
    AND created_by = auth.uid()
  );

-- UPDATE: parent only on own drafts of source_kind='parent'.
CREATE POLICY "parent_update_own_draft_child_documents"
  ON child_documents FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'parent'
    AND source_kind = 'parent'
    AND student_id  = ANY(parent_student_ids())
    AND created_by  = auth.uid()
    AND status      = 'draft'
  )
  WITH CHECK (
    source_kind = 'parent'
    AND student_id = ANY(parent_student_ids())
    AND created_by = auth.uid()
    AND status     = 'draft'
  );

-- DELETE: only when the doc is still in 'draft' (mirrors the spec —
-- shared/archived/revoked docs are never physically removed).
CREATE POLICY "school_admin_delete_draft_child_documents"
  ON child_documents FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
    AND status    = 'draft'
  );

CREATE POLICY "teacher_delete_own_draft_child_documents"
  ON child_documents FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'teacher'
    AND school_id  = current_user_school_id()
    AND created_by = auth.uid()
    AND status     = 'draft'
  );

CREATE POLICY "parent_delete_own_draft_child_documents"
  ON child_documents FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'parent'
    AND source_kind = 'parent'
    AND created_by  = auth.uid()
    AND status      = 'draft'
  );


-- ─────────────────────────────────────────────────────────────────
-- 3.3 child_document_versions
-- ─────────────────────────────────────────────────────────────────

-- SELECT: school staff see all versions of accessible docs (inc. hidden).
CREATE POLICY "school_staff_select_child_document_versions"
  ON child_document_versions FOR SELECT
  TO authenticated
  USING (
    current_user_role() IN ('school_admin','teacher')
    AND school_id = current_user_school_id()
    AND document_id = ANY(accessible_document_ids())
  );

-- SELECT: parents and external_contact grantees see ONLY the head's
-- current version, and only if not hidden.
CREATE POLICY "non_staff_select_current_child_document_version"
  ON child_document_versions FOR SELECT
  TO authenticated
  USING (
    is_hidden = FALSE
    AND document_id = ANY(accessible_document_ids())
    AND id = (SELECT current_version_id FROM child_documents WHERE id = document_id)
  );

-- INSERT: school staff at school, doc accessible to them, uploader matches caller.
CREATE POLICY "school_staff_insert_child_document_versions"
  ON child_document_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() IN ('school_admin','teacher')
    AND school_id           = current_user_school_id()
    AND document_id         = ANY(accessible_document_ids())
    AND uploaded_by_user_id = auth.uid()
    AND uploaded_by_kind    = current_user_role()::TEXT
  );

-- INSERT: parent on own draft parent_provided doc.
CREATE POLICY "parent_insert_child_document_versions"
  ON child_document_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'parent'
    AND uploaded_by_user_id = auth.uid()
    AND uploaded_by_kind    = 'parent'
    AND EXISTS (
      SELECT 1 FROM child_documents d
      WHERE d.id = document_id
        AND d.source_kind = 'parent'
        AND d.created_by  = auth.uid()
        AND d.status      = 'draft'
        AND d.student_id  = ANY(parent_student_ids())
    )
  );

-- UPDATE: school_admin only (used to flip is_hidden / hidden_reason).
CREATE POLICY "school_admin_update_child_document_versions"
  ON child_document_versions FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  )
  WITH CHECK (school_id = current_user_school_id());

-- DELETE: only when parent doc is in 'draft' status.
CREATE POLICY "school_admin_delete_draft_child_document_versions"
  ON child_document_versions FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
    AND EXISTS (
      SELECT 1 FROM child_documents d
      WHERE d.id = document_id AND d.status = 'draft'
    )
  );

CREATE POLICY "parent_delete_own_draft_child_document_versions"
  ON child_document_versions FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'parent'
    AND uploaded_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM child_documents d
      WHERE d.id = document_id
        AND d.status = 'draft'
        AND d.source_kind = 'parent'
        AND d.created_by  = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────────
-- 3.4 document_consents
-- ─────────────────────────────────────────────────────────────────

CREATE POLICY "school_staff_select_document_consents"
  ON document_consents FOR SELECT
  TO authenticated
  USING (
    current_user_role() IN ('school_admin','teacher')
    AND school_id = current_user_school_id()
  );

-- Parents see consents about their children, regardless of who granted.
CREATE POLICY "parent_select_document_consents"
  ON document_consents FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'parent'
    AND student_id = ANY(parent_student_ids())
  );

-- INSERT: school staff drafting a pending consent for a student in their school.
-- For teachers, the student must be in their class.
CREATE POLICY "school_staff_insert_document_consents"
  ON document_consents FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() IN ('school_admin','teacher')
    AND school_id = current_user_school_id()
    AND status    = 'pending'
    AND requested_by_user_id = auth.uid()
    AND (
      current_user_role() = 'school_admin'
      OR student_id = ANY(teacher_visible_student_ids())
    )
  );

-- UPDATE: school_admin can edit pending or revoke.
CREATE POLICY "school_admin_update_document_consents"
  ON document_consents FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  )
  WITH CHECK (school_id = current_user_school_id());

-- UPDATE: teacher can edit pending or revoke for consents they requested.
CREATE POLICY "teacher_update_own_document_consents"
  ON document_consents FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'teacher'
    AND school_id = current_user_school_id()
    AND requested_by_user_id = auth.uid()
  )
  WITH CHECK (school_id = current_user_school_id());

-- UPDATE: parent — RLS allows the row to be touched if the student is theirs;
-- column-level enforcement (which transitions are valid + what fields may
-- change) lives in trigger 4.1 below.
CREATE POLICY "parent_update_document_consents"
  ON document_consents FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'parent'
    AND student_id = ANY(parent_student_ids())
    AND status IN ('pending','granted')   -- only pre-final states
  )
  WITH CHECK (
    student_id = ANY(parent_student_ids())
  );

CREATE POLICY "school_admin_delete_pending_document_consents"
  ON document_consents FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
    AND status    = 'pending'
  );


-- ─────────────────────────────────────────────────────────────────
-- 3.5 document_access_grants
-- ─────────────────────────────────────────────────────────────────

CREATE POLICY "school_staff_select_document_access_grants"
  ON document_access_grants FOR SELECT
  TO authenticated
  USING (
    current_user_role() IN ('school_admin','teacher')
    AND school_id = current_user_school_id()
  );

-- Parent sees grants on docs about own child (transparency: who has access).
CREATE POLICY "parent_select_document_access_grants"
  ON document_access_grants FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'parent'
    AND EXISTS (
      SELECT 1 FROM child_documents d
      WHERE d.id = document_id
        AND d.student_id = ANY(parent_student_ids())
    )
  );

-- school_user grantee sees their own grants.
CREATE POLICY "school_user_select_own_document_access_grants"
  ON document_access_grants FOR SELECT
  TO authenticated
  USING (
    grantee_kind     = 'school_user'
    AND grantee_user_id = auth.uid()
  );

-- external_contact sees their own grants.
CREATE POLICY "external_contact_select_own_document_access_grants"
  ON document_access_grants FOR SELECT
  TO authenticated
  USING (
    grantee_kind = 'external_contact'
    AND grantee_external_contact_id = ANY(external_contact_ids_for_caller())
  );

-- INSERT: school_admin only (cross-org sharing decisions are admin-level).
CREATE POLICY "school_admin_insert_document_access_grants"
  ON document_access_grants FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
    AND created_by = auth.uid()
  );

-- UPDATE: school_admin only — used for revocation. Phase A trigger 5.G
-- re-validates consent invariants on any UPDATE that touches document_id /
-- consent_id / grantee_* / expires_at. Column-level "revocation only" is
-- enforced via a trigger below (4.2).
CREATE POLICY "school_admin_update_document_access_grants"
  ON document_access_grants FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  )
  WITH CHECK (school_id = current_user_school_id());

-- No DELETE policy — grants are revoked, never deleted.


-- ─────────────────────────────────────────────────────────────────
-- 3.6 document_requests
-- ─────────────────────────────────────────────────────────────────

CREATE POLICY "school_staff_select_document_requests"
  ON document_requests FOR SELECT
  TO authenticated
  USING (
    current_user_role() IN ('school_admin','teacher')
    AND school_id = current_user_school_id()
  );

CREATE POLICY "parent_select_document_requests_to_self"
  ON document_requests FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'parent'
    AND requested_from_kind = 'parent'
    AND requested_from_guardian_id = ANY(parent_guardian_ids())
  );

CREATE POLICY "external_contact_select_own_document_requests"
  ON document_requests FOR SELECT
  TO authenticated
  USING (
    requester_external_contact_id      = ANY(external_contact_ids_for_caller())
    OR requested_from_external_contact_id = ANY(external_contact_ids_for_caller())
  );

CREATE POLICY "school_staff_insert_document_requests"
  ON document_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_role() IN ('school_admin','teacher')
    AND school_id           = current_user_school_id()
    AND requester_user_id   = auth.uid()
  );

-- UPDATE: school staff for any request in their school; parent for transitions
-- on requests to themselves; external_contact for requests to themselves.
CREATE POLICY "school_staff_update_document_requests"
  ON document_requests FOR UPDATE
  TO authenticated
  USING (
    current_user_role() IN ('school_admin','teacher')
    AND school_id = current_user_school_id()
  )
  WITH CHECK (school_id = current_user_school_id());

CREATE POLICY "parent_fulfill_document_requests"
  ON document_requests FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'parent'
    AND requested_from_kind = 'parent'
    AND requested_from_guardian_id = ANY(parent_guardian_ids())
    AND status IN ('requested','submitted')
  )
  WITH CHECK (
    requested_from_guardian_id = ANY(parent_guardian_ids())
  );

CREATE POLICY "external_contact_fulfill_document_requests"
  ON document_requests FOR UPDATE
  TO authenticated
  USING (
    requested_from_kind = 'external_contact'
    AND requested_from_external_contact_id = ANY(external_contact_ids_for_caller())
    AND status IN ('requested','submitted')
  )
  WITH CHECK (
    requested_from_external_contact_id = ANY(external_contact_ids_for_caller())
  );

CREATE POLICY "school_admin_delete_cancelled_document_requests"
  ON document_requests FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
    AND status    = 'cancelled'
  );


-- ─────────────────────────────────────────────────────────────────
-- 3.7 document_access_events
--
-- Tighter visibility for teachers per the confirmed decision:
--   school_admin sees ALL events for their school
--   teachers see ONLY events for documents they can access via
--     teacher_visible_student_ids() OR via explicit grants
-- ─────────────────────────────────────────────────────────────────

CREATE POLICY "school_admin_select_document_access_events"
  ON document_access_events FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'school_admin'
    AND school_id = current_user_school_id()
  );

CREATE POLICY "teacher_select_scoped_document_access_events"
  ON document_access_events FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'teacher'
    AND school_id   = current_user_school_id()
    AND document_id = ANY(accessible_document_ids())
  );

CREATE POLICY "parent_select_own_child_document_access_events"
  ON document_access_events FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'parent'
    AND student_id = ANY(parent_student_ids())
  );

CREATE POLICY "external_contact_select_own_document_access_events"
  ON document_access_events FOR SELECT
  TO authenticated
  USING (
    actor_external_contact_id = ANY(external_contact_ids_for_caller())
  );

-- DELIBERATELY no INSERT / UPDATE / DELETE policy for any client.
-- Inserts come exclusively via log_document_access (SECURITY DEFINER).


-- ════════════════════════════════════════════════════════════════
-- 4. TRIGGERS for column-level enforcement on consents and grants
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 4.1 document_consents — parent transition guard
-- RLS lets parents UPDATE consents about their kids. This trigger
-- restricts the WHAT: parents may only transition pending→granted or
-- granted→revoked, and they may only set the corresponding metadata
-- (granted_at/granted_by_guardian_id or revoked_at/revoked_by_guardian_id/
-- revoke_reason). Any attempt to mutate purpose/scope/recipients/expiry
-- /allow_* is rejected.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document_consents_parent_transition_guard()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_user_role() <> 'parent' THEN
    RETURN NEW;  -- school_admin and teacher are not gated by this trigger
  END IF;

  -- Verify the transition itself.
  IF OLD.status = 'pending' AND NEW.status = 'granted' THEN
    IF NEW.granted_by_guardian_id IS NULL OR NEW.granted_at IS NULL THEN
      RAISE EXCEPTION
        'parent grant must set granted_by_guardian_id and granted_at';
    END IF;
    IF NOT (NEW.granted_by_guardian_id = ANY(parent_guardian_ids())) THEN
      RAISE EXCEPTION
        'granted_by_guardian_id must match one of the calling parent''s guardian rows';
    END IF;

  ELSIF OLD.status = 'granted' AND NEW.status = 'revoked' THEN
    IF NEW.revoked_by_guardian_id IS NULL OR NEW.revoked_at IS NULL THEN
      RAISE EXCEPTION
        'parent revoke must set revoked_by_guardian_id and revoked_at';
    END IF;
    IF NOT (NEW.revoked_by_guardian_id = ANY(parent_guardian_ids())) THEN
      RAISE EXCEPTION
        'revoked_by_guardian_id must match one of the calling parent''s guardian rows';
    END IF;

  ELSE
    RAISE EXCEPTION
      'parent cannot transition consent from % to %', OLD.status, NEW.status;
  END IF;

  -- Verify the WHAT: terms must not change during a parent-driven transition.
  IF NEW.school_id      <> OLD.school_id
     OR NEW.student_id  <> OLD.student_id
     OR NEW.purpose     IS DISTINCT FROM OLD.purpose
     OR NEW.scope       IS DISTINCT FROM OLD.scope
     OR NEW.recipients  IS DISTINCT FROM OLD.recipients
     OR NEW.allow_download <> OLD.allow_download
     OR NEW.allow_reshare  <> OLD.allow_reshare
     OR NEW.expires_at  <> OLD.expires_at
     OR NEW.starts_at   IS DISTINCT FROM OLD.starts_at
     OR NEW.requested_by_user_id IS DISTINCT FROM OLD.requested_by_user_id
     OR NEW.request_message      IS DISTINCT FROM OLD.request_message
  THEN
    RAISE EXCEPTION
      'parent cannot modify consent terms — only the status transition is allowed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_consents_parent_transition_guard ON document_consents;
CREATE TRIGGER trg_document_consents_parent_transition_guard
  BEFORE UPDATE ON document_consents
  FOR EACH ROW EXECUTE FUNCTION document_consents_parent_transition_guard();


-- ─────────────────────────────────────────────────────────────────
-- 4.2 document_access_grants — UPDATE column guard
-- After Phase A trigger 5.G has validated structural invariants, this
-- trigger ensures non-super_admin actors can only write to revocation
-- columns (revoked_at, revoked_by, revoke_reason). Permissions, expiry,
-- grantee identity, etc. are immutable post-creation in v1.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document_access_grants_update_column_guard()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only revocation-column changes are permitted.
  IF NEW.document_id        <> OLD.document_id
     OR NEW.school_id       <> OLD.school_id
     OR NEW.consent_id      IS DISTINCT FROM OLD.consent_id
     OR NEW.grantee_kind    <> OLD.grantee_kind
     OR NEW.grantee_school_id           IS DISTINCT FROM OLD.grantee_school_id
     OR NEW.grantee_user_id             IS DISTINCT FROM OLD.grantee_user_id
     OR NEW.grantee_external_contact_id IS DISTINCT FROM OLD.grantee_external_contact_id
     OR NEW.permissions     <> OLD.permissions
     OR NEW.expires_at      <> OLD.expires_at
     OR NEW.created_by      IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION
      'document_access_grants UPDATE may only set revoked_at / revoked_by / revoke_reason';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_access_grants_update_column_guard ON document_access_grants;
CREATE TRIGGER trg_document_access_grants_update_column_guard
  BEFORE UPDATE ON document_access_grants
  FOR EACH ROW EXECUTE FUNCTION document_access_grants_update_column_guard();


-- ════════════════════════════════════════════════════════════════
-- 5. log_document_access RPC
--
-- Single SECURITY DEFINER entry point: gates access AND writes the
-- audit row in one atomic step. Returns metadata the API route uses
-- to mint a service-role signed URL (TTL 60 s).
-- ════════════════════════════════════════════════════════════════

-- ─── Internal helper: insert a document_access_events row ─────────────────
CREATE OR REPLACE FUNCTION _log_document_access_event(
  p_doc_id        UUID,
  p_version_id    UUID,
  p_student_id    UUID,
  p_school_id     UUID,
  p_actor_id      UUID,
  p_actor_kind    TEXT,
  p_actor_email   TEXT,
  p_action        TEXT,
  p_denied_reason TEXT,
  p_ip            TEXT,
  p_user_agent    TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ext_id UUID;
BEGIN
  -- For external_contact actors, resolve the contact id at this school.
  IF p_actor_kind = 'external_contact' THEN
    SELECT id INTO v_ext_id
      FROM external_contacts
      WHERE lower(email) = lower(coalesce(p_actor_email,''))
        AND school_id    = p_school_id
        AND deactivated_at IS NULL
      LIMIT 1;
  END IF;

  INSERT INTO document_access_events (
    document_id, document_version_id, student_id, school_id,
    actor_user_id, actor_external_contact_id, actor_email, actor_kind,
    action, denied_reason, ip, user_agent
  ) VALUES (
    p_doc_id, p_version_id, p_student_id, p_school_id,
    p_actor_id, v_ext_id, NULLIF(p_actor_email,''), p_actor_kind,
    p_action, p_denied_reason,
    NULLIF(p_ip,''), NULLIF(p_user_agent,'')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION _log_document_access_event(
  UUID,UUID,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT
) FROM PUBLIC;


-- ─── Main RPC ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_document_access(
  p_doc_id     UUID,
  p_action     TEXT,
  p_ip         TEXT,
  p_user_agent TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Actor
  v_actor_id            UUID;
  v_actor_role          user_role;
  v_actor_school_id     UUID;
  v_actor_email         TEXT;
  v_actor_kind          TEXT;
  v_actor_ext_ids       UUID[];
  v_actor_student_ids   UUID[];
  -- Document
  v_doc                 child_documents%ROWTYPE;
  v_version             child_document_versions%ROWTYPE;
  -- Decision
  v_allowed             BOOLEAN := FALSE;
  v_denied_reason       TEXT;
  v_grant               document_access_grants%ROWTYPE;
  v_has_grant           BOOLEAN := FALSE;
BEGIN
  -- ── Validate action ────────────────────────────────────────────────────
  IF p_action NOT IN ('view','download','signed_url_issued','preview_opened') THEN
    RAISE EXCEPTION 'invalid action: %', p_action;
  END IF;

  -- ── Resolve actor ──────────────────────────────────────────────────────
  v_actor_id    := auth.uid();
  v_actor_email := lower(coalesce(auth.jwt()->>'email',''));

  IF v_actor_id IS NOT NULL THEN
    SELECT role, school_id INTO v_actor_role, v_actor_school_id
      FROM profiles WHERE id = v_actor_id;
  END IF;

  IF v_actor_role IS NOT NULL THEN
    v_actor_kind := v_actor_role::TEXT;
  ELSE
    v_actor_ext_ids := external_contact_ids_for_caller();
    IF coalesce(array_length(v_actor_ext_ids,1),0) > 0 THEN
      v_actor_kind := 'external_contact';
    ELSE
      v_actor_kind := 'unauthenticated';
    END IF;
  END IF;

  IF v_actor_kind = 'parent' THEN
    v_actor_student_ids := parent_student_ids();
  END IF;

  -- ── Resolve document ───────────────────────────────────────────────────
  SELECT * INTO v_doc FROM child_documents WHERE id = p_doc_id;
  IF NOT FOUND THEN
    -- We have no school context to log an event row against; return without
    -- logging. This is the only branch that does not write an event.
    RETURN jsonb_build_object('allowed', false, 'denied_reason', 'document_not_found');
  END IF;

  IF v_doc.current_version_id IS NULL THEN
    PERFORM _log_document_access_event(
      v_doc.id, NULL, v_doc.student_id, v_doc.school_id,
      v_actor_id, v_actor_kind, v_actor_email,
      'access_denied', 'no_visible_version', p_ip, p_user_agent
    );
    RETURN jsonb_build_object('allowed', false, 'denied_reason', 'no_visible_version');
  END IF;

  SELECT * INTO v_version
    FROM child_document_versions
    WHERE id = v_doc.current_version_id;

  -- ── Access decision tree ───────────────────────────────────────────────
  IF v_actor_kind = 'unauthenticated' THEN
    v_denied_reason := 'unauthenticated';

  ELSIF v_actor_kind = 'super_admin' THEN
    v_denied_reason := 'super_admin_blocked';

  ELSIF v_actor_kind = 'school_admin' THEN
    IF v_actor_school_id = v_doc.school_id THEN
      v_allowed := TRUE;
    ELSE
      v_denied_reason := 'not_in_school';
    END IF;

  ELSIF v_actor_kind = 'teacher' THEN
    IF v_actor_school_id = v_doc.school_id
       AND v_doc.student_id = ANY(teacher_visible_student_ids())
    THEN
      v_allowed := TRUE;
    ELSE
      -- Explicit grant outside class scope?
      SELECT * INTO v_grant FROM document_access_grants
        WHERE document_id      = v_doc.id
          AND grantee_kind     = 'school_user'
          AND grantee_user_id  = v_actor_id
          AND revoked_at       IS NULL
          AND expires_at       > NOW()
        LIMIT 1;
      IF FOUND THEN
        v_allowed   := TRUE;
        v_has_grant := TRUE;
      ELSE
        v_denied_reason := 'teacher_class_scope';
      END IF;
    END IF;

  ELSIF v_actor_kind = 'parent' THEN
    IF v_doc.student_id = ANY(v_actor_student_ids) THEN
      IF v_doc.source_kind = 'parent'
         OR v_doc.status IN ('shared','archived')
      THEN
        v_allowed := TRUE;
      ELSE
        v_denied_reason := 'parent_not_visible_state';
      END IF;
    ELSE
      v_denied_reason := 'no_path';
    END IF;

  ELSIF v_actor_kind = 'external_contact' THEN
    SELECT g.* INTO v_grant
      FROM document_access_grants g
      JOIN document_consents c ON c.id = g.consent_id
      WHERE g.document_id                  = v_doc.id
        AND g.grantee_kind                 = 'external_contact'
        AND g.grantee_external_contact_id  = ANY(v_actor_ext_ids)
        AND g.revoked_at                   IS NULL
        AND g.expires_at                   > NOW()
        AND c.status                       = 'granted'
        AND c.expires_at                   > NOW()
      LIMIT 1;
    IF FOUND THEN
      v_allowed   := TRUE;
      v_has_grant := TRUE;
    ELSE
      v_denied_reason := 'no_active_grant';
    END IF;

  ELSE
    v_denied_reason := 'unknown_actor';
  END IF;

  -- ── Log + return on view denial ────────────────────────────────────────
  IF NOT v_allowed THEN
    PERFORM _log_document_access_event(
      v_doc.id, v_version.id, v_doc.student_id, v_doc.school_id,
      v_actor_id, v_actor_kind, v_actor_email,
      'access_denied', v_denied_reason, p_ip, p_user_agent
    );
    RETURN jsonb_build_object('allowed', false, 'denied_reason', v_denied_reason);
  END IF;

  -- ── Download permission check ──────────────────────────────────────────
  IF p_action = 'download' THEN
    IF v_actor_kind IN ('school_admin','teacher','parent') THEN
      NULL;  -- always allowed for school staff and parents
    ELSIF v_has_grant THEN
      IF NOT (coalesce(v_grant.permissions->>'download','false')::BOOLEAN) THEN
        v_denied_reason := 'download_not_permitted';
        PERFORM _log_document_access_event(
          v_doc.id, v_version.id, v_doc.student_id, v_doc.school_id,
          v_actor_id, v_actor_kind, v_actor_email,
          'access_denied', v_denied_reason, p_ip, p_user_agent
        );
        RETURN jsonb_build_object('allowed', false, 'denied_reason', v_denied_reason);
      END IF;
    END IF;
  END IF;

  -- ── Allowed: log + return metadata ─────────────────────────────────────
  PERFORM _log_document_access_event(
    v_doc.id, v_version.id, v_doc.student_id, v_doc.school_id,
    v_actor_id, v_actor_kind, v_actor_email,
    p_action, NULL, p_ip, p_user_agent
  );

  RETURN jsonb_build_object(
    'allowed',                true,
    'denied_reason',          NULL,
    'storage_path',           v_version.storage_path,
    'mime_type',              v_version.mime_type,
    'current_version_id',     v_version.id,
    'version_number',         v_version.version_number,
    'signed_url_ttl_seconds', 60
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION log_document_access(UUID,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION log_document_access(UUID,TEXT,TEXT,TEXT) TO authenticated;


-- ============================================================
-- End of Migration 056
-- ============================================================
