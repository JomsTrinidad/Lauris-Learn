"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Clock, Mail, Plus, RefreshCw, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Spinner, ErrorAlert } from "@/components/ui/spinner";
import { formatDate } from "@/lib/utils";

interface AdminRow {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  invitedAt: string | null;
  pending: boolean;
}

export function ManageAdminsModal({
  open,
  schoolId,
  schoolName,
  onClose,
}: {
  open: boolean;
  schoolId: string | null;
  schoolName: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/super-admin/admins/list?schoolId=${schoolId}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load admins."); setAdmins([]); }
      else { setAdmins(json.admins ?? []); }
    } catch {
      setError("Network error loading admins.");
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (open && schoolId) {
      setShowAdd(false);
      setNewEmail("");
      setNewName("");
      setInfo("");
      setError("");
      load();
    }
  }, [open, schoolId, load]);

  async function handleAdd() {
    if (!schoolId) return;
    setError(""); setInfo("");
    if (!newEmail.trim()) { setError("Email is required."); return; }

    setAdding(true);
    try {
      const res = await fetch("/api/super-admin/admins/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId,
          email: newEmail.trim(),
          fullName: newName.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 207) {
        setError(json.error ?? "Failed to add admin.");
        return;
      }
      if (json.mode === "invited")               setInfo(`Invite email sent to ${newEmail.trim()}.`);
      else if (json.mode === "assigned")         setInfo(`Admin access granted to ${newEmail.trim()}.`);
      else if (json.mode === "already_assigned") setInfo(`${newEmail.trim()} is already an admin of this school.`);
      else                                       setInfo("Done.");

      setNewEmail(""); setNewName(""); setShowAdd(false);
      load();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  async function handleResend(row: AdminRow) {
    if (!schoolId) return;
    setError(""); setInfo("");
    setBusyId(row.id);
    try {
      const res = await fetch("/api/super-admin/admins/resend-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId, email: row.email }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to resend invite."); return; }
      setInfo(json.mode === "invite_email_sent"
        ? `Invite email resent to ${row.email}.`
        : `Password reset email sent to ${row.email}.`);
      load();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Admin Access — ${schoolName}`}>
      <div className="space-y-4">
        {error && <ErrorAlert message={error} />}
        {info && (
          <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            {info}
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            School admins can run the full school dashboard.
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => { setShowAdd((v) => !v); setError(""); setInfo(""); }}>
              {showAdd ? <X className="w-3.5 h-3.5 mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              {showAdd ? "Cancel" : "Add admin"}
            </Button>
          </div>
        </div>

        {showAdd && (
          <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/20">
            <div>
              <label className="block text-sm font-medium mb-1.5">Admin email *</label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="admin@school.com"
              />
              <p className="text-xs text-muted-foreground mt-1">
                If the email matches an existing account they&apos;ll be assigned immediately.
                Otherwise Supabase will email them an invite to set a password (requires SMTP
                to be configured at the Supabase project for production-grade delivery).
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Full name (optional)</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Jane Cruz"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAdd} disabled={adding}>
                <UserPlus className="w-3.5 h-3.5 mr-1" />
                {adding ? "Working…" : "Send"}
              </Button>
            </div>
          </div>
        )}

        <div className="border border-border rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-6 flex justify-center"><Spinner /></div>
          ) : admins.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No admins yet. Add one above.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Admin</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Added</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {admins.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{a.fullName || a.email}</div>
                      <div className="text-xs text-muted-foreground">{a.email}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      {a.pending ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                          <Clock className="w-3 h-3" /> Invite pending
                        </span>
                      ) : a.lastSignInAt ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                          <CheckCircle className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                          <Mail className="w-3 h-3" /> Confirmed
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">
                      {formatDate(a.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResend(a)}
                        disabled={busyId === a.id}
                      >
                        <Mail className="w-3.5 h-3.5 mr-1" />
                        {busyId === a.id
                          ? "Sending…"
                          : a.pending ? "Resend invite email" : "Send reset email"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Removing or downgrading an admin still requires a SQL update — that path lives in
          Settings → Teachers (or the user-management surface) once it ships.
        </p>
      </div>
    </Modal>
  );
}
