/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ Parent journey helpers — Learn side                                      ║
 * ║                                                                          ║
 * ║ Pure synchronous helpers for the unified Lauris Parent home. No Supabase ║
 * ║ or async code — safe for unit tests.                                     ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║ Cross-app alignment contract                                             ║
 * ║                                                                          ║
 * ║ Visual + structural sibling of Lauris Care's parent-attention helpers:   ║
 * ║   (Lauris-Care: lib/parent-attention/helpers.ts)                         ║
 * ║                                                                          ║
 * ║ Match shape, NOT code — neither app imports from the other. Sharing      ║
 * ║ happens in spirit so a future cross-domain aggregator can merge by       ║
 * ║ global priority score without a re-mapping pass:                         ║
 * ║                                                                          ║
 * ║   Learn `PriorityCard`        ↔  Care `AttentionCard`                    ║
 * ║   Learn `StatusHeadline`      ↔  Care `HeroState`                        ║
 * ║   Learn `getFeaturedParentCards` ↔ Care `getCareAttentionCards`          ║
 * ║   Learn `getChildStatusHeadline` ↔ Care `getCareHeroState`               ║
 * ║                                                                          ║
 * ║ Do NOT prematurely promote either side into a shared package — that     ║
 * ║ locks in assumptions before both apps stabilise. See Phase 1 docstring   ║
 * ║ on the Care side for the long-form contract; this file is the Learn-side ║
 * ║ counterpart and the two MUST be kept aligned when either is edited.      ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║ §1  Hero / status-headline semantics                                     ║
 * ║                                                                          ║
 * ║ Phase 2 (Unified Parent Hub) made the headline cross-domain. Phase 3     ║
 * ║ rebalanced *which* signal wins the hero so continuity outranks stale     ║
 * ║ operational positives. Phase 5 introduced PACING — the hero's earned-    ║
 * ║ persistence windows are now shorter than the surrounding surfaces'       ║
 * ║ windows so meaningful moments feel earned, not constant.                 ║
 * ║                                                                          ║
 * ║ The hero answers ONE question per visit: "what should this parent read   ║
 * ║ first?" The Phase-3 answer is a tier chain (A → F), evaluated top-down,  ║
 * ║ with Phase-5 cooldowns inside Tier D.                                    ║
 * ║                                                                          ║
 * ║ Calmness contract:                                                       ║
 * ║   Within a tier's hero window, the hero state is STABLE across multiple  ║
 * ║   visits — a parent who reads "Sofia showed kindness." on Monday should  ║
 * ║   still see it on Tuesday. Hero mood does NOT flip mid-visit on new      ║
 * ║   operational events — that's notification-feed behaviour.               ║
 * ║                                                                          ║
 * ║ Pacing contract (Phase 5):                                               ║
 * ║   ACROSS days, the hero is permitted (and intended) to rotate through    ║
 * ║   different tiers as cooldowns expire. After a proud-moment cooldown    ║
 * ║   ends, the hero may fall through to Tier E (school update) or Tier F   ║
 * ║   (calm default) even when the moment is still card-eligible. This is    ║
 * ║   pacing variety, not volatility — the page across a week reads as      ║
 * ║   "meaningful day / ordinary day / quiet day" rather than "always        ║
 * ║   meaningful."                                                            ║
 * ║                                                                          ║
 * ║ Identity contract (Phase 2 preserved): the hero avoids phrases like      ║
 * ║ "X's school journey" / "supported by your clinic" — the parent should    ║
 * ║ feel they're following one child, not using two apps.                    ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║ §2  Tier-based hero priority + Phase-5 hero windows                      ║
 * ║                                                                          ║
 * ║ Hero priority is organised into six tiers. Tiers do NOT mix; the first   ║
 * ║ non-empty tier wins.                                                     ║
 * ║                                                                          ║
 * ║   Tier A  Acute operational     absent / late / excused today            ║
 * ║   Tier B  Today-scheduled       meeting / online class today             ║
 * ║   Tier C  Fresh positive op.    present, ≤ATTENDANCE_PRESENT_FRESH_HOURS ║
 * ║   Tier D  Continuity (paced):                                            ║
 * ║            D30 proud moment ≤HERO_PROUD_MOMENT_WINDOW_DAYS               ║
 * ║            D35 therapy ≤HERO_THERAPY_WINDOW_DAYS                         ║
 * ║            D40 positive observation ≤HERO_POSITIVE_OBSERVATION_WINDOW    ║
 * ║   Tier E  Background continuity recent school update ≤3d                 ║
 * ║   Tier F  Calm default          stale present, or nothing recent         ║
 * ║                                                                          ║
 * ║ The Tier C → D handoff is the Phase-3 re-weighting: once a parent has    ║
 * ║ seen the morning "Sofia is in school" check-in, the hero stops holding   ║
 * ║ it as the day's defining message.                                        ║
 * ║                                                                          ║
 * ║ Dedup contract: when Tier D lifts a proud moment or fallback positive    ║
 * ║ observation, the helper returns `consumedHighlightId` / `consumedFallback║
 * ║ so the dashboard suppresses the duplicated card content below (heading   ║
 * ║ line on Positive Highlight; entire Recent Growth card).                  ║
 * ║                                                                          ║
 * ║ Priority-cards chain (separate surface, unchanged in Phases 3-5):        ║
 * ║   P10 consent · P20 doc request · P30 today meeting · P31 today online   ║
 * ║   · P40 top upcoming event · P50 billing balance · P60 second event      ║
 * ║   · P70 holiday                                                          ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║ §3  Future architectural boundary — cross-domain orchestration           ║
 * ║                                                                          ║
 * ║ Today this file ranks Learn-domain items plus the one therapy item the   ║
 * ║ dashboard already received via `list_parent_visible_therapy_updates`     ║
 * ║ (migration 091). The orchestration is intentionally minimal — a tier     ║
 * ║ switch statement with cooldown windows, not a system.                    ║
 * ║                                                                          ║
 * ║ A future continuity phase will likely need:                              ║
 * ║   • Cross-domain prioritisation — a school absence + a new voice note    ║
 * ║     happening the same day need ONE ranked answer, not two.              ║
 * ║   • Emotionally relevant ranking — a recent breakthrough may outrank a   ║
 * ║     newer but less meaningful event.                                     ║
 * ║   • Reinforcement-aware ordering — items the parent already acted on     ║
 * ║     should fade.                                                         ║
 * ║   • Thematic grouping ("practicing turn-taking at school and in          ║
 * ║     therapy this week") — needs cross-source theme extraction we don't   ║
 * ║     have today.                                                          ║
 * ║   • Same-category cooldown — if two recent proud moments share a         ║
 * ║     category, the hero should vary. Phase 5 deliberately did NOT add     ║
 * ║     this because it requires fetching multiple highlights and edges      ║
 * ║     into orchestration territory.                                        ║
 * ║                                                                          ║
 * ║ That orchestration layer is OUT OF SCOPE here. The tier scheme is        ║
 * ║ chosen so a future aggregator can merge Learn + Care + Med candidates    ║
 * ║ by tier first, then by tier-internal score. Do NOT pre-build the         ║
 * ║ scaffolding now — it locks in semantics neither app has earned yet.      ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║ §5  Pacing semantics (Phase 5) — surface vs hero windows                 ║
 * ║                                                                          ║
 * ║ Every Tier D signal has TWO windows:                                     ║
 * ║                                                                          ║
 * ║   Surface window  How long the signal stays on the page somewhere.       ║
 * ║                   Used by the Positive Highlight card, the Recent        ║
 * ║                   Growth card, and the journey feed. Larger.             ║
 * ║                                                                          ║
 * ║   Hero window     How long the signal can OWN the hero (top sentence    ║
 * ║                   of the page). Strictly shorter than the surface        ║
 * ║                   window. After it expires, the signal stops leading     ║
 * ║                   the page but stays visible below.                      ║
 * ║                                                                          ║
 * ║ Today's values:                                                          ║
 * ║                                                                          ║
 * ║                          Surface (card/feed)    Hero (this file)         ║
 * ║   Proud moment           7d                     2d                       ║
 * ║   Therapy session        3d (journey feed)      2d                       ║
 * ║   Positive observation   7d                     3d                       ║
 * ║                                                                          ║
 * ║ Why asymmetric: a proud moment and a therapy session are discrete        ║
 * ║ events; the hero gets a tight 2-day window so it rotates briskly.        ║
 * ║ A positive observation is a slower-moving signal — a rating reflects     ║
 * ║ recent behaviour, not a single event — so its hero window is one day     ║
 * ║ longer. These are tunable single constants, not a scoring system.        ║
 * ║                                                                          ║
 * ║ The pacing principle: emotionally meaningful moments should feel         ║
 * ║ EARNED, not constant. The hero is the loudest surface; it shouldn't     ║
 * ║ carry the longest persistence. Quiet days are part of the cadence.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import type {
  UpcomingItem,
  AttendanceTodayResult,
  NeedsAttentionCounts,
  ParentJourneyItem,
  ServicePresence,
  LatestHighlight,
  FallbackHighlight,
  PriorityCard,
  PriorityCardType,
  PriorityCardAccent,
  RecentVoiceNoteSignal,
} from "./types";

// ── Highlight recency ─────────────────────────────────────────────────────────

/** Days a positive highlight (proud moment) stays featured on the home dashboard. */
export const HIGHLIGHT_FEATURED_WINDOW_DAYS = 7;

/**
 * Returns true if a highlight created at `createdAt` is still within the
 * featured window and should appear on the home card.
 * After this window the highlight stays in the Journey feed (history) but
 * is not pinned as the featured card.
 */
export function isHighlightStillFeatured(createdAt: string): boolean {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs <= HIGHLIGHT_FEATURED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

// ── Child status headline ─────────────────────────────────────────────────────

export type StatusIconKind = "check" | "clock" | "x" | "calendar" | "sparkle";

export interface StatusHeadline {
  heading: string;
  /**
   * Phase 18 — now nullable. Tier D30 (proud-moment-as-hero) returns null
   * here because the continuity-detail layer (teacher note) is rendered by
   * the attached spotlight beneath the headline, NOT by a hero-detail line.
   * Other tiers (attendance, scheduled meeting, therapy session) still
   * return factual detail strings because their content carries real
   * operational meaning. Callers must guard rendering on truthiness.
   */
  detail: string | null;
  detailColor: string;
  iconKind: StatusIconKind;
  /**
   * Phase 3: when the hero lifted a proud_moment into Tier D, this is the
   * `highlight.id` so the dashboard can suppress the duplicated heading in
   * the Positive Highlight card below (keeping category + note + reactions).
   * Null when no proud moment was lifted.
   */
  consumedHighlightId?: string | null;
  /**
   * Phase 3: when true, the hero lifted the fallback positive observation
   * into Tier D and the dashboard should suppress the Recent Growth card
   * entirely (its only meaningful content was the heading + summary the hero
   * now carries).
   */
  consumedFallback?: boolean;
  /**
   * Optional deep-link target for the detail line. When set, the dashboard
   * wraps the supporting line in a Link so the "tap to read" / "see what
   * they worked on" affordance copy in the detail string is honoured. Null
   * when the detail is purely descriptive or refers to UI directly below
   * the hero (e.g. Tier D30's "tap to react below" — the reactions are the
   * spotlight, not a separate page).
   */
  detailHref?: string | null;
}

/** Surface window for "recent" cross-domain stories (therapy, school update)
 *  used by Tier E45 (school update) and by the journey feed. Tier D35's
 *  hero eligibility uses HERO_THERAPY_WINDOW_DAYS instead. */
const RECENT_STORY_WINDOW_DAYS = 3;

/** Phase 3 Tier C cutoff — after this many hours, attendance.present is no
 *  longer the freshest fact on the page and a continuity signal can take
 *  over the hero. The operational state is preserved by the dashboard's
 *  secondary attendance line. 4h is a single tunable constant, not a
 *  ranking system. */
const ATTENDANCE_PRESENT_FRESH_HOURS = 4;

/** Surface window for a positive progress observation to remain in the
 *  Recent Growth card. Tier D40's hero eligibility uses the shorter
 *  HERO_POSITIVE_OBSERVATION_WINDOW_DAYS so the hero doesn't keep saying
 *  "Sofia is showing growth in X" for a full week. */
const POSITIVE_OBSERVATION_WINDOW_DAYS = 7;

// ── Phase 5: continuity pacing ────────────────────────────────────────────────
// Hero windows are intentionally shorter than the corresponding surface
// windows so a Tier D signal can EARN the hero for a couple of days, then
// step aside — letting ordinary days (Tier E) and quiet days (Tier F)
// naturally surface as the top sentence on the page. The signal itself
// stays visible on the page (Positive Highlight card / Recent Growth card /
// journey feed continue to use the larger surface windows above).
//
// Pacing principle: emotionally meaningful moments should feel EARNED, not
// constant. The hero is the loudest surface; it shouldn't carry the longest
// persistence. Surrounding surfaces carry the rest.
//
// Same-category cooldown (deferred): we do NOT inspect whether two recent
// proud moments share a category. Adding that would push the system toward
// hidden orchestration. Simple, human, understandable heuristics only.

/** Phase 5 — How many days a proud moment can be the hero, regardless of
 *  the larger 7-day surface window the card still uses. */
const HERO_PROUD_MOMENT_WINDOW_DAYS = 2;

/** Phase 5 — How many days a completed therapy session can be the hero,
 *  regardless of the 3-day window the journey feed uses. */
const HERO_THERAPY_WINDOW_DAYS = 2;

/** Phase 5 — How many days a positive progress observation can be the hero,
 *  regardless of the larger 7-day surface window the Recent Growth card
 *  uses. Slightly longer than the other two because observations are
 *  slower-moving signals than proud moments or sessions. */
const HERO_POSITIVE_OBSERVATION_WINDOW_DAYS = 3;

function isWithinDays(iso: string, days: number): boolean {
  const ms = Date.now() - new Date(iso).getTime();
  return ms >= 0 && ms <= days * 24 * 60 * 60 * 1000;
}

function isWithinHours(iso: string, hours: number): boolean {
  const ms = Date.now() - new Date(iso).getTime();
  return ms >= 0 && ms <= hours * 60 * 60 * 1000;
}

function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

// ── Phase 18 — Parent Rhythm Adaptation V1 ────────────────────────────────────
// Smallest meaningful rhythm signal: a time-of-day greeting variant on the
// existing "Hi, X!" line. Acknowledges the parent's daypart without
// restructuring anything below — no card reordering, no emphasis shifts,
// no density changes (the homepage's existing auto-hide-when-empty rules
// already deliver density adaptation by themselves).
//
// Buckets are chosen to read NATURALLY in conversation:
//   05:00–11:59  "Good morning"   — start of the school day, breakfast routine
//   12:00–17:59  "Good afternoon" — pickup window, after-school checkins
//   18:00–21:59  "Good evening"   — dinner / reflection window
//   22:00–04:59  "Hi"             — late-night fallback. Deliberately NOT
//                                    "Good evening" or "Good night" —
//                                    a parent checking the app at 23:30
//                                    doesn't want emotional framing for
//                                    that hour; "Hi" is neutral and
//                                    respectful of the time.
//
// Pure function — caller passes `hour` so the helper stays trivially
// testable. The dashboard reads `new Date().getHours()` at render time.
// No hydration concern because the parent dashboard is "use client" and
// renders only after the loading spinner exits, so SSR/CSR diverge cleanly.

export function getTimeOfDayGreeting(hour: number, name: string | null): string {
  let head: string;
  if      (hour >= 5  && hour < 12) head = "Good morning";
  else if (hour >= 12 && hour < 18) head = "Good afternoon";
  else if (hour >= 18 && hour < 22) head = "Good evening";
  else                              head = "Hi";
  const trimmed = name?.trim();
  return trimmed ? `${head}, ${trimmed}!` : `${head} there!`;
}

/**
 * Phase-3 proud-moment hero map. Mirrors the dashboard-side MOMENT_HEADINGS
 * verbatim BUT drops the trailing "today" — the hero may surface a moment
 * up to 7 days old, and "today" would mis-anchor stale highlights.
 *
 * Voice intentionally grounded and observable (not abstract growth-language
 * like "Sofia is building kindness"). Matches the existing card voice so a
 * parent who first sees the hero and then scrolls to the card hears the
 * same person speaking.
 */
function getProudMomentHeroHeading(firstName: string, category: string): string {
  const map: Partial<Record<string, (n: string) => string>> = {
    "Kindness":       (n) => `${n} showed kindness.`,
    "Effort":         (n) => `${n} gave it their all.`,
    "Focus":          (n) => `${n} stayed focused during class.`,
    "Participation":  (n) => `${n} was active and engaged.`,
    "Independence":   (n) => `${n} worked independently.`,
    "Creativity":     (n) => `${n} showed wonderful creativity.`,
    "Improvement":    (n) => `${n} made great progress.`,
    "Helping Others": (n) => `${n} helped a classmate.`,
  };
  return map[category]?.(firstName) ?? `${firstName} earned a positive highlight.`;
}

/**
 * Phase-3 tier-based hero priority chain. Re-weights the emotional hierarchy
 * so continuity signals can outrank stale operational positives WITHOUT
 * demoting acute operational state (absent/late/excused/today's meeting).
 *
 *   TIER A — Acute operational (parent must know now; outranks everything)
 *     A10  attendance.absent  today          → "{N} is absent today."
 *     A11  attendance.late    today          → "{N} arrived late today."
 *     A12  attendance.excused today          → "{N} has an excused absence today."
 *
 *   TIER B — Today-scheduled (operational context)
 *     B20  meeting today                     → "{N} has a meeting today."
 *     B21  online class today                → "{N} has an online class today."
 *
 *   TIER C — Fresh positive operational (≤ATTENDANCE_PRESENT_FRESH_HOURS)
 *     C25  attendance.present, fresh         → "{N} is in school."
 *
 *   TIER D — Continuity (warmer, child-centred — Phase 3 re-weight)
 *     D30  featured proud moment ≤7d         → category-specific child-centred sentence
 *     D35  recent therapy session ≤3d        → "{N} had a recent therapy session."
 *     D40  recent positive observation ≤7d   → "{N} is showing growth in {category}."
 *
 *   TIER E — Background continuity
 *     E45  recent school update ≤3d          → "{N}'s teacher shared something new."
 *
 *   TIER F — Calm default
 *     F50  stale present (>cutoff) OR nothing → "All quiet for {N} so far today."
 *
 * Calmness contract: tiers D/E/F are *stable* across multiple visits within
 * their windows. A parent who reads "Sofia showed kindness." in the hero on
 * Monday will still see it on Wednesday (until the 7-day window closes or
 * an acute Tier A event displaces it). Hero mood does NOT flip with every
 * new operational event — that's notification-feed behaviour, not continuity.
 *
 * Returns `consumedHighlightId` / `consumedFallback` so the dashboard can
 * suppress the duplicated card content (heading line on the proud-moment
 * card; the whole Recent Growth card).
 */
export function getChildStatusHeadline(
  firstName: string,
  attendance: AttendanceTodayResult,
  todayEvents: UpcomingItem[] = [],
  recentFeedItem?: ParentJourneyItem | null,
  highlight?: LatestHighlight | null,
  fallbackHighlight?: FallbackHighlight | null,
): StatusHeadline {
  // ── Tier A — acute operational (absent / late / excused) ──────────────────
  if (attendance.status === "late") return {
    heading: `${firstName} arrived late today.`,
    detail: attendance.checkedInAt ? `Arrived at ${attendance.checkedInAt}` : "Marked late",
    detailColor: "text-amber-600",
    iconKind: "clock",
  };
  if (attendance.status === "absent") return {
    heading: `${firstName} is absent today.`,
    detail: "Not in school today",
    detailColor: "text-red-600",
    iconKind: "x",
  };
  if (attendance.status === "excused") return {
    heading: `${firstName} has an excused absence today.`,
    detail: "Excused from school",
    detailColor: "text-muted-foreground",
    iconKind: "x",
  };

  // ── Tier B — today-scheduled (meeting / online class) ─────────────────────
  const todayMeeting = todayEvents.find(e => e.eventType === "meeting");
  if (todayMeeting) {
    return {
      heading: `${firstName} has a meeting today.`,
      detail: todayMeeting.title,
      detailColor: "text-purple-600",
      iconKind: "calendar",
    };
  }
  const todayOnline = todayEvents.find(e => e.eventType === "online_class");
  if (todayOnline) {
    return {
      heading: `${firstName} has an online class today.`,
      detail: todayOnline.title,
      detailColor: "text-blue-600",
      iconKind: "calendar",
    };
  }

  // ── Tier C — fresh positive operational ───────────────────────────────────
  // attendance.present is hero-worthy only while it's fresh news. After
  // ATTENDANCE_PRESENT_FRESH_HOURS the dashboard's secondary line carries the
  // signal and continuity tiers take over the hero.
  const presentIsFresh =
    attendance.status === "present"
    && attendance.checkedInAtIso !== null
    && isWithinHours(attendance.checkedInAtIso, ATTENDANCE_PRESENT_FRESH_HOURS);
  if (presentIsFresh) return {
    heading: `${firstName} is in school.`,
    detail: attendance.checkedInAt ? `Checked in at ${attendance.checkedInAt}` : "Marked present",
    detailColor: "text-green-600",
    iconKind: "check",
  };

  // ── Tier D30 — featured proud moment ──────────────────────────────────────
  // The warmest, most child-centred signal we have. When nothing acute is
  // happening and no fresh check-in confirmation is in play, this owns the
  // hero — but ONLY for HERO_PROUD_MOMENT_WINDOW_DAYS (Phase 5 cooldown),
  // not for the full surface window. The Positive Highlight card below
  // still uses the surface window so the moment doesn't vanish — the hero
  // just stops *leading* the page after a couple of days, making room for
  // ordinary and quiet days to surface naturally.
  if (highlight
      && highlight.isFeatured
      && isWithinDays(highlight.createdAt, HERO_PROUD_MOMENT_WINDOW_DAYS)) {
    return {
      heading: getProudMomentHeroHeading(firstName, highlight.category),
      // Phase 18 — detail line dropped entirely for proud-moment-as-hero.
      // "Noted today" was robotic/operational copy in an emotional zone.
      // Freshness is already visually encoded (amber spotlight, top-of-
      // page position, present-tense headline). The continuity-detail
      // layer for THIS tier lives in the attached spotlight below the
      // headline — the teacher's note carries the real story. See the
      // dashboard's `highlightHeadingSuppressed` branch.
      detail: null,
      detailColor: "text-amber-700",
      iconKind: "sparkle",
      consumedHighlightId: highlight.id,
    };
  }

  // ── Tier D35 — recent therapy session ─────────────────────────────────────
  // Hero eligibility uses HERO_THERAPY_WINDOW_DAYS (Phase 5 cooldown) rather
  // than the journey feed's RECENT_STORY_WINDOW_DAYS. Sessions still appear
  // in the journey feed beyond the cooldown.
  if (recentFeedItem && recentFeedItem.sourceCategory === "therapy"
      && isWithinDays(recentFeedItem.occurredAt, HERO_THERAPY_WINDOW_DAYS)) {
    return {
      heading: `${firstName} had a recent therapy session.`,
      detail: `Session shared ${relativeDay(recentFeedItem.occurredAt)} — see what they worked on`,
      detailColor: "text-purple-600",
      iconKind: "sparkle",
    };
  }

  // ── Tier D40 — recent positive progress observation ───────────────────────
  // Uses the curated fallbackHighlight (rated consistent/advanced, ≤7d on
  // the card) so the hero never lifts a neutral or developmental
  // observation as growth. Hero eligibility further narrowed to
  // HERO_POSITIVE_OBSERVATION_WINDOW_DAYS so the hero doesn't say "Sofia is
  // showing growth in X" for a full week from a single rating.
  if (fallbackHighlight
      && isWithinDays(fallbackHighlight.occurredAt, HERO_POSITIVE_OBSERVATION_WINDOW_DAYS)) {
    return {
      heading: `${firstName} is showing growth in ${fallbackHighlight.category}.`,
      detail: `Noted ${relativeDay(fallbackHighlight.occurredAt)} — tap progress to read more`,
      detailColor: "text-green-700",
      iconKind: "sparkle",
      consumedFallback: true,
    };
  }

  // ── Tier E45 — recent school update (teacher post / observation row) ──────
  // Softer wording than the operational "class shared an update" Phase 2 used.
  // The detail line copy invites action ("tap to read") — we lift the source
  // item's actionHref into `detailHref` so the dashboard can honour the
  // affordance. Adapter contract: school updates → /parent/updates,
  // progress observations → /parent/progress.
  if (recentFeedItem && recentFeedItem.sourceCategory === "school"
      && isWithinDays(recentFeedItem.occurredAt, RECENT_STORY_WINDOW_DAYS)) {
    const isObservation = recentFeedItem.itemType === "progress";
    return {
      heading: isObservation
        ? `${firstName}'s teacher noted some new growth.`
        : `${firstName}'s teacher shared something new.`,
      detail: `${isObservation ? "Noted" : "Shared"} ${relativeDay(recentFeedItem.occurredAt)} — tap to read`,
      detailColor: "text-blue-600",
      iconKind: "calendar",
      detailHref: recentFeedItem.actionHref ?? (isObservation ? "/parent/progress" : "/parent/updates"),
    };
  }

  // ── Tier F50 — calm default ───────────────────────────────────────────────
  // Reached when: attendance is null/pending, or attendance.present is stale
  // (>cutoff) and no continuity signal is fresh. The dashboard still surfaces
  // attendance.present via its secondary line when applicable.
  return {
    heading: `All quiet for ${firstName} so far today.`,
    detail: "New updates from school and therapy will appear here as they come in",
    detailColor: "text-muted-foreground",
    iconKind: "clock",
  };
}

