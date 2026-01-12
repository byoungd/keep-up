import type { EditorSchemaValidator } from "@keepup/core";
import { DOMParser as PMDOMParser, type Schema } from "prosemirror-model";

import { markdownToHtml } from "@/lib/editor/markdownToHtml";

function resolveHtmlPayload(input: { html?: string; markdown?: string }): string | null {
  if (input.html !== undefined) {
    return input.html;
  }

  if (input.markdown !== undefined) {
    return markdownToHtml(input.markdown);
  }

  return null;
}

export function createEditorSchemaValidator(schema: Schema): EditorSchemaValidator {
  return {
    dryRunApply(input) {
      const html = resolveHtmlPayload(input);
      if (html === null) {
        return { ok: false, error: "No content provided for schema validation" };
      }

      if (typeof document === "undefined") {
        return { ok: false, error: "DOM unavailable for schema validation" };
      }

      try {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = html;

        const parser = PMDOMParser.fromSchema(schema);
        const doc = parser.parse(wrapper);

        if (!doc.type.validContent(doc.content)) {
          return { ok: false, error: "Parsed content does not conform to schema" };
        }

        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Schema parsing failed";
        return { ok: false, error: message };
      }
    },
  };
}
