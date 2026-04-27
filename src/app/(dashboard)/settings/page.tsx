"use client";
import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, Upload, RotateCcw } from "lucide-react";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { compressImage, PROFILE_PHOTO_MAX_W, PROFILE_PHOTO_MAX_BYTES } from "@/lib/image-compress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";

type SchoolYearStatus = "draft" | "active" | "archived";

interface SchoolYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: SchoolYearStatus;
}

interface Holiday {
  id: string;
  name: string;
  date: string;
  appliesToAll: boolean;
  isNoClass: boolean;
  notes: string;
}

interface AcademicPeriod {
  id: string;
  schoolYearId: string;
  schoolYearName: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface TeacherProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  notes: string;
  avatarUrl: string | null;
}

const SECTIONS = ["School Information", "School Year & Terms", "Holidays", "Teachers", "Student IDs", "Grading", "Branding & Accessibility"] as const;
type Section = (typeof SECTIONS)[number];

const SESSION_KEY = "settings_active_section";

function getSavedSection(): Section {
  if (typeof window === "undefined") return "School Information";
  const saved = sessionStorage.getItem(SESSION_KEY);
  // Remap legacy section names after the Academic Periods merge
  if (saved === "School Years" || saved === "Academic Periods") return "School Year & Terms";
  return (SECTIONS as readonly string[]).includes(saved ?? "") ? (saved as Section) : "School Information";
}

function formatDateRange(start: string, end: string) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" };
  const s = new Date(start + "T00:00:00").toLocaleDateString("en-US", opts);
  const e = new Date(end + "T00:00:00").toLocaleDateString("en-US", opts);
  return `${s} – ${e}`;
}

const EMPTY_TEACHER: Omit<TeacherProfile, "id"> = {
  fullName: "", email: "", phone: "",
  startDate: "", endDate: "", isActive: true, notes: "", avatarUrl: null,
};

interface GradingScale {
  id: string;
  label: string;
  description: string;
  color: string;
  minScore: string;
  maxScore: string;
  sortOrder: number;
}

interface StudentCodeConfig {
  prefix: string;
  padding: number;
  includeYear: boolean;
}

// ── Branding helpers ──────────────────────────────────────────────────────────

interface BrandingForm {
  primaryColor: string;
  accentColor: string;
  reportFooterText: string;
  textSizeScale: "default" | "large" | "extra_large";
  spacingScale: "compact" | "default" | "relaxed";
}

const BRANDING_DEFAULTS: BrandingForm = {
  primaryColor: "#4a90e2",
  accentColor: "#81c784",
  reportFooterText: "",
  textSizeScale: "default",
  spacingScale: "default",
};

function hexToRgb(hex: string): [number, number, number] | null {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return [r, g, b].reduce((acc, c, i) => {
    const s = c / 255;
    return acc + (s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)) * [0.2126, 0.7152, 0.0722][i];
  }, 0);
}

