import { loadConfig, getConfigPath } from "./config";
import { build } from "./import";
import { topologicalSort } from "./resolve";
import { emitAll, renderText, deduplicateRecords } from "./emit";
import { readStore } from "./store";
import type { PromptRecord } from "./types";

export interface CliArgs {
  cmd: string;
  args: string[];
}

/**
 * Parse CLI arguments into a command and remaining args.
 * Defaults to "help" when no command is provided.
 */
export function parseCliArgs(argv: string[]): CliArgs {
  const cmd = argv[0] ?? "help";
  const args = argv.slice(1);
  return { cmd, args };
}

export async function run(argv: string[]): Promise<void> {
  const { cmd, args } = parseCliArgs(argv);
  const config = await loadConfig();
  const storePath = config.storeFile;

  switch (cmd) {
    case "build": {
      await build(config.rootDirs, storePath, config.project);
      console.log(`Built ${config.rootDirs.length} root dir(s) into ${storePath}`);
      break;
    }
    case "emit": {
      const dryRun = args[0] === "--dry-run";
      const paths = await emitAll(storePath, config.emitDirs, config, dryRun);
      if (dryRun) {
        console.log(`${paths.length} file(s) would be written`);
      } else {
        console.log(`Emitted ${paths.length} file(s)`);
      }
      break;
    }
    case "render": {
      const name = args[0];
      if (!name) {
        throw new Error("Usage: evo render <module>");
      }
      console.log(await renderText(storePath, name, config.maxInheritDepth));
      break;
    }
    case "stats": {
      const records = deduplicateRecords(await readStore(storePath));
      const abstract = records.filter(r => r.abstract).length;
      const leaves = records.filter(r => !r.extends?.length).length;
      console.log(`Total: ${records.length}, Abstract: ${abstract}, Leaves: ${leaves}`);
      break;
    }
    case "doctor": {
      const records = deduplicateRecords(await readStore(storePath));
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
      try {
        await topologicalSort(storePath);
      } catch (e) {
        console.error(`Cycle detected: ${(e as Error).message}`);
        errors++;
      }
      if (errors === 0) {
        console.log("Doctor: all references valid.");
      } else {
        throw new Error(`Doctor: found ${errors} error(s)`);
      }
      break;
    }
    case "config": {
      const subCmd = args[0] ?? "show";
      if (subCmd === "show") {
        console.log(`Config path: ${getConfigPath()}`);
        console.log(JSON.stringify(config, null, 2));
      } else if (subCmd === "set" && args[1] && args[2]) {
        console.error("Config set: not yet implemented (use env var EVO_CONFIG for path)");
        break;
      } else if (subCmd === "unset") {
        console.error("Config unset: not yet implemented");
        break;
      } else {
        throw new Error("Usage: evo config [show|set|unset]");
      }
      break;
    }
    default: {
      console.log(`Usage: evo <command>

Commands:
  build               Import .md files into the JSONL store
  emit [--dry-run]    Resolve and emit merged .md files
  render <module>     Resolve and print a single module
  stats               Show module counts
  doctor              Validate references and detect cycles
  config [show|set|unset]  Inspect or modify config

Environment:
  EVO_CONFIG          Path to config file (default: .evo/config.yaml)
`);
      if (cmd !== "help" && cmd !== "-h" && cmd !== "--help") {
        console.error(`Unknown command: ${cmd}`);
        throw new Error(`Unknown command: ${cmd}`);
      }
    }
  }
}
