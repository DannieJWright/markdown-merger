import { join, isAbsolute } from "node:path";
import { DEFAULT_CONFIG } from "./types";
import type { Config, RootDir } from "./types";

export function getConfigPath(): string {
  const env = process.env.MD_MERGER_CONFIG;
  if (env) return env;
  return ".md-merger/config.yaml";
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
  const resolvedPath = isAbsolute(configPath) || configPath.startsWith("http")
    ? configPath
    : join(process.cwd(), configPath);

  let parsed: Record<string, unknown> = {};

  try {
    const text = await Bun.file(resolvedPath).text();
    const lines = text.split("\n");

    let pendingKey: string | null = null;
    let pendingArray: string[] = [];
    let pendingObject: Record<string, string> | null = null;

    function flushPending(): void {
      if (pendingKey !== null) {
        if (pendingObject !== null) {
          parsed[pendingKey] = pendingObject;
          pendingObject = null;
        } else if (pendingArray.length > 0) {
          parsed[pendingKey] = pendingArray;
        }
        pendingKey = null;
        pendingArray = [];
      }
    }

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const indentLevel = rawLine.search(/\S/);

      // Indented lines — check BEFORE flush (handles both arrays and objects)
      if (indentLevel > 0 && pendingKey !== null) {
        // List item continuation (starts with - at indented level)
        if (trimmed.startsWith("- ")) {
          pendingArray.push(trimmed.slice(2).trim());
          continue;
        }

        // Indented key-value pair (nested object)
        const indentedKeyValue = trimmed.match(/^(\S+):\s*(.+)$/);
        if (indentedKeyValue) {
          if (pendingObject === null) {
            pendingObject = {};
          }
          pendingObject[indentedKeyValue[1]!] = indentedKeyValue[2]!.trim();
          continue;
        }
      }

      // Top-level key — flush pending before starting new key
      flushPending();

      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      let valueStr = trimmed.slice(colonIdx + 1).trim();

      if (valueStr === "") {
        pendingKey = key;
        pendingArray = [];
        continue;
      }

      parsed[key] = parseYamlScalar(valueStr);
    }

    flushPending();

    // Migration warning: detect old emitDir format
    if (typeof parsed.emitDir === "string") {
      console.warn(
        "Config uses deprecated 'emitDir'. Replace with 'emitDirs: { default: <path> }'."
      );
    }
  } catch {
    // File may not exist; fall back to defaults
  }

  const rootDirSources: RootDir[] = Array.isArray(parsed.rootDirs)
    ? parsed.rootDirs.filter((root): root is string => typeof root === "string").map((root) => ({ path: root, optional: !isAbsolute(root) }))
    : DEFAULT_CONFIG.rootDirs.map((rootDir) => ({ ...rootDir }));
  const config: Config = {
    project: typeof parsed.project === "string" ? parsed.project : "default",
    version: typeof parsed.version === "string" ? parsed.version : "1",
    ...DEFAULT_CONFIG,
    ...parsed,
    emitDirs: parsed.emitDirs && typeof parsed.emitDirs === "object"
      ? { ...(parsed.emitDirs as Record<string, string>) }
      : { ...DEFAULT_CONFIG.emitDirs },
    rootDirs: rootDirSources,
  };

  if (!isAbsolute(config.storeFile)) config.storeFile = join(process.cwd(), config.storeFile);

  const emitDirs = config.emitDirs;
  for (const typeKey of Object.keys(emitDirs)) {
    const dir = emitDirs[typeKey];
    if (dir && !isAbsolute(dir)) {
      emitDirs[typeKey] = join(process.cwd(), dir);
    }
  }

  config.rootDirs = rootDirSources.map((rootDir): RootDir => ({
    path: isAbsolute(rootDir.path) ? rootDir.path : join(process.cwd(), rootDir.path),
    optional: rootDir.optional,
  }));

  return config;
}
