export interface NativeJsonAccel {
  stringify: (value: unknown) => string;
  parse: (text: string) => unknown;
  stableStringify: (value: unknown) => string;
}
