import type { BillingStatus } from "./types";

export function formatMonth(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}

export function computeStatus(dbStatus: BillingStatus, amountDue: number, amountPaid: number, dueDate: string | null): BillingStatus {
  if (dbStatus === "cancelled" || dbStatus === "refunded" || dbStatus === "waived") return dbStatus;
  const balance = amountDue - amountPaid;
  if (balance <= 0) return "paid";
  if (amountPaid > 0) return "partial";
  if (dbStatus === "paid") return "paid";
  if (dueDate && new Date(dueDate) < new Date()) return "overdue";
  return "unpaid";
}

export function getMonthRange(from: string, to: string): string[] {
  if (!from) return [];
  const result: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const end = to || from;
  const [ey, em] = end.split("-").map(Number);
  let y = fy, m = fm;
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
    if (result.length > 24) break;
  }
  return result;
}

export function getAgingDays(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const days = Math.floor((Date.now() - new Date(dueDate + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : null;
}

export function agingLabel(days: number) {
  if (days < 30) return `${days}d`; if (days < 60) return "30d+";
  if (days < 90) return "60d+"; return "90d+";
}

export function agingClass(days: number) {
  if (days < 30) return "text-orange-500 text-xs"; if (days < 60) return "text-orange-600 text-xs font-medium";
  if (days < 90) return "text-red-600 text-xs font-medium"; return "text-red-700 text-xs font-bold";
}

export function printContent(elementId: string, title: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const win = window.open("", "_blank", "width=820,height=700");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;padding:40px;color:#111;font-size:13px}
    h1{font-size:20px;margin-bottom:2px} h2{font-size:15px;color:#555;margin-bottom:16px}
    .divider{border-top:1px solid #ddd;margin:16px 0}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px}
    .meta-block p{margin-bottom:3px}
    .label{color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
    .value{font-weight:600;font-size:14px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th{background:#f5f5f5;padding:8px 10px;text-align:left;font-size:12px;border-bottom:2px solid #ddd}
    td{padding:8px 10px;border-bottom:1px solid #eee;font-size:13px}
    .text-right{text-align:right}
    .total-row td{font-weight:bold;background:#f9f9f9;border-top:2px solid #ddd}
    .status-paid{color:#16a34a} .status-unpaid{color:#666} .status-overdue{color:#dc2626}
    .status-partial{color:#d97706} .status-cancelled{color:#999}
    .status-waived{color:#0284c7} .status-refunded{color:#7c3aed}
    .footer{margin-top:32px;font-size:11px;color:#aaa;text-align:center}
    @media print{body{padding:20px}}
  </style></head><body>${el.innerHTML}</body></html>`);
  win.document.close(); win.focus();
  setTimeout(() => win.print(), 350);
}

export function computeNthWeekday(year: number, month: number, nth: number, weekday: number): string {
  if (nth === -1) {
    const lastDay = new Date(year, month + 1, 0);
    const diff = (lastDay.getDay() - weekday + 7) % 7;
    const date = lastDay.getDate() - diff;
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
  }
  const firstDay = new Date(year, month, 1);
  const firstOccurrence = 1 + ((weekday - firstDay.getDay() + 7) % 7) + (nth - 1) * 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (firstOccurrence > daysInMonth) return "";
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(firstOccurrence).padStart(2, "0")}`;
}
