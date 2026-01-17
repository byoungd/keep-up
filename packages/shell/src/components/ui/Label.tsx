"use client";

import { cn } from "@ku0/shared/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

export interface LabelProps
  extends Omit<React.LabelHTMLAttributes<HTMLLabelElement>, "htmlFor">,
    VariantProps<typeof labelVariants> {
  htmlFor: string;
}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, children, htmlFor, ...props }, ref) => (
    <label ref={ref} className={cn(labelVariants(), className)} htmlFor={htmlFor} {...props}>
      {children}
    </label>
  )
);
Label.displayName = "Label";

export { Label };
