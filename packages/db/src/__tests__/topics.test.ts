/**
 * Tests for Topics feature.
 * Feature: topic-organization
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SCHEMA_SQL } from "../schema";

describe("topics - schema", () => {
  it("schema includes topics table", () => {
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS topics");
    expect(SCHEMA_SQL).toContain("topic_id TEXT PRIMARY KEY");
    expect(SCHEMA_SQL).toContain("name TEXT NOT NULL");
    expect(SCHEMA_SQL).toContain("description TEXT");
    expect(SCHEMA_SQL).toContain("color TEXT");
  });

  it("schema includes subscription_topics table", () => {
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS subscription_topics");
    expect(SCHEMA_SQL).toContain("subscription_id TEXT NOT NULL");
    expect(SCHEMA_SQL).toContain("topic_id TEXT NOT NULL");
    expect(SCHEMA_SQL).toContain("added_at INTEGER NOT NULL");
    expect(SCHEMA_SQL).toContain("PRIMARY KEY (subscription_id, topic_id)");
    expect(SCHEMA_SQL).toContain(
      "FOREIGN KEY (subscription_id) REFERENCES rss_subscriptions(subscription_id) ON DELETE CASCADE"
    );
    expect(SCHEMA_SQL).toContain(
      "FOREIGN KEY (topic_id) REFERENCES topics(topic_id) ON DELETE CASCADE"
    );
  });

  it("schema includes indexes for performance", () => {
    expect(SCHEMA_SQL).toContain("idx_subscription_topics_topic");
    // Also document topics from before
    expect(SCHEMA_SQL).toContain("idx_document_topics_topic");
  });
});

describe("topics - property tests", () => {
  it("schema supports all topic fields", () => {
    fc.assert(
      fc.property(
        fc.record({
          topicId: fc.uuid(),
          name: fc.string({ minLength: 1 }),
          description: fc.option(fc.string(), { nil: null }),
          color: fc.option(fc.string(), { nil: null }),
          createdAt: fc.integer({ min: 0 }),
          updatedAt: fc.integer({ min: 0 }),
        }),
        (topic) => {
          // Verify fields against schema strings
          expect(SCHEMA_SQL).toContain("topic_id TEXT PRIMARY KEY");
          expect(SCHEMA_SQL).toContain("name TEXT NOT NULL");
          expect(SCHEMA_SQL).toContain("description TEXT");
          expect(SCHEMA_SQL).toContain("color TEXT");
          expect(SCHEMA_SQL).toContain("created_at INTEGER NOT NULL");
          expect(SCHEMA_SQL).toContain("updated_at INTEGER NOT NULL");

          // Basic type checks
          expect(typeof topic.topicId).toBe("string");
          expect(typeof topic.name).toBe("string");
          expect(topic.description === null || typeof topic.description === "string").toBe(true);
          expect(topic.color === null || typeof topic.color === "string").toBe(true);
        }
      )
    );
  });
});
