/**
 * VM Provider Types
 *
 * Abstraction layer for executing commands and file operations within a VM.
 * The actual VM implementation (using Apple Virtualization Framework or similar)
 * is injected at runtime by the host application.
 */

/**
 * Configuration for VM resources.
 */
export interface VmConfig {
  /** Number of virtual CPUs */
  cpuCount?: number;
  /** Memory in bytes */
  memoryBytes?: number;
  /** Mounted directories (host path -> guest path) */
  mounts: VmMount[];
}

export interface VmMount {
  /** Host path to mount */
  hostPath: string;
  /** Path inside the VM */
  guestPath: string;
  /** Whether the mount is read-only */
  readOnly: boolean;
}

/**
 * Result of a command execution in the VM.
 */
export interface VmExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * File info returned by VM file operations.
 */
export interface VmFileInfo {
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  modifiedAt: number;
}

/**
 * Provider interface for VM operations.
 *
 * Implementations should handle the actual virtualization layer
 * (e.g., Apple VZVirtualMachine, Docker, or a mock for testing).
 */
export interface IVmProvider {
  /** Check if the VM is running */
  isRunning(): boolean;

  /** Start the VM */
  start(config: VmConfig): Promise<void>;

  /** Stop the VM */
  stop(): Promise<void>;

  /**
   * Execute a command in the VM.
   * @param command - The command to execute
   * @param args - Command arguments
   * @param options - Execution options
   */
  exec(command: string, args: string[], options?: VmExecOptions): Promise<VmExecResult>;

  /**
   * Read a file from the VM filesystem.
   * @param guestPath - Path inside the VM
   */
  readFile(guestPath: string): Promise<Uint8Array>;

  /**
   * Read a file as text from the VM filesystem.
   * @param guestPath - Path inside the VM
   */
  readFileText(guestPath: string): Promise<string>;

  /**
   * Write a file to the VM filesystem.
   * @param guestPath - Path inside the VM
   * @param content - File content
   */
  writeFile(guestPath: string, content: Uint8Array | string): Promise<void>;

  /**
   * List files in a directory.
   * @param guestPath - Directory path inside the VM
   */
  listDir(guestPath: string): Promise<VmFileInfo[]>;

  /**
   * Check if a path exists.
   * @param guestPath - Path inside the VM
   */
  exists(guestPath: string): Promise<boolean>;

  /**
   * Delete a file or directory.
   * @param guestPath - Path inside the VM
   * @param recursive - Whether to delete recursively for directories
   */
  remove(guestPath: string, recursive?: boolean): Promise<void>;
}

export interface VmExecOptions {
  /** Working directory inside the VM */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Stdin input */
  stdin?: string;
}

/**
 * Mock VM provider for testing.
 * Uses in-memory filesystem and command simulation.
 */
export class MockVmProvider implements IVmProvider {
  private running = false;
  private files = new Map<string, Uint8Array>();
  private execHandler?: (cmd: string, args: string[]) => VmExecResult;

  setExecHandler(handler: (cmd: string, args: string[]) => VmExecResult): void {
    this.execHandler = handler;
  }

  isRunning(): boolean {
    return this.running;
  }

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async exec(command: string, args: string[]): Promise<VmExecResult> {
    if (!this.running) {
      throw new Error("VM not running");
    }
    if (this.execHandler) {
      return this.execHandler(command, args);
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  }

  async readFile(guestPath: string): Promise<Uint8Array> {
    const content = this.files.get(guestPath);
    if (!content) {
      throw new Error(`File not found: ${guestPath}`);
    }
    return content;
  }

  async readFileText(guestPath: string): Promise<string> {
    const content = await this.readFile(guestPath);
    return new TextDecoder().decode(content);
  }

  async writeFile(guestPath: string, content: Uint8Array | string): Promise<void> {
    const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
    this.files.set(guestPath, bytes);
  }

  async listDir(guestPath: string): Promise<VmFileInfo[]> {
    const results: VmFileInfo[] = [];
    const prefix = guestPath.endsWith("/") ? guestPath : `${guestPath}/`;
    for (const [path, content] of this.files) {
      if (path.startsWith(prefix)) {
        const relativePath = path.slice(prefix.length);
        if (!relativePath.includes("/")) {
          results.push({
            path,
            isDirectory: false,
            sizeBytes: content.length,
            modifiedAt: Date.now(),
          });
        }
      }
    }
    return results;
  }

  async exists(guestPath: string): Promise<boolean> {
    return this.files.has(guestPath);
  }

  async remove(guestPath: string, recursive?: boolean): Promise<void> {
    if (recursive) {
      const prefix = guestPath.endsWith("/") ? guestPath : `${guestPath}/`;
      for (const path of this.files.keys()) {
        if (path === guestPath || path.startsWith(prefix)) {
          this.files.delete(path);
        }
      }
    } else {
      this.files.delete(guestPath);
    }
  }

  // Test helpers
  _setFile(path: string, content: string): void {
    this.files.set(path, new TextEncoder().encode(content));
  }

  _getFile(path: string): string | undefined {
    const content = this.files.get(path);
    return content ? new TextDecoder().decode(content) : undefined;
  }

  _clear(): void {
    this.files.clear();
  }
}
