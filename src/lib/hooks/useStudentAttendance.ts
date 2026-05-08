import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export interface AttendanceRecord {
  id: string;
  date: string;
  status: "present" | "late" | "absent" | "excused";
  note: string | null;
}

/**
 * useStudentAttendance — fetch attendance records for a student
 *
 * Returns last 30 attendance records, newest first.
 * Used by parent portal student detail page.
 * Cached for 30 seconds to prevent re-fetches on back-navigation.
 */
export function useStudentAttendance(studentId: string | null, limit: number = 30) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.attendance.forStudent(studentId || ""),
    queryFn: async () => {
      if (!studentId) throw new Error("studentId required");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("attendance_records")
        .select("id, date, status, note")
        .eq("student_id", studentId)
        .order("date", { ascending: false })
        .limit(limit);

      return (data ?? []) as AttendanceRecord[];
    },
    enabled: !!studentId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: true,
  });
}
