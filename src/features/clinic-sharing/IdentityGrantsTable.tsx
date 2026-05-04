"use client";

import { format } from "date-fns";
import { Ban, Building2, IdCard, ShieldCheck, Stethoscope, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { IdentityGrantRow } from "./types";

interface Props {
  grants: IdentityGrantRow[];
  onRevoke: (grant: IdentityGrantRow) => void;
}

function isActive(g: IdentityGrantRow, now: number): boolean {
  if (g.status !== "active") return false;
  try {
    return new Date(g.validUntil).getTime() > now;
  } catch {
    return true;
  }
}

export function IdentityGrantsTable({ grants, onRevoke }: Props) {
  const now = Date.now();
  const active = grants.filter((g) => isActive(g, now));
  const inactive = grants.filter((g) => !isActive(g, now));

  if (grants.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <ShieldCheck className="w-8 h-8 mx-auto opacity-30 mb-2" />
          <p className="text-sm font-medium">No identity grants yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Click <span className="font-medium">New identity share</span> to
            authorise a clinic to view a child&apos;s identity.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-1">
            Active ({active.length})
          </p>
          <Table grants={active} active onRevoke={onRevoke} />
        </div>
      )}
      {inactive.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-1">
            No longer active ({inactive.length})
          </p>
          <Table grants={inactive} active={false} onRevoke={onRevoke} />
        </div>
      )}
    </div>
  );
}

function Table({
  grants,
  active,
  onRevoke,
}: {
  grants: IdentityGrantRow[];
  active: boolean;
  onRevoke: (g: IdentityGrantRow) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Child</th>
              <th className="text-left px-3 py-2 font-medium">Clinic</th>
              <th className="text-left px-3 py-2 font-medium">Scope</th>
              <th className="text-left px-3 py-2 font-medium">Expires</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              {active && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {grants.map((g) => (
              <tr key={g.id} className={!active ? "opacity-70" : undefined}>
                <td className="px-3 py-2">
                  <p className="font-medium">{g.studentName ?? g.childDisplayName ?? "—"}</p>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-start gap-1.5">
                    <KindIcon kind={g.targetOrganizationKind} />
                    <span>{g.targetOrganizationName ?? "—"}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <ScopeBadge scope={g.scope} />
                </td>
                <td className="px-3 py-2">
                  <span className="text-xs">
                    {fmt(g.validUntil)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={g.status} validUntil={g.validUntil} />
                  {!active && g.revokeReason && (
                    <p className="text-xs text-muted-foreground mt-1">{g.revokeReason}</p>
                  )}
                </td>
                {active && (
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRevoke(g)}
                    >
                      <Ban className="w-3.5 h-3.5 mr-1" />
                      Revoke
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function KindIcon({ kind }: { kind: IdentityGrantRow["targetOrganizationKind"] }) {
  if (kind === "medical_practice")
    return <Stethoscope className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />;
  return <Building2 className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />;
}

function ScopeBadge({ scope }: { scope: IdentityGrantRow["scope"] }) {
  if (scope === "identity_with_identifiers") {
    return (
      <Badge variant="planned" className="gap-1">
        <IdCard className="w-3 h-3" />
        Identity + IDs
      </Badge>
    );
  }
  return (
    <Badge variant="planned" className="gap-1">
      <ShieldCheck className="w-3 h-3" />
      Identity only
    </Badge>
  );
}

function StatusBadge({
  status,
  validUntil,
}: {
  status: IdentityGrantRow["status"];
  validUntil: string;
}) {
  if (status === "revoked") {
    return (
      <Badge variant="revoked" className="gap-1">
        <RotateCcw className="w-3 h-3" />
        Revoked
      </Badge>
    );
  }
  if (status === "expired") return <Badge variant="archived">Expired</Badge>;
  // status = active — check effective expiry
  try {
    if (new Date(validUntil).getTime() <= Date.now()) {
      return <Badge variant="archived">Expired</Badge>;
    }
  } catch {
    /* ignore */
  }
  return <Badge variant="active">Active</Badge>;
}

function fmt(iso: string): string {
  try {
    return format(new Date(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
}
