import { createErrorResponse, createSuccessResponse } from "../../../../responseUtils";
import { resumeBackgroundTask } from "../../../taskRuntime";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: { taskId: string } }) {
  const taskId = context.params.taskId;
  if (!taskId) {
    return createErrorResponse("invalid_request", "taskId is required");
  }

  const resumed = await resumeBackgroundTask(taskId);
  if (!resumed) {
    return createErrorResponse("invalid_request", "Task not found or cannot resume", {
      requestId: taskId,
    });
  }

  return createSuccessResponse({ task_id: taskId, resumed: true }, { requestId: taskId });
}
