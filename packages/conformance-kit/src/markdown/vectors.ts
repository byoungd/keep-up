export type LineHashVector = {
  id: string;
  lines: string[];
  range: { start: number; end: number };
  canonical: string;
};

export type ContentHashVector = {
  id: string;
  content: string;
  ignoreFrontmatter: boolean;
  canonical: string;
};

export type SemanticVector = {
  id: string;
  content: string;
  semantic: {
    kind: "heading" | "code_fence" | "frontmatter" | "frontmatter_key";
    heading_text?: string;
    heading_text_mode?: "exact" | "prefix";
    heading_level?: number;
    language?: string;
    after_heading?: string;
    after_heading_mode?: "exact" | "prefix";
    key_path?: string[];
    nth?: number;
  };
  expected?: { start: number; end: number };
  errorCode?: string;
};

export type FrontmatterUpdateVector = {
  id: string;
  content: string;
  key_path: string[];
  value: unknown;
  create_if_missing?: boolean;
  expectedContains: string[];
};

export type BlockIdVector = {
  id: string;
  content: string;
  block_type: string;
  range: { start: number; end: number };
  canonical: string;
};

export const lineHashVectors: LineHashVector[] = [
  {
    id: "MD-LINE-001",
    lines: ["alpha", "bravo", "charlie"],
    range: { start: 2, end: 3 },
    canonical: "LFCC_MD_LINE_V1\nstart=2\nend=3\ntext=bravo\ncharlie",
  },
];

export const contentHashVectors: ContentHashVector[] = [
  {
    id: "MD-CONTENT-001",
    content: "---\nname: Test\n---\nBody",
    ignoreFrontmatter: true,
    canonical: "LFCC_MD_CONTENT_V1\nignore_frontmatter=true\ntext=Body",
  },
];

export const semanticVectors: SemanticVector[] = [
  {
    id: "MD-SEM-HEADING-001",
    content: "# Intro\nBody",
    semantic: { kind: "heading", heading_text: "Intro" },
    expected: { start: 1, end: 1 },
  },
  {
    id: "MD-SEM-CODE-001",
    content: "# Intro\n```ts\nconst x = 1;\n```\n",
    semantic: { kind: "code_fence", language: "ts", after_heading: "Intro" },
    expected: { start: 2, end: 4 },
  },
  {
    id: "MD-SEM-FRONTMATTER-001",
    content: "---\nname: Example\n---\nBody",
    semantic: { kind: "frontmatter" },
    expected: { start: 1, end: 3 },
  },
];

export const frontmatterUpdateVectors: FrontmatterUpdateVector[] = [
  {
    id: "MD-FM-UPDATE-001",
    content: "---\nname: Old\n---\nBody",
    key_path: ["name"],
    value: "New",
    expectedContains: ["name: New"],
  },
  {
    id: "MD-FM-CREATE-001",
    content: "Body",
    key_path: ["title"],
    value: "Created",
    create_if_missing: true,
    expectedContains: ['"title": "Created"'],
  },
];

export const blockIdVectors: BlockIdVector[] = [
  {
    id: "MD-BLOCK-001",
    content: "# Title\nBody",
    block_type: "md_heading",
    range: { start: 1, end: 1 },
    canonical: "LFCC_MD_BLOCK_V1\ntype=md_heading\nstart_line=1\nend_line=1\ncontent_hash=",
  },
];
