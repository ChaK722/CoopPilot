"use client";

import { useEffect, useId, useRef } from "react";

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const FOCUSABLE_SELECTOR = [
  "[data-autofocus]",
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Shared accessible dialog: focus moves to the first focusable control
 * (or [data-autofocus]), Tab/Shift+Tab are trapped inside, Escape closes,
 * the overlay click closes, and focus returns to the invoking control.
 */
export function Dialog({ open, title, description, onClose, children, footer }: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const current = dialogRef.current;
      if (!current) return;
      const focusable = Array.from(current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function handleFocus(event: FocusEvent) {
      if (!dialogRef.current?.contains(event.target as Node)) {
        dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocus);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocus);
      returnFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className="relative w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
        {children}
        {footer ? <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
