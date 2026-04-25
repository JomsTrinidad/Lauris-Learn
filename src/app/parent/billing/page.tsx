"use client";
import { useEffect, useState } from "react";
import { CreditCard, ChevronDown, ChevronUp, Printer, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PageSpinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useParentContext } from "../layout";

type PaymentMethod = "cash" | "bank_transfer" | "gcash" | "maya" | "other";

interface Payment {
  id: string;
  amount: number;
  method: PaymentMethod;
  date: string;
  reference: string | null;
  orNumber: string | null;
}

interface BillingRecord {
  id: string;
  description: string;
  billingMonth: string;
  amountDue: number;
  amountPaid: number;
  dueDate: string | null;
  status: string;
  payments: Payment[];
}

function formatMonth(ym: string) {
  const d = new Date(ym + "-01T00:00:00");
  return d.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}

function printContent(elementId: string, title: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const win = window.open("", "_blank", "width=820,height=700");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;padding:40px;color:#111;font-size:13px}
    h1{font-size:20px;margin-bottom:2px}
    h2{font-size:15px;color:#555;margin-bottom:16px}
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
    .status-paid{color:#16a34a}.status-unpaid{color:#666}
    .status-overdue{color:#dc2626}.status-partial{color:#d97706}.status-cancelled{color:#999}
    .footer{margin-top:32px;font-size:11px;color:#aaa;text-align:center}
    @media print{body{padding:20px}}
  </style></head><body>${el.innerHTML}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
}

export default function ParentBillingPage() {
  const { childId, child, schoolName } = useParentContext();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<{ payment: Payment; record: BillingRecord } | null>(null);
  const [statementOpen, setStatementOpen] = useState(false);

  useEffect(() => {
    if (!childId) { setLoading(false); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  async function load() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: billingRows } = await (supabase as any)
      .from("billing_records")
      .select("id, description, billing_month, amount_due, due_date, status")
      .eq("student_id", childId)
      .order("billing_month", { ascending: false });

    const ids = ((billingRows ?? []) as { id: string }[]).map((b) => b.id);
    const paymentsByRecord: Record<string, Payment[]> = {};

    if (ids.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pmts } = await (supabase as any)
        .from("payments")
        .select("id, billing_record_id, amount, payment_method, payment_date, reference_number, or_number")
        .eq("status", "confirmed")
        .in("billing_record_id", ids)
        .order("payment_date", { ascending: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((pmts ?? []) as any[]).forEach((p: any) => {
        if (!paymentsByRecord[p.billing_record_id]) paymentsByRecord[p.billing_record_id] = [];
        paymentsByRecord[p.billing_record_id].push({
          id: p.id, amount: Number(p.amount), method: p.payment_method as PaymentMethod,
          date: p.payment_date, reference: p.reference_number ?? null, orNumber: p.or_number ?? null,
        });
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setRecords(((billingRows ?? []) as any[]).map((b: any) => {
      const payments = paymentsByRecord[b.id] ?? [];
      return {
        id: b.id,
        description: b.description ?? "",
        billingMonth: b.billing_month ?? "",
        amountDue: Number(b.amount_due),
        amountPaid: payments.reduce((s, p) => s + p.amount, 0),
        dueDate: b.due_date ?? null,
        status: b.status,
        payments,
      };
    }));
    setLoading(false);
  }

  if (loading) return <PageSpinner />;

  const totalDue = records.filter((r) => r.status !== "cancelled").reduce((s, r) => s + r.amountDue, 0);
  const totalPaid = records.reduce((s, r) => s + r.amountPaid, 0);
  const balance = totalDue - totalPaid;
  const childFullName = child ? `${child.firstName} ${child.lastName}` : "";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Billing & Payments</h1>
        {records.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setStatementOpen(true)}>
            <FileText className="w-4 h-4" /> Statement
          </Button>
        )}
      </div>

      {/* Summary */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Paid</p>
              <p className="text-lg font-semibold text-green-600 mt-0.5">{formatCurrency(totalPaid)}</p>
            </CardContent>
          </Card>
          <Card className={balance > 0 ? "border-red-200" : ""}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className={`text-lg font-semibold mt-0.5 ${balance > 0 ? "text-red-600" : "text-green-600"}`}>
                {formatCurrency(balance)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {records.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground space-y-3">
            <CreditCard className="w-12 h-12 mx-auto opacity-30" />
            <p>No billing records yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {records.map((r) => {
            const bal = r.amountDue - r.amountPaid;
            const expanded = expandedId === r.id;
            return (
              <Card key={r.id}>
                <CardContent className="p-4">
                  {/* Tappable header */}
                  <button className="w-full text-left" onClick={() => setExpandedId(expanded ? null : r.id)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">
                          {r.description || (r.billingMonth ? formatMonth(r.billingMonth) : "—")}
                        </p>
                        {r.billingMonth && r.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{formatMonth(r.billingMonth)}</p>
                        )}
                        {r.dueDate && r.status !== "paid" && r.status !== "cancelled" && (
                          <p className="text-xs text-muted-foreground mt-0.5">Due {r.dueDate}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant={r.status as Parameters<typeof Badge>[0]["variant"]}>{r.status}</Badge>
                        {expanded
                          ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Charged</p>
                        <p className="font-medium">{formatCurrency(r.amountDue)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Paid</p>
                        <p className="font-medium text-green-600">{formatCurrency(r.amountPaid)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Balance</p>
                        <p className={`font-medium ${bal > 0 && r.status !== "cancelled" ? "text-red-600" : ""}`}>{formatCurrency(bal)}</p>
                      </div>
                    </div>
                  </button>

                  {/* Expanded: individual payments */}
                  {expanded && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2.5">
                      {r.payments.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-1">No payments recorded yet.</p>
                      ) : r.payments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-3">
                          <div className="text-xs min-w-0">
                            <p className="font-medium">
                              {formatCurrency(p.amount)}
                              <span className="text-muted-foreground font-normal ml-1 capitalize">{p.method.replace("_", " ")}</span>
                            </p>
                            <p className="text-muted-foreground">
                              {p.date}{p.orNumber ? ` · OR# ${p.orNumber}` : ""}
                              {p.reference ? ` · Ref: ${p.reference}` : ""}
                            </p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setReceiptData({ payment: p, record: r }); }}
                            className="text-xs text-primary flex items-center gap-1 hover:underline flex-shrink-0"
                          >
                            <Printer className="w-3 h-3" /> Receipt
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-center text-muted-foreground pb-4">
        For payment arrangements, contact the school directly.
      </p>

      {/* Receipt Modal */}
      <Modal open={!!receiptData} onClose={() => setReceiptData(null)} title="Payment Receipt">
        {receiptData && (
          <div className="space-y-4">
            {/* Hidden print content */}
            <div id="parent-receipt-content" style={{ display: "none" }}>
              <h1>{schoolName || "School"}</h1>
              <h2>Official Receipt</h2>
              <div className="divider" />
              <div className="meta">
                <div className="meta-block">
                  <p className="label">OR Number</p>
                  <p className="value">{receiptData.payment.orNumber || "—"}</p>
                </div>
                <div className="meta-block">
                  <p className="label">Date</p>
                  <p className="value">{receiptData.payment.date}</p>
                </div>
                <div className="meta-block">
                  <p className="label">Student</p>
                  <p className="value">{childFullName}</p>
                </div>
                <div className="meta-block">
                  <p className="label">Class</p>
                  <p className="value">{child?.className ?? "—"}</p>
                </div>
              </div>
              <div className="divider" />
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Billing Month</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{receiptData.record.description || "Tuition Fee"}</td>
                    <td>{receiptData.record.billingMonth ? formatMonth(receiptData.record.billingMonth) : "—"}</td>
                    <td className="text-right">{formatCurrency(receiptData.payment.amount)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="divider" />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <p className="label">Payment Method</p>
                  <p className="value" style={{ textTransform: "capitalize" }}>{receiptData.payment.method.replace("_", " ")}</p>
                  {receiptData.payment.reference && <p className="label" style={{ marginTop: "4px" }}>Ref: {receiptData.payment.reference}</p>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <p className="label">Amount Paid</p>
                  <p style={{ fontSize: "22px", fontWeight: "bold" }}>{formatCurrency(receiptData.payment.amount)}</p>
                </div>
              </div>
              <p className="footer">Thank you for your payment! — {schoolName}</p>
            </div>

            {/* Screen-visible receipt summary */}
            <div className="p-4 border border-border rounded-lg bg-muted/30 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">OR Number</span>
                <span className="font-mono font-medium">{receiptData.payment.orNumber || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Date</span>
                <span>{receiptData.payment.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Method</span>
                <span className="capitalize">{receiptData.payment.method.replace("_", " ")}</span>
              </div>
              {receiptData.payment.reference && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs">Reference</span>
                  <span>{receiptData.payment.reference}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Description</span>
                <span className="text-right ml-4">{receiptData.record.description || formatMonth(receiptData.record.billingMonth)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2.5 mt-1">
                <span className="font-medium">Amount Paid</span>
                <span className="font-semibold text-green-600 text-base">{formatCurrency(receiptData.payment.amount)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setReceiptData(null)}>Close</Button>
              <Button onClick={() => printContent("parent-receipt-content", `Receipt — ${childFullName}`)}>
                <Printer className="w-4 h-4" /> Print Receipt
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Billing Statement Modal */}
      <Modal open={statementOpen} onClose={() => setStatementOpen(false)} title="Billing Statement">
        <div className="space-y-4">
          {/* Hidden print content */}
          <div id="parent-statement-content" style={{ display: "none" }}>
            <h1>{schoolName || "School"}</h1>
            <h2>Billing Statement</h2>
            <div className="divider" />
            <div className="meta">
              <div className="meta-block">
                <p className="label">Student</p>
                <p className="value">{childFullName}</p>
              </div>
              <div className="meta-block">
                <p className="label">Class</p>
                <p className="value">{child?.className ?? "—"}</p>
              </div>
            </div>
            <div className="divider" />
            {records.length === 0 ? (
              <p style={{ color: "#666", textAlign: "center", padding: "16px 0" }}>No billing records.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Description</th>
                    <th className="text-right">Charged</th>
                    <th className="text-right">Paid</th>
                    <th className="text-right">Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...records].reverse().map((r) => {
                    const bal = r.amountDue - r.amountPaid;
                    return (
                      <tr key={r.id}>
                        <td style={{ whiteSpace: "nowrap" }}>{r.billingMonth ? formatMonth(r.billingMonth) : "—"}</td>
                        <td>{r.description || "—"}</td>
                        <td className="text-right">{formatCurrency(r.amountDue)}</td>
                        <td className="text-right" style={{ color: "#16a34a" }}>{formatCurrency(r.amountPaid)}</td>
                        <td className="text-right" style={{ color: bal > 0 && r.status !== "cancelled" ? "#dc2626" : undefined }}>{formatCurrency(bal)}</td>
                        <td><span className={`status-${r.status}`}>{r.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="total-row">
                    <td colSpan={2}>Total</td>
                    <td className="text-right">{formatCurrency(totalDue)}</td>
                    <td className="text-right">{formatCurrency(totalPaid)}</td>
                    <td className="text-right" style={{ color: balance > 0 ? "#dc2626" : "#16a34a" }}>{formatCurrency(balance)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
            <p className="footer">Generated {new Date().toLocaleDateString("en-PH")} — {schoolName}</p>
          </div>

          {/* Screen-visible statement preview */}
          <div className="rounded-lg border border-border overflow-hidden text-sm">
            <div className="bg-muted px-4 py-2.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Month</span>
              <div className="flex gap-6 text-right">
                <span className="w-20">Charged</span>
                <span className="w-20">Paid</span>
                <span className="w-20">Balance</span>
              </div>
            </div>
            {[...records].reverse().map((r) => {
              const bal = r.amountDue - r.amountPaid;
              return (
                <div key={r.id} className="px-4 py-3 border-t border-border flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{r.billingMonth ? formatMonth(r.billingMonth) : "—"}</p>
                    {r.description && <p className="text-xs text-muted-foreground truncate">{r.description}</p>}
                  </div>
                  <div className="flex gap-6 text-right flex-shrink-0 text-xs">
                    <span className="w-20">{formatCurrency(r.amountDue)}</span>
                    <span className="w-20 text-green-600">{formatCurrency(r.amountPaid)}</span>
                    <span className={`w-20 ${bal > 0 && r.status !== "cancelled" ? "text-red-600" : ""}`}>{formatCurrency(bal)}</span>
                  </div>
                </div>
              );
            })}
            <div className="px-4 py-3 border-t-2 border-border bg-muted/50 flex items-center justify-between text-xs font-semibold">
              <span>Total</span>
              <div className="flex gap-6 text-right">
                <span className="w-20">{formatCurrency(totalDue)}</span>
                <span className="w-20 text-green-600">{formatCurrency(totalPaid)}</span>
                <span className={`w-20 ${balance > 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(balance)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Balance: <strong className={balance > 0 ? "text-red-600" : "text-green-600"}>{formatCurrency(balance)}</strong>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStatementOpen(false)}>Close</Button>
              <Button onClick={() => printContent("parent-statement-content", `Statement — ${childFullName}`)}>
                <FileText className="w-4 h-4" /> Print
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
