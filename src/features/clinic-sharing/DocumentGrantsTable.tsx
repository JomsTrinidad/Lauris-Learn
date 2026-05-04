"use client";

import { format } from "date-fns";
import {
  Ban,
  Building2,
  Download,
  Eye,
  FileText,
  RotateCcw,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DocumentGrantRow } from "./types";

interface Props {
  grants: DocumentGrantRow[];
  onRevoke: (grant: DocumentGrantRow) => void;
}

function isActive(g: DocumentGrantRow, now: number): boolean {
  if (g.status !== "active") return false;
  try {
    return new Date(g.validUntil).getTime() > now;
  } catch {
    return true;
  }
}

export function DocumentGrantsTable({ grants, onRevoke }: Props) {
  const now = Date.now();
  const active = grants.filter((g) => isActive(g, now));
  const inactive = grants.filter((g) => !isActive(g, now));

  if (grants.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <FileText className="w-8 h-8 mx-auto opacity-30 mb-2" />
          <p className="text-sm font-medium">No document grants yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Click <span className="font-medium">New document share</span> to
            send a specific document to a clinic.
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
  grants: DocumentGrantRow[];
  active: boolean;
  onRevoke: (g: DocumentGrantRow) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Document</th>
              <th className="text-left px-3 py-2 font-medium">Student</th>
              <th className="text-left px-3 py-2 font-medium">Clinic</th>
              <th className="text-left px-3 py-2 font-medium">Permissions</th>
              <th className="text-left px-3 py-2 font-medium">Expires</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              {active && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {grants.map((g) => (
              <tr key={g.id} className={!active ? "opacity-70" : undefined}>
                <td className="px-3 py-2">
                  <p className="font-medium truncate max-w-[16rem]">
                    {g.documentTitle ?? "—"}
                  </p>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {g.studentName ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-start gap-1.5">
                    <KindIcon kind={g.targetOrganizationKind} />
                    <span>{g.targetOrganizationName ?? "—"}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Eye className="w-3 h-3" />
                    View
                    {g.permissions.download && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <Download className="w-3 h-3" />
                        Download
                      </>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs">{fmt(g.validUntil)}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={g.status} validUntil={g.validUntil} />
                  {!active && g.revokeReason && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {g.revokeReason}
                    </p>
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

function KindIcon({ kind }: { kind: DocumentGrantRow["targetOrganizationKind"] }) {
  if (kind === "medical_practice")
    return <Stethoscope className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />;
  return <Building2 className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />;
}

function StatusBadge({
  status,
  validUntil,
}: {
  status: DocumentGrantRow["status"];
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
