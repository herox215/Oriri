import { join } from 'node:path';
import { OririError } from '../shared/errors.js';
import { loadConfig } from '../config/config-loader.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { TaskService } from '../tasks/task-service.js';
import { GitService, WorktreeManager } from '../git/index.js';
import { initCommand } from './init.js';
import { doCommand } from './do.js';
import { deleteCommand } from './delete.js';
import { mcpServeCommand } from './mcp-serve.js';
import { tuiCommand } from './tui.js';

const args = process.argv.slice(2);
const command = args[0];

function printHelp(): void {
  console.log('Usage: oriri <command>');
  console.log('');
  console.log('Commands:');
  console.log('  init              Initialize Oriri in the current directory');
  console.log('  do "<text>"       Create a new task');
  console.log('  delete <id>       Delete a task');
  console.log('  tui               Interactive dashboard');
  console.log('  mcp-serve         Start the MCP server (stdio transport)');
  console.log('  help              Show this help message');
}

async function bootstrap(): Promise<TaskService> {
  const basePath = join(process.cwd(), '.oriri');
  await loadConfig(basePath);
  const storage = new FilesystemStorage(basePath);
  return new TaskService(storage);
}

async function main(): Promise<void> {
  switch (command) {
    case 'init': {
      const force = args.includes('--force');
      await initCommand({ force });
      break;
    }
    case 'do': {
      const request = args.slice(1).join(' ');
      if (!request) {
        console.error('Missing required argument: request');
        console.error('Usage: oriri do "Tell the agent what to do"');
        process.exitCode = 1;
        break;
      }
      await doCommand(request);
      break;
    }
    case 'delete': {
      const taskId = args[1];
      if (!taskId) {
        console.error('Missing required argument: task ID');
        console.error('Usage: oriri delete <id>');
        process.exitCode = 1;
        break;
      }
      const taskService = await bootstrap();
      await deleteCommand(taskService, taskId);
      break;
    }
    case 'tui': {
      await tuiCommand();
      break;
    }
    case 'mcp-serve': {
      const taskService = await bootstrap();
      const projectRoot = process.cwd();
      const gitService = new GitService(projectRoot);
      const worktreeManager = new WorktreeManager(gitService, taskService, projectRoot);
      await mcpServeCommand(taskService, worktreeManager);
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
