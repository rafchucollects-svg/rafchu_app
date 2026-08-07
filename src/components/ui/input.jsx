import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef(({ className, type = "text", ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm shadow-inner ring-offset-background transition placeholder:text-muted-foreground focus-visible:border-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
      /* Safari-specific fixes */
      "-webkit-appearance: none",
      "appearance: none",
      className,
    )}
    style={{
      /* Prevent Safari zoom on focus */
      fontSize: "16px",
    }}
    {...props}
  />
));

Input.displayName = "Input";
