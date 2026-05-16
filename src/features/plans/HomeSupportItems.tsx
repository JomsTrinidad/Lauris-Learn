"use client";

/**
 * HomeSupportItems — staff management panel for structured home guidance entries.
 *
 * Used inside Step7Agreements (the Family Review / Agreements step of the IEP modal).
 * Allows school staff to add, edit, share, and archive parent-facing follow-through
 * guidance items tied to a specific support plan.
 *
 * Parent visibility is controlled per-item via is_shared_with_parent. Nothing
 * is visible to parents until staff explicitly shares it. Archived items are
 * hidden from parents even if they were previously shared.
 *
 * Parent observations are loaded in parallel with items and shown below each
 * guidance row as a read-only collapsible panel (staff view only).
 */

import { useEffect, useState, useRef } from "react";
import { Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, Loader2, StickyNote } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database";
import { format, parseISO } from "date-fns";

type FollowThroughRow = Database["public"]["Tables"]["support_follow_through_items"]["Row"];

interface ParentObservation {
  id: string;
  follow_through_item_id: string;
  observation_text: string;
  observation_kind: string | null;
  observed_at: string | null;
  created_at: string;
}

// ─── Observation kind display labels ──────────────────────────────────────────
const KIND_LABELS: Record<string, string> = {
  improvement_noticed: "Improvement noticed",
  still_challenging:   "Still challenging",
  needs_follow_up:     "Needs follow-up",
  neutral_update:      "Neutral update",
};

function kindLabel(kind: string | null): string | null {
  if (!kind) return null;
  return KIND_LABELS[kind] ?? kind;
}

function kindClass(kind: string | null): string {
  switch (kind) {
    case "improvement_noticed": return "bg-green-100 text-green-700 border-green-200";
    case "still_challenging":   return "bg-amber-100 text-amber-700 border-amber-200";
    case "needs_follow_up":     return "bg-blue-100 text-blue-700 border-blue-200";
    default:                    return "bg-muted text-muted-foreground border-border/60";
  }
}

// ─── Suggested categories (datalist) ──────────────────────────────────────────
const CATEGORY_SUGGESTIONS = [
  "Communication",
  "Behavior / Regulation",
  "Fine Motor",
  "Social Interaction",
  "Learning Reinforcement",
  "Sensory Support",
  "Daily Living",
  "Observation Request",
];

// ─── Props ─────────────────────────────────────────────────────────────────────
interface HomeSupportItemsProps {
  /** null when the plan hasn't been saved yet (new plan). */
  planId: string | null;
  studentId: string;
  schoolId: string;
  canEdit: boolean;
}

// ─── Blank add-form shape ──────────────────────────────────────────────────────
interface AddForm {
  title: string;
  description: string;
  category: string;
  review_date: string;
}

const EMPTY_ADD: AddForm = { title: "", description: "", category: "", review_date: "" };

