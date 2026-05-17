"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";

/**
 * Set-new-password page reached after clicking either:
 *   - the invite email (first password set)
 *   - the forgot-password email
 *
 * Both routes hit /auth/callback first, which exchanges the PKCE code for a
 * session cookie before redirecting here. So when this page mounts the user
 * should already be authenticated; if not, we send them to forgot-password.
 */
export default function ResetPasswordPage() {
  const supabase = createClient();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setHasSession(!!data.user);
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 2500);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image
              src="/assets/logo/lauris-learn-logo.png"
              alt="Lauris Learn"
              width={64}
              height={64}
              className="object-contain"
              style={{ width: 64, height: 64 }}
            />
          </div>
          <h1 className="text-2xl font-bold">Set Your Password</h1>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          {checking ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : !hasSession ? (
            <div className="space-y-4 text-center">
              <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                Your reset link has expired or is invalid. Request a new one to continue.
              </div>
              <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                Request a new reset link
              </Link>
            </div>
          ) : done ? (
            <div className="space-y-4 text-center">
              <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                Password updated. Redirecting to sign in…
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">New Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Confirm Password</label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>

              {error && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={saving} className="w-full" size="lg">
                {saving ? "Saving…" : "Save Password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
