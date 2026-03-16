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
} from '../mcp/index.js';
import type { AgentRegistry } from '../agents/agent-registry.js';
import type { StoryService } from '../story/story-service.js';
import type { TaskService } from '../tasks/task-service.js';
import type { LogService } from '../logs/log-service.js';
import type { ConsentService } from '../a2a/consent-service.js';
import type { RoleService } from '../agents/role-service.js';

export async function mcpServeCommand(
  registry: AgentRegistry,
  storyService: StoryService,
  taskService: TaskService,
  logService: LogService,
  consentService: ConsentService,
  roleService: RoleService,
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
  ];

  for (const { definition, handler } of tools) {
    server.registerTool(definition, handler);
  }

  await server.serveStdio();
}
