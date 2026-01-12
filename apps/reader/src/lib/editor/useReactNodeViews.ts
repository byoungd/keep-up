"use client";

import * as React from "react";
import { BlockNodeView } from "./BlockNodeView";

export function useReactNodeViews() {
  const nodeViews = React.useMemo(() => {
    return {
      paragraph: BlockNodeView,
      heading: BlockNodeView,
      blockquote: BlockNodeView,
      list: BlockNodeView,
      list_item: BlockNodeView,
      image: BlockNodeView,
      video: BlockNodeView,
      embed: BlockNodeView,
    };
  }, []);

  return nodeViews;
}
