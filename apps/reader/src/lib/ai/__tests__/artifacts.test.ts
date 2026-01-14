import { describe, expect, it } from "vitest";
import { parseArtifactsFromContent } from "../artifacts";

describe("parseArtifactsFromContent", () => {
  it("extracts artifacts and strips the artifact blocks from content", () => {
    const content = `Before
\`\`\`artifact
{"type":"plan","title":"Phase 3","steps":[{"title":"Build UI","status":"todo"}]}
\`\`\`
After`;

    const result = parseArtifactsFromContent(content);

    expect(result.content).toBe("Before\n\nAfter");
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]).toMatchObject({
      type: "plan",
      title: "Phase 3",
      steps: [{ title: "Build UI", status: "todo" }],
    });
  });

  it("captures artifact ids when provided", () => {
    const content = `\`\`\`artifact
{"id":"artifact-1","type":"diff","title":"Patch","files":[{"path":"file.txt","diff":"+ok"}]}
\`\`\``;

    const result = parseArtifactsFromContent(content);

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.id).toBe("artifact-1");
  });

  it("ignores invalid artifact payloads", () => {
    const content = `Before
\`\`\`artifact
{not-json}
\`\`\`
After`;

    const result = parseArtifactsFromContent(content);

    expect(result.content).toBe("Before\n\nAfter");
    expect(result.artifacts).toHaveLength(0);
  });
});
