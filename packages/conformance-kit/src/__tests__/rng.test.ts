/**
 * LFCC Conformance Kit - RNG Tests
 */

import { describe, expect, it } from "vitest";
import {
  createRng,
  nextBool,
  nextFloat,
  nextInt,
  nextString,
  selectMany,
  selectOne,
  selectWeighted,
  shuffle,
} from "../op-fuzzer/rng";

describe("RNG", () => {
  describe("createRng", () => {
    it("should create RNG from seed", () => {
      const rng = createRng(12345);
      expect(rng.s0).toBeDefined();
      expect(rng.s1).toBeDefined();
    });
  });

  describe("nextFloat", () => {
    it("should be deterministic", () => {
      const rng1 = createRng(42);
      const rng2 = createRng(42);
      const { value: v1 } = nextFloat(rng1);
      const { value: v2 } = nextFloat(rng2);
      expect(v1).toBe(v2);
    });

    it("should generate values in [0, 1)", () => {
      let rng = createRng(42);
      for (let i = 0; i < 100; i++) {
        const { value, rng: newRng } = nextFloat(rng);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
        rng = newRng;
      }
    });
  });

  describe("nextInt", () => {
    it("should generate integers in range", () => {
      let rng = createRng(42);
      for (let i = 0; i < 50; i++) {
        const { value, rng: newRng } = nextInt(rng, 5, 10);
        expect(value).toBeGreaterThanOrEqual(5);
        expect(value).toBeLessThanOrEqual(10);
        expect(Number.isInteger(value)).toBe(true);
        rng = newRng;
      }
    });
  });

  describe("nextBool", () => {
    it("should generate booleans", () => {
      let rng = createRng(42);
      let trueCount = 0;
      for (let i = 0; i < 100; i++) {
        const { value, rng: newRng } = nextBool(rng, 0.5);
        if (value) {
          trueCount++;
        }
        rng = newRng;
      }
      // Should be roughly 50% true
      expect(trueCount).toBeGreaterThan(30);
      expect(trueCount).toBeLessThan(70);
    });
  });

  describe("nextString", () => {
    it("should generate string of specified length", () => {
      const rng = createRng(42);
      const { value } = nextString(rng, 10);
      expect(value.length).toBe(10);
    });

    it("should be deterministic", () => {
      const rng1 = createRng(42);
      const rng2 = createRng(42);
      const { value: s1 } = nextString(rng1, 20);
      const { value: s2 } = nextString(rng2, 20);
      expect(s1).toBe(s2);
    });
  });

  describe("selectOne", () => {
    it("should select element from array", () => {
      const rng = createRng(42);
      const arr = ["a", "b", "c", "d", "e"];
      const { value } = selectOne(rng, arr);
      expect(arr).toContain(value);
    });

    it("should return undefined for empty array", () => {
      const rng = createRng(42);
      const { value } = selectOne(rng, []);
      expect(value).toBeUndefined();
    });
  });

  describe("selectMany", () => {
    it("should select multiple elements", () => {
      const rng = createRng(42);
      const arr = [1, 2, 3, 4, 5];
      const { value } = selectMany(rng, arr, 3);
      expect(value.length).toBe(3);
      // All should be from original array
      for (const v of value) {
        expect(arr).toContain(v);
      }
    });

    it("should not exceed array length", () => {
      const rng = createRng(42);
      const arr = [1, 2, 3];
      const { value } = selectMany(rng, arr, 10);
      expect(value.length).toBe(3);
    });
  });

  describe("selectWeighted", () => {
    it("should select based on weights", () => {
      let rng = createRng(42);
      const items = [
        { item: "rare", weight: 1 },
        { item: "common", weight: 99 },
      ];

      let commonCount = 0;
      for (let i = 0; i < 100; i++) {
        const { value, rng: newRng } = selectWeighted(rng, items);
        if (value === "common") {
          commonCount++;
        }
        rng = newRng;
      }

      // Common should be selected most of the time
      expect(commonCount).toBeGreaterThan(80);
    });
  });

  describe("shuffle", () => {
    it("should shuffle array", () => {
      const rng = createRng(42);
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const { value } = shuffle(rng, arr);

      // Same elements
      expect(value.sort()).toEqual(arr.sort());

      // Should be different order (with high probability)
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      let samePosition = 0;
      for (let i = 0; i < value.length; i++) {
        if (value[i] === original[i]) {
          samePosition++;
        }
      }
      expect(samePosition).toBeLessThan(original.length);
    });

    it("should be deterministic", () => {
      const rng1 = createRng(42);
      const rng2 = createRng(42);
      const arr = [1, 2, 3, 4, 5];
      const { value: s1 } = shuffle(rng1, arr);
      const { value: s2 } = shuffle(rng2, arr);
      expect(s1).toEqual(s2);
    });
  });
});
