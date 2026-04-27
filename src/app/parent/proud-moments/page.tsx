"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Star, ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { useParentContext } from "../layout";

const CATEGORY_COLORS: Record<string, string> = {
  "Effort":         "bg-blue-100 text-blue-700",
  "Kindness":       "bg-pink-100 text-pink-700",
  "Focus":          "bg-purple-100 text-purple-700",
  "Participation":  "bg-amber-100 text-amber-700",
  "Independence":   "bg-green-100 text-green-700",
  "Creativity":     "bg-orange-100 text-orange-700",
  "Improvement":    "bg-teal-100 text-teal-700",
  "Helping Others": "bg-rose-100 text-rose-700",
};

const REACTIONS = [
  { type: "proud",     emoji: "❤️", label: "Proud" },
  { type: "great_job", emoji: "👏", label: "Great Job" },
  { type: "keep_going",emoji: "🌟", label: "Keep Going" },
];

const MOMENT_HEADINGS: Partial<Record<string, (name: string) => string>> = {
  "Kindness":       (n) => `${n} showed kindness today.`,
  "Effort":         (n) => `${n} gave it their all today.`,
  "Focus":          (n) => `${n} stayed focused during class.`,
  "Participation":  (n) => `${n} was active and engaged today.`,
  "Independence":   (n) => `${n} worked independently today.`,
  "Creativity":     (n) => `${n} showed wonderful creativity today.`,
  "Improvement":    (n) => `${n} made great progress today.`,
  "Helping Others": (n) => `${n} helped a classmate today.`,
};

function getMomentHeading(firstName: string, category: string): string {
  const fn = MOMENT_HEADINGS[category];
  return fn ? fn(firstName) : `${firstName} earned a proud moment.`;
}

interface ProudMoment {
  id: string;
  category: string;
  note: string | null;
  createdAt: string;
  myReaction: string | null;
}

export default function ParentProudMomentsPage() {
  const { childId, child } = useParentContext();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [moments, setMoments] = useState<ProudMoment[]>([]);
  const [parentUserId, setParentUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) { setLoading(false); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? null;
    setParentUserId(userId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("proud_moments")
      .select("id, category, note, created_at, proud_moment_reactions(reaction_type, parent_id)")
      .eq("student_id", childId)
      .order("created_at", { ascending: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setMoments(((data ?? []) as any[]).map((m: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reactions = (m.proud_moment_reactions ?? []) as any[];
      const myReaction = userId
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? reactions.find((r: any) => r.parent_id === userId)?.reaction_type ?? null
        : null;
      return { id: m.id, category: m.category, note: m.note ?? null, createdAt: m.created_at, myReaction };
    }));

    setLoading(false);
  }

  async function handleReaction(momentId: string, reactionType: string) {
    if (!parentUserId) return;
    setSaving(momentId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("proud_moment_reactions")
      .upsert(
        { proud_moment_id: momentId, parent_id: parentUserId, reaction_type: reactionType },
        { onConflict: "proud_moment_id,parent_id" }
      );
    setMoments((prev) =>
      prev.map((m) => m.id === momentId ? { ...m, myReaction: reactionType } : m)
    );
    setSaving(null);
  }

  if (loading) return <PageSpinner />;

  const firstName = child?.firstName ?? "Your child";

  // Weekly summary (last 7 days)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = moments.filter((m) => new Date(m.createdAt) >= weekAgo);
  const categoryCounts: Record<string, number> = {};
  for (const m of thisWeek) {
    categoryCounts[m.category] = (categoryCounts[m.category] ?? 0) + 1;
  }
  const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/parent/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Proud Moments</h1>
          <p className="text-muted-foreground text-sm">{firstName}&apos;s highlights</p>
        </div>
      </div>

      {/* Weekly summary */}
      {thisWeek.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-4 h-4 text-amber-500" />
            <p className="font-semibold text-amber-900 text-sm">This Week</p>
          </div>
          <p className="text-sm text-amber-800">
            {firstName} earned{" "}
            <span className="font-semibold">
              {thisWeek.length} proud moment{thisWeek.length !== 1 ? "s" : ""}
            </span>{" "}
            this week.
            {topCategory && (
              <>
                {" "}Most celebrated:{" "}
                <span className={`inline-flex items-center px-1.5 py-0 rounded text-xs font-medium ${CATEGORY_COLORS[topCategory] ?? "bg-gray-100 text-gray-700"}`}>
                  {topCategory}
                </span>
              </>
            )}
          </p>
        </div>
      )}

      {moments.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            <Star className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No proud moments yet</p>
            <p className="text-sm mt-1">The teacher will celebrate {firstName}&apos;s milestones here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {moments.map((m) => {
            const d = new Date(m.createdAt);
            return (
              <Card key={m.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-snug">
                        {getMomentHeading(firstName, m.category)}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[m.category] ?? "bg-gray-100 text-gray-700"}`}>
                          {m.category}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {m.note && (
                    <p className="text-sm text-muted-foreground leading-relaxed italic">&ldquo;{m.note}&rdquo;</p>
                  )}

                  {/* Reaction buttons */}
                  <div className="flex items-center gap-2 pt-0.5">
                    {REACTIONS.map((r) => (
                      <button
                        key={r.type}
                        onClick={() => handleReaction(m.id, r.type)}
                        disabled={saving === m.id}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                          m.myReaction === r.type
                            ? "bg-amber-400 border-amber-400 text-white"
                            : "border-border text-muted-foreground hover:border-amber-300 hover:text-amber-700"
                        } disabled:opacity-50`}
                      >
                        {r.emoji} {r.label}
                      </button>
                    ))}
                  </div>

                  {m.myReaction && (
                    <p className="text-xs text-green-600">
                      ✓ Your reaction has been shared with the school.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
