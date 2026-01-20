import type { Lesson, LessonProfile, LessonScope, LessonStore } from "@ku0/agent-runtime";
import { Hono } from "hono";
import { z } from "zod";
import { formatZodError, jsonError, readJsonBody } from "../http";

interface LessonRouteDeps {
  lessonStore: LessonStore;
}

const scopeSchema = z.enum(["project", "global"]);
const profileSchema = z.enum(["default", "strict-reviewer", "creative-prototyper"]);

const lessonCreateSchema = z.object({
  trigger: z.string().min(1),
  rule: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  scope: scopeSchema.optional(),
  projectId: z.string().min(1).optional(),
  profile: profileSchema.optional(),
});

const lessonUpdateSchema = z.object({
  trigger: z.string().min(1).optional(),
  rule: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  scope: scopeSchema.optional(),
  projectId: z.string().min(1).optional(),
  profile: profileSchema.optional(),
});

type PublicLesson = Omit<Lesson, "embedding">;

export function createLessonRoutes(deps: LessonRouteDeps) {
  const app = new Hono();

  app.get("/lessons", async (c) => {
    const projectId = c.req.query("projectId") ?? undefined;
    const scopeParam = c.req.query("scope") ?? undefined;
    const profileParam = c.req.query("profile") ?? undefined;
    const query = c.req.query("q") ?? undefined;
    const minConfidence = parseNumber(c.req.query("minConfidence"));
    const limit = parseNumber(c.req.query("limit"));

    const scopes = parseScopes(scopeParam);
    const profiles = parseProfiles(profileParam);

    if (query?.trim()) {
      const results = await deps.lessonStore.search(query, {
        projectId,
        scopes,
        profiles,
        minConfidence,
        limit,
      });
      return c.json({
        ok: true,
        results: results.map((result) => ({
          score: result.score,
          lesson: toPublicLesson(result.lesson),
        })),
      });
    }

    const lessons = await deps.lessonStore.list({
      projectId,
      scopes,
      profiles,
      minConfidence,
      limit,
    });
    return c.json({ ok: true, lessons: lessons.map(toPublicLesson) });
  });

  app.post("/lessons", async (c) => {
    const body = await readJsonBody(c);
    const parsed = lessonCreateSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid lesson payload", formatZodError(parsed.error));
    }
    const lesson = await deps.lessonStore.add({
      ...parsed.data,
      scope: parsed.data.scope ?? (parsed.data.projectId ? "project" : "global"),
      profile: parsed.data.profile ?? "default",
      source: "manual",
    });
    return c.json({ ok: true, lesson: toPublicLesson(lesson) }, 201);
  });

  app.put("/lessons/:lessonId", async (c) => {
    const lessonId = c.req.param("lessonId");
    const body = await readJsonBody(c);
    const parsed = lessonUpdateSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid lesson payload", formatZodError(parsed.error));
    }
    const updated = await deps.lessonStore.update(lessonId, parsed.data);
    if (!updated) {
      return jsonError(c, 404, "Lesson not found");
    }
    return c.json({ ok: true, lesson: toPublicLesson(updated) });
  });

  app.delete("/lessons/:lessonId", async (c) => {
    const lessonId = c.req.param("lessonId");
    const deleted = await deps.lessonStore.delete(lessonId);
    if (!deleted) {
      return jsonError(c, 404, "Lesson not found");
    }
    return c.json({ ok: true });
  });

  return app;
}

function toPublicLesson(lesson: Lesson): PublicLesson {
  const { embedding, ...rest } = lesson;
  return rest;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseScopes(value: string | undefined): LessonScope[] | undefined {
  if (!value) {
    return undefined;
  }
  const scopes = value.split(",").map((v) => v.trim()) as LessonScope[];
  return scopes.filter((scope) => scope === "project" || scope === "global");
}

function parseProfiles(value: string | undefined): LessonProfile[] | undefined {
  if (!value) {
    return undefined;
  }
  const profiles = value.split(",").map((v) => v.trim()) as LessonProfile[];
  return profiles.filter(
    (profile) =>
      profile === "default" || profile === "strict-reviewer" || profile === "creative-prototyper"
  );
}
