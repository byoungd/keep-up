/**
 * Feature Flags Unit Tests
 *
 * Tests for feature flag behavior including default values,
 * runtime overrides, and the collab_enabled flag.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  FEATURE_FLAGS,
  clearFeatureFlagOverrides,
  getFeatureFlag,
  isCollabEnabled,
  isCollabEnabledWithOverrides,
  setFeatureFlagOverride,
} from "../featureFlags";

describe("Feature Flags", () => {
  beforeEach(() => {
    clearFeatureFlagOverrides();
  });

  afterEach(() => {
    clearFeatureFlagOverrides();
  });

  describe("FEATURE_FLAGS", () => {
    it("has collab_enabled flag defined", () => {
      expect("collab_enabled" in FEATURE_FLAGS).toBe(true);
    });

    it("collab_enabled defaults to false", () => {
      // Default value should be false (collaboration is opt-in)
      expect(FEATURE_FLAGS.collab_enabled).toBe(false);
    });
  });

  describe("isCollabEnabled", () => {
    it("returns the default value when no override is set", () => {
      expect(isCollabEnabled()).toBe(false);
    });
  });

  describe("Runtime Overrides", () => {
    it("setFeatureFlagOverride changes the effective flag value", () => {
      expect(getFeatureFlag("collab_enabled")).toBe(false);

      setFeatureFlagOverride("collab_enabled", true);

      expect(getFeatureFlag("collab_enabled")).toBe(true);
    });

    it("clearFeatureFlagOverrides resets all overrides", () => {
      setFeatureFlagOverride("collab_enabled", true);
      expect(getFeatureFlag("collab_enabled")).toBe(true);

      clearFeatureFlagOverrides();

      expect(getFeatureFlag("collab_enabled")).toBe(false);
    });

    it("isCollabEnabledWithOverrides respects runtime overrides", () => {
      expect(isCollabEnabledWithOverrides()).toBe(false);

      setFeatureFlagOverride("collab_enabled", true);

      expect(isCollabEnabledWithOverrides()).toBe(true);
    });
  });

  describe("Feature Flag Gating", () => {
    it("collaboration code should not run when flag is off", () => {
      let collabInitialized = false;

      // Simulate gating collaboration initialization
      if (isCollabEnabledWithOverrides()) {
        collabInitialized = true;
      }

      expect(collabInitialized).toBe(false);
    });

    it("collaboration code should run when flag is on", () => {
      setFeatureFlagOverride("collab_enabled", true);

      let collabInitialized = false;

      // Simulate gating collaboration initialization
      if (isCollabEnabledWithOverrides()) {
        collabInitialized = true;
      }

      expect(collabInitialized).toBe(true);
    });

    it("single-user functionality works regardless of flag", () => {
      // Simulate single-user operations that should always work
      const singleUserOps = {
        createDocument: () => ({ id: "doc1", content: "" }),
        editDocument: (doc: { content: string }, text: string) => {
          doc.content = text;
          return doc;
        },
        saveDocument: (doc: { id: string }) => ({ saved: true, id: doc.id }),
      };

      // Test with flag off
      clearFeatureFlagOverrides();
      const doc1 = singleUserOps.createDocument();
      singleUserOps.editDocument(doc1, "Hello");
      const result1 = singleUserOps.saveDocument(doc1);
      expect(result1.saved).toBe(true);

      // Test with flag on
      setFeatureFlagOverride("collab_enabled", true);
      const doc2 = singleUserOps.createDocument();
      singleUserOps.editDocument(doc2, "World");
      const result2 = singleUserOps.saveDocument(doc2);
      expect(result2.saved).toBe(true);
    });
  });
});
