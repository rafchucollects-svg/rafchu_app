import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

/**
 * Singleton toast system.
 *
 * Usage from anywhere in the app (no hook required):
 *   import { toast } from "@/components/ui/Toaster";
 *   toast.success("Card added");
 *   toast.error("Something went wrong");
 *   toast.info("Price refreshed");
 *
 * Render `<Toaster />` once near the top of the tree (AppWrapper).
 */

let idCounter = 0;
const listeners = new Set();
let queue = [];

function notify() {
  for (const l of listeners) l(queue);
}

function push(message, { type = "info", durationMs = 3200 } = {}) {
  const id = ++idCounter;
  const t = { id, message, type };
  queue = [...queue, t];
  notify();
  if (durationMs > 0) {
    setTimeout(() => dismiss(id), durationMs);
  }
  return id;
}

function dismiss(id) {
  queue = queue.filter((t) => t.id !== id);
  notify();
}

export const toast = {
  success: (msg, opts) => push(msg, { ...opts, type: "success" }),
  error: (msg, opts) => push(msg, { ...opts, type: "error", durationMs: opts?.durationMs ?? 5000 }),
  info: (msg, opts) => push(msg, { ...opts, type: "info" }),
  dismiss,
};

const TYPE_STYLES = {
  success: {
    bg: "bg-emerald-50 border-emerald-200 text-emerald-900",
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />,
  },
  error: {
    bg: "bg-red-50 border-red-200 text-red-900",
    icon: <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />,
  },
  info: {
    bg: "bg-slate-50 border-slate-200 text-slate-900",
    icon: <Info className="h-5 w-5 text-slate-600 flex-shrink-0" />,
  },
};

export function Toaster() {
  const [toasts, setToasts] = useState(queue);

  useEffect(() => {
    const listener = (next) => setToasts(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] sm:w-auto"
      aria-live="polite"
      role="status"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const style = TYPE_STYLES[t.type] || TYPE_STYLES.info;
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border shadow-lg px-4 py-3 ${style.bg}`}
            >
              {style.icon}
              <div className="flex-1 text-sm leading-snug">{t.message}</div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="flex-shrink-0 rounded-md p-0.5 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-black/20"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4 opacity-60" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
