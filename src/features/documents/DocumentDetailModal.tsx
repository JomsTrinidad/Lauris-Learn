"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText,
  Layers,
  AlertTriangle,
  EyeOff,
  Upload,
  CheckCircle2,
  Archive as ArchiveIcon,
  Share2,
  Users,
  Calendar,
  Ban,
  Activity as ActivityIcon,
  Eye,
  Download,
  Link as LinkIcon,
  ShieldX,
  UserCircle2,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";
import {
  formatDocumentType,
  formatDate,
  formatBytes,
  studentDisplay,
  daysUntil,
  relativeWindow,
} from "./utils";
import { getDocument, listVersions } from "./queries";
import {
  listGrantsForDocument,
  listSchoolStaffForSharing,
  type InternalGrantRow,
  type SchoolStaffOption,
} from "./share-api";
import { listExternalContacts } from "./consent-api";
import { listAccessEvents } from "./events-api";
import { listGuardiansForStudent, type GuardianRow } from "./requests-api";
import type { DocumentListItem } from "./queries";
import type {
  ChildDocumentVersionRow,
  GrantPermissions,
  ExternalContactRow,
  DocumentAccessEventRow,
} from "./types";
import { DocumentAccessButton } from "./DocumentAccessButton";
import { UploadVersionModal } from "./UploadVersionModal";
import { HideVersionModal } from "./HideVersionModal";
import { ConfirmStatusModal, type StatusTransition } from "./ConfirmStatusModal";
import { ShareDocumentModal } from "./ShareDocumentModal";
import { RevokeAccessModal } from "./RevokeAccessModal";
import { ShareDocumentWithClinicModal } from "@/features/clinic-sharing/ShareDocumentWithClinicModal";

type Tab = "overview" | "versions" | "access" | "activity";

export interface DocumentDetailModalProps {
  docId: string | null;
  onClose: () => void;
  /** Called whenever the doc or its versions change so the parent list can refresh. */
  onChanged?: () => void;
}

