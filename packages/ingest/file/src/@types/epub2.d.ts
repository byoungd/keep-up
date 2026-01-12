declare module "epub2" {
  interface EPubMetadata {
    title?: string;
    creator?: string;
    publisher?: string;
    language?: string;
    description?: string;
  }

  interface EPubFlowItem {
    id?: string;
    href?: string;
  }

  class EPub {
    constructor(epubFile: Buffer | string);
    metadata: EPubMetadata;
    flow: EPubFlowItem[];
    on(event: "end", callback: () => void): void;
    on(event: "error", callback: (error: Error) => void): void;
    parse(): void;
    getChapter(id: string, callback: (error: Error | null, text: string) => void): void;
  }

  export = EPub;
}