// ── Service context line ─────────────────────────────────────────────────────
// Single, secondary cross-domain framing signal under the hero. Renders ONLY
// when 2+ contributing services are connected to this child. When only one
// service exists (today, almost everyone), returns null so the page doesn't
// shout "integration platform" at a parent who has just one connection.
//
// Wording: calm, human, non-promotional. No "Connected services", no
// "Integrated support", no "Across".

export function getServiceContextLine(presence: ServicePresence): string | null {
  const phrases: string[] = [];
  if (presence.school.connected)  phrases.push("at school");
  if (presence.therapy.connected) phrases.push("in therapy");
  if (presence.medical.connected) phrases.push("with medical care");
  if (phrases.length < 2) return null;
  // Oxford-comma join for 3, simple "and" for 2.
  const joined = phrases.length === 2
    ? `${phrases[0]} and ${phrases[1]}`
    : `${phrases.slice(0, -1).join(", ")}, and ${phrases[phrases.length - 1]}`;
  return `Supported ${joined}.`;
}

// ── Phase 13 — Today's Pulse (signal-first compression) ──────────────────────
// Returns a short FACTUAL signal line synthesising today's incoming journey
// activity, or null when no items are from today.
//
// Voice contract (strict):
//   - Counts are structural compression, NOT activity telemetry.
//   - Source names are CATEGORICAL ("from school", "from therapy",
//     "from medical care") — never operational labels like
//     "Sunshine Learning Center · Toddler A". That's database language;
//     this surface is human-readable continuity compression.
//   - Counts above PULSE_HIGH_THRESHOLD compress to "Several" so the
//     signal stays calm — never "7 new today" energy.
//   - No interpretive narration. Never "Sofia had a wonderful day" or
//     "Sofia is thriving socially." The pulse is trustworthy compression,
//     not AI-parenting commentary.
//
// Examples:
//   0 items today                            → null (line doesn't render)
//   1 school item                            → "1 new from school today"
//   3 school items                           → "3 new from school today"
//   7 school items                           → "Several new from school today"
//   1 school + 1 therapy                     → "2 new today — school and therapy"
//   2 school + 1 therapy + 1 medical         → "4 new today — school, therapy, and medical care"
//   7 mixed                                  → "Several new today — school and therapy"

