import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-client";

export type AttendanceSignalSeverity = "risk" | "positive" | "neutral";

export interface AttendanceSignal {
  id: string;
  type: "consecutive_absence" | "returned" | "class_full_week" | "no_concerns";
  text: string;
  severity: AttendanceSignalSeverity;
}

function isWeekday(dateStr: string): boolean {
  const dow = new Date(dateStr + "T00:00:00Z").getUTCDay();
  return dow >= 1 && dow <= 5;
}

// Most recent N school days, starting from today, going backwards (index 0 = today)
function recentSchoolDays(today: string, n: number, noClassDates: Set<string>): string[] {
  const result: string[] = [];
  const cur = new Date(today + "T00:00:00Z");
  let guard = 0;
  while (result.length < n && guard++ < 60) {
    const d = cur.toISOString().slice(0, 10);
    if (isWeekday(d) && !noClassDates.has(d)) result.push(d);
    cur.setUTCDate(cur.getUTCDate() - 1);
  }
  return result;
}

// School days in the current week (Mon → today), oldest first
function thisWeekSchoolDays(today: string, noClassDates: Set<string>): string[] {
  const todayDate = new Date(today + "T00:00:00Z");
  const dow = todayDate.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const daysSinceMon = dow === 0 ? 6 : dow - 1;
  const result: string[] = [];
  for (let i = daysSinceMon; i >= 0; i--) {
    const d = new Date(todayDate);
    d.setUTCDate(d.getUTCDate() - i);
    const ds = d.toISOString().slice(0, 10);
    if (isWeekday(ds) && !noClassDates.has(ds)) result.push(ds);
  }
  return result;
}

export function useAttendanceSignals({
  schoolId,
  todayClassIds,
  todayEnrolledByClass,
  classNamesById,
  enabled,
}: {
  schoolId: string | null;
  todayClassIds: string[];
  todayEnrolledByClass: Record<string, number>;
  classNamesById: Record<string, string>;
  enabled: boolean;
}): UseQueryResult<AttendanceSignal[]> {
  const supabase = createClient();
  const classKey = [...todayClassIds].sort().join(",");

  return useQuery({
    queryKey: queryKeys.attendance.signals(schoolId ?? "", classKey),
    queryFn: async (): Promise<AttendanceSignal[]> => {
      if (!schoolId || todayClassIds.length === 0) return [];

      const today = new Date().toISOString().split("T")[0];
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const [{ data: attRows }, { data: holidayRows }] = await Promise.all([
        supabase
          .from("attendance_records")
          .select("student_id, class_id, date, status")
          .in("class_id", todayClassIds)
          .gte("date", fourteenDaysAgo)
          .lte("date", today),
        supabase
          .from("holidays")
          .select("date")
          .eq("school_id", schoolId)
          .eq("is_no_class", true)
          .gte("date", fourteenDaysAgo)
          .lte("date", today),
      ]);

      const noClassDates = new Set((holidayRows ?? []).map((h) => h.date as string));

      // { classId → { studentId → { date → status } } }
      const byClass: Record<string, Record<string, Record<string, string>>> = {};
      (attRows ?? []).forEach((r) => {
        (byClass[r.class_id] ??= {});
        (byClass[r.class_id][r.student_id] ??= {});
        byClass[r.class_id][r.student_id][r.date] = r.status;
      });

      const signals: AttendanceSignal[] = [];
      const last7 = recentSchoolDays(today, 7, noClassDates);

      // ── Signal 1: Consecutive absence risk ────────────────────────────────────
      let consecAbsCount = 0;
      const consecAbsClasses: string[] = [];

      for (const classId of todayClassIds) {
        const classRecs = byClass[classId] ?? {};
        let classAffected = 0;
        for (const dateMap of Object.values(classRecs)) {
          let streak = 0;
          for (const d of last7) {
            const s = dateMap[d];
            if (s === undefined) break; // no record → attendance not marked, stop
            if (s === "absent") streak++;
            else break;
          }
          if (streak >= 3) classAffected++;
        }
        if (classAffected > 0) {
          consecAbsCount += classAffected;
          const n = classNamesById[classId];
          if (n && !consecAbsClasses.includes(n)) consecAbsClasses.push(n);
        }
      }

      if (consecAbsCount > 0) {
        const w = consecAbsCount === 1 ? "student" : "students";
        const hint = consecAbsClasses.length === 1 ? ` in ${consecAbsClasses[0]}` : "";
        signals.push({
          id: "consecutive_absence",
          type: "consecutive_absence",
          text: `${consecAbsCount} ${w}${hint} absent 3+ days in a row — follow up`,
          severity: "risk",
        });
      }

      // ── Signal 2: Returned after extended absence ──────────────────────────────
      let returnedCount = 0;

      for (const classId of todayClassIds) {
        const classRecs = byClass[classId] ?? {};
        for (const dateMap of Object.values(classRecs)) {
          const todayStatus = dateMap[today];
          if (todayStatus !== "present" && todayStatus !== "late") continue;
          const priorDays = last7.filter((d) => d !== today);
          let priorStreak = 0;
          for (const d of priorDays) {
            const s = dateMap[d];
            if (s === undefined) break;
            if (s === "absent") priorStreak++;
            else break;
          }
          if (priorStreak >= 3) returnedCount++;
        }
      }

      if (returnedCount > 0 && signals.length < 3) {
        const w = returnedCount === 1 ? "student" : "students";
        signals.push({
          id: "returned",
          type: "returned",
          text: `${returnedCount} ${w} back after extended absence today`,
          severity: "positive",
        });
      }

      // ── Signal 3: Class full attendance streak ────────────────────────────────
      const weekDays = thisWeekSchoolDays(today, noClassDates);
      if (weekDays.length >= 2 && signals.length < 3) {
        const fullClasses: string[] = [];
        for (const classId of todayClassIds) {
          const enrolled = todayEnrolledByClass[classId] ?? 0;
          if (enrolled === 0) continue;
          let allFull = true;
          for (const d of weekDays) {
            const classRecs = byClass[classId] ?? {};
            let presentCount = 0;
            for (const dateMap of Object.values(classRecs)) {
              if (dateMap[d] === "present" || dateMap[d] === "late") presentCount++;
            }
            if (presentCount < enrolled) { allFull = false; break; }
          }
          if (allFull) {
            const n = classNamesById[classId] ?? classId;
            fullClasses.push(n);
          }
        }
        if (fullClasses.length > 0) {
          const classText =
            fullClasses.length === 1 ? fullClasses[0] : `${fullClasses.length} classes`;
          signals.push({
            id: "class_full_week",
            type: "class_full_week",
            text: `${classText} — full attendance all week`,
            severity: "positive",
          });
        }
      }

      // ── Fallback ──────────────────────────────────────────────────────────────
      if (signals.length === 0) {
        signals.push({
          id: "no_concerns",
          type: "no_concerns",
          text: "No attendance concerns flagged today",
          severity: "neutral",
        });
      }

      return signals.slice(0, 3);
    },
    enabled: !!schoolId && todayClassIds.length > 0 && enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
