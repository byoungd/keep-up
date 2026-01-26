export type DiscoveryProperty = {
  key: string;
  value: string;
};

export type DiscoveredService = {
  fullname: string;
  host: string;
  port: number;
  addresses: string[];
  properties: DiscoveryProperty[];
};

export interface NativeDiscoveryBinding extends Record<string, unknown> {
  browseOnce: (serviceType: string, timeoutMs: number) => DiscoveredService[];
  startAdvertisement: (
    serviceType: string,
    instanceName: string,
    port: number,
    properties?: DiscoveryProperty[]
  ) => string;
  stopAdvertisement: (advertisementId: string) => boolean;
}
