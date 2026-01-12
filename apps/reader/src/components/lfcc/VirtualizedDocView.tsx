import { type LoroRuntime, createDocumentFacade } from "@keepup/lfcc-bridge";
import * as React from "react";

type VirtualizedDocViewProps = {
  runtime: LoroRuntime;
  height?: number;
};

type VirtualRow = {
  id: string;
  text: string;
};

const DEFAULT_ROW_HEIGHT = 80;
const OVERSCAN_PX = DEFAULT_ROW_HEIGHT * 3;

type HeightMap = Record<string, number>;

export function VirtualizedDocView({ runtime, height = 480 }: VirtualizedDocViewProps) {
  const parentRef = React.useRef<HTMLDivElement | null>(null);
  const [rows, setRows] = React.useState<VirtualRow[]>([]);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [heights, setHeights] = React.useState<HeightMap>({});

  // Create facade once for the runtime
  const facade = React.useMemo(() => createDocumentFacade(runtime), [runtime]);

  const computeRows = React.useCallback(() => {
    const blocks = facade.getBlocks();
    return blocks.map((block) => ({
      id: block.id,
      text: flattenBlockText(block),
    }));
  }, [facade]);

  React.useEffect(() => {
    const updateRows = () => setRows(computeRows());
    const unsub = facade.subscribe(updateRows);
    updateRows();
    return () => unsub();
  }, [computeRows, facade]);

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    if (rows.length > 0 && rows.every((row) => !row.text.trim())) {
      // Developer-facing warning to catch regressions where IDs are misread as blocks.
      // This is intentionally noisy in dev to prevent "empty rows" from silently shipping.
      console.warn("[VirtualizedDocView] All rows have empty text while root blocks exist.");
    }
  }, [rows]);

  const getHeight = React.useCallback((id: string) => heights[id] ?? DEFAULT_ROW_HEIGHT, [heights]);

  const view = React.useMemo(() => {
    const list = [];
    let offset = 0;
    const lower = Math.max(0, scrollTop - OVERSCAN_PX);
    const upper = scrollTop + height + OVERSCAN_PX;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const size = getHeight(row.id);
      const start = offset;
      const end = start + size;
      if (end >= lower && start <= upper) {
        list.push({ index: i, row, start, size });
      }
      offset = end;
    }

    return { items: list, totalHeight: offset };
  }, [getHeight, height, rows, scrollTop]);

  const handleMeasure = React.useCallback((id: string, heightValue: number) => {
    setHeights((prev) => {
      const next = Math.max(1, Math.round(heightValue));
      if (prev[id] === next) {
        return prev;
      }
      return { ...prev, [id]: next };
    });
  }, []);

  return (
    <div
      ref={parentRef}
      data-testid="virtualized-view"
      className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      style={{ height, overflow: "auto" }}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
    >
      <div
        style={{
          height: view.totalHeight,
          width: "100%",
          position: "relative",
        }}
      >
        {view.items.map(({ index, row, start, size }) => (
          <MeasuredRow
            key={row.id}
            index={index}
            start={start}
            size={size}
            text={row.text}
            onMeasure={handleMeasure}
            rowId={row.id}
          />
        ))}
      </div>
    </div>
  );
}

function flattenBlockText(block: {
  text?: string;
  richText?: Array<{ text?: string }>;
  children?: Array<{ text?: string }>;
}): string {
  if (Array.isArray(block.richText) && block.richText.length > 0) {
    return block.richText.map((span) => span.text ?? "").join("");
  }
  if (typeof block.text === "string") {
    return block.text;
  }
  if (Array.isArray(block.children)) {
    return block.children
      .map((child) => child.text ?? "")
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

type MeasuredRowProps = {
  index: number;
  start: number;
  size: number;
  text: string;
  rowId: string;
  onMeasure: (id: string, height: number) => void;
};

function MeasuredRow({ index, start, size, text, rowId, onMeasure }: MeasuredRowProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        onMeasure(rowId, entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onMeasure, rowId]);

  return (
    <div
      ref={ref}
      data-index={index}
      className="virtualized-row"
      style={{
        position: "absolute",
        top: start,
        left: 0,
        width: "100%",
        height: size,
        padding: "12px 16px",
        boxSizing: "border-box",
      }}
    >
      <div className="text-sm text-zinc-900 dark:text-zinc-100 leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}
