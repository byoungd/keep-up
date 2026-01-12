export type WebCryptoAdapter = {
  status: "not_configured";
};

export function createWebCryptoAdapter(): WebCryptoAdapter {
  throw new Error("TODO: implement web crypto adapter");
}
