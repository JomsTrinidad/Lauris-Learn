"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldOff, LogOut } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export default function CareAccessDeniedPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data?.user?.email ?? "");
    });
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center">
        <ShieldOff className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h1 className="text-lg font-semibold">Lauris Care access not granted</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {email ? (
            <>
              <span className="font-medium">{email}</span> isn't currently a
              member of any clinic or medical-practice organization in Lauris
              Care.
            </>
          ) : (
            "You aren't currently a member of any clinic or medical-practice organization in Lauris Care."
          )}
        </p>
        <p className="text-sm text-muted-foreground mt-3">
          If you believe this is a mistake, ask the organization that invited
          you to confirm your membership is active.
        </p>
        <div className="mt-6">
          <Button type="button" variant="outline" onClick={signOut}>
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}
