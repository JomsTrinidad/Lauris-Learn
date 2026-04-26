"use client";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquare, Save, Check, AlertTriangle, Search, CheckSquare, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/datepicker";
import { Card } from "@/components/ui/card";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { getInitials } from "@/lib/utils";
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
      .select("id, name")
      .eq("school_id", schoolId!)
      .eq("school_year_id", activeYear.id)
      .eq("is_active", true)
      .order("start_time");

    if (err) { setError(err.message); setLoading(false); return; }
    const opts = (data ?? []) as Array<{ id: string; name: string }>;
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
      <div>
        <h1>Attendance</h1>
        <p className="text-muted-foreground text-sm mt-1">Quick and easy daily attendance tracking</p>
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
              : classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)
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
