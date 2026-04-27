"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, XCircle, GraduationCap, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";

type PageStatus = "loading" | "valid" | "invalid" | "used" | "email_mismatch" | "server_error";

function InvitePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const supabase = createClient();

  const [status, setStatus] = useState<PageStatus>("loading");
  const [accepting, setAccepting] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [schoolName, setSchoolName] = useState("");

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    validateToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function validateToken() {
    // Public SELECT policy allows anonymous reads for token validation (display only).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("guardian_invites")
      .select("id, used_at, expires_at, student_id, students(first_name, last_name), school_id, schools(name)")
      .eq("token", token)
      .maybeSingle();

    if (!data) { setStatus("invalid"); return; }
    if (data.used_at) { setStatus("used"); return; }
    if (data.expires_at && new Date(data.expires_at) < new Date()) { setStatus("invalid"); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any;
    setStudentName(`${d.students?.first_name ?? ""} ${d.students?.last_name ?? ""}`.trim());
    setSchoolName(d.schools?.name ?? "");
    setStatus("valid");
  }

  async function handleAccept() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      localStorage.setItem("__ll_invite_token", token ?? "");
      router.push("/login?redirect=/parent/invite?token=" + encodeURIComponent(token ?? ""));
      return;
    }

    setAccepting(true);
    try {
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const json = await res.json();

      if (res.ok) {
        router.push("/parent/dashboard");
        return;
      }

      switch (json.error) {
        case "used":
          setStatus("used");
          break;
        case "invalid":
        case "expired":
          setStatus("invalid");
          break;
        case "email_mismatch":
          setStatus("email_mismatch");
          break;
        case "unauthorized":
          localStorage.setItem("__ll_invite_token", token ?? "");
          router.push("/login?redirect=/parent/invite?token=" + encodeURIComponent(token ?? ""));
          break;
        default:
          setStatus("server_error");
      }
    } catch {
      setStatus("server_error");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
            <GraduationCap className="w-8 h-8 text-primary-foreground" />
          </div>
        </div>

        {status === "loading" && (
          <div className="space-y-3">
            <Spinner />
            <p className="text-muted-foreground text-sm">Validating invite link…</p>
          </div>
        )}

        {status === "valid" && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold">{schoolName}</h1>
              <p className="text-muted-foreground mt-1">You&apos;ve been invited to access the parent portal for</p>
              <p className="text-lg font-bold mt-1">{studentName}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Sign in (or create an account) with the same email address on file with the school to access your child&apos;s updates, attendance, and more.
            </p>
            <Button onClick={handleAccept} className="w-full" disabled={accepting}>
              {accepting ? <Spinner size="sm" /> : null}
              Accept &amp; Continue
            </Button>
          </div>
        )}

        {status === "invalid" && (
          <div className="space-y-4">
            <XCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h1 className="text-xl font-semibold">Invalid or Expired Link</h1>
            <p className="text-muted-foreground text-sm">
              This invite link is no longer valid. Ask the school to send a new one.
            </p>
          </div>
        )}

        {status === "used" && (
          <div className="space-y-4">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
            <h1 className="text-xl font-semibold">Already Used</h1>
            <p className="text-muted-foreground text-sm">
              This invite link has already been used. Log in to access the parent portal.
            </p>
            <Button onClick={() => router.push("/login")} className="w-full">Go to Login</Button>
          </div>
        )}

        {status === "email_mismatch" && (
          <div className="space-y-4">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
            <h1 className="text-xl font-semibold">Wrong Account</h1>
            <p className="text-muted-foreground text-sm">
              The email address you&apos;re signed in with doesn&apos;t match this invite. Please sign out and sign in with the email address the school has on file, or contact the school to re-send the invite.
            </p>
            <Button onClick={() => router.push("/login")} className="w-full">Go to Login</Button>
          </div>
        )}

        {status === "server_error" && (
          <div className="space-y-4">
            <XCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h1 className="text-xl font-semibold">Something Went Wrong</h1>
            <p className="text-muted-foreground text-sm">
              We couldn&apos;t complete your invite acceptance. Please try again or contact the school.
            </p>
            <Button onClick={() => setStatus("valid")} variant="outline" className="w-full">Try Again</Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense>
      <InvitePageInner />
    </Suspense>
  );
}
