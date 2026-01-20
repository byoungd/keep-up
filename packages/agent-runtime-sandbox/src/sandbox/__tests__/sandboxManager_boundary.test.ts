import { PassThrough } from "node:stream";
import type Dockerode from "dockerode";
import { describe, expect, it, vi } from "vitest";
import { DockerSandboxManager } from "../sandboxManager";
import type { SandboxPolicy } from "../types";

interface MockDocker {
  ping: (...args: unknown[]) => Promise<unknown>;
  createContainer: (...args: unknown[]) => Promise<unknown>;
  modem: {
    demuxStream: (...args: unknown[]) => void;
  };
}

describe("DockerSandboxManager Boundary Conditions (Mocked)", () => {
  it("should handle docker ping timeout in isAvailable", async () => {
    const mockDocker: MockDocker = {
      ping: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5000))),
      createContainer: vi.fn(),
      modem: { demuxStream: vi.fn() },
    };

    const manager = new DockerSandboxManager({ docker: mockDocker as unknown as Dockerode });
    const available = await manager.isAvailable(100);
    expect(available).toBe(false);
  });

  it("should handle container creation failure", async () => {
    const mockDocker: MockDocker = {
      ping: vi.fn(),
      createContainer: vi.fn().mockRejectedValue(new Error("Docker error")),
      modem: { demuxStream: vi.fn() },
    };

    const manager = new DockerSandboxManager({
      docker: mockDocker as unknown as Dockerode,
      pool: { enabled: false },
    });
    await expect(manager.createSandbox("test")).rejects.toThrow("Docker error");
  });

  it("should handle exec timeout", async () => {
    const mockStream = new PassThrough();
    // Simulate a stream that never ends
    const mockExec = {
      start: vi.fn().mockResolvedValue(mockStream),
      inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
    };
    const mockContainer = {
      id: "test-container",
      inspect: vi.fn().mockResolvedValue({ State: { Running: true } }),
      exec: vi.fn().mockResolvedValue(mockExec),
      kill: vi.fn().mockResolvedValue({}),
      start: vi.fn().mockResolvedValue({}),
    };
    const mockDocker: MockDocker = {
      ping: vi.fn(),
      createContainer: vi.fn().mockResolvedValue(mockContainer),
      modem: {
        demuxStream: vi.fn(),
      },
    };

    const manager = new DockerSandboxManager({
      docker: mockDocker as unknown as Dockerode,
      pool: { enabled: false },
    });
    const sandbox = await manager.createSandbox("test", {
      policy: { timeoutMs: 100 } as unknown as SandboxPolicy,
    });

    const result = await sandbox.exec("sleep 10");
    expect(result.timedOut).toBe(true);
    // exitCode comes from inspect?.ExitCode (0 from mock) when inspect succeeds
    // In a real timeout scenario, container.kill() would cause inspect to return null or different code
    expect(mockContainer.kill).toHaveBeenCalled();
  });

  it("should handle output truncation", async () => {
    const mockStream = new PassThrough();
    const mockExec = {
      start: vi.fn().mockResolvedValue(mockStream),
      inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
    };
    const mockContainer = {
      id: "test-container",
      inspect: vi.fn().mockResolvedValue({ State: { Running: true } }),
      exec: vi.fn().mockResolvedValue(mockExec),
      start: vi.fn().mockResolvedValue({}),
    };

    // Create a modem mock that emits data to the PassThrough and ends the stream
    const mockDocker: MockDocker = {
      ping: vi.fn(),
      createContainer: vi.fn().mockResolvedValue(mockContainer),
      modem: {
        demuxStream: (stream: unknown, stdout: unknown, _stderr: unknown) => {
          // Send more than 1MB of data
          const largeData = Buffer.alloc(1024 * 1024 + 100, "a");
          (stdout as PassThrough).write(largeData);
          // End the actual stream to trigger the 'end' event
          setImmediate(() => (stream as PassThrough).emit("end"));
        },
      },
    };

    const manager = new DockerSandboxManager({
      docker: mockDocker as unknown as Dockerode,
      pool: { enabled: false },
    });
    const sandbox = await manager.createSandbox("test");

    const result = await sandbox.exec("echo truncated", { maxOutputBytes: 1024 });
    expect(result.truncated).toBe(true);
    expect(result.stdout.length).toBe(1024);
  });
});
