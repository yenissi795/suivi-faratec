import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit etre utilise dans un ToastProvider");
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "success", duration = 3000) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message, duration }]);
    setTimeout(() => removeToast(id), duration);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const config = {
    success: {
      icon: CheckCircle2,
      bg: "bg-emerald-50",
      border: "border-emerald-300",
      text: "text-emerald-900",
      iconColor: "text-emerald-600",
    },
    error: {
      icon: AlertCircle,
      bg: "bg-red-50",
      border: "border-red-300",
      text: "text-red-900",
      iconColor: "text-red-600",
    },
    info: {
      icon: Info,
      bg: "bg-blue-50",
      border: "border-blue-300",
      text: "text-blue-900",
      iconColor: "text-blue-600",
    },
  }[toast.type];

  const Icon = config.icon;

  return (
    <div
      className={`pointer-events-auto min-w-[280px] max-w-[420px] ${config.bg} ${config.border} border rounded-xl shadow-lg p-3 flex items-start gap-3`}
    >
      <Icon size={18} className={`${config.iconColor} shrink-0 mt-0.5`} />
      <p className={`flex-1 text-sm font-medium ${config.text} leading-snug`}>
        {toast.message}
      </p>
      <button
        onClick={onClose}
        className={`${config.text} opacity-50 hover:opacity-100 transition shrink-0`}
      >
        <X size={14} />
      </button>
    </div>
  );
}