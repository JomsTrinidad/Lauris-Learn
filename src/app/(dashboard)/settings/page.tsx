"use client";
import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, Upload, RotateCcw, Library, BookOpen, HelpCircle, X, Search, ChevronDown, ChevronRight, AlertTriangle, Check } from "lucide-react";
import { GradingTemplate, GRADING_TEMPLATES } from "@/lib/grading-templates";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { compressImage, PROFILE_PHOTO_MAX_W, PROFILE_PHOTO_MAX_BYTES } from "@/lib/image-compress";
import { validateUpload, contentTypeFromExt, LOGO_MAX_BYTES } from "@/lib/upload-validate";
import { trackUpload } from "@/lib/track-upload";
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
import { GetStartedGuide } from "@/components/GetStartedGuide";

type SchoolYearStatus = "draft" | "active" | "archived" | "planned" | "closed";

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

type ClassLevelKind = "core" | "sped" | "bridge" | "summer" | "mixed_age" | "enrichment" | "other";

interface ClassLevel {
  id: string;
  name: string;
  kind: ClassLevelKind;
  displayOrder: number;
  progressionOrder: number | null;
  archivedAt: string | null;
}

const CLASS_LEVEL_KINDS: { value: ClassLevelKind; label: string; hint: string }[] = [
  { value: "core",        label: "Core",        hint: "Main level sequence (e.g. Toddlers, Pre-Kinder)" },
  { value: "sped",        label: "SPED",        hint: "Special education / individualized program" },
  { value: "bridge",      label: "Bridge",      hint: "Transitional between two levels" },
  { value: "summer",      label: "Summer",      hint: "Summer term only" },
  { value: "mixed_age",   label: "Mixed Age",   hint: "Spans multiple age groups" },
  { value: "enrichment",  label: "Enrichment",  hint: "After-school / electives / clubs" },
  { value: "other",       label: "Other",       hint: "Anything else" },
];

const SECTIONS = ["School Information", "Policies & Workflows", "School Year & Terms", "Holidays", "Teachers", "Class Levels", "Student IDs", "Grading", "Branding & Accessibility"] as const;
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

type ScaleMode = "label_only" | "range_based";

interface GradingScaleSet {
  id: string;
  name: string;
  description: string;
  scaleMode: ScaleMode;
  isDefault: boolean;
}

