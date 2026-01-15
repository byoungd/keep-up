import type { Context } from "hono";
import type { ZodError } from "zod";

export async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export function jsonError(c: Context, status: number, message: string, details?: unknown) {
  return c.json(
    {
      ok: false,
      error: {
        message,
        details,
      },
    },
    // biome-ignore lint/suspicious/noExplicitAny: Hono StatusCode type is complex to import here
    status as any
  );
}

export function formatZodError(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
