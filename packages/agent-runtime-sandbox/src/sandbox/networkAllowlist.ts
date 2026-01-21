import { PassThrough } from "node:stream";

import type Dockerode from "dockerode";
import type { Container } from "dockerode";

const DEFAULT_TIMEOUT_MS = 15_000;
const IPV4_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}$/;

type ExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export function normalizeAllowedHosts(hosts?: string[]): string[] {
  if (!hosts || hosts.length === 0) {
    return [];
  }
  const normalized = new Set<string>();
  for (const entry of hosts) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const host = parseHost(trimmed);
    if (!host) {
      continue;
    }
    normalized.add(host);
  }
  return Array.from(normalized);
}

export async function applyNetworkAllowlist(input: {
  docker: Dockerode;
  container: Container;
  hosts: string[];
  timeoutMs?: number;
}): Promise<void> {
  if (input.hosts.length === 0) {
    return;
  }
  const env = [`ALLOWED_HOSTS=${input.hosts.join("\n")}`];
  const result = await execInContainer({
    docker: input.docker,
    container: input.container,
    command: buildFirewallScript(),
    env,
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  if (result.exitCode !== 0) {
    const details = result.stderr || result.stdout || "unknown error";
    throw new Error(
      `Network allowlist setup failed: ${details}. Ensure the sandbox image includes iptables, ipset, and dig.`
    );
  }
}

function parseHost(input: string): string | null {
  if (input.includes("://")) {
    try {
      return normalizeHost(new URL(input).hostname);
    } catch {
      return null;
    }
  }
  if (input.includes("/") || input.includes("?")) {
    try {
      return normalizeHost(new URL(`https://${input}`).hostname);
    } catch {
      return null;
    }
  }
  return normalizeHost(input.split(":")[0]);
}

function normalizeHost(input: string | undefined): string | null {
  if (!input) {
    return null;
  }
  const host = input.trim();
  if (!host) {
    return null;
  }
  if (host === "localhost") {
    return host;
  }
  if (IPV4_REGEX.test(host)) {
    return host;
  }
  const lower = host.toLowerCase();
  if (!isValidHostname(lower)) {
    return null;
  }
  return lower;
}

function isValidHostname(host: string): boolean {
  if (host.length > 253 || !host.includes(".")) {
    return false;
  }
  const labels = host.split(".");
  for (const label of labels) {
    if (!label || label.length > 63) {
      return false;
    }
    if (label.startsWith("-") || label.endsWith("-")) {
      return false;
    }
    if (!/^[a-z0-9-]+$/.test(label)) {
      return false;
    }
  }
  return true;
}

function buildFirewallScript(): string {
  return [
    "set -euo pipefail",
    "IFS=$'\\n\\t'",
    `ALLOWED_HOSTS="\${ALLOWED_HOSTS:-}"`,
    'if [ -z "$ALLOWED_HOSTS" ]; then echo "No allowed hosts provided"; exit 1; fi',
    'if ! command -v iptables >/dev/null 2>&1; then echo "iptables not installed"; exit 1; fi',
    'if ! command -v ipset >/dev/null 2>&1; then echo "ipset not installed"; exit 1; fi',
    'if ! command -v dig >/dev/null 2>&1; then echo "dig not installed"; exit 1; fi',
    "iptables -F",
    "iptables -X",
    "iptables -t nat -F",
    "iptables -t nat -X",
    "iptables -t mangle -F",
    "iptables -t mangle -X",
    "ipset destroy sandbox-allowed-hosts 2>/dev/null || true",
    "iptables -A OUTPUT -p udp --dport 53 -j ACCEPT",
    "iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT",
    "iptables -A INPUT -p udp --sport 53 -j ACCEPT",
    "iptables -A INPUT -p tcp --sport 53 -j ACCEPT",
    "iptables -A INPUT -i lo -j ACCEPT",
    "iptables -A OUTPUT -o lo -j ACCEPT",
    "iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT",
    "iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT",
    "ipset create sandbox-allowed-hosts hash:net -exist",
    "for host in $ALLOWED_HOSTS; do",
    "  if echo \"$host\" | grep -Eq '^[0-9]{1,3}(\\.[0-9]{1,3}){3}$'; then",
    '    ipset add sandbox-allowed-hosts "$host" -exist',
    "    continue",
    "  fi",
    '  ips=$(dig +short A "$host")',
    '  if [ -z "$ips" ]; then',
    '    echo "Failed to resolve $host"',
    "    exit 1",
    "  fi",
    "  for ip in $ips; do",
    '    ipset add sandbox-allowed-hosts "$ip" -exist',
    "  done",
    "done",
    "iptables -P INPUT DROP",
    "iptables -P FORWARD DROP",
    "iptables -P OUTPUT DROP",
    "iptables -A OUTPUT -m set --match-set sandbox-allowed-hosts dst -j ACCEPT",
    "iptables -A INPUT -p tcp -j REJECT --reject-with tcp-reset",
    "iptables -A INPUT -p udp -j REJECT --reject-with icmp-port-unreachable",
    "iptables -A OUTPUT -p tcp -j REJECT --reject-with tcp-reset",
    "iptables -A OUTPUT -p udp -j REJECT --reject-with icmp-port-unreachable",
    "iptables -A FORWARD -p tcp -j REJECT --reject-with tcp-reset",
    "iptables -A FORWARD -p udp -j REJECT --reject-with icmp-port-unreachable",
  ].join("\n");
}

async function execInContainer(input: {
  docker: Dockerode;
  container: Container;
  command: string;
  env?: string[];
  timeoutMs: number;
}): Promise<ExecResult> {
  const exec = await input.container.exec({
    Cmd: ["sh", "-lc", input.command],
    AttachStdout: true,
    AttachStderr: true,
    Env: input.env,
    User: "root",
  });
  const stream = await exec.start({ hijack: true });

  const stdoutStream = new PassThrough();
  const stderrStream = new PassThrough();
  input.docker.modem.demuxStream(stream, stdoutStream, stderrStream);

  let stdout = "";
  let stderr = "";
  stdoutStream.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  stderrStream.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<"timeout">((resolve) => {
    timeoutId = setTimeout(() => resolve("timeout"), input.timeoutMs);
  });
  const streamPromise = new Promise<"stream">((resolve, reject) => {
    stream.on("end", () => resolve("stream"));
    stream.on("error", reject);
  });

  const result = await Promise.race([streamPromise, timeoutPromise]);
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
  if (result === "timeout") {
    stream.destroy();
    throw new Error("Network allowlist initialization timed out");
  }

  const inspect = await exec.inspect().catch(() => null);
  const exitCode = inspect?.ExitCode ?? 0;
  return {
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}