function contrastRatio(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 21;
  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function BrandingPreview({ form }: { form: BrandingForm }) {
  const scale = form.textSizeScale === "extra_large" ? 1.22 : form.textSizeScale === "large" ? 1.09 : 1;
  const lh    = form.spacingScale  === "relaxed"     ? 1.85 : form.spacingScale  === "compact" ? 1.4 : 1.6;
  return (
    <div
      className="border border-border rounded-xl p-5 bg-muted/20 space-y-4"
      style={{ fontSize: `${scale}rem`, lineHeight: lh }}
    >
      <div className="flex items-center gap-3">
        <span
          className="px-4 py-2 rounded-lg text-white font-medium text-sm"
          style={{ backgroundColor: form.primaryColor }}
        >
          Save Changes
        </span>
        <span
          className="px-4 py-2 rounded-lg font-medium text-sm border"
          style={{ borderColor: form.primaryColor, color: form.primaryColor }}
        >
          Cancel
        </span>
      </div>
      <p className="text-foreground">
        This is how body text will appear in the parent portal and on student-facing pages. Readable text makes a difference for parents checking updates daily.
      </p>
      <div className="border border-border rounded-lg p-3 bg-card space-y-1">
        <p className="font-semibold text-sm" style={{ color: form.primaryColor }}>
          Student Name · Class 1A
        </p>
        <p className="text-sm text-muted-foreground">Tuition — October 2025</p>
        <span
          className="inline-block text-xs font-medium px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: form.accentColor }}
        >
          Paid
        </span>
      </div>
      <input
        readOnly
        value="Sample form field — parent contact number"
        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
      />
    </div>
  );
}

export default function SettingsPage() {
  const { schoolId, schoolName: ctxSchoolName, refresh: refreshCtx, patchBranding, userId, userName, userAvatar } = useSchoolContext();
  const supabase = createClient();

  // Persist active section across context reloads (refreshCtx causes a loading spinner which remounts the page)
  const [activeSection, setActiveSectionState] = useState<Section>(getSavedSection);
  function setActiveSection(s: Section) {
    sessionStorage.setItem(SESSION_KEY, s);
    setActiveSectionState(s);
  }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // School info
  const [schoolInfo, setSchoolInfo] = useState({
    schoolName: "", branchName: "", address: "", phone: "", email: "",
  });

  // School years
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [syModal, setSyModal] = useState(false);
  const [editingSy, setEditingSy] = useState<SchoolYear | null>(null);
  const [syForm, setSyForm] = useState({ name: "", startDate: "", endDate: "", status: "draft" as SchoolYearStatus });

  // Academic Periods
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [periodModal, setPeriodModal] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<AcademicPeriod | null>(null);
  const [periodForm, setPeriodForm] = useState({ schoolYearId: "", name: "", startDate: "", endDate: "", isActive: false });

  // Holidays
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayModal, setHolidayModal] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [holidayForm, setHolidayForm] = useState({ name: "", date: "", appliesToAll: true, isNoClass: true, notes: "" });

  // Teachers
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [teacherModal, setTeacherModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<TeacherProfile | null>(null);
  const [teacherForm, setTeacherForm] = useState<Omit<TeacherProfile, "id">>(EMPTY_TEACHER);
  const [teacherFormError, setTeacherFormError] = useState<string | null>(null);
  const [teacherPhotoFile, setTeacherPhotoFile] = useState<File | null>(null);

  // Admin profile photo (URL comes from SchoolContext so header stays in sync)
  const [adminPhotoFile, setAdminPhotoFile] = useState<File | null>(null);
  const [adminPhotoSaving, setAdminPhotoSaving] = useState(false);
  const [adminPhotoError, setAdminPhotoError] = useState<string | null>(null);

  // Student ID config
  const [codeConfig, setCodeConfig] = useState<StudentCodeConfig>({ prefix: "LL", padding: 4, includeYear: false });
  const [codeConfigSaving, setCodeConfigSaving] = useState(false);

  // Grading scales
  const [gradingScales, setGradingScales] = useState<GradingScale[]>([]);
  const [gradingModal, setGradingModal] = useState(false);
  const [editingScale, setEditingScale] = useState<GradingScale | null>(null);
  const [gradingForm, setGradingForm] = useState({ label: "", description: "", color: "#6b7280", minScore: "", maxScore: "", sortOrder: "0" });
  const [gradingFormError, setGradingFormError] = useState<string | null>(null);

  // Branding & Accessibility
  const [brandingForm, setBrandingForm] = useState<BrandingForm>(BRANDING_DEFAULTS);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!schoolId) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [{ data: school }, { data: branches }, { data: years }, { data: hols }, { data: periods }, { data: teacherRows }, { data: codeRow }, { data: scaleRows }] =
      await Promise.all([
        supabase.from("schools").select("name").eq("id", schoolId).single(),
        supabase.from("branches").select("name, address, phone").eq("school_id", schoolId).limit(1).maybeSingle(),
        supabase.from("school_years").select("id, name, start_date, end_date, status").eq("school_id", schoolId).order("start_date", { ascending: false }),
        supabase.from("holidays").select("id, name, date, applies_to_all, is_no_class, notes").eq("school_id", schoolId).order("date"),
        supabase.from("academic_periods").select("id, school_year_id, name, start_date, end_date, is_active, school_years(name)").eq("school_id", schoolId).order("start_date"),
        sb.from("teacher_profiles").select("id, full_name, email, phone, start_date, end_date, is_active, notes, avatar_url").eq("school_id", schoolId).order("full_name"),
        sb.from("schools").select("student_code_prefix, student_code_padding, student_code_include_year, logo_url, primary_color, accent_color, report_footer_text, text_size_scale, spacing_scale").eq("id", schoolId).single(),
        sb.from("grading_scales").select("id, label, description, color, min_score, max_score, sort_order").eq("school_id", schoolId).order("sort_order"),
      ]);

    setSchoolInfo({
      schoolName: school?.name ?? "",
      branchName: (branches as any)?.name ?? "",
      address: (branches as any)?.address ?? "",
      phone: (branches as any)?.phone ?? "",
      email: "",
    });

    setSchoolYears(
      (years ?? [])
        .map((y) => ({ id: y.id, name: y.name, startDate: y.start_date, endDate: y.end_date, status: y.status as SchoolYearStatus }))
        .sort((a, b) => {
          if (a.status === "active") return -1;
          if (b.status === "active") return 1;
          return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
        })
    );

    setHolidays((hols ?? []).map((h) => ({
      id: h.id, name: h.name, date: h.date,
      appliesToAll: h.applies_to_all, isNoClass: h.is_no_class,
      notes: h.notes ?? "",
    })));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAcademicPeriods((periods ?? []).map((p: any) => ({
      id: p.id,
      schoolYearId: p.school_year_id,
      schoolYearName: p.school_years?.name ?? "",
      name: p.name,
      startDate: p.start_date,
      endDate: p.end_date,
      isActive: p.is_active,
    })));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setTeachers((teacherRows ?? []).map((t: any) => ({
      id: t.id,
      fullName: t.full_name,
      email: t.email ?? "",
      phone: t.phone ?? "",
      startDate: t.start_date ?? "",
      endDate: t.end_date ?? "",
      isActive: t.is_active,
      notes: t.notes ?? "",
      avatarUrl: t.avatar_url ?? null,
    })));

    if (codeRow) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cr = codeRow as any;
      setCodeConfig({
        prefix: cr.student_code_prefix ?? "LL",
        padding: cr.student_code_padding ?? 4,
        includeYear: cr.student_code_include_year ?? false,
      });
      setLogoUrl(cr.logo_url ?? null);
      setBrandingForm({
        primaryColor:    cr.primary_color     ?? BRANDING_DEFAULTS.primaryColor,
        accentColor:     cr.accent_color      ?? BRANDING_DEFAULTS.accentColor,
        reportFooterText: cr.report_footer_text ?? "",
        textSizeScale:   cr.text_size_scale   ?? "default",
        spacingScale:    cr.spacing_scale     ?? "default",
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setGradingScales((scaleRows ?? []).map((s: any) => ({
      id: s.id,
      label: s.label,
      description: s.description ?? "",
      color: s.color ?? "#6b7280",
      minScore: s.min_score != null ? String(s.min_score) : "",
      maxScore: s.max_score != null ? String(s.max_score) : "",
      sortOrder: s.sort_order ?? 0,
    })));

    setLoading(false);
  }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);


  async function uploadProfilePhoto(folder: string, id: string, file: File): Promise<string | null> {
    const compressed = await compressImage(file, PROFILE_PHOTO_MAX_W, PROFILE_PHOTO_MAX_BYTES);
    const path = `${folder}/${id}.jpg`;
    const { error } = await supabase.storage.from("profile-photos").upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
    if (error) return null;
    const { data } = supabase.storage.from("profile-photos").getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
  }

  async function saveAdminPhoto() {
    if (!adminPhotoFile || !userId) return;
    setAdminPhotoSaving(true);
    setAdminPhotoError(null);
    const url = await uploadProfilePhoto("admins", userId, adminPhotoFile);
    if (url) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("profiles").update({ avatar_url: url }).eq("id", userId);
      setAdminPhotoFile(null);
      refreshCtx(); // updates userAvatar in SchoolContext → header re-renders
    } else {
      setAdminPhotoError("Photo upload failed. Make sure the 'profile-photos' storage bucket exists (run migration 022).");
    }
    setAdminPhotoSaving(false);
  }

  // ── School Info ──
  async function saveSchoolInfo() {
    if (!schoolId) return;
    setSaving(true);
    const { error: e1 } = await supabase.from("schools").update({ name: schoolInfo.schoolName }).eq("id", schoolId);
    const { data: existing } = await supabase.from("branches").select("id").eq("school_id", schoolId).limit(1).maybeSingle();
    if (existing?.id) {
      await supabase.from("branches").update({ name: schoolInfo.branchName, address: schoolInfo.address, phone: schoolInfo.phone || null }).eq("id", existing.id);
    } else if (schoolInfo.branchName) {
      await supabase.from("branches").insert({ school_id: schoolId, name: schoolInfo.branchName, address: schoolInfo.address, phone: schoolInfo.phone || null });
    }
    if (e1) { setError(e1.message); } else { refreshCtx(); }
    setSaving(false);
  }

  // ── School Years ──
  function openAddSy() {
    setEditingSy(null);
    setSyForm({ name: "", startDate: "", endDate: "", status: "draft" });
    setSyModal(true);
  }
  function openEditSy(sy: SchoolYear) {
    setEditingSy(sy);
    setSyForm({ name: sy.name, startDate: sy.startDate, endDate: sy.endDate, status: sy.status });
    setSyModal(true);
  }
  async function saveSy() {
    if (!schoolId) return;
    setSaving(true);
    setError(null);

    if (syForm.status === "active") {
      await supabase.from("school_years").update({ status: "draft" }).eq("school_id", schoolId).eq("status", "active");
    }

    if (editingSy) {
      const { error: e } = await supabase.from("school_years").update({
        name: syForm.name, start_date: syForm.startDate, end_date: syForm.endDate, status: syForm.status,
      }).eq("id", editingSy.id);
      if (e) { setError(e.message); setSaving(false); return; }
    } else {
      const { error: e } = await supabase.from("school_years").insert({
        school_id: schoolId, name: syForm.name,
        start_date: syForm.startDate, end_date: syForm.endDate, status: syForm.status,
      });
      if (e) { setError(e.message); setSaving(false); return; }
    }
    setSyModal(false);
    setSaving(false);
    await load();
    // Refresh context after local state is updated to avoid unmount resetting the active section
    if (syForm.status === "active") refreshCtx();
  }

  async function setActiveSy(id: string) {
    if (!schoolId) return;
    await supabase.from("school_years").update({ status: "draft" }).eq("school_id", schoolId).eq("status", "active");
    await supabase.from("school_years").update({ status: "active" }).eq("id", id);
    await load();
    // Call refreshCtx after load() so the page state is stable before context triggers a re-render
    refreshCtx();
  }

  async function deleteSy(id: string) {
    const sy = schoolYears.find((s) => s.id === id);
    if (!sy) return;
    if (sy.status === "active") {
      setError("Cannot delete the active school year. Set another year as active first.");
      return;
    }
    if (!confirm(`Delete "${sy.name}"? This will also delete its terms. Classes, enrollments, and billing records for this year must be removed first.`)) return;
    const { error: e, count } = await supabase.from("school_years").delete({ count: "exact" }).eq("id", id);
    if (e) {
      setError("Cannot delete — this school year still has associated classes, enrollments, or billing records.");
    } else if (count === 0) {
      setError(`Delete was blocked by the database. Run this in the Supabase SQL Editor to force-delete it:\nDELETE FROM school_years WHERE id = '${id}';`);
    } else {
      setSchoolYears((prev) => prev.filter((s) => s.id !== id));
      setAcademicPeriods((prev) => prev.filter((p) => p.schoolYearId !== id));
    }
  }

  // ── Academic Periods (Terms) ──
  function openAddPeriod(schoolYearId: string) {
    setEditingPeriod(null);
    setPeriodForm({ schoolYearId, name: "", startDate: "", endDate: "", isActive: false });
    setPeriodModal(true);
  }
  function openEditPeriod(p: AcademicPeriod) {
    setEditingPeriod(p);
    setPeriodForm({ schoolYearId: p.schoolYearId, name: p.name, startDate: p.startDate, endDate: p.endDate, isActive: p.isActive });
    setPeriodModal(true);
  }
  async function savePeriod() {
    if (!schoolId || !periodForm.schoolYearId || !periodForm.name.trim() || !periodForm.startDate || !periodForm.endDate) {
      setError("Term name, start date, and end date are required.");
      return;
    }
    setSaving(true);
    setError(null);
    if (editingPeriod) {
      const { error: e } = await supabase.from("academic_periods").update({
        school_year_id: periodForm.schoolYearId,
        name: periodForm.name.trim(),
        start_date: periodForm.startDate,
        end_date: periodForm.endDate,
      }).eq("id", editingPeriod.id);
      if (e) { setError(e.message); setSaving(false); return; }
    } else {
      const { error: e } = await supabase.from("academic_periods").insert({
        school_id: schoolId,
        school_year_id: periodForm.schoolYearId,
        name: periodForm.name.trim(),
        start_date: periodForm.startDate,
        end_date: periodForm.endDate,
      });
      if (e) { setError(e.message); setSaving(false); return; }
    }
    setPeriodModal(false);
    setSaving(false);
    await load();
  }
  async function deletePeriod(id: string) {
    if (!confirm("Delete this term?")) return;
    await supabase.from("academic_periods").delete().eq("id", id);
    setAcademicPeriods((prev) => prev.filter((p) => p.id !== id));
  }

  // ── Holidays ──
  function openAddHoliday() {
    setEditingHoliday(null);
    setHolidayForm({ name: "", date: "", appliesToAll: true, isNoClass: true, notes: "" });
    setHolidayModal(true);
  }
  function openEditHoliday(h: Holiday) {
    setEditingHoliday(h);
    setHolidayForm({ name: h.name, date: h.date, appliesToAll: h.appliesToAll, isNoClass: h.isNoClass, notes: h.notes });
    setHolidayModal(true);
  }
  async function saveHoliday() {
    if (!schoolId) return;
    setSaving(true);
    setError(null);
    if (editingHoliday) {
      const { error: e } = await supabase.from("holidays").update({
        name: holidayForm.name, date: holidayForm.date,
        applies_to_all: holidayForm.appliesToAll, is_no_class: holidayForm.isNoClass,
        notes: holidayForm.notes,
      }).eq("id", editingHoliday.id);
      if (e) { setError(e.message); setSaving(false); return; }
    } else {
      const { error: e } = await supabase.from("holidays").insert({
        school_id: schoolId, name: holidayForm.name, date: holidayForm.date,
        applies_to_all: holidayForm.appliesToAll, is_no_class: holidayForm.isNoClass,
        notes: holidayForm.notes,
      });
      if (e) { setError(e.message); setSaving(false); return; }
    }
    setHolidayModal(false);
    setSaving(false);
    await load();
  }
  async function deleteHoliday(id: string) {
    await supabase.from("holidays").delete().eq("id", id);
    setHolidays((prev) => prev.filter((h) => h.id !== id));
  }

  // ── Teachers ──
  function openAddTeacher() {
    setEditingTeacher(null);
    setTeacherForm(EMPTY_TEACHER);
    setTeacherPhotoFile(null);
    setTeacherFormError(null);
    setTeacherModal(true);
  }
  function openEditTeacher(t: TeacherProfile) {
    setEditingTeacher(t);
    setTeacherForm({ fullName: t.fullName, email: t.email, phone: t.phone, startDate: t.startDate, endDate: t.endDate, isActive: t.isActive, notes: t.notes, avatarUrl: t.avatarUrl });
    setTeacherPhotoFile(null);
    setTeacherFormError(null);
    setTeacherModal(true);
  }
  async function saveTeacher() {
    if (!teacherForm.fullName.trim()) { setTeacherFormError("Full name is required."); return; }
    if (!schoolId) return;
    setSaving(true);
    setTeacherFormError(null);

    const payload = {
      school_id: schoolId,
      full_name: teacherForm.fullName.trim(),
      email: teacherForm.email.trim() || null,
      phone: teacherForm.phone.trim() || null,
      start_date: teacherForm.startDate || null,
      end_date: teacherForm.endDate || null,
      is_active: teacherForm.isActive,
      notes: teacherForm.notes.trim() || null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    let savedId: string | null = editingTeacher?.id ?? null;
    if (editingTeacher) {
      const { error: e } = await sb.from("teacher_profiles").update(payload).eq("id", editingTeacher.id);
      if (e) { setTeacherFormError(e.message); setSaving(false); return; }
    } else {
      const { data: ins, error: e } = await sb.from("teacher_profiles").insert(payload).select("id").single();
      if (e) { setTeacherFormError(e.message); setSaving(false); return; }
      savedId = ins?.id ?? null;
    }

    if (teacherPhotoFile && savedId) {
      const url = await uploadProfilePhoto("teachers", savedId, teacherPhotoFile);
      if (url) {
        await sb.from("teacher_profiles").update({ avatar_url: url }).eq("id", savedId);
      }
      setTeacherPhotoFile(null);
    }

    setTeacherModal(false);
    setSaving(false);
    await load();
  }
  async function deleteTeacher(id: string) {
    if (!confirm("Remove this teacher profile?")) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("teacher_profiles").delete().eq("id", id);
    setTeachers((prev) => prev.filter((t) => t.id !== id));
  }

  // ── Student ID Config ──
  async function saveCodeConfig() {
    if (!schoolId) return;
    setCodeConfigSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("schools").update({
      student_code_prefix: codeConfig.prefix.trim() || "LL",
      student_code_padding: codeConfig.padding,
      student_code_include_year: codeConfig.includeYear,
    }).eq("id", schoolId);
    setCodeConfigSaving(false);
  }

  // ── Grading Scales ──
  function openAddScale() {
    setEditingScale(null);
    setGradingForm({ label: "", description: "", color: "#6b7280", minScore: "", maxScore: "", sortOrder: String(gradingScales.length + 1) });
    setGradingFormError(null);
    setGradingModal(true);
  }
  function openEditScale(s: GradingScale) {
    setEditingScale(s);
    setGradingForm({ label: s.label, description: s.description, color: s.color, minScore: s.minScore, maxScore: s.maxScore, sortOrder: String(s.sortOrder) });
    setGradingFormError(null);
    setGradingModal(true);
  }
  async function saveScale() {
    if (!gradingForm.label.trim()) { setGradingFormError("Label is required."); return; }
    if (!schoolId) return;
    setSaving(true);
    setGradingFormError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const payload = {
      school_id: schoolId,
      label: gradingForm.label.trim(),
      description: gradingForm.description.trim() || null,
      color: gradingForm.color,
      min_score: gradingForm.minScore ? parseFloat(gradingForm.minScore) : null,
      max_score: gradingForm.maxScore ? parseFloat(gradingForm.maxScore) : null,
      sort_order: parseInt(gradingForm.sortOrder) || 0,
    };
    if (editingScale) {
      const { error: e } = await sb.from("grading_scales").update(payload).eq("id", editingScale.id);
      if (e) { setGradingFormError(e.message); setSaving(false); return; }
    } else {
      const { error: e } = await sb.from("grading_scales").insert(payload);
      if (e) { setGradingFormError(e.message); setSaving(false); return; }
    }
    setGradingModal(false);
    setSaving(false);
    await load();
  }
  async function deleteScale(id: string) {
    if (!confirm("Delete this grading scale?")) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("grading_scales").delete().eq("id", id);
    setGradingScales((prev) => prev.filter((s) => s.id !== id));
  }

  // ── Branding & Accessibility ──────────────────────────────────────────────

  async function saveBranding() {
    if (!schoolId) return;
    setBrandingSaving(true);
    setBrandingError(null);
    try {
      let newLogoUrl = logoUrl;

      if (logoFile) {
        const ext = logoFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `school-logos/${schoolId}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("profile-photos")
          .upload(path, logoFile, { upsert: true, contentType: logoFile.type });
        if (uploadErr) {
          setBrandingError("Logo upload failed: " + uploadErr.message);
          return;
        }
        const { data: urlData } = supabase.storage.from("profile-photos").getPublicUrl(path);
        newLogoUrl = `${urlData.publicUrl}?t=${Date.now()}`;
        setLogoUrl(newLogoUrl);
        setLogoFile(null);
      }

      const payload: Record<string, unknown> = {
        logo_url:           newLogoUrl,
        primary_color:      brandingForm.primaryColor !== BRANDING_DEFAULTS.primaryColor ? brandingForm.primaryColor : null,
        accent_color:       brandingForm.accentColor  !== BRANDING_DEFAULTS.accentColor  ? brandingForm.accentColor  : null,
        report_footer_text: brandingForm.reportFooterText || null,
        text_size_scale:    brandingForm.textSizeScale,
        spacing_scale:      brandingForm.spacingScale,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e } = await (supabase as any).from("schools").update(payload).eq("id", schoolId);
      if (e) {
        setBrandingError(e.message);
      } else {
        // Patch context branding in-place so BrandingApplier picks up new values
        // immediately, without triggering a full context reload (which would unmount
        // this page and reset logoUrl back to null before the DB re-fetch completes).
        patchBranding({
          logoUrl:       newLogoUrl,
          primaryColor:  payload.primary_color as string | null,
          accentColor:   payload.accent_color  as string | null,
          textSizeScale: brandingForm.textSizeScale,
          spacingScale:  brandingForm.spacingScale,
        });
      }
    } finally {
      setBrandingSaving(false);
    }
  }

  async function resetBrandingToDefaults() {
    if (!schoolId || !confirm("Reset all branding to app defaults?")) return;
    setBrandingForm((prev) => ({ ...prev, primaryColor: BRANDING_DEFAULTS.primaryColor, accentColor: BRANDING_DEFAULTS.accentColor, reportFooterText: "" }));
    setLogoUrl(null);
    setLogoFile(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("schools").update({ logo_url: null, primary_color: null, accent_color: null, report_footer_text: null }).eq("id", schoolId);
    patchBranding({ logoUrl: null, primaryColor: null, accentColor: null });
  }

  async function resetAccessibilityToDefaults() {
    if (!schoolId) return;
    setBrandingForm((prev) => ({ ...prev, textSizeScale: "default", spacingScale: "default" }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("schools").update({ text_size_scale: "default", spacing_scale: "default" }).eq("id", schoolId);
    patchBranding({ textSizeScale: "default", spacingScale: "default" });
  }

  if (!schoolId) {
    return (
      <div className="space-y-4">
        <h1>Settings</h1>
        <ErrorAlert message="Your account is not linked to a school yet. Ask your Super Admin to assign you to a school." />
      </div>
    );
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1>Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure your school, school years, and holidays</p>
      </div>
      {error && <ErrorAlert message={error} />}

      <div className="flex flex-col md:flex-row gap-6">
        <nav className="md:w-52 flex-shrink-0">
          <ul className="space-y-1">
            {SECTIONS.map((s) => (
              <li key={s}>
                <button
                  onClick={() => setActiveSection(s)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    activeSection === s ? "bg-primary text-primary-foreground font-medium" : "text-foreground hover:bg-muted"
                  }`}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex-1 min-w-0 space-y-6">

          {/* ── School Information ── */}
          {activeSection === "School Information" && (
            <Card>
              <CardHeader><h2>School Information</h2></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">School Name</label>
                  <Input value={schoolInfo.schoolName} onChange={(e) => setSchoolInfo({ ...schoolInfo, schoolName: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Branch Name</label>
                  <Input value={schoolInfo.branchName} onChange={(e) => setSchoolInfo({ ...schoolInfo, branchName: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Address</label>
                  <Textarea value={schoolInfo.address} onChange={(e) => setSchoolInfo({ ...schoolInfo, address: e.target.value })} rows={2} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Telephone Number</label>
                  <Input value={schoolInfo.phone} onChange={(e) => setSchoolInfo({ ...schoolInfo, phone: e.target.value })} placeholder="+63 2 1234 5678" />
                </div>
                <div className="flex justify-end pt-2">
                  <Button onClick={saveSchoolInfo} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeSection === "School Information" && (
            <Card>
              <CardContent className="p-5 space-y-4">
                <h3 className="font-semibold text-sm">My Profile Photo</h3>
                {adminPhotoError && <ErrorAlert message={adminPhotoError} />}
                <div className="flex items-center gap-4">
                  <AvatarUpload
                    currentUrl={adminPhotoFile ? URL.createObjectURL(adminPhotoFile) : userAvatar}
                    name={userName || "Admin"}
                    size="lg"
                    onFileSelect={(file) => { setAdminPhotoFile(file); setAdminPhotoError(null); }}
                  />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">{userName}</p>
                    <p>Click the photo to change your avatar.</p>
                    <p className="text-xs mt-0.5">Appears in the header and across the app.</p>
                  </div>
                </div>
                {adminPhotoFile && (
                  <div className="flex justify-end">
                    <Button onClick={saveAdminPhoto} disabled={adminPhotoSaving}>
                      {adminPhotoSaving ? "Saving…" : "Save Photo"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── School Year & Terms ── */}
          {activeSection === "School Year & Terms" && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2>School Year &amp; Terms</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Each school year can contain one or more terms — e.g. Regular Term, Summer Program.
                    Terms are used for tuition setup, billing, and reporting.
                  </p>
                </div>
                <Button size="sm" onClick={openAddSy}><Plus className="w-4 h-4" /> Add School Year</Button>
              </div>
              {schoolYears.length === 0 && (
                <p className="text-sm text-muted-foreground">No school years yet. Add one to get started.</p>
              )}
              <div className="space-y-4">
                {schoolYears.map((sy) => {
                  const syTerms = academicPeriods.filter((p) => p.schoolYearId === sy.id);
                  return (
                    <Card key={sy.id} className={sy.status === "active" ? "ring-2 ring-primary" : ""}>
                      <CardContent className="p-4">
                        {/* School year row */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <h3 className="font-semibold">{sy.name}</h3>
                              <Badge variant={sy.status}>{sy.status}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{formatDateRange(sy.startDate, sy.endDate)}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {sy.status !== "active" && (
                              <button onClick={() => setActiveSy(sy.id)} className="text-xs text-primary hover:underline">
                                Set Active
                              </button>
                            )}
                            <button onClick={() => openEditSy(sy)} className="p-1.5 hover:bg-accent rounded-lg transition-colors">
                              <Pencil className="w-4 h-4 text-muted-foreground" />
                            </button>
                            {sy.status !== "active" && (
                              <button onClick={() => deleteSy(sy.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Nested terms */}
                        {syTerms.length > 0 && (
                          <div className="mt-3 space-y-1 pl-4 border-l-2 border-border">
                            {syTerms.map((term) => (
                              <div key={term.id} className="flex items-center justify-between py-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium">{term.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {formatDateRange(term.startDate, term.endDate)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button onClick={() => openEditPeriod(term)} className="p-1.5 hover:bg-accent rounded-lg transition-colors">
                                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                  </button>
                                  <button onClick={() => deletePeriod(term.id)} className="p-1.5 hover:bg-red-50 rounded-lg">
                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add term inline */}
                        <button
                          onClick={() => openAddPeriod(sy.id)}
                          className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:underline pl-4"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Term
                        </button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}

          {/* ── Holidays ── */}
          {activeSection === "Holidays" && (
            <>
              <div className="flex items-center justify-between">
                <h2>Holidays & No-Class Days</h2>
                <Button size="sm" onClick={openAddHoliday}><Plus className="w-4 h-4" /> Add Holiday</Button>
              </div>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted border-b border-border">
                      <tr>
                        <th className="text-left px-5 py-3 font-medium text-muted-foreground">Holiday Name</th>
                        <th className="text-left px-5 py-3 font-medium text-muted-foreground">Date</th>
                        <th className="text-left px-5 py-3 font-medium text-muted-foreground">Applies To</th>
                        <th className="text-left px-5 py-3 font-medium text-muted-foreground">No Class</th>
                        <th className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {holidays.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No holidays configured.</td></tr>
                      ) : holidays.map((h) => (
                        <tr key={h.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                          <td className="px-5 py-3.5 font-medium">{h.name}</td>
                          <td className="px-5 py-3.5 text-muted-foreground">{h.date}</td>
                          <td className="px-5 py-3.5">{h.appliesToAll ? "All Classes" : "Selected Classes"}</td>
                          <td className="px-5 py-3.5">
                            <span className={`text-xs font-medium ${h.isNoClass ? "text-red-600" : "text-green-600"}`}>{h.isNoClass ? "Yes" : "No"}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2 justify-end">
                              <button onClick={() => openEditHoliday(h)} className="p-1.5 hover:bg-accent rounded-lg">
                                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                              </button>
                              <button onClick={() => deleteHoliday(h.id)} className="p-1.5 hover:bg-red-50 rounded-lg">
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {/* ── Teachers ── */}
          {activeSection === "Teachers" && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2>Teacher Profiles</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Manage teacher records. These are used for class assignment and record-keeping.
                  </p>
                </div>
                <Button size="sm" onClick={openAddTeacher}><Plus className="w-4 h-4" /> Add Teacher</Button>
              </div>

              {teachers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No teacher profiles yet.</p>
              ) : (
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted border-b border-border">
                        <tr>
                          <th className="text-left px-5 py-3 font-medium text-muted-foreground">Name</th>
                          <th className="text-left px-5 py-3 font-medium text-muted-foreground">Email</th>
                          <th className="text-left px-5 py-3 font-medium text-muted-foreground">Phone</th>
                          <th className="text-left px-5 py-3 font-medium text-muted-foreground">Start Date</th>
                          <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                          <th className="px-5 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {teachers.map((t) => (
                          <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0 overflow-hidden">
                                  {t.avatarUrl
                                    ? <img src={t.avatarUrl} alt={t.fullName} className="w-full h-full object-cover" />
                                    : t.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
                                  }
                                </div>
                                <span className="font-medium">{t.fullName}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-muted-foreground">{t.email || "—"}</td>
                            <td className="px-5 py-3.5 text-muted-foreground">{t.phone || "—"}</td>
                            <td className="px-5 py-3.5 text-muted-foreground">{t.startDate || "—"}</td>
                            <td className="px-5 py-3.5">
                              <Badge variant={t.isActive ? "active" : "archived"}>{t.isActive ? "Active" : "Inactive"}</Badge>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2 justify-end">
                                <button onClick={() => openEditTeacher(t)} className="p-1.5 hover:bg-accent rounded-lg">
                                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                                <button onClick={() => deleteTeacher(t.id)} className="p-1.5 hover:bg-red-50 rounded-lg">
                                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
          {/* ── Student IDs ── */}
          {activeSection === "Student IDs" && (
            <Card>
              <CardHeader>
                <h2>Student ID Settings</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Configure how student codes are automatically generated (e.g. LL-0001).
                  Existing codes are not affected — only new students get auto-generated codes.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Prefix</label>
                    <Input
                      value={codeConfig.prefix}
                      onChange={(e) => setCodeConfig({ ...codeConfig, prefix: e.target.value })}
                      placeholder="e.g. LL"
                      maxLength={8}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Short text before the number (max 8 chars)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Number Padding</label>
                    <Select value={String(codeConfig.padding)} onChange={(e) => setCodeConfig({ ...codeConfig, padding: parseInt(e.target.value) })}>
                      <option value="3">3 digits — e.g. 001</option>
                      <option value="4">4 digits — e.g. 0001</option>
                      <option value="5">5 digits — e.g. 00001</option>
                    </Select>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={codeConfig.includeYear}
                    onChange={(e) => setCodeConfig({ ...codeConfig, includeYear: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  Include year in code (e.g. LL-26-0001 instead of LL-0001)
                </label>

                <div className="p-3 bg-muted rounded-lg text-sm">
                  <span className="text-muted-foreground">Preview: </span>
                  <span className="font-mono font-medium">
                    {codeConfig.includeYear
                      ? `${codeConfig.prefix || "LL"}-${String(new Date().getFullYear()).slice(-2)}-${String(1).padStart(codeConfig.padding, "0")}`
                      : `${codeConfig.prefix || "LL"}-${String(1).padStart(codeConfig.padding, "0")}`
                    }
                  </span>
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={saveCodeConfig} disabled={codeConfigSaving}>
                    {codeConfigSaving ? "Saving…" : "Save Settings"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Grading ── */}
          {activeSection === "Grading" && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2>Grading Scales</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Define the labels used for student progress and observations.
                    These replace the hardcoded ratings in the Progress page.
                  </p>
                </div>
                <Button size="sm" onClick={openAddScale}><Plus className="w-4 h-4" /> Add Scale</Button>
              </div>

              {gradingScales.length === 0 && (
                <p className="text-sm text-muted-foreground">No grading scales yet. Add one to get started.</p>
              )}

              <div className="space-y-3">
                {gradingScales.sort((a, b) => a.sortOrder - b.sortOrder).map((s) => (
                  <Card key={s.id}>
                    <CardContent className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1">
                        <span
                          className="w-4 h-4 rounded-full flex-shrink-0"
                          style={{ backgroundColor: s.color }}
                        />
                        <div>
                          <p className="font-semibold">{s.label}</p>
                          {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
                          {(s.minScore || s.maxScore) && (
                            <p className="text-xs text-muted-foreground">
                              Score: {s.minScore || "—"} – {s.maxScore || "—"}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEditScale(s)} className="p-1.5 hover:bg-accent rounded-lg">
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button onClick={() => deleteScale(s.id)} className="p-1.5 hover:bg-red-50 rounded-lg">
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}

          {/* ── Branding & Accessibility ── */}
          {activeSection === "Branding & Accessibility" && (
            <div className="space-y-6">
              <div>
                <h2>Branding &amp; Accessibility</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Customize your school&apos;s colors and logo, and adjust readability settings for parents and staff.
                </p>
              </div>
              {brandingError && <ErrorAlert message={brandingError} />}

              {/* A. Branding */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3>Branding</h3>
                    <button
                      onClick={resetBrandingToDefaults}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset to defaults
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">

                  {/* Logo */}
                  <div>
                    <label className="block text-sm font-medium mb-2">School Logo</label>
                    <div className="flex items-start gap-4">
                      <div className="w-20 h-20 rounded-xl border border-border flex items-center justify-center bg-muted overflow-hidden flex-shrink-0">
                        {(logoFile || logoUrl) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={logoFile ? URL.createObjectURL(logoFile) : logoUrl!}
                            alt="School logo"
                            className="w-full h-full object-contain p-1"
                          />
                        ) : (
                          <span className="text-3xl select-none">🏫</span>
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 2 * 1024 * 1024) { setBrandingError("Logo must be under 2 MB."); return; }
                              setBrandingError(null);
                              setLogoFile(file);
                            }}
                          />
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-accent cursor-pointer transition-colors">
                            <Upload className="w-3.5 h-3.5" />
                            {logoFile ? "Change logo" : logoUrl ? "Replace logo" : "Upload logo"}
                          </span>
                        </label>
                        {(logoUrl || logoFile) && (
                          <button
                            onClick={() => { setLogoUrl(null); setLogoFile(null); }}
                            className="block text-xs text-muted-foreground hover:text-destructive transition-colors"
                          >
                            Remove logo
                          </button>
                        )}
                        <p className="text-xs text-muted-foreground">PNG, JPG, or WEBP · Max 2 MB · Displayed in the sidebar and parent portal header.</p>
                      </div>
                    </div>
                  </div>

                  {/* Colors */}
                  <div className="grid grid-cols-2 gap-6">
                    {(["primaryColor", "accentColor"] as const).map((field) => {
                      const label = field === "primaryColor" ? "Primary Color" : "Accent Color";
                      const hex = brandingForm[field];
                      const lowContrast = field === "primaryColor" && hex.length === 7 && contrastRatio(hex, "#ffffff") < 3;
                      return (
                        <div key={field}>
                          <label className="block text-sm font-medium mb-2">{label}</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={hex}
                              onChange={(e) => setBrandingForm({ ...brandingForm, [field]: e.target.value })}
                              className="w-10 h-9 rounded border border-border cursor-pointer flex-shrink-0 p-0.5"
                            />
                            <Input
                              value={hex}
                              maxLength={7}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setBrandingForm({ ...brandingForm, [field]: v });
                              }}
                              className="font-mono text-xs"
                            />
                          </div>
                          {lowContrast && (
                            <p className="text-xs text-amber-600 mt-1">⚠ Low contrast — may be hard to read on white backgrounds.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Report footer */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Report Footer Text</label>
                    <Input
                      value={brandingForm.reportFooterText}
                      onChange={(e) => setBrandingForm({ ...brandingForm, reportFooterText: e.target.value })}
                      placeholder="e.g. Bright Kids Learning and Tutorial Center · Tel: 09XXXXXXXXX"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Printed at the bottom of billing statements and progress reports.</p>
                  </div>
                </CardContent>
              </Card>

              {/* B. Accessibility */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3>Readability Settings</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">Make the portal easier to read for parents and staff.</p>
                    </div>
                    <button
                      onClick={resetAccessibilityToDefaults}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">

                  {/* Text size */}
                  <div>
                    <label className="block text-sm font-medium mb-3">Text Size</label>
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        { value: "default",     label: "Default",     sample: "text-sm"  },
                        { value: "large",       label: "Large",       sample: "text-base" },
                        { value: "extra_large", label: "Extra Large", sample: "text-xl"  },
                      ] as const).map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setBrandingForm({ ...brandingForm, textSizeScale: opt.value })}
                          className={`p-3 rounded-xl border-2 text-center transition-colors ${
                            brandingForm.textSizeScale === opt.value
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/50"
                          }`}
                        >
                          <span className={`block font-semibold ${opt.sample} ${brandingForm.textSizeScale === opt.value ? "text-primary" : "text-foreground"}`}>Aa</span>
                          <span className="block text-xs mt-1 text-muted-foreground">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Spacing */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Line Spacing</label>
                    <p className="text-xs text-muted-foreground mb-3">Controls how much breathing room there is between lines of text.</p>
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        { value: "compact",  label: "Compact",  desc: "Denser, more content visible" },
                        { value: "default",  label: "Default",  desc: "Standard spacing"              },
                        { value: "relaxed",  label: "Relaxed",  desc: "More breathing room"           },
                      ] as const).map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setBrandingForm({ ...brandingForm, spacingScale: opt.value })}
                          className={`p-3 rounded-xl border-2 text-center transition-colors ${
                            brandingForm.spacingScale === opt.value
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/50"
                          }`}
                        >
                          <span className={`block text-sm font-medium ${brandingForm.spacingScale === opt.value ? "text-primary" : "text-foreground"}`}>{opt.label}</span>
                          <span className="block text-xs mt-1 text-muted-foreground leading-snug">{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Live preview */}
                  <div>
                    <label className="block text-sm font-medium mb-3">Live Preview</label>
                    <BrandingPreview form={brandingForm} />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={saveBranding} disabled={brandingSaving}>
                  {brandingSaving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Term Modal */}
      <Modal open={periodModal} onClose={() => setPeriodModal(false)} title={editingPeriod ? "Edit Term" : "Add Term"}>
        <div className="space-y-4">
          {periodForm.schoolYearId && (
            <p className="text-sm text-muted-foreground">
              Under: <strong>{schoolYears.find((sy) => sy.id === periodForm.schoolYearId)?.name ?? ""}</strong>
            </p>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Term Name *</label>
            <Input value={periodForm.name} onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })} placeholder="e.g. Regular Term, Summer Program" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date *</label>
              <Input type="date" value={periodForm.startDate} onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date *</label>
              <Input type="date" value={periodForm.endDate} onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <ModalCancelButton />
            <Button onClick={savePeriod} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>

      {/* School Year Modal */}
      <Modal open={syModal} onClose={() => setSyModal(false)} title={editingSy ? "Edit School Year" : "Add School Year"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">School Year Name *</label>
            <Input value={syForm.name} onChange={(e) => setSyForm({ ...syForm, name: e.target.value })} placeholder="e.g. SY 2026–2027" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date *</label>
              <Input type="date" value={syForm.startDate} onChange={(e) => setSyForm({ ...syForm, startDate: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date *</label>
              <Input type="date" value={syForm.endDate} onChange={(e) => setSyForm({ ...syForm, endDate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <Select value={syForm.status} onChange={(e) => setSyForm({ ...syForm, status: e.target.value as SchoolYearStatus })}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </Select>
            {syForm.status === "active" && (
              <p className="text-xs text-orange-600 mt-1">Setting this as Active will demote the current active year to Draft.</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <ModalCancelButton />
            <Button onClick={saveSy} disabled={!syForm.name || !syForm.startDate || !syForm.endDate || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Holiday Modal */}
      <Modal open={holidayModal} onClose={() => setHolidayModal(false)} title={editingHoliday ? "Edit Holiday" : "Add Holiday"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Holiday Name *</label>
            <Input value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} placeholder="e.g. Labor Day" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date *</label>
            <Input type="date" value={holidayForm.date} onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })} />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={holidayForm.appliesToAll} onChange={(e) => setHolidayForm({ ...holidayForm, appliesToAll: e.target.checked })} className="w-4 h-4 rounded" />
              Applies to all classes
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={holidayForm.isNoClass} onChange={(e) => setHolidayForm({ ...holidayForm, isNoClass: e.target.checked })} className="w-4 h-4 rounded" />
              No classes on this day
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <Textarea value={holidayForm.notes} onChange={(e) => setHolidayForm({ ...holidayForm, notes: e.target.value })} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <ModalCancelButton />
            <Button onClick={saveHoliday} disabled={!holidayForm.name || !holidayForm.date || saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>

      {/* Grading Scale Modal */}
      <Modal open={gradingModal} onClose={() => setGradingModal(false)} title={editingScale ? "Edit Grading Scale" : "Add Grading Scale"}>
        <div className="space-y-4">
          {gradingFormError && <ErrorAlert message={gradingFormError} />}
          <div>
            <label className="block text-sm font-medium mb-1">Label *</label>
            <Input value={gradingForm.label} onChange={(e) => setGradingForm({ ...gradingForm, label: e.target.value })} placeholder="e.g. Emerging, Developing, Achieved" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Input value={gradingForm.description} onChange={(e) => setGradingForm({ ...gradingForm, description: e.target.value })} placeholder="What this level means..." />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={gradingForm.color}
                  onChange={(e) => setGradingForm({ ...gradingForm, color: e.target.value })}
                  className="w-10 h-9 rounded border border-border cursor-pointer"
                />
                <Input value={gradingForm.color} onChange={(e) => setGradingForm({ ...gradingForm, color: e.target.value })} className="font-mono text-xs" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Min Score</label>
              <Input type="number" value={gradingForm.minScore} onChange={(e) => setGradingForm({ ...gradingForm, minScore: e.target.value })} placeholder="Optional" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Score</label>
              <Input type="number" value={gradingForm.maxScore} onChange={(e) => setGradingForm({ ...gradingForm, maxScore: e.target.value })} placeholder="Optional" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Sort Order</label>
            <Input type="number" min={1} value={gradingForm.sortOrder} onChange={(e) => setGradingForm({ ...gradingForm, sortOrder: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <ModalCancelButton />
            <Button onClick={saveScale} disabled={saving || !gradingForm.label}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>

      {/* Teacher Modal */}
      <Modal open={teacherModal} onClose={() => setTeacherModal(false)} title={editingTeacher ? "Edit Teacher" : "Add Teacher"}>
        <div className="space-y-4">
          {teacherFormError && <ErrorAlert message={teacherFormError} />}

          {/* Photo */}
          <div className="flex items-center gap-4">
            <AvatarUpload
              currentUrl={teacherPhotoFile ? URL.createObjectURL(teacherPhotoFile) : (teacherForm.avatarUrl || null)}
              name={teacherForm.fullName || "Teacher"}
              size="lg"
              onFileSelect={(file) => setTeacherPhotoFile(file)}
            />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Profile Photo</p>
              <p>Click to upload a photo.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Full Name *</label>
              <Input value={teacherForm.fullName} onChange={(e) => setTeacherForm({ ...teacherForm, fullName: e.target.value })} placeholder="Teacher's full name" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <Input type="email" value={teacherForm.email} onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })} placeholder="teacher@school.com" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <Input value={teacherForm.phone} onChange={(e) => setTeacherForm({ ...teacherForm, phone: e.target.value })} placeholder="09XXXXXXXXX" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <Input type="date" value={teacherForm.startDate} onChange={(e) => setTeacherForm({ ...teacherForm, startDate: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date</label>
              <Input type="date" value={teacherForm.endDate} onChange={(e) => setTeacherForm({ ...teacherForm, endDate: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <Textarea value={teacherForm.notes} onChange={(e) => setTeacherForm({ ...teacherForm, notes: e.target.value })} rows={2} placeholder="Optional notes" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={teacherForm.isActive} onChange={(e) => setTeacherForm({ ...teacherForm, isActive: e.target.checked })} className="w-4 h-4 rounded" />
            Active (currently employed)
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <ModalCancelButton />
            <Button onClick={saveTeacher} disabled={saving || !teacherForm.fullName}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
