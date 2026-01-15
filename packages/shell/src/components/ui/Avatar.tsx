import { cn } from "@ku0/shared/utils";
import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";

const avatarVariants = cva("relative flex shrink-0 overflow-hidden rounded-full", {
  variants: {
    size: {
      xs: "h-6 w-6 text-xs",
      sm: "h-8 w-8 text-sm",
      default: "h-10 w-10 text-base",
      lg: "h-12 w-12 text-lg",
      xl: "h-16 w-16 text-xl",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export interface AvatarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof avatarVariants> {
  src?: string;
  alt?: string;
  fallback?: string;
  status?: "online" | "offline" | "busy" | "away";
}

const statusColors = {
  online: "bg-success",
  offline: "bg-muted-foreground",
  busy: "bg-error",
  away: "bg-warning",
};

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, size, src, alt, fallback, status, ...props }, ref) => {
    const [imageError, setImageError] = React.useState(false);

    const initials = React.useMemo(() => {
      if (!fallback) {
        return "?";
      }
      return fallback
        .split(" ")
        .map((word) => word[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
    }, [fallback]);

    return (
      <div ref={ref} className={cn(avatarVariants({ size, className }))} {...props}>
        {src && !imageError ? (
          <img
            src={src}
            alt={alt || fallback || "Avatar"}
            className="aspect-square h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted font-medium text-muted-foreground">
            {initials}
          </div>
        )}
        {status && (
          <span
            className={cn(
              "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background",
              statusColors[status]
            )}
            aria-label={`Status: ${status}`}
          />
        )}
      </div>
    );
  }
);
Avatar.displayName = "Avatar";

export { Avatar, avatarVariants };
