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
import { PermissionDeniedError } from '../shared/errors.js';
import {
  extractStatusFromMarkdown,
  extractTypeFromMarkdown,
  extractAssignedToFromMarkdown,
} from '../tasks/task-markdown.js';

const DEFAULT_IDLE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_RETRIES = 3;
const MAX_TOKENS = 4096;

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
  idleIntervalMs?: number;
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
        this.idleChecks();
        if (!shutdownController.isShutdownRequested()) {
          await this.sleep(this.deps.idleIntervalMs ?? DEFAULT_IDLE_INTERVAL_MS);
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
    const { toolRegistry, logService, agentConfig } = this.deps;
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

  private async safeReadStory(): Promise<string> {
    try {
      return await this.deps.storage.readStory();
    } catch {
      return '';
    }
  }

  private idleChecks(): void {
    // Stale task detection (T-009) and A2A checks (T-012) are not yet implemented
    console.log(
      `[${this.deps.agentConfig.id}] Idle — no tasks available. Running housekeeping checks...`,
    );

    // TODO (T-009): Check for stale tasks (no log update > 60min on non-done tasks)
    // TODO (T-012): Check for open A2A tickets, vote if applicable
    // TODO (T-012): Check if A2A tickets exist that concern this agent's role
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
