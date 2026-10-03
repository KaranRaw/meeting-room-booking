"use client";

import { MotionConfig } from "framer-motion";

import { ToastProvider } from "@/components/toasts";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.18 }}>
      <ToastProvider>{children}</ToastProvider>
    </MotionConfig>
  );
}