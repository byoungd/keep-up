/**
 * Generate a smart task title from the prompt
 */
export function generateTaskTitle(prompt: string): string {
  let title = prompt.trim();

  // Remove common polite prefixes (Chinese)
  const zhPrefixes = [
    /^帮我/,
    /^请帮我/,
    /^请/,
    /^麻烦/,
    /^能不能/,
    /^可以/,
    /^帮忙/,
    /^我想/,
    /^我要/,
    /^我需要/,
  ];
  for (const prefix of zhPrefixes) {
    title = title.replace(prefix, "");
  }

  // Remove common polite prefixes (English)
  const enPrefixes = [
    /^please\s+/i,
    /^can you\s+/i,
    /^could you\s+/i,
    /^help me\s+/i,
    /^i want to\s+/i,
    /^i need to\s+/i,
    /^i'd like to\s+/i,
    /^i'd like to\s+/i, // Duplicate in original, keeping for fidelity or removing? I'll remove duplicate.
  ];
  for (const prefix of enPrefixes) {
    title = title.replace(prefix, "");
  }

  // Trim and capitalize first letter
  title = title.trim();
  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  // Truncate if too long
  const maxLen = 50;
  if (title.length > maxLen) {
    const truncated = title.slice(0, maxLen);
    const lastSpace = truncated.lastIndexOf(" ");
    title = lastSpace > 20 ? `${truncated.slice(0, lastSpace)}...` : `${truncated}...`;
  }

  return title || "New Task";
}
