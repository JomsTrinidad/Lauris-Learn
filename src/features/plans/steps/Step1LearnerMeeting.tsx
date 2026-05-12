"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/datepicker";
import { Field } from "./shared";
import type { StudentOption } from "./shared";

export interface Step1Props {
  // Student picker
  students: StudentOption[];
  studentId: string;
  setStudentId: (v: string) => void;
  isEditing: boolean;
  // Plan title
  title: string;
  setTitle: (v: string) => void;
  // Learner details
  learnerLrn: string; setLearnerLrn: (v: string) => void;
  learnerBirthDate: string; setLearnerBirthDate: (v: string) => void;
  learnerSex: string; setLearnerSex: (v: string) => void;
  learnerGrade: string; setLearnerGrade: (v: string) => void;
  religion: string; setReligion: (v: string) => void;
  motherTongue: string; setMotherTongue: (v: string) => void;
  // Caregiver
  caregiverName: string; setCaregiverName: (v: string) => void;
  caregiverContact: string; setCaregiverContact: (v: string) => void;
  caregiverEmail: string; setCaregiverEmail: (v: string) => void;
  homeAddress: string; setHomeAddress: (v: string) => void;
  parentWorkplace: string; setParentWorkplace: (v: string) => void;
  parentNotes: string; setParentNotes: (v: string) => void;
  // DepEd classification collapsible
  step1LegendOpen: boolean;
  setStep1LegendOpen: (v: boolean) => void;
  region: string; setRegion: (v: string) => void;
  division: string; setDivision: (v: string) => void;
  district: string; setDistrict: (v: string) => void;
  canEdit: boolean;
}

export function Step1LearnerMeeting({
  students, studentId, setStudentId, isEditing,
  title, setTitle,
  learnerLrn, setLearnerLrn, learnerBirthDate, setLearnerBirthDate,
  learnerSex, setLearnerSex, learnerGrade, setLearnerGrade,
  religion, setReligion, motherTongue, setMotherTongue,
  caregiverName, setCaregiverName, caregiverContact, setCaregiverContact,
  caregiverEmail, setCaregiverEmail, homeAddress, setHomeAddress,
  parentWorkplace, setParentWorkplace, parentNotes, setParentNotes,
  step1LegendOpen, setStep1LegendOpen,
  region, setRegion, division, setDivision, district, setDistrict,
  canEdit,
}: Step1Props) {

  const [studentSearch, setStudentSearch] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dropOpen) return;
    const found = students.find((s) => s.id === studentId);
    if (found) setStudentSearch(found.full_name);
    else if (!studentId) setStudentSearch("");
  }, [studentId, students, dropOpen]);

  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropOpen]);

  return (
    <div className="space-y-5">

      {/* ── Learner & Family ── */}
      <div className="rounded-xl border border-border/50 bg-muted/60 p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold">Learner &amp; Family</p>
          <p className="text-xs text-muted-foreground mt-0.5">Basic learner and caregiver information for this IEP.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Plan Title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. IEP Plan — SY 2025-2026" disabled={!canEdit} />
          </Field>
          <Field label="Learner" required>
            <div className="relative" ref={dropRef}>
              <Input
                value={studentSearch}
                onChange={(e) => {
                  setStudentSearch(e.target.value);
                  setDropOpen(true);
                  if (!e.target.value) setStudentId("");
                }}
                onFocus={() => { if (canEdit && !isEditing) setDropOpen(true); }}
                placeholder="Search learner…"
                disabled={!canEdit || isEditing}
                className="pr-7"
              />
              {studentId && canEdit && !isEditing && (
                <button
                  type="button"
                  onClick={() => { setStudentId(""); setStudentSearch(""); setDropOpen(false); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {dropOpen && canEdit && !isEditing && (
                <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
                  {students
                    .filter((s) => s.full_name.toLowerCase().includes(studentSearch.toLowerCase()))
                    .map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setStudentId(s.id);
                          setStudentSearch(s.full_name);
                          setDropOpen(false);
                        }}
                        className="flex items-center justify-between w-full px-3 py-2.5 text-xs hover:bg-muted text-left"
                      >
                        <span>{s.full_name}</span>
                        {s.student_code && (
                          <span className="text-xs text-muted-foreground shrink-0 font-normal">{s.student_code}</span>
                        )}
                      </button>
                    ))}
                  {students.filter((s) => s.full_name.toLowerCase().includes(studentSearch.toLowerCase())).length === 0 && (
                    <div className="px-3 py-2.5 text-xs text-muted-foreground">No learners found.</div>
                  )}
                </div>
              )}
            </div>
          </Field>
        </div>

        <div className="pt-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-0.5">Learner Details</p>
          <p className="text-xs text-muted-foreground">LRN, birth date, and sex are pre-filled from existing records when available.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="LRN">
            <Input value={learnerLrn} onChange={(e) => setLearnerLrn(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Date of Birth">
            <DatePicker value={learnerBirthDate} onChange={setLearnerBirthDate} disabled={!canEdit} />
          </Field>
          <Field label="Sex">
            <Select value={learnerSex} onChange={(e) => setLearnerSex(e.target.value)} disabled={!canEdit}>
              <option value="">—</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </Select>
          </Field>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Grade / Section">
            <Input value={learnerGrade} onChange={(e) => setLearnerGrade(e.target.value)} disabled={!canEdit} placeholder="e.g. Grade 3 — Sampaguita" />
          </Field>
          <Field label="Religion">
            <Input value={religion} onChange={(e) => setReligion(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Mother Tongue Spoken">
            <Input value={motherTongue} onChange={(e) => setMotherTongue(e.target.value)} disabled={!canEdit} />
          </Field>
        </div>

        <div className="pt-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-1">Parent / Guardian / Caregiver</p>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Name">
            <Input value={caregiverName} onChange={(e) => setCaregiverName(e.target.value)} disabled={!canEdit} placeholder="Full name" />
          </Field>
          <Field label="Contact Number">
            <Input type="tel" value={caregiverContact} onChange={(e) => setCaregiverContact(e.target.value)} disabled={!canEdit} placeholder="+63 9XX XXX XXXX" />
          </Field>
          <Field label="Email Address">
            <Input type="email" value={caregiverEmail} onChange={(e) => setCaregiverEmail(e.target.value)} disabled={!canEdit} placeholder="email@example.com" />
          </Field>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Home Address">
            <Textarea value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} disabled={!canEdit} rows={2} />
          </Field>
          <Field label="Workplace">
            <Textarea value={parentWorkplace} onChange={(e) => setParentWorkplace(e.target.value)} disabled={!canEdit} rows={2} />
          </Field>
        </div>
        <Field label="Parent / Guardian / Caregiver Notes" hint="What the caregiver shared in conversation.">
          <Textarea value={parentNotes} onChange={(e) => setParentNotes(e.target.value)} disabled={!canEdit} rows={2} />
        </Field>

        {/* DepEd classification — collapsible */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setStep1LegendOpen(!step1LegendOpen)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            {step1LegendOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            DepEd classification — region, division, district
          </button>
          {step1LegendOpen && (
            <div className="mt-3 grid md:grid-cols-3 gap-3">
              <Field label="Region">
                <Input value={region} onChange={(e) => setRegion(e.target.value)} disabled={!canEdit} placeholder="e.g. Region IV-A" />
              </Field>
              <Field label="Schools Division">
                <Input value={division} onChange={(e) => setDivision(e.target.value)} disabled={!canEdit} placeholder="e.g. Division of Laguna" />
              </Field>
              <Field label="District">
                <Input value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!canEdit} />
              </Field>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
