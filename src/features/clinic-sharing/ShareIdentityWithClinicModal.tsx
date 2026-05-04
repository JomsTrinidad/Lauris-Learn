"use client";

/**
 * ShareIdentityWithClinicModal — issues a child_profile_access_grants
 * row from the school's shadow org to a clinic / medical_practice org.
 *
 * Phase 6D scope:
 *   - Caller is school_admin.
 *   - Source = school's shadow organization (resolved automatically).
 *   - Target = clinic/medical_practice org (search-first picker).
 *   - Scope = identity_only OR identity_with_identifiers (radio).
 *   - Expiry presets 30/90/180/365 + custom.
 *   - Optional purpose textarea.
 *
 * Scope upgrade requires revoke-and-re-share; the column-guard trigger
 * keeps `scope` immutable post-insert. The 23505 partial-unique error
 * (one active grant per (child, target_org)) is mapped to a friendly
 * message client-side.
 */

import { useEffect, useMemo, useState } from "react";
import { Calendar, Loader2, ShieldCheck, IdCard, AlertTriangle } from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/datepicker";
import { cn } from "@/lib/utils";
import {
  createIdentityGrant,
  listSchoolStudentsForSharing,
} from "./queries";
import { ClinicOrganizationPicker } from "./ClinicOrganizationPicker";
import type {
  ClinicOrgOption,
  IdentityGrantScope,
  SchoolStudentForSharing,
} from "./types";

interface Props {
  open: boolean;
  schoolId: string;
  schoolOrganizationId: string;
  userId: string;
  /** When provided, the student picker is locked to this child profile
   *  (per-student entry point). Resolved on open. */
  lockedChildProfileId?: string | null;
  lockedStudentName?: string | null;
  onClose: () => void;
  onShared: () => void;
}

interface ExpiryPreset {
  days: number;
  label: string;
}

const PRESETS: ExpiryPreset[] = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "180 days" },
  { days: 365, label: "1 year" },
];

const DEFAULT_DAYS = 90;

