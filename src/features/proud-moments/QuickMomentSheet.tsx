"use client";

/**
 * Phase 6 — Quick Moments.
 *
 * A streamlined per-student capture sheet. The student is pre-selected by
 * whoever opens the sheet, so there is no combobox and no search step.
 *
 * Voice contract:
 *   This is an OBSERVATIONAL capture surface, not a celebration / praise
 *   / achievement-logging surface. The copy intentionally avoids
 *   "celebrate", "highlight", "achievement" framing. Teachers should feel
 *   comfortable capturing ordinary meaningful moments — "participated
 *   today", "asked for help", "tried independently", "practiced
 *   turn-taking" — not just standout-positive ones.
 *
 * Data contract:
 *   Inserts into the existing `proud_moments` table (schema unchanged
 *   since migration 035). RLS is reused — staff insert under school
 *   scope. A moment captured here is byte-identical to one captured via
 *   the full /proud-moments admin page; they both surface in the parent
 *   hero (Tier D30, 2-day cooldown), Positive Highlight card (7-day
 *   surface window), and the journey feed.
 *
 * Save behaviour:
 *   On success, the sheet closes silently — no toast, no confirmation
 *   banner, no "another?" prompt. The interaction should feel like "a
 *   small meaningful note was naturally recorded," not workflow
 *   completion.
 */

import { useState } from "react";
import {
  Zap, Heart, Target, MessageCircle, CheckCircle, Lightbulb, TrendingUp, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";

// ── Category constants ────────────────────────────────────────────────────────
// Single-file copy of the constants from `/(dashboard)/proud-moments/page.tsx`.
// Kept duplicated intentionally — extracting a shared module would expand
// scope. If a third caller appears, refactor to `@/features/proud-moments/
// constants.ts` at that point.

const CATEGORIES = [
  "Effort", "Kindness", "Focus", "Participation",
  "Independence", "Creativity", "Improvement", "Helping Others",
];

const CATEGORY_COLORS_FORM: Record<string, string> = {
  "Effort":         "bg-blue-100 text-blue-700",
  "Kindness":       "bg-pink-100 text-pink-700",
  "Focus":          "bg-violet-100 text-violet-700",
  "Participation":  "bg-amber-100 text-amber-700",
  "Independence":   "bg-emerald-100 text-emerald-700",
  "Creativity":     "bg-orange-100 text-orange-700",
  "Improvement":    "bg-teal-100 text-teal-700",
  "Helping Others": "bg-rose-100 text-rose-700",
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "Effort":         Zap,
  "Kindness":       Heart,
  "Focus":          Target,
  "Participation":  MessageCircle,
  "Independence":   CheckCircle,
  "Creativity":     Lightbulb,
  "Improvement":    TrendingUp,
  "Helping Others": Users,
};

// Phase 9 — Category-driven placeholder scaffolding. The placeholder shifts
// when the teacher picks a different category, so the example shape they
// see matches the kind of observation they're capturing. Pure scaffold —
// never inserts text. The teacher always writes their own words.
//
// Voice contract: examples are OBSERVATIONAL, GROUNDED, and SPECIFIC —
// the kind of mundane-but-real moments that build continuity texture.
// They are deliberately NOT editorial polish, NOT motivational, NOT
// "wonderful classroom moment" energy. Some examples include the natural
// difficulty of the moment ("even when it was tricky") so the system
// doesn't read as always-uplifting.
const CATEGORY_PLACEHOLDERS: Record<string, string> = {
  "Effort":         "e.g. Tried tracing letters even when it was tricky.",
  "Kindness":       "e.g. Shared a toy without being asked.",
  "Focus":          "e.g. Stayed engaged through circle time.",
  "Participation":  "e.g. Volunteered an answer during reading.",
  "Independence":   "e.g. Put their own backpack away.",
  "Creativity":     "e.g. Combined two activities into a new game.",
  "Improvement":    "e.g. Held the pencil more steadily today.",
  "Helping Others": "e.g. Walked a younger student to the door.",
};
const DEFAULT_PLACEHOLDER = "e.g. Asked for help during snack time.";

// ── Props ─────────────────────────────────────────────────────────────────────

interface QuickMomentSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called silently after a successful save (e.g. for the parent component
   *  to refresh its data). The sheet closes itself; no toast is shown. */
  onSaved?: () => void;
  studentId: string;
  studentName: string;
  schoolId: string;
  userId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QuickMomentSheet({
  open, onClose, onSaved, studentId, studentName, schoolId, userId,
}: QuickMomentSheetProps) {
  const supabase = createClient();
  const [category, setCategory] = useState<string>("Kindness");
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstName = studentName.split(" ")[0];

  function reset() {
    setCategory("Kindness");
    setNote("");
    setError(null);
    setSaving(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSave() {
    if (!studentId || !schoolId || !userId) return;
    setSaving(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any)
      .from("proud_moments")
      .insert({
        school_id:  schoolId,
        student_id: studentId,
        created_by: userId,
        category,
        note: note.trim() || null,
      });
    if (err) {
      setSaving(false);
      setError("Could not save. Please try again.");
      return;
    }
    // Silent close — no toast, no ceremony. The action should feel like a
    // small meaningful note was naturally recorded.
    onSaved?.();
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Note a moment about ${firstName}`}
    >
      <div className="space-y-4">
        {/* Category chips — observational, not celebratory. Picking a category
            is the only required step; everything else is optional. */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">Category</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => {
              const isActive = category === cat;
              const Icon = CATEGORY_ICONS[cat];
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    isActive
                      ? (CATEGORY_COLORS_FORM[cat] ?? "bg-gray-100 text-gray-700") + " border-transparent"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional note — observational placeholder, no praise framing.
            Phase 9: placeholder shifts per selected category so the example
            shape matches the kind of observation being captured. Pure
            scaffold — never inserts text. */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">
            Note <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Textarea
            placeholder={CATEGORY_PLACEHOLDERS[category] ?? DEFAULT_PLACEHOLDER}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            A short, specific observation helps the parent picture the moment.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? "Saving…" : "Save"}
          </Button>
          <ModalCancelButton />
        </div>
      </div>
    </Modal>
  );
}
