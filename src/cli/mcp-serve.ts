import {
  McpServer,
  createRegisterTool,
  createGetStoryTool,
  createGetTaskTool,
  createListTasksTool,
  createGetActiveAgentsTool,
  createCreateTaskTool,
  createAppendLogTool,
  createVoteTool,
  createUpdateTaskTool,
  createCreateA2ATool,
  createCheckDeadlocksTool,
} from '../mcp/index.js';
import type { AgentRegistry } from '../agents/agent-registry.js';
import type { StoryService } from '../story/story-service.js';
import type { TaskService } from '../tasks/task-service.js';
import type { LogService } from '../logs/log-service.js';
import type { ConsentService } from '../a2a/consent-service.js';
import type { RoleService } from '../agents/role-service.js';
import type { A2AService } from '../a2a/a2a-service.js';
import type { DeadlockDetector } from '../tasks/deadlock-detector.js';
import type { StorageInterface } from '../storage/storage-interface.js';

export async function mcpServeCommand(
  registry: AgentRegistry,
  storyService: StoryService,
  taskService: TaskService,
  logService: LogService,
  consentService: ConsentService,
  roleService: RoleService,
  a2aService: A2AService,
  deadlockDetector: DeadlockDetector,
  storage: StorageInterface,
): Promise<void> {
  const server = new McpServer();

  const tools = [
    createRegisterTool(registry),
    createGetStoryTool(storyService),
    createGetTaskTool(taskService, logService),
    createListTasksTool(taskService),
    createGetActiveAgentsTool(registry),
    createCreateTaskTool(taskService, registry, roleService),
    createAppendLogTool(logService),
    createVoteTool(consentService, registry),
    createUpdateTaskTool(taskService, logService, storage),
    createCreateA2ATool(a2aService),
    createCheckDeadlocksTool(deadlockDetector),
  ];

  for (const { definition, handler } of tools) {
    server.registerTool(definition, handler);
  }

  await server.serveStdio();
}
