export type WebCryptoAdapter =
  | {
      status: "available";
      subtle: SubtleCrypto;
      getRandomValues: Crypto["getRandomValues"];
    }
  | {
      status: "unavailable";
    };

export function createWebCryptoAdapter(): WebCryptoAdapter {
  if (typeof globalThis === "undefined") {
    return { status: "unavailable" };
  }
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || !cryptoApi.subtle || typeof cryptoApi.getRandomValues !== "function") {
    return { status: "unavailable" };
  }
  return {
    status: "available",
    subtle: cryptoApi.subtle,
    getRandomValues: cryptoApi.getRandomValues.bind(cryptoApi),
  };
}
