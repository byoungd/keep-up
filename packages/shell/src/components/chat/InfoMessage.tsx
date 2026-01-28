import { motion } from "framer-motion";
import { Info, Loader2 } from "lucide-react";

interface InfoMessageProps {
  content: string;
}

export function InfoMessage({ content }: InfoMessageProps) {
  // Simple heuristic: if it ends with "...", it's likely a loading state or ongoing action
  const isLoading = content.endsWith("...");

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      layout
      className="flex items-center gap-2 py-1.5 px-3 text-xs font-medium text-muted-foreground/80 bg-surface-2/40 backdrop-blur-sm rounded-full w-fit max-w-full truncate border border-border/5 shadow-sm"
    >
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 shrink-0 text-primary/70" aria-hidden="true" />
      ) : (
        <Info className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden="true" />
      )}
      <span className="truncate">{content}</span>
    </motion.div>
  );
}
