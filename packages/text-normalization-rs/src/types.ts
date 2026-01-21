export type CanonicalResult = {
  blocks: string[];
  canonicalText: string;
};

export type CanonicalBlockInput = {
  text: string;
};

export type CanonicalHashResult = {
  docHash: string;
  blockHashes: string[];
};

export type NativeTextNormalizationBinding = {
  canonicalizeText: (text: string) => CanonicalResult;
  computeCanonicalHash: (blocks: CanonicalBlockInput[]) => CanonicalHashResult;
};
