import { createErrorResponse, createSuccessResponse } from "../../responseUtils";
import { resolvePendingConfirmation } from "../confirmationStore";

export const runtime = "nodejs";

type ConfirmRequestBody = {
  confirmation_id?: string;
  confirmed?: boolean;
  request_id?: string;
};

export async function POST(request: Request) {
  let body: ConfirmRequestBody | null = null;
  try {
    body = (await request.json()) as ConfirmRequestBody;
  } catch {
    return createErrorResponse("invalid_request", "Request body must be valid JSON");
  }

  const confirmationId = body?.confirmation_id;
  if (!confirmationId) {
    return createErrorResponse("invalid_request", "confirmation_id is required");
  }

  const confirmed = body?.confirmed === true;
  const requestId = body?.request_id;

  const result = resolvePendingConfirmation({
    confirmationId,
    confirmed,
    requestId,
  });

  if (result.status === "not_found") {
    return createErrorResponse("invalid_request", "Confirmation not found", { requestId });
  }

  if (result.status === "request_mismatch") {
    return createErrorResponse("invalid_request", "Confirmation does not match request", {
      requestId: result.requestId,
    });
  }

  return createSuccessResponse(
    {
      success: true,
      confirmation_id: confirmationId,
      confirmed,
      request_id: result.requestId,
    },
    { requestId: result.requestId }
  );
}
