"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Tone = "success" | "error" | "info";
type Toast = { id: number; message: string; tone: Tone };
type Notify = (message: string, tone?: Tone) => void;
const ToastContext = createContext<Notify | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const notify = useCallback<Notify>((message, tone = "success") => {
    const id = ++counter.current;
    setToasts((current) => [...current, { id, message, tone }]);
    const timer = setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      timers.current.delete(timer);
    }, 9000);
    timers.current.add(timer);
  }, []);

  useEffect(() => {
    const activeTimers = timers.current;
    return () => activeTimers.forEach(clearTimeout);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-stack" aria-label="Notifications">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = toast.tone === "error" ? CircleAlert : toast.tone === "info" ? Info : CheckCircle2;
            return (
              <motion.div key={toast.id} layout initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }}
                className={`toast toast-${toast.tone}`}
                role={toast.tone === "error" ? "alert" : "status"}>
                <Icon size={20} className="shrink-0" aria-hidden="true" />
                <p>{toast.message}</p>
                <button className="icon-button shrink-0" aria-label="Dismiss notification"
                  title="Dismiss notification" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>
                  <X size={17} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Notify {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("ToastProvider is required.");
  return notify;
}