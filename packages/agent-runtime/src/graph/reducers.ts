/**
 * Graph Channel Reducers
 */

import type { ChannelReducer } from "./types";

export const replaceReducer = <T>(_: T | undefined, update: T): T => update;

export const arrayAppendReducer = <T>(
  current: readonly T[] | undefined,
  update: readonly T[]
): readonly T[] => {
  if (!current) {
    return [...update];
  }
  return [...current, ...update];
};

export const mergeReducer = <T extends Record<string, unknown>>(
  current: T | undefined,
  update: T
): T => {
  return {
    ...(current ?? {}),
    ...update,
  };
};

export const sumReducer: ChannelReducer<number> = (current, update) => {
  return (current ?? 0) + update;
};
