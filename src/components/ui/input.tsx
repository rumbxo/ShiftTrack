import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "ui-input flex h-11 w-full rounded-lg border border-[var(--border,#dce1d8)] bg-white px-3 py-2 text-sm text-[var(--foreground,#29372c)] transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[#929a8f] focus-visible:border-[var(--primary,#315b47)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary,#315b47)]/15 disabled:cursor-not-allowed disabled:bg-[var(--muted,#f3f5ef)] disabled:opacity-60 aria-invalid:border-[var(--destructive,#b4423d)] aria-invalid:focus-visible:ring-[var(--destructive,#b4423d)]/15",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