export function DocumentDetailModal({ docId, onClose, onChanged }: DocumentDetailModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const { userId, userRole } = useSchoolContext();

  const [tab, setTab] = useState<Tab>("overview");
  const [doc, setDoc] = useState<DocumentListItem | null>(null);
  const [versions, setVersions] = useState<ChildDocumentVersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Access tab — grants + name lookup maps for school_user / external grantees.
  const [grants, setGrants] = useState<InternalGrantRow[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [grantsError, setGrantsError] = useState<string | null>(null);
  const [staffMap, setStaffMap] = useState<Map<string, SchoolStaffOption>>(new Map());
  const [externalMap, setExternalMap] = useState<Map<string, ExternalContactRow>>(new Map());

  // Activity tab — newest 50 events for this doc.
  const [events, setEvents]               = useState<DocumentAccessEventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError]     = useState<string | null>(null);

  // E3 — guardians on file for this student (only loaded when source_kind='parent').
  // We can't reliably resolve the parent uploader's specific name (profiles
  // SELECT is self-only and there's no school-wide RPC for parent profiles in
  // v1), so we surface the guardian roster as context — the actual uploader
  // is one of these people.
  const [guardians, setGuardians] = useState<GuardianRow[]>([]);

  // Sub-modals
  const [uploadVersionOpen, setUploadVersionOpen] = useState(false);
  const [versionToHide, setVersionToHide] = useState<ChildDocumentVersionRow | null>(null);
  const [pendingTransition, setPendingTransition] = useState<StatusTransition | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareClinicOpen, setShareClinicOpen] = useState(false);
  const [grantToRevoke, setGrantToRevoke] = useState<InternalGrantRow | null>(null);

  const isStaff = userRole === "school_admin" || userRole === "teacher";
  const isAdmin = userRole === "school_admin";

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      if (!docId) return;
      setLoading(true);
      setError(null);
      try {
        const [d, vs] = await Promise.all([
          getDocument(supabase, docId),
          listVersions(supabase, docId),
        ]);
        if (signal?.aborted) return;
        setDoc(d);
        setVersions(vs);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load document.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [docId, supabase],
  );

  useEffect(() => {
    if (!docId) return;
    const ctrl = new AbortController();
    setTab("overview");
    setGrants([]);
    setStaffMap(new Map());
    setExternalMap(new Map());
    setEvents([]);
    setEventsError(null);
    setGrantsError(null);
    setGuardians([]);
    void reload(ctrl.signal);
    return () => ctrl.abort();
  }, [docId, reload]);

  // Load guardian roster when this is a parent-uploaded doc — gives admins
  // context on who the uploader is. Guardians SELECT is granted to school
  // staff via the school-member policy, so no RPC needed.
  useEffect(() => {
    if (!doc || doc.source_kind !== "parent") return;
    let cancelled = false;
    listGuardiansForStudent(supabase, doc.student_id)
      .then((rows) => { if (!cancelled) setGuardians(rows); })
      .catch(() => { /* non-fatal — banner still renders without names */ });
    return () => { cancelled = true; };
  }, [doc, supabase]);

  // Load grants + name lookups the first time the user opens the Access tab,
  // and again after any sub-modal change (handleSubChange clears them).
  const reloadAccess = useCallback(async () => {
    if (!doc || !isStaff) return;
    setGrantsLoading(true);
    setGrantsError(null);
    try {
      // RPC requires school_admin; for teachers we still load grants, just
      // skip the staff lookup (their picker isn't shown either).
      const [grantRows, staffRows, externalRows] = await Promise.all([
        listGrantsForDocument(supabase, doc.id),
        isAdmin
          ? listSchoolStaffForSharing(supabase, doc.school_id)
          : Promise.resolve([] as SchoolStaffOption[]),
        listExternalContacts(supabase, doc.school_id),
      ]);
      setGrants(grantRows);
      setStaffMap(new Map(staffRows.map((s) => [s.id, s])));
      setExternalMap(new Map(externalRows.map((c) => [c.id, c])));
    } catch (err) {
      setGrantsError(err instanceof Error ? err.message : "Failed to load access list.");
    } finally {
      setGrantsLoading(false);
    }
  }, [doc, isStaff, isAdmin, supabase]);

  useEffect(() => {
    if (tab !== "access") return;
    void reloadAccess();
  }, [tab, reloadAccess]);

  // Activity tab — load events + lookup maps (so we can resolve actor names).
  // We deliberately reuse reloadAccess here so the same staff/external maps
  // populate without a second round of RPC calls. Grants are tiny so the
  // extra fetch is acceptable.
  const reloadEvents = useCallback(async () => {
    if (!doc || !isStaff) return;
    setEventsLoading(true);
    setEventsError(null);
    try {
      const rows = await listAccessEvents(supabase, doc.id, 50);
      setEvents(rows);
    } catch (err) {
      setEventsError(err instanceof Error ? err.message : "Failed to load activity.");
    } finally {
      setEventsLoading(false);
    }
  }, [doc, isStaff, supabase]);

  useEffect(() => {
    if (tab !== "activity") return;
    void reloadAccess();   // populates staffMap / externalMap for actor lookup
    void reloadEvents();
  }, [tab, reloadAccess, reloadEvents]);

  // Compute discriminators we pass into HideVersionModal so it can warn
  // accurately before round-tripping to the DB.
  const visibleVersions = useMemo(
    () => versions.filter((v) => !v.is_hidden),
    [versions],
  );
  const otherVisibleCount = (vId: string) =>
    visibleVersions.filter((v) => v.id !== vId).length;
  const isCurrentVersion = (vId: string) =>
    !!doc && doc.current_version_id === vId;

  // Latest existing version_number — drives v(N+1) in UploadVersionModal.
  const latestVersionNumber = useMemo(() => {
    if (versions.length === 0) return 0;
    return Math.max(...versions.map((v) => v.version_number));
  }, [versions]);

  function handleSubChange() {
    void reload();
    if (tab === "access") void reloadAccess();
    onChanged?.();
  }

  return (
    <Modal
      open={docId !== null}
      onClose={onClose}
      title={doc?.title ?? "Document"}
      className="max-w-2xl"
    >
      {loading ? (
        <PageSpinner />
      ) : error ? (
        <ErrorAlert message={error} />
      ) : !doc ? (
        <ErrorAlert message="Document not found." />
      ) : (
        <div className="space-y-4">
          {/* Header summary */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={doc.status}>{doc.status}</Badge>
              <span className="text-sm text-muted-foreground">
                {formatDocumentType(doc.document_type)}
              </span>
              <span className="text-sm text-muted-foreground">
                · {studentDisplay(doc.student)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <DocumentAccessButton
                docId={doc.id}
                action="view"
                hidden={!doc.current_version_id}
              />
              <DocumentAccessButton
                docId={doc.id}
                action="download"
                hidden={!doc.current_version_id}
              />
            </div>
          </div>

          {/* Parent-uploaded banner — surfaces source + guardian context for
              admins reviewing parent submissions. Adds a clearer call to
              action when the doc is still in draft (awaiting review). */}
          {doc.source_kind === "parent" && (
            <ParentSourceBanner
              status={doc.status}
              guardians={guardians}
              isStaff={isStaff}
              onMarkActive={
                canMarkActive(doc, isStaff, isAdmin, userId)
                  ? () => setPendingTransition("mark_active")
                  : null
              }
            />
          )}

          {/* No-version notice (draft state) */}
          {!doc.current_version_id && (
            <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>No file uploaded yet. Use Upload to add the first version.</span>
            </div>
          )}

          {/* Status transitions — only render the bar if at least one action
              is offered. For parent-uploaded drafts we hide Mark Active here
              because the ParentSourceBanner above renders an "Approve as
              Active" CTA in the same primary slot — avoids duplication. */}
          {(() => {
            const showMark = canMarkActive(doc, isStaff, isAdmin, userId)
              && doc.source_kind !== "parent";
            const showArchive = canArchive(doc, isAdmin);
            if (!showMark && !showArchive) return null;
            return (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border">
                <span className="text-xs font-medium text-muted-foreground mr-1">
                  Status actions:
                </span>
                {showMark && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setPendingTransition("mark_active")}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    Mark as Active
                  </Button>
                )}
                {showArchive && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPendingTransition("archive")}
                  >
                    <ArchiveIcon className="w-3.5 h-3.5 mr-1.5" />
                    Archive
                  </Button>
                )}
              </div>
            );
          })()}

          {/* Tab strip */}
          <div className="flex gap-1 border-b border-border">
            <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
              <FileText className="w-3.5 h-3.5" /> Overview
            </TabButton>
            <TabButton active={tab === "versions"} onClick={() => setTab("versions")}>
              <Layers className="w-3.5 h-3.5" /> Versions ({versions.length})
            </TabButton>
            {isStaff && (
              <TabButton active={tab === "access"} onClick={() => setTab("access")}>
                <Users className="w-3.5 h-3.5" /> Access
              </TabButton>
            )}
            {isStaff && (
              <TabButton active={tab === "activity"} onClick={() => setTab("activity")}>
                <ActivityIcon className="w-3.5 h-3.5" /> Activity
              </TabButton>
            )}
          </div>

          {tab === "overview" && <OverviewTab doc={doc} />}
          {tab === "versions" && (
            <VersionsTab
              versions={versions}
              currentVersionId={doc.current_version_id}
              canUploadVersion={isStaff}
              canHideVersion={isAdmin}
              onUploadVersion={() => setUploadVersionOpen(true)}
              onHideVersion={(v) => setVersionToHide(v)}
            />
          )}
          {tab === "access" && (
            <AccessTab
              grants={grants}
              loading={grantsLoading}
              error={grantsError}
              staffMap={staffMap}
              externalMap={externalMap}
              canShare={canShare(doc, isAdmin)}
              canRevoke={isAdmin}
              shareDisabledReason={shareDisabledReason(doc, isAdmin)}
              onShare={() => setShareOpen(true)}
              onShareWithClinic={
                isAdmin && (doc.status === "active" || doc.status === "shared")
                  ? () => setShareClinicOpen(true)
                  : null
              }
              onRevoke={(g) => setGrantToRevoke(g)}
            />
          )}
          {tab === "activity" && (
            <ActivityTab
              events={events}
              loading={eventsLoading}
              error={eventsError}
              staffMap={staffMap}
              externalMap={externalMap}
            />
          )}
        </div>
      )}

      {/* Sub-modals — mounted inside the parent Modal so backdrop stacking
          stays predictable. They short-circuit when their data is missing. */}
      {doc && userId && (isStaff) && (
        <UploadVersionModal
          open={uploadVersionOpen}
          onClose={() => setUploadVersionOpen(false)}
          onUploaded={() => {
            setUploadVersionOpen(false);
            handleSubChange();
          }}
          doc={{
            id:                  doc.id,
            school_id:           doc.school_id,
            student_id:          doc.student_id,
            title:               doc.title,
            latestVersionNumber: latestVersionNumber,
          }}
          userId={userId}
          uploaderKind={isAdmin ? "school_admin" : "teacher"}
        />
      )}

      {doc && (
        <HideVersionModal
          open={versionToHide !== null}
          onClose={() => setVersionToHide(null)}
          onHidden={() => {
            setVersionToHide(null);
            handleSubChange();
          }}
          version={versionToHide}
          isCurrent={versionToHide ? isCurrentVersion(versionToHide.id) : false}
          documentStatus={doc.status}
          otherVisibleCount={versionToHide ? otherVisibleCount(versionToHide.id) : 0}
        />
      )}

      <ConfirmStatusModal
        open={pendingTransition !== null}
        onClose={() => setPendingTransition(null)}
        onConfirmed={() => {
          setPendingTransition(null);
          handleSubChange();
        }}
        transition={pendingTransition}
        doc={doc ? { id: doc.id, title: doc.title, status: doc.status } : null}
      />

      {doc && userId && isAdmin && (
        <RevokeAccessModal
          open={grantToRevoke !== null}
          onClose={() => setGrantToRevoke(null)}
          onRevoked={() => {
            setGrantToRevoke(null);
            handleSubChange();
          }}
          grant={grantToRevoke}
          staffMap={staffMap}
          externalMap={externalMap}
          userId={userId}
        />
      )}

      {doc && userId && isAdmin && (
        <ShareDocumentModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          onShared={() => {
            setShareOpen(false);
            handleSubChange();
          }}
          doc={{
            id:            doc.id,
            school_id:     doc.school_id,
            student_id:    doc.student_id,
            document_type: doc.document_type,
            title:         doc.title,
          }}
          userId={userId}
        />
      )}

      {doc && userId && isAdmin && (
        <ShareDocumentWithClinicModal
          open={shareClinicOpen}
          schoolId={doc.school_id}
          userId={userId}
          lockedDocumentId={doc.id}
          lockedDocumentTitle={doc.title}
          onClose={() => setShareClinicOpen(false)}
          onShared={() => {
            setShareClinicOpen(false);
            handleSubChange();
          }}
        />
      )}
    </Modal>
  );
}


