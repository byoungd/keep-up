import { downscaleImage, formatBytes, readBlobAsDataUrl } from "@/lib/media/imageUtils";
import { useTranslations } from "next-intl";
import * as React from "react";

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  status: "processing" | "ready" | "sending" | "error";
  error?: string;
}

const MAX_ATTACHMENTS = 3;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;

function nowId(prefix: string) {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}`;
}

// Helper functions moved outside component to avoid recreation and dependency issues
// biome-ignore lint/suspicious/noExplicitAny: i18n type is dynamic
const validateFile = (file: File, currentAttachments: Attachment[], t: any): string | null => {
  const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
  if (!allowedTypes.has(file.type)) {
    return t("attachmentTypeError");
  }
  if (file.size > MAX_FILE_BYTES) {
    return t("attachmentSizeError", { max: formatBytes(MAX_FILE_BYTES) });
  }

  const totalBytes = currentAttachments.reduce((sum, att) => sum + att.size, 0);
  if (totalBytes + file.size > MAX_TOTAL_BYTES) {
    return t("attachmentTotalError", { max: formatBytes(MAX_TOTAL_BYTES) });
  }

  return null;
};

const processFile = async (file: File): Promise<{ url: string; size: number }> => {
  const blob = await downscaleImage(file);
  const url = await readBlobAsDataUrl(blob);
  return { url, size: blob.size };
};

export function useAttachments() {
  const t = useTranslations("AIPanel");
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [attachmentError, setAttachmentError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const updateAttachment = React.useCallback((id: string, delta: Partial<Attachment>) => {
    setAttachments((prev) => prev.map((att) => (att.id === id ? { ...att, ...delta } : att)));
  }, []);

  const handleAttachmentFiles = React.useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) {
        return;
      }
      setAttachmentError(null);

      const files = Array.from(fileList);
      const availableSlots = Math.max(0, MAX_ATTACHMENTS - attachments.length);

      if (availableSlots <= 0) {
        setAttachmentError(t("attachmentLimitError", { count: MAX_ATTACHMENTS }));
        return;
      }

      const accepted = files.slice(0, availableSlots);

      for (const file of accepted) {
        const error = validateFile(file, attachments, t);
        if (error) {
          setAttachmentError(error);
          continue;
        }

        const id = nowId("att");
        const objectUrl = URL.createObjectURL(file);

        // Optimistic update
        setAttachments((prev) => [
          ...prev,
          {
            id,
            name: file.name,
            url: objectUrl,
            type: file.type,
            size: file.size,
            status: "processing",
          },
        ]);

        // Process in background
        processFile(file)
          .then(({ url, size }) => {
            updateAttachment(id, { url, size, status: "ready" });
          })
          .catch(() => {
            updateAttachment(id, { status: "error", error: t("attachmentProcessingError") });
            setAttachmentError(t("attachmentProcessingError"));
          })
          .finally(() => {
            URL.revokeObjectURL(objectUrl);
          });
      }
    },
    [attachments, t, updateAttachment]
  );

  const handleRemoveAttachment = React.useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((att) => att.id === id);
      if (target?.url.startsWith("blob:")) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((att) => att.id !== id);
    });
  }, []);

  const handleAddAttachmentClick = React.useCallback(() => {
    setAttachmentError(null);
    fileInputRef.current?.click();
  }, []);

  const clearAttachments = React.useCallback(() => {
    setAttachments([]);
    setAttachmentError(null);
  }, []);

  return {
    attachments,
    setAttachments,
    attachmentError,
    setAttachmentError,
    fileInputRef,
    handleAttachmentFiles,
    handleRemoveAttachment,
    handleAddAttachmentClick,
    clearAttachments,
    updateAttachment,
  };
}
