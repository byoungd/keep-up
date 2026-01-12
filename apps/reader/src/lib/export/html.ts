/**
 * HTML Serializer
 *
 * Converts ProseMirror document to self-contained, styled HTML.
 */

import type { Mark, Node as PMNode } from "prosemirror-model";
import type { ExportOptions, ExportResult, Serializer } from "./types";

const DEFAULT_STYLES = `
<style>
  :root {
    --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --font-mono: "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    --color-text: #1a1a1a;
    --color-text-muted: #666;
    --color-bg: #fff;
    --color-border: #e5e5e5;
    --color-accent: #6366f1;
    --color-code-bg: #f5f5f5;
    --color-blockquote-border: #d1d5db;
  }
  
  @media (prefers-color-scheme: dark) {
    :root {
      --color-text: #f0f0f0;
      --color-text-muted: #a0a0a0;
      --color-bg: #1a1a1a;
      --color-border: #333;
      --color-code-bg: #2a2a2a;
      --color-blockquote-border: #444;
    }
  }
  
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  
  body {
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.7;
    color: var(--color-text);
    background: var(--color-bg);
    max-width: 720px;
    margin: 0 auto;
    padding: 40px 20px;
  }
  
  h1, h2, h3, h4, h5, h6 {
    font-weight: 600;
    line-height: 1.3;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
  }
  
  h1 { font-size: 2em; }
  h2 { font-size: 1.5em; }
  h3 { font-size: 1.25em; }
  h4 { font-size: 1.1em; }
  
  p {
    margin-bottom: 1em;
  }
  
  a {
    color: var(--color-accent);
    text-decoration: none;
  }
  
  a:hover {
    text-decoration: underline;
  }
  
  code {
    font-family: var(--font-mono);
    font-size: 0.9em;
    background: var(--color-code-bg);
    padding: 0.15em 0.4em;
    border-radius: 4px;
  }
  
  pre {
    background: var(--color-code-bg);
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    margin-bottom: 1em;
  }
  
  pre code {
    background: none;
    padding: 0;
  }
  
  blockquote {
    border-left: 3px solid var(--color-blockquote-border);
    padding-left: 16px;
    margin: 1em 0;
    color: var(--color-text-muted);
  }
  
  ul, ol {
    padding-left: 1.5em;
    margin-bottom: 1em;
  }
  
  li {
    margin-bottom: 0.25em;
  }
  
  hr {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 2em 0;
  }
  
  img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
  }
  
  .annotation {
    background: rgba(255, 220, 0, 0.3);
    border-radius: 2px;
    padding: 0 2px;
  }
  
  @media print {
    body {
      max-width: none;
      padding: 0;
    }
  }
</style>
`;

export class HtmlSerializer implements Serializer {
  async serialize(doc: PMNode, options: ExportOptions = {}): Promise<ExportResult> {
    const bodyContent = this.serializeDocument(doc, options);
    const title = options.title || "Exported Document";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  ${DEFAULT_STYLES}
</head>
<body>
  <article>
    ${bodyContent}
  </article>
</body>
</html>`;

    return {
      content: html,
      mimeType: "text/html",
      filename: `${title}.html`,
    };
  }

  private serializeDocument(doc: PMNode, options: ExportOptions): string {
    const parts: string[] = [];

    for (let index = 0; index < doc.childCount; index += 1) {
      const node = doc.child(index);
      parts.push(this.serializeNode(node, options));
    }

    return parts.join("\n");
  }

  private serializeNode(node: PMNode, options: ExportOptions): string {
    switch (node.type.name) {
      case "paragraph":
        return `<p>${this.serializeInlineContent(node)}</p>`;
      case "heading": {
        const level = node.attrs.level || 1;
        return `<h${level}>${this.serializeInlineContent(node)}</h${level}>`;
      }
      case "bullet_list":
        return this.serializeList(node, "ul", options);
      case "ordered_list":
        return this.serializeList(node, "ol", options);
      case "list_item":
        return this.serializeListItem(node, options);
      case "blockquote":
        return `<blockquote>${this.serializeDocument(node, options)}</blockquote>`;
      case "code_block": {
        const lang = node.attrs.language ? ` class="language-${node.attrs.language}"` : "";
        return `<pre><code${lang}>${this.escapeHtml(node.textContent)}</code></pre>`;
      }
      case "horizontal_rule":
        return "<hr>";
      case "image":
        return this.serializeImage(node, options);
      default:
        return node.textContent ? `<p>${this.escapeHtml(node.textContent)}</p>` : "";
    }
  }

  private serializeList(node: PMNode, tag: "ul" | "ol", options: ExportOptions): string {
    const items: string[] = [];
    for (let index = 0; index < node.childCount; index += 1) {
      const item = node.child(index);
      items.push(this.serializeListItem(item, options));
    }
    return `<${tag}>\n${items.join("\n")}\n</${tag}>`;
  }

  private serializeListItem(node: PMNode, options: ExportOptions): string {
    const content = this.serializeDocument(node, options);
    return `<li>${content}</li>`;
  }

  private serializeImage(node: PMNode, _options: ExportOptions): string {
    const { src, alt, title } = node.attrs;
    const altAttr = alt ? ` alt="${this.escapeHtml(alt)}"` : "";
    const titleAttr = title ? ` title="${this.escapeHtml(title)}"` : "";
    return `<img src="${src}"${altAttr}${titleAttr}>`;
  }

  private serializeInlineContent(node: PMNode): string {
    let result = "";

    for (let index = 0; index < node.childCount; index += 1) {
      const child = node.child(index);
      if (child.isText) {
        result += this.applyMarks(this.escapeHtml(child.text || ""), child.marks);
      } else if (child.type.name === "hard_break") {
        result += "<br>";
      } else if (child.type.name === "image") {
        const { src, alt } = child.attrs;
        result += `<img src="${src}" alt="${this.escapeHtml(alt || "")}">`;
      }
    }

    return result;
  }

  private applyMarks(text: string, marks: readonly Mark[]): string {
    let result = text;

    for (const mark of marks) {
      switch (mark.type.name) {
        case "bold":
        case "strong":
          result = `<strong>${result}</strong>`;
          break;
        case "italic":
        case "em":
          result = `<em>${result}</em>`;
          break;
        case "code":
          result = `<code>${result}</code>`;
          break;
        case "strike":
        case "strikethrough":
          result = `<s>${result}</s>`;
          break;
        case "link":
          result = `<a href="${mark.attrs.href || ""}">${result}</a>`;
          break;
        case "underline":
          result = `<u>${result}</u>`;
          break;
      }
    }

    return result;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}

export function createHtmlSerializer(): HtmlSerializer {
  return new HtmlSerializer();
}
