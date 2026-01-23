export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const tauriGlobal = (window as { __TAURI__?: unknown }).__TAURI__;
  if (!tauriGlobal || typeof tauriGlobal !== "object") {
    return false;
  }

  return true;
}
