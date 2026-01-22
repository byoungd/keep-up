"use client";

import * as React from "react";

interface UseControllableStateOptions {
  value?: boolean;
  defaultValue?: boolean;
  onChange?: (value: boolean) => void;
}

type SetStateAction = boolean | ((prev: boolean) => boolean);

export function useControllableState({
  value,
  defaultValue = false,
  onChange,
}: UseControllableStateOptions) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const isControlled = value !== undefined;
  const resolvedValue = isControlled ? value : internalValue;

  const setValue = React.useCallback(
    (nextValue: SetStateAction) => {
      const computedValue = typeof nextValue === "function" ? nextValue(resolvedValue) : nextValue;
      if (computedValue === resolvedValue) {
        return;
      }
      if (!isControlled) {
        setInternalValue(computedValue);
      }
      onChange?.(computedValue);
    },
    [isControlled, onChange, resolvedValue]
  );

  return [resolvedValue, setValue] as const;
}
