import {
  getNativeMarkdownContent,
  type NativeMarkdownContentBinding,
} from "@ku0/markdown-content-rs";

export function resolveNativeMarkdownContent(): NativeMarkdownContentBinding | null {
  return getNativeMarkdownContent();
}
