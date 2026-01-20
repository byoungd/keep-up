const DEFAULT_BLOCKED_KEYS = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CONFIG",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_SYSTEM",
]);

export interface SanitizedEnvOptions {
  blockedKeys?: Set<string>;
  overrides?: NodeJS.ProcessEnv;
}

export function createSanitizedEnv(
  source: NodeJS.ProcessEnv = process.env,
  options: SanitizedEnvOptions = {}
): NodeJS.ProcessEnv {
  const blockedKeys = options.blockedKeys ?? DEFAULT_BLOCKED_KEYS;
  const sanitized: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(source)) {
    if (blockedKeys.has(key)) {
      continue;
    }
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  return {
    ...sanitized,
    ...options.overrides,
  };
}

export function stripGitEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return createSanitizedEnv(source, { blockedKeys: DEFAULT_BLOCKED_KEYS });
}
