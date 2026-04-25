"use client";
import { useEffect, useState } from "react";
import { User, CheckCircle, XCircle, Clock, MinusCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageSpinner } from "@/components/ui/spinner";
import { getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useParentContext } from "../layout";

interface StudentDetail {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  age: string;
  gender: string | null;
  studentCode: string | null;
  className: string;
  enrollmentStatus: string | null;
  primaryLanguage: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  photoUrl: string | null;
}

interface AttendanceRecord {
  id: string;
  date: string;
  status: "present" | "late" | "absent" | "excused";
  notes: string | null;
}

const ATTENDANCE_CONFIG = {
  present: { icon: CheckCircle, color: "text-green-600", label: "Present" },
  late:    { icon: Clock,        color: "text-amber-600", label: "Late" },
  absent:  { icon: XCircle,      color: "text-red-600",   label: "Absent" },
  excused: { icon: MinusCircle,  color: "text-blue-500",  label: "Excused" },
};

function calcAge(dob: string | null): string {
  if (!dob) return "—";
  const birth = new Date(dob + "T00:00:00");
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  if (years < 0) return "—";
  if (years === 0) return `${months} mo${months !== 1 ? "s" : ""}`;
  if (months === 0) return `${years} yr${years !== 1 ? "s" : ""}`;
  return `${years} yr${years !== 1 ? "s" : ""} ${months} mo`;
}

export default function ParentStudentPage() {
  const { childId } = useParentContext();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);

  useEffect(() => {
    if (!childId) { setLoading(false); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadStudent(), loadAttendance()]);
    setLoading(false);
  }

  async function loadStudent() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("students")
      .select(`
        id, first_name, last_name, date_of_birth, gender, student_code, preferred_name,
        photo_url, allergies, medical_conditions, primary_language,
        enrollments(status, classes(name))
      `)
      .eq("id", childId)
      .single();

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      const enrollment = (d.enrollments ?? [])[0] ?? null;
      setStudent({
        id: d.id,
        firstName: d.first_name,
        lastName: d.last_name,
        preferredName: d.preferred_name ?? null,
        dateOfBirth: d.date_of_birth ?? null,
        age: calcAge(d.date_of_birth),
        gender: d.gender ?? null,
        studentCode: d.student_code ?? null,
        className: enrollment?.classes?.name ?? "—",
        enrollmentStatus: enrollment?.status ?? null,
        primaryLanguage: d.primary_language ?? null,
        allergies: d.allergies ?? null,
        medicalConditions: d.medical_conditions ?? null,
        photoUrl: d.photo_url ?? null,
      });
    }
  }

  async function loadAttendance() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("attendance_records")
      .select("id, date, status, notes")
      .eq("student_id", childId)
      .order("date", { ascending: false })
      .limit(30);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAttendance((data ?? []) as AttendanceRecord[]);
  }

  if (loading) return <PageSpinner />;
  if (!student) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>Student information not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">My Child</h1>

      {/* Profile card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-semibold flex-shrink-0 overflow-hidden">
              {student.photoUrl
                ? <img src={student.photoUrl} alt={student.firstName} className="w-full h-full object-cover" />
                : getInitials(`${student.firstName} ${student.lastName}`)
              }
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                {student.firstName} {student.lastName}
              </h2>
              {student.preferredName && (
                <p className="text-sm text-muted-foreground">"{student.preferredName}"</p>
              )}
              {student.studentCode && (
                <p className="text-xs font-mono text-muted-foreground mt-0.5 bg-muted px-2 py-0.5 rounded inline-block">
                  ID: {student.studentCode}
                </p>
              )}
            </div>
            {student.enrollmentStatus && (
              <div className="ml-auto">
                <Badge variant={student.enrollmentStatus as any}>{student.enrollmentStatus}</Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Key info */}
      <Card>
        <CardContent className="p-5 space-y-4 text-sm">
          <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">School Info</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Class</p>
              <p className="mt-0.5 font-medium">{student.className}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Age</p>
              <p className="mt-0.5 font-medium">{student.age}</p>
            </div>
            {student.gender && (
              <div>
                <p className="text-xs text-muted-foreground">Gender</p>
                <p className="mt-0.5">{student.gender}</p>
              </div>
            )}
            {student.primaryLanguage && (
              <div>
                <p className="text-xs text-muted-foreground">Language at Home</p>
                <p className="mt-0.5">{student.primaryLanguage}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Health info (only show if relevant data exists) */}
      {(student.allergies || student.medicalConditions) && (
        <Card>
          <CardContent className="p-5 text-sm space-y-3">
            <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Health Notes on File</h3>
            {student.allergies && (
              <div>
                <p className="text-xs text-muted-foreground">Allergies</p>
                <p className="mt-0.5">{student.allergies}</p>
              </div>
            )}
            {student.medicalConditions && (
              <div>
                <p className="text-xs text-muted-foreground">Medical Conditions</p>
                <p className="mt-0.5">{student.medicalConditions}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Attendance history */}
      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide mb-4">Attendance — Last 30 Days</h3>
          {attendance.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No attendance records yet.</p>
          ) : (
            <div className="space-y-2">
              {attendance.map((rec) => {
                const cfg = ATTENDANCE_CONFIG[rec.status];
                const Icon = cfg.icon;
                const dateLabel = new Date(rec.date + "T00:00:00").toLocaleDateString("en-PH", {
                  weekday: "short", month: "short", day: "numeric",
                });
                return (
                  <div key={rec.id} className="flex items-center gap-3 text-sm">
                    <Icon className={`w-4 h-4 flex-shrink-0 ${cfg.color}`} />
                    <span className="flex-1 text-muted-foreground">{dateLabel}</span>
                    <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                    {rec.notes && (
                      <span className="text-xs text-muted-foreground truncate max-w-24">{rec.notes}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-center text-muted-foreground pb-4">
        To update your child&apos;s information, contact the school.
      </p>
    </div>
  );
}
