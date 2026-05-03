"use client";

/**
 * RequestDocumentModal — Phase D step D14.
 *
 * School staff request a missing document about a student. Recipient is
 * either a parent (one of the student's guardians) or an external contact.
 * v1 does NOT expose `requested_from_kind = 'school'` — that needs a
 * cross-school directory we don't have yet.
 *
 * RLS:
 *   - INSERT policy `school_staff_insert_document_requests` requires
 *     school_id matches and requester_user_id = auth.uid(). Teachers can
 *     also create (no teacher-scope restriction in the policy as written).
 *
 * UX shape:
 *   - Student picker (or pre-filled when launched from a student-scoped page).
 *   - Document type picker.
 *   - Recipient mode tabs (Parent / External).
 *     - Parent: dropdown of guardians for the picked student.
 *     - External: ExternalContactPicker (combobox + inline create).
 *   - Reason (required) + due_date (optional).
 *   - Confirmation strip.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Inbox,
  Loader2,
  AlertTriangle,
  Users,
  Globe,
  Calendar,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/datepicker";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { DOCUMENT_TYPE_OPTIONS } from "./constants";
import { ExternalContactPicker } from "./ExternalContactPicker";
import {
  createRequest,
  listGuardiansForStudent,
} from "./requests-api";
import type { DocumentType, ExternalContactRow } from "./types";

type RecipientMode = "parent" | "external";

interface StudentOption {
  id:    string;
  name:  string;
}

export interface RequestDocumentModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after the request is successfully created. */
  onRequested: (requestId: string) => void;
  schoolId: string;
  /** auth.uid() — required by INSERT policy for `requester_user_id`. */
  userId: string;
  /** Caller role — admin can pick external contacts too; teachers also can,
   *  but they can't *create* external contacts (school_admin INSERT only),
   *  so we hide the inline-create affordance for teachers. */
  isAdmin: boolean;
  /** When launched from a student-scoped context, lock the student field. */
  defaultStudentId?: string | null;
}

