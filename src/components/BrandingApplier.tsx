"use client";
import { useEffect } from "react";
import type { BrandingConfig } from "@/contexts/SchoolContext";
import { resolveTheme } from "@/lib/themes";

interface Props {
  branding: Pick<BrandingConfig, "primaryColor" | "themeKey" | "textSizeScale" | "spacingScale">;
}

/**
 * Injects per-school CSS variable overrides and accessibility classes onto
 * <html> at runtime. No DOM beyond document.documentElement is touched.
 * Uses no cleanup so the last-applied values persist through context reloads
 * and avoid a flash back to app defaults during SchoolContext refresh cycles.
 *
 * Token responsibilities:
 *   primaryColor → --primary, --sidebar-primary  (school brand anchor)
 *   themeKey     → --theme-accent, --theme-accent-muted,
 *                  --theme-accent-subtle, --theme-indicator
 *                  (--ring follows --theme-accent via CSS variable chain)
 */
export function BrandingApplier({ branding }: Props) {
  const { primaryColor, themeKey, textSizeScale, spacingScale } = branding;

  useEffect(() => {
    const root = document.documentElement;

    // ── Primary (school brand) ──────────────────────────────────────────────
    const primary = primaryColor ?? "#4a90e2";
    root.style.setProperty("--primary",         primary);
    root.style.setProperty("--sidebar-primary", primary);
    // Note: --ring is NOT set here; it inherits from --theme-accent via CSS.

    // ── Theme (semantic accent tokens) ─────────────────────────────────────
    const theme = resolveTheme(themeKey);
    root.style.setProperty("--theme-accent",        theme.accent);
    root.style.setProperty("--theme-accent-muted",  theme.accentMuted);
    root.style.setProperty("--theme-accent-subtle", theme.accentSubtle);
    root.style.setProperty("--theme-indicator",     theme.accent);

    // ── Text size scale ─────────────────────────────────────────────────────
    root.classList.remove("text-scale-large", "text-scale-extra-large");
    if (textSizeScale === "large")       root.classList.add("text-scale-large");
    if (textSizeScale === "extra_large") root.classList.add("text-scale-extra-large");

    // ── Spacing / line-height scale ─────────────────────────────────────────
    root.classList.remove("spacing-compact", "spacing-relaxed");
    if (spacingScale === "compact") root.classList.add("spacing-compact");
    if (spacingScale === "relaxed") root.classList.add("spacing-relaxed");
  }, [primaryColor, themeKey, textSizeScale, spacingScale]);

  return null;
}