const PULSE_HIGH_THRESHOLD = 5;

const PULSE_CATEGORY_LABEL: Record<string, string> = {
  school:  "school",
  therapy: "therapy",
  medical: "medical care",
};

export function getTodayPulseSignal(feed: ParentJourneyItem[]): string | null {
  // Local-date day-start so "today" stays anchored to the parent's calendar
  // day, not a rolling 24h window (which would confuse late-night visits).
  const now = new Date();
  const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const todayItems = feed.filter((item) => {
    const t = new Date(item.occurredAt).getTime();
    return t >= todayStartMs;
  });

  if (todayItems.length === 0) return null;

  // Group by sourceCategory. We deliberately ignore organizationName-level
  // detail because the directive says source naming should be human and
  // lightweight — categories are the right granularity for a glance signal.
  const categories = new Set<string>();
  for (const item of todayItems) {
    if (item.sourceCategory !== "system") categories.add(item.sourceCategory);
  }

  const count = todayItems.length;
  const tooMany = count > PULSE_HIGH_THRESHOLD;

  // Multi-category (compressed across school + therapy + medical)
  if (categories.size > 1) {
    // Stable order: school → therapy → medical (matches mental model)
    const order = ["school", "therapy", "medical"];
    const labels = order
      .filter((c) => categories.has(c))
      .map((c) => PULSE_CATEGORY_LABEL[c] ?? c);
    const list =
      labels.length === 2
        ? `${labels[0]} and ${labels[1]}`
        : `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
    return tooMany ? `Several new today — ${list}` : `${count} new today — ${list}`;
  }

  // Single category
  const cat = [...categories][0] ?? "system";
  const label = PULSE_CATEGORY_LABEL[cat] ?? cat;
  if (tooMany) return `Several new from ${label} today`;
  return `${count} new from ${label} today`;
}

// ── Phase 13 — Continuity Intelligence Layer V1 ──────────────────────────────
// A unified "What's showing up" signal cluster surfaced as a compact strip
// inside the Today card. Synthesises three existing data sources into at most
// THREE short, observable signal chips. Returns an empty array when nothing
// meaningful is happening — the caller hides the section entirely (calm by
// absence). No "no signals yet" / "nothing to report" filler.
//
// Voice contract (mirrors Phase 10 and Today's-Pulse precedents):
//   • Observable patterns, NEVER conclusions. The system reflects RECURRENCE
//     and FRESHNESS — it does not interpret the child.
//   • Counts compress to "Several" past PULSE_HIGH_THRESHOLD so volume stays
//     calm (never notification-feed energy).
//   • Source names are CATEGORICAL ("from school", "from therapy") not
//     operational (no "Sunshine Learning Center · Toddler A").
//   • Recurring-category signals say "X appeared again" — present-perfect,
//     factual, no quantification.
//   • Domain-recency signals say "{Domain} has a recent update" — no
//     interpretation of what that update means.
//
// Signal kinds (priority descending, per directive §13):
//   1. recurring_category — proud_moment category recurred ≥2× in 14d
//   2. domain_recent       — therapy/medical has feed item in last 3d but
//                             NOT today (warmth signal without count)
//   3. domain_today        — at least one feed item from today; compresses
//                             count to "Several" past PULSE_HIGH_THRESHOLD
//
// Cross-domain ordering inside `domain_recent` and `domain_today`:
//   therapy → medical → school. Less-frequent domains read as more
//   meaningful when they show activity; school baseline gets the lowest
//   slot because it's the parent's daily expectation.
//
// Cap: 3 signals total. Recurring categories take at most 2 slots so a
// domain signal can always squeeze in when one exists. The 3rd recurring
// category is dropped (Phase 10's array already arrives capped at 3, so
// this trims to 2 inside the merge step).
//
// Out of scope for V1 (per directive):
//   • Cross-domain "school+therapy both active" signals → Phase 15 territory
//   • AI summaries, dashboards, charts, scoring → explicitly forbidden
//   • Inbox / unread / notification-center semantics → forbidden
//   • Urgent-action / fresh proud-moment signals → already in Coming up card
//     and hero respectively; surfacing here would triple-up

export type ContinuitySignalKind =
  | "recurring_category"
  | "cross_domain"
  | "domain_today"
  | "domain_recent"
  | "domain_quiet";

export interface ContinuitySignal {
  kind: ContinuitySignalKind;
  /** Short observable phrase displayed in the chip. e.g. "Focus appeared
   *  again", "Therapy has a recent update", "2 new from school today". */
  label: string;
  /** Present only for `recurring_category` — lets the caller look up the
   *  same de-saturated CATEGORY_COLORS_MEMORY palette Phase 10 already
   *  uses so memory chips keep their visual identity inside the merged
   *  strip. Other kinds intentionally render neutral so they don't
   *  compete with category chips for color attention. */
  category?: string;
  /** Present for domain signals — used as a stable React key so React
   *  doesn't recycle a school chip into a therapy chip when state shifts. */
  domain?: "school" | "therapy" | "medical";
}

const SIGNAL_CAP = 3;
const RECURRING_CATEGORY_CAP = 2;
const DOMAIN_RECENT_WINDOW_DAYS = 3;
// Phase 15 — Cross-domain window. 7-day rolling matches the directive's
// "this week / recently" voice ("School and therapy both have recent
// updates"). Broader than the per-domain 3-day window because cross-domain
// presence is a higher-level signal — it should tolerate slightly older
// activity before going dark.
const CROSS_DOMAIN_WINDOW_DAYS = 7;

const DOMAIN_LABEL: Record<"school" | "therapy" | "medical", string> = {
  school: "school",
  therapy: "therapy",
  medical: "medical care",
};

const DOMAIN_LABEL_CAPITAL: Record<"school" | "therapy" | "medical", string> = {
  school: "School",
  therapy: "Therapy",
  medical: "Medical care",
};

// Phase 15 — Cross-domain label builder.
//
// Voice contract (strict — re-read directive §15 before touching this):
//   • Factual PRESENCE only. "Both have recent updates" / "all have recent
//     updates" — never "growing", "improving", "carrying over", "generalizing".
//   • No clinical synthesis. The signal says "school and therapy are both
//     active" — it does NOT say "therapy work is showing up at school" or
//     "communication is improving across domains".
//   • Quantifier varies (both/all) but predicate stays constant: "have
//     recent updates". Symmetric across 2-vs-3 domain cases.
//   • Reading order is the natural school → therapy → medical sequence,
//     not the priority order used for per-domain slot allocation, because
//     parents read sentences left-to-right and expect the more common
//     domain first.
function buildCrossDomainLabel(
  activeDomains: Array<"school" | "therapy" | "medical">,
): string {
  const labels = activeDomains.map((d) => DOMAIN_LABEL[d]);
  // Sentence-case the first domain only — others stay lowercase to read
  // as continuation, not enumeration headers.
  const head = labels[0].charAt(0).toUpperCase() + labels[0].slice(1);
  if (labels.length === 2) {
    return `${head} and ${labels[1]} both have recent updates`;
  }
  // 3 domains — Oxford comma + "all" quantifier.
  const middle = labels.slice(1, -1).join(", ");
  const tail = labels[labels.length - 1];
  return `${head}, ${middle}, and ${tail} all have recent updates`;
}

export function getContinuitySignals(
  feed: ParentJourneyItem[],
  recurringCategories: string[],
  presence: ServicePresence,
): ContinuitySignal[] {
  const out: ContinuitySignal[] = [];

  // 1. Recurring proud-moment categories — highest priority continuity signal.
  // Phase 10's query already sorted by most-recent-occurrence and capped at 3;
  // we trim to RECURRING_CATEGORY_CAP so domain signals can always slot in.
  for (const cat of recurringCategories.slice(0, RECURRING_CATEGORY_CAP)) {
    out.push({
      kind: "recurring_category",
      label: `${cat} appeared again`,
      category: cat,
    });
  }

  // Local-day-start anchor — same model Today's Pulse used. Late-night
  // visits won't suddenly read items from 22:00 last night as "today".
  const now = new Date();
  const todayStartMs = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const recentCutoffMs = Date.now() - DOMAIN_RECENT_WINDOW_DAYS * 86_400_000;
  // Phase 15 — broader 7-day window powers the cross-domain check. The
  // window is rolling from `now`, not calendar-anchored, because the chip
  // says "recent" / "this week" — both natural-language phrases that
  // tolerate "last Tuesday" on a Monday visit.
  const weekCutoffMs = Date.now() - CROSS_DOMAIN_WINDOW_DAYS * 86_400_000;

  // Pre-compute per-domain activity once so we don't re-scan the feed three
  // times. `today[d]` is the count of items from this calendar day; `recent`
  // is true if any item is within the 3-day window AT ALL (used only when
  // there are zero items today, so a fresh-today domain doesn't double up
  // with a "recent" chip). `weekActive[d]` is true if any item is within
  // the broader 7-day window — drives the Phase-15 cross-domain check.
  // A domain with today activity is also weekActive (the windows nest).
  const today: Record<"school" | "therapy" | "medical", number> = {
    school: 0, therapy: 0, medical: 0,
  };
  const recent: Record<"school" | "therapy" | "medical", boolean> = {
    school: false, therapy: false, medical: false,
  };
  const weekActive: Record<"school" | "therapy" | "medical", boolean> = {
    school: false, therapy: false, medical: false,
  };
  for (const item of feed) {
    const cat = item.sourceCategory;
    if (cat !== "school" && cat !== "therapy" && cat !== "medical") continue;
    const t = new Date(item.occurredAt).getTime();
    if (t >= todayStartMs) {
      today[cat] += 1;
    } else if (t >= recentCutoffMs) {
      recent[cat] = true;
    }
    // Independent broader-window flag — captures today activity AND the
    // intermediate 3-7 day band that recent[] excludes.
    if (t >= weekCutoffMs) {
      weekActive[cat] = true;
    }
  }

  // Phase 15 — Cross-domain emission decision.
  // Walked in natural reading order (school → therapy → medical) so the
  // built sentence reads left-to-right in the sequence parents expect.
  // A domain qualifies when it's connected AND has any feed activity in
  // the 7-day window. We only emit when ≥2 domains qualify — single-
  // domain children get the existing Phase 13 behaviour unchanged.
  const readingOrder: Array<"school" | "therapy" | "medical"> =
    ["school", "therapy", "medical"];
  const crossDomainActive = readingOrder.filter((d) => {
    const connected =
      d === "school"  ? presence.school.connected  :
      d === "therapy" ? presence.therapy.connected :
                        presence.medical.connected;
    return connected && weekActive[d];
  });
  const emitCrossDomain = crossDomainActive.length >= 2;

  // 2. Cross-domain signal — inserted BEFORE per-domain signals so it earns
  // the slot when both would otherwise compete. Recurring categories stay
  // protected (the directive's explicit guarantee — Phase-15 must not crowd
  // them out). With 2 recurring + cross-domain we already hit the cap of 3
  // and per-domain signals fall away naturally via `slice(SIGNAL_CAP)`.
  if (emitCrossDomain) {
    out.push({
      kind: "cross_domain",
      label: buildCrossDomainLabel(crossDomainActive),
    });
  }

  // 3. Domain-recent signals (no items today, ≥1 within last 3 days) and
  // 4. Domain-today signals (≥1 item today) merge into a single ordered
  // emit step: for each domain in priority order, emit at most one chip.
  // Today wins over recent so the chip reflects the freshest signal.
  // therapy → medical → school: less-frequent domains read as more
  // meaningful when active.
  //
  // Phase-15 redundancy suppression: when the cross-domain signal already
  // says "school and therapy both have recent updates", a follow-up chip
  // saying "Therapy has a recent update" repeats the same fact. So
  // `domain_recent` is SKIPPED when cross-domain emits. `domain_today` is
  // KEPT because it adds freshness info (count + today vs recent) that
  // the cross-domain chip doesn't carry.
  const domainOrder: Array<"therapy" | "medical" | "school"> =
    ["therapy", "medical", "school"];
  for (const d of domainOrder) {
    const connected =
      d === "school"  ? presence.school.connected  :
      d === "therapy" ? presence.therapy.connected :
                        presence.medical.connected;
    if (!connected) continue;
    if (today[d] > 0) {
      const tooMany = today[d] > PULSE_HIGH_THRESHOLD;
      const label = tooMany
        ? `Several new from ${DOMAIN_LABEL[d]} today`
        : `${today[d]} new from ${DOMAIN_LABEL[d]} today`;
      out.push({ kind: "domain_today", label, domain: d });
    } else if (recent[d] && !emitCrossDomain) {
      out.push({
        kind: "domain_recent",
        label: `${DOMAIN_LABEL_CAPITAL[d]} has a recent update`,
        domain: d,
      });
    }
  }

  // 5. Phase 17 — Calm attention V1. After all activity-based emission,
  // optionally surface ONE quietness chip for a connected domain that has
  // had zero feed items in the 7-day window. Capped at one chip total
  // (even if multiple domains are quiet) so the strip never reads as a
  // list of absent domains — that would tip into anxiety territory.
  //
  // Priority within quietness mirrors the activity domainOrder
  // (therapy → medical → school): rarer-frequency domains read as more
  // meaningful when their quietness is named. A quiet "school" line is
  // unusual enough that it earns the slot if the other two are silent.
  //
  // Voice: factual presence-of-absence ("Therapy has been quiet lately"),
  // NEVER alarmist ("No therapy this week!"), NEVER actor-blaming ("Your
  // clinic hasn't shared anything"). The chip uses the same neutral
  // muted styling as the activity chips — same visual register, calm by
  // design regardless of polarity.
  //
  // Data-coverage caveat: the journey feed is capped at 15 newest items.
  // On rare busy-school weeks where school posts saturate the cap, a
  // therapy item from day 6 could be pushed off-feed and this helper
  // would emit a false-positive "quiet". Accepted v1 imperfection — the
  // alternative is fetching domain-specific activity counts, which is
  // out of scope for thin V1.
  let quietEmitted = false;
  for (const d of domainOrder) {
    if (quietEmitted) break;
    const connected =
      d === "school"  ? presence.school.connected  :
      d === "therapy" ? presence.therapy.connected :
                        presence.medical.connected;
    if (!connected) continue;
    if (today[d] === 0 && !weekActive[d]) {
      // Phase C V2 — Continuity Health softening. Previous wording
      // ("has been quiet lately") read as a binary absence claim that
      // could tip into low-grade concern. The V2 phrasing ("has been
      // quieter recently") is relative rather than absolute — it
      // describes an observation about pace without committing to
      // "nothing happening." No baseline math (that would require
      // history fetches we don't want); just calmer prose.
      out.push({
        kind: "domain_quiet",
        label: `${DOMAIN_LABEL_CAPITAL[d]} has been quieter recently`,
        domain: d,
      });
      quietEmitted = true;
    }
  }

  return out.slice(0, SIGNAL_CAP);
}

// ── Phase 14 — Timeline Compression V1 ──────────────────────────────────────
// Light temporal grouping for the Journey feed. As history grows from days
// to weeks to months, a flat chronological list becomes hard to scan. This
// helper buckets feed items into three calendar-anchored groups — today,
// earlier this week, older — so the dashboard can interleave quiet section
// labels between groups.
//
// Calendar week (Monday-start), NOT a rolling 7-day window:
//   • On Monday, "Earlier this week" is empty — only Today + Older render.
//   • On Friday, "Earlier this week" naturally holds Mon–Thu.
//   • On Sunday (end of ISO week), "Earlier this week" holds Mon–Sat.
// Rolling-7d would always populate "Earlier this week" but reads weird on
// Sundays ("Sunday morning's post is in this week, not today"). Calendar
// weeks match how parents talk about time.
//
// Locally-anchored boundaries — same model the Phase 13 signals use, so the
// two surfaces always agree on what "today" means. A 23:00 post never crosses
// into "tomorrow" until the parent's clock does.
//
// Stable insertion order: the feed arrives newest-first; this helper
// preserves that order inside each bucket so individual rows still read
// top-to-bottom newest-first.
//
// Pure function — no clock injection, no side effects. The dashboard derives
// it inline once per render alongside the existing filteredFeed.

export type FeedGroupKey = "today" | "thisWeek" | "older";

export interface FeedGroups {
  today:    ParentJourneyItem[];
  thisWeek: ParentJourneyItem[];
  older:    ParentJourneyItem[];
}

export function groupFeedByRecency(feed: ParentJourneyItem[]): FeedGroups {
  const now = new Date();
  const todayStartMs = new Date(
    now.getFullYear(), now.getMonth(), now.getDate(),
  ).getTime();
  // Monday-start. JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat.
  // Sunday → 6 days back (last week's Monday is 6 days ago).
  // Mon (1) → 0, Tue (2) → 1, ..., Sat (6) → 5.
  const day = now.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const weekStartMs = new Date(
    now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday,
  ).getTime();

  const out: FeedGroups = { today: [], thisWeek: [], older: [] };
  for (const item of feed) {
    const t = new Date(item.occurredAt).getTime();
    if (t >= todayStartMs)      out.today.push(item);
    else if (t >= weekStartMs)  out.thisWeek.push(item);
    else                        out.older.push(item);
  }
  return out;
}

// ── Priority cards ────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency", currency: "PHP", minimumFractionDigits: 0,
  }).format(n);
}

function fmtDateShort(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "short", month: "short", day: "numeric",
  });
}

const EVENT_CARD_LABELS: Partial<Record<string, string>> = {
  school_event: "School Event",
  class_event:  "Class Event",
  holiday:      "No Classes",
  deadline:     "Action Needed",
  meeting:      "Meeting",
  online_class: "Online Class",
};

interface PriorityCardsInput {
  events: UpcomingItem[];
  needs: NeedsAttentionCounts;
  /**
   * Phase 3B — most recent parent-visible therapist voice note within the
   * freshness window (see `VOICE_NOTE_SIGNAL_DAYS` in queries.ts). Null when
   * the child has no Care linkage, no recent shared note, or no Care deep-
   * link target available. Optional so older callers (tests, future
   * refactors) don't need to pass it.
   */
  voiceNote?: RecentVoiceNoteSignal | null;
  /**
   * Phase 3B — deep-link prefix for the voice-note card's `actionHref`.
   * When unset, the voice-note signal is suppressed entirely — a card that
   * can't open a parent-safe target is worse than no card.
   */
  careBaseUrl?: string | null;
  /**
   * Phase 3B — shared `child_profiles.id`. Required alongside `careBaseUrl`
   * to mint the voice-note deep-link. Absent → signal suppressed.
   */
  childProfileId?: string | null;
}

// Phase 3B — relative-time helper for the voice-note subtitle. Calm phrasing
// only: "today" / "yesterday" / "Nd ago". No clock icons, no "ago" timers.
function relativeDaysShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return "Shared today";
  if (days === 1) return "Shared yesterday";
  return `Shared ${days}d ago`;
}

type Candidate = {
  id: string;
  cardType: PriorityCardType;
  title: string;
  subtitle: string;
  detail?: string;
  actionHref: string;
  accentVariant: PriorityCardAccent;
  _p: number; // internal priority score — lower = more important
};

/**
 * Builds an ordered list of up to 2 priority cards from available data.
 * Returns an empty array when there is nothing meaningful to surface —
 * the caller should render a calm "all caught up" state in that case.
 *
 * Priority order (lowest _p wins):
 *  P10  — consent awaiting parent approval     (urgent_action)
 *  P20  — document requested from parent       (urgent_action)
 *  P25  — meeting happening TOMORROW           (upcoming_meeting)  [Phase 3B]
 *  P30  — meeting happening today              (upcoming_meeting)
 *  P31  — online class happening today         (upcoming_event)
 *  P35  — voice note from therapist (≤7d, Care-linkable) [Phase 3B]
 *  P40  — top upcoming event (class-first, fetchUpcomingEvents pre-sorts)
 *  P50  — outstanding billing balance          (balance_due) — only when >0
 *  P60  — second upcoming event                (upcoming_event)
 *  P70  — holiday / no-classes notice          (holiday)
 *
 * Billing is NOT shown when the balance is zero — no "all-clear" filler card.
 * Holidays never outrank child-specific or actionable items.
 *
 * Phase 3B — Lauris Parent Signal Layer
 *   Two cross-domain tiers added: P25 (meeting tomorrow) closes the spec's
 *   "meeting today or tomorrow" gap without a new query — it's pure derivation
 *   from the events array. P35 (voice note from therapist) brings the only
 *   genuinely missing parent-worthy signal across the school+therapy boundary
 *   that isn't already covered by the hero (Tier D35) or the journey feed.
 *   Both tiers sit below urgent_action (P10/P20) on purpose: consent and doc
 *   requests are PARENT ACTIONS; tomorrow's meeting and voice notes are
 *   informational nudges. The 2-card cap is preserved — calm by default.
 *   See queries.ts → fetchRecentParentVisibleVoiceNote for the RLS-safe
 *   single-row fetch that feeds this layer.
 */
export function getFeaturedParentCards({
  events,
  needs,
  voiceNote = null,
  careBaseUrl = null,
  childProfileId = null,
}: PriorityCardsInput): PriorityCard[] {
  const today = new Date().toISOString().split("T")[0];
  // Phase 3B — "tomorrow" is purely local-clock derived; no timezone library
  // needed. Matches the way `today` is computed above so day boundaries stay
  // consistent across the helper.
  const tomorrowDate = new Date(Date.now() + 86_400_000);
  const tomorrow =
    `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, "0")}-${String(tomorrowDate.getDate()).padStart(2, "0")}`;
  const candidates: Candidate[] = [];

  // P10 — consent awaiting parent approval (most urgent action)
  if (needs.docApprovalCount > 0) {
    candidates.push({
      id: "consent-pending",
      cardType: "urgent_action",
      title: "Consent Needed",
      subtitle: `${needs.docApprovalCount} consent${needs.docApprovalCount > 1 ? "s" : ""} awaiting your approval`,
      detail: "Tap to review",
      actionHref: "/parent/documents",
      accentVariant: "warning",
      _p: 10,
    });
  }

  // P20 — document requested from parent
  if (needs.docRequestCount > 0) {
    candidates.push({
      id: "doc-requested",
      cardType: "urgent_action",
      title: "Document Requested",
      subtitle: `${needs.docRequestCount} file${needs.docRequestCount > 1 ? "s" : ""} from school`,
      detail: "Tap to view",
      actionHref: "/parent/documents",
      accentVariant: "info",
      _p: 20,
    });
  }

  // P25 — meeting scheduled for tomorrow [Phase 3B]
  //   Closes the spec gap "meeting today OR tomorrow". Sits just below
  //   urgent_action and ABOVE today's meeting so the parent reading top-down
  //   sees consent → doc request → tomorrow heads-up → today's events. This
  //   is a derivation from already-fetched events; no new query was added.
  //   Wording stays calm: "Meeting Tomorrow", not "Reminder!" / "Don't miss!".
  const tomorrowMeeting = events.find(e => e.date === tomorrow && e.eventType === "meeting");
  if (tomorrowMeeting) {
    candidates.push({
      id: `meeting-tomorrow-${tomorrowMeeting.id}`,
      cardType: "upcoming_meeting",
      title: "Meeting Tomorrow",
      subtitle: tomorrowMeeting.title,
      detail: "Meeting",
      actionHref: "/parent/events",
      accentVariant: "purple",
      _p: 25,
    });
  }

  // P30 — meeting scheduled for today
  const todayMeeting = events.find(e => e.date === today && e.eventType === "meeting");
  if (todayMeeting) {
    candidates.push({
      id: `meeting-${todayMeeting.id}`,
      cardType: "upcoming_meeting",
      title: todayMeeting.title,
      subtitle: "Today",
      detail: "Meeting",
      actionHref: "/parent/events",
      accentVariant: "purple",
      _p: 30,
    });
  }

  // P31 — online class scheduled for today
  const todayOnline = events.find(e => e.date === today && e.eventType === "online_class");
  if (todayOnline) {
    candidates.push({
      id: `online-${todayOnline.id}`,
      cardType: "upcoming_event",
      title: todayOnline.title,
      subtitle: "Today",
      detail: "Online Class",
      actionHref: "/parent/events",
      accentVariant: "info",
      _p: 31,
    });
  }

  // P35 — voice note from therapist newly shared [Phase 3B]
  //   Surfaces only when:
  //     (a) the parent-safe RLS-protected query returned a row (Care-unlinked
  //         parents naturally get null — no card),
  //     (b) the note is inside the freshness window (see VOICE_NOTE_SIGNAL_DAYS
  //         in queries.ts — gate enforced at query time too),
  //     (c) a Care deep-link can be minted (careBaseUrl + childProfileId both
  //         present). Without a working target the card would be a dead-end.
  //     (d) [Phase 4B silence rule §7.1 + §8] no school urgent_action is
  //         pending. When the parent already has a consent or doc-request
  //         asking for action, the therapy voice-note signal DEFERS — it
  //         stays fully visible on Care `/parent/[childId]` (its owning
  //         surface) but does not compete for the same priority slot. See
  //         docs/CROSS_DOMAIN_ORCHESTRATION.md §7.1.
  //   Calm phrasing: "Voice Note from Therapist · Shared 2d ago". Purple
  //   accent visually echoes the therapy source-color used in the journey
  //   feed (CAT_STYLES.therapy on the dashboard). Action opens Care in a new
  //   tab — the parent's existing Care signed-URL flow takes over from there.
  //
  // Phase 3C — deep-link anchored at `#voice-notes` (the Care playback
  // section), NOT the Care page root. See docs/PARENT_CONTINUITY_SEMANTICS.md
  // §5.1 + §7 for the duplication-risk audit. Landing on Care's page root
  // showed the parent Care's hero + attention-strip echo of the same voice
  // note they just tapped, forcing them to scroll. The Care layout already
  // listens for hashchange and `scrollIntoView`-s the anchor, and the
  // `#voice-notes` div is rendered on Care's `/parent/[childId]` page.
  // Result: the tap lands the parent on the playback surface that owns
  // the entity.
  const hasSchoolUrgentAction =
    needs.docApprovalCount > 0 || needs.docRequestCount > 0;
  if (voiceNote && careBaseUrl && childProfileId && !hasSchoolUrgentAction) {
    const base = careBaseUrl.replace(/\/+$/, "");
    candidates.push({
      id: `voice-note-${voiceNote.id}`,
      cardType: "upcoming_event",
      title: "Voice Note from Therapist",
      subtitle: voiceNote.title?.trim() || relativeDaysShort(voiceNote.createdAt),
      detail: voiceNote.title?.trim() ? relativeDaysShort(voiceNote.createdAt) : undefined,
      actionHref: `${base}/parent/${childProfileId}#voice-notes`,
      accentVariant: "purple",
      _p: 35,
    });
  }

  // Filler events: exclude holidays and any today-schedule items already captured above
  const todayScheduledIds = new Set<string>([
    ...(todayMeeting ? [todayMeeting.id] : []),
    ...(todayOnline  ? [todayOnline.id]  : []),
  ]);
  const fillerEvents = events.filter(
    e => e.eventType !== "holiday" && !todayScheduledIds.has(e.id)
  );

  // P40 — top upcoming event (fetchUpcomingEvents already sorts class-specific first)
  if (fillerEvents[0]) {
    const ev = fillerEvents[0];
    candidates.push({
      id: `event-${ev.id}`,
      cardType: "upcoming_event",
      title: ev.title,
      subtitle: fmtDateShort(ev.date),
      detail: EVENT_CARD_LABELS[ev.eventType] ?? "Event",
      actionHref: "/parent/events",
      accentVariant: "info",
      _p: 40,
    });
  }

  // P50 — outstanding billing balance (only when there is something actually due)
  if (needs.billingCount > 0) {
    candidates.push({
      id: "billing-due",
      cardType: "balance_due",
      title: `${fmtCurrency(needs.billingTotal)} due`,
      subtitle: `${needs.billingCount} outstanding bill${needs.billingCount > 1 ? "s" : ""}`,
      actionHref: "/parent/billing",
      accentVariant: "warning",
      _p: 50,
    });
  }

  // P60 — second upcoming event
  if (fillerEvents[1]) {
    const ev = fillerEvents[1];
    candidates.push({
      id: `event2-${ev.id}`,
      cardType: "upcoming_event",
      title: ev.title,
      subtitle: fmtDateShort(ev.date),
      detail: EVENT_CARD_LABELS[ev.eventType] ?? "Event",
      actionHref: "/parent/events",
      accentVariant: "info",
      _p: 60,
    });
  }

  // P70 — holiday (lowest priority — never outranks actionable or child-specific items)
  const holiday = events.find(e => e.eventType === "holiday");
  if (holiday) {
    candidates.push({
      id: `holiday-${holiday.id}`,
      cardType: "holiday",
      title: holiday.title,
      subtitle: fmtDateShort(holiday.date),
      detail: "No Classes",
      actionHref: "/parent/events",
      accentVariant: "muted",
      _p: 70,
    });
  }

  candidates.sort((a, b) => a._p - b._p);

  return candidates.slice(0, 2).map((c): PriorityCard => ({
    id: c.id,
    cardType: c.cardType,
    title: c.title,
    subtitle: c.subtitle,
    detail: c.detail,
    actionHref: c.actionHref,
    accentVariant: c.accentVariant,
  }));
}
