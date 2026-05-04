"use client";

import { Calendar } from "lucide-react";
import { useCareContext } from "@/features/care/CareContext";
import { SessionsView } from "@/features/care/SessionsView";

export default function CareSessionsPage() {
  const { activeOrganizationId, activeOrganizationName, userId } =
    useCareContext();
  if (!activeOrganizationId) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Sessions
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Therapy sessions for{" "}
          <span className="font-medium">{activeOrganizationName}</span>. Click a
          row to edit status or notes.
        </p>
      </div>

      <SessionsView
        organizationId={activeOrganizationId}
        callerProfileId={userId ?? null}
      />
    </div>
  );
}
