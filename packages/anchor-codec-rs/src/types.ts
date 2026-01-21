export type NativeAnchorCodecBinding = {
  hmacSha256: (key: Uint8Array, message: Uint8Array) => Uint8Array;
  crc32: (data: Uint8Array) => Uint8Array;
  verifyCrc32: (data: Uint8Array, expected: Uint8Array) => boolean;
  adler32: (input: string) => string;
};
