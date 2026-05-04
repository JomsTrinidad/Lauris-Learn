"use client";

import { useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  addIdentifier,
  deleteIdentifier,
  updateIdentifier,
} from "./queries";
import type { ChildIdentifier } from "./types";

interface Props {
  open: boolean;
  childProfileId: string;
  identifiers: ChildIdentifier[];
  onClose: () => void;
  onChanged: () => void;
}

interface DraftRow {
  /** Stable client-side key for React. For existing rows this equals the
   *  DB id. For not-yet-saved rows this is a synthetic uuid prefixed with
   *  'new-'. */
  key: string;
  id: string | null;       // null = not yet inserted
  identifierType: string;
  identifierValue: string;
  countryCode: string;
  /** Snapshot of the saved values, used to detect dirtiness. */
  savedType: string;
  savedValue: string;
  savedCountry: string;
  busy: boolean;
  error: string | null;
}

function snapshot(id: ChildIdentifier): DraftRow {
  return {
    key: id.id,
    id: id.id,
    identifierType: id.identifierType,
    identifierValue: id.identifierValue,
    countryCode: id.countryCode ?? "",
    savedType: id.identifierType,
    savedValue: id.identifierValue,
    savedCountry: id.countryCode ?? "",
    busy: false,
    error: null,
  };
}

export function ManageIdentifiersModal({
  open,
  childProfileId,
  identifiers,
  onClose,
  onChanged,
}: Props) {
  const [rows, setRows] = useState<DraftRow[]>(() => identifiers.map(snapshot));

  function patch(key: string, p: Partial<DraftRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }

  function isDirty(r: DraftRow): boolean {
    return (
      r.identifierType !== r.savedType ||
      r.identifierValue !== r.savedValue ||
      r.countryCode !== r.savedCountry
    );
  }

  function addRow() {
    setRows((rs) => [
      ...rs,
      {
        key: `new-${crypto.randomUUID()}`,
        id: null,
        identifierType: "",
        identifierValue: "",
        countryCode: "",
        savedType: "",
        savedValue: "",
        savedCountry: "",
        busy: false,
        error: null,
      },
    ]);
  }

  async function saveRow(r: DraftRow) {
    if (!r.identifierType.trim() || !r.identifierValue.trim()) {
      patch(r.key, { error: "Type and value are required." });
      return;
    }

    patch(r.key, { busy: true, error: null });

    if (r.id === null) {
      const result = await addIdentifier(childProfileId, {
        identifierType: r.identifierType,
        identifierValue: r.identifierValue,
        countryCode: r.countryCode || null,
      });
      if ("error" in result) {
        patch(r.key, { busy: false, error: result.error });
        return;
      }
      patch(r.key, {
        busy: false,
        id: result.identifierId,
        savedType: r.identifierType.trim(),
        savedValue: r.identifierValue.trim(),
        savedCountry: r.countryCode.trim(),
      });
      onChanged();
      return;
    }

    const result = await updateIdentifier(r.id, {
      identifierType: r.identifierType,
      identifierValue: r.identifierValue,
      countryCode: r.countryCode || null,
    });
    if ("error" in result) {
      patch(r.key, { busy: false, error: result.error });
      return;
    }
    patch(r.key, {
      busy: false,
      savedType: r.identifierType.trim(),
      savedValue: r.identifierValue.trim(),
      savedCountry: r.countryCode.trim(),
    });
    onChanged();
  }

  async function removeRow(r: DraftRow) {
    if (r.id === null) {
      // Just drop the unsaved draft locally.
      setRows((rs) => rs.filter((x) => x.key !== r.key));
      return;
    }

    patch(r.key, { busy: true, error: null });
    const result = await deleteIdentifier(r.id);
    if ("error" in result) {
      patch(r.key, { busy: false, error: result.error });
      return;
    }
    setRows((rs) => rs.filter((x) => x.key !== r.key));
    onChanged();
  }

  return (
    <Modal open={open} onClose={onClose} title="Manage Identifiers">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Add, edit, or remove identifiers (LRN, passport, clinic case
          number, etc.) for this child. Each row saves independently.
        </p>

        <div className="space-y-2">
          {rows.length === 0 && (
            <p className="text-xs text-muted-foreground py-3">
              No identifiers yet. Click <span className="font-medium">Add</span> to start.
            </p>
          )}

          {rows.map((r) => {
            const dirty = isDirty(r);
            const isNew = r.id === null;
            return (
              <div
                key={r.key}
                className="p-2 bg-muted/30 rounded-lg space-y-2"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <Input
                      type="text"
                      value={r.identifierType}
                      onChange={(e) =>
                        patch(r.key, { identifierType: e.target.value })
                      }
                      placeholder="type (e.g. lrn)"
                      disabled={r.busy}
                    />
                    <Input
                      type="text"
                      value={r.identifierValue}
                      onChange={(e) =>
                        patch(r.key, { identifierValue: e.target.value })
                      }
                      placeholder="value"
                      disabled={r.busy}
                    />
                    <Input
                      type="text"
                      value={r.countryCode}
                      onChange={(e) =>
                        patch(r.key, {
                          countryCode: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder="PH"
                      maxLength={3}
                      disabled={r.busy}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => saveRow(r)}
                    disabled={r.busy || (!isNew && !dirty)}
                    title={isNew ? "Add identifier" : "Save changes"}
                  >
                    <Save className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeRow(r)}
                    disabled={r.busy}
                    title={isNew ? "Discard draft" : "Delete identifier"}
                  >
                    {isNew ? (
                      <X className="w-3.5 h-3.5" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
                {r.error && (
                  <p className="text-xs text-red-700 px-1">{r.error}</p>
                )}
              </div>
            );
          })}

          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addRow}
            >
              <Plus className="w-3.5 h-3.5" />
              Add identifier
            </Button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <ModalCancelButton label="Done" />
        </div>
      </div>
    </Modal>
  );
}
