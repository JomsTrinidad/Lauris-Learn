"use client";

/**
 * Phase 11 — Quiet Parent Resonance. (V2 — Journey Memory)
 *
 * localStorage-only parent resonance for proud moments. The parent picks a
 * preset phrase ("We noticed this at home too.", "We're practicing this at
 * home.", etc.) attached to a specific proud_moment. The phrase persists
 * locally and renders as a quiet chip below the moment.
 *
 * Architectural contract:
 *   - localStorage ONLY — no backend, no schema, no RLS, no RPC.
 *   - Teachers do NOT see parent resonance. Privacy by architecture.
 *   - No notifications, no badges, no counters, no thread.
 *   - One phrase per (parent device, child, moment).
 *   - Free-text composition is NOT supported — preset phrases only.
 *
 * Voice contract:
 *   Phrases are OBSERVATIONAL ECHOES from home — short reflections, not
 *   replies, not celebrations, not engagement. The emotional tone is
 *   "this stayed with us" not "I responded to content."
 *
 * V2 — Journey Memory:
 *   Storage shape now JSON `{ phrase, savedAt }`. The savedAt anchor lets
 *   the saved pill carry a temporal stamp ("· 6d") so the pill stops being
 *   a current-state toggle and becomes a remembered note. Legacy plain
 *   strings still parse — old saves render their phrase without a stamp,
 *   which is correct (we don't know when they were saved).
 *
 * Storage key shape:
 *   parent-resonance:{childId}:{momentId}  →  JSON  { phrase, savedAt }
 *                                          OR legacy plain phrase string
 */

import { useCallback, useEffect, useState } from "react";

function resonanceKey(childId: string, momentId: string): string {
  return `parent-resonance:${childId}:${momentId}`;
}

interface StoredResonance {
  phrase: string | null;
  savedAt: string | null;
}

/**
 * Reads either the V2 JSON `{phrase, savedAt}` shape OR the legacy bare
 * phrase string. Legacy saves return savedAt=null, which the UI gracefully
 * renders as a pill without the temporal stamp.
 */
function parseStoredResonance(raw: string | null): StoredResonance {
  if (raw === null) return { phrase: null, savedAt: null };
  // Try JSON shape first.
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed && typeof parsed === "object"
      && typeof parsed.phrase === "string"
    ) {
      return {
        phrase: parsed.phrase,
        savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : null,
      };
    }
  } catch {
    // Not JSON — fall through to legacy string handling.
  }
  // Legacy: raw IS the phrase string.
  return { phrase: raw, savedAt: null };
}

function serializeResonance(phrase: string): string {
  return JSON.stringify({ phrase, savedAt: new Date().toISOString() });
}

/**
 * Returns the parent's resonance phrase + savedAt anchor for a specific
 * proud_moment, plus setter. SSR-safe — hydrates on mount via useEffect.
 *
 * `hydrated` is true once the initial localStorage read has completed.
 * Callers should render nothing until hydrated to avoid flicker.
 *
 * V2: `savedAt` is null for legacy saves (pre-Phase-A) AND for fresh
 * saves until the next mount (the hook commits a fresh timestamp on every
 * write, so the second visit sees the anchor). This is intentional —
 * temporal anchors should describe the past, not the present moment.
 */
export function useResonance(childId: string | null, momentId: string | null) {
  const [state, setState] = useState<StoredResonance>({ phrase: null, savedAt: null });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!childId || !momentId || typeof window === "undefined") {
      setHydrated(true);
      return;
    }
    try {
      const stored = window.localStorage.getItem(resonanceKey(childId, momentId));
      setState(parseStoredResonance(stored));
    } catch {
      // localStorage unavailable (private browsing edge) — no-op. Resonance
      // simply won't persist this session, which is acceptable.
    }
    setHydrated(true);
  }, [childId, momentId]);

  const setPhrase = useCallback((next: string | null) => {
    if (next === null) {
      setState({ phrase: null, savedAt: null });
    } else {
      setState({ phrase: next, savedAt: new Date().toISOString() });
    }
    if (!childId || !momentId || typeof window === "undefined") return;
    try {
      if (next === null) {
        window.localStorage.removeItem(resonanceKey(childId, momentId));
      } else {
        window.localStorage.setItem(resonanceKey(childId, momentId), serializeResonance(next));
      }
    } catch {
      // Silent — write failure means resonance won't persist; UX still works.
    }
  }, [childId, momentId]);

  return { phrase: state.phrase, savedAt: state.savedAt, setPhrase, hydrated };
}

/**
 * Returns the 5 preset resonance phrases, with the child's first name
 * substituted where appropriate so phrases stay non-gendered. Falls back to
 * "Your child" when firstName is empty.
 *
 * Phrase voice: observational, modest, grounded. Never enthusiastic,
 * never effusive. Reflects "this stayed with us" energy, not "great job!"
 * energy.
 */
export function buildResonancePhrases(firstName: string): string[] {
  const name = firstName.trim() || "Your child";
  return [
    "We noticed this at home too.",
    `${name} talked about this at home.`,
    "We're practicing this at home.",
    "This has been helping.",
    `${name} was proud of this.`,
  ];
}
