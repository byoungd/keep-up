import { generateCssVariables } from "@ku0/app";

export function DesignTokens() {
  const css = generateCssVariables();
  // biome-ignore lint/security/noDangerouslySetInnerHtml: generating CSS variables dynamically from tokens
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
