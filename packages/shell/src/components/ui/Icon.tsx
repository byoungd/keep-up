import { cn } from "@ku0/shared/utils";
import * as React from "react";

export type IconSize = "sm" | "md" | "lg";

interface IconProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: IconSize; // sm=16, md=18, lg=20
  children?: React.ReactNode;
}

/**
 * Standardized Icon wrapper for consistent sizing and alignment.
 *
 * @example
 * <Icon size="sm" className="text-muted-foreground">
 *   <SomeSvg />
 * </Icon>
 */
export function Icon({ size = "md", className, children, ...props }: IconProps) {
  const sizeClasses = {
    sm: "w-4 h-4", // 16px
    md: "w-[18px] h-[18px]", // 18px
    lg: "w-5 h-5", // 20px
  };

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center shrink-0 align-text-bottom text-current leading-none",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          // We safely assume the child is an SVG or icon component accepting these props
          return React.cloneElement(child as React.ReactElement<React.SVGProps<SVGSVGElement>>, {
            width: "100%",
            height: "100%",
            fill: "none", // Lucide icons usually default to none fill
            stroke: "currentColor",
            strokeWidth: "2", // Ensure consistent stroke width if needed, or leave to child
          });
        }
        return child;
      })}
    </div>
  );
}
