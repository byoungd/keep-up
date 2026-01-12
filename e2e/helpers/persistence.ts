import type { Page } from "@playwright/test";

export type PersistedDocMeta = { updatedAt: number; snapshotLength: number };

export async function getPersistedDocMeta(
  page: Page,
  docId: string
): Promise<PersistedDocMeta | null> {
  return page.evaluate((id) => {
    return new Promise<PersistedDocMeta | null>((resolve) => {
      const request = indexedDB.open("lfcc-reader-db", 3);
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("docs", "readonly");
        const store = tx.objectStore("docs");
        const getRequest = store.get(id as string);
        getRequest.onsuccess = () => {
          const entry = getRequest.result as
            | { updatedAt?: number; snapshot?: Uint8Array }
            | undefined;
          const snapshotLength = entry?.snapshot?.byteLength ?? 0;
          db.close();
          resolve(entry ? { updatedAt: entry.updatedAt ?? 0, snapshotLength } : null);
        };
        getRequest.onerror = () => {
          db.close();
          resolve(null);
        };
      };
    });
  }, docId);
}

export async function waitForPersistedDoc(
  page: Page,
  docId: string,
  minUpdatedAt = 0,
  timeoutMs = 5000,
  minSnapshotLength = 0
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const meta = await getPersistedDocMeta(page, docId).catch(() => null);
    if (meta && meta.snapshotLength > minSnapshotLength && meta.updatedAt > minUpdatedAt) {
      return;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for persisted doc ${docId}`);
}
