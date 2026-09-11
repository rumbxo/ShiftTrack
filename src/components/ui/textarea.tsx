import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "ui-textarea flex min-h-24 w-full resize-y rounded-lg border border-[var(--border,#dce1d8)] bg-white px-3 py-2 text-sm leading-relaxed text-[var(--foreground,#29372c)] transition-colors placeholder:text-[#929a8f] focus-visible:border-[var(--primary,#315b47)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary,#315b47)]/15 disabled:cursor-not-allowed disabled:bg-[var(--muted,#f3f5ef)] disabled:opacity-60 aria-invalid:border-[var(--destructive,#b4423d)] aria-invalid:focus-visible:ring-[var(--destructive,#b4423d)]/15",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
