import { join } from 'node:path';
import { OririError } from '../shared/errors.js';
import { loadConfig } from '../config/config-loader.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { AgentRegistry } from '../agents/agent-registry.js';
import { initCommand } from './init.js';
import { agentListCommand } from './agent-list.js';
import { agentStartCommand } from './agent-start.js';
import { agentStopCommand } from './agent-stop.js';

const args = process.argv.slice(2);
const command = args[0];

function getArgValue(argList: string[], flag: string): string | undefined {
  const index = argList.indexOf(flag);
  if (index === -1 || index + 1 >= argList.length) return undefined;
  return argList[index + 1];
}

async function bootstrapRegistry(cwd?: string): Promise<AgentRegistry> {
  const basePath = join(cwd ?? process.cwd(), '.oriri');
  await loadConfig(basePath);
  const storage = new FilesystemStorage(basePath);
  return new AgentRegistry(storage);
}

function printHelp(): void {
  console.log('Usage: oriri <command>');
  console.log('');
  console.log('Commands:');
  console.log('  init              Initialize Oriri in the current directory');
  console.log('  agent-start       Start an agent process');
  console.log('  agent-list        Show all registered agents');
  console.log('  agent-stop        Stop an agent or all agents');
  console.log('  help              Show this help message');
  console.log('');
  console.log('Run "oriri <command> --help" for more information about a command.');
}

async function main(): Promise<void> {
  switch (command) {
    case 'init': {
      const force = args.includes('--force');
      await initCommand({ force });
      break;
    }
    case 'agent-start': {
      const agentId = getArgValue(args, '--agent-id');
      if (!agentId) {
        console.error('Missing required flag: --agent-id');
        process.exitCode = 1;
        break;
      }
      await agentStartCommand({ agentId });
      break;
    }
    case 'agent-list': {
      const registry = await bootstrapRegistry();
      await agentListCommand(registry);
      break;
    }
    case 'agent-stop': {
      const registry = await bootstrapRegistry();
      const agentId = getArgValue(args, '--agent-id');
      const all = args.includes('--all');
      await agentStopCommand(registry, { agentId, all });
      break;
    }
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "oriri --help" for usage information.');
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  if (error instanceof OririError) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
});
