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
  createRecoverTaskTool,
  createSetDependenciesTool,
  createAppendStoryTool,
  createClaimTaskTool,
  createInspectTaskTool,
  createCompleteTaskTool,
  createRefineTaskTool,
  createExecuteH2ATool,
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
import type { FileRecoveryService } from '../tasks/file-recovery-service.js';

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
  fileRecoveryService: FileRecoveryService,
): Promise<void> {
  const server = new McpServer();
  server.setRegistry(registry);

  const tools = [
    createRegisterTool(registry),
    createGetStoryTool(storyService),
    createGetTaskTool(taskService),
    createListTasksTool(taskService),
    createGetActiveAgentsTool(registry),
    createCreateTaskTool(taskService, registry, roleService, storyService),
    createAppendLogTool(taskService),
    createVoteTool(consentService, registry),
    createUpdateTaskTool(taskService),
    createCreateA2ATool(a2aService),
    createCheckDeadlocksTool(deadlockDetector),
    createRecoverTaskTool(fileRecoveryService),
    createSetDependenciesTool(taskService),
    createAppendStoryTool(storyService, registry),
    createClaimTaskTool(taskService, registry, roleService),
    createInspectTaskTool(taskService),
    createCompleteTaskTool(taskService, storyService),
    createRefineTaskTool(taskService),
    createExecuteH2ATool(taskService),
  ];

  for (const { definition, handler } of tools) {
    server.registerTool(definition, handler);
  }

  await server.serveStdio();
}
