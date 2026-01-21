import { getNativeAiSanitizer, type NativeAiSanitizer } from "@ku0/ai-sanitizer-rs";

const DISABLE_ENV = "KU0_AI_SANITIZER_DISABLE_NATIVE";
const ENABLE_ENV = "KU0_AI_SANITIZER_ENABLE_NATIVE";
const ENABLE_ENV_ALIAS = "KU0_AI_SANITIZER_NATIVE";
const GLOBAL_ENABLE_ENV = "KU0_NATIVE_ACCELERATORS_ENABLED";

let cachedSanitizer: NativeAiSanitizer | null | undefined;

function readBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function isNativeAiSanitizerEnabled(): boolean {
  if (typeof process === "undefined") {
    return false;
  }

  const env = process.env ?? {};
  if (readBooleanEnv(env[DISABLE_ENV])) {
    return false;
  }

  const explicit = readBooleanEnv(env[ENABLE_ENV]);
  if (explicit !== undefined) {
    return explicit;
  }

  const alias = readBooleanEnv(env[ENABLE_ENV_ALIAS]);
  if (alias !== undefined) {
    return alias;
  }

  return readBooleanEnv(env[GLOBAL_ENABLE_ENV]) ?? false;
}

export function loadNativeAiSanitizer(): NativeAiSanitizer | null {
  if (!isNativeAiSanitizerEnabled()) {
    return null;
  }

  if (cachedSanitizer !== undefined) {
    return cachedSanitizer;
  }

  cachedSanitizer = getNativeAiSanitizer();
  return cachedSanitizer;
}
