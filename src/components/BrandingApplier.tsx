"use client";
import { useEffect } from "react";
import type { BrandingConfig } from "@/contexts/SchoolContext";

const DEFAULTS = {
  primary:   "#4a90e2",
  secondary: "#81c784",
} as const;

interface Props {
  branding: Pick<BrandingConfig, "primaryColor" | "accentColor" | "textSizeScale" | "spacingScale">;
}

/**
 * Injects per-school CSS variable overrides and accessibility classes onto
 * <html> at runtime. No DOM beyond document.documentElement is touched.
 * Uses no cleanup so the last-applied values persist through context reloads
 * and avoid a flash back to app defaults during SchoolContext refresh cycles.
 */
export function BrandingApplier({ branding }: Props) {
  const { primaryColor, accentColor, textSizeScale, spacingScale } = branding;

  useEffect(() => {
    const root = document.documentElement;

    // ── Colors ──────────────────────────────────────────────────────────────
    // Primary drives buttons, active states, links, sidebar highlights, ring.
    const primary = primaryColor || DEFAULTS.primary;
    root.style.setProperty("--primary",         primary);
    root.style.setProperty("--ring",            primary);
    root.style.setProperty("--sidebar-primary", primary);

    // Accent / secondary drives badge highlights and secondary actions.
    root.style.setProperty("--secondary", accentColor || DEFAULTS.secondary);

    // ── Text size scale ──────────────────────────────────────────────────────
    root.classList.remove("text-scale-large", "text-scale-extra-large");
    if (textSizeScale === "large")       root.classList.add("text-scale-large");
    if (textSizeScale === "extra_large") root.classList.add("text-scale-extra-large");

    // ── Spacing / line-height scale ──────────────────────────────────────────
    root.classList.remove("spacing-compact", "spacing-relaxed");
    if (spacingScale === "compact") root.classList.add("spacing-compact");
    if (spacingScale === "relaxed") root.classList.add("spacing-relaxed");
  }, [primaryColor, accentColor, textSizeScale, spacingScale]);

  return null;
}
