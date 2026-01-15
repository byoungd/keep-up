import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonStore } from "../storage/jsonStore";

type Item = {
  id: string;
  value: string;
};

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "cowork-json-store-"));
  const store = new JsonStore<Item>({
    filePath: join(dir, "items.json"),
    idKey: "id",
    fallback: [],
  });
  return { dir, store };
}

describe("JsonStore", () => {
  it("upserts and reads items", async () => {
    const { dir, store } = await createStore();

    await store.upsert({ id: "one", value: "alpha" });
    await store.upsert({ id: "two", value: "beta" });

    const items = await store.getAll();
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe("two");

    await rm(dir, { recursive: true, force: true });
  });

  it("updates and deletes items", async () => {
    const { dir, store } = await createStore();

    await store.upsert({ id: "one", value: "alpha" });
    const updated = await store.update("one", (item) => ({ ...item, value: "gamma" }));

    expect(updated?.value).toBe("gamma");

    const removed = await store.delete("one");
    expect(removed).toBe(true);

    const items = await store.getAll();
    expect(items).toHaveLength(0);

    await rm(dir, { recursive: true, force: true });
  });
});
