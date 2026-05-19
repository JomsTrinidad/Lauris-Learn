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
 *  P10  — consent awaiting parent approval    (urgent_action)
 *  P20  — document requested from parent      (urgent_action)
 *  P30  — meeting happening today             (upcoming_meeting)
 *  P31  — online class happening today        (upcoming_event)
 *  P40  — top upcoming event (class-first, fetchUpcomingEvents pre-sorts)
 *  P50  — outstanding billing balance         (balance_due) — only when >0
 *  P60  — second upcoming event               (upcoming_event)
 *  P70  — holiday / no-classes notice         (holiday)
 *
 * Billing is NOT shown when the balance is zero — no "all-clear" filler card.
 * Holidays never outrank child-specific or actionable items.
 */
export function getFeaturedParentCards({ events, needs }: PriorityCardsInput): PriorityCard[] {
  const today = new Date().toISOString().split("T")[0];
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
