interface ReportCardProps {
  title?: string;
  content: string; // Markdown text
}

export function ReportCard({ title = "Report", content }: ReportCardProps) {
  return (
    <div className="bg-surface border border-border rounded-lg shadow-sm p-4 my-2">
      <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
        <svg
          className="w-4 h-4 text-accent-indigo"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <title>Report icon</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        {title}
      </h3>
      <div className="prose prose-sm max-w-none">
        {/* In production, use ReactMarkdown */}
        <div className="whitespace-pre-wrap text-muted-foreground text-sm">{content}</div>
      </div>
    </div>
  );
}
