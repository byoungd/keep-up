/**
 * Centralized configuration for the Cowork app.
 * All environment-dependent values should be accessed through this module.
 */

interface CoworkConfig {
  /** Base URL for API requests (e.g., "http://localhost:3001" or "") */
  apiBase: string;
  /** Enable development tools (React Query Devtools, Router Devtools) */
  devTools: boolean;
  /** SSE reconnection delay in milliseconds */
  sseReconnectDelay: number;
  /** Session list polling interval in milliseconds (0 to disable) */
  sessionPollInterval: number;
}

function getConfig(): CoworkConfig {
  const isDev = import.meta.env.DEV;

  return {
    apiBase: import.meta.env.VITE_API_BASE ?? "",
    devTools: isDev,
    sseReconnectDelay: 3000,
    sessionPollInterval: isDev ? 5000 : 10000,
  };
}

export const config = getConfig();

/**
 * Build a full API URL from a path
 */
export function apiUrl(path: string): string {
  const base = config.apiBase;
  if (base) {
    return `${base.replace(/\/$/, "")}${path}`;
  }
  return path;
}
