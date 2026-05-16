"use client";
import { useEffect, useState } from "react";
import { ClipboardList, CheckCircle2, Home, ChevronDown, ChevronUp, StickyNote, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { useParentContext } from "../layout";
import { format, parseISO } from "date-fns";

interface ParentPlan {
  id: string;
  title: string;
  plan_type: "iep" | "support" | "behavior" | "other";
  status: "finalized" | "approved";
  finalized_at: string | null;
  approved_at: string | null;
  parent_acknowledged_at: string | null;
  revision_number: number;
}

interface GuidanceItem {
  id: string;
  plan_id: string;
  title: string;
  description: string | null;
  category: string | null;
  review_date: string | null;
}

interface ParentObservation {
  id: string;
  follow_through_item_id: string;
  observation_text: string;
  observation_kind: string | null;
  observed_at: string | null;
  created_at: string;
}

const PLAN_TYPE_LABELS: Record<string, string> = {
  iep:      "IEP Plan",
  support:  "Support Plan",
  behavior: "Behavior Plan",
  other:    "Other Form",
};

// ─── Observation kind config ────────────────────────────────────────────────
const OBSERVATION_KINDS = [
  { value: "improvement_noticed", label: "Improvement noticed", cls: "border-green-200 bg-green-50 text-green-700 hover:bg-green-100" },
  { value: "still_challenging",   label: "Still challenging",   cls: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" },
  { value: "needs_follow_up",     label: "Needs follow-up",     cls: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" },
  { value: "neutral_update",      label: "Neutral update",      cls: "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60" },
] as const;

function kindLabel(kind: string | null): string | null {
  return OBSERVATION_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

function kindBadgeClass(kind: string | null): string {
  const cfg = OBSERVATION_KINDS.find((k) => k.value === kind);
  if (!cfg) return "border-border bg-muted/30 text-muted-foreground";
  return cfg.cls.split(" ").filter((c) => !c.startsWith("hover:")).join(" ");
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "long", day: "numeric", year: "numeric",
  });
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export default function ParentPlansPage() {
  const { childId, schoolId } = useParentContext();
  const supabase = createClient();
  const [loading, setLoading]                         = useState(true);
  const [plans, setPlans]                             = useState<ParentPlan[]>([]);
  const [guidanceByPlan, setGuidanceByPlan]           = useState<Record<string, GuidanceItem[]>>({});
  const [observationsByItem, setObservationsByItem]   = useState<Record<string, ParentObservation[]>>({});
  const [guardianId, setGuardianId]                   = useState<string | null>(null);
  const [acking, setAcking]                           = useState<string | null>(null);
  const [ackError, setAckError]                       = useState<string | null>(null);

  useEffect(() => {
    if (!childId) { setLoading(false); return; }
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  async function loadAll() {
    if (!childId) return;
    setLoading(true);

    // Run plan fetch and guardian ID lookup in parallel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [planResult, guardianResult] = await Promise.all([
      (supabase as any)
        .from("student_plans")
        .select("id, title, plan_type, status, finalized_at, approved_at, parent_acknowledged_at, revision_number")
        .eq("student_id", childId)
        .in("status", ["finalized", "approved"])
        .order("updated_at", { ascending: false }),
      // Fetch guardian_id for this parent + child (needed for observation INSERT)
      supabase
        .from("guardians")
        .select("id")
        .eq("student_id", childId as string)
        .maybeSingle(),
    ]);

    setGuardianId(guardianResult.data?.id ?? null);

    const loadedPlans = (planResult.data ?? []) as ParentPlan[];
    setPlans(loadedPlans);

    if (loadedPlans.length === 0) {
      setLoading(false);
      return;
    }

    const planIds = loadedPlans.map((p) => p.id);

    // Load guidance items for all visible plans
    // RLS ensures only shared + active items from finalized/approved plans are returned.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: guidanceData } = await (supabase as any)
      .from("support_follow_through_items")
      .select("id, plan_id, title, description, category, review_date")
      .in("plan_id", planIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    const loadedGuidance = (guidanceData ?? []) as GuidanceItem[];
    const grouped: Record<string, GuidanceItem[]> = {};
    for (const item of loadedGuidance) {
      if (!grouped[item.plan_id]) grouped[item.plan_id] = [];
      grouped[item.plan_id].push(item);
    }
    setGuidanceByPlan(grouped);

    // Load parent's own observations for all guidance items in one batch.
    // RLS constrains this to observations submitted by the current guardian.
    const allItemIds = loadedGuidance.map((g) => g.id);
    if (allItemIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: obsData } = await (supabase as any)
        .from("parent_observations")
        .select("id, follow_through_item_id, observation_text, observation_kind, observed_at, created_at")
        .in("follow_through_item_id", allItemIds)
        .is("archived_at", null)
        .order("created_at", { ascending: true });

      const obsGrouped: Record<string, ParentObservation[]> = {};
      for (const obs of (obsData ?? []) as ParentObservation[]) {
        if (!obsGrouped[obs.follow_through_item_id]) obsGrouped[obs.follow_through_item_id] = [];
        obsGrouped[obs.follow_through_item_id].push(obs);
      }
      setObservationsByItem(obsGrouped);
    }

    setLoading(false);
  }

  async function handleAcknowledge(planId: string) {
    setAcking(planId);
    setAckError(null);
    try {
      const { data, error } = await supabase.rpc("acknowledge_plan", { p_plan_id: planId });
      if (error) throw error;
      if (data === "ok") {
        setPlans((prev) => prev.map((p) =>
          p.id === planId
            ? { ...p, parent_acknowledged_at: new Date().toISOString() }
            : p,
        ));
      } else {
        setAckError("Could not record acknowledgment. Please try again.");
      }
    } catch {
      setAckError("Could not record acknowledgment. Please try again.");
    } finally {
      setAcking(null);
    }
  }

  function handleObservationAdded(itemId: string, obs: ParentObservation) {
    setObservationsByItem((prev) => ({
      ...prev,
      [itemId]: [...(prev[itemId] ?? []), obs],
    }));
  }

  if (loading) return <PageSpinner />;

  const pendingCount = plans.filter((p) => !p.parent_acknowledged_at).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Support Plans</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Finalized educational support plans shared by your child's school.
        </p>
        {pendingCount > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
            {pendingCount === 1
              ? "1 plan is awaiting your acknowledgment."
              : `${pendingCount} plans are awaiting your acknowledgment.`}
          </p>
        )}
      </div>

      {ackError && (
        <p className="text-sm text-destructive">{ackError}</p>
      )}

      {plans.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <ClipboardList className="w-12 h-12 mx-auto opacity-30 text-muted-foreground" />
            <p className="text-muted-foreground">No finalized plans yet.</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Support plans will appear here once your child's school has finalized them.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const isAcked = !!plan.parent_acknowledged_at;
            const readyDate = plan.finalized_at ?? plan.approved_at;
            const guidance = guidanceByPlan[plan.id] ?? [];
            return (
              <Card
                key={plan.id}
                className={isAcked ? "" : "border-amber-200 bg-amber-50/30"}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Plan icon */}
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <ClipboardList className="w-4.5 h-4.5 text-primary" />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Title + plan type */}
                      <div className="flex items-start gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground leading-snug">
                          {plan.title}
                        </p>
                        {(plan.revision_number ?? 1) > 1 && (
                          <span className="text-xs text-muted-foreground mt-0.5">
                            Rev. {plan.revision_number}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {PLAN_TYPE_LABELS[plan.plan_type] ?? plan.plan_type}
                        {readyDate && (
                          <span> · Finalized {fmtDate(readyDate)}</span>
                        )}
                      </p>

                      {/* Acknowledgment section */}
                      <div className="mt-3">
                        {isAcked ? (
                          <div className="flex items-center gap-1.5 text-green-700">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span className="text-xs font-medium">
                              Acknowledged{" "}
                              {fmtDateShort(plan.parent_acknowledged_at!)}
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <p className="text-xs text-muted-foreground">
                              Please acknowledge that you have received and reviewed this plan.
                            </p>
                            <button
                              type="button"
                              disabled={acking === plan.id}
                              onClick={() => handleAcknowledge(plan.id)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                              {acking === plan.id ? "Recording…" : "Acknowledge"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Home Support Guidance */}
                  {guidance.length > 0 && (
                    <HomeSupportSection
                      items={guidance}
                      observationsByItem={observationsByItem}
                      guardianId={guardianId}
                      childId={childId}
                      schoolId={schoolId}
                      onObservationAdded={handleObservationAdded}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Footer note */}
      {plans.length > 0 && (
        <p className="text-xs text-muted-foreground text-center px-4">
          Acknowledging confirms you have received and reviewed this plan. It does not imply consent or agreement.
        </p>
      )}
    </div>
  );
}

// ─── Home Support Guidance sub-component ──────────────────────────────────────

function HomeSupportSection({
  items,
  observationsByItem,
  guardianId,
  childId,
  schoolId,
  onObservationAdded,
}: {
  items: GuidanceItem[];
  observationsByItem: Record<string, ParentObservation[]>;
  guardianId: string | null;
  childId: string | null;
  schoolId: string | null;
  onObservationAdded: (itemId: string, obs: ParentObservation) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const preview = items.slice(0, 3);
  const hasMore = items.length > 3;

  return (
    <div className="mt-4 pt-4 border-t border-border/60">
      <div className="flex items-center gap-2 mb-3">
        <Home className="w-3.5 h-3.5 text-teal-600 shrink-0" />
        <span className="text-xs font-semibold text-foreground">Home Support</span>
        <span className="text-[10px] text-muted-foreground">({items.length} focus area{items.length !== 1 ? "s" : ""})</span>
      </div>

      <div className="space-y-2">
        {(expanded ? items : preview).map((item) => (
          <GuidanceCard
            key={item.id}
            item={item}
            observations={observationsByItem[item.id] ?? []}
            guardianId={guardianId}
            childId={childId}
            schoolId={schoolId}
            onObservationAdded={onObservationAdded}
          />
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {expanded
            ? <><ChevronUp className="w-3 h-3" />Show less</>
            : <><ChevronDown className="w-3 h-3" />Show {items.length - 3} more</>}
        </button>
      )}
    </div>
  );
}

// ─── GuidanceCard — one guidance item + observation form ──────────────────────

function GuidanceCard({
  item,
  observations,
  guardianId,
  childId,
  schoolId,
  onObservationAdded,
}: {
  item: GuidanceItem;
  observations: ParentObservation[];
  guardianId: string | null;
  childId: string | null;
  schoolId: string | null;
  onObservationAdded: (itemId: string, obs: ParentObservation) => void;
}) {
  const supabase = createClient();

  // Description expand
  const [open, setOpen]           = useState(false);
  // Observation form open
  const [formOpen, setFormOpen]   = useState(false);
  // Form state
  const [obsText, setObsText]     = useState("");
  const [obsKind, setObsKind]     = useState<string | null>(null);
  const [obsDate, setObsDate]     = useState("");
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const TEXT_LIMIT = 300;
  const charsLeft = TEXT_LIMIT - obsText.length;

  async function handleSubmit() {
    if (!obsText.trim() || !guardianId || !childId || !schoolId) return;
    setSaving(true);
    setSaveError(null);

    const newId = crypto.randomUUID();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("parent_observations")
      .insert({
        id:                      newId,
        follow_through_item_id:  item.id,
        plan_id:                 item.plan_id,
        student_id:              childId,
        school_id:               schoolId,
        guardian_id:             guardianId,
        observation_text:        obsText.trim(),
        observation_kind:        obsKind || null,
        observed_at:             obsDate || null,
      });

    if (error) {
      setSaveError("Could not save. Please try again.");
    } else {
      const newObs: ParentObservation = {
        id:                     newId,
        follow_through_item_id: item.id,
        observation_text:       obsText.trim(),
        observation_kind:       obsKind,
        observed_at:            obsDate || null,
        created_at:             new Date().toISOString(),
      };
      onObservationAdded(item.id, newObs);
      setObsText("");
      setObsKind(null);
      setObsDate("");
      setFormOpen(false);
    }
    setSaving(false);
  }

  return (
    <div className="rounded-lg bg-teal-50/60 border border-teal-100 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {/* Title + category */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-xs font-medium text-foreground leading-snug">{item.title}</p>
            {item.category && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 border border-teal-200 shrink-0">
                {item.category}
              </span>
            )}
          </div>

          {/* Review date */}
          {item.review_date && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Check in by {format(parseISO(item.review_date), "MMM d, yyyy")}
            </p>
          )}

          {/* Description expand */}
          {item.description && (
            <>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1 mt-1 text-[11px] text-teal-700 hover:underline"
              >
                {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {open ? "Hide" : "Details"}
              </button>
              {open && (
                <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{item.description}</p>
              )}
            </>
          )}

          {/* Existing observations (own, shown below content) */}
          {observations.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {observations.map((obs) => (
                <ParentObservationBubble key={obs.id} obs={obs} />
              ))}
            </div>
          )}

          {/* Observation form or "Share an observation" trigger */}
          <div className="mt-2">
            {formOpen ? (
              <div className="rounded-lg border border-teal-200 bg-white/70 p-3 space-y-2.5">
                {/* Noise-prevention copy — supportive, not demanding */}
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Share occasional observations that may help your child's support team.
                </p>

                {/* Kind selector — optional radio-style buttons */}
                <div className="flex flex-wrap gap-1">
                  {OBSERVATION_KINDS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => setObsKind(obsKind === k.value ? null : k.value)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors ${
                        obsKind === k.value
                          ? k.cls.split(" hover:")[0]
                          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>

                {/* Text input */}
                <div>
                  <textarea
                    value={obsText}
                    onChange={(e) => setObsText(e.target.value)}
                    placeholder="What are you noticing at home?"
                    rows={3}
                    className="w-full rounded-md border border-border bg-white px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal-400/30 resize-none"
                    autoFocus
                  />
                  {obsText.length > 0 && (
                    <p className={`text-[10px] mt-0.5 text-right ${charsLeft < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {charsLeft < 0 ? `${Math.abs(charsLeft)} over suggested limit` : `${charsLeft} characters remaining`}
                    </p>
                  )}
                </div>

                {/* Optional observed date */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-muted-foreground shrink-0">When did you notice this?</label>
                  <input
                    type="date"
                    value={obsDate}
                    onChange={(e) => setObsDate(e.target.value)}
                    className="text-xs border border-border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400/30"
                  />
                </div>

                {saveError && <p className="text-[11px] text-destructive">{saveError}</p>}

                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={saving || !obsText.trim() || !guardianId}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {saving ? "Sharing…" : "Share observation"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFormOpen(false); setObsText(""); setObsKind(null); setObsDate(""); setSaveError(null); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="flex items-center gap-1 mt-0.5 text-[11px] text-teal-700 hover:underline"
              >
                <StickyNote className="w-3 h-3" />
                {observations.length > 0 ? "Add another observation" : "Share an observation"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Single observation bubble (parent's own, read-back display) ───────────────

function ParentObservationBubble({ obs }: { obs: ParentObservation }) {
  const label = kindLabel(obs.observation_kind);
  const dateStr = obs.observed_at
    ? format(parseISO(obs.observed_at), "MMM d")
    : format(parseISO(obs.created_at), "MMM d");

  return (
    <div className="rounded-md bg-white/60 border border-teal-100 px-2.5 py-1.5">
      {label && (
        <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full border mb-1 ${kindBadgeClass(obs.observation_kind)}`}>
          {label}
        </span>
      )}
      <p className="text-[11px] text-foreground leading-relaxed">{obs.observation_text}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{dateStr}</p>
    </div>
  );
}