interface GradingScale {
  id: string;
  scaleSetId: string | null;
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

type GradingAssignmentType = "school_default" | "level_default" | "domain_default" | "student_domain_override";

interface GradingScaleAssignment {
  id: string;
  gradingScaleSetId: string;
  assignmentType: GradingAssignmentType;
  levelId: string | null;
  domainId: string | null;
  studentId: string | null;
  isActive: boolean;
}

interface ProgressCategory {
  id: string;
  name: string;
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

  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSearch, setHelpSearch] = useState("");
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});
  const [helpView, setHelpView] = useState<"topics" | "getting-started">("topics");

  // School info
  const [schoolInfo, setSchoolInfo] = useState({
    schoolName: "", branchName: "", address: "", phone: "", email: "",
    region: "", schoolsDivision: "", district: "",
  });

  // School years
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [syModal, setSyModal] = useState(false);
  const [editingSy, setEditingSy] = useState<SchoolYear | null>(null);
  const [syForm, setSyForm] = useState({ name: "", startDate: "", endDate: "", status: "planned" as SchoolYearStatus });

  // Close year modal
  const [closeYearModal, setCloseYearModal] = useState(false);
  const [closeYearChecking, setCloseYearChecking] = useState(false);
  const [closeYearUnclassified, setCloseYearUnclassified] = useState<{ id: string; name: string }[]>([]);
  const [closeYearForce, setCloseYearForce] = useState(false);

  // Activate year confirmation modal (replaces browser confirm() so we can include an action link)
  const [activateConfirm, setActivateConfirm] = useState<{
    yearId: string; currentYearName: string; unclassifiedCount: number;
  } | null>(null);
  const [activateChecking, setActivateChecking] = useState(false);

  // Enrollment balance policy
  const [balancePolicy, setBalancePolicy] = useState<"warn" | "block" | "allow">("warn");
  const [iepWorkflowMode, setIepWorkflowMode] = useState<"simple_review" | "admin_approval_required">("simple_review");

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

  // Class Levels
  const [classLevels, setClassLevels] = useState<ClassLevel[]>([]);
  const [classLevelModal, setClassLevelModal] = useState(false);
  const [editingClassLevel, setEditingClassLevel] = useState<ClassLevel | null>(null);
  const [classLevelForm, setClassLevelForm] = useState<{ name: string; kind: ClassLevelKind; progressionOrder: string }>({ name: "", kind: "core", progressionOrder: "" });
  const [classLevelFormError, setClassLevelFormError] = useState<string | null>(null);
  const [classLevelShowArchived, setClassLevelShowArchived] = useState(false);
  const [classLevelInUseCounts, setClassLevelInUseCounts] = useState<Record<string, number>>({});

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
  const [gradingScaleSets, setGradingScaleSets] = useState<GradingScaleSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string>("");
  const [setModal, setSetModal] = useState(false);
  const [editingSet, setEditingSet] = useState<GradingScaleSet | null>(null);
  const [setForm, setSetForm] = useState({ name: "", description: "", scaleMode: "label_only" as ScaleMode });
  const [setFormError, setSetFormError] = useState<string | null>(null);
  const [templateModal, setTemplateModal] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<GradingTemplate | null>(null);
  const [templateApplying, setTemplateApplying] = useState(false);

  // Scale Assignments
  const [scaleAssignments, setScaleAssignments] = useState<GradingScaleAssignment[]>([]);
  const [progressCategories, setProgressCategories] = useState<ProgressCategory[]>([]);
  const [assignmentSaving, setAssignmentSaving] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  // Branding & Accessibility
  const [brandingForm, setBrandingForm] = useState<BrandingForm>(BRANDING_DEFAULTS);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!schoolId) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [{ data: school }, { data: branches }, { data: years }, { data: hols }, { data: periods }, { data: teacherRows }, { data: codeRow }, { data: scaleRows }, { data: scaleSetRows }, { data: levelRows }, { data: levelUsage }, { data: assignmentRows }, { data: categoryRows }] =
      await Promise.all([
        supabase.from("schools").select("name, enrollment_balance_policy, iep_workflow_mode, region, schools_division, district").eq("id", schoolId).single(),
        supabase.from("branches").select("name, address, phone").eq("school_id", schoolId).limit(1).maybeSingle(),
        supabase.from("school_years").select("id, name, start_date, end_date, status").eq("school_id", schoolId).order("start_date", { ascending: false }),
        supabase.from("holidays").select("id, name, date, applies_to_all, is_no_class, notes").eq("school_id", schoolId).order("date"),
        supabase.from("academic_periods").select("id, school_year_id, name, start_date, end_date, is_active, school_years(name)").eq("school_id", schoolId).order("start_date"),
        sb.from("teacher_profiles").select("id, full_name, email, phone, start_date, end_date, is_active, notes, avatar_url").eq("school_id", schoolId).order("full_name"),
        sb.from("schools").select("student_code_prefix, student_code_padding, student_code_include_year, logo_url, primary_color, accent_color, report_footer_text, text_size_scale, spacing_scale").eq("id", schoolId).single(),
        sb.from("grading_scales").select("id, scale_set_id, label, description, color, min_score, max_score, sort_order").eq("school_id", schoolId).order("sort_order"),
        sb.from("grading_scale_sets").select("id, name, description, scale_mode, is_default").eq("school_id", schoolId).order("name"),
        sb.from("class_levels").select("id, name, kind, display_order, progression_order, archived_at").eq("school_id", schoolId).order("display_order").order("name"),
        sb.from("classes").select("level_id").eq("school_id", schoolId).not("level_id", "is", null),
        sb.from("grading_scale_assignments").select("id, grading_scale_set_id, assignment_type, level_id, domain_id, student_id, is_active").eq("school_id", schoolId),
        sb.from("progress_categories").select("id, name").eq("school_id", schoolId).order("name"),
      ]);

    setSchoolInfo({
      schoolName: school?.name ?? "",
      branchName: (branches as any)?.name ?? "",
      address: (branches as any)?.address ?? "",
      phone: (branches as any)?.phone ?? "",
      email: "",
      region: (school as any)?.region ?? "",
      schoolsDivision: (school as any)?.schools_division ?? "",
      district: (school as any)?.district ?? "",
    });
    setBalancePolicy(((school as any)?.enrollment_balance_policy ?? "warn") as "warn" | "block" | "allow");
    setIepWorkflowMode(((school as any)?.iep_workflow_mode ?? "simple_review") as "simple_review" | "admin_approval_required");

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setClassLevels((levelRows ?? []).map((l: any) => ({
      id: l.id,
      name: l.name,
      kind: l.kind as ClassLevelKind,
      displayOrder: l.display_order ?? 0,
      progressionOrder: l.progression_order ?? null,
      archivedAt: l.archived_at ?? null,
    })));

    const usage: Record<string, number> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (levelUsage ?? []) as any[]) {
      if (c.level_id) usage[c.level_id] = (usage[c.level_id] ?? 0) + 1;
    }
    setClassLevelInUseCounts(usage);

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
    const mappedSets: GradingScaleSet[] = ((scaleSetRows ?? []) as any[]).map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? "",
      scaleMode: s.scale_mode as ScaleMode,
      isDefault: s.is_default,
    }));
    setGradingScaleSets(mappedSets);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setGradingScales(((scaleRows ?? []) as any[]).map((s: any) => ({
      id: s.id,
      scaleSetId: s.scale_set_id ?? null,
      label: s.label,
      description: s.description ?? "",
      color: s.color ?? "#6b7280",
      minScore: s.min_score != null ? String(s.min_score) : "",
      maxScore: s.max_score != null ? String(s.max_score) : "",
      sortOrder: s.sort_order ?? 0,
    })));
    setSelectedSetId((prev) => {
      if (prev && mappedSets.some((s) => s.id === prev)) return prev;
      const def = mappedSets.find((s) => s.isDefault);
      return def?.id ?? mappedSets[0]?.id ?? "";
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setScaleAssignments(((assignmentRows ?? []) as any[]).map((a: any) => ({
      id: a.id,
      gradingScaleSetId: a.grading_scale_set_id,
      assignmentType: a.assignment_type as GradingAssignmentType,
      levelId: a.level_id ?? null,
      domainId: a.domain_id ?? null,
      studentId: a.student_id ?? null,
      isActive: a.is_active,
    })));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setProgressCategories(((categoryRows ?? []) as any[]).map((c: any) => ({
      id: c.id,
      name: c.name,
    })));

    setLoading(false);
  }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);


  async function uploadProfilePhoto(
    folder: string, id: string, file: File,
    tracking?: { entityType: string; entityId: string | null },
  ): Promise<string | null> {
    const compressed = await compressImage(file, PROFILE_PHOTO_MAX_W, PROFILE_PHOTO_MAX_BYTES);
    const path = `${folder}/${id}.jpg`;
    const { error } = await supabase.storage.from("profile-photos").upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
    if (error) return null;
    if (tracking) {
      await trackUpload(supabase, {
        schoolId, uploadedBy: userId, entityType: tracking.entityType, entityId: tracking.entityId,
        bucket: "profile-photos", storagePath: path,
        fileSize: compressed.size, mimeType: "image/jpeg",
      });
    }
    const { data } = supabase.storage.from("profile-photos").getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
  }

  async function saveAdminPhoto() {
    if (!adminPhotoFile || !userId) return;
    setAdminPhotoSaving(true);
    setAdminPhotoError(null);
    const url = await uploadProfilePhoto(`admins/${schoolId}`, userId, adminPhotoFile, { entityType: "admin", entityId: userId });
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
    const { error: e1 } = await supabase
      .from("schools")
      .update({
        name: schoolInfo.schoolName,
        region: schoolInfo.region || null,
        schools_division: schoolInfo.schoolsDivision || null,
        district: schoolInfo.district || null,
      })
      .eq("id", schoolId);
    const { data: existing } = await supabase.from("branches").select("id").eq("school_id", schoolId).limit(1).maybeSingle();
    if (existing?.id) {
      await supabase.from("branches").update({ name: schoolInfo.branchName, address: schoolInfo.address, phone: schoolInfo.phone || null }).eq("id", existing.id);
    } else if (schoolInfo.branchName) {
      await supabase.from("branches").insert({ school_id: schoolId, name: schoolInfo.branchName, address: schoolInfo.address, phone: schoolInfo.phone || null });
    }
    if (e1) { setError(e1.message); } else { refreshCtx(); }
    setSaving(false);
  }

  async function savePolicies() {
    if (!schoolId) return;
    setSaving(true);
    const { error } = await supabase
      .from("schools")
      .update({
        enrollment_balance_policy: balancePolicy,
        iep_workflow_mode: iepWorkflowMode,
      })
      .eq("id", schoolId);
    if (error) { setError(error.message); } else { refreshCtx(); }
    setSaving(false);
  }

  // ── School Years ──
  function openAddSy() {
    setEditingSy(null);
    setSyForm({ name: "", startDate: "", endDate: "", status: "planned" });
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

    // If setting to active via modal, demote the current active year first
    if (syForm.status === "active") {
      await supabase.from("school_years").update({ status: "closed" }).eq("school_id", schoolId).eq("status", "active");
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
    if (syForm.status === "active") refreshCtx();
  }

  // Activate a planned year: check for unclassified students, then either proceed directly
  // or surface a modal so the admin can navigate to Year-End Classification first.
  async function activateSy(id: string) {
    if (!schoolId) return;
    const currentActive = schoolYears.find((sy) => sy.status === "active");
    if (currentActive) {
      setActivateChecking(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase as any)
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("school_year_id", currentActive.id)
        .eq("status", "enrolled")
        .is("progression_status", null);
      setActivateChecking(false);
      const unclassifiedCount = count ?? 0;
      // Always go through the modal so the admin sees a clear transition confirmation.
      setActivateConfirm({ yearId: id, currentYearName: currentActive.name, unclassifiedCount });
      return;
    }
    // No current active year — activate immediately.
    await performActivateSy(id);
  }

  async function performActivateSy(id: string) {
    if (!schoolId) return;
    await supabase.from("school_years").update({ status: "closed" }).eq("school_id", schoolId).eq("status", "active");
    await supabase.from("school_years").update({ status: "active" }).eq("id", id);
    setActivateConfirm(null);
    await load();
    refreshCtx();
  }

  // Kick off close-year flow: validate unclassified students, then open modal.
  async function initiateCloseYear() {
    if (!schoolId) return;
    const activeSy = schoolYears.find((sy) => sy.status === "active");
    if (!activeSy) return;
    setCloseYearChecking(true);
    setCloseYearForce(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("enrollments")
      .select("id, progression_status, students!inner(id, first_name, last_name)")
      .eq("school_year_id", activeSy.id)
      .eq("status", "enrolled")
      .is("progression_status", null);
    setCloseYearUnclassified(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((data ?? []) as any[]).map((e: any) => ({
        id: e.students.id,
        name: `${e.students.first_name} ${e.students.last_name}`,
      }))
    );
    setCloseYearChecking(false);
    setCloseYearModal(true);
  }

  // Execute the close: set active year → closed.
  async function confirmCloseYear() {
    if (!schoolId) return;
    const activeSy = schoolYears.find((sy) => sy.status === "active");
    if (!activeSy) return;
    setSaving(true);
    await supabase.from("school_years").update({ status: "closed" }).eq("id", activeSy.id);
    setSaving(false);
    setCloseYearModal(false);
    setCloseYearForce(false);
    await load();
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
    if (periodForm.endDate < periodForm.startDate) {
      setError("End date cannot be before the start date.");
      return;
    }
    const parentYear = schoolYears.find((sy) => sy.id === periodForm.schoolYearId);
    if (parentYear) {
      if (periodForm.startDate < parentYear.startDate) {
        setError(`Term start date cannot be before the school year start date (${new Date(parentYear.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}).`);
        return;
      }
      if (periodForm.endDate > parentYear.endDate) {
        setError(`Term end date cannot be beyond the school year end date (${new Date(parentYear.endDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}).`);
        return;
      }
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
    if (!teacherForm.email.trim()) { setTeacherFormError("Email is required — teachers use it to log in."); return; }
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
      const url = await uploadProfilePhoto(`teachers/${schoolId}`, savedId, teacherPhotoFile, { entityType: "teacher", entityId: savedId });
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

  // ── Class Levels ──
  function openAddClassLevel() {
    setEditingClassLevel(null);
    setClassLevelForm({ name: "", kind: "core", progressionOrder: "" });
    setClassLevelFormError(null);
    setClassLevelModal(true);
  }
  function openEditClassLevel(l: ClassLevel) {
    setEditingClassLevel(l);
    setClassLevelForm({ name: l.name, kind: l.kind, progressionOrder: l.progressionOrder != null ? String(l.progressionOrder) : "" });
    setClassLevelFormError(null);
    setClassLevelModal(true);
  }
  async function saveClassLevel() {
    if (!schoolId) return;
    const name = classLevelForm.name.trim();
    if (!name) { setClassLevelFormError("Name is required."); return; }
    // Parse progression_order — only valid for core kind, must be a positive integer
    let progressionOrderVal: number | null = null;
    if (classLevelForm.kind === "core" && classLevelForm.progressionOrder.trim() !== "") {
      const parsed = parseInt(classLevelForm.progressionOrder.trim(), 10);
      if (isNaN(parsed) || parsed < 1) { setClassLevelFormError("Progression order must be a positive whole number (e.g. 1, 2, 3)."); return; }
      progressionOrderVal = parsed;
    }
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    if (editingClassLevel) {
      const { error: err } = await sb.from("class_levels")
        .update({ name, kind: classLevelForm.kind, progression_order: progressionOrderVal })
        .eq("id", editingClassLevel.id);
      if (err) {
        setClassLevelFormError(err.code === "23505"
          ? "Another core level already uses that progression order number. Choose a different number."
          : err.message);
        setSaving(false); return;
      }
    } else {
      const nextOrder = classLevels.length > 0
        ? Math.max(...classLevels.map((l) => l.displayOrder)) + 1
        : 0;
      const { error: err } = await sb.from("class_levels").insert({
        school_id: schoolId, name, kind: classLevelForm.kind, display_order: nextOrder,
        progression_order: progressionOrderVal,
      });
      if (err) {
        setClassLevelFormError(err.code === "23505"
          ? "A level with that name already exists."
          : err.message);
        setSaving(false); return;
      }
    }
    setClassLevelModal(false);
    await load();
    setSaving(false);
  }
  async function archiveClassLevel(id: string) {
    if (!confirm("Archive this level? Existing classes keep their assignment, but the level won't appear in the dropdown for new classes.")) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("class_levels").update({ archived_at: new Date().toISOString() }).eq("id", id);
    setClassLevels((prev) => prev.map((l) => l.id === id ? { ...l, archivedAt: new Date().toISOString() } : l));
  }
  async function unarchiveClassLevel(id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("class_levels").update({ archived_at: null }).eq("id", id);
    setClassLevels((prev) => prev.map((l) => l.id === id ? { ...l, archivedAt: null } : l));
  }
  async function deleteClassLevel(l: ClassLevel) {
    const inUse = classLevelInUseCounts[l.id] ?? 0;
    if (inUse > 0) {
      alert(`Cannot delete — ${inUse} class${inUse !== 1 ? "es" : ""} still assigned to this level. Archive it instead, or reassign those classes first.`);
      return;
    }
    if (!confirm(`Delete level "${l.name}"? This cannot be undone.`)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any).from("class_levels").delete().eq("id", l.id);
    if (err) { alert(err.message); return; }
    setClassLevels((prev) => prev.filter((x) => x.id !== l.id));
  }
  async function moveClassLevel(id: string, direction: "up" | "down") {
    const visible = classLevels.filter((l) => classLevelShowArchived || !l.archivedAt);
    const idx = visible.findIndex((l) => l.id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= visible.length) return;
    const a = visible[idx], b = visible[swapIdx];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    await Promise.all([
      sb.from("class_levels").update({ display_order: b.displayOrder }).eq("id", a.id),
      sb.from("class_levels").update({ display_order: a.displayOrder }).eq("id", b.id),
    ]);
    setClassLevels((prev) => prev.map((l) =>
      l.id === a.id ? { ...l, displayOrder: b.displayOrder } :
      l.id === b.id ? { ...l, displayOrder: a.displayOrder } : l
    ).sort((x, y) => x.displayOrder - y.displayOrder || x.name.localeCompare(y.name)));
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
    if (!selectedSetId) return;
    setEditingScale(null);
    const setScalesCount = gradingScales.filter((s) => s.scaleSetId === selectedSetId).length;
    setGradingForm({ label: "", description: "", color: "#6b7280", minScore: "", maxScore: "", sortOrder: String(setScalesCount + 1) });
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
    const activeSet = gradingScaleSets.find((s) => s.id === selectedSetId) ?? null;
    if (!gradingForm.label.trim()) { setGradingFormError("Label is required."); return; }
    if (activeSet?.scaleMode === "range_based") {
      if (!gradingForm.minScore || !gradingForm.maxScore) {
        setGradingFormError("Min score and max score are required for score-based scales.");
        return;
      }
      const min = parseFloat(gradingForm.minScore);
      const max = parseFloat(gradingForm.maxScore);
      if (min > max) { setGradingFormError("Min score cannot be greater than max score."); return; }
      const siblings = gradingScales.filter((s) => s.scaleSetId === selectedSetId && s.id !== editingScale?.id);
      for (const sib of siblings) {
        if (sib.minScore === "" || sib.maxScore === "") continue;
        const sibMin = parseFloat(sib.minScore);
        const sibMax = parseFloat(sib.maxScore);
        if (!(max < sibMin || min > sibMax)) {
          setGradingFormError(`Score range ${min}–${max} overlaps with "${sib.label}" (${sibMin}–${sibMax}).`);
          return;
        }
      }
    }
    if (!schoolId) return;
    setSaving(true);
    setGradingFormError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const payload = {
      school_id: schoolId,
      scale_set_id: selectedSetId || null,
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
    if (!confirm("Delete this grading level? This cannot be undone.")) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("grading_scales").delete().eq("id", id);
    setGradingScales((prev) => prev.filter((s) => s.id !== id));
  }

  // ── Grading Scale Sets ──
  function openAddSet() {
    setEditingSet(null);
    setSetForm({ name: "", description: "", scaleMode: "label_only" });
    setSetFormError(null);
    setSetModal(true);
  }
  function openEditSet(set: GradingScaleSet) {
    setEditingSet(set);
    setSetForm({ name: set.name, description: set.description, scaleMode: set.scaleMode });
    setSetFormError(null);
    setSetModal(true);
  }
  async function saveScaleSet() {
    if (!setForm.name.trim()) { setSetFormError("Group name is required."); return; }
    if (!schoolId) return;
    setSaving(true);
    setSetFormError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const isFirst = gradingScaleSets.length === 0 && !editingSet;
    const payload = {
      school_id: schoolId,
      name: setForm.name.trim(),
      description: setForm.description.trim() || null,
      scale_mode: setForm.scaleMode,
      is_default: isFirst,
    };
    if (editingSet) {
      const { error: e } = await sb.from("grading_scale_sets").update({ name: payload.name, description: payload.description, scale_mode: payload.scale_mode }).eq("id", editingSet.id);
      if (e) { setSetFormError(e.message); setSaving(false); return; }
    } else {
      const { data: ins, error: e } = await sb.from("grading_scale_sets").insert(payload).select("id").single();
      if (e) { setSetFormError(e.message); setSaving(false); return; }
      if (ins?.id) setSelectedSetId(ins.id);
    }
    setSetModal(false);
    setSaving(false);
    await load();
  }
  async function deleteScaleSet(id: string) {
    const set = gradingScaleSets.find((s) => s.id === id);
    if (!set) return;
    const count = gradingScales.filter((s) => s.scaleSetId === id).length;
    const msg = count > 0
      ? `Delete "${set.name}" and its ${count} grading level${count !== 1 ? "s" : ""}? This cannot be undone.`
      : `Delete "${set.name}"?`;
    if (!confirm(msg)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("grading_scale_sets").delete().eq("id", id);
    const remaining = gradingScaleSets.filter((s) => s.id !== id);
    setGradingScaleSets(remaining);
    setGradingScales((prev) => prev.filter((s) => s.scaleSetId !== id));
    if (selectedSetId === id) setSelectedSetId(remaining[0]?.id ?? "");
  }

  // ── Scale Assignments ──
  async function saveAssignment(
    type: "school_default" | "level_default" | "domain_default",
    scaleSetId: string,
    contextId?: string,
  ) {
    if (!schoolId) return;
    const saveKey = type + (contextId ?? "");
    setAssignmentSaving(saveKey);
    setAssignmentError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const existing = scaleAssignments.find(
      (a) =>
        a.isActive &&
        a.assignmentType === type &&
        (type === "level_default" ? a.levelId === contextId : true) &&
        (type === "domain_default" ? a.domainId === contextId : true),
    );

    if (!scaleSetId) {
      if (existing) {
        const { error: e } = await sb.from("grading_scale_assignments").update({ is_active: false }).eq("id", existing.id);
        if (e) { setAssignmentError(e.message); setAssignmentSaving(null); return; }
        setScaleAssignments((prev) => prev.map((a) => a.id === existing.id ? { ...a, isActive: false } : a));
      }
    } else if (existing) {
      const { error: e } = await sb.from("grading_scale_assignments").update({ grading_scale_set_id: scaleSetId }).eq("id", existing.id);
      if (e) { setAssignmentError(e.message); setAssignmentSaving(null); return; }
      setScaleAssignments((prev) => prev.map((a) => a.id === existing.id ? { ...a, gradingScaleSetId: scaleSetId } : a));
    } else {
      const payload: Record<string, unknown> = {
        school_id: schoolId,
        grading_scale_set_id: scaleSetId,
        assignment_type: type,
        is_active: true,
      };
      if (type === "level_default" && contextId) payload.level_id = contextId;
      if (type === "domain_default" && contextId) payload.domain_id = contextId;
      const { data: ins, error: e } = await sb.from("grading_scale_assignments").insert(payload).select("id").single();
      if (e) { setAssignmentError(e.message); setAssignmentSaving(null); return; }
      if (ins?.id) {
        setScaleAssignments((prev) => [...prev, {
          id: ins.id,
          gradingScaleSetId: scaleSetId,
          assignmentType: type,
          levelId: type === "level_default" ? (contextId ?? null) : null,
          domainId: type === "domain_default" ? (contextId ?? null) : null,
          studentId: null,
          isActive: true,
        }]);
      }
    }
    setAssignmentSaving(null);
  }

  // ── Templates ──
  async function applyTemplate(action: "replace" | "add") {
    if (!pendingTemplate || !schoolId) return;
    setTemplateApplying(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    let targetSetId = selectedSetId;

    if (action === "add" || !targetSetId) {
      const { data: ins, error: e } = await sb.from("grading_scale_sets").insert({
        school_id: schoolId,
        name: pendingTemplate.name,
        description: pendingTemplate.description,
        scale_mode: pendingTemplate.scaleMode,
        is_default: gradingScaleSets.length === 0,
      }).select("id").single();
      if (e) { setTemplateApplying(false); return; }
      targetSetId = ins.id;
    } else {
      await sb.from("grading_scale_sets").update({
        name: pendingTemplate.name,
        description: pendingTemplate.description,
        scale_mode: pendingTemplate.scaleMode,
      }).eq("id", targetSetId);
      await sb.from("grading_scales").delete().eq("scale_set_id", targetSetId);
    }

    const items = pendingTemplate.items.map((item) => ({
      school_id: schoolId,
      scale_set_id: targetSetId,
      label: item.label,
      description: item.description,
      color: item.color,
      sort_order: item.sortOrder,
      min_score: item.minScore,
      max_score: item.maxScore,
    }));
    await sb.from("grading_scales").insert(items);

    setTemplateApplying(false);
    setTemplateModal(false);
    setPendingTemplate(null);
    setSelectedSetId(targetSetId);
    await load();
  }

  // ── Branding & Accessibility ──────────────────────────────────────────────

  async function saveBranding() {
    if (!schoolId) return;
    setBrandingSaving(true);
    setBrandingError(null);
    try {
      let newLogoUrl = logoUrl;
      let logoChanged = logoRemoved;

      if (logoFile) {
        const logoValidationError = validateUpload(logoFile, LOGO_MAX_BYTES);
        if (logoValidationError) {
          setBrandingError(logoValidationError);
          setBrandingSaving(false);
          return;
        }
        const ext = ("." + (logoFile.name.split(".").pop() ?? "jpeg")).toLowerCase();
        const path = `school-logos/${schoolId}${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("profile-photos")
          .upload(path, logoFile, {
            upsert: true,
            // Derive contentType from the validated extension, not from the browser-provided file.type
            contentType: contentTypeFromExt(logoFile.name),
          });
        if (uploadErr) {
          setBrandingError("Logo upload failed: " + uploadErr.message);
          return;
        }
        await trackUpload(supabase, {
          schoolId, uploadedBy: userId, entityType: "school_logo", entityId: schoolId,
          bucket: "profile-photos", storagePath: path,
          fileSize: logoFile.size, mimeType: contentTypeFromExt(logoFile.name),
        });
        const { data: urlData } = supabase.storage.from("profile-photos").getPublicUrl(path);
        newLogoUrl = `${urlData.publicUrl}?t=${Date.now()}`;
        setLogoUrl(newLogoUrl);
        setLogoFile(null);
        logoChanged = true;
      }

      const payload: Record<string, unknown> = {
        // Only write logo_url when the user explicitly uploaded or removed it.
        // Skipping it on color/accessibility saves prevents accidentally wiping a
        // previously saved logo when logoUrl state happens to be null on remount.
        ...(logoChanged ? { logo_url: newLogoUrl } : {}),
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
        if (logoChanged) setLogoRemoved(false);
        patchBranding({
          ...(logoChanged ? { logoUrl: newLogoUrl } : {}),
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
    setLogoRemoved(false);
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

  const selectedSet = gradingScaleSets.find((s) => s.id === selectedSetId) ?? null;
  const setScales = gradingScales.filter((s) => s.scaleSetId === selectedSetId).sort((a, b) => a.sortOrder - b.sortOrder);

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
      <div className="flex items-center justify-between">
        <div>
          <h1>Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure your school, school years, and holidays</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setHelpOpen(true); setHelpSearch(""); setHelpView("topics"); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-medium transition-colors hidden sm:flex">
            <HelpCircle className="w-4 h-4" /> Help Topics
          </button>
        </div>
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
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Region</label>
                    <Input value={schoolInfo.region} onChange={(e) => setSchoolInfo({ ...schoolInfo, region: e.target.value })} placeholder="e.g. Region IV-A" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Schools Division</label>
                    <Input value={schoolInfo.schoolsDivision} onChange={(e) => setSchoolInfo({ ...schoolInfo, schoolsDivision: e.target.value })} placeholder="e.g. Division of Laguna" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">District</label>
                    <Input value={schoolInfo.district} onChange={(e) => setSchoolInfo({ ...schoolInfo, district: e.target.value })} placeholder="e.g. Calamba District I" />
                  </div>
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
                    onValidationError={(msg) => setAdminPhotoError(msg)}
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

          {/* ── Policies & Workflows ── */}
          {activeSection === "Policies & Workflows" && (
            <div className="space-y-6">
              {/* Enrollment Policies */}
              <Card>
                <CardHeader>
                  <h2>Enrollment Policies</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Rules that govern how students are enrolled and re-enrolled.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Prior-Year Balance Policy</label>
                    <p className="text-xs text-muted-foreground mb-2">
                      What happens when a returning student has an unpaid balance from a previous school year.
                    </p>
                    <Select value={balancePolicy} onChange={(e) => setBalancePolicy(e.target.value as "warn" | "block" | "allow")}>
                      <option value="warn">Show warning but allow enrollment (recommended)</option>
                      <option value="block">Block enrollment until prior balance is paid</option>
                      <option value="allow">Allow enrollment silently</option>
                    </Select>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button onClick={savePolicies} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
                  </div>
                </CardContent>
              </Card>

              {/* IEP Workflow */}
              <Card>
                <CardHeader>
                  <h2>IEP Workflow</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Choose how your school reviews and finalizes IEP plans.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Review Mode</label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Changing this affects new plans only — plans already in progress retain their current status.
                    </p>
                    <Select value={iepWorkflowMode} onChange={(e) => setIepWorkflowMode(e.target.value as "simple_review" | "admin_approval_required")}>
                      <option value="simple_review">Simple — teachers finalize directly, no approval queue</option>
                      <option value="admin_approval_required">Admin approval — teachers submit, an admin reviews and approves</option>
                    </Select>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button onClick={savePolicies} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
                  </div>
                </CardContent>
              </Card>

              {/* Future workflow areas — placeholder only */}
              <Card className="opacity-60">
                <CardContent className="p-5">
                  <h3 className="text-sm font-semibold mb-3">Coming Later</h3>
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
                    <span>Parent acknowledgment rules</span>
                    <span>Attendance escalation thresholds</span>
                    <span>Grade approval workflow</span>
                    <span>Notification behavior</span>
                  </div>
                </CardContent>
              </Card>
            </div>
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
                              <Badge variant={sy.status === "draft" ? "planned" : sy.status === "archived" ? "closed" : sy.status}>
                                {sy.status === "planned" || sy.status === "draft" ? "Planned"
                                  : sy.status === "closed" || sy.status === "archived" ? "Closed"
                                  : sy.status === "active" ? "Active" : sy.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{formatDateRange(sy.startDate, sy.endDate)}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {/* Lifecycle action buttons */}
                            {(sy.status === "planned" || sy.status === "draft") && (
                              <button
                                onClick={() => activateSy(sy.id)}
                                disabled={activateChecking}
                                className="text-xs text-primary hover:underline font-medium disabled:opacity-50"
                              >
                                {activateChecking ? "Checking…" : "Activate"}
                              </button>
                            )}
                            {sy.status === "active" && (
                              <button
                                onClick={initiateCloseYear}
                                disabled={closeYearChecking}
                                className="text-xs text-orange-600 hover:underline font-medium disabled:opacity-50"
                              >
                                {closeYearChecking ? "Checking…" : "Close School Year"}
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
          {/* ── Class Levels ── */}
          {activeSection === "Class Levels" && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2>Class Levels</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    The list that powers the Level / Age Group dropdown when you add or edit a class.
                  </p>
                </div>
                <Button onClick={openAddClassLevel}>
                  <Plus className="w-4 h-4" /> Add Level
                </Button>
              </div>

              {classLevels.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center space-y-3">
                    <Library className="w-10 h-10 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      No class levels yet. Add at least one before creating classes.
                    </p>
                    <Button onClick={openAddClassLevel}>
                      <Plus className="w-4 h-4" /> Add Your First Level
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={classLevelShowArchived}
                        onChange={(e) => setClassLevelShowArchived(e.target.checked)}
                      />
                      Show archived
                    </label>
                  </div>
                  <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted border-b border-border">
                          <tr>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground w-16">Order</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Kind</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Seq</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">In Use</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                            <th className="text-right px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {classLevels
                            .filter((l) => classLevelShowArchived || !l.archivedAt)
                            .map((l, idx, arr) => {
                              const kindMeta = CLASS_LEVEL_KINDS.find((k) => k.value === l.kind);
                              const inUse = classLevelInUseCounts[l.id] ?? 0;
                              return (
                                <tr key={l.id} className={l.archivedAt ? "bg-muted/30" : ""}>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => moveClassLevel(l.id, "up")}
                                        disabled={idx === 0}
                                        className="p-0.5 hover:bg-muted rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                        aria-label="Move up"
                                      >
                                        <ChevronRight className="w-3.5 h-3.5 -rotate-90" />
                                      </button>
                                      <button
                                        onClick={() => moveClassLevel(l.id, "down")}
                                        disabled={idx === arr.length - 1}
                                        className="p-0.5 hover:bg-muted rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                        aria-label="Move down"
                                      >
                                        <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                                      </button>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 font-medium">{l.name}</td>
                                  <td className="px-4 py-3">
                                    <Badge variant="default">{kindMeta?.label ?? l.kind}</Badge>
                                  </td>
                                  <td className="px-4 py-3 text-xs">
                                    {l.kind === "core" && l.progressionOrder != null ? (
                                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary font-semibold text-[10px]">
                                        {l.progressionOrder}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground text-xs">
                                    {inUse} class{inUse !== 1 ? "es" : ""}
                                  </td>
                                  <td className="px-4 py-3">
                                    {l.archivedAt
                                      ? <span className="text-xs text-muted-foreground italic">Archived</span>
                                      : <span className="text-xs text-green-700">Active</span>}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center justify-end gap-1">
                                      <button onClick={() => openEditClassLevel(l)} className="p-1.5 hover:bg-muted rounded-lg" aria-label="Edit">
                                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                      </button>
                                      {l.archivedAt
                                        ? <Button variant="outline" size="sm" onClick={() => unarchiveClassLevel(l.id)}>Restore</Button>
                                        : <Button variant="outline" size="sm" onClick={() => archiveClassLevel(l.id)}>Archive</Button>}
                                      <button
                                        onClick={() => deleteClassLevel(l)}
                                        disabled={inUse > 0}
                                        title={inUse > 0 ? "Cannot delete — level is in use" : "Delete"}
                                        className="p-1.5 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>• <strong>Core</strong> levels form the main promotion sequence. Non-core kinds (SPED, bridge, summer, mixed-age, enrichment) sit outside the standard year-end progression.</p>
                    <p>• <strong>Seq</strong> — the numbered progression order for Core levels (e.g. Toddler=1, Pre-Kinder=2, Kinder=3). The highest number is treated as the graduating/final level in Year-End Classification. Leave blank for non-core levels.</p>
                    <p>• Renaming a level here automatically updates every class that uses it.</p>
                    <p>• Archive instead of delete when a level is no longer offered but past classes still reference it.</p>
                  </div>
                </>
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
                    Organize grading levels into named groups. Each group has a mode: descriptive labels or score-based ranges.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setPendingTemplate(null); setTemplateModal(true); }}>
                    <Library className="w-4 h-4" /> Use Template
                  </Button>
                  <Button size="sm" onClick={openAddSet}><Plus className="w-4 h-4" /> New Group</Button>
                </div>
              </div>

              {gradingScaleSets.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center space-y-3">
                    <Library className="w-8 h-8 mx-auto text-muted-foreground opacity-40" />
                    <p className="text-sm text-muted-foreground">No grading groups yet.</p>
                    <div className="flex items-center justify-center gap-2">
                      <Button size="sm" onClick={openAddSet}><Plus className="w-4 h-4" /> New Group</Button>
                      <Button size="sm" variant="outline" onClick={() => { setPendingTemplate(null); setTemplateModal(true); }}>
                        <Library className="w-4 h-4" /> Use Template
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Group tabs */}
                  <div className="flex gap-2 flex-wrap">
                    {gradingScaleSets.map((set) => (
                      <button
                        key={set.id}
                        onClick={() => setSelectedSetId(set.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                          selectedSetId === set.id
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-card text-foreground border-border hover:bg-muted"
                        }`}
                      >
                        {set.name}{set.isDefault && <span className="ml-1.5 text-xs opacity-70">(default)</span>}
                      </button>
                    ))}
                  </div>

                  {selectedSet && (
                    <Card>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{selectedSet.name}</h3>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                selectedSet.scaleMode === "range_based"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-muted text-muted-foreground"
                              }`}>
                                {selectedSet.scaleMode === "range_based" ? "Score-based" : "Descriptive"}
                              </span>
                            </div>
                            {selectedSet.description && <p className="text-sm text-muted-foreground mt-0.5">{selectedSet.description}</p>}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => openEditSet(selectedSet)} className="p-1.5 hover:bg-accent rounded-lg">
                              <Pencil className="w-4 h-4 text-muted-foreground" />
                            </button>
                            <button onClick={() => deleteScaleSet(selectedSet.id)} className="p-1.5 hover:bg-red-50 rounded-lg">
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        {setScales.length === 0 ? (
                          <div className="px-5 py-8 text-center">
                            <p className="text-sm text-muted-foreground mb-3">No levels in this group yet.</p>
                            <Button size="sm" onClick={openAddScale}><Plus className="w-4 h-4" /> Add Level</Button>
                          </div>
                        ) : (
                          <div className="divide-y divide-border">
                            {setScales.map((s) => (
                              <div key={s.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 flex-1">
                                  <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                                  <div>
                                    <p className="font-semibold text-sm">{s.label}</p>
                                    {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                                    {selectedSet.scaleMode === "range_based" && (s.minScore || s.maxScore) && (
                                      <p className="text-xs text-blue-600 font-medium">Score {s.minScore}–{s.maxScore}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button onClick={() => openEditScale(s)} className="p-1.5 hover:bg-accent rounded-lg">
                                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                  </button>
                                  <button onClick={() => deleteScale(s.id)} className="p-1.5 hover:bg-red-50 rounded-lg">
                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {setScales.length > 0 && (
                          <div className="px-5 py-3 border-t border-border">
                            <button onClick={openAddScale} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                              <Plus className="w-4 h-4" /> Add Level
                            </button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {/* ── Scale Assignments ── */}
              <div className="space-y-4 pt-2">
                <div>
                  <h3 className="font-semibold text-base">Scale Assignments</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Choose which grading scale is used when teachers record progress observations.
                    Resolution priority (highest wins): Student + Domain override → Domain default → Level default → School default.
                  </p>
                </div>
                {assignmentError && <ErrorAlert message={assignmentError} />}
                {gradingScaleSets.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground text-sm">
                      Create at least one scale group above before assigning scales to contexts.
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-0 divide-y divide-border">
                      {/* School Default */}
                      <div className="px-5 py-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium">School Default</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Fallback for all observations with no other assignment.</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Select
                            value={scaleAssignments.find((a) => a.isActive && a.assignmentType === "school_default")?.gradingScaleSetId ?? ""}
                            onChange={(e) => saveAssignment("school_default", e.target.value)}
                            className="text-sm w-52"
                            disabled={assignmentSaving === "school_default"}
                          >
                            <option value="">— Not assigned —</option>
                            {gradingScaleSets.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </Select>
                          {assignmentSaving === "school_default" && <span className="text-xs text-muted-foreground">Saving…</span>}
                        </div>
                      </div>

                      {/* Level Defaults */}
                      {classLevels.filter((l) => !l.archivedAt).length > 0 && (
                        <>
                          <div className="px-5 py-2 bg-muted/40">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Level Defaults</p>
                          </div>
                          {classLevels.filter((l) => !l.archivedAt).map((level) => {
                            const assignment = scaleAssignments.find(
                              (a) => a.isActive && a.assignmentType === "level_default" && a.levelId === level.id,
                            );
                            const saveKey = "level_default" + level.id;
                            return (
                              <div key={level.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                                <p className="text-sm">{level.name}</p>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <Select
                                    value={assignment?.gradingScaleSetId ?? ""}
                                    onChange={(e) => saveAssignment("level_default", e.target.value, level.id)}
                                    className="text-sm w-52"
                                    disabled={assignmentSaving === saveKey}
                                  >
                                    <option value="">— Use school default —</option>
                                    {gradingScaleSets.map((s) => (
                                      <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                  </Select>
                                  {assignmentSaving === saveKey && <span className="text-xs text-muted-foreground">Saving…</span>}
                                </div>
                              </div>
                            );
                          })}
                        </>
                      )}

                      {/* Domain Defaults */}
                      {progressCategories.length > 0 && (
                        <>
                          <div className="px-5 py-2 bg-muted/40">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Domain Defaults</p>
                          </div>
                          {progressCategories.map((cat) => {
                            const assignment = scaleAssignments.find(
                              (a) => a.isActive && a.assignmentType === "domain_default" && a.domainId === cat.id,
                            );
                            const saveKey = "domain_default" + cat.id;
                            return (
                              <div key={cat.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                                <p className="text-sm">{cat.name}</p>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <Select
                                    value={assignment?.gradingScaleSetId ?? ""}
                                    onChange={(e) => saveAssignment("domain_default", e.target.value, cat.id)}
                                    className="text-sm w-52"
                                    disabled={assignmentSaving === saveKey}
                                  >
                                    <option value="">— Use level/school default —</option>
                                    {gradingScaleSets.map((s) => (
                                      <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                  </Select>
                                  {assignmentSaving === saveKey && <span className="text-xs text-muted-foreground">Saving…</span>}
                                </div>
                              </div>
                            );
                          })}
                        </>
                      )}

                      {/* Student + Domain Override — deferred */}
                      <div className="px-5 py-3 bg-muted/20">
                        <p className="text-xs text-muted-foreground italic">
                          Student + Domain overrides — available in a future update. These let you assign a different scale to one student for one specific domain.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
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
                            onClick={() => { setLogoUrl(null); setLogoFile(null); setLogoRemoved(true); }}
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
                      placeholder="e.g. Sunshine Learning Center · Tel: 09XXXXXXXXX"
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

      {/* ── Settings Help Drawer ── */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setHelpOpen(false); setHelpSearch(""); setHelpView("topics"); }} />
          <div className="relative flex flex-col w-full max-w-md bg-card border-l border-border shadow-2xl h-full animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              {helpView === "getting-started" ? (
                <div className="flex items-center gap-2.5">
                  <button onClick={() => setHelpView("topics")} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Back to Help Topics">
                    <ChevronRight className="w-4 h-4 rotate-180" />
                  </button>
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center"><BookOpen className="w-4 h-4 text-primary" /></div>
                  <h2 className="font-semibold text-base">Getting Started</h2>
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center"><BookOpen className="w-4 h-4 text-primary" /></div>
                  <h2 className="font-semibold text-base">Help Topics</h2>
                </div>
              )}
              <button onClick={() => { setHelpOpen(false); setHelpSearch(""); setHelpView("topics"); }} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            {helpView === "topics" && (
            <div className="px-5 py-3 border-b border-border flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" placeholder="Search topics..." value={helpSearch} onChange={(e) => setHelpSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
              </div>
            </div>
            )}
            {helpView === "getting-started" ? (
              <GetStartedGuide embedded isOpen={true} onClose={() => {}} showDismissOption={false} />
            ) : (
            <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
              {(() => {
                const Step = ({ n, text }: { n: number; text: React.ReactNode }) => (
                  <div className="flex gap-2.5 items-start">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">{n}</span>
                    <span>{text}</span>
                  </div>
                );
                const Tip = ({ children }: { children: React.ReactNode }) => (
                  <div className="mt-3 flex gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-amber-800 dark:text-amber-300 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{children}</span>
                  </div>
                );
                const Note = ({ children }: { children: React.ReactNode }) => (
                  <div className="mt-3 flex gap-2 bg-blue-100 dark:bg-blue-950/50 border border-blue-300 dark:border-blue-700 rounded-lg px-3 py-2 text-blue-900 dark:text-blue-200 text-xs">
                    <HelpCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{children}</span>
                  </div>
                );
                type HelpTopic = { id: string; icon: React.ElementType; title: string; searchText: string; body: React.ReactNode };
                const topics: HelpTopic[] = [
                  {
                    id: "year-transition",
                    icon: BookOpen,
                    title: "School Year Transition — Preparing for the Next Year",
                    searchText: "school year transition new year setup next year classes year-end classification promote renewal activate close",
                    body: (
                      <div className="space-y-3">
                        <div className="flex gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 text-xs text-primary">
                          <BookOpen className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <span>Setting up for the first time?{" "}
                            <button
                              onClick={() => setHelpView("getting-started")}
                              className="underline font-medium hover:opacity-70 transition-opacity"
                            >
                              Open Getting Started
                            </button>
                            {" "}for the full initial setup guide.
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground">When your current school year ends and you need to set up for the next school year:</p>
                        <div className="space-y-2">
                          <Step n={1} text={<><strong>Create next year's School Year</strong> as Planned in Settings → School Year &amp; Terms. It must exist before you can classify students or create new classes.</>} />
                          <Step n={2} text={<>Go to <strong>Classes</strong> and create fresh classes for the new school year. Assign teachers to each class. Set the <strong>Promotion Path</strong> on each class so the system knows which level students move up to.</>} />
                          <Step n={3} text={<>Go to <strong>Students → Year-End Classification</strong>. The system will auto-suggest outcomes based on each class's Promotion Path and your class level Seq numbers. Review, override any exceptions, and click <strong>Save Year-End Classifications</strong>.</>} />
                          <Step n={4} text={<>Return to Settings and click <strong>Activate</strong> on the new school year. If there are unclassified students, a confirmation modal will show the count with a link back to Year-End Classification — you can proceed anyway or return to finish classifying.</>} />
                          <Step n={5} text={<>Verify <strong>Academic Terms / Periods</strong> exist for the new year. If you added new terms, go to <strong>Billing → Setup tab → Tuition Rates</strong> to configure rates for the new terms.</>} />
                          <Step n={6} text={<>Go to <strong>Billing → Generate Billing</strong> to create the first month's invoices for the new school year.</>} />
                          <Step n={7} text={<>Update <strong>Holidays</strong> for the new year in Settings → Holidays if your calendar changed.</>} />
                        </div>
                        <Tip>Set the <strong>Seq</strong> (progression order) on each class level in Settings → Class Levels before running Year-End Classification. That number drives the auto-suggestions.</Tip>
                        <Note><strong>Key difference:</strong> A new school year starts empty — students must be explicitly re-enrolled. Billing from the prior year remains collectible as prior-year balance.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "school-info",
                    icon: Plus,
                    title: "School Information — update name, address, phone",
                    searchText: "school information name branch address phone save info identity",
                    body: (
                      <div className="space-y-2">
                        <p>This section holds your school's identity details — the fields that appear on billing statements, printed documents, and the parent portal.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>School Information</strong> in the left nav.</span>} />
                          <Step n={2} text={<span>Update fields: <strong>School Name</strong>, <strong>Branch Name</strong>, <strong>Address</strong>, and <strong>Telephone Number</strong>.</span>} />
                          <Step n={3} text={<span>Click <strong>Save Changes</strong> at the bottom of the card.</span>} />
                        </div>
                        <Note>Operational policies (enrollment balance rules, IEP workflow mode) are in <strong>Policies &amp; Workflows</strong>, not here. School Information is identity-only.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "policies-workflows",
                    icon: Plus,
                    title: "Policies & Workflows — enrollment and IEP settings",
                    searchText: "policies workflows iep finalize approve enrollment balance prior year simple review admin approval mode",
                    body: (
                      <div className="space-y-2">
                        <p>This section controls how your school handles two key operational decisions. Each policy is saved independently.</p>
                        <div className="space-y-3 mt-2">
                          <div>
                            <p className="text-xs font-semibold text-foreground">Enrollment Balance Policy</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Controls whether prior-year unpaid balances block re-enrollment. Choose <strong>Allow enrollment regardless</strong> or <strong>Require prior balance cleared</strong>.</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">IEP Workflow Mode</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              <strong>Simple Review</strong> — Teachers finalize IEP plans directly on Step 6. No admin approval step. Best for smaller teams.<br />
                              <strong>Admin Approval Required</strong> — Teachers submit for review; the school admin approves. Enables the review queue on the dashboard and Documents page.
                            </p>
                          </div>
                        </div>
                        <Note>Changing the IEP workflow mode only affects new status transitions. Plans already approved or finalized keep their current status.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "school-years",
                    icon: Plus,
                    title: "School year lifecycle — Planned → Active → Closed",
                    searchText: "school year create add activate close planned active closed lifecycle status delete",
                    body: (
                      <div className="space-y-2">
                        <p>Each school year moves through three stages: <strong>Planned → Active → Closed</strong>. Only one year can be Active at a time — all enrollments and class activity happen in the Active year.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Add School Year</strong>, enter the name and dates. New years start as <strong>Planned</strong>.</span>} />
                          <Step n={2} text={<span>Click <strong>Activate</strong> on a Planned year to make it the current year. The previous Active year is automatically closed.</span>} />
                          <Step n={3} text={<span>At year end: go to <strong>Students → Year-End Classification</strong> and classify all enrolled students. Then click <strong>Close School Year</strong>.</span>} />
                          <Step n={4} text={<span>Closing validates that all enrolled students have a year-end outcome. If any are unclassified you can still force-close with a confirmation.</span>} />
                        </div>
                        <Tip>Create the upcoming year as Planned before setting up new classes — the target year must exist so you can configure promotion paths and enroll students.</Tip>
                        <Note>When you click Activate, if any currently-enrolled students are unclassified, a confirmation modal will appear showing the count with a direct link to <strong>Year-End Classification</strong>. You can return to classify them or proceed anyway.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "class-levels",
                    icon: Plus,
                    title: "Class Levels — Seq number and Year-End Classification",
                    searchText: "class level progression order seq sequence toddler pre-kinder kinder year-end classification next level auto suggest recommended",
                    body: (
                      <div className="space-y-2">
                        <p>Class Levels define the steps in your school's educational progression (e.g. Toddler → Pre-Kinder → Kinder). The <strong>Seq</strong> number tells the system which level comes after which — it powers the auto-suggestions in Year-End Classification.</p>
                        <p className="text-xs font-semibold text-foreground mt-2">Setting up Seq numbers</p>
                        <div className="space-y-2">
                          <Step n={1} text={<span>Go to <strong>Settings → Class Levels</strong>.</span>} />
                          <Step n={2} text={<span>Each level has a <strong>Seq</strong> field. Assign sequential numbers in the order students progress: Toddler = 1, Pre-Kinder = 2, Kinder = 3, etc.</span>} />
                          <Step n={3} text={<span>Click the save icon on each row after editing. Levels without a Seq number won't produce auto-suggestions.</span>} />
                        </div>
                        <p className="text-xs font-semibold text-foreground mt-2">How it's used</p>
                        <p className="text-xs text-muted-foreground">When you run Year-End Classification, the system looks at each class's level Seq and suggests the level with Seq+1 as the recommended next level. The highest Seq level is treated as the graduating level — students there are auto-suggested as <strong>Graduate</strong>.</p>
                        <Tip>You can still override any auto-suggestion in Year-End Classification. The Seq is just a starting point — individual exceptions are handled per student.</Tip>
                        <Note>Seq numbers don't need to be consecutive (1, 2, 3) — they just need to be in the right relative order. Gaps are fine (10, 20, 30) if you plan to insert new levels later.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "terms",
                    icon: Plus,
                    title: "Academic terms / periods",
                    searchText: "term academic period add regular summer short name dates",
                    body: (
                      <div className="space-y-2">
                        <p>Terms (Academic Periods) subdivide a school year — e.g. Regular Term and Summer Term. They're used in billing and tuition setup.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>In the School Year &amp; Terms section, click <strong>Add Term</strong> under the school year you want to add it to.</span>} />
                          <Step n={2} text={<span>Enter the <strong>name</strong> (e.g. "Regular Term"), <strong>start date</strong>, and <strong>end date</strong>.</span>} />
                          <Step n={3} text={<span>Click <strong>Save</strong>.</span>} />
                        </div>
                        <Note>Terms are used in Finance Setup to configure tuition rates per period and level. If you add a term after setting up tuition, go to Billing → Setup tab → Tuition Rates to add rates for the new term.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "holidays",
                    icon: AlertTriangle,
                    title: "Holidays — mark no-class days",
                    searchText: "holiday add no class day date name applies attendance warning",
                    body: (
                      <div className="space-y-2">
                        <p>Holidays marked as "No Class" show a warning on the Attendance page when the date is selected, so teachers know class wasn't held.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Holidays</strong> in the left nav.</span>} />
                          <Step n={2} text={<span>Click <strong>Add Holiday</strong>. Enter the <strong>name</strong> (e.g. "National Heroes Day") and <strong>date</strong>.</span>} />
                          <Step n={3} text={<span>Check <strong>No class this day</strong> if you didn't hold classes. Leave unchecked for informational holidays that don't affect class schedules.</span>} />
                          <Step n={4} text={<span>Click <strong>Save</strong>.</span>} />
                        </div>
                        <Note>Holidays are school-wide — you can't assign a holiday to only one class. The no-class warning on Attendance applies to all classes on that date.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "teachers",
                    icon: Plus,
                    title: "Teacher records — add, edit, deactivate",
                    searchText: "teacher add edit deactivate active staff record photo contact",
                    body: (
                      <div className="space-y-2">
                        <p>Teacher records in Settings are your staff directory. These are the names that appear in the teacher dropdown when creating or editing classes.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Teachers</strong> in the left nav.</span>} />
                          <Step n={2} text={<span>Click <strong>Add Teacher</strong>. Enter their <strong>full name</strong> and <strong>email</strong> (both required — email is what they use to log in), plus optional phone and start date. Optionally upload a photo.</span>} />
                          <Step n={3} text={<span>To edit: click the <strong>pencil icon</strong> on the teacher row.</span>} />
                          <Step n={4} text={<span>To deactivate (no longer at the school): edit the record and uncheck <strong>Active</strong>. They'll no longer appear in the class teacher dropdown.</span>} />
                        </div>
                        <Note>Teacher records here are separate from teacher login accounts. A teacher can have a record here for directory purposes without having a system login, and vice versa.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "student-ids",
                    icon: Plus,
                    title: "Student ID format",
                    searchText: "student id code format prefix padding year include generate auto",
                    body: (
                      <div className="space-y-2">
                        <p>Controls how auto-generated student codes look (e.g. SL-0001 or SL-26-0001).</p>
                        <div className="space-y-2.5 mt-2">
                          {[
                            { label: "Prefix", desc: "Letters before the number (e.g. \"SL\" → SL-0001). Use your school initials." },
                            { label: "Padding", desc: "How many digits the number has (e.g. 4 → SL-0001, 3 → SL-001)." },
                            { label: "Include Year", desc: "When checked, the current 2-digit year is inserted after the prefix (e.g. SL-26-0001)." },
                          ].map(({ label, desc }) => (
                            <div key={label} className="flex gap-2.5 items-start">
                              <span className="font-semibold text-xs w-20 flex-shrink-0 mt-0.5 text-foreground">{label}</span>
                              <span className="text-xs">{desc}</span>
                            </div>
                          ))}
                        </div>
                        <Tip>Changing the format only affects new students added going forward. Existing student codes are not retroactively updated.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "grading",
                    icon: Library,
                    title: "Grading scales and assignments — set up scale groups and assign to contexts",
                    searchText: "grading scale descriptive score based template add level label color assignment school default level domain progress observation",
                    body: (
                      <div className="space-y-2">
                        <p>Grading scales define your school's rating vocabulary for progress observations. Scale groups hold individual rating levels (labels, colors, optional score ranges). Scale Assignments connect those groups to specific contexts.</p>
                        <p className="text-xs font-semibold text-foreground mt-2">Setting up a scale group</p>
                        <div className="space-y-2">
                          <Step n={1} text={<span>Click <strong>Grading</strong> in the left nav.</span>} />
                          <Step n={2} text={<span>Click <strong>New Group</strong> or <strong>Use Template</strong>. Give it a name and choose the mode: <strong>Descriptive</strong> (labels only) or <strong>Score-based</strong> (score ranges).</span>} />
                          <Step n={3} text={<span>With the group selected, click <strong>Add Level</strong> to define each rating: label, color, description, and score range (if score-based).</span>} />
                        </div>
                        <p className="text-xs font-semibold text-foreground mt-2">Assigning a scale to a context</p>
                        <div className="space-y-2">
                          <Step n={1} text={<span>Scroll down to <strong>Scale Assignments</strong> on the same Grading page.</span>} />
                          <Step n={2} text={<span>Set the <strong>School Default</strong> — this scale is used for all progress observations unless overridden.</span>} />
                          <Step n={3} text={<span>Optionally set <strong>Level Defaults</strong> (per class level, e.g. Toddlers use a different scale than Kinder) or <strong>Domain Defaults</strong> (per progress domain, e.g. Motor Skills uses a custom scale).</span>} />
                        </div>
                        <Note>Resolution priority when recording an observation: Student + Domain override (future) → Domain default → Level default → School default. The Progress Tracking page shows which scale is being used and why.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "branding",
                    icon: Upload,
                    title: "Branding — logo, colors, text size",
                    searchText: "branding logo color primary accent text size spacing accessibility upload",
                    body: (
                      <div className="space-y-2">
                        <p>Customize how the app looks for your school — changes apply immediately across the admin and parent portal.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click <strong>Branding &amp; Accessibility</strong> in the left nav.</span>} />
                          <Step n={2} text={<span><strong>Logo</strong> — click the school logo area to upload an image (JPG/PNG, compressed automatically).</span>} />
                          <Step n={3} text={<span><strong>Primary Color</strong> — the main UI color (buttons, active states, links). Use your school's brand color.</span>} />
                          <Step n={4} text={<span><strong>Accent Color</strong> — secondary color used for highlights and badges.</span>} />
                          <Step n={5} text={<span><strong>Text Size</strong> and <strong>Spacing</strong> — accessibility adjustments for parents who find the default size hard to read. Default → Large → Extra Large.</span>} />
                          <Step n={6} text={<span>Check the <strong>Live Preview</strong> at the bottom before saving.</span>} />
                          <Step n={7} text={<span>Click <strong>Save Changes</strong>.</span>} />
                        </div>
                        <Tip>If the colors look off in the live preview, use the contrast indicator to ensure text remains readable. A contrast ratio below 4.5:1 fails accessibility standards.</Tip>
                      </div>
                    ),
                  },
                ];
                const q = helpSearch.trim().toLowerCase();
                const filtered = q ? topics.filter((t) => t.title.toLowerCase().includes(q) || t.searchText.toLowerCase().includes(q)) : topics;
                if (filtered.length === 0) return (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                    <HelpCircle className="w-8 h-8 mb-3 opacity-40" />
                    <p className="text-sm">No topics match <span className="font-medium text-foreground">"{helpSearch}"</span></p>
                    <button onClick={() => setHelpSearch("")} className="mt-2 text-xs text-primary hover:underline">Clear search</button>
                  </div>
                );
                const topicRows = filtered.map((item) => {
                  const Icon = item.icon;
                  const open = !!helpExpanded[item.id];
                  return (
                    <div key={item.id} className="border border-border rounded-xl overflow-hidden">
                      <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                        onClick={() => setHelpExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}>
                        <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0"><Icon className="w-3.5 h-3.5 text-muted-foreground" /></div>
                        <span className="flex-1 text-sm font-medium">{item.title}</span>
                        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                      </button>
                      {open && <div className="px-4 pb-4 pt-3 text-sm text-muted-foreground leading-relaxed border-t border-border bg-muted/20">{item.body}</div>}
                    </div>
                  );
                });
                return (
                  <>
                    {!q && (
                      <button
                        onClick={() => setHelpView("getting-started")}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left border border-primary/30 bg-primary/5 hover:bg-primary/10 rounded-xl transition-colors"
                      >
                        <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center flex-shrink-0"><BookOpen className="w-3.5 h-3.5 text-primary" /></div>
                        <span className="flex-1 text-sm font-medium text-primary">Getting Started — Initial School Setup</span>
                        <ChevronRight className="w-4 h-4 text-primary/60 flex-shrink-0" />
                      </button>
                    )}
                    {topicRows}
                  </>
                );
              })()}
            </div>
            <div className="px-5 py-3 border-t border-border flex-shrink-0 text-xs text-muted-foreground">
              {helpSearch ? <span>Showing results for "<span className="font-medium text-foreground">{helpSearch}</span>"</span> : <span>11 topics · click any to expand · <button onClick={() => setHelpView("getting-started")} className="underline hover:opacity-70">Getting Started guide</button></span>}
            </div>
            </>
            )}
          </div>
        </div>
      )}

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
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </Select>
            {syForm.status === "active" && (
              <p className="text-xs text-orange-600 mt-1">
                Prefer using the <strong>Activate</strong> button on a Planned year — it validates and transitions the current year safely.
                Setting Active here will immediately close the current active year.
              </p>
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

      {/* Activate School Year Confirmation Modal */}
      <Modal
        open={!!activateConfirm}
        onClose={() => setActivateConfirm(null)}
        title="Activate School Year"
      >
        {activateConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will close <strong>{activateConfirm.currentYearName}</strong> and activate the selected year.
            </p>

            {activateConfirm.unclassifiedCount > 0 && (
              <div className="flex gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-orange-800">
                    {activateConfirm.unclassifiedCount} enrolled student{activateConfirm.unclassifiedCount !== 1 ? "s have" : " has"} not been classified for year-end in <strong>{activateConfirm.currentYearName}</strong>.
                  </p>
                  <p className="text-xs text-orange-700">
                    Classifying students before activating the new year keeps your records accurate and helps auto-suggest promotion or graduation in the next cycle.
                  </p>
                  <a
                    href="/students?tab=promote"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-800 underline underline-offset-2 hover:text-orange-900"
                  >
                    Go to Year-End Classification →
                  </a>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <ModalCancelButton />
              <Button
                variant="destructive"
                onClick={() => performActivateSy(activateConfirm.yearId)}
                disabled={saving}
              >
                {activateConfirm.unclassifiedCount > 0 ? "Proceed Anyway" : "Activate"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Close School Year Modal */}
      <Modal open={closeYearModal} onClose={() => setCloseYearModal(false)} title="Close School Year">
        <div className="space-y-4">
          {closeYearUnclassified.length > 0 ? (
            <>
              <div className="flex gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-orange-800">
                    {closeYearUnclassified.length} enrolled student{closeYearUnclassified.length !== 1 ? "s have" : " has"} no year-end classification.
                  </p>
                  <p className="text-xs text-orange-700 mt-0.5">
                    Go to <strong>Students → Year-End Classification</strong> to classify them before closing, or override below.
                  </p>
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto border border-border rounded-lg divide-y divide-border text-sm">
                {closeYearUnclassified.map((s) => (
                  <div key={s.id} className="px-3 py-2 text-muted-foreground">{s.name}</div>
                ))}
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={closeYearForce}
                  onChange={(e) => setCloseYearForce(e.target.checked)}
                  className="w-4 h-4 rounded mt-0.5 flex-shrink-0"
                />
                <span className="text-sm">
                  Close anyway — I understand these students will have no year-end outcome on record.
                </span>
              </label>
            </>
          ) : (
            <div className="flex gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-800">All enrolled students have a year-end classification. Safe to close.</p>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Closing the school year sets it to <strong>Closed</strong>. No new enrollments will be accepted. Unpaid balances from this year remain collectible as prior-year balances.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <ModalCancelButton />
            <Button
              variant="destructive"
              onClick={confirmCloseYear}
              disabled={saving || (closeYearUnclassified.length > 0 && !closeYearForce)}
            >
              {saving ? "Closing…" : "Close School Year"}
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

      {/* Grading Level Modal */}
      <Modal open={gradingModal} onClose={() => setGradingModal(false)} title={editingScale ? "Edit Grading Level" : "Add Grading Level"}>
        <div className="space-y-4">
          {gradingFormError && <ErrorAlert message={gradingFormError} />}
          {selectedSet && (
            <div className={`text-xs px-3 py-2 rounded-lg ${selectedSet.scaleMode === "range_based" ? "bg-blue-50 text-blue-700" : "bg-muted text-muted-foreground"}`}>
              {selectedSet.scaleMode === "range_based"
                ? "Score-based mode — min and max score are required."
                : "Descriptive mode — no score ranges needed."}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Label *</label>
            <Input value={gradingForm.label} onChange={(e) => setGradingForm({ ...gradingForm, label: e.target.value })} placeholder="e.g. Emerging, Developing, Achieved" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Input value={gradingForm.description} onChange={(e) => setGradingForm({ ...gradingForm, description: e.target.value })} placeholder="What this level means..." />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={gradingForm.color}
                onChange={(e) => setGradingForm({ ...gradingForm, color: e.target.value })}
                className="w-10 h-9 rounded border border-border cursor-pointer flex-shrink-0"
              />
              <Input value={gradingForm.color} onChange={(e) => setGradingForm({ ...gradingForm, color: e.target.value })} className="font-mono text-xs w-32" />
            </div>
          </div>
          {selectedSet?.scaleMode === "range_based" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Min Score *</label>
                <Input type="number" value={gradingForm.minScore} onChange={(e) => setGradingForm({ ...gradingForm, minScore: e.target.value })} placeholder="e.g. 90" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Score *</label>
                <Input type="number" value={gradingForm.maxScore} onChange={(e) => setGradingForm({ ...gradingForm, maxScore: e.target.value })} placeholder="e.g. 100" />
              </div>
            </div>
          )}
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

      {/* Scale Group Modal */}
      <Modal open={setModal} onClose={() => setSetModal(false)} title={editingSet ? "Edit Grading Group" : "New Grading Group"}>
        <div className="space-y-4">
          {setFormError && <ErrorAlert message={setFormError} />}
          <div>
            <label className="block text-sm font-medium mb-1">Group Name *</label>
            <Input value={setForm.name} onChange={(e) => setSetForm({ ...setForm, name: e.target.value })} placeholder="e.g. Preschool Development Scale" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Input value={setForm.description} onChange={(e) => setSetForm({ ...setForm, description: e.target.value })} placeholder="What this group is used for..." />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Scale Mode</label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { value: "label_only" as ScaleMode, label: "Descriptive", desc: "Labels only — no numeric scores (e.g. Emerging, Developing)" },
                { value: "range_based" as ScaleMode, label: "Score-based", desc: "Each level maps to a numeric score range (e.g. A = 90–100)" },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSetForm({ ...setForm, scaleMode: opt.value })}
                  className={`p-3 rounded-xl border-2 text-left transition-colors ${
                    setForm.scaleMode === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <p className={`text-sm font-semibold ${setForm.scaleMode === opt.value ? "text-primary" : "text-foreground"}`}>{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{opt.desc}</p>
                </button>
              ))}
            </div>
            {editingSet && setForm.scaleMode !== editingSet.scaleMode && (
              <p className="text-xs text-amber-600 mt-2">Changing the mode won&apos;t update existing levels — you may need to edit their score ranges manually.</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <ModalCancelButton />
            <Button onClick={saveScaleSet} disabled={saving || !setForm.name}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>

      {/* Template Picker Modal */}
      <Modal open={templateModal} onClose={() => { setTemplateModal(false); setPendingTemplate(null); }} title="Grading Templates">
        <div className="space-y-4">
          {pendingTemplate === null ? (
            <>
              <p className="text-sm text-muted-foreground">Choose a pre-built grading scale to apply to your school.</p>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {GRADING_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setPendingTemplate(t)}
                    className="w-full text-left p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-semibold text-sm">{t.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                        t.scaleMode === "range_based" ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"
                      }`}>
                        {t.scaleMode === "range_based" ? "Score-based" : "Descriptive"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{t.description}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {t.items.map((item) => (
                        <span key={item.label} className="inline-flex items-center text-xs px-2 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: item.color }}>
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button onClick={() => setPendingTemplate(null)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                ← Back to templates
              </button>
              <div className="p-4 rounded-xl border border-border bg-muted/30">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold">{pendingTemplate.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    pendingTemplate.scaleMode === "range_based" ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"
                  }`}>
                    {pendingTemplate.scaleMode === "range_based" ? "Score-based" : "Descriptive"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{pendingTemplate.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {pendingTemplate.items.map((item) => (
                    <span key={item.label} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: item.color }}>
                      {item.label}
                      {pendingTemplate.scaleMode === "range_based" && item.minScore != null && (
                        <span className="opacity-80">({item.minScore}–{item.maxScore})</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
              {gradingScaleSets.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">How would you like to apply this template?</p>
                  <div className="space-y-2">
                    <button
                      onClick={() => applyTemplate("replace")}
                      disabled={templateApplying}
                      className="w-full text-left p-3 rounded-xl border-2 border-border hover:border-primary transition-colors disabled:opacity-50"
                    >
                      <p className="text-sm font-semibold">Replace current group</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Replaces &quot;{gradingScaleSets.find((s) => s.id === selectedSetId)?.name ?? "selected group"}&quot; with this template. Existing levels will be removed.</p>
                    </button>
                    <button
                      onClick={() => applyTemplate("add")}
                      disabled={templateApplying}
                      className="w-full text-left p-3 rounded-xl border-2 border-border hover:border-primary transition-colors disabled:opacity-50"
                    >
                      <p className="text-sm font-semibold">Add as new group</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Creates a new grading group with this template&apos;s levels alongside your existing groups.</p>
                    </button>
                  </div>
                  {templateApplying && <p className="text-sm text-muted-foreground text-center">Applying template…</p>}
                </div>
              ) : (
                <div className="flex justify-end gap-2 pt-2">
                  <ModalCancelButton />
                  <Button onClick={() => applyTemplate("add")} disabled={templateApplying}>
                    {templateApplying ? "Applying…" : "Apply Template"}
                  </Button>
                </div>
              )}
            </>
          )}
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
              onValidationError={(msg) => setTeacherFormError(msg)}
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
              <label className="block text-sm font-medium mb-1">Email *</label>
              <Input type="email" value={teacherForm.email} onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })} placeholder="teacher@school.com" />
              <p className="text-xs text-muted-foreground mt-1">Used to log in to their account.</p>
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
            <Button onClick={saveTeacher} disabled={saving || !teacherForm.fullName || !teacherForm.email.trim()}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>

      {/* Class Level Modal */}
      <Modal open={classLevelModal} onClose={() => setClassLevelModal(false)} title={editingClassLevel ? "Edit Level" : "Add Level"}>
        <div className="space-y-4">
          {classLevelFormError && <ErrorAlert message={classLevelFormError} />}
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <Input
              value={classLevelForm.name}
              onChange={(e) => setClassLevelForm({ ...classLevelForm, name: e.target.value })}
              placeholder="e.g. Toddlers, Pre-Kinder, SPED 1"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Kind *</label>
            <Select value={classLevelForm.kind} onChange={(e) => setClassLevelForm({ ...classLevelForm, kind: e.target.value as ClassLevelKind, progressionOrder: e.target.value !== "core" ? "" : classLevelForm.progressionOrder })}>
              {CLASS_LEVEL_KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {CLASS_LEVEL_KINDS.find((k) => k.value === classLevelForm.kind)?.hint}
            </p>
          </div>
          {classLevelForm.kind === "core" && (
            <div>
              <label className="block text-sm font-medium mb-1">Progression Order</label>
              <Input
                type="number"
                min="1"
                step="1"
                value={classLevelForm.progressionOrder}
                onChange={(e) => setClassLevelForm({ ...classLevelForm, progressionOrder: e.target.value })}
                placeholder="e.g. 1, 2, 3 — leave blank if not in sequence"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Determines the core-level progression sequence. The highest number is treated as the graduating/final level during Year-End Classification. Leave blank to exclude this level from sequence-based suggestions.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <ModalCancelButton />
            <Button onClick={saveClassLevel} disabled={saving || !classLevelForm.name.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
