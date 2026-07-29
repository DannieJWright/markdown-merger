import { describe, expect, it } from "bun:test";

describe("plugin initialization", () => {
  it("plugin exports mdMergerPlugin as an async function", async () => {
    const plugin = await import("../src/index");
    expect(plugin.mdMergerPlugin).toBeDefined();
    expect(typeof plugin.mdMergerPlugin).toBe("function");
  });

  it("plugin returns hooks object on success", async () => {
    const plugin = await import("../src/index");
    const hooks = await plugin.mdMergerPlugin({} as any);
    expect(hooks).toBeDefined();
    expect(typeof hooks).toBe("object");
  });
});
