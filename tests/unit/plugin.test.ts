import { describe, expect, it, mock } from "bun:test";

// Mock md-merger module to avoid hitting the real filesystem
mock.module("md-merger", () => ({
  loadConfig: mock(async () => ({ maxInheritDepth: 5, storeFile: "prompts.jsonl", emitDirs: {}, rootDirs: [] })),
  emitAll: mock(async () => []),
  DEFAULT_CONFIG: { maxInheritDepth: 5, storeFile: "prompts.jsonl", emitDirs: {}, rootDirs: [] },
}));

describe("plugin initialization", () => {
  it("plugin exports mdMergerPlugin as an async function", async () => {
    const plugin = await import("../../opencode-plugin/src/index");
    expect(plugin.mdMergerPlugin).toBeDefined();
    expect(typeof plugin.mdMergerPlugin).toBe("function");
  });

  it("plugin returns hooks object on success", async () => {
    const plugin = await import("../../opencode-plugin/src/index");
    const hooks = await plugin.mdMergerPlugin({} as any);
    expect(hooks).toBeDefined();
    expect(typeof hooks).toBe("object");
  });
});
