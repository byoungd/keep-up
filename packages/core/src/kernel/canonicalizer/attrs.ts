/**
 * LFCC v0.9 RC - Canonical Attribute Enforcement
 * @see docs/product/Audit/enhance/TaskPrompt_LFCC_v0.9_RC_Protocol_Alignment.md P0.3
 *
 * P0.3: Only link marks may carry href attributes.
 * Enforce URL policy (http/https/mailto only).
 */

/**
 * Validate URL according to LFCC policy
 * P0.3: Only http://, https://, or mailto: URLs are allowed
 *
 * @param url - URL to validate
 * @returns true if URL is valid, false otherwise
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  const lowerUrl = url.toLowerCase().trim();

  // Allow http://, https://, or mailto: protocols
  return (
    lowerUrl.startsWith("http://") ||
    lowerUrl.startsWith("https://") ||
    lowerUrl.startsWith("mailto:")
  );
}

/**
 * Validate and sanitize href attribute
 * P0.3: Validates URL and returns sanitized href or null if invalid
 *
 * @param href - href attribute value
 * @returns Sanitized href if valid, null if invalid
 */
export function validateAndSanitizeHref(href: string | undefined): string | null {
  if (!href || typeof href !== "string") {
    return null;
  }

  const trimmed = href.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (isValidUrl(trimmed)) {
    return trimmed;
  }

  // Invalid URL - return null to drop the attribute
  return null;
}

/**
 * Process mark attributes according to LFCC policy
 * P0.3: Only link marks may have href attributes
 *
 * @param mark - The mark type
 * @param nodeAttrs - Attributes from the input node
 * @returns Processed attributes (href only for link mark, empty for others)
 */
export function processMarkAttributes(
  mark: string,
  nodeAttrs: Record<string, string>
): { href?: string } {
  // Only link marks may have href attribute
  if (mark !== "link") {
    // P0.3: Strip all attributes from non-link marks
    return {};
  }

  // For link marks, validate and sanitize href
  const href = validateAndSanitizeHref(nodeAttrs.href);
  if (href === null) {
    // Invalid href - drop the attribute (mark becomes plain text)
    return {};
  }

  return { href };
}
