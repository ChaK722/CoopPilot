"use client";

import * as React from "react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-4), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4"
      >
        {toasts.map((item) => (
          <ToastCard key={item.id} toast={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const icons = {
    success: (
      <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
    ),
    error: <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />,
    info: <Info className="h-4 w-4 text-primary" aria-hidden="true" />,
  };

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex items-start gap-2 rounded-md border border-border bg-card p-3 shadow-lg",
      )}
    >
      <span className="mt-0.5 shrink-0">{icons[toast.tone]}</span>
      <p className="flex-1 text-sm">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return context;
}
