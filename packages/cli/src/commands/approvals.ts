import { Command } from "commander";
import { type ApprovalRecord, SessionStore } from "../utils/sessionStore";
import { writeStderr, writeStdout } from "../utils/terminal";

type ApprovalRow = {
  sessionId: string;
  approval: ApprovalRecord;
};

type ListOptions = {
  session?: string;
  status?: string;
  limit: string;
  all?: boolean;
};

type ResolveOptions = {
  status: string;
  reason?: string;
};

const RESOLVABLE_STATUSES = new Set(["approved", "rejected", "timeout"]);

export function approvalsCommand(): Command {
  return new Command("approvals")
    .description("Manage approval records")
    .addCommand(listCommand())
    .addCommand(resolveCommand());
}

function listCommand(): Command {
  return new Command("list")
    .description("List approval records")
    .option("-s, --session <id>", "Filter by session ID")
    .option("--status <status>", "Filter by status: requested, approved, rejected, timeout")
    .option("-n, --limit <n>", "Limit results", "25")
    .option("-a, --all", "Include all sessions")
    .action(async (options: ListOptions) => {
      const store = new SessionStore();
      const sessions = await loadSessions(store, options);
      const rows = collectApprovals(sessions, options.status);
      const limit = resolveLimit(options.limit, options.all);
      const sliced = limit > 0 ? rows.slice(0, limit) : rows;

      if (sliced.length === 0) {
        writeStdout("No approvals found.");
        return;
      }

      writeStdout("Session\tApproval\tStatus\tTool\tRisk\tRequested\tReason");
      for (const row of sliced) {
        writeStdout(formatApprovalRow(row));
      }
    });
}

function resolveCommand(): Command {
  return new Command("resolve")
    .description("Resolve an approval record")
    .argument("<sessionId>", "Session ID")
    .argument("<approvalId>", "Approval ID")
    .option("--status <status>", "Resolution status: approved, rejected, timeout", "approved")
    .option("--reason <text>", "Reason for the decision")
    .action(async (sessionId: string, approvalId: string, options: ResolveOptions) => {
      const status = options.status.trim();
      if (!RESOLVABLE_STATUSES.has(status)) {
        writeStderr(`Unknown status: ${status}`);
        process.exit(1);
      }

      const store = new SessionStore();
      const session = await store.get(sessionId);
      if (!session) {
        writeStderr(`Session ${sessionId} not found`);
        process.exit(1);
      }

      if (!session.approvals || session.approvals.length === 0) {
        writeStderr(`No approvals found for session ${sessionId}`);
        process.exit(1);
      }

      const approval = session.approvals.find((item) => item.id === approvalId);
      if (!approval) {
        writeStderr(`Approval ${approvalId} not found in session ${sessionId}`);
        process.exit(1);
      }

      if (approval.status !== "requested") {
        writeStderr(`Approval ${approvalId} already resolved as ${approval.status}`);
        process.exit(1);
      }

      const now = Date.now();
      approval.status = status as ApprovalRecord["status"];
      approval.resolvedAt = now;
      approval.decisionReason = options.reason?.trim() || undefined;
      session.updatedAt = now;

      await store.save(session);
      writeStdout(`Approval ${approvalId} marked as ${status}.`);
    });
}

async function loadSessions(
  store: SessionStore,
  options: ListOptions
): Promise<Array<{ id: string; approvals: ApprovalRecord[] }>> {
  if (options.session) {
    const session = await store.get(options.session);
    if (!session) {
      writeStderr(`Session ${options.session} not found`);
      process.exit(1);
    }
    return [session];
  }
  const limit = resolveLimit(options.limit, options.all);
  const sessions = await store.list(limit > 0 ? limit : 0);
  return sessions;
}

function collectApprovals(
  sessions: Array<{ id: string; approvals?: ApprovalRecord[] }>,
  statusFilter?: string
): ApprovalRow[] {
  const normalizedStatus = statusFilter?.trim();
  const rows: ApprovalRow[] = [];

  for (const session of sessions) {
    const approvals = session.approvals ?? [];
    for (const approval of approvals) {
      if (normalizedStatus && approval.status !== normalizedStatus) {
        continue;
      }
      rows.push({ sessionId: session.id, approval });
    }
  }

  rows.sort((a, b) => b.approval.requestedAt - a.approval.requestedAt);
  return rows;
}

function resolveLimit(value: string, includeAll?: boolean): number {
  if (includeAll) {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 25 : parsed;
}

function formatApprovalRow(row: ApprovalRow): string {
  const approval = row.approval;
  const toolName = approval.request.toolName ?? "unknown";
  const risk = approval.request.risk ?? "-";
  const reason = approval.request.reason ?? approval.request.description ?? "";
  const requestedAt = formatTimestamp(approval.requestedAt);

  return [
    row.sessionId,
    approval.id,
    approval.status,
    toolName,
    risk,
    requestedAt,
    sanitizeField(reason),
  ].join("\t");
}

function formatTimestamp(timestamp: number | undefined): string {
  if (!timestamp) {
    return "-";
  }
  return new Date(timestamp).toLocaleString();
}

function sanitizeField(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
