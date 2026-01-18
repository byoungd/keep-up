import * as React from "react";
import { cn } from "../../lib/cn";

type InputCapsulePosition = "center" | "dock" | "inline";

export interface InputCapsuleProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "className"> {
  position?: InputCapsulePosition;
  containerClassName?: string;
  inputClassName?: string;
  ariaLabel?: string;
}

const positionClasses: Record<InputCapsulePosition, string> = {
  center: "mx-auto w-full max-w-2xl",
  dock: "absolute bottom-6 left-1/2 w-full max-w-3xl -translate-x-1/2",
  inline: "w-full",
};

export const InputCapsule = React.forwardRef<HTMLInputElement, InputCapsuleProps>(
  (
    {
      position = "center",
      containerClassName,
      inputClassName,
      ariaLabel = "Command input",
      type = "text",
      autoFocus = true,
      ...props
    },
    ref
  ) => {
    const internalRef = React.useRef<HTMLInputElement>(null);
    const combinedRef = (ref as React.RefObject<HTMLInputElement>) || internalRef;

    React.useEffect(() => {
      if (autoFocus && combinedRef.current) {
        combinedRef.current.focus();
      }
    }, [autoFocus, combinedRef]);

    return (
      <div
        className={cn(
          "relative flex items-center rounded-full border border-border/60 bg-surface-1 shadow-lg",
          "transition-shadow duration-150",
          "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
          positionClasses[position],
          containerClassName
        )}
      >
        <input
          ref={combinedRef}
          type={type}
          aria-label={ariaLabel}
          className={cn(
            "w-full bg-transparent px-6 py-4 text-content text-foreground",
            "placeholder:text-muted-foreground outline-none",
            inputClassName
          )}
          {...props}
        />
      </div>
    );
  }
);

InputCapsule.displayName = "InputCapsule";
