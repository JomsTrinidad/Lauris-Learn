"use client";

/**
 * Phase 11 — Quiet Parent Resonance.
 *
 * localStorage-only parent resonance for proud moments. The parent picks a
 * preset phrase ("We noticed this at home too.", "We're practicing this at
 * home.", etc.) attached to a specific proud_moment. The phrase persists
 * locally and renders as a quiet chip below the moment.
 *
 * Architectural contract:
 *   - localStorage ONLY in v1 — no backend, no schema, no RLS, no RPC.
 *   - Teachers do NOT see parent resonance in v1. Privacy by architecture.
 *   - No notifications, no badges, no counters, no thread.
 *   - One phrase per (parent device, child, moment).
 *   - Free-text composition is NOT supported — preset phrases only.
 *
 * Voice contract:
 *   Phrases are OBSERVATIONAL ECHOES from home — short reflections, not
 *   replies, not celebrations, not engagement. The emotional tone is
 *   "this stayed with us" not "I responded to content."
 *
 * Storage key shape:
 *   parent-resonance:{childId}:{momentId}  →  phrase string
 */

import { useEffect, useState } from "react";

function resonanceKey(childId: string, momentId: string): string {
  return `parent-resonance:${childId}:${momentId}`;
}

/**
 * Returns the parent's resonance phrase for a specific proud_moment, plus
 * setters. SSR-safe — hydrates on mount via useEffect.
 *
 * `hydrated` is true once the initial localStorage read has completed.
 * Callers should render nothing until hydrated to avoid flicker.
 */
export function useResonance(childId: string | null, momentId: string | null) {
  const [phrase, setPhraseState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!childId || !momentId || typeof window === "undefined") {
      setHydrated(true);
      return;
    }
    try {
      const stored = window.localStorage.getItem(resonanceKey(childId, momentId));
      setPhraseState(stored);
    } catch {
      // localStorage unavailable (private browsing edge) — no-op. Resonance
      // simply won't persist this session, which is acceptable.
    }
    setHydrated(true);
  }, [childId, momentId]);

  function setPhrase(next: string | null) {
    setPhraseState(next);
    if (!childId || !momentId || typeof window === "undefined") return;
    try {
      if (next === null) {
        window.localStorage.removeItem(resonanceKey(childId, momentId));
      } else {
        window.localStorage.setItem(resonanceKey(childId, momentId), next);
      }
    } catch {
      // Silent — write failure means resonance won't persist; UX still works.
    }
  }

  return { phrase, setPhrase, hydrated };
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
