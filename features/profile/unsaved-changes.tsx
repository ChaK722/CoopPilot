"use client";

import { useEffect } from "react";

/**
 * Blocks refresh/close navigation while the form has unsaved changes and
 * renders a visible notice. Client-side route navigation is not intercepted
 * by the browser, so editors also expose explicit Cancel buttons.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);
}

export function UnsavedChangesNotice({ dirty }: { dirty: boolean }) {
  useUnsavedChangesGuard(dirty);
  if (!dirty) return null;
  return (
    <p role="status" className="text-xs font-medium text-amber-600">
      You have unsaved changes.
    </p>
  );
}
