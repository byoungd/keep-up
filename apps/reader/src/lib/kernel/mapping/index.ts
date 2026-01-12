/**
 * LFCC v0.9 RC Block Mapping Specification
 * Maps coordinates between different versions of a block.
 */

export interface BlockMapping {
  blockId: string;
  sourceVersion: string;
  targetVersion: string;

  // map(offset: number) -> number | null (if lost)
  map: (offset: number) => number | null;
}

export function createIdentityMapping(blockId: string): BlockMapping {
  return {
    blockId,
    sourceVersion: "latest",
    targetVersion: "latest",
    map: (offset) => offset,
  };
}
