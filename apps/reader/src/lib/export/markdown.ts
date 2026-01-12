/**
 * Markdown Serializer
 *
 * Converts ProseMirror document to GitHub Flavored Markdown (GFM).
 */

import type { Mark, Node as PMNode } from "prosemirror-model";
import type { ExportOptions, ExportResult, Serializer } from "./types";

export class MarkdownSerializer implements Serializer {
  async serialize(doc: PMNode, options: ExportOptions = {}): Promise<ExportResult> {
    const lines: string[] = [];

    // Add front-matter if requested
    if (options.includeMeta && options.title) {
      lines.push("---");
      lines.push(`title: "${options.title}"`);
      lines.push(`date: "${new Date().toISOString()}"`);
      lines.push("---");
      lines.push("");
    }

    // Serialize document content
    for (let index = 0; index < doc.childCount; index += 1) {
      const node = doc.child(index);
      const serialized = this.serializeNode(node, options);
      if (serialized) {
        lines.push(serialized);
      }
    }

    const content = lines.join("\n");
    const filename = `${options.title || "document"}.md`;

    return {
      content,
      mimeType: "text/markdown",
      filename,
    };
  }

  private serializeNode(node: PMNode, options: ExportOptions): string {
    switch (node.type.name) {
      case "paragraph":
        return `${this.serializeParagraph(node)}\n`;
      case "heading":
        return this.serializeHeading(node);
      case "bullet_list":
        return this.serializeList(node, "-", options);
      case "ordered_list":
        return this.serializeList(node, "1.", options);
      case "list_item":
        return this.serializeListItem(node, options);
      case "blockquote":
        return this.serializeBlockquote(node, options);
      case "code_block":
        return this.serializeCodeBlock(node);
      case "horizontal_rule":
        return "---\n";
      case "image":
        return this.serializeImage(node, options);
      case "hard_break":
        return "  \n";
      default:
        // For unknown nodes, try to extract text content
        return node.textContent ? `${node.textContent}\n` : "";
    }
  }

  private serializeParagraph(node: PMNode): string {
    return this.serializeInlineContent(node);
  }

  private serializeHeading(node: PMNode): string {
    const level = node.attrs.level || 1;
    const prefix = "#".repeat(level);
    return `${prefix} ${this.serializeInlineContent(node)}\n`;
  }

  private serializeList(node: PMNode, marker: string, options: ExportOptions): string {
    const items: string[] = [];
    for (let index = 0; index < node.childCount; index += 1) {
      const item = node.child(index);
      const prefix = marker === "1." ? `${index + 1}.` : marker;
      const content = this.serializeListItem(item, options);
      items.push(`${prefix} ${content}`);
    }
    return `${items.join("\n")}\n`;
  }

  private serializeListItem(node: PMNode, options: ExportOptions): string {
    const parts: string[] = [];
    for (let index = 0; index < node.childCount; index += 1) {
      const child = node.child(index);
      if (child.type.name === "paragraph") {
        parts.push(this.serializeParagraph(child).trim());
      } else {
        // Nested lists or other content
        const nested = this.serializeNode(child, options);
        // Indent nested content
        parts.push(
          nested
            .split("\n")
            .map((l) => `  ${l}`)
            .join("\n")
            .trim()
        );
      }
    }
    return parts.join("\n");
  }

  private serializeBlockquote(node: PMNode, options: ExportOptions): string {
    const lines: string[] = [];
    for (let index = 0; index < node.childCount; index += 1) {
      const child = node.child(index);
      const content = this.serializeNode(child, options).trim();
      for (const line of content.split("\n")) {
        lines.push(`> ${line}`);
      }
    }
    return `${lines.join("\n")}\n`;
  }

  private serializeCodeBlock(node: PMNode): string {
    const lang = node.attrs.language || "";
    return `\`\`\`${lang}\n${node.textContent}\n\`\`\`\n`;
  }

  private serializeImage(node: PMNode, _options: ExportOptions): string {
    const { src, alt, title } = node.attrs;
    const altText = alt || "";
    const titlePart = title ? ` "${title}"` : "";

    // If embedImages is true, we would convert src to base64 here
    // For now, just use the URL
    return `![${altText}](${src}${titlePart})\n`;
  }

  private serializeInlineContent(node: PMNode): string {
    let result = "";

    for (let index = 0; index < node.childCount; index += 1) {
      const child = node.child(index);
      if (child.isText) {
        result += this.applyMarks(child.text || "", child.marks);
      } else if (child.type.name === "hard_break") {
        result += "  \n";
      } else if (child.type.name === "image") {
        const { src, alt } = child.attrs;
        result += `![${alt || ""}](${src})`;
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
          result = `**${result}**`;
          break;
        case "italic":
        case "em":
          result = `*${result}*`;
          break;
        case "code":
          result = `\`${result}\``;
          break;
        case "strike":
        case "strikethrough":
          result = `~~${result}~~`;
          break;
        case "link":
          result = `[${result}](${mark.attrs.href || ""})`;
          break;
      }
    }

    return result;
  }
}

export function createMarkdownSerializer(): MarkdownSerializer {
  return new MarkdownSerializer();
}
