import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Singleton async confirm dialog. Drop-in replacement for window.confirm().
 *
 * Usage:
 *   import { confirm } from "@/components/ui/ConfirmDialog";
 *   if (await confirm("Delete this card?")) { ... }
 *
 *   // With options:
 *   await confirm("Remove inventory?", {
 *     title: "Remove item",
 *     confirmText: "Remove",
 *     cancelText: "Keep",
 *     variant: "destructive",
 *   });
 *
 * Render `<ConfirmDialogHost />` once near the top of the tree (AppWrapper).
 */

let pending = null; // { message, options, resolve }
const listeners = new Set();

function notify() {
  for (const l of listeners) l(pending);
}

export function confirm(message, options = {}) {
  return new Promise((resolve) => {
    // If another confirm is already open, resolve the previous one false.
    if (pending) pending.resolve(false);
    pending = { message, options, resolve };
    notify();
  });
}

function settle(result) {
  if (!pending) return;
  const { resolve } = pending;
  pending = null;
  notify();
  resolve(result);
}

export function ConfirmDialogHost() {
  const [state, setState] = useState(pending);

  useEffect(() => {
    const listener = (next) => setState(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e) => {
      if (e.key === "Escape") settle(false);
      if (e.key === "Enter") settle(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  const opts = state?.options || {};
  const title = opts.title || "Are you sure?";
  const confirmText = opts.confirmText || "Confirm";
  const cancelText = opts.cancelText || "Cancel";
  const isDestructive = opts.variant === "destructive";

  return (
    <AnimatePresence>
      {state && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <button
            type="button"
            aria-label="Dismiss"
            className="absolute inset-0 bg-black/50"
            onClick={() => settle(false)}
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.18 }}
            className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-slate-200 p-5"
          >
            <div className="flex items-start gap-3">
              {isDestructive && (
                <div className="flex-shrink-0 rounded-full bg-red-100 p-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 id="confirm-title" className="text-base font-semibold text-slate-900">
                  {title}
                </h2>
                <p className="mt-1 text-sm text-slate-600 whitespace-pre-line">
                  {state.message}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => settle(false)}>
                {cancelText}
              </Button>
              <Button
                onClick={() => settle(true)}
                className={
                  isDestructive
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : undefined
                }
                autoFocus
              >
                {confirmText}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
