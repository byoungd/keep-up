import { createErrorResponse, createSuccessResponse } from "../../../../responseUtils";
import { cancelBackgroundTask } from "../../../taskRuntime";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: { taskId: string } }) {
  const taskId = context.params.taskId;
  if (!taskId) {
    return createErrorResponse("invalid_request", "taskId is required");
  }

  const cancelled = await cancelBackgroundTask(taskId);
  if (!cancelled) {
    return createErrorResponse("invalid_request", "Task not found", { requestId: taskId });
  }

  return createSuccessResponse({ task_id: taskId, cancelled: true }, { requestId: taskId });
}
