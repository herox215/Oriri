import { join } from 'node:path';

import { loadConfig } from '../config/config-loader.js';
import type { AgentRole, RuntimeAgentConfig } from '../config/config-types.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { LogService } from '../logs/log-service.js';
import { RoleService } from '../agents/role-service.js';
import { TaskService } from '../tasks/task-service.js';
import { AgentRegistry } from '../agents/agent-registry.js';
import { setupGracefulShutdown } from '../agents/agent-lifecycle.js';
import { AgentRunner } from '../agents/agent-runner.js';
import { createLLMProvider } from '../llm/create-llm-provider.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { createOririTools } from '../tools/oriri-tools.js';
import { createCodeTools } from '../tools/code-tools.js';
import { ConsentService } from '../a2a/consent-service.js';
import { A2AService } from '../a2a/a2a-service.js';
import { ProviderNotFoundError } from '../shared/errors.js';
import { generateAgentId } from '../agents/agent-id.js';
import type { LLMProviderType } from '../config/config-types.js';

export interface AgentStartOptions {
  providerName: string;
  role?: AgentRole;
  cwd?: string;
}

export async function agentStartCommand(options: AgentStartOptions): Promise<void> {
  const projectRoot = options.cwd ?? process.cwd();
  const basePath = join(projectRoot, '.oriri');
  const config = await loadConfig(basePath);

  const providerConfig = config.provider?.find((p) => p.name === options.providerName);
  if (!providerConfig) {
    throw new ProviderNotFoundError(options.providerName);
  }

  const agentId = generateAgentId(providerConfig.name);

  const agentConfig: RuntimeAgentConfig = {
    id: agentId,
    display_name: providerConfig.name,
    model: providerConfig.model,
    role: options.role ?? 'AGENT',
    provider: providerConfig.name as LLMProviderType,
    api_key: providerConfig.key,
  };

  const storage = new FilesystemStorage(basePath);
  const logService = new LogService(storage);
  const roleService = new RoleService();
  const taskService = new TaskService(storage, logService, roleService);
  const registry = new AgentRegistry(storage);
  const consentService = new ConsentService(storage, roleService);
  const a2aService = new A2AService(storage);

  const llmProvider = createLLMProvider(agentConfig.provider, agentConfig.api_key);

  const toolRegistry = new ToolRegistry();
  toolRegistry.registerAll(
    createOririTools({
      taskService,
      logService,
      storage,
      consentService,
      a2aService,
      agentId: agentConfig.id,
      role: agentConfig.role,
    }),
  );
  toolRegistry.registerAll(createCodeTools({ projectRoot }));

  const now = new Date().toISOString();
  await registry.register({
    id: agentConfig.id,
    role: agentConfig.role,
    model: agentConfig.model,
    pid: process.pid,
    since: now,
    lastSeen: now,
  });

  const shutdownController = setupGracefulShutdown(agentConfig.id, registry);

  console.log(
    `Agent "${agentConfig.id}" started (role: ${agentConfig.role}, model: ${agentConfig.model}, provider: ${providerConfig.name})`,
  );

  const runner = new AgentRunner({
    storage,
    taskService,
    logService,
    roleService,
    registry,
    llmProvider,
    toolRegistry,
    agentConfig,
    shutdownController,
    projectRoot,
    a2aService,
    consentService,
  });

  await runner.run();
}
