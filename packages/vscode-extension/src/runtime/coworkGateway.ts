export type CoworkRequestOptions = RequestInit & { baseUrl?: string };

export type CoworkFolderGrant = {
  id?: string;
  rootPath: string;
  allowWrite?: boolean;
  allowDelete?: boolean;
  allowCreate?: boolean;
  outputRoots?: string[];
};

export type CoworkConnectorGrant = {
  id?: string;
  provider: string;
  scopes?: string[];
  allowActions?: boolean;
};

export type CoworkSessionRecord = {
  sessionId: string;
  title?: string;
  agentMode?: "plan" | "build" | "review";
  grants: CoworkFolderGrant[];
  isolationLevel?: "main" | "sandbox" | "restricted";
  sandboxMode?: "none" | "workspace-write" | "docker";
  toolAllowlist?: string[];
  toolDenylist?: string[];
};

export type CoworkTaskRecord = {
  taskId: string;
  sessionId: string;
  title: string;
  prompt: string;
  status: string;
  createdAt?: number;
  updatedAt?: number;
};

export type CoworkCreateSessionPayload = {
  userId?: string;
  deviceId?: string;
  grants?: CoworkFolderGrant[];
  connectors?: CoworkConnectorGrant[];
  title?: string;
  isolationLevel?: "main" | "sandbox" | "restricted";
  sandboxMode?: "none" | "workspace-write" | "docker";
  toolAllowlist?: string[];
  toolDenylist?: string[];
};

export type CoworkCreateTaskPayload = {
  title?: string;
  prompt: string;
  modelId?: string;
  metadata?: Record<string, unknown>;
};

export type CoworkApprovalDecision = {
  status: "approved" | "rejected";
};

export type CoworkClarificationAnswer = {
  answer: string;
  selectedOption?: number;
};

export function resolveCoworkBaseUrl(override?: string): string {
  if (override?.trim()) {
    return override.trim();
  }
  const env =
    process.env.KEEPUP_COWORK_URL ??
    process.env.KEEPUP_GATEWAY_URL ??
    process.env.COWORK_BASE_URL ??
    process.env.COWORK_URL;
  return env?.trim() ? env.trim() : "http://localhost:3000";
}

export async function fetchCoworkJson<T>(
  path: string,
  options: CoworkRequestOptions = {}
): Promise<T> {
  const baseUrl = resolveCoworkBaseUrl(options.baseUrl);
  const url = new URL(path, baseUrl);
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });
  let data: unknown = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errorMessage =
      data && typeof data === "object" && "error" in data
        ? String((data as { error?: string }).error ?? response.statusText)
        : response.statusText;
    throw new Error(errorMessage);
  }

  if (data && typeof data === "object" && "ok" in data && (data as { ok?: boolean }).ok === false) {
    const errorMessage =
      "error" in data
        ? String((data as { error?: string }).error ?? "Request failed")
        : "Request failed";
    throw new Error(errorMessage);
  }

  return data as T;
}

export async function createCoworkSession(
  payload: CoworkCreateSessionPayload,
  options: CoworkRequestOptions = {}
): Promise<CoworkSessionRecord> {
  const data = await fetchCoworkJson<{ session?: CoworkSessionRecord }>(`/api/sessions`, {
    ...options,
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!data.session) {
    throw new Error("Session not returned");
  }
  return data.session;
}

export async function getCoworkSession(
  sessionId: string,
  options: CoworkRequestOptions = {}
): Promise<CoworkSessionRecord> {
  const data = await fetchCoworkJson<{ session?: CoworkSessionRecord }>(
    `/api/sessions/${sessionId}`,
    options
  );
  if (!data.session) {
    throw new Error("Session not found");
  }
  return data.session;
}

export async function createCoworkTask(
  sessionId: string,
  payload: CoworkCreateTaskPayload,
  options: CoworkRequestOptions = {}
): Promise<CoworkTaskRecord> {
  const data = await fetchCoworkJson<{ task?: CoworkTaskRecord }>(
    `/api/sessions/${sessionId}/tasks`,
    {
      ...options,
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  if (!data.task) {
    throw new Error("Task not returned");
  }
  return data.task;
}

export async function setCoworkSessionMode(
  sessionId: string,
  mode: "plan" | "build" | "review",
  options: CoworkRequestOptions = {}
): Promise<"plan" | "build" | "review"> {
  const data = await fetchCoworkJson<{ mode?: "plan" | "build" | "review" }>(
    `/api/sessions/${sessionId}/mode`,
    {
      ...options,
      method: "PUT",
      body: JSON.stringify({ mode }),
    }
  );
  if (!data.mode) {
    throw new Error("Session mode not returned");
  }
  return data.mode;
}

export async function resolveCoworkApproval(
  approvalId: string,
  decision: CoworkApprovalDecision,
  options: CoworkRequestOptions = {}
): Promise<void> {
  await fetchCoworkJson<Record<string, unknown>>(`/api/approvals/${approvalId}`, {
    ...options,
    method: "PATCH",
    body: JSON.stringify(decision),
  });
}

export async function submitCoworkClarification(
  clarificationId: string,
  answer: CoworkClarificationAnswer,
  options: CoworkRequestOptions = {}
): Promise<void> {
  await fetchCoworkJson<Record<string, unknown>>(`/api/clarifications/${clarificationId}`, {
    ...options,
    method: "PATCH",
    body: JSON.stringify(answer),
  });
}
