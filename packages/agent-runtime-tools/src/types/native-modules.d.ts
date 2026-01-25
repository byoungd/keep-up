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
  export interface SandboxPolicy {
    execute(
      cmd: string,
      args: string[],
      options?: {
        cwd?: string;
        timeoutMs?: number;
        env?: Record<string, string> | { key: string; value: string }[];
        maxOutputBytes?: number;
      }
    ): Promise<{
      exitCode: number;
      stdout: string;
      stderr: string;
      timedOut: boolean;
      truncated: boolean;
      durationMs: number;
    }>;
  }

  export function createSandbox(config: any): SandboxPolicy;

  export type SandboxManager = {
    checkFileAccess: (targetPath: string, intent: string) => Promise<boolean>;
  };
}
