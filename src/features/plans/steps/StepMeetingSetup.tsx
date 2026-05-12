"use client";

import { type Dispatch, type SetStateAction } from "react";
import { Plus, X, Link, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/datepicker";
import { MEETING_PURPOSE_OPTIONS, DEFAULT_TEAM_ROLES, TEAM_FOOTNOTE } from "../constants";
import type { IepTeamMember, PlanStatus } from "../types";
import { Field, BlockCard, EmptyHint, NaToggle } from "./shared";

export interface StepMeetingSetupProps {
  // Meeting details
  meetingPurpose: string; setMeetingPurpose: (v: string) => void;
  meetingDate: string; setMeetingDate: (v: string) => void;
  lastIepDate: string; setLastIepDate: (v: string) => void;
  revisionDate: string; setRevisionDate: (v: string) => void;
  iepReviewDate: string; setIepReviewDate: (v: string) => void;
  meetingLocation: string; setMeetingLocation: (v: string) => void;
  meetingLink: string; setMeetingLink: (v: string) => void;
  meetingLinkPending: boolean; setMeetingLinkPending: (v: boolean) => void;
  meetingTbs: boolean; setMeetingTbs: (v: boolean) => void;
  // Team members
  teamMembers: IepTeamMember[];
  setTeamMembers: Dispatch<SetStateAction<IepTeamMember[]>>;
  addTeamMember: () => void;
  // Plan status (used to gate acknowledgement display)
  status: PlanStatus;
  canEdit: boolean;
}

export function StepMeetingSetup({
  meetingPurpose, setMeetingPurpose,
  meetingDate, setMeetingDate,
  lastIepDate, setLastIepDate,
  revisionDate, setRevisionDate,
  iepReviewDate, setIepReviewDate,
  meetingLocation, setMeetingLocation,
  meetingLink, setMeetingLink,
  meetingLinkPending, setMeetingLinkPending,
  meetingTbs, setMeetingTbs,
  teamMembers, setTeamMembers, addTeamMember,
  status, canEdit,
}: StepMeetingSetupProps) {

  const isDraft = status === "draft";

  return (
    <div className="space-y-5">

      {/* ── Meeting Setup ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold">Meeting Setup</p>
          <p className="text-xs text-muted-foreground mt-0.5">Document the meeting purpose, dates, location, and follow-up schedule.</p>
        </div>

        <Field label="Purpose of Meeting">
          <Select value={meetingPurpose} onChange={(e) => setMeetingPurpose(e.target.value)} disabled={!canEdit}>
            <option value="">— Select —</option>
            {MEETING_PURPOSE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>

        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Date of Meeting">
            <div className="space-y-1.5">
              <DatePicker value={meetingDate} onChange={setMeetingDate} disabled={!canEdit || meetingTbs} />
              <NaToggle
                checked={meetingTbs}
                onChange={(v) => { setMeetingTbs(v); if (v) setMeetingDate(""); }}
                label="Date TBD"
                disabled={!canEdit}
              />
            </div>
          </Field>
          {meetingPurpose !== "initial" && (
            <Field label="Date of Last IEP">
              <DatePicker value={lastIepDate} onChange={setLastIepDate} disabled={!canEdit} />
            </Field>
          )}
        </div>

        {meetingPurpose === "revision" && (
          <Field label="Revision Date">
            <DatePicker value={revisionDate} onChange={setRevisionDate} disabled={!canEdit} />
          </Field>
        )}

        <div className="grid md:grid-cols-2 gap-3">
          <Field label="IEP Review Date" hint="When this plan will be formally reviewed next.">
            <DatePicker value={iepReviewDate} onChange={setIepReviewDate} disabled={!canEdit} />
          </Field>
        </div>

        {/* Location */}
        <div className="pt-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-2">Meeting Location</p>
        </div>
        <Field label="Physical Location" hint="Room name, building, or venue for in-person meetings.">
          <div className="relative">
            <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={meetingLocation}
              onChange={(e) => setMeetingLocation(e.target.value)}
              disabled={!canEdit}
              placeholder="e.g. Conference Room B, Main Building"
              className="pl-8"
            />
          </div>
        </Field>

        <div className="space-y-2">
          <Field label="Online Meeting Link" hint="Zoom, Google Meet, or Teams link for virtual attendees.">
            <div className="relative">
              <Link className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={meetingLinkPending ? "" : meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                disabled={!canEdit || meetingLinkPending}
                placeholder="https://meet.google.com/…"
                className="pl-8"
              />
            </div>
          </Field>
          <label className="inline-flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={meetingLinkPending}
              disabled={!canEdit}
              onChange={(e) => {
                setMeetingLinkPending(e.target.checked);
                if (e.target.checked) setMeetingLink("");
              }}
            />
            <span className="text-muted-foreground">Link not yet available — to be shared before meeting</span>
          </label>
        </div>
      </div>

      {/* ── IEP Team ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold">IEP Team</p>
          <p className="text-xs text-muted-foreground mt-0.5">{TEAM_FOOTNOTE}</p>
        </div>

        {teamMembers.length === 0 && <EmptyHint>No team members added yet.</EmptyHint>}

        {teamMembers.map((m, idx) => (
          <BlockCard key={m.id} index={idx}
            onRemove={canEdit ? () => setTeamMembers((p) => p.filter((x) => x.id !== m.id)) : undefined}>
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Name">
                <Input
                  value={m.name}
                  onChange={(e) => setTeamMembers((p) => p.map((x) => x.id === m.id ? { ...x, name: e.target.value } : x))}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Role">
                <Select
                  value={m.role}
                  onChange={(e) => setTeamMembers((p) => p.map((x) => x.id === m.id ? { ...x, role: e.target.value } : x))}
                  disabled={!canEdit}
                >
                  <option value="">— Select role —</option>
                  {DEFAULT_TEAM_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>
            </div>

            <label className="inline-flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={m.requires_ack}
                disabled={!canEdit}
                onChange={(e) => setTeamMembers((p) => p.map((x) => x.id === m.id ? { ...x, requires_ack: e.target.checked } : x))}
              />
              <span className="text-muted-foreground">Confirm participation in this meeting</span>
            </label>

            {/* Only show the acknowledgement date after the plan moves past draft stage */}
            {m.requires_ack && !isDraft && (
              <Field label="Participation Confirmed On">
                <DatePicker
                  value={m.acknowledged_at ?? ""}
                  onChange={(v) => setTeamMembers((p) => p.map((x) => x.id === m.id ? { ...x, acknowledged_at: v || null } : x))}
                  disabled={!canEdit}
                />
              </Field>
            )}
          </BlockCard>
        ))}

        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={addTeamMember}>
            <Plus className="w-4 h-4 mr-1" /> Add team member
          </Button>
        )}
      </div>

    </div>
  );
}