// ── Status transition predicates ────────────────────────────────────────────
// v1 transitions (per D9 scope): draft → active, active|shared → archived.
// 'revoked' is intentionally NOT exposed; archived/revoked are terminal here.
//
// canMarkActive must mirror the RLS policies on child_documents UPDATE:
//   - school_admin can update any doc in their school
//   - teacher can update only docs where created_by = auth.uid()
//     (i.e., a teacher's own school-source drafts)
// A teacher viewing a parent-uploaded draft, or another teacher's draft,
// must NOT see the CTA — RLS would reject the update and the parent
// banner's "Approve as Active" was misleading them. (Hardening fix.)
function canMarkActive(
  doc: DocumentListItem,
  isStaff: boolean,
  isAdmin: boolean,
  userId: string | null,
): boolean {
  if (!isStaff) return false;
  if (doc.status !== "draft") return false;
  if (doc.current_version_id === null) return false;
  if (isAdmin) return true;
  // Teacher path: only docs they themselves authored.
  return doc.created_by === userId;
}

function canArchive(doc: DocumentListItem, isAdmin: boolean): boolean {
  return isAdmin
    && (doc.status === "active" || doc.status === "shared");
}

// Sharing is admin-only and only meaningful while there is a current version
// AND the document isn't terminal. Drafts can be shared too — staff often
// share for review before "Mark as Active".
function canShare(doc: DocumentListItem, isAdmin: boolean): boolean {
  return isAdmin
    && doc.current_version_id !== null
    && doc.status !== "archived"
    && doc.status !== "revoked";
}

