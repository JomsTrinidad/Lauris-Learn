"use client";

import { StickyNote } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./shared";

export interface Step6DraftNotesProps {
  draftNotes: string;
  setDraftNotes: (v: string) => void;
  canEdit: boolean;
}

export function Step6DraftNotes({ draftNotes, setDraftNotes, canEdit }: Step6DraftNotesProps) {
  return (
    <div className="space-y-5">

      {/* ── Intro banner ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <StickyNote className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Draft Notes</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              A private scratch space for your planning thoughts — jot down anything before the team meeting.
              This section is for you as the drafter; it does not appear on the printed IEP.
            </p>
          </div>
        </div>

        <Field
          label="Planning notes"
          hint="Optional — jot anything useful while you build this plan."
        >
          <Textarea
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            disabled={!canEdit}
            rows={8}
            placeholder={[
              "Possible goals to discuss with the team…",
              "Questions for the OT / speech therapist…",
              "Things to check before the meeting…",
              "Concerns the parent raised informally…",
              "Reminders about last year's plan…",
            ].join("\n")}
            className="resize-y"
          />
        </Field>

        <p className="text-xs text-muted-foreground/70 italic">
          These notes are saved with the plan but are not included in any printed or shared version.
          Use them freely — cross things out, leave questions, think out loud.
        </p>
      </div>

    </div>
  );
}
