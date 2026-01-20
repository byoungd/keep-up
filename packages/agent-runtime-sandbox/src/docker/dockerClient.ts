import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import Dockerode from "dockerode";

const DEFAULT_DOCKER_API_VERSION = "v1.44";
const DOCKER_SOCKET_CANDIDATES = [
  join(homedir(), "Library/Containers/com.docker.docker/Data/docker.raw.sock"),
  "/var/run/docker.sock",
  join(homedir(), ".docker/run/docker.sock"),
];

export function createDockerClient(
  options: { socketPath?: string; apiVersion?: string } = {}
): Dockerode {
  const dockerOptions: Dockerode.DockerOptions = {};
  const apiVersion = normalizeDockerApiVersion(options.apiVersion) ?? resolveDockerApiVersion();
  if (apiVersion) {
    dockerOptions.version = apiVersion;
  }

  const socketPath = options.socketPath ?? resolveDockerSocketPath();
  if (socketPath) {
    dockerOptions.socketPath = socketPath;
  }

  return new Dockerode(dockerOptions);
}

function resolveDockerSocketPath(): string | undefined {
  if (process.env.DOCKER_HOST) {
    return undefined;
  }

  for (const candidate of DOCKER_SOCKET_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function resolveDockerApiVersion(): string | undefined {
  const envVersion = normalizeDockerApiVersion(process.env.DOCKER_API_VERSION);
  if (envVersion) {
    return envVersion;
  }

  if (process.platform !== "darwin") {
    return undefined;
  }

  const dockerHost = process.env.DOCKER_HOST;
  if (dockerHost && !dockerHost.startsWith("unix://")) {
    return undefined;
  }

  // Docker Desktop now enforces a minimum API version >= 1.44 for local sockets.
  return DEFAULT_DOCKER_API_VERSION;
}

function normalizeDockerApiVersion(version?: string): string | undefined {
  if (!version) {
    return undefined;
  }

  return version.startsWith("v") ? version : `v${version}`;
}
