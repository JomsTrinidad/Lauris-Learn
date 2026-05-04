"use client";

import { useEffect, useState } from "react";
import { Users, Plus } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { useCareContext } from "@/features/care/CareContext";
import { listCareChildren } from "@/features/care/queries";
import { ChildrenList } from "@/features/care/ChildrenList";
import { NewChildModal } from "@/features/care/NewChildModal";
import type { CareChildRow } from "@/features/care/types";

export default function CareChildrenPage() {
  const {
    activeOrganizationId,
    activeOrganizationName,
    isClinicAdmin,
  } = useCareContext();

  const [children, setChildren] = useState<CareChildRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    if (!activeOrganizationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listCareChildren(activeOrganizationId).then((rows) => {
      if (cancelled) return;
      setChildren(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeOrganizationId]);

  function reload() {
    if (!activeOrganizationId) return;
    setLoading(true);
    listCareChildren(activeOrganizationId).then((rows) => {
      setChildren(rows);
      setLoading(false);
    });
  }

  if (!activeOrganizationId) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Users className="w-5 h-5" />
            Children
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Clinic clients owned by{" "}
            <span className="font-medium">{activeOrganizationName}</span>, plus
            children shared by schools.
          </p>
        </div>
        {isClinicAdmin && (
          <Button type="button" onClick={() => setNewOpen(true)}>
            <Plus className="w-4 h-4" />
            New child
          </Button>
        )}
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <Spinner />
        </div>
      ) : (
        <ChildrenList children={children} />
      )}

      {isClinicAdmin && (
        <NewChildModal
          open={newOpen}
          organizationId={activeOrganizationId}
          organizationName={activeOrganizationName}
          onClose={() => setNewOpen(false)}
          onCreated={() => {
            setNewOpen(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
