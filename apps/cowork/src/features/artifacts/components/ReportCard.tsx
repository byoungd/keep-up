import { useState } from "react";

interface ReportCardProps {
  title?: string;
  content: string; // Markdown text
}

export function ReportCard({ title = "Report", content }: ReportCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-surface-1 border border-border rounded-xl shadow-sm my-4 overflow-hidden group hover:border-border transition-colors duration-fast">
      <div className="px-4 py-3 bg-muted border-b border-border flex justify-between items-center">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-accent-indigo"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <title>Report icon</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <span className="font-bold text-foreground text-sm tracking-tight">{title}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="p-1.5 rounded-lg border border-border bg-surface-1 text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all duration-fast"
          title="Copy report to clipboard"
          aria-label={copied ? "Report copied" : "Copy report to clipboard"}
        >
          {copied ? (
            <svg
              className="w-3.5 h-3.5 text-success"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <title>Copied</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <title>Copy</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
              />
            </svg>
          )}
        </button>
      </div>
      <div className="p-4">
        <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:border-border">
          {/* In production, use ReactMarkdown */}
          <div className="whitespace-pre-wrap text-foreground/80 text-chrome leading-relaxed">
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}
