declare module "@ku0/gitignore-rs" {
  export type ListFilesOptions = {
    maxDepth?: number;
    includeHidden?: boolean;
    respectGitignore?: boolean;
  };

  export type FileEntry = {
    path: string;
    type: "file" | "directory";
    size?: number;
  };

  export function hasNativeSupport(): boolean;
  export function listFiles(path: string, options?: ListFilesOptions): FileEntry[];
}

declare module "@ku0/sandbox-rs" {
  export type SandboxManager = {
    checkFileAccess: (targetPath: string, intent: string) => Promise<boolean>;
  };
}
