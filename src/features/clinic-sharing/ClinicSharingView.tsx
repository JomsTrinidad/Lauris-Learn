"use client";

/**
 * ClinicSharingView — central audit + entry point for school-side
 * clinic sharing. Mounts inside /documents as a 4th tab.
 *
 * Two sections:
 *   - Identity grants (child_profile_access_grants for the school org)
 *   - Document grants (document_organization_access_grants for the school)
 *
 * Each section: filter (active / all), "New share" button, table.
 */

import { useCallback, useEffect, useState } from "react";
import { Plus, Loader2, IdCard, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  getSchoolOrganizationId,
  listDocumentGrants,
  listIdentityGrants,
} from "./queries";
import { IdentityGrantsTable } from "./IdentityGrantsTable";
import { DocumentGrantsTable } from "./DocumentGrantsTable";
import { ShareIdentityWithClinicModal } from "./ShareIdentityWithClinicModal";
import { ShareDocumentWithClinicModal } from "./ShareDocumentWithClinicModal";
import { RevokeClinicGrantModal, type RevokeKind } from "./RevokeClinicGrantModal";
import type { DocumentGrantRow, IdentityGrantRow } from "./types";

interface Props {
  schoolId: string;
  userId: string;
}

type StatusFilter = "active" | "all";

export function ClinicSharingView({ schoolId, userId }: Props) {
  const [schoolOrgId, setSchoolOrgId] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [identityGrants, setIdentityGrants] = useState<IdentityGrantRow[]>([]);
  const [documentGrants, setDocumentGrants] = useState<DocumentGrantRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [identityFilter, setIdentityFilter] = useState<StatusFilter>("active");
  const [docFilter, setDocFilter] = useState<StatusFilter>("active");

  const [shareIdentityOpen, setShareIdentityOpen] = useState(false);
  const [shareDocOpen, setShareDocOpen] = useState(false);

  const [revokeKind, setRevokeKind] = useState<RevokeKind | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeSummary, setRevokeSummary] = useState("");

  // Resolve school's shadow org once.
  useEffect(() => {
    let cancelled = false;
    setOrgLoading(true);
    getSchoolOrganizationId(schoolId).then((id) => {
      if (cancelled) return;
      if (!id) {
        setOrgError(
          "Couldn't resolve your school's organization record. Please reload, or contact support if this persists.",
        );
      } else {
        setSchoolOrgId(id);
      }
      setOrgLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  const reload = useCallback(async () => {
    if (!schoolOrgId) return;
    setLoading(true);
    const [ig, dg] = await Promise.all([
      listIdentityGrants({ schoolId, schoolOrganizationId: schoolOrgId }),
      listDocumentGrants({ schoolId }),
    ]);
    setIdentityGrants(ig);
    setDocumentGrants(dg);
    setLoading(false);
  }, [schoolId, schoolOrgId]);

  useEffect(() => {
    if (schoolOrgId) void reload();
  }, [schoolOrgId, reload]);

  function applyFilter<T extends { status: string; validUntil: string }>(
    rows: T[],
    f: StatusFilter,
  ): T[] {
    if (f === "all") return rows;
    return rows.filter((g) => {
      if (g.status !== "active") return false;
      try {
        return new Date(g.validUntil).getTime() > Date.now();
      } catch {
        return true;
      }
    });
  }

  function startIdentityRevoke(g: IdentityGrantRow) {
    setRevokeKind("identity");
    setRevokeId(g.id);
    setRevokeSummary(
      `${g.targetOrganizationName ?? "Clinic"} — ${g.studentName ?? g.childDisplayName ?? "Child"}`,
    );
  }

  function startDocumentRevoke(g: DocumentGrantRow) {
    setRevokeKind("document");
    setRevokeId(g.id);
    setRevokeSummary(
      `${g.targetOrganizationName ?? "Clinic"} — ${g.documentTitle ?? "Document"}`,
    );
  }

  if (orgError) return <ErrorAlert message={orgError} />;
  if (orgLoading || !schoolOrgId) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Identity grants */}
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <IdCard className="w-4 h-4" />
              Identity grants
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Authorise a clinic or medical practice to view a child&apos;s
              identity record.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FilterToggle value={identityFilter} onChange={setIdentityFilter} />
            <Button type="button" size="sm" onClick={() => setShareIdentityOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              New identity share
            </Button>
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : (
          <IdentityGrantsTable
            grants={applyFilter(identityGrants, identityFilter)}
            onRevoke={startIdentityRevoke}
          />
        )}
      </section>

      {/* Document grants */}
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Document grants
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Share a specific document with a clinic or medical practice.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FilterToggle value={docFilter} onChange={setDocFilter} />
            <Button type="button" size="sm" onClick={() => setShareDocOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              New document share
            </Button>
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : (
          <DocumentGrantsTable
            grants={applyFilter(documentGrants, docFilter)}
            onRevoke={startDocumentRevoke}
          />
        )}
      </section>

      <ShareIdentityWithClinicModal
        open={shareIdentityOpen}
        schoolId={schoolId}
        schoolOrganizationId={schoolOrgId}
        userId={userId}
        onClose={() => setShareIdentityOpen(false)}
        onShared={() => {
          setShareIdentityOpen(false);
          void reload();
        }}
      />
      <ShareDocumentWithClinicModal
        open={shareDocOpen}
        schoolId={schoolId}
        userId={userId}
        onClose={() => setShareDocOpen(false)}
        onShared={() => {
          setShareDocOpen(false);
          void reload();
        }}
      />
      <RevokeClinicGrantModal
        open={!!revokeKind}
        kind={revokeKind ?? "identity"}
        grantId={revokeId}
        summary={revokeSummary}
        userId={userId}
        onClose={() => {
          setRevokeKind(null);
          setRevokeId(null);
        }}
        onRevoked={() => {
          setRevokeKind(null);
          setRevokeId(null);
          void reload();
        }}
      />
    </div>
  );
}

function FilterToggle({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
      {(["active", "all"] as StatusFilter[]).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "px-2.5 py-1 transition-colors",
            value === opt
              ? "bg-primary text-white"
              : "bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {opt === "active" ? "Active" : "All"}
        </button>
      ))}
    </div>
  );
}

function Loading() {
  return (
    <div className="py-8 flex justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}
