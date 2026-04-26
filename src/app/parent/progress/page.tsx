"use client";
import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { useParentContext } from "../layout";

interface Observation {
  id: string;
  categoryName: string;
  rating: "emerging" | "developing" | "consistent" | "advanced";
  note: string | null;
  observedAt: string;
  observedBy: string | null;
}

const RATING_CONFIG: Record<Observation["rating"], { label: string; pill: string; bar: string }> = {
  emerging:   { label: "Emerging",   pill: "bg-gray-100 text-gray-700",     bar: "bg-gray-400 w-1/4" },
  developing: { label: "Developing", pill: "bg-yellow-100 text-yellow-700", bar: "bg-yellow-400 w-2/4" },
  consistent: { label: "Consistent", pill: "bg-green-100 text-green-700",   bar: "bg-green-500 w-3/4" },
  advanced:   { label: "Advanced",   pill: "bg-blue-100 text-blue-700",     bar: "bg-blue-500 w-full" },
};

export default function ParentProgressPage() {
  const { childId, child } = useParentContext();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [observations, setObservations] = useState<Observation[]>([]);

  useEffect(() => {
    if (!childId) { setLoading(false); return; }
    loadProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  async function loadProgress() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("progress_observations")
      .select("id, rating, note, observed_at, observed_by, category:progress_categories(name)")
      .eq("student_id", childId)
      .eq("visibility", "parent_visible")
      .order("observed_at", { ascending: false });

    // Keep only the most recent observation per category
    const seen = new Set<string>();
    const deduped: Observation[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (data ?? []) as any[]) {
      const catName: string = row.category?.name ?? "General";
      if (!seen.has(catName)) {
        seen.add(catName);
        deduped.push({
          id: row.id,
          categoryName: catName,
          rating: row.rating,
          note: row.note ?? null,
          observedAt: row.observed_at,
          observedBy: row.observed_by ?? null,
        });
      }
    }
    setObservations(deduped);
    setLoading(false);
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Progress</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {child?.firstName}&apos;s latest observations from teachers
        </p>
      </div>

      {observations.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No progress updates yet</p>
            <p className="text-sm mt-1">Teachers will share observations here when ready.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {observations.map((obs) => {
            const cfg = RATING_CONFIG[obs.rating];
            return (
              <Card key={obs.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-sm">{obs.categoryName}</p>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${cfg.pill}`}>
                      {cfg.label}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${cfg.bar}`} />
                  </div>

                  {obs.note && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{obs.note}</p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    {obs.observedBy && <span>{obs.observedBy} · </span>}
                    {new Date(obs.observedAt).toLocaleDateString("en-PH", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-center text-muted-foreground pb-4">
        Only observations shared by teachers are shown here.
      </p>
    </div>
  );
}
