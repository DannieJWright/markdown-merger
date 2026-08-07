import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { loadConfig, build, emitAllWithMetadata } from "@md-merger/cli";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const packageDefaultsDir = join(moduleDir, "..", "defaults");

export async function discoverDefaultRoots(defaultsDir: string): Promise<string[]> {
  if (!existsSync(defaultsDir)) return [];
  const entries = await readdir(defaultsDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory())
    .map((entry) => join(defaultsDir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function toAgentKey(agentRoot: string, emittedPath: string): string | undefined {
  const relativePath = relative(agentRoot, emittedPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) return undefined;
  return relativePath.split(sep).join("/").replace(/\.md$/, "");
}

export function createMdMergerPlugin(defaultsDir: string): Plugin {
  return async (input: PluginInput) => {
    const previousCwd = process.cwd();
    try {
      if (input.directory) process.chdir(input.directory);
      const config = await loadConfig();
      const rootDirs = [...await discoverDefaultRoots(defaultsDir), ...config.rootDirs];
      await build(rootDirs, config.storeFile, config.project);
      const emittedFiles = await emitAllWithMetadata(config.storeFile, config.emitDirs, config, false);
      const agentPrompts = new Map<string, string>();
      if (config.emitDirs.agent !== undefined) {
        const agentRoot = resolve(config.emitDirs.agent);
        for (const emittedFile of emittedFiles) {
          if (emittedFile.type !== "agent") continue;
          const key = toAgentKey(agentRoot, resolve(emittedFile.path));
          if (key === undefined) continue;
          try { agentPrompts.set(key, await readFile(resolve(emittedFile.path), "utf-8")); }
          catch { console.warn(`[md-merger] Failed to read emitted agent: ${emittedFile.path}`); }
        }
      }
      return { config: async (opencodeConfig: Record<string, unknown>) => {
        if (agentPrompts.size === 0) return;
        if (opencodeConfig.agent === undefined) opencodeConfig.agent = {};
        const agents = opencodeConfig.agent as Record<string, unknown>;
        for (const [key, prompt] of agentPrompts) agents[key] = { prompt };
      } };
    } catch (err) {
      console.error("[md-merger] Plugin initialization failed:", err);
      return {};
    } finally { process.chdir(previousCwd); }
  };
}

export const mdMergerPlugin: Plugin = createMdMergerPlugin(packageDefaultsDir);
