import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "ui-button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary,#315b47)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "button-primary bg-[var(--primary,#315b47)] text-white hover:bg-[var(--primary-hover,#264936)]",
        outline:
          "button-outline border border-[var(--border,#dfe3dc)] bg-white text-[var(--foreground,#303d32)] hover:bg-[var(--muted,#f3f5ef)]",
        ghost:
          "button-ghost text-[#536052] hover:bg-[var(--muted,#edf1e9)] hover:text-[#273e2e]",
        destructive:
          "button-destructive bg-[var(--destructive,#b4423d)] text-white hover:bg-[#96342f]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 gap-1.5 rounded-md px-3 text-xs",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        type={asChild ? type : (type ?? "button")}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
