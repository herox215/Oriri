import type { AgentConfig } from '../config/config-types.js';
import type { LogService } from '../logs/log-service.js';
import type { StorageInterface } from '../storage/storage-interface.js';
import type { TaskService } from '../tasks/task-service.js';
import type { RoleService } from './role-service.js';
import type { AgentRegistry } from './agent-registry.js';
import type { ShutdownController } from './agent-lifecycle.js';
import type { LLMProvider, LLMMessage, LLMContentBlock } from '../llm/llm-provider.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { TaskStatus, TaskType } from '../tasks/task-types.js';
import type { A2AService } from '../a2a/a2a-service.js';
import type { ConsentService } from '../a2a/consent-service.js';
import { PermissionDeniedError } from '../shared/errors.js';
import {
  extractStatusFromMarkdown,
  extractTypeFromMarkdown,
  extractAssignedToFromMarkdown,
} from '../tasks/task-markdown.js';
import { extractA2AStatusFromMarkdown } from '../a2a/a2a-markdown.js';
import { StaleTaskDetector } from './stale-task-detector.js';
import { StaleAgentDetector } from './stale-agent-detector.js';
import { DeadlockDetector } from '../tasks/deadlock-detector.js';

const DEFAULT_IDLE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_STALE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
const MAX_RETRIES = 3;
const MAX_TOKENS = 4096;
const MAX_A2A_TURNS = 20;

export interface AgentRunnerDeps {
  storage: StorageInterface;
  taskService: TaskService;
  logService: LogService;
  roleService: RoleService;
  registry: AgentRegistry;
  llmProvider: LLMProvider;
  toolRegistry: ToolRegistry;
  agentConfig: AgentConfig;
  shutdownController: ShutdownController;
  projectRoot: string;
  a2aService?: A2AService;
  consentService?: ConsentService;
  idleIntervalMs?: number;
  staleTimeoutMs?: number;
}

