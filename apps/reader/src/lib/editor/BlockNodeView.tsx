"use client";

import { type NodeViewComponentProps, useEditorEffect } from "@handlewithcare/react-prosemirror";
import { Check, Sparkles } from "lucide-react";
import type { EditorView } from "prosemirror-view";
import * as React from "react";

/** Indent amount in pixels per level */
const INDENT_PX = 24;

/** Get list marker for bullet/ordered/task lists */
function ListMarker({
  listType,
  taskChecked,
  orderedNumber,
  onToggleTask,
  onExecuteTask,
  isExecuting,
}: {
  listType: "bullet" | "ordered" | "task" | null;
  taskChecked: boolean;
  orderedNumber?: number;
  onToggleTask?: () => void;
  onExecuteTask?: () => void;
  isExecuting?: boolean;
}) {
  const baseClasses = "flex-shrink-0 select-none text-muted-foreground";

  if (!listType) {
    return null;
  }

  switch (listType) {
    case "bullet":
      return (
        <span className={`${baseClasses} mr-2 w-4 text-center`} aria-hidden="true">
          •
        </span>
      );
    case "ordered":
      return (
        <span
          className={`${baseClasses} mr-2 min-w-[1.5em] text-right tabular-nums`}
          aria-hidden="true"
        >
          {orderedNumber ?? 1}.
        </span>
      );
    case "task":
      return (
        <div className="flex items-center mr-2 relative mt-2">
          <button
            type="button"
            onClick={onToggleTask}
            className={`${baseClasses} w-4 h-4 rounded border flex items-center justify-center hover:border-primary transition-colors ${
              taskChecked
                ? "bg-primary border-primary text-primary-foreground"
                : "border-muted-foreground/40"
            }`}
            aria-label={taskChecked ? "Mark as incomplete" : "Mark as complete"}
          >
            {taskChecked && <Check className="w-3 h-3" />}
          </button>

          {/* Agent Execute Button - Only show if not checked */}
          {!taskChecked && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExecuteTask?.();
              }}
              disabled={isExecuting}
              className={`
                absolute right-full mr-1
                w-4 h-4 rounded flex items-center justify-center transition-all
                ${isExecuting ? "text-primary opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary"}
              `}
              aria-label="Execute with Agent"
              title="Execute with Agent"
            >
              <Sparkles className={`w-3 h-3 ${isExecuting ? "animate-pulse" : ""}`} />
            </button>
          )}
        </div>
      );
    default:
      return null;
  }
}

/**
 * Get ARIA attributes for list semantics.
 */
function getListAriaProps(
  listType: "bullet" | "ordered" | "task" | null,
  indentLevel: number,
  taskChecked: boolean
): Record<string, string | number | boolean | undefined> {
  if (!listType) {
    return {};
  }

  const ariaProps: Record<string, string | number | boolean | undefined> = {
    role: "listitem",
    "aria-level": indentLevel + 1,
  };

  if (listType === "task") {
    ariaProps["aria-checked"] = taskChecked;
  }

  return ariaProps;
}

export interface BlockNodeProps extends NodeViewComponentProps {
  children?: React.ReactNode;
}

