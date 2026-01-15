"use client";

import { cn } from "@ku0/shared/utils";
import * as React from "react";

export interface ButtonGroupProps extends React.FieldsetHTMLAttributes<HTMLFieldSetElement> {
  /** Orientation of the button group */
  orientation?: "horizontal" | "vertical";
}

/**
 * ButtonGroup - Visually groups buttons together with merged borders.
 * Children should be Button components.
 */
export const ButtonGroup = React.forwardRef<HTMLFieldSetElement, ButtonGroupProps>(
  ({ className, orientation = "horizontal", children, ...props }, ref) => {
    return (
      <fieldset
        ref={ref}
        className={cn(
          "inline-flex border-0 p-0 m-0",
          orientation === "horizontal"
            ? [
                "flex-row",
                // Merge horizontal borders: remove left radius from non-first, right radius from non-last
                "[&>button:not(:first-child)]:rounded-l-none",
                "[&>button:not(:last-child)]:rounded-r-none",
                // Overlap borders to avoid double-width
                "[&>button:not(:first-child)]:-ml-px",
              ]
            : [
                "flex-col",
                // Merge vertical borders: remove top radius from non-first, bottom radius from non-last
                "[&>button:not(:first-child)]:rounded-t-none",
                "[&>button:not(:last-child)]:rounded-b-none",
                // Overlap borders
                "[&>button:not(:first-child)]:-mt-px",
              ],
          className
        )}
        {...props}
      >
        {children}
      </fieldset>
    );
  }
);
ButtonGroup.displayName = "ButtonGroup";
