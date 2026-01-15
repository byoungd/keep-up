import * as React from "react";

export function useAutosizeTextArea(value: string, maxHeight = 160) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const textLength = value.length;
    element.style.height = "0px";
    const scrollHeight = textLength === 0 ? 0 : element.scrollHeight;
    const nextHeight = Math.min(scrollHeight, maxHeight);
    element.style.height = `${nextHeight}px`;
  }, [value, maxHeight]);

  return ref;
}
