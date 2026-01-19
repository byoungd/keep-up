/**
 * Accessibility Snapshot Mapper
 *
 * Assigns stable @id references to Playwright accessibility snapshots
 * so agents can refer to elements deterministically.
 */

export interface RawAccessibilityNode {
  role?: unknown;
  name?: unknown;
  value?: unknown;
  description?: unknown;
  focused?: unknown;
  checked?: unknown;
  expanded?: unknown;
  disabled?: unknown;
  pressed?: unknown;
  selected?: unknown;
  level?: unknown;
  children?: RawAccessibilityNode[];
}

export interface AccessibilityNodeSnapshot {
  ref: string;
  role?: string;
  name?: string;
  value?: string;
  description?: string;
  focused?: boolean;
  checked?: boolean | "mixed";
  expanded?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  selected?: boolean;
  level?: number;
  children?: AccessibilityNodeSnapshot[];
}

export interface AccessibilityNodeRef {
  ref: string;
  role?: string;
  name?: string;
  occurrence: number;
  path: number[];
}

export interface AccessibilitySnapshot {
  tree: AccessibilityNodeSnapshot | null;
  map: Record<string, AccessibilityNodeRef>;
}

export function buildAccessibilitySnapshot(
  root?: RawAccessibilityNode | null
): AccessibilitySnapshot {
  if (!root) {
    return { tree: null, map: {} };
  }

  const map: Record<string, AccessibilityNodeRef> = {};
  const occurrenceMap = new Map<string, number>();
  let counter = 1;

  const walk = (node: RawAccessibilityNode, path: number[]): AccessibilityNodeSnapshot => {
    const ref = `@${counter++}`;
    const role = readString(node.role);
    const name = readString(node.name);
    const key = `${role ?? "unknown"}::${name ?? ""}`;
    const occurrence = occurrenceMap.get(key) ?? 0;
    occurrenceMap.set(key, occurrence + 1);

    map[ref] = {
      ref,
      role,
      name,
      occurrence,
      path,
    };

    const children = Array.isArray(node.children)
      ? node.children.map((child, index) => walk(child, [...path, index]))
      : undefined;

    return {
      ref,
      role,
      name,
      value: readString(node.value),
      description: readString(node.description),
      focused: readBoolean(node.focused),
      checked: readChecked(node.checked),
      expanded: readBoolean(node.expanded),
      disabled: readBoolean(node.disabled),
      pressed: readBoolean(node.pressed),
      selected: readBoolean(node.selected),
      level: readNumber(node.level),
      children,
    };
  };

  return { tree: walk(root, []), map };
}

export function parseAccessibilitySnapshotText(snapshotText: string): RawAccessibilityNode | null {
  const lines = snapshotText
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return null;
  }

  const stack: Array<{ depth: number; node: RawAccessibilityNode }> = [];
  let root: RawAccessibilityNode | null = null;

  for (const line of lines) {
    const match = line.match(/^(\s*)- (.+)$/);
    if (!match) {
      continue;
    }
    const depth = Math.floor(match[1].length / 2);
    const node = parseSnapshotLine(match[2]);

    if (!root) {
      root = node;
    }

    while (stack.length > depth) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]?.node;
    if (parent) {
      parent.children ??= [];
      parent.children.push(node);
    }

    stack.push({ depth, node });
  }

  return root;
}

function parseSnapshotLine(content: string): RawAccessibilityNode {
  const withoutMeta = content.replace(/\[[^\]]*]/g, "").trim();
  const trimmed = withoutMeta.replace(/:$/, "").trim();
  let role = "";
  let name: string | undefined;

  const colonIndex = trimmed.indexOf(":");
  if (colonIndex > 0) {
    role = trimmed.slice(0, colonIndex).trim();
    name = trimmed.slice(colonIndex + 1).trim();
  } else {
    const quotedMatch = trimmed.match(/^([^\s]+)\s+"([^"]+)"/);
    if (quotedMatch) {
      role = quotedMatch[1] ?? "";
      name = quotedMatch[2];
    } else {
      const parts = trimmed.split(/\s+/);
      role = parts[0] ?? "";
      if (parts.length > 1) {
        name = parts.slice(1).join(" ");
      }
    }
  }

  if (name) {
    name = name.replace(/^"|"$/g, "");
  }

  return {
    role: role.length > 0 ? role : "unknown",
    name,
  };
}

function readString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return `${value}`;
  }
  return undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readChecked(value: unknown): boolean | "mixed" | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "mixed") {
    return "mixed";
  }
  return undefined;
}
