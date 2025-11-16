"use client";

import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "@/renderer/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em]",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        accent: "bg-accent text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Badge = React.forwardRef(({ className, variant, ...props }, ref) => {
  return (
    <span ref={ref} className={cn(badgeVariants({ variant, className }))} {...props} />
  );
});
Badge.displayName = "Badge";

export { Badge, badgeVariants };
