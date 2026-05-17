/**
 * Role-aware sidebar footer label.
 *
 * Centralized so the dashboard sidebar and the super-admin standalone shell
 * stay in sync. Returns the contextual label shown at the bottom of the
 * sidebar — replaces the legacy "Lauris Learn v0.2" string.
 *
 * Demo environments win over role so internal/sales test schools are always
 * marked, even when a teacher or admin is signed in.
 */
export type SidebarFooterRole =
  | "super_admin"
  | "school_admin"
  | "teacher"
  | "parent"
  | null
  | undefined;

interface SidebarFooterArgs {
  userRole?: SidebarFooterRole;
  isDemo?: boolean;
  /** Optional school-year label, e.g. "SY 2026–2027". Already available in the sidebar — no new query is issued for it. */
  schoolYear?: string;
}

const SEP = " · ";

export function getSidebarFooterLabel({
  userRole,
  isDemo,
  schoolYear,
}: SidebarFooterArgs): string {
  if (isDemo) {
    return schoolYear ? `Demo Environment${SEP}${schoolYear}` : "Demo Environment";
  }

  switch (userRole) {
    case "super_admin":
      return "Platform Administration";
    case "school_admin":
      return schoolYear ? `School Administration${SEP}${schoolYear}` : "School Administration";
    case "teacher":
      return schoolYear ? `Teacher Workspace${SEP}${schoolYear}` : "Teacher Workspace";
    case "parent":
      return "Parent Portal";
    default:
      return "Lauris Learn";
  }
}
