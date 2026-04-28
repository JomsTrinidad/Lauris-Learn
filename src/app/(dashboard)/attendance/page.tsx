"use client";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquare, Save, Check, AlertTriangle, Search, CheckSquare, Bell, BookOpen, HelpCircle, ChevronDown, ChevronRight, X, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/datepicker";
import { Card } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { getInitials, formatTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSchoolContext } from "@/contexts/SchoolContext";

type AttendanceStatus = "present" | "late" | "absent" | "excused" | null;

interface StudentRow {
  studentId: string;
  enrollmentId: string;
  name: string;
  status: AttendanceStatus;
  note: string;
  recordId: string | null;
}

interface ClassOption {
  id: string;
  name: string;
  startTime: string | null;
}

interface AbsenceNotif {
  studentId: string;
  studentName: string;
  reason: string | null;
}

const STATUS_OPTIONS = [
  { value: "present" as AttendanceStatus, label: "Present", active: "bg-green-500 text-white", inactive: "bg-muted hover:bg-green-100 hover:text-green-700" },
  { value: "late"    as AttendanceStatus, label: "Late",    active: "bg-yellow-400 text-white", inactive: "bg-muted hover:bg-yellow-100 hover:text-yellow-700" },
  { value: "absent"  as AttendanceStatus, label: "Absent",  active: "bg-red-500 text-white",   inactive: "bg-muted hover:bg-red-100 hover:text-red-700" },
  { value: "excused" as AttendanceStatus, label: "Excused", active: "bg-gray-400 text-white",  inactive: "bg-muted hover:bg-gray-200 hover:text-gray-700" },
];

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function AttendancePage() {
  const { schoolId, activeYear } = useSchoolContext();
  const supabase = createClient();
  const searchParams = useSearchParams();

  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [noteStudentId, setNoteStudentId] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [holiday, setHoliday] = useState<string | null>(null);
  const [absenceNotifs, setAbsenceNotifs] = useState<AbsenceNotif[]>([]);
  const [loading, setLoading] = useState(true);

  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSearch, setHelpSearch] = useState("");
  const [helpExpanded, setHelpExpanded] = useState<Record<string, boolean>>({});
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load classes on mount
  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    loadClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, activeYear?.id]);

  async function loadClasses() {
    setLoading(true);
    if (!activeYear?.id) { setClassOptions([]); setLoading(false); return; }

    const { data, error: err } = await supabase
      .from("classes")
      .select("id, name, start_time")
      .eq("school_id", schoolId!)
      .eq("school_year_id", activeYear.id)
      .eq("is_active", true)
      .order("start_time");

    if (err) { setError(err.message); setLoading(false); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: ClassOption[] = (data ?? []).map((c: any) => ({ id: c.id, name: c.name, startTime: c.start_time ?? null }));
    setClassOptions(opts);

    // Pre-select from URL param or first class
    const paramClass = searchParams.get("class");
    const initial = paramClass && opts.find((c) => c.id === paramClass) ? paramClass : (opts[0]?.id ?? "");
    setSelectedClass(initial);
    setLoading(false);
  }

  // Load students + existing attendance when class or date changes
  const loadAttendance = useCallback(async () => {
    if (!selectedClass || !selectedDate) return;
    setLoadingStudents(true);
    setSaved(false);
    setError(null);

    // Check for holiday
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hResult = await supabase.from("holidays").select("name, is_no_class").eq("school_id", schoolId!).eq("date", selectedDate).maybeSingle() as any;
    const holidayRow = hResult.data as { name: string; is_no_class: boolean } | null;
    setHoliday(holidayRow?.is_no_class ? holidayRow.name : null);

    // Enrolled students in this class
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eResult = await supabase.from("enrollments").select("id, student_id, students(first_name, last_name)").eq("class_id", selectedClass).eq("status", "enrolled") as any;
    if (eResult.error) { setError(eResult.error.message); setLoadingStudents(false); return; }
    const enrollRows = ((eResult.data ?? []) as any[]) as Array<{ id: string; student_id: string; students: { first_name: string; last_name: string } | null }>;

    const studentIds: string[] = enrollRows.map((e) => e.student_id);

    // Parent-reported absence notifications for this date (scoped to enrolled students)
    if (studentIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nResult = await supabase.from("absence_notifications").select("student_id, reason").eq("date", selectedDate).in("student_id", studentIds) as any;
      const notifRows = ((nResult.data ?? []) as any[]) as Array<{ student_id: string; reason: string | null }>;
      const studentNameMap: Record<string, string> = {};
      enrollRows.forEach((e) => {
        if (e.students) studentNameMap[e.student_id] = `${e.students.first_name} ${e.students.last_name}`;
      });
      setAbsenceNotifs(notifRows.map((n) => ({
        studentId: n.student_id,
        studentName: studentNameMap[n.student_id] ?? "Unknown",
        reason: n.reason,
      })));
    } else {
      setAbsenceNotifs([]);
    }

    // Existing attendance records for this class+date
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aResult = await supabase.from("attendance_records").select("id, student_id, status, note").eq("class_id", selectedClass).eq("date", selectedDate).in("student_id", studentIds.length > 0 ? studentIds : ["none"]) as any;
    const attRows = ((aResult.data ?? []) as any[]) as Array<{ id: string; student_id: string; status: string; note: string | null }>;

    const attByStudent: Record<string, { id: string; status: AttendanceStatus; note: string }> = {};
    attRows.forEach((a) => {
      attByStudent[a.student_id] = { id: a.id, status: a.status as AttendanceStatus, note: a.note ?? "" };
    });

    setStudents(
      enrollRows.map((e) => {
        const s = e.students;
        const existing = attByStudent[e.student_id];
        return {
          studentId: e.student_id,
          enrollmentId: e.id,
          name: s ? `${s.first_name} ${s.last_name}` : e.student_id,
          status: existing?.status ?? null,
          note: existing?.note ?? "",
          recordId: existing?.id ?? null,
        };
      }).sort((a, b) => a.name.localeCompare(b.name))
    );

    setLoadingStudents(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, selectedDate, schoolId]);

  useEffect(() => {
    if (selectedClass) loadAttendance();
  }, [selectedClass, selectedDate, loadAttendance]);

  function markAllPresent() {
    setSaved(false);
    setStudents((prev) => prev.map((s) => ({ ...s, status: "present" as AttendanceStatus })));
  }

  function setStatus(studentId: string, status: AttendanceStatus) {
    setSaved(false);
    setStudents((prev) => prev.map((s) => s.studentId === studentId ? { ...s, status } : s));
  }

  function setNote(studentId: string, note: string) {
    setStudents((prev) => prev.map((s) => s.studentId === studentId ? { ...s, note } : s));
  }

  async function handleSave() {
    if (!selectedClass || !selectedDate) return;
    setSaving(true);
    setError(null);

    const records = students
      .filter((s) => s.status !== null)
      .map((s) => ({
        ...(s.recordId ? { id: s.recordId } : {}),
        student_id: s.studentId,
        class_id: selectedClass,
        date: selectedDate,
        status: s.status,
        note: s.note || null,
      }));

    if (records.length === 0) { setSaving(false); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upsertResult = await (supabase.from("attendance_records") as any).upsert(records, { onConflict: "student_id,class_id,date" });
    const upsertErr = upsertResult.error;

    if (upsertErr) { setError(upsertErr.message); setSaving(false); return; }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadAttendance();
  }

  const counts = STATUS_OPTIONS.reduce(
    (acc, opt) => ({ ...acc, [opt.value!]: students.filter((s) => s.status === opt.value).length }),
    {} as Record<string, number>
  );
  const unmarked = students.filter((s) => s.status === null).length;

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Attendance</h1>
          <p className="text-muted-foreground text-sm mt-1">Quick and easy daily attendance tracking</p>
        </div>
        <button
          onClick={() => { setHelpOpen(true); setHelpSearch(""); }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border"
        >
          <HelpCircle className="w-4 h-4" />
          Help
        </button>
      </div>

      {error && <ErrorAlert message={error} />}

      {!activeYear && (
        <div className="px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
          No active school year. Go to Settings → School Years to set one.
        </div>
      )}

      {/* Date + Class selectors */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Date</label>
          <DatePicker
            value={selectedDate}
            onChange={(v) => { setSelectedDate(v); setSaved(false); }}
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Class</label>
          <Select
            value={selectedClass}
            onChange={(e) => { setSelectedClass(e.target.value); setSaved(false); }}
            disabled={classOptions.length === 0}
          >
            {classOptions.length === 0
              ? <option value="">No classes available</option>
              : classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}{c.startTime ? ` · ${formatTime(c.startTime)}` : ""}</option>)
            }
          </Select>
        </div>
      </div>

      {/* Parent-reported absences callout */}
      {absenceNotifs.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <Bell className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">
              {absenceNotifs.length === 1
                ? "1 parent has pre-reported an absence"
                : `${absenceNotifs.length} parents have pre-reported absences`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {absenceNotifs.map((n) => (
                <li key={n.studentId} className="text-amber-700">
                  {n.studentName}{n.reason ? ` — ${n.reason}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Holiday warning */}
      {holiday && (
        <div className="flex items-center gap-2 px-4 py-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span><strong>Holiday:</strong> {holiday} — no class scheduled. You can still record attendance if needed.</span>
        </div>
      )}

      {/* Attendance list */}
      {loadingStudents ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full border-2 border-border border-t-primary w-8 h-8" /></div>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted">
            <div>
              <h3>{classOptions.find((c) => c.id === selectedClass)?.name ?? "—"}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedDate
                  ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
                  : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {unmarked > 0 && (
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                  {unmarked} unmarked
                </span>
              )}
              {students.length > 0 && (
                <button
                  onClick={markAllPresent}
                  className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 px-2.5 py-1 rounded-lg transition-colors"
                  title="Mark all students as Present"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  Mark All Present
                </button>
              )}
            </div>
          </div>

          {students.length > 0 && (
            <div className="px-5 py-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search students…"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>
            </div>
          )}

          {students.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              No enrolled students in this class.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {students.filter((s) =>
                !studentSearch || s.name.toLowerCase().includes(studentSearch.toLowerCase())
              ).map((student) => (
                <div key={student.studentId}>
                  <div className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {getInitials(student.name)}
                      </div>
                      <div>
                        <span className="text-sm font-medium">{student.name}</span>
                        {absenceNotifs.some((n) => n.studentId === student.studentId) && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                            <Bell className="w-2.5 h-2.5" /> parent notified
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {STATUS_OPTIONS.map((opt) => (
                        <button
                          key={String(opt.value)}
                          onClick={() => setStatus(student.studentId, opt.value)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            student.status === opt.value ? opt.active : opt.inactive
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}

                      <button
                        onClick={() => setNoteStudentId(noteStudentId === student.studentId ? null : student.studentId)}
                        className={`ml-1 p-2 rounded-lg transition-colors ${
                          student.note ? "text-primary bg-blue-50" : "text-muted-foreground hover:bg-accent"
                        }`}
                        title="Add note"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {noteStudentId === student.studentId && (
                    <div className="px-14 pb-3">
                      <Input
                        type="text"
                        placeholder="Add a note (optional)"
                        value={student.note}
                        onChange={(e) => setNote(student.studentId, e.target.value)}
                        className="text-sm"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {STATUS_OPTIONS.map((opt) => (
          <Card key={String(opt.value)}>
            <div className="p-4">
              <div className={`w-2.5 h-2.5 rounded-full mb-2 ${opt.active.split(" ")[0]}`} />
              <p className="text-xs text-muted-foreground">{opt.label}</p>
              <p className="text-2xl font-semibold mt-0.5">{counts[opt.value!] ?? 0}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Attendance Help Drawer ── */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setHelpOpen(false); setHelpSearch(""); }} />
          <div className="relative flex flex-col w-full max-w-md bg-card border-l border-border shadow-2xl h-full animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <h2 className="font-semibold text-base">Attendance Help</h2>
              </div>
              <button onClick={() => { setHelpOpen(false); setHelpSearch(""); }} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-border flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search topics..."
                  value={helpSearch}
                  onChange={(e) => setHelpSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                />
              </div>
            </div>

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
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{children}</span>
                  </div>
                );
                const Note = ({ children }: { children: React.ReactNode }) => (
                  <div className="mt-3 flex gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-blue-800 dark:text-blue-300 text-xs">
                    <HelpCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{children}</span>
                  </div>
                );

                type HelpTopic = { id: string; icon: React.ElementType; title: string; searchText: string; body: React.ReactNode };
                const topics: HelpTopic[] = [
                  {
                    id: "daily-flow",
                    icon: Calendar,
                    title: "Take attendance for today",
                    searchText: "daily attendance mark today class date present absent late excused save",
                    body: (
                      <div className="space-y-2">
                        <p>The fastest way to complete attendance for a class session.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>The date defaults to today. Select the <strong>class</strong> from the dropdown — it preselects the first class if only one exists.</span>} />
                          <Step n={2} text={<span>Click <strong>Mark All Present</strong> (top right of the list) to mark everyone present in one click. Adjust the exceptions individually after.</span>} />
                          <Step n={3} text={<span>For each student who isn't present, click their status button: <strong>Late</strong>, <strong>Absent</strong>, or <strong>Excused</strong>.</span>} />
                          <Step n={4} text={<span>Click <strong>Save Attendance</strong> (sticky button at the bottom of the page). The button turns green briefly to confirm it saved.</span>} />
                        </div>
                        <Note>You can save attendance multiple times for the same class and date — saving again overwrites the previous records. No need to worry about duplicates.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "statuses",
                    icon: CheckSquare,
                    title: "What each attendance status means",
                    searchText: "present late absent excused status meaning definition",
                    body: (
                      <div className="space-y-2.5 mt-1">
                        {[
                          { label: "Present", color: "text-green-600", desc: "Student attended class on time." },
                          { label: "Late", color: "text-yellow-600", desc: "Student arrived after class started. Still counts as attending." },
                          { label: "Absent", color: "text-red-600", desc: "Student did not attend and no prior notice was given." },
                          { label: "Excused", color: "text-gray-500", desc: "Student was absent but with an accepted reason (sick note, family emergency, etc.). Counts differently from unexcused absences in reports." },
                        ].map(({ label, color, desc }) => (
                          <div key={label} className="flex gap-2.5 items-start">
                            <span className={`font-semibold text-xs w-16 flex-shrink-0 mt-0.5 ${color}`}>{label}</span>
                            <span className="text-xs">{desc}</span>
                          </div>
                        ))}
                        <Tip>Students with no status selected are shown with an "X unmarked" badge in the header. Saving without marking them leaves them with no attendance record for the day — not the same as absent.</Tip>
                      </div>
                    ),
                  },
                  {
                    id: "add-note",
                    icon: MessageSquare,
                    title: "Add a note to a student's attendance",
                    searchText: "note add comment student attendance reason detail message",
                    body: (
                      <div className="space-y-2">
                        <p>Use notes for details like "arrived 20 min late — traffic" or "parent emailed re: fever".</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click the <strong>chat bubble icon</strong> on the right side of the student row.</span>} />
                          <Step n={2} text={<span>Type the note in the text field that appears below the student row.</span>} />
                          <Step n={3} text={<span>Click <strong>Save Attendance</strong> as usual — notes are saved together with statuses.</span>} />
                        </div>
                        <Note>The chat bubble turns blue when a note exists for that student. Notes are only visible to school staff — parents don't see them in the parent portal.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "past-date",
                    icon: Calendar,
                    title: "Take or edit attendance for a past date",
                    searchText: "past date previous back correct edit history retroactive",
                    body: (
                      <div className="space-y-2">
                        <p>You can record or correct attendance for any date, not just today.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Click the <strong>Date</strong> picker and select the date you need.</span>} />
                          <Step n={2} text={<span>The student list loads, pre-filled with whatever was saved before (if anything). Unmarked students show no status selected.</span>} />
                          <Step n={3} text={<span>Update the statuses, add notes if needed, then click <strong>Save Attendance</strong>.</span>} />
                        </div>
                        <Note>Saving a past date overwrites whatever was there before — it's safe to re-save to correct a mistake. The date picker doesn't restrict future dates either, so you can pre-fill expected classes if needed.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "holiday",
                    icon: AlertTriangle,
                    title: "Holiday warning appears — what to do",
                    searchText: "holiday warning no class scheduled orange banner override record",
                    body: (
                      <div className="space-y-2">
                        <p>When the selected date is marked as a no-class holiday in your school calendar, an orange warning appears at the top of the page.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>If you still held class that day (e.g. the holiday only applies to some classes), simply proceed and save attendance normally. The warning is informational only — it doesn't block saving.</span>} />
                          <Step n={2} text={<span>If you didn't hold class, there's nothing to save — leave the page.</span>} />
                          <Step n={3} text={<span>To remove or change the holiday, go to <strong>Settings → Holidays</strong>.</span>} />
                        </div>
                        <Note>Holidays are school-wide — they apply to all classes. If only some classes have the day off, either don't create a holiday entry, or simply record attendance for the classes that did meet.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "parent-notified",
                    icon: Bell,
                    title: "\"Parent notified\" badge on a student",
                    searchText: "parent notified badge amber bell absence notification report",
                    body: (
                      <div className="space-y-2">
                        <p>An amber "parent notified" badge appears next to a student's name when their parent pre-reported an absence from the parent portal.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>This means the parent sent a message through their portal saying the child won't be in class today, often with a reason.</span>} />
                          <Step n={2} text={<span>The reason (if given) appears in the amber banner at the top of the attendance list.</span>} />
                          <Step n={3} text={<span>Mark the student <strong>Absent</strong> or <strong>Excused</strong> as appropriate, then save.</span>} />
                        </div>
                        <Note>The parent notification badge is a heads-up only — it doesn't automatically set the student's status. You still need to manually select the status and save.</Note>
                      </div>
                    ),
                  },
                  {
                    id: "class-not-showing",
                    icon: Clock,
                    title: "A class isn't showing in the dropdown",
                    searchText: "class not showing dropdown missing invisible inactive school year",
                    body: (
                      <div className="space-y-2">
                        <p>The class dropdown only shows <strong>active</strong> classes for the current active school year.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Check that the class exists: go to <strong>Classes</strong> and verify it's listed and shows an "Active" badge.</span>} />
                          <Step n={2} text={<span>If the class is marked inactive, go to <strong>Classes → Edit class</strong> and check the <strong>Active class</strong> checkbox.</span>} />
                          <Step n={3} text={<span>Check the active school year in <strong>Settings → School Years</strong> — if the class was created under a different year it won't appear here.</span>} />
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: "no-students",
                    icon: CheckSquare,
                    title: "No students appear in the attendance list",
                    searchText: "no students empty list not enrolled attendance blank",
                    body: (
                      <div className="space-y-2">
                        <p>The attendance list only shows students who are <strong>enrolled</strong> (not waitlisted or inquiring) in the selected class.</p>
                        <div className="space-y-2 mt-2">
                          <Step n={1} text={<span>Go to <strong>Students</strong> and check that students are enrolled in the class with <strong>Enrolled</strong> status — not Waitlisted or Inquiry.</span>} />
                          <Step n={2} text={<span>If a student is missing from the list, open their profile and check their enrollment — the class and status must match.</span>} />
                          <Step n={3} text={<span>If you just enrolled them, refresh the page and select the class again.</span>} />
                        </div>
                      </div>
                    ),
                  },
                ];

                const q = helpSearch.trim().toLowerCase();
                const filtered = q
                  ? topics.filter((t) =>
                      t.title.toLowerCase().includes(q) ||
                      t.searchText.toLowerCase().includes(q)
                    )
                  : topics;

                if (filtered.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                      <HelpCircle className="w-8 h-8 mb-3 opacity-40" />
                      <p className="text-sm">No topics match <span className="font-medium text-foreground">"{helpSearch}"</span></p>
                      <button onClick={() => setHelpSearch("")} className="mt-2 text-xs text-primary hover:underline">Clear search</button>
                    </div>
                  );
                }

                return filtered.map((item) => {
                  const Icon = item.icon;
                  const open = !!helpExpanded[item.id];
                  return (
                    <div key={item.id} className="border border-border rounded-xl overflow-hidden">
                      <button
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                        onClick={() => setHelpExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                      >
                        <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <span className="flex-1 text-sm font-medium">{item.title}</span>
                        {open
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                      </button>
                      {open && (
                        <div className="px-4 pb-4 pt-3 text-sm text-muted-foreground leading-relaxed border-t border-border bg-muted/20">
                          {item.body}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            <div className="px-5 py-3 border-t border-border flex-shrink-0 text-xs text-muted-foreground">
              {helpSearch ? (
                <span>Showing results for "<span className="font-medium text-foreground">{helpSearch}</span>"</span>
              ) : (
                <span>8 topics · click any to expand</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sticky save */}
      <div className="sticky bottom-4 flex justify-end">
        <Button
          onClick={handleSave}
          size="lg"
          className={`shadow-lg ${saved ? "bg-green-500" : ""}`}
          disabled={saving || students.length === 0}
        >
          {saved ? (
            <><Check className="w-5 h-5" /> Saved!</>
          ) : saving ? (
            <>Saving…</>
          ) : (
            <><Save className="w-5 h-5" /> Save Attendance</>
          )}
        </Button>
      </div>
    </div>
  );
}
