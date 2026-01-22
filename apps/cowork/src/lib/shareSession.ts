export type ShareOutcome = "shared" | "copied" | "cancelled";

export async function shareSessionLink(sessionId: string, title?: string): Promise<ShareOutcome> {
  if (typeof window === "undefined") {
    return "cancelled";
  }

  const url = new URL(`/sessions/${sessionId}`, window.location.origin).toString();
  const safeTitle = title?.trim() || "Cowork Session";
  const shareData = {
    title: safeTitle,
    text: `Session: ${safeTitle}`,
    url,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  const copied = await copyToClipboard(url);
  if (copied) {
    return "copied";
  }

  window.prompt("Copy this session link", url);
  return "copied";
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    textarea.setAttribute("readonly", "true");
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}