export class AgentRunner {
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: AgentRunnerDeps) {
    deps.shutdownController.onShutdown(() => {
      if (this.sleepTimer) {
        clearTimeout(this.sleepTimer);
        this.sleepTimer = null;
      }
    });
  }

  async run(): Promise<void> {
    const { agentConfig, registry, shutdownController } = this.deps;

    while (!shutdownController.isShutdownRequested()) {
      const isRegistered = await registry.isRegistered(agentConfig.id);
      if (!isRegistered) {
        console.log(`Agent ${agentConfig.id} removed from active.md — shutting down.`);
        break;
      }

      const taskId = await this.findTask();

      if (taskId) {
        await this.workOnTask(taskId);
      } else {
        const a2aId = await this.findOpenA2A();
        if (a2aId) {
          await this.workOnA2A(a2aId);
        } else {
          await this.idleChecks();
          if (!shutdownController.isShutdownRequested()) {
            await this.sleep(this.deps.idleIntervalMs ?? DEFAULT_IDLE_INTERVAL_MS);
          }
        }
      }
    }
  }

  async findTask(): Promise<string | null> {
    const { taskService, roleService, agentConfig } = this.deps;
    const role = agentConfig.role;

    const ids = await taskService.listTasks();
    for (const id of ids) {
      try {
        const markdown = await taskService.readTask(id);
        const status = extractStatusFromMarkdown(markdown) as TaskStatus | null;
        const type = extractTypeFromMarkdown(markdown) as TaskType | null;
        const assignedTo = extractAssignedToFromMarkdown(markdown);

        if (!status || !type) continue;
        if (assignedTo !== null && assignedTo !== '—') continue;

        try {
          roleService.checkCanClaimTask(role, type, status);
          return id;
        } catch (error: unknown) {
          if (error instanceof PermissionDeniedError) continue;
          throw error;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  async workOnTask(taskId: string): Promise<void> {
    const { taskService, logService, agentConfig, shutdownController } = this.deps;
    const agentId = agentConfig.id;
    const role = agentConfig.role;

    try {
      await taskService.claimTask(taskId, agentId, role);
    } catch (error: unknown) {
      await logService.appendLog(
        taskId,
        agentId,
        `failed to claim task: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return;
    }

    await taskService.updateStatus(taskId, 'executing', agentId);

    const storyContent = await this.safeReadStory();
    const taskMarkdown = await this.deps.taskService.readTask(taskId);
    const systemPrompt = this.buildSystemPrompt(agentConfig, storyContent, taskMarkdown);

    const messages: LLMMessage[] = [
      {
        role: 'user',
        content: `You have been assigned task ${taskId}. Here is the task:\n\n${taskMarkdown}\n\nWork on this task using the tools available to you. When done, call the complete_task tool.`,
      },
    ];

    await logService.appendLog(taskId, agentId, 'starting LLM loop');

    let finished = false;
    while (!finished && !shutdownController.isShutdownRequested()) {
      const response = await this.callLLMWithRetry(systemPrompt, messages, taskId);

      if (!response) {
        // All retries failed — escalate
        await taskService.updateStatus(taskId, 'needs_human', agentId);
        await logService.appendLog(
          taskId,
          agentId,
          'LLM API failed after retries — escalating to human',
        );
        return;
      }

      // Add assistant response to messages
      messages.push({ role: 'assistant', content: response.content });

      // Log text blocks
      for (const block of response.content) {
        if (block.type === 'text' && block.text.trim()) {
          await logService.appendLog(taskId, agentId, `LLM: ${block.text.slice(0, 200)}`);
        }
      }

      if (response.stop_reason === 'end_turn') {
        finished = true;
      } else if (response.stop_reason === 'tool_use') {
        const toolResults = await this.executeToolCalls(response.content, taskId);
        messages.push({ role: 'user', content: toolResults });

        // Check if task was completed via complete_task tool
        const taskMd = await taskService.readTask(taskId);
        const currentStatus = extractStatusFromMarkdown(taskMd);
        if (currentStatus === 'done' || currentStatus === 'awaiting_review') {
          finished = true;
        }
      } else {
        // max_tokens — ask the LLM to continue
        messages.push({ role: 'user', content: 'Please continue.' });
      }
    }

    await logService.appendLog(taskId, agentId, 'LLM loop finished');
  }

  private async callLLMWithRetry(
    systemPrompt: string,
    messages: LLMMessage[],
    taskId: string,
  ): ReturnType<LLMProvider['createMessage']> | Promise<null> {
    const { llmProvider, agentConfig, toolRegistry, logService } = this.deps;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await llmProvider.createMessage({
          model: agentConfig.model,
          system: systemPrompt,
          messages,
          tools: toolRegistry.listDefinitions(),
          max_tokens: MAX_TOKENS,
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'unknown error';
        await logService.appendLog(
          taskId,
          agentConfig.id,
          `LLM API attempt ${String(attempt)}/${String(MAX_RETRIES)} failed: ${msg}`,
        );

        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000;
          await this.sleep(delay);
        }
      }
    }

    return null;
  }

  private async executeToolCalls(
    content: LLMContentBlock[],
    taskId: string,
  ): Promise<LLMContentBlock[]> {
    const { toolRegistry, logService, agentConfig, registry } = this.deps;
    const results: LLMContentBlock[] = [];

    for (const block of content) {
      if (block.type !== 'tool_use') continue;

      await logService.appendLog(
        taskId,
        agentConfig.id,
        `tool call: ${block.name}(${JSON.stringify(block.input).slice(0, 200)})`,
      );

      const result = await toolRegistry.execute(block.name, block.input);

      await logService.appendLog(
        taskId,
        agentConfig.id,
        `tool result [${block.name}]: ${result.content.slice(0, 200)}${result.isError ? ' (ERROR)' : ''}`,
      );

      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: result.content,
        is_error: result.isError,
      });
    }

    // Update lastSeen heartbeat (best-effort)
    try {
      await registry.updateLastSeen(agentConfig.id);
    } catch {
      // Don't fail on heartbeat
    }

    return results;
  }

  private buildSystemPrompt(
    config: AgentConfig,
    storyContent: string,
    taskMarkdown: string,
  ): string {
    const parts: string[] = [];

    if (config.system_prompt) {
      parts.push(config.system_prompt);
    }

    parts.push(`You are agent "${config.id}" with role "${config.role}".`);
    parts.push(`Your capabilities: ${config.capabilities?.join(', ') ?? 'general'}`);

    parts.push('\n## Project Story (Collective Memory)\n');
    parts.push(storyContent || '(No story entries yet)');

    parts.push('\n## Instructions\n');
    parts.push('- Use the tools available to you to complete the assigned task.');
    parts.push('- Log your progress using append_log.');
    parts.push('- When finished, call complete_task with a summary.');
    parts.push('- If you cannot complete the task, explain why in the log.');

    // suppress unused parameter warning — taskMarkdown is available for future use
    void taskMarkdown;

    return parts.join('\n');
  }

  async findOpenA2A(): Promise<string | null> {
    const { a2aService } = this.deps;
    if (!a2aService) return null;

    const ids = await a2aService.listA2A();
    for (const id of ids) {
      try {
        const markdown = await a2aService.readA2A(id);
        const status = extractA2AStatusFromMarkdown(markdown);
        if (status === 'open') return id;
      } catch {
        continue;
      }
    }
    return null;
  }

  async workOnA2A(a2aId: string): Promise<void> {
    const { a2aService, consentService, agentConfig, shutdownController } = this.deps;
    if (!a2aService || !consentService) return;

    const agentId = agentConfig.id;
    const a2aMarkdown = await a2aService.readA2A(a2aId);
    const storyContent = await this.safeReadStory();
    const consentResult = await consentService.checkConsent(a2aId);
    const consentSummary = `Consent status: ${consentResult.outcome} (${String(consentResult.yesCount)} yes, ${String(consentResult.noCount)} no, ${String(consentResult.totalEligible)} eligible). ${consentResult.detail}`;

    const systemPrompt = this.buildA2ASystemPrompt(agentConfig, storyContent);

    const messages: LLMMessage[] = [
      {
        role: 'user',
        content:
          `You are processing A2A coordination task ${a2aId}.\n\n` +
          `${a2aMarkdown}\n\n${consentSummary}\n\n` +
          'Analyze this A2A task and take appropriate action using the available tools. ' +
          'If consent is accepted, execute the proposed action and call resolve_a2a. ' +
          'If consent is rejected, call resolve_a2a to close it. ' +
          'If consent is pending and you need to vote, cast your vote. ' +
          'If no voters are configured, decide and act directly, then call resolve_a2a.',
      },
    ];

    console.log(`[${agentId}] Processing A2A ${a2aId}`);

    let finished = false;
    let turns = 0;
    while (!finished && !shutdownController.isShutdownRequested() && turns < MAX_A2A_TURNS) {
      turns++;
      const response = await this.callLLMWithRetry(systemPrompt, messages, a2aId);

      if (!response) {
        console.log(`[${agentId}] LLM API failed for A2A ${a2aId} — skipping`);
        return;
      }

      messages.push({ role: 'assistant', content: response.content });

      for (const block of response.content) {
        if (block.type === 'text' && block.text.trim()) {
          console.log(`[${agentId}] A2A LLM: ${block.text.slice(0, 200)}`);
        }
      }

      if (response.stop_reason === 'end_turn') {
        finished = true;
      } else if (response.stop_reason === 'tool_use') {
        const toolResults = await this.executeToolCalls(response.content, a2aId);
        messages.push({ role: 'user', content: toolResults });

        // Check if A2A was resolved
        const a2aMd = await a2aService.readA2A(a2aId);
        const currentStatus = extractA2AStatusFromMarkdown(a2aMd);
        if (currentStatus === 'resolved') {
          finished = true;
        }
      } else {
        messages.push({ role: 'user', content: 'Please continue.' });
      }
    }

    if (turns >= MAX_A2A_TURNS) {
      console.log(`[${agentId}] A2A ${a2aId} hit max turns (${String(MAX_A2A_TURNS)}) — leaving open for next cycle`);
    }
  }

  private buildA2ASystemPrompt(config: AgentConfig, storyContent: string): string {
    const parts: string[] = [];

    if (config.system_prompt) {
      parts.push(config.system_prompt);
    }

    parts.push(`You are agent "${config.id}" with role COORDINATOR.`);
    parts.push('You process agent-to-agent (A2A) coordination tasks.');
    parts.push(`Your capabilities: ${config.capabilities?.join(', ') ?? 'coordination'}`);

    parts.push('\n## Project Story (Collective Memory)\n');
    parts.push(storyContent || '(No story entries yet)');

    parts.push('\n## Instructions\n');
    parts.push('- Analyze the A2A task and its consent status.');
    parts.push('- If consent is accepted, execute the proposed action (e.g., update tasks, resolve dependencies).');
    parts.push('- If consent is rejected, resolve the A2A.');
    parts.push('- If consent is pending and you need to vote, cast your vote with reasoning.');
    parts.push('- If no voters are configured, decide and act directly based on the context.');
    parts.push('- Call resolve_a2a when you are done processing.');
    parts.push('- Use append_story to document significant decisions.');

    return parts.join('\n');
  }

  private async safeReadStory(): Promise<string> {
    try {
      return await this.deps.storage.readStory();
    } catch {
      return '';
    }
  }

  private async idleChecks(): Promise<void> {
    const { agentConfig, storage, taskService, logService, registry } = this.deps;
    const thresholdMs = this.deps.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS;

    console.log(`[${agentConfig.id}] Idle — running housekeeping checks...`);

    const detector = new StaleTaskDetector({ storage, taskService, logService, registry });
    const staleTasks = await detector.findStaleTasks(thresholdMs);

    for (const staleTask of staleTasks) {
      if (staleTask.assignedTo === agentConfig.id) continue;

      const a2aId = await detector.handleStaleTask(staleTask, agentConfig.id);
      console.log(
        `[${agentConfig.id}] Created A2A a2a-${a2aId} for stale task ${staleTask.taskId}`,
      );
    }

    // Clean up stale agents (dead processes, ghost MCP clients)
    const agentDetector = new StaleAgentDetector({ registry });
    const cleaned = await agentDetector.cleanupStaleAgents(thresholdMs, agentConfig.id);
    for (const id of cleaned) {
      console.log(`[${agentConfig.id}] Cleaned up stale agent: ${id}`);
    }

    if (agentConfig.role === 'COORDINATOR') {
      const deadlockDetector = new DeadlockDetector({ storage, taskService, logService });
      const deadlockA2AIds = await deadlockDetector.checkDeadlocks(agentConfig.id);
      for (const id of deadlockA2AIds) {
        console.log(`[${agentConfig.id}] Created deadlock A2A a2a-${id}`);
      }

      await deadlockDetector.checkBlockedTasks(agentConfig.id);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.sleepTimer = setTimeout(() => {
        this.sleepTimer = null;
        resolve();
      }, ms);
    });
  }
}
