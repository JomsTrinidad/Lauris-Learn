"use client";

import Link from "next/link";
import { Users, ChevronRight, ShieldCheck, IdCard, Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CareChildRow } from "./types";

interface ChildrenListProps {
  children: CareChildRow[];
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function ChildrenList({ children }: ChildrenListProps) {
  if (children.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Users className="w-10 h-10 mx-auto opacity-30 mb-3" />
        <p className="font-medium">No children yet.</p>
        <p className="text-sm text-muted-foreground mt-1">
          Create a new client profile, or wait for a school to share a child
          with your organization.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-border">
        {children.map((child) => {
          const expiresIn =
            child.originType === "shared" && child.grantValidUntil
              ? daysUntil(child.grantValidUntil)
              : null;
          const expiringSoon =
            expiresIn !== null && expiresIn >= 0 && expiresIn <= 14;

          return (
            <Link
              key={child.childProfileId}
              href={`/care/children/${child.childProfileId}`}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  {child.displayName}
                  {child.preferredName &&
                    child.preferredName !== child.displayName && (
                      <span className="text-muted-foreground ml-1">
                        ("{child.preferredName}")
                      </span>
                    )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  DOB {formatDate(child.dateOfBirth)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {child.originType === "owned" ? (
                  <Badge variant="active" className="gap-1">
                    <Building2 className="w-3 h-3" />
                    Clinic client
                  </Badge>
                ) : child.scope === "identity_with_identifiers" ? (
                  <Badge variant="planned" className="gap-1">
                    <IdCard className="w-3 h-3" />
                    Shared · Identity + IDs
                  </Badge>
                ) : (
                  <Badge variant="planned" className="gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Shared · Identity
                  </Badge>
                )}
                {expiringSoon && (
                  <span className="text-xs text-amber-600 font-medium">
                    {expiresIn! <= 0 ? "Expires today" : `Expires in ${expiresIn}d`}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
