"use client";

import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/datepicker";
import { createClinicDocument } from "./clinic-documents-api";

interface Props {
  open: boolean;
  originOrganizationId: string;
  childProfileId: string;
  uploaderProfileId: string;
  onClose: () => void;
  onUploaded: () => void;
}

const COMMON_KINDS = [
  "Therapy Evaluation",
  "Therapy Progress Note",
  "Medical Certificate",
  "Intake Form",
  "Consent Form",
  "Treatment Plan",
  "Other",
];

const ACCEPTED = ".pdf,.jpg,.jpeg,.png,.webp";

export function UploadClinicDocumentModal({
  open,
  originOrganizationId,
  childProfileId,
  uploaderProfileId,
  onClose,
  onUploaded,
}: Props) {
  const [title, setTitle] = useState("");
  const [documentKind, setDocumentKind] = useState("");
  const [description, setDescription] = useState("");
  const [allowDownload, setAllowDownload] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setDocumentKind("");
    setDescription("");
    setAllowDownload(false);
    setEffectiveDate("");
    setReviewDate("");
    setFile(null);
    setError(null);
    setSubmitting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Please attach a file.");
      return;
    }
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!documentKind.trim()) {
      setError("Document kind is required.");
      return;
    }

    setSubmitting(true);
    const result = await createClinicDocument({
      originOrganizationId,
      childProfileId,
      uploaderProfileId,
      documentKind,
      title,
      description: description.trim() || null,
      permissions: { view: true, download: allowDownload },
      effectiveDate: effectiveDate || null,
      reviewDate: reviewDate || null,
      file,
    });
    setSubmitting(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    reset();
    onUploaded();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Upload Document">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Internal clinic document. Stored privately and not visible to
          schools or other clinics.
        </p>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Title <span className="text-red-600">*</span>
          </label>
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Initial Speech Evaluation"
            required
            maxLength={200}
            disabled={submitting}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Kind <span className="text-red-600">*</span>
          </label>
          <Input
            list="clinic-doc-kinds"
            type="text"
            value={documentKind}
            onChange={(e) => setDocumentKind(e.target.value)}
            placeholder="Select or type a kind"
            required
            maxLength={64}
            disabled={submitting}
          />
          <datalist id="clinic-doc-kinds">
            {COMMON_KINDS.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <p className="text-xs text-muted-foreground mt-1">
            Stored in lowercase. Casing variants collapse automatically.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Description <span className="text-xs text-muted-foreground font-normal">(optional)</span>
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Short note about this document"
            disabled={submitting}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Effective date
            </label>
            <DatePicker value={effectiveDate} onChange={setEffectiveDate} />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Review date
            </label>
            <DatePicker value={reviewDate} onChange={setReviewDate} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            File <span className="text-red-600">*</span>
          </label>
          <input
            type="file"
            accept={ACCEPTED}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={submitting}
            className="block w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-muted file:text-sm file:font-medium hover:file:bg-muted/70"
          />
          <p className="text-xs text-muted-foreground mt-1">
            PDF, JPEG, PNG, or WebP. Up to 25 MB.
          </p>
        </div>

        <label className="flex items-start gap-2 cursor-pointer px-3 py-2 bg-muted/30 border border-border rounded-lg">
          <input
            type="checkbox"
            checked={allowDownload}
            onChange={(e) => setAllowDownload(e.target.checked)}
            disabled={submitting}
            className="rounded mt-0.5"
          />
          <div className="text-sm">
            <p className="font-medium">Allow non-admin clinic staff to download</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Admins can always download. Without this, therapists can preview
              but not save the file locally.
            </p>
          </div>
        </label>

        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <ModalCancelButton />
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