export const BlockNodeView = React.forwardRef<HTMLDivElement, BlockNodeProps>(
  ({ nodeProps, children, ...props }, ref) => {
    const { node, getPos } = nodeProps;

    // We can't access 'view' directly from props anymore.
    // We'll use a ref to store it if needed, or use hooks provided by the library.
    const [view, setView] = React.useState<EditorView | null>(null);
    useEditorEffect((v: EditorView) => {
      setView(v);
    });

    const [isExecuting, setIsExecuting] = React.useState(false);

    // Extract list attributes from node
    const listType = node.attrs.list_type as "bullet" | "ordered" | "task" | null;
    const indentLevel = (node.attrs.indent_level as number) || 0;
    const taskChecked = node.attrs.task_checked === true;

    // Check if it's a heading
    const isHeading = node.type.name === "heading";
    const level = node.attrs.level || 1;

    // Calculate ordered list number
    const orderedNumber = React.useMemo(() => {
      if (listType !== "ordered" || !view || view.isDestroyed) {
        return 1;
      }
      const pos = getPos();
      if (pos === undefined) {
        return 1;
      }
      const doc = view.state.doc;
      let count = 1;
      doc.nodesBetween(0, pos, (n, nodePos) => {
        if (nodePos >= pos) {
          return false;
        }
        if (n.attrs.list_type === "ordered" && (n.attrs.indent_level || 0) === indentLevel) {
          count++;
        }
        return false;
      });
      return count;
    }, [listType, view, getPos, indentLevel]);

    // Handle task checkbox toggle
    const handleToggleTask = React.useCallback(() => {
      if (listType !== "task" || !view || view.isDestroyed) {
        return;
      }

      const pos = getPos();
      if (pos === undefined) {
        return;
      }

      const tr = view.state.tr.setNodeMarkup(pos, null, {
        ...node.attrs,
        task_checked: !taskChecked,
      });

      view.dispatch(tr);
    }, [listType, view, getPos, node.attrs, taskChecked]);

    // Handle Agent Execution
    const handleExecuteTask = React.useCallback(async () => {
      if (listType !== "task" || !view || view.isDestroyed || isExecuting) {
        return;
      }

      setIsExecuting(true);

      // Simulate Agent Thinking/Execution
      // In a real implementation, this would call `agent.execute(taskText)`
      console.info("🤖 Agent executing task:", node.textContent);

      // For now, we simulate a delay and then mark as done.
      try {
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const pos = getPos();
        if (pos !== undefined && !view.isDestroyed) {
          const tr = view.state.tr.setNodeMarkup(pos, null, {
            ...node.attrs,
            task_checked: true,
          });
          view.dispatch(tr);

          // Optional: Dispatch event for other listeners (e.g. notifications)
          const event = new CustomEvent("lfcc-agent-task-completed", {
            detail: { blockId: node.attrs.block_id },
          });
          window.dispatchEvent(event);
        }
      } finally {
        setIsExecuting(false);
      }
    }, [listType, view, getPos, node, isExecuting]);

    // Calculate indent style
    const indentStyle = indentLevel > 0 ? { marginLeft: indentLevel * INDENT_PX } : undefined;

    // Get ARIA props for accessibility
    const ariaProps = getListAriaProps(listType, indentLevel, taskChecked);

    // Stable content classes
    const baseContentClasses = "min-h-[1.5em] outline-none flex-1";
    const finalContentClasses =
      listType === "task" && taskChecked
        ? `${baseContentClasses} line-through text-muted-foreground`
        : baseContentClasses;

    // Determine the content wrapper component
    type WrapperProps = React.HTMLAttributes<HTMLElement> & { children: React.ReactNode };

    const ContentWrapper: React.FC<WrapperProps> = React.useMemo(() => {
      if (isHeading) {
        // Use semantic heading tags with createElement for type safety
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: wrapper factory branches per heading level
        return ({ children: c, className: cn, ...p }: WrapperProps) => {
          const headingTag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
          // Apply heading styles (Tailwind classes for typography)
          const headingClasses =
            level === 1
              ? "text-3xl font-bold mb-4"
              : level === 2
                ? "text-2xl font-bold mb-3"
                : level === 3
                  ? "text-xl font-bold mb-2"
                  : "font-bold mb-1";

          return React.createElement(
            headingTag,
            { className: `${cn ?? ""} ${headingClasses}`, ...p },
            c
          );
        };
      }
      // Default to div
      return ({ children: c, ...p }: WrapperProps) => <div {...p}>{c}</div>;
    }, [isHeading, level]);

    return (
      <div {...props} ref={ref} {...ariaProps}>
        <div
          className="relative group my-1"
          data-block-id={node.attrs.block_id}
          style={indentStyle}
        >
          <div className="flex items-start">
            <ListMarker
              listType={listType}
              taskChecked={taskChecked}
              orderedNumber={orderedNumber}
              onToggleTask={listType === "task" ? handleToggleTask : undefined}
              onExecuteTask={listType === "task" ? handleExecuteTask : undefined}
              isExecuting={isExecuting}
            />
            <ContentWrapper
              className={finalContentClasses}
              data-content-container
              style={{ whiteSpace: "pre-wrap" }}
            >
              {children}
            </ContentWrapper>
          </div>
        </div>
      </div>
    );
  }
);

BlockNodeView.displayName = "BlockNodeView";
