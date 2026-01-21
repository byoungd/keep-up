export type NativeAiContextHashBinding = {
  sha256Hex: (input: string) => string;
  sha256HexBatch?: (inputs: string[]) => string[];
};
