// src/api.ts — public library API surface for @md-merger/opencode-plugin

export { loadConfig, getConfigPath } from "./config";
export { emitAll, emitAllWithMetadata } from "./emit";
export type { EmittedFile } from "./emit";
export { build } from "./import";
export type { BuildResult } from "./import";
export type { Config } from "./types";
export { DEFAULT_CONFIG, DEFAULT_MAX_INHERIT_DEPTH } from "./types";
export { parseCliArgs, run, type CliArgs } from "./cli";