export function ShareIdentityWithClinicModal({
  open,
  schoolId,
  schoolOrganizationId,
  userId,
  lockedChildProfileId,
  lockedStudentName,
  onClose,
  onShared,
}: Props) {
  const [students, setStudents] = useState<SchoolStudentForSharing[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [childProfileId, setChildProfileId] = useState<string>("");

  const [clinic, setClinic] = useState<ClinicOrgOption | null>(null);
  const [scope, setScope] = useState<IdentityGrantScope>("identity_only");
  const [presetDays, setPresetDays] = useState<number | "custom">(DEFAULT_DAYS);
  const [customDate, setCustomDate] = useState<string>("");
  const [purpose, setPurpose] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    setClinic(null);
    setScope("identity_only");
    setPresetDays(DEFAULT_DAYS);
    setCustomDate("");
    setPurpose("");
    if (lockedChildProfileId) {
      setChildProfileId(lockedChildProfileId);
      setStudents([]);
      return;
    }
    setChildProfileId("");
    let cancelled = false;
    setStudentsLoading(true);
    listSchoolStudentsForSharing(schoolId).then((rows) => {
      if (cancelled) return;
      setStudents(rows);
      setStudentsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, schoolId, lockedChildProfileId]);

  const resolvedExpiry = useMemo<{ iso: string; date: Date } | null>(() => {
    let target: Date | null = null;
    if (presetDays === "custom") {
      if (!customDate) return null;
      try {
        target = parseISO(customDate);
      } catch {
        return null;
      }
    } else {
      target = addDays(new Date(), presetDays);
    }
    if (!target || isNaN(target.getTime())) return null;
    target.setHours(23, 59, 59, 999);
    if (target.getTime() <= Date.now()) return null;
    return { iso: target.toISOString(), date: target };
  }, [presetDays, customDate]);

  const canSubmit =
    !!childProfileId &&
    !!clinic &&
    !!resolvedExpiry &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !clinic || !resolvedExpiry) return;
    setSubmitting(true);
    setError(null);
    const result = await createIdentityGrant({
      childProfileId,
      schoolOrganizationId,
      targetOrganizationId: clinic.id,
      grantedByProfileId: userId,
      scope,
      validUntil: resolvedExpiry.iso,
      purpose: purpose.trim() || null,
    });
    setSubmitting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onShared();
  }

  const studentName = useMemo(() => {
    if (lockedStudentName) return lockedStudentName;
    return students.find((s) => s.childProfileId === childProfileId)?.fullName ?? null;
  }, [students, childProfileId, lockedStudentName]);

  return (
    <Modal open={open} onClose={onClose} title="Share Identity With Clinic" className="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Student picker */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Student <span className="text-red-600">*</span>
          </label>
          {lockedChildProfileId ? (
            <div className="px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm">
              {lockedStudentName ?? "Selected student"}
            </div>
          ) : studentsLoading ? (
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading students…
            </div>
          ) : students.length === 0 ? (
            <div className="px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                No students are sharable yet — none of them have an identity
                record. Save any student to populate it, then come back.
              </p>
            </div>
          ) : (
            <Select
              value={childProfileId}
              onChange={(e) => setChildProfileId(e.target.value)}
              disabled={submitting}
              required
            >
              <option value="">Select a student…</option>
              {students.map((s) => (
                <option key={s.childProfileId} value={s.childProfileId}>
                  {s.fullName}
                </option>
              ))}
            </Select>
          )}
        </div>

        {/* Clinic picker */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Clinic / medical practice <span className="text-red-600">*</span>
          </label>
          <ClinicOrganizationPicker
            value={clinic}
            onChange={setClinic}
            disabled={submitting}
          />
        </div>

        {/* Scope */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            What to share <span className="text-red-600">*</span>
          </label>
          <div className="space-y-2 px-3 py-3 bg-muted/30 border border-border rounded-lg">
            <ScopeRow
              icon={<ShieldCheck className="w-4 h-4 text-muted-foreground" />}
              label="Identity only"
              hint="Display name, legal name, date of birth, sex, gender, language, country."
              selected={scope === "identity_only"}
              onClick={() => setScope("identity_only")}
              disabled={submitting}
            />
            <ScopeRow
              icon={<IdCard className="w-4 h-4 text-muted-foreground" />}
              label="Identity + identifiers"
              hint="Identity above PLUS LRN / passport / clinic IDs."
              selected={scope === "identity_with_identifiers"}
              onClick={() => setScope("identity_with_identifiers")}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground pt-1 border-t border-border">
              Scope can&apos;t change later. To upgrade, revoke this grant and
              issue a new one.
            </p>
          </div>
        </div>

        {/* Expiry */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Access expires <span className="text-red-600">*</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setPresetDays(p.days)}
                disabled={submitting}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md border transition-colors",
                  presetDays === p.days
                    ? "bg-primary text-white border-primary"
                    : "bg-card border-border text-foreground hover:bg-muted",
                )}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPresetDays("custom")}
              disabled={submitting}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md border transition-colors",
                presetDays === "custom"
                  ? "bg-primary text-white border-primary"
                  : "bg-card border-border text-foreground hover:bg-muted",
              )}
            >
              Custom
            </button>
          </div>
          {presetDays === "custom" && (
            <div className="mt-2">
              <DatePicker
                value={customDate}
                onChange={setCustomDate}
                placeholder="Pick an expiry date"
              />
            </div>
          )}
        </div>

        {/* Purpose */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Purpose <span className="text-xs text-muted-foreground font-normal">(optional)</span>
          </label>
          <Textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Speech therapy referral with Dr. Cruz"
            rows={2}
            maxLength={500}
            disabled={submitting}
          />
        </div>

        {/* Confirmation */}
        {clinic && resolvedExpiry && studentName && (
          <div className="px-3 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900 flex items-start gap-2">
            <Calendar className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              <strong>{clinic.name}</strong> will be able to view{" "}
              <strong>{studentName}</strong>&apos;s{" "}
              {scope === "identity_only" ? "identity" : "identity and identifiers"}{" "}
              until{" "}
              <strong>{format(resolvedExpiry.date, "MMM d, yyyy")}</strong>.
            </span>
          </div>
        )}

        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <ModalCancelButton />
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sharing…
              </>
            ) : (
              "Share identity"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ScopeRow({
  icon,
  label,
  hint,
  selected,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full text-left px-3 py-2 rounded-md border transition-colors flex items-start gap-2",
        selected
          ? "bg-primary/10 border-primary"
          : "bg-card border-border hover:bg-muted",
      )}
    >
      <div className="flex-shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
    </button>
  );
}
