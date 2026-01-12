import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { enableTestMode, isTestMode, track, trackNotFound, trackPageView } from "../track";

describe("analytics tracking", () => {
  let testMode: ReturnType<typeof enableTestMode>;

  beforeEach(() => {
    testMode = enableTestMode();
  });

  afterEach(() => {
    testMode.disable();
  });

  describe("enableTestMode", () => {
    it("enables test mode", () => {
      expect(isTestMode()).toBe(true);
    });

    it("stores tracked events", () => {
      track({ name: "page_viewed", page: "/test" });
      expect(testMode.getEvents()).toHaveLength(1);
      expect(testMode.getEvents()[0]).toEqual({ name: "page_viewed", page: "/test" });
    });

    it("clears events", () => {
      track({ name: "page_viewed", page: "/test" });
      testMode.clear();
      expect(testMode.getEvents()).toHaveLength(0);
    });

    it("disables test mode", () => {
      testMode.disable();
      expect(isTestMode()).toBe(false);
    });
  });

  describe("track", () => {
    it("tracks import events", () => {
      track({
        name: "import_succeeded",
        sourceType: "url",
        contentLengthBucket: "medium",
        durationMs: 1234,
      });

      const events = testMode.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        name: "import_succeeded",
        sourceType: "url",
        contentLengthBucket: "medium",
        durationMs: 1234,
      });
    });

    it("tracks reader events", () => {
      track({
        name: "reader_opened",
        entryPoint: "unread",
        hasContent: true,
      });

      const events = testMode.getEvents();
      expect(events[0]).toMatchObject({
        name: "reader_opened",
        entryPoint: "unread",
        hasContent: true,
      });
    });

    it("tracks AI events", () => {
      track({
        name: "ai_question_asked",
        hasContext: true,
      });

      track({
        name: "ai_answer_returned",
        hasContext: true,
        durationMs: 500,
      });

      const events = testMode.getEvents();
      expect(events).toHaveLength(2);
      expect(events[0].name).toBe("ai_question_asked");
      expect(events[1].name).toBe("ai_answer_returned");
    });

    it("tracks error events", () => {
      track({
        name: "import_failed",
        sourceType: "paste",
        errorType: "network",
        code: "NETWORK_OFFLINE",
        retryable: true,
      });

      const events = testMode.getEvents();
      expect(events[0]).toMatchObject({
        name: "import_failed",
        errorType: "network",
        retryable: true,
      });
    });
  });

  describe("trackPageView", () => {
    it("tracks page view with correct structure", () => {
      trackPageView("/unread");

      const events = testMode.getEvents();
      expect(events[0]).toEqual({
        name: "page_viewed",
        page: "/unread",
      });
    });
  });

  describe("trackNotFound", () => {
    it("tracks 404 with attempted path", () => {
      trackNotFound("/invalid-route");

      const events = testMode.getEvents();
      expect(events[0]).toEqual({
        name: "not_found_viewed",
        attemptedPath: "/invalid-route",
      });
    });
  });
});
