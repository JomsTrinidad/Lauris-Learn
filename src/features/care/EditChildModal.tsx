"use client";

import { useState } from "react";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/datepicker";
import { updateOwnedChild, type UpdateOwnedChildPatch } from "./queries";
import type { ChildIdentity } from "./types";

interface Props {
  open: boolean;
  identity: ChildIdentity;
  onClose: () => void;
  onSaved: () => void;
}

const SEX_OPTIONS = ["", "female", "male", "intersex", "other", "unspecified"] as const;

export function EditChildModal({ open, identity, onClose, onSaved }: Props) {
  const [displayName, setDisplayName] = useState(identity.displayName);
  const [legalName, setLegalName] = useState(identity.legalName ?? "");
  const [firstName, setFirstName] = useState(identity.firstName ?? "");
  const [middleName, setMiddleName] = useState(identity.middleName ?? "");
  const [lastName, setLastName] = useState(identity.lastName ?? "");
  const [preferredName, setPreferredName] = useState(identity.preferredName ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(identity.dateOfBirth ?? "");
  const [sexAtBirth, setSexAtBirth] = useState(identity.sexAtBirth ?? "");
  const [genderIdentity, setGenderIdentity] = useState(identity.genderIdentity ?? "");
  const [primaryLanguage, setPrimaryLanguage] = useState(identity.primaryLanguage ?? "");
  const [countryCode, setCountryCode] = useState(identity.countryCode ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setError(null);
    setSubmitting(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedDisplay = displayName.trim();
    if (!trimmedDisplay) {
      setError("Display name is required.");
      return;
    }

    const norm = (s: string) => (s.trim() === "" ? null : s.trim());

    const patch: UpdateOwnedChildPatch = {
      displayName: trimmedDisplay,
      legalName: norm(legalName),
      firstName: norm(firstName),
      middleName: norm(middleName),
      lastName: norm(lastName),
      preferredName: norm(preferredName),
      dateOfBirth: dateOfBirth || null,
      sexAtBirth: norm(sexAtBirth),
      genderIdentity: norm(genderIdentity),
      primaryLanguage: norm(primaryLanguage),
      countryCode: norm(countryCode),
    };

    setSubmitting(true);
    const result = await updateOwnedChild(identity.id, patch);
    setSubmitting(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    onSaved();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Edit Child">
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Edit identity details for this child. Origin (which clinic owns
          this profile) cannot be changed.
        </p>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Display name <span className="text-red-600">*</span>
          </label>
          <Input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={200}
          />
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Legal name
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

        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Demographics
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
          <Input
            type="text"
            value={genderIdentity}
            onChange={(e) => setGenderIdentity(e.target.value)}
            placeholder="Gender identity (free text)"
          />
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

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <ModalCancelButton />
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
