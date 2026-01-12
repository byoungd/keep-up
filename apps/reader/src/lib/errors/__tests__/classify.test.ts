import { describe, expect, it } from "vitest";
import { classifyError, createAppError, isAppError, toUserFacingError } from "../classify";
import { ErrorCodes } from "../types";

describe("classifyError", () => {
  it("classifies null/undefined as unexpected", () => {
    expect(classifyError(null)).toEqual({
      errorType: "unexpected",
      code: ErrorCodes.UNEXPECTED_ERROR,
      retryable: false,
    });
    expect(classifyError(undefined)).toEqual({
      errorType: "unexpected",
      code: ErrorCodes.UNEXPECTED_ERROR,
      retryable: false,
    });
  });

  it("classifies network errors as retryable", () => {
    const networkError = new TypeError("Failed to fetch");
    const result = classifyError(networkError);
    expect(result.errorType).toBe("network");
    expect(result.retryable).toBe(true);
  });

  it("classifies timeout errors as network/retryable", () => {
    const timeoutError = new Error("Request timeout");
    const result = classifyError(timeoutError);
    expect(result.errorType).toBe("network");
    expect(result.code).toBe(ErrorCodes.NETWORK_TIMEOUT);
    expect(result.retryable).toBe(true);
  });

  it("classifies quota errors as persistence/non-retryable", () => {
    const quotaError = new Error("QuotaExceededError: Storage quota exceeded");
    const result = classifyError(quotaError);
    expect(result.errorType).toBe("persistence");
    expect(result.code).toBe(ErrorCodes.PERSIST_QUOTA_EXCEEDED);
    expect(result.retryable).toBe(false);
  });

  it("classifies validation errors as non-retryable", () => {
    const validationError = new Error("Invalid input format");
    const result = classifyError(validationError);
    expect(result.errorType).toBe("validation");
    expect(result.retryable).toBe(false);
  });

  it("classifies 401/403 status as auth errors", () => {
    const authError = { status: 401, message: "Unauthorized" };
    const result = classifyError(authError);
    expect(result.errorType).toBe("auth");
    expect(result.code).toBe(ErrorCodes.AUTH_UNAUTHORIZED);
    expect(result.retryable).toBe(false);
  });

  it("classifies 429 status as rate limited (retryable)", () => {
    const rateLimitError = { status: 429, message: "Too many requests" };
    const result = classifyError(rateLimitError);
    expect(result.errorType).toBe("network");
    expect(result.code).toBe(ErrorCodes.NETWORK_RATE_LIMITED);
    expect(result.retryable).toBe(true);
  });

  it("classifies 5xx status as server error (retryable)", () => {
    const serverError = { status: 500, message: "Internal server error" };
    const result = classifyError(serverError);
    expect(result.errorType).toBe("network");
    expect(result.code).toBe(ErrorCodes.NETWORK_SERVER_ERROR);
    expect(result.retryable).toBe(true);
  });

  it("classifies 4xx status as validation error", () => {
    const clientError = { status: 400, message: "Bad request" };
    const result = classifyError(clientError);
    expect(result.errorType).toBe("validation");
    expect(result.retryable).toBe(false);
  });
});

describe("createAppError", () => {
  it("creates an AppError with all fields", () => {
    const error = createAppError({
      code: ErrorCodes.IMPORT_PERSIST_FAILED,
      message: "Failed to save",
      hint: "Try again",
      retryable: true,
      errorType: "persistence",
    });

    expect(error.code).toBe(ErrorCodes.IMPORT_PERSIST_FAILED);
    expect(error.message).toBe("Failed to save");
    expect(error.hint).toBe("Try again");
    expect(error.retryable).toBe(true);
    expect(error.errorType).toBe("persistence");
    expect(error.timestamp).toBeGreaterThan(0);
  });

  it("infers classification from cause if not provided", () => {
    const networkError = new TypeError("Failed to fetch");
    const error = createAppError({
      code: ErrorCodes.NETWORK_OFFLINE,
      message: "Network error",
      cause: networkError,
    });

    expect(error.retryable).toBe(true);
    expect(error.errorType).toBe("network");
    expect(error.cause).toBe(networkError);
  });
});

describe("toUserFacingError", () => {
  it("returns existing AppError unchanged", () => {
    const appError = createAppError({
      code: ErrorCodes.VALIDATION_EMPTY_INPUT,
      message: "Input required",
      retryable: false,
      errorType: "validation",
    });

    const result = toUserFacingError(appError);
    expect(result).toBe(appError);
  });

  it("converts unknown error to user-facing AppError", () => {
    const rawError = new Error("Some internal error");
    const result = toUserFacingError(rawError);

    expect(result.code).toBeDefined();
    expect(result.message).toBeDefined();
    expect(result.timestamp).toBeGreaterThan(0);
    expect(result.cause).toBe(rawError);
  });

  it("provides user-friendly message for network errors", () => {
    const networkError = new TypeError("Failed to fetch");
    const result = toUserFacingError(networkError);

    expect(result.message).toContain("Network");
    expect(result.hint).toBeDefined();
  });
});

describe("isAppError", () => {
  it("returns true for valid AppError", () => {
    const appError = createAppError({
      code: "TEST",
      message: "Test",
      retryable: false,
      errorType: "unexpected",
    });
    expect(isAppError(appError)).toBe(true);
  });

  it("returns false for plain objects", () => {
    expect(isAppError({ message: "test" })).toBe(false);
    expect(isAppError({})).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
    expect(isAppError("error")).toBe(false);
    expect(isAppError(123)).toBe(false);
  });
});
