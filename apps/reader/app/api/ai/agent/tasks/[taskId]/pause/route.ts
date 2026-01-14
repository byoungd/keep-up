import { createErrorResponse, createSuccessResponse } from "../../../../responseUtils";
import { pauseBackgroundTask } from "../../../taskRuntime";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: { taskId: string } }) {
  const taskId = context.params.taskId;
  if (!taskId) {
    return createErrorResponse("invalid_request", "taskId is required");
  }

  const paused = await pauseBackgroundTask(taskId);
  if (!paused) {
    return createErrorResponse("invalid_request", "Task not found or cannot pause", {
      requestId: taskId,
    });
  }

  return createSuccessResponse({ task_id: taskId, paused: true }, { requestId: taskId });
}
