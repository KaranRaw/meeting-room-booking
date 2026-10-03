"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

type Props = {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  locked?: boolean;
};

export function Dialog({ title, children, onClose, locked = false }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !locked) onClose();
      if (event.key !== "Tab") return;
      const controls = panel.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
      );
      if (!controls?.length) {
        event.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, locked]);

  return (
    <motion.div className="dialog-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      exit={{ opacity: 0 }} onClick={(event) => {
        if (event.target === event.currentTarget && !locked) onClose();
      }}>
      <motion.div className="dialog" ref={panel} tabIndex={-1} role="dialog"
        aria-modal="true" aria-labelledby={titleId}
        initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}>
        <div className="flex items-center justify-between gap-4 mb-6">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" type="button" title="Close dialog" aria-label="Close dialog"
            disabled={locked} onClick={onClose}><X size={20} /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}