"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Lock,
  IdCard,
  ShieldCheck,
  FileText,
  Building2,
  Pencil,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { SharedDocumentsList } from "./SharedDocumentsList";
import { EditChildModal } from "./EditChildModal";
import { ManageIdentifiersModal } from "./ManageIdentifiersModal";
import { ClinicDocumentsList } from "./ClinicDocumentsList";
import { UploadClinicDocumentModal } from "./UploadClinicDocumentModal";
import type {
  CareChildRow,
  ChildIdentifier,
  ChildIdentity,
  ClinicDocument,
  SharedDocument,
} from "./types";

interface Props {
  identity: ChildIdentity;
  identifiers: ChildIdentifier[];
  origin: CareChildRow;
  documents: SharedDocument[];
  /** Phase 6C — clinic-internal documents for owned children. Empty
   *  array for shared children. */
  clinicDocuments?: ClinicDocument[];
  /** Phase 6B.1 — when true (clinic_admin of the owning org) the Edit
   *  and Manage Identifiers buttons are shown for owned children. */
  canEdit?: boolean;
  /** Phase 6C — clinic_admin of the owning org. Gates the Upload Document
   *  button + per-row admin actions on the clinic documents list. */
  isClinicAdmin?: boolean;
  /** Phase 6C — caller's profile id; passed to UploadClinicDocumentModal. */
  uploaderProfileId?: string;
  /** Phase 6C — origin org id for the upload payload. Caller should pass
   *  the active CareContext organization id when origin.originType ===
   *  'owned'. */
  originOrganizationId?: string;
  /** Called after a successful edit so the parent page can refetch. */
  onChanged?: () => void;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm mt-0.5">{value ?? "—"}</p>
    </div>
  );
}

export function ChildDetailView({
  identity,
  identifiers,
  origin,
  documents,
  clinicDocuments = [],
  canEdit = false,
  isClinicAdmin = false,
  uploaderProfileId,
  originOrganizationId,
  onChanged,
}: Props) {
  const isOwned = origin.originType === "owned";
  // For shared children, identifiers visibility depends on grant scope.
  // For owned children, the owning clinic always sees identifiers (the
  // ownership helper covers both child_profiles and child_identifiers).
  const showIdentifiers =
    isOwned || origin.scope === "identity_with_identifiers";

  const showEditControls = canEdit && isOwned;

  const [editOpen, setEditOpen] = useState(false);
  const [identifiersOpen, setIdentifiersOpen] = useState(false);
  const [uploadClinicDocOpen, setUploadClinicDocOpen] = useState(false);

  const showClinicDocsBlock = isOwned;
  const canUploadClinicDoc =
    isOwned && isClinicAdmin && !!uploaderProfileId && !!originOrganizationId;

  function handleSaved() {
    setEditOpen(false);
    onChanged?.();
  }

  function handleIdentifiersChanged() {
    onChanged?.();
  }

  return (
    <div className="space-y-4">
      <Link
        href="/care/children"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to children
      </Link>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">{identity.displayName}</h1>
              {identity.preferredName &&
                identity.preferredName !== identity.displayName && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Preferred: {identity.preferredName}
                  </p>
                )}
              {showEditControls && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </Button>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {isOwned ? (
                <Badge variant="active" className="gap-1">
                  <Building2 className="w-3 h-3" />
                  Clinic client
                </Badge>
              ) : showIdentifiers ? (
                <Badge variant="planned" className="gap-1">
                  <IdCard className="w-3 h-3" />
                  Shared · Identity + IDs
                </Badge>
              ) : (
                <Badge variant="planned" className="gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Shared · Identity only
                </Badge>
              )}
              {!isOwned && origin.grantValidUntil && (
                <p className="text-xs text-muted-foreground">
                  Access until {formatDate(origin.grantValidUntil)}
                </p>
              )}
              {isOwned && (
                <p className="text-xs text-muted-foreground">
                  Owned by your organization
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Legal name" value={identity.legalName} />
            <Field label="Date of birth" value={formatDate(identity.dateOfBirth)} />
            <Field label="Sex at birth" value={identity.sexAtBirth} />
            <Field label="Gender identity" value={identity.genderIdentity} />
            <Field label="Primary language" value={identity.primaryLanguage} />
            <Field label="Country" value={identity.countryCode} />
          </div>
        </CardContent>
      </Card>

      {/* Identifiers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold flex items-center gap-2">
              <IdCard className="w-4 h-4" />
              Identifiers
            </h2>
            {showEditControls && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setIdentifiersOpen(true)}
              >
                <Pencil className="w-3.5 h-3.5" />
                Manage
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!showIdentifiers ? (
            <div className="flex items-start gap-3 text-sm text-muted-foreground py-2">
              <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-foreground">
                  Identifier sharing not granted
                </p>
                <p className="mt-1">
                  This grant only authorises identity-level information. Ask
                  the originating school to issue a new grant with scope{" "}
                  <code className="text-xs">identity_with_identifiers</code> if
                  you need LRN, passport number, or other government IDs.
                </p>
              </div>
            </div>
          ) : identifiers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No identifiers on file for this child.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {identifiers.map((id) => (
                <li
                  key={id.id}
                  className="py-2 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {id.identifierType.replace(/_/g, " ")}
                      {id.countryCode && (
                        <span className="ml-1">({id.countryCode})</span>
                      )}
                    </p>
                    <p className="font-mono text-sm mt-0.5">
                      {id.identifierValue}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Documents — section depends on origin type. */}
      {showClinicDocsBlock ? (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2 px-1">
            <h2 className="font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Clinic documents
            </h2>
            {canUploadClinicDoc && (
              <Button
                type="button"
                size="sm"
                onClick={() => setUploadClinicDocOpen(true)}
              >
                <Upload className="w-3.5 h-3.5 mr-1" />
                Upload Document
              </Button>
            )}
          </div>
          <ClinicDocumentsList
            documents={clinicDocuments}
            isClinicAdmin={isClinicAdmin}
            onChanged={() => onChanged?.()}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <h2 className="font-semibold flex items-center gap-2 px-1">
            <FileText className="w-4 h-4" />
            Shared documents
          </h2>
          <SharedDocumentsList documents={documents} hideChildColumn />
        </div>
      )}

      {showEditControls && (
        <>
          <EditChildModal
            open={editOpen}
            identity={identity}
            onClose={() => setEditOpen(false)}
            onSaved={handleSaved}
          />
          <ManageIdentifiersModal
            open={identifiersOpen}
            childProfileId={identity.id}
            identifiers={identifiers}
            onClose={() => setIdentifiersOpen(false)}
            onChanged={handleIdentifiersChanged}
          />
        </>
      )}

      {canUploadClinicDoc && uploaderProfileId && originOrganizationId && (
        <UploadClinicDocumentModal
          open={uploadClinicDocOpen}
          originOrganizationId={originOrganizationId}
          childProfileId={identity.id}
          uploaderProfileId={uploaderProfileId}
          onClose={() => setUploadClinicDocOpen(false)}
          onUploaded={() => {
            setUploadClinicDocOpen(false);
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}
