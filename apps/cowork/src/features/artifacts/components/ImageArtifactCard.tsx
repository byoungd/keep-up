import { useState } from "react";
import { apiUrl } from "../../../lib/config";
import type { ArtifactPayload } from "../../tasks/types";

type ImageArtifactPayload = Extract<ArtifactPayload, { type: "ImageArtifact" }>;

interface ImageArtifactCardProps {
  artifactId: string;
  payload: ImageArtifactPayload;
  title?: string;
}

export function ImageArtifactCard({ artifactId, payload, title }: ImageArtifactCardProps) {
  const [hasError, setHasError] = useState(false);
  const imageUrl = apiUrl(`/api/artifacts/${artifactId}/content`);
  const displayTitle = title ?? "Image Artifact";

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm p-5 space-y-4">
      <div>
        <div className="text-micro text-muted-foreground/60 font-black uppercase tracking-[0.2em]">
          Image
        </div>
        <h3 className="text-sm font-semibold text-foreground mt-1">{displayTitle}</h3>
      </div>

      {!hasError ? (
        <img
          src={imageUrl}
          alt={displayTitle}
          className="w-full rounded-lg border border-border/50 bg-surface-1 object-contain max-h-64"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="rounded-lg border border-border/50 bg-surface-1 p-4 text-xs text-muted-foreground">
          Image preview unavailable. Verify the artifact file is accessible.
        </div>
      )}

      <div className="grid gap-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>Mime</span>
          <span className="text-foreground">{payload.mimeType}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Size</span>
          <span className="text-foreground">{formatBytes(payload.byteSize)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Hash</span>
          <span className="text-foreground truncate max-w-[200px]">{payload.contentHash}</span>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) {
    return "Unknown";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}
