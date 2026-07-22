import { join, dirname } from "node:path";
import { DEFAULT_CONFIG } from "./types";
import type { Config } from "./types";

export function getConfigPath(): string {
  const env = process.env.EVO_CONFIG;
  if (env) return env;
  return ".evo/config.yaml";
}

export function getConfigDir(): string {
  return dirname(getConfigPath());
}

function parseYamlScalar(value: string): unknown {
  // Strip surrounding double quotes
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  // Parse inline array [..., ...]
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1);
    if (inner.trim() === "") return [];
    return inner.split(",").map((s) => s.trim());
  }

  // Parse booleans
  if (value === "true") return true;
  if (value === "false") return false;

  // Parse numbers
  const num = Number(value);
  if (!isNaN(num) && value !== "") return num;

  return value;
}

export async function loadConfig(): Promise<Config> {
  const configPath = getConfigPath();
  // Resolve relative paths against the current working directory
  const resolvedPath = configPath.startsWith("/") || configPath.startsWith("http")
    ? configPath
    : join(process.cwd(), configPath);

  let parsed: Record<string, unknown> = {};

  try {
    const text = await Bun.file(resolvedPath).text();
    const lines = text.split("\n");

    // Track pending key for multi-line array values
    let pendingKey: string | null = null;
    let pendingArray: string[] = [];

    function flushPending(): void {
      if (pendingKey !== null) {
        parsed[pendingKey] = pendingArray;
        pendingKey = null;
        pendingArray = [];
      }
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      // List item continuation (starts with -)
      if (line.startsWith("- ") && pendingKey !== null) {
        pendingArray.push(line.slice(2).trim());
        continue;
      }

      // Flush any pending array before starting a new key
      flushPending();

      // Key: value line
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).trim();
      let valueStr = line.slice(colonIdx + 1).trim();

      if (valueStr === "") {
        // Value on next line(s) — start collecting list items
        pendingKey = key;
        pendingArray = [];
        continue;
      }

      parsed[key] = parseYamlScalar(valueStr);
    }

    // Flush any remaining pending array
    flushPending();
  } catch {
    // File may not exist; fall back to defaults
  }

  // Spread defaults first, overlay parsed values
  const config: Config = {
    ...DEFAULT_CONFIG,
    ...parsed,
  } as Config;

  // Resolve relative paths against config directory
  config.storeFile = join(getConfigDir(), config.storeFile);
  config.emitDir = join(getConfigDir(), config.emitDir);
  config.rootDirs = config.rootDirs.map((d) => join(getConfigDir(), d));

  return config;
}
