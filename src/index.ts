#!/usr/bin/env bun

import { loadConfig, getConfigPath } from "./config";
import { build } from "./import";
import { topologicalSort } from "./resolve";
import { emitAll, renderPromptText } from "./emit";
import { readStore } from "./store";
import type { Config, PromptRecord } from "./types";

const args = process.argv.slice(2);
const cmd = args[0] ?? "help";

async function main(): Promise<void> {
  const config = await loadConfig();
  const storePath = config.storeFile;

  switch (cmd) {
    case "build": {
      await build(config.rootDirs, storePath, config.project);
      console.log(`Built ${config.rootDirs.length} root dir(s) into ${storePath}`);
      break;
    }
    case "emit": {
      const dryRun = args[1] === "--dry-run";
      const paths = await emitAll(storePath, config.emitDir, config, dryRun);
      if (dryRun) {
        console.log(`${paths.length} file(s) would be written to ${config.emitDir}/`);
      } else {
        console.log(`Emitted ${paths.length} file(s) to ${config.emitDir}/`);
      }
      break;
    }
    case "render": {
      const name = args[1];
      if (!name) {
        console.error("Usage: evo render <module>");
        process.exit(1);
      }
      console.log(await renderPromptText(storePath, name, config.maxInheritDepth));
      break;
    }
    case "stats": {
      const allRecords = await readStore(storePath);
      // Deduplicate: only count latest version of each name
      const unique = new Map<string, PromptRecord>();
      for (const r of allRecords) {
        const existing = unique.get(r.name);
        if (!existing || r.version > existing.version) unique.set(r.name, r);
      }
      const records = [...unique.values()];
      const abstract = records.filter(r => r.abstract).length;
      const leaves = records.filter(r => !r.extends?.length).length;
      console.log(`Total: ${records.length}, Abstract: ${abstract}, Leaves: ${leaves}`);
      break;
    }
    case "doctor": {
      const allRecords = await readStore(storePath);
      // Deduplicate: only use latest version of each name
      const unique = new Map<string, PromptRecord>();
      for (const r of allRecords) {
        const existing = unique.get(r.name);
        if (!existing || r.version > existing.version) unique.set(r.name, r);
      }
      const records = [...unique.values()];
      const names = new Set(records.map(r => r.name));
      let errors = 0;
      for (const r of records) {
        if (r.extends) {
          for (const ext of r.extends) {
            if (!names.has(ext)) {
              console.error(`Broken reference: ${r.name} extends ${ext} (not found)`);
              errors++;
            }
          }
        }
      }
      // Cycle detection
      try {
        await topologicalSort(storePath);
      } catch (e) {
        console.error(`Cycle detected: ${(e as Error).message}`);
        errors++;
      }
      if (errors === 0) {
        console.log("Doctor: all references valid.");
      } else {
        console.error(`Doctor: found ${errors} error(s)`);
        process.exit(1);
      }
      break;
    }
    case "config": {
      const subCmd = args[1] ?? "show";
      if (subCmd === "show") {
        console.log(`Config path: ${getConfigPath()}`);
        console.log(JSON.stringify(config, null, 2));
      } else if (subCmd === "set" && args[2] && args[3]) {
        console.error("Config set: not yet implemented (use env var EVO_CONFIG for path)");
        break;
      } else if (subCmd === "unset") {
        console.error("Config unset: not yet implemented");
        break;
      } else {
        console.error("Usage: evo config [show|set|unset]");
        process.exit(1);
      }
      break;
    }
    default: {
      console.log(`Usage: evo <command>

Commands:
  build               Import agent .md files into the JSONL store
  emit [--dry-run]    Resolve and emit merged agent .md files
  render <module>     Resolve and print a single agent
  stats               Show agent counts
  doctor              Validate references and detect cycles
  config [show|set|unset]  Inspect or modify config

Environment:
  EVO_CONFIG          Path to config file (default: .evo/config.yaml)
`);
      if (cmd !== "help" && cmd !== "-h" && cmd !== "--help") {
        console.error(`Unknown command: ${cmd}`);
        process.exit(1);
      }
    }
  }
}

main().catch(err => {
  console.error(err.message ?? String(err));
  process.exit(1);
});
