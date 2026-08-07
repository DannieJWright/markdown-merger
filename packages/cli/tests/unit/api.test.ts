import { describe, expect, it } from "bun:test";
import * as api from "../../src/api";

describe("api.ts exports", () => {
  it("exports loadConfig as a function", () => {
    expect(typeof api.loadConfig).toBe("function");
  });

  it("exports getConfigPath as a function", () => {
    expect(typeof api.getConfigPath).toBe("function");
  });

  it("exports emitAll as a function", () => {
    expect(typeof api.emitAll).toBe("function");
  });

  it("exports DEFAULT_CONFIG with expected keys", () => {
    expect(api.DEFAULT_CONFIG).toHaveProperty("maxInheritDepth");
    expect(api.DEFAULT_CONFIG).toHaveProperty("storeFile");
    expect(api.DEFAULT_CONFIG).toHaveProperty("emitDirs");
    expect(api.DEFAULT_CONFIG).toHaveProperty("rootDirs");
  });

  it("exports DEFAULT_MAX_INHERIT_DEPTH as a number", () => {
    expect(typeof api.DEFAULT_MAX_INHERIT_DEPTH).toBe("number");
  });
});
