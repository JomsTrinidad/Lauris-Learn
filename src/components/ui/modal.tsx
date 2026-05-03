"use client";
import { useEffect, useRef, useState, createContext, useContext, type ReactNode } from "react";
import { X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const ModalCloseCtx = createContext<() => void>(() => {});
export function useModalClose() { return useContext(ModalCloseCtx); }

export function ModalCancelButton({ label = "Cancel" }: { label?: string }) {
  const tryClose = useModalClose();
  // type="button" is REQUIRED — without it, browsers default <button> to
  // type="submit" inside a <form>, which silently submits the form when the
  // user clicks Cancel. That bypassed the dirty-changes confirm prompt
  // because the form's onSubmit path closes the modal on success.
  return <Button type="button" variant="outline" onClick={tryClose}>{label}</Button>;
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const backdropMouseDown = useRef(false);
  const onCloseRef = useRef(onClose);
  const isDirtyRef = useRef(isDirty);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  // Reset state whenever the modal opens or closes
  useEffect(() => {
    setIsDirty(false);
    setShowConfirm(false);
  }, [open]);

  // Detect any form field change inside the modal content. Nested modals also
  // render inside this contentRef, so their events bubble up — ignore any
  // event whose nearest [data-modal-overlay] is a different (nested) modal.
  useEffect(() => {
    if (!open) return;
    const el = contentRef.current;
    if (!el) return;
    const mark = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const closestOverlay = target.closest("[data-modal-overlay]");
      if (closestOverlay !== overlayRef.current) return;
      setIsDirty(true);
    };
    el.addEventListener("input", mark);
    el.addEventListener("change", mark);
    return () => {
      el.removeEventListener("input", mark);
      el.removeEventListener("change", mark);
    };
  }, [open]);

  function tryClose() {
    if (isDirtyRef.current) {
      setShowConfirm(true);
      return;
    }
    doClose();
  }

  function doClose() {
    setIsDirty(false);
    setShowConfirm(false);
    onCloseRef.current();
  }

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showConfirm) { setShowConfirm(false); return; }
        tryClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showConfirm]);

  if (!open) return null;

  return (
    <ModalCloseCtx.Provider value={tryClose}>
      <div
        ref={overlayRef}
        data-modal-overlay
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onMouseDown={(e) => { backdropMouseDown.current = e.target === e.currentTarget; }}
        onClick={(e) => { if (e.target === e.currentTarget && backdropMouseDown.current) tryClose(); }}
      >
        <div
          className={cn(
            "bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button
              type="button"
              onClick={tryClose}
              className="p-1 hover:bg-accent rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Inline discard-changes confirmation strip */}
          {showConfirm && (
            <div className="flex items-center justify-between gap-3 px-6 py-3 bg-amber-50 border-b border-amber-200">
              <div className="flex items-center gap-2 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                You have unsaved changes.
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="text-xs font-medium text-amber-800 hover:text-amber-900 px-2 py-1 rounded hover:bg-amber-100 transition-colors"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={doClose}
                  className="text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 px-3 py-1 rounded transition-colors"
                >
                  Discard changes
                </button>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="p-6" ref={contentRef}>{children}</div>
        </div>
      </div>
    </ModalCloseCtx.Provider>
  );
}