// ─── Component ─────────────────────────────────────────────────────────────────
export function HomeSupportItems({ planId, studentId, schoolId, canEdit }: HomeSupportItemsProps) {
  const supabase = createClient();

  const [items, setItems]                       = useState<FollowThroughRow[]>([]);
  const [observationsByItem, setObservationsByItem] = useState<Record<string, ParentObservation[]>>({});
  const [loading, setLoading]                   = useState(false);
  const [addOpen, setAddOpen]                   = useState(false);
  const [form, setForm]                         = useState<AddForm>(EMPTY_ADD);
  const [saving, setSaving]                     = useState(false);
  const [addError, setAddError]                 = useState<string | null>(null);
  // Track which item id is pending a toggle or archive action
  const [pendingId, setPendingId]               = useState<string | null>(null);
  const listRef = useRef<string | null>(null);

  // ── Load items + observations when planId is available ─────────────────────
  useEffect(() => {
    if (!planId) return;
    if (listRef.current === planId) return;
    listRef.current = planId;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  async function load() {
    if (!planId) return;
    setLoading(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [itemsRes, obsRes] = await Promise.all([
      (supabase as any)
        .from("support_follow_through_items")
        .select("*")
        .eq("plan_id", planId)
        .is("archived_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      // Parent observations for the whole plan — grouped by item below
      (supabase as any)
        .from("parent_observations")
        .select("id, follow_through_item_id, observation_text, observation_kind, observed_at, created_at")
        .eq("plan_id", planId)
        .is("archived_at", null)
        .order("created_at", { ascending: true }),
    ]);

    setItems((itemsRes.data ?? []) as FollowThroughRow[]);

    // Group observations by guidance item id
    const grouped: Record<string, ParentObservation[]> = {};
    for (const obs of (obsRes.data ?? []) as ParentObservation[]) {
      if (!grouped[obs.follow_through_item_id]) grouped[obs.follow_through_item_id] = [];
      grouped[obs.follow_through_item_id].push(obs);
    }
    setObservationsByItem(grouped);

    setLoading(false);
  }

  // ── Add a new item ──────────────────────────────────────────────────────────
  async function handleAdd() {
    if (!planId || !form.title.trim()) return;
    setSaving(true);
    setAddError(null);

    const newId = crypto.randomUUID();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("support_follow_through_items")
      .insert({
        id:          newId,
        plan_id:     planId,
        student_id:  studentId,
        school_id:   schoolId,
        title:       form.title.trim(),
        description: form.description.trim() || null,
        category:    form.category.trim() || null,
        review_date: form.review_date || null,
        sort_order:  items.length,
      });

    if (error) {
      setAddError("Could not save guidance item. Please try again.");
    } else {
      setForm(EMPTY_ADD);
      setAddOpen(false);
      listRef.current = null;
      await load();
    }
    setSaving(false);
  }

  // ── Toggle is_shared_with_parent ───────────────────────────────────────────
  async function handleToggleShare(item: FollowThroughRow) {
    if (!canEdit) return;
    setPendingId(item.id);
    const nowShared = !item.is_shared_with_parent;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("support_follow_through_items")
      .update({
        is_shared_with_parent: nowShared,
        // Set shared_with_parent_at once (first-share-wins; don't overwrite on re-share)
        ...(nowShared && !item.shared_with_parent_at
          ? { shared_with_parent_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", item.id);
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              is_shared_with_parent: nowShared,
              shared_with_parent_at: nowShared && !i.shared_with_parent_at
                ? new Date().toISOString()
                : i.shared_with_parent_at,
            }
          : i,
      ),
    );
    setPendingId(null);
  }

  // ── Archive an item (soft delete) ──────────────────────────────────────────
  async function handleArchive(item: FollowThroughRow) {
    if (!canEdit) return;
    setPendingId(item.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("support_follow_through_items")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setPendingId(null);
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  if (!planId) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Save the plan as a draft first to add home support guidance.
      </p>
    );
  }

  return (
    <div className="space-y-3">

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading guidance items…
        </div>
      )}

      {/* Item list */}
      {!loading && items.length === 0 && !addOpen && (
        <p className="text-xs text-muted-foreground italic">
          No home support guidance added yet. Use the button below to add the first focus area.
        </p>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <GuidanceItemRow
              key={item.id}
              item={item}
              observations={observationsByItem[item.id] ?? []}
              canEdit={canEdit}
              isPending={pendingId === item.id}
              onToggleShare={() => handleToggleShare(item)}
              onArchive={() => handleArchive(item)}
            />
          ))}
        </div>
      )}

      {/* Add form */}
      {addOpen && canEdit && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="space-y-2">
            <div>
              <label className="text-xs font-medium text-foreground">Guidance title <span className="text-destructive">*</span></label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Encourage turn-taking during play"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Short description <span className="text-muted-foreground font-normal">(optional)</span></label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Any extra context or suggested activities for the family…"
                rows={2}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Category <span className="text-muted-foreground font-normal">(optional)</span></label>
                <input
                  type="text"
                  list="sfti-category-suggestions"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Choose or type…"
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <datalist id="sfti-category-suggestions">
                  {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Check-in date <span className="text-muted-foreground font-normal">(optional)</span></label>
                <input
                  type="date"
                  value={form.review_date}
                  onChange={(e) => setForm({ ...form, review_date: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          </div>

          {addError && <p className="text-xs text-destructive">{addError}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !form.title.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {saving ? "Saving…" : "Add guidance"}
            </button>
            <button
              type="button"
              onClick={() => { setAddOpen(false); setForm(EMPTY_ADD); setAddError(null); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add button */}
      {canEdit && !addOpen && (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          Add guidance item
        </button>
      )}
    </div>
  );
}


// ─── Individual item row ───────────────────────────────────────────────────────

function GuidanceItemRow({
  item, observations, canEdit, isPending, onToggleShare, onArchive,
}: {
  item: FollowThroughRow;
  observations: ParentObservation[];
  canEdit: boolean;
  isPending: boolean;
  onToggleShare: () => void;
  onArchive: () => void;
}) {
  const [expanded, setExpanded]   = useState(false);
  const [obsOpen, setObsOpen]     = useState(false);
  const shared = item.is_shared_with_parent;

  return (
    <div className={`rounded-lg border text-sm ${shared ? "border-green-200 bg-green-50/40" : "border-border bg-muted/30"}`}>
      <div className="flex items-start gap-2 px-3 py-2.5">
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground leading-snug">{item.title}</span>
            {item.category && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/60 shrink-0">
                {item.category}
              </span>
            )}
            {shared && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 shrink-0">
                Visible to parent
              </span>
            )}
          </div>
          {item.review_date && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Check in by {format(parseISO(item.review_date), "MMM d, yyyy")}
            </p>
          )}
          {item.description && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? "Hide details" : "Show details"}
            </button>
          )}
          {expanded && item.description && (
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{item.description}</p>
          )}
        </div>

        {/* Actions */}
        {canEdit && (
          <div className="flex items-center gap-1 shrink-0 ml-1">
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            ) : (
              <>
                <button
                  type="button"
                  title={shared ? "Hide from parent" : "Share with parent"}
                  onClick={onToggleShare}
                  className={`p-1.5 rounded-md transition-colors ${
                    shared
                      ? "text-green-600 hover:bg-green-100"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {shared ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  title="Archive guidance item"
                  onClick={onArchive}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Parent observations panel — read-only for staff */}
      {observations.length > 0 && (
        <div className="border-t border-border/40 px-3 py-2">
          <button
            type="button"
            onClick={() => setObsOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full text-left"
          >
            <StickyNote className="w-3 h-3 shrink-0 text-amber-500" />
            <span>
              {observations.length === 1
                ? "1 observation from home"
                : `${observations.length} observations from home`}
            </span>
            {obsOpen
              ? <ChevronUp className="w-3 h-3 ml-auto" />
              : <ChevronDown className="w-3 h-3 ml-auto" />}
          </button>

          {obsOpen && (
            <div className="mt-2 space-y-2">
              {observations.map((obs) => (
                <StaffObservationRow key={obs.id} obs={obs} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── Single observation row (staff read-only) ──────────────────────────────────

function StaffObservationRow({ obs }: { obs: ParentObservation }) {
  const label = kindLabel(obs.observation_kind);
  const dateStr = obs.observed_at
    ? format(parseISO(obs.observed_at), "MMM d, yyyy")
    : format(parseISO(obs.created_at), "MMM d, yyyy");

  return (
    <div className="rounded-md bg-amber-50/60 border border-amber-100 px-3 py-2">
      {label && (
        <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full border mb-1 ${kindClass(obs.observation_kind)}`}>
          {label}
        </span>
      )}
      <p className="text-xs text-foreground leading-relaxed">{obs.observation_text}</p>
      <p className="text-[10px] text-muted-foreground mt-1">{dateStr}</p>
    </div>
  );
}
