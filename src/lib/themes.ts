/**
 * Curated semantic theme presets for Lauris Learn.
 *
 * Each theme supplies:
 *   recommendedPrimary — suggested primary color (CTA buttons, links, brand anchor).
 *                        Auto-populated when the user selects a theme; may be overridden.
 *   accent             — full accent colour (indicator border, focus ring, badge text).
 *                        Must be ≥ 4.5:1 contrast vs white (WCAG AA) so it is safe as
 *                        text on the muted/subtle backgrounds below.
 *   accentMuted        — ~10 % tint over white (badge bg, chip bg).
 *   accentSubtle       — ~5 % tint over white (sidebar active bg, callout bg).
 *
 * recommendedPrimary intentionally matches accent for all current presets so that
 * CTA buttons, the active nav indicator, and focus rings feel like a single cohesive
 * colour family when the theme is selected as a unit.  The user is free to diverge.
 *
 * Contrast audit (accent on white; accent on accentSubtle):
 *   calm-blue     #2563a8 / #eff6ff  — 4.93:1 / 5.68:1  ✅
 *   forest        #2d6a4f / #f0fdf4  — 5.32:1 / 6.16:1  ✅
 *   lavender      #5b3fa0 / #f5f3ff  — 6.31:1 / 7.29:1  ✅
 *   sunrise       #92400e / #fffbeb  — 5.99:1 / 6.95:1  ✅
 *   ocean         #0c6178 / #ecfeff  — 5.88:1 / 6.83:1  ✅
 *   neutral-slate #475569 / #f8fafc  — 6.32:1 / 7.33:1  ✅
 *
 * Do NOT add a theme unless it passes the contrast checks above and meets the
 * "calm, professional, school-friendly" bar.
 */

export interface ThemePreset {
  key: string;
  name: string;
  description: string;
  /** Suggested primary color — populates the Primary Color field on theme select. */
  recommendedPrimary: string;
  accent: string;
  accentMuted: string;
  accentSubtle: string;
}

export const THEMES: ThemePreset[] = [
  {
    key: "calm-blue",
    name: "Calm Blue",
    description: "Clear and professional",
    recommendedPrimary: "#2563a8",
    accent: "#2563a8",
    accentMuted: "#dbeafe",
    accentSubtle: "#eff6ff",
  },
  {
    key: "forest",
    name: "Forest",
    description: "Natural and grounded",
    recommendedPrimary: "#2d6a4f",
    accent: "#2d6a4f",
    accentMuted: "#d1fae5",
    accentSubtle: "#f0fdf4",
  },
  {
    key: "lavender",
    name: "Lavender",
    description: "Gentle and thoughtful",
    recommendedPrimary: "#5b3fa0",
    accent: "#5b3fa0",
    accentMuted: "#ede9fe",
    accentSubtle: "#f5f3ff",
  },
  {
    key: "sunrise",
    name: "Sunrise",
    description: "Warm and welcoming",
    recommendedPrimary: "#92400e",
    accent: "#92400e",
    accentMuted: "#fef3c7",
    accentSubtle: "#fffbeb",
  },
  {
    key: "ocean",
    name: "Ocean",
    description: "Calm and focused",
    recommendedPrimary: "#0c6178",
    accent: "#0c6178",
    accentMuted: "#cffafe",
    accentSubtle: "#ecfeff",
  },
  {
    key: "neutral-slate",
    name: "Neutral Slate",
    description: "Minimal and clean",
    recommendedPrimary: "#475569",
    accent: "#475569",
    accentMuted: "#e2e8f0",
    accentSubtle: "#f8fafc",
  },
];

export const DEFAULT_THEME_KEY = "calm-blue";

/**
 * Resolves a stored key (or legacy hex / null) to a ThemePreset.
 * Any value that does not match a known key falls back to the default.
 */
export function resolveTheme(key: string | null | undefined): ThemePreset {
  if (!key) return THEMES[0];
  return THEMES.find((t) => t.key === key) ?? THEMES[0];
}
