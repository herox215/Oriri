import { join } from 'node:path';
import { OririError } from '../shared/errors.js';
import { loadConfig } from '../config/config-loader.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { AgentRegistry } from '../agents/agent-registry.js';
import { RoleService } from '../agents/role-service.js';
import { LogService } from '../logs/log-service.js';
import { TaskService } from '../tasks/task-service.js';
import { StoryService } from '../story/story-service.js';
import { ConsentService } from '../a2a/consent-service.js';
import { A2AService } from '../a2a/a2a-service.js';
import { DeadlockDetector } from '../tasks/deadlock-detector.js';
import { FileRecoveryService } from '../tasks/file-recovery-service.js';
import { initCommand } from './init.js';
import { agentListCommand } from './agent-list.js';
import { agentStartCommand } from './agent-start.js';
import { agentStopCommand } from './agent-stop.js';
import { mcpServeCommand } from './mcp-serve.js';
import { watchCommand } from './watch.js';
import { backupCommand } from './backup.js';
import { createCommand } from './create.js';
import { deleteCommand } from './delete.js';
import { tuiCommand } from './tui.js';

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
  console.log('  start-agent       Start an agent process');
  console.log('  agent-list        Show all registered agents');
  console.log('  agent-stop        Stop an agent or all agents');
  console.log('  mcp-serve         Start the MCP server (stdio transport)');
  console.log('  watch             Start the notification watcher');
  console.log('  create <title>    Create a draft task from the CLI');
  console.log('  delete <id>       Request deletion of a task (creates H2A task)');
  console.log('  tui               Interactive dashboard');
  console.log('  backup            Create a timestamped backup of .oriri/');
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
    case 'start-agent': {
      const provider = getArgValue(args, '--provider');
      if (!provider) {
        console.error('Missing required flag: --provider');
        process.exitCode = 1;
        break;
      }
      const role = getArgValue(args, '--role') as import('../config/config-types.js').AgentRole | undefined;
      await agentStartCommand({ providerName: provider, ...(role !== undefined && { role }) });
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
    case 'mcp-serve': {
      const basePath = join(process.cwd(), '.oriri');
      await loadConfig(basePath);
      const storage = new FilesystemStorage(basePath);
      const roleService = new RoleService();
      const logService = new LogService(storage);
      const taskService = new TaskService(storage, logService, roleService);
      const storyService = new StoryService(storage, roleService);
      const consentService = new ConsentService(storage, roleService);
      const registry = new AgentRegistry(storage);
      const a2aService = new A2AService(storage);
      const deadlockDetector = new DeadlockDetector({ storage, taskService, logService });
      const fileRecoveryService = new FileRecoveryService(storage, logService, a2aService, storyService);
      await mcpServeCommand(registry, storyService, taskService, logService, consentService, roleService, a2aService, deadlockDetector, storage, fileRecoveryService);
      break;
    }
    case 'watch': {
      const basePath = join(process.cwd(), '.oriri');
      const stop = args.includes('--stop');
      watchCommand(basePath, { stop });
      break;
    }
    case 'create': {
      const title = args.slice(1).join(' ');
      if (!title) {
        console.error('Missing required argument: title');
        console.error('Usage: oriri create "Task description"');
        process.exitCode = 1;
        break;
      }
      await createCommand(title);
      break;
    }
    case 'delete': {
      const targetId = args[1];
      if (!targetId) {
        console.error('Missing required argument: task ID');
        console.error('Usage: oriri delete <id>');
        process.exitCode = 1;
        break;
      }
      await deleteCommand(targetId);
      break;
    }
    case 'tui': {
      await tuiCommand();
      break;
    }
    case 'backup': {
      const target = getArgValue(args, '--target');
      await backupCommand({ ...(target !== undefined && { target }) });
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
