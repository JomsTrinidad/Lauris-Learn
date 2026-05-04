"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Stethoscope } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { acceptChildAsTherapyClient } from "./sessions-api";

interface Props {
  organizationId: string;
  childProfileId: string;
  childName: string;
  onAccepted: () => void;
}

export function AcceptAsTherapyClientCard({
  organizationId,
  childProfileId,
  childName,
  onAccepted,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setBusy(true);
    setError(null);
    const result = await acceptChildAsTherapyClient(
      organizationId,
      childProfileId,
    );
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onAccepted();
  }

  return (
    <Card>
      <CardContent className="py-5 flex items-start gap-3">
        <div className="p-2 bg-primary/10 rounded-md flex-shrink-0">
          <Stethoscope className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium">Accept as therapy client?</p>
          <p className="text-sm text-muted-foreground mt-1">
            <strong>{childName}</strong> is shared with your clinic. To start
            scheduling therapy sessions, accept them as a therapy client. You
            can stop at any time.
          </p>
          {error && (
            <p className="text-xs text-red-700 mt-2">{error}</p>
          )}
          <Button
            type="button"
            size="sm"
            className="mt-3"
            onClick={handleAccept}
            disabled={busy}
          >
            {busy ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Accepting…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Accept as therapy client
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
