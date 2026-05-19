"use client";

/**
 * Phase 12 — Continuity Context.
 *
 * Lightweight modal for school staff to set a single observational context
 * line about what's currently happening for a student. Mirrors the Care
 * `care_support_context` UX pattern but school-scoped.
 *
 * Voice contract:
 *   Context should be OBSERVATIONAL and SITUATIONAL — describing what's
 *   happening in the child's lived classroom experience right now — NOT
 *   interpretive, therapeutic, or evaluative. The placeholder and helper
 *   text model the desired tone.
 *
 *   GOOD examples:
 *     - "Practicing independence during cleanup."
 *     - "Getting comfortable joining group activities."
 *     - "Adjusting to a new classroom routine."
 *     - "Transitioning back into routine after being away."
 *
 *   BAD examples (deliberately not modeled here):
 *     - "Improving executive function."
 *     - "Showing increased resilience."
 *     - "Building emotional regulation."
 *     - "Developing self-regulation."
 *
 * Persistence: writes to `student_support_context` table (Phase 12 migration
 * 107). One row per student — UPDATE replaces the previous text. No
 * history, no versioning, no status workflow.
 *
 * Save / Clear behaviour:
 *   - Save: upsert. Empty text is not allowed (DB CHECK + UI guard).
 *   - Clear: deletes the row (parent surface stops rendering).
 *   - Cancel: closes without changes.
 *
 * Soft cap: 200 characters. Keeps the context "line"-shaped, not
 * "paragraph"-shaped — preserves the calm continuity-line aesthetic.
 */

import { useEffect, useState } from "react";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";

// ── Placeholder examples ─────────────────────────────────────────────────────
// Rotated through to scaffold observational tone. All are present-continuous,
// concrete, situational, non-interpretive. Adding new examples here is the
// safest way to evolve the voice over time.
const PLACEHOLDER_EXAMPLES = [
  "e.g. Practicing independence during cleanup.",
  "e.g. Getting comfortable joining group activities.",
  "e.g. Adjusting to a new classroom routine.",
  "e.g. Transitioning back into routine after being away.",
];

const SOFT_CHAR_CAP = 200;

interface EditSupportContextModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  studentId: string;
  studentName: string;
  schoolId: string;
  userId: string;
  /** Existing context text, when the student already has one set. Null/empty
   *  means this is the first time. */
  existingText: string | null;
}

export function EditSupportContextModal({
  open, onClose, onSaved, studentId, studentName, schoolId, userId, existingText,
}: EditSupportContextModalProps) {
  const supabase = createClient();
  const [text, setText] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rotate placeholder per mount so teachers see different observational
  // shapes over time without the system feeling "designed."
  const [placeholderIdx] = useState(() => Math.floor(Math.random() * PLACEHOLDER_EXAMPLES.length));

  const firstName = studentName.split(" ")[0] || "this student";
  const hasExisting = !!existingText && existingText.trim().length > 0;

  // Hydrate text from existing context whenever the modal opens.
  useEffect(() => {
    if (open) {
      setText(existingText ?? "");
      setError(null);
    }
  }, [open, existingText]);

  function reset() {
    setText("");
    setError(null);
    setSaving(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Please enter a short context line, or use Clear to remove it.");
      return;
    }
    if (!studentId || !schoolId || !userId) return;
    setSaving(true);
    setError(null);
    // Upsert via insert with ON CONFLICT — UNIQUE(student_id) handles the
    // single-row-per-student invariant. Falling back to a manual update if
    // needed isn't required since onConflict resolves it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any)
      .from("student_support_context")
      .upsert({
        student_id:        studentId,
        school_id:         schoolId,
        focus_text:        trimmed,
        set_by_profile_id: userId,
      }, { onConflict: "student_id" });
    if (err) {
      setSaving(false);
      setError("Could not save. Please try again.");
      return;
    }
    onSaved?.();
    reset();
    onClose();
  }

  async function handleClear() {
    if (!studentId) return;
    setSaving(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any)
      .from("student_support_context")
      .delete()
      .eq("student_id", studentId);
    if (err) {
      setSaving(false);
      setError("Could not clear. Please try again.");
      return;
    }
    onSaved?.();
    reset();
    onClose();
  }

  const overCap = text.length > SOFT_CHAR_CAP;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Set current context for ${firstName}`}
    >
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed -mt-1">
          What&apos;s happening for {firstName} right now? A short, observational
          note — describe the current situation, not an evaluation or judgment.
        </p>

        <div>
          <Textarea
            placeholder={PLACEHOLDER_EXAMPLES[placeholderIdx]}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
          />
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[11px] text-muted-foreground">
              Observational, not evaluative. Replace whenever the situation shifts.
            </p>
            <p className={`text-[11px] tabular-nums ${overCap ? "text-amber-700" : "text-muted-foreground/60"}`}>
              {text.length}/{SOFT_CHAR_CAP}
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving || !text.trim()} className="flex-1">
            {saving ? "Saving…" : (hasExisting ? "Update" : "Save")}
          </Button>
          {hasExisting && (
            <Button
              variant="outline"
              onClick={handleClear}
              disabled={saving}
              className="text-muted-foreground"
            >
              Clear
            </Button>
          )}
          <ModalCancelButton />
        </div>
      </div>
    </Modal>
  );
}
