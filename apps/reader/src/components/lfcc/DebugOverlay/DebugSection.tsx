"use client";

import * as React from "react";

interface DebugSectionProps {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function DebugSection({ title, badge, defaultOpen = false, children }: DebugSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className="lfcc-debug-section">
      <button
        type="button"
        className="lfcc-debug-section-header"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="lfcc-debug-section-chevron">{isOpen ? "v" : ">"}</span>
        <span className="lfcc-debug-section-title">{title}</span>
        {badge && <span className="lfcc-debug-section-badge">{badge}</span>}
      </button>
      {isOpen && <div className="lfcc-debug-section-content">{children}</div>}
    </div>
  );
}
