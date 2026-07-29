// src/api.ts — public library API surface for @md-merger/opencode-plugin

export { loadConfig, getConfigPath } from "./config";
export { emitAll } from "./emit";
export type { Config } from "./types";
export { DEFAULT_CONFIG, DEFAULT_MAX_INHERIT_DEPTH } from "./types";
export { parseCliArgs, run, type CliArgs } from "./cli";