export function RequestDocumentModal({
  open,
  onClose,
  onRequested,
  schoolId,
  userId,
  isAdmin,
  defaultStudentId,
}: RequestDocumentModalProps) {
  const supabase = useMemo(() => createClient(), []);

  // Form state
  const [students, setStudents]               = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentId, setStudentId]             = useState<string>(defaultStudentId ?? "");
  const [documentType, setDocumentType]       = useState<DocumentType>("iep");

  // Recipient
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("parent");
  const [guardians, setGuardians]         = useState<{ id: string; full_name: string; email: string | null }[]>([]);
  const [guardiansLoading, setGuardiansLoading] = useState(false);
  const [guardiansError, setGuardiansError]     = useState<string | null>(null);
  const [guardianId, setGuardianId]       = useState("");
  const [externalContact, setExternalContact] = useState<ExternalContactRow | null>(null);

  const [reason,  setReason]  = useState("");
  const [dueDate, setDueDate] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Reset on (re)open
  useEffect(() => {
    if (!open) return;
    setStudentId(defaultStudentId ?? "");
    setDocumentType("iep");
    setRecipientMode("parent");
    setGuardianId("");
    setExternalContact(null);
    setReason("");
    setDueDate("");
    setError(null);
    setSubmitting(false);
  }, [open, defaultStudentId]);

  // Load students once on open. Same disambiguation pattern as the upload
  // modal — but simpler (no birthday) since requests aren't auto-linked
  // back to a specific child_documents row.
  useEffect(() => {
    if (!open || !schoolId) return;
    let cancelled = false;
    setStudentsLoading(true);
    supabase
      .from("students")
      .select("id, first_name, last_name, student_code")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .order("first_name", { ascending: true })
      .order("last_name",  { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else     setStudents(buildStudentOptions(data ?? []));
        setStudentsLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, schoolId, supabase]);

  // Load guardians whenever the student changes (for parent recipient mode)
  useEffect(() => {
    if (!open || !studentId) {
      setGuardians([]);
      return;
    }
    let cancelled = false;
    setGuardiansLoading(true);
    setGuardiansError(null);
    listGuardiansForStudent(supabase, studentId)
      .then((rows) => {
        if (cancelled) return;
        setGuardians(rows.map((g) => ({ id: g.id, full_name: g.full_name, email: g.email })));
        // Auto-pick the first (primary) guardian if only one exists.
        if (rows.length === 1) setGuardianId(rows[0].id);
        else setGuardianId("");
      })
      .catch((err) => {
        if (cancelled) return;
        setGuardiansError(err instanceof Error ? err.message : "Failed to load guardians.");
      })
      .finally(() => { if (!cancelled) setGuardiansLoading(false); });
    return () => { cancelled = true; };
  }, [open, studentId, supabase]);

  const recipientReady =
    recipientMode === "parent"     ? !!guardianId :
    recipientMode === "external"   ? !!externalContact :
    false;

  const dueDateValid = useMemo(() => {
    if (!dueDate) return true;
    try {
      const d = parseISO(dueDate);
      return !isNaN(d.getTime());
    } catch {
      return false;
    }
  }, [dueDate]);

  const canSubmit =
    !!schoolId
    && !!studentId
    && !!documentType
    && reason.trim().length > 0
    && dueDateValid
    && recipientReady
    && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const recipient =
        recipientMode === "parent" && guardianId
          ? { kind: "parent" as const, guardianId }
          : recipientMode === "external" && externalContact
            ? { kind: "external_contact" as const, externalContactId: externalContact.id }
            : null;
      if (!recipient) throw new Error("Pick a recipient.");

      const { id } = await createRequest(supabase, {
        schoolId,
        studentId,
        requestedDocumentType: documentType,
        requesterUserId:       userId,
        reason:                reason.trim(),
        dueDate:               dueDate || null,
        recipient,
      });
      setSubmitting(false);
      onRequested(id);
    } catch (err) {
      setSubmitting(false);
      setError(humanRequestError(errorMessage(err)));
    }
  }

  const studentLocked = !!defaultStudentId;
  const studentName   = students.find((s) => s.id === studentId)?.name ?? "";
  const recipientName =
    recipientMode === "parent"
      ? guardians.find((g) => g.id === guardianId)?.full_name
      : externalContact?.full_name;

  return (
    <Modal open={open} onClose={onClose} title="Request Document" className="max-w-md">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-start gap-2">
          <Inbox className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Asks the recipient to provide this document. They'll be able to
            submit it once the parent / external portal lands; for now this
            tracks the open ask.
          </span>
        </div>

        {/* Student */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Student <span className="text-red-600">*</span>
          </label>
          {studentLocked ? (
            <div className="px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm">
              {studentName || <span className="text-muted-foreground italic">Loading…</span>}
            </div>
          ) : studentsLoading ? (
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading students…
            </div>
          ) : (
            <Select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              disabled={submitting}
              required
            >
              <option value="">Select a student…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          )}
        </div>

        {/* Document type */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Document type <span className="text-red-600">*</span>
          </label>
          <Select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as DocumentType)}
            disabled={submitting}
            required
          >
            {DOCUMENT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>

        {/* Recipient mode tabs */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Request from <span className="text-red-600">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <ModeTab
              active={recipientMode === "parent"}
              onClick={() => setRecipientMode("parent")}
              icon={<Users className="w-3.5 h-3.5" />}
              label="Parent"
            />
            <ModeTab
              active={recipientMode === "external"}
              onClick={() => setRecipientMode("external")}
              icon={<Globe className="w-3.5 h-3.5" />}
              label="External contact"
            />
          </div>

          {recipientMode === "parent" ? (
            !studentId ? (
              <div className="text-xs text-muted-foreground italic">
                Pick a student first to load guardians.
              </div>
            ) : guardiansLoading ? (
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading guardians…
              </div>
            ) : guardiansError ? (
              <ErrorAlert message={guardiansError} />
            ) : guardians.length === 0 ? (
              <div className="px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">No guardians on file for this student.</p>
                  <p className="mt-1 text-xs">
                    Add a guardian in Students before requesting from a parent.
                  </p>
                </div>
              </div>
            ) : (
              <Select
                value={guardianId}
                onChange={(e) => setGuardianId(e.target.value)}
                disabled={submitting}
                required
              >
                <option value="">Select a guardian…</option>
                {guardians.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.full_name}{g.email ? ` · ${g.email}` : ""}
                  </option>
                ))}
              </Select>
            )
          ) : (
            <ExternalContactPicker
              schoolId={schoolId}
              canCreate={isAdmin}
              value={externalContact}
              onChange={setExternalContact}
              disabled={submitting}
            />
          )}
        </div>

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Reason <span className="text-red-600">*</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What you need and why — the recipient sees this."
            rows={3}
            maxLength={500}
            disabled={submitting}
            required
          />
        </div>

        {/* Due date */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Needed by <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <DatePicker
            value={dueDate}
            onChange={setDueDate}
            placeholder="Pick a due date"
          />
        </div>

        {/* Confirmation */}
        {recipientName && studentName && (
          <div className="px-3 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900 flex items-start gap-2">
            <Calendar className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Asking <strong>{recipientName}</strong> for a{" "}
              <strong>{labelForType(documentType)}</strong> for{" "}
              <strong>{studentName}</strong>
              {dueDate && (() => {
                try {
                  return <>, by <strong>{format(parseISO(dueDate), "MMM d, yyyy")}</strong></>;
                } catch { return null; }
              })()}
              .
            </span>
          </div>
        )}

        {error && <ErrorAlert message={error} />}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <ModalCancelButton />
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</>
            ) : (
              <><Inbox className="w-4 h-4 mr-2" />Send request</>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}


// ── Helpers ────────────────────────────────────────────────────────────────

function ModeTab({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md border transition-colors",
        active
          ? "bg-primary/10 border-primary text-foreground font-medium"
          : "bg-card border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

interface StudentRowFromDB {
  id:           string;
  first_name:   string;
  last_name:    string;
  student_code: string | null;
}

function buildStudentOptions(rows: StudentRowFromDB[]): StudentOption[] {
  const baseNameOf = (r: StudentRowFromDB) => `${r.first_name} ${r.last_name}`.trim();
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = baseNameOf(r).toLowerCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return rows.map((r) => {
    const isDup = (counts.get(baseNameOf(r).toLowerCase()) ?? 0) > 1;
    if (!isDup) return { id: r.id, name: baseNameOf(r) };
    if (r.student_code) return { id: r.id, name: `${baseNameOf(r)} · ${r.student_code}` };
    return { id: r.id, name: `${baseNameOf(r)} · #${r.id.slice(-6)}` };
  });
}

function labelForType(t: DocumentType): string {
  return DOCUMENT_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.hint    === "string" && o.hint)    return o.hint;
    if (typeof o.details === "string" && o.details) return o.details;
    try { return JSON.stringify(o); } catch { /* fall through */ }
  }
  return String(err);
}

function humanRequestError(msg?: string): string {
  if (!msg) return "Couldn't send the request. Please try again.";
  if (/violates row-level security/i.test(msg)) {
    return "You don't have permission to create this request.";
  }
  if (/duplicate key/i.test(msg)) {
    return "This exact request already exists. Refresh and check your list.";
  }
  return msg;
}