function shareDisabledReason(doc: DocumentListItem, isAdmin: boolean): string | null {
  if (!isAdmin) return "Only school admins can share documents.";
  if (doc.current_version_id === null) return "Upload a file first — you can't share an empty document.";
  if (doc.status === "archived") return "Archived documents can't be shared.";
  if (doc.status === "revoked")  return "Revoked documents can't be shared.";
  return null;
}


function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors -mb-px",
        active
          ? "border-primary text-foreground font-medium"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}


function OverviewTab({ doc }: { doc: DocumentListItem }) {
  const reviewWindow = relativeWindow(doc.review_date);
  const reviewDays = daysUntil(doc.review_date);
  const reviewOverdue = reviewDays != null && reviewDays < 0;
  const reviewSoon    = reviewDays != null && reviewDays >= 0 && reviewDays <= 14;

  return (
    <div className="space-y-3 text-sm">
      {doc.description && (
        <Field label="Description">
          <p className="text-foreground whitespace-pre-wrap">{doc.description}</p>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Field label="Type">{formatDocumentType(doc.document_type)}</Field>
        <Field label="Status"><Badge variant={doc.status}>{doc.status}</Badge></Field>
        <Field label="Student">{studentDisplay(doc.student)}</Field>
        <Field label="Source">
          {doc.source_kind === "school" && "School"}
          {doc.source_kind === "external_contact" && (doc.source_label || "External contact")}
          {doc.source_kind === "parent" && "Parent-uploaded"}
        </Field>
        <Field label="Effective date">{formatDate(doc.effective_date)}</Field>
        <Field label="Review by">
          {doc.review_date ? (
            <span
              className={
                reviewOverdue ? "text-red-700"
                : reviewSoon ? "text-orange-700"
                : undefined
              }
            >
              {formatDate(doc.review_date)}
              {(reviewOverdue || reviewSoon) && (
                <span className="ml-1.5 text-xs">({reviewWindow})</span>
              )}
            </span>
          ) : "—"}
        </Field>
        <Field label="Created">{formatDate(doc.created_at)}</Field>
        <Field label="Last updated">{formatDate(doc.updated_at)}</Field>
        {doc.archived_at && (
          <Field label="Archived">{formatDate(doc.archived_at)}</Field>
        )}
        {doc.archive_reason && (
          <Field label="Archive reason"><span className="italic">{doc.archive_reason}</span></Field>
        )}
        {doc.revoked_at && (
          <Field label="Revoked">{formatDate(doc.revoked_at)}</Field>
        )}
        {doc.revoke_reason && (
          <Field label="Revoke reason"><span className="italic">{doc.revoke_reason}</span></Field>
        )}
      </div>
    </div>
  );
}


function VersionsTab({
  versions,
  currentVersionId,
  canUploadVersion,
  canHideVersion,
  onUploadVersion,
  onHideVersion,
}: {
  versions: ChildDocumentVersionRow[];
  currentVersionId: string | null;
  canUploadVersion: boolean;
  canHideVersion: boolean;
  onUploadVersion: () => void;
  onHideVersion: (v: ChildDocumentVersionRow) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Upload action bar — shown for school staff only. */}
      {canUploadVersion && (
        <div className="flex justify-end">
          <Button size="sm" onClick={onUploadVersion}>
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Upload new version
          </Button>
        </div>
      )}

      {versions.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <Layers className="w-8 h-8 mx-auto mb-2 opacity-60" />
          <p className="font-medium">No versions uploaded yet.</p>
          <p className="text-xs mt-1 max-w-xs mx-auto">
            {canUploadVersion
              ? "Upload a file to make this document accessible."
              : "Wait for staff to upload the first version."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {versions.map((v) => {
            const isCurrent = v.id === currentVersionId;
            return (
              <li
                key={v.id}
                className={cn(
                  "flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg border border-border",
                  v.is_hidden && "bg-muted/40 opacity-70",
                  isCurrent && !v.is_hidden && "border-primary/40 bg-primary/5",
                )}
              >
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <span className="font-mono text-xs text-muted-foreground flex-shrink-0 mt-0.5">
                    v{v.version_number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <span className="truncate">{v.file_name ?? "(no filename)"}</span>
                      {isCurrent && !v.is_hidden && (
                        <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium flex-shrink-0">
                          current
                        </span>
                      )}
                      {v.is_hidden && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                          <EyeOff className="w-3 h-3" /> hidden
                        </span>
                      )}
                      {v.uploaded_by_kind === "parent" && (
                        <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium flex-shrink-0">
                          Uploaded by parent
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(v.created_at)} · {formatBytes(v.file_size)}
                      {v.upload_note && <> · {v.upload_note}</>}
                    </div>
                    {v.is_hidden && v.hidden_reason && (
                      <div className="text-xs text-muted-foreground italic mt-0.5">
                        Hidden: {v.hidden_reason}
                      </div>
                    )}
                  </div>
                </div>

                {/* Hide action — admins only, not for already-hidden versions. */}
                {canHideVersion && !v.is_hidden && (
                  <button
                    type="button"
                    onClick={() => onHideVersion(v)}
                    className="flex-shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-700 hover:bg-red-50 transition-colors px-2 py-1 rounded"
                    title="Hide this version"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    Hide
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}


function AccessTab({
  grants,
  loading,
  error,
  staffMap,
  externalMap,
  canShare,
  canRevoke,
  shareDisabledReason,
  onShare,
  onShareWithClinic,
  onRevoke,
}: {
  grants: InternalGrantRow[];
  loading: boolean;
  error: string | null;
  staffMap: Map<string, SchoolStaffOption>;
  externalMap: Map<string, ExternalContactRow>;
  canShare: boolean;
  canRevoke: boolean;
  shareDisabledReason: string | null;
  onShare: () => void;
  onShareWithClinic: (() => void) | null;
  onRevoke: (g: InternalGrantRow) => void;
}) {
  const now = new Date();
  // Active = not revoked AND not expired. Sort active first, then by
  // created_at desc (already done by the query).
  const active   = grants.filter((g) => isGrantActive(g, now));
  const inactive = grants.filter((g) => !isGrantActive(g, now));

  return (
    <div className="space-y-3">
      {/* Share action bar — admin only */}
      <div className="flex justify-end items-center gap-2">
        {onShareWithClinic && (
          <Button
            size="sm"
            variant="outline"
            onClick={onShareWithClinic}
            disabled={!canShare}
            title={canShare ? undefined : shareDisabledReason ?? undefined}
          >
            <Share2 className="w-3.5 h-3.5 mr-1.5" />
            Share with Clinic
          </Button>
        )}
        <Button
          size="sm"
          onClick={onShare}
          disabled={!canShare}
          title={canShare ? undefined : shareDisabledReason ?? undefined}
        >
          <Share2 className="w-3.5 h-3.5 mr-1.5" />
          Share
        </Button>
      </div>

      {error && <ErrorAlert message={error} />}

      {loading ? (
        <div className="text-center py-6 text-sm text-muted-foreground">Loading…</div>
      ) : grants.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-60" />
          <p className="font-medium">No access granted yet.</p>
          <p className="text-xs mt-1 max-w-xs mx-auto">
            Use Share to give a staff member or external contact access to this document.
          </p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <ul className="space-y-2">
              {active.map((g) => (
                <GrantRow
                  key={g.id}
                  grant={g}
                  staffMap={staffMap}
                  externalMap={externalMap}
                  active
                  canRevoke={canRevoke}
                  onRevoke={onRevoke}
                />
              ))}
            </ul>
          )}
          {inactive.length > 0 && (
            <>
              <div className="text-xs font-medium text-muted-foreground pt-3 border-t border-border">
                No longer active
              </div>
              <ul className="space-y-2">
                {inactive.map((g) => (
                  <GrantRow
                    key={g.id}
                    grant={g}
                    staffMap={staffMap}
                    externalMap={externalMap}
                    active={false}
                    canRevoke={false}
                    onRevoke={onRevoke}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}


function GrantRow({
  grant,
  staffMap,
  externalMap,
  active,
  canRevoke,
  onRevoke,
}: {
  grant: InternalGrantRow;
  staffMap: Map<string, SchoolStaffOption>;
  externalMap: Map<string, ExternalContactRow>;
  active: boolean;
  canRevoke: boolean;
  onRevoke: (g: InternalGrantRow) => void;
}) {
  const granteeName = describeGrantee(grant, staffMap, externalMap);
  const perms       = grant.permissions as GrantPermissions;
  const expiresIso  = grant.expires_at;
  // Distinguish revoked vs expired so audit reads cleanly.
  const inactiveReason = !active
    ? grant.revoked_at ? "Revoked" : "Expired"
    : null;
  const isRevoked = !!grant.revoked_at;

  // Expiring-soon: active grant whose expiry is within 14 days.
  const daysLeft = active ? daysUntil(expiresIso) : null;
  const expiringSoon = daysLeft != null && daysLeft >= 0 && daysLeft <= 14;

  return (
    <li
      className={cn(
        "flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg border border-border",
        !active && "bg-muted/40 opacity-80",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="font-medium truncate">{granteeName}</span>
          <span className="text-xs text-muted-foreground">{describeKind(grant)}</span>
          {inactiveReason && (
            <span
              className={cn(
                "inline-flex items-center text-xs px-1.5 py-0.5 rounded font-medium",
                isRevoked
                  ? "bg-red-100 text-red-800"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {inactiveReason}
            </span>
          )}
          {expiringSoon && (
            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-800">
              <Calendar className="w-3 h-3" />
              {daysLeft === 0 ? "Expires today" : `Expires in ${daysLeft}d`}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
          <Calendar className="w-3 h-3" />
          {active
            ? <>Until {formatDate(expiresIso)}</>
            : isRevoked
              ? <>Revoked {formatDate(grant.revoked_at)}</>
              : <>Expired {formatDate(expiresIso)}</>
          }
          <span>·</span>
          <span>{describePerms(perms)}</span>
        </div>
        {grant.revoke_reason && !active && (
          <div className="text-xs text-muted-foreground italic mt-0.5">
            Reason: {grant.revoke_reason}
          </div>
        )}
      </div>

      {/* Revoke action — admin only, active grants only. Revoked rows
          intentionally render no actions (audit-only). */}
      {active && canRevoke && (
        <button
          type="button"
          onClick={() => onRevoke(grant)}
          className="flex-shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-700 hover:bg-red-50 transition-colors px-2 py-1 rounded"
          title="Revoke this access"
        >
          <Ban className="w-3.5 h-3.5" />
          Revoke
        </button>
      )}
    </li>
  );
}


// ── Grant helpers ──────────────────────────────────────────────────────────

function isGrantActive(g: InternalGrantRow, now: Date): boolean {
  if (g.revoked_at) return false;
  try {
    return new Date(g.expires_at) > now;
  } catch {
    return false;
  }
}

function describeGrantee(
  g: InternalGrantRow,
  staffMap: Map<string, SchoolStaffOption>,
  externalMap: Map<string, ExternalContactRow>,
): string {
  if (g.grantee_kind === "school_user" && g.grantee_user_id) {
    return staffMap.get(g.grantee_user_id)?.full_name ?? "Staff member";
  }
  if (g.grantee_kind === "external_contact" && g.grantee_external_contact_id) {
    return externalMap.get(g.grantee_external_contact_id)?.full_name ?? "External contact";
  }
  if (g.grantee_kind === "school") return "Entire school";
  return "Unknown";
}

function describeKind(g: InternalGrantRow): string {
  if (g.grantee_kind === "school")           return "· School";
  if (g.grantee_kind === "external_contact") return "· External";
  return "";
}

function describePerms(p: GrantPermissions): string {
  const parts: string[] = ["View"];
  if (p.download)           parts.push("download");
  if (p.comment)            parts.push("comment");
  if (p.upload_new_version) parts.push("upload versions");
  return parts.join(", ");
}


// ── Activity tab (D15) ────────────────────────────────────────────────────

function ActivityTab({
  events,
  loading,
  error,
  staffMap,
  externalMap,
}: {
  events: DocumentAccessEventRow[];
  loading: boolean;
  error: string | null;
  staffMap: Map<string, SchoolStaffOption>;
  externalMap: Map<string, ExternalContactRow>;
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Showing the latest 50 events for this document, newest first.
      </div>

      {error && <ErrorAlert message={error} />}

      {loading ? (
        <div className="text-center py-6 text-sm text-muted-foreground">Loading…</div>
      ) : events.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <ActivityIcon className="w-8 h-8 mx-auto mb-2 opacity-60" />
          No activity yet. Views, downloads, and access denials show up here as they happen.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {events.map((e) => (
            <EventRow key={e.id} event={e} staffMap={staffMap} externalMap={externalMap} />
          ))}
        </ul>
      )}
    </div>
  );
}


function EventRow({
  event,
  staffMap,
  externalMap,
}: {
  event: DocumentAccessEventRow;
  staffMap: Map<string, SchoolStaffOption>;
  externalMap: Map<string, ExternalContactRow>;
}) {
  const { label, Icon, tone } = describeAction(event.action);
  const actor = describeActor(event, staffMap, externalMap);
  const isDenied = event.action === "access_denied";

  return (
    <li className={cn(
      "flex items-start gap-3 px-3 py-2 rounded-lg border border-border",
      isDenied && "bg-red-50/40 border-red-200",
    )}>
      <div className={cn(
        "flex-shrink-0 w-7 h-7 rounded-full inline-flex items-center justify-center",
        tone === "denied" ? "bg-red-100 text-red-700"
        : tone === "info" ? "bg-blue-100 text-blue-700"
        : "bg-muted text-muted-foreground",
      )}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className={cn("font-medium", isDenied && "text-red-800")}>
            {label}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-sm">{actor}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {formatDateTime(event.created_at)}
        </div>
        {isDenied && event.denied_reason && (
          <div className="text-xs text-red-700 italic mt-0.5">
            Reason: {humanDeniedReason(event.denied_reason)}
          </div>
        )}
      </div>
    </li>
  );
}


// ── Activity helpers ─────────────────────────────────────────────────────

type EventLabel = {
  label: string;
  Icon:  React.ComponentType<{ className?: string }>;
  tone:  "info" | "neutral" | "denied";
};

function describeAction(a: DocumentAccessEventRow["action"]): EventLabel {
  switch (a) {
    case "signed_url_issued": return { label: "Access Link Issued",  Icon: LinkIcon,  tone: "info"    };
    case "preview_opened":    return { label: "Preview Opened",       Icon: Eye,       tone: "neutral" };
    case "download":          return { label: "Download Requested",   Icon: Download,  tone: "neutral" };
    case "view":              return { label: "Viewed",               Icon: Eye,       tone: "neutral" };
    case "access_denied":     return { label: "Access Denied",        Icon: ShieldX,   tone: "denied"  };
  }
}

function describeActor(
  e: DocumentAccessEventRow,
  staffMap: Map<string, SchoolStaffOption>,
  externalMap: Map<string, ExternalContactRow>,
): string {
  // Try to resolve a name from the maps; fall back to actor_email; finally
  // fall back to a humanized actor_kind.
  if (e.actor_user_id) {
    const s = staffMap.get(e.actor_user_id);
    if (s?.full_name) return `${s.full_name} (${labelForActorKind(e.actor_kind)})`;
  }
  if (e.actor_external_contact_id) {
    const c = externalMap.get(e.actor_external_contact_id);
    if (c?.full_name) return `${c.full_name} (External contact)`;
  }
  if (e.actor_email) {
    return `${e.actor_email} (${labelForActorKind(e.actor_kind)})`;
  }
  return labelForActorKind(e.actor_kind);
}

function labelForActorKind(k: DocumentAccessEventRow["actor_kind"]): string {
  switch (k) {
    case "school_admin":     return "School admin";
    case "teacher":          return "Teacher";
    case "parent":           return "Parent";
    case "external_contact": return "External contact";
    case "super_admin":      return "Platform admin";
    case "unauthenticated":  return "Not signed in";
  }
}

/** Friendly mapping for the few denied_reason values the RPC emits. */
function humanDeniedReason(r: string): string {
  switch (r) {
    case "no_visible_version":    return "The document doesn't have a visible version yet.";
    case "download_not_permitted": return "Download wasn't allowed by the active grant or consent.";
    case "not_authorized":        return "Not authorized to access this document.";
    case "doc_not_found":         return "Document not found or no longer accessible.";
    case "doc_revoked":           return "The document has been revoked.";
    case "consent_not_granted":   return "The covering consent isn't granted.";
    case "consent_expired":       return "The covering consent has expired.";
    case "grant_revoked":         return "The grant has been revoked.";
    case "grant_expired":         return "The grant has expired.";
    default:                       return r;
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    // e.g. "May 3, 2026 · 2:14 PM"
    const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${date} · ${time}`;
  } catch {
    return "—";
  }
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}


// ── Parent-source banner (E3) ──────────────────────────────────────────────
//
// Renders only when source_kind='parent'. We can't resolve the specific
// guardian who uploaded — profiles SELECT is self-only and we deliberately
// haven't added a school-wide RPC for parent profile lookup in v1 — so we
// show the guardian roster as context. The actual uploader is one of these
// people; the per-version actor is recorded in document_access_events for
// strict audit needs.
function ParentSourceBanner({
  status,
  guardians,
  isStaff,
  onMarkActive,
}: {
  status: DocumentListItem["status"];
  guardians: GuardianRow[];
  isStaff: boolean;
  onMarkActive: (() => void) | null;
}) {
  const isDraft = status === "draft";

  // Tone shifts after review: amber (action needed) → blue (informational).
  const toneClass = isDraft
    ? "bg-amber-50 border-amber-200 text-amber-900"
    : "bg-blue-50 border-blue-200 text-blue-900";

  const headline = isDraft
    ? "Parent-uploaded — awaiting school review"
    : "Parent-uploaded";

  const sub = isDraft
    ? "A parent submitted this document. Review the contents, then mark it Active to add it to the school's official record. You can also upload a new version or archive it if it shouldn't be kept."
    : "This document was originally submitted by a parent.";

  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm space-y-2", toneClass)}>
      <div className="flex items-start gap-2">
        <UserCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium">{headline}</p>
          <p className="text-xs mt-0.5 opacity-90">{sub}</p>
        </div>
      </div>

      {guardians.length > 0 && (
        <div className="text-xs pl-6 opacity-90">
          <span className="font-medium">Guardians on file: </span>
          {guardians.map((g) => g.full_name).join(", ")}
          <p className="mt-0.5 opacity-80">
            The actual uploader is one of the guardians above. Open the
            Activity tab for the precise audit record.
          </p>
        </div>
      )}

      {isDraft && isStaff && onMarkActive && (
        <div className="pl-6">
          <Button size="sm" variant="primary" onClick={onMarkActive}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            Approve as Active
          </Button>
        </div>
      )}
    </div>
  );
}
