import { cn } from "@ku0/shared/utils";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-chrome font-medium ring-offset-background transition-[background-color,box-shadow,color] duration-fast ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/80 active:shadow-none",
        secondary:
          "bg-surface-2 text-foreground shadow-sm hover:bg-surface-3 active:bg-surface-3/80 active:shadow-none",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:bg-destructive/80 active:shadow-none",
        danger:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:bg-destructive/80 active:shadow-none",
        outline:
          "border border-border/70 bg-transparent text-foreground hover:bg-surface-2 hover:text-foreground",
        ghost: "text-muted-foreground hover:bg-surface-2/70 hover:text-foreground",
        subtle: "bg-transparent text-muted-foreground hover:bg-surface-2/50 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        magic:
          "bg-linear-to-r from-accent-ai to-accent-indigo text-white shadow-sm hover:shadow-md active:shadow-none",
      },
      size: {
        default: "h-9 px-4 py-2", // 36px
        sm: "h-8 rounded-md px-3", // 32px
        compact: "h-7 rounded-md px-2", // 28px
        lg: "h-11 rounded-md px-8 text-content", // 44px
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type = "button", ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        type={asChild ? undefined : type}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
