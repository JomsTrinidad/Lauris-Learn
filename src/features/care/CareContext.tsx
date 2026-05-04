"use client";

import { createContext, useContext } from "react";
import type { ClinicMembership } from "./types";

export interface CareContextValue {
  userId: string | null;
  userName: string;
  userEmail: string;
  memberships: ClinicMembership[];
  activeOrganizationId: string | null;
  activeOrganizationName: string;
  activeOrganizationKind: "clinic" | "medical_practice" | null;
  /** Role string of the caller's active membership in the active org.
   *  Used to gate clinic_admin-only UI (e.g. New Child button). */
  activeRole: string | null;
  isClinicAdmin: boolean;
  setActiveOrganizationId: (orgId: string) => void;
  loading: boolean;
}

export const CareContext = createContext<CareContextValue>({
  userId: null,
  userName: "",
  userEmail: "",
  memberships: [],
  activeOrganizationId: null,
  activeOrganizationName: "",
  activeOrganizationKind: null,
  activeRole: null,
  isClinicAdmin: false,
  setActiveOrganizationId: () => {},
  loading: true,
});

export function useCareContext() {
  return useContext(CareContext);
}
