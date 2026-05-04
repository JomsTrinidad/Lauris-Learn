"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/datepicker";
import { createOwnedChild, type NewChildInput } from "./queries";

interface Props {
  open: boolean;
  organizationId: string;
  organizationName: string;
  onClose: () => void;
  onCreated: (childProfileId: string) => void;
}

interface IdentifierDraft {
  id: string;
  identifierType: string;
  identifierValue: string;
  countryCode: string;
}

const SEX_OPTIONS = ["", "female", "male", "intersex", "other", "unspecified"] as const;

export function NewChildModal({
  open,
  organizationId,
  organizationName,
  onClose,
  onCreated,
}: Props) {
  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [sexAtBirth, setSexAtBirth] = useState("");
  const [primaryLanguage, setPrimaryLanguage] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [identifiers, setIdentifiers] = useState<IdentifierDraft[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDisplayName("");
    setLegalName("");
    setFirstName("");
    setMiddleName("");
    setLastName("");
    setPreferredName("");
    setDateOfBirth("");
    setSexAtBirth("");
    setPrimaryLanguage("");
    setCountryCode("");
    setIdentifiers([]);
    setError(null);
    setSubmitting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function addIdentifier() {
    setIdentifiers((rows) => [
      ...rows,
      {
        id: crypto.randomUUID(),
        identifierType: "",
        identifierValue: "",
        countryCode: "",
      },
    ]);
  }

  function patchIdentifier(id: string, patch: Partial<IdentifierDraft>) {
    setIdentifiers((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function removeIdentifier(id: string) {
    setIdentifiers((rows) => rows.filter((row) => row.id !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedDisplay = displayName.trim();
    if (!trimmedDisplay) {
      setError("Display name is required.");
      return;
    }

    const validIdentifiers = identifiers.filter(
      (id) => id.identifierType.trim() && id.identifierValue.trim(),
    );

    const input: NewChildInput = {
      displayName: trimmedDisplay,
      legalName: legalName || undefined,
      firstName: firstName || undefined,
      middleName: middleName || undefined,
      lastName: lastName || undefined,
      preferredName: preferredName || undefined,
      dateOfBirth: dateOfBirth || undefined,
      sexAtBirth: sexAtBirth || undefined,
      primaryLanguage: primaryLanguage || undefined,
      countryCode: countryCode || undefined,
      identifiers: validIdentifiers.map((id) => ({
        identifierType: id.identifierType.trim(),
        identifierValue: id.identifierValue.trim(),
        countryCode: id.countryCode.trim() || undefined,
      })),
    };

    setSubmitting(true);
    const result = await createOwnedChild(organizationId, input);
    setSubmitting(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    onCreated(result.childProfileId);
    reset();
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Child">
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm text-muted-foreground">
          New client profile for{" "}
          <span className="font-medium">{organizationName}</span>. This child
          will not be visible to any school.
        </p>

        {/* Display name */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Display name <span className="text-red-600">*</span>
          </label>
          <Input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How this child is referred to"
            required
            maxLength={200}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Required. Use a preferred or working name if a legal name isn't
            recorded yet.
          </p>
        </div>

        {/* Legal name fields */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Legal name (optional)
          </p>
          <Input
            type="text"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="Full legal name"
          />
          <div className="grid grid-cols-3 gap-2">
            <Input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First"
            />
            <Input
              type="text"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
              placeholder="Middle"
            />
            <Input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last"
            />
          </div>
          <Input
            type="text"
            value={preferredName}
            onChange={(e) => setPreferredName(e.target.value)}
            placeholder="Preferred name (nickname)"
          />
        </div>

        {/* Demographics */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Demographics (optional)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Date of birth
              </label>
              <DatePicker value={dateOfBirth} onChange={setDateOfBirth} />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Sex at birth
              </label>
              <select
                value={sexAtBirth}
                onChange={(e) => setSexAtBirth(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {SEX_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt || "—"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="text"
              value={primaryLanguage}
              onChange={(e) => setPrimaryLanguage(e.target.value)}
              placeholder="Primary language"
            />
            <Input
              type="text"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
              placeholder="Country (e.g. PH)"
              maxLength={3}
            />
          </div>
        </div>

        {/* Identifiers */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Identifiers (optional)
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addIdentifier}
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </Button>
          </div>
          {identifiers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Optional. Add LRN, passport, clinic case number, etc.
            </p>
          ) : (
            <div className="space-y-2">
              {identifiers.map((id) => (
                <div
                  key={id.id}
                  className="flex items-start gap-2 p-2 bg-muted/30 rounded-lg"
                >
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <Input
                      type="text"
                      value={id.identifierType}
                      onChange={(e) =>
                        patchIdentifier(id.id, {
                          identifierType: e.target.value,
                        })
                      }
                      placeholder="type (e.g. lrn)"
                    />
                    <Input
                      type="text"
                      value={id.identifierValue}
                      onChange={(e) =>
                        patchIdentifier(id.id, {
                          identifierValue: e.target.value,
                        })
                      }
                      placeholder="value"
                    />
                    <Input
                      type="text"
                      value={id.countryCode}
                      onChange={(e) =>
                        patchIdentifier(id.id, {
                          countryCode: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder="PH"
                      maxLength={3}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeIdentifier(id.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <ModalCancelButton />
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create child"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
