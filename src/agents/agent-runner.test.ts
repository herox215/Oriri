/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentRunner, type AgentRunnerDeps } from './agent-runner.js';
import type { ShutdownController } from './agent-lifecycle.js';
import type { LLMResponse } from '../llm/llm-provider.js';

function createMockDeps(overrides?: Partial<AgentRunnerDeps>): AgentRunnerDeps {
  const shutdownRequested = false;
  const shutdownCallbacks: (() => void)[] = [];

  const shutdownController: ShutdownController = {
    isShutdownRequested: () => shutdownRequested,
    onShutdown: (cb) => shutdownCallbacks.push(cb),
  };

  return {
    storage: {
      readStory: vi.fn().mockResolvedValue('# Story\n\nSome context.'),
      readTask: vi.fn(),
      writeTask: vi.fn(),
      listTasks: vi.fn().mockResolvedValue([]),
      appendLog: vi.fn(),
      readLog: vi.fn(),
      readActiveAgents: vi.fn(),
      writeActiveAgents: vi.fn(),
    } as unknown as AgentRunnerDeps['storage'],
    taskService: {
      listTasks: vi.fn().mockResolvedValue([]),
      readTask: vi
        .fn()
        .mockResolvedValue(
          '# Test Task\n\n| Field | Value |\n|-------|-------|\n| id | task-001 |\n| type | feature |\n| status | open |\n| assigned_to | — |\n',
        ),
      claimTask: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      deleteTask: vi.fn(),
    } as unknown as AgentRunnerDeps['taskService'],
    logService: {
      appendLog: vi.fn().mockResolvedValue(undefined),
      getLog: vi.fn().mockResolvedValue(''),
    } as unknown as AgentRunnerDeps['logService'],
    roleService: {
      checkCanClaimTask: vi.fn(),
    } as unknown as AgentRunnerDeps['roleService'],
    registry: {
      isRegistered: vi.fn().mockResolvedValue(true),
      register: vi.fn(),
      deregister: vi.fn(),
    } as unknown as AgentRunnerDeps['registry'],
    llmProvider: {
      createMessage: vi.fn(),
    } as unknown as AgentRunnerDeps['llmProvider'],
    toolRegistry: {
      listDefinitions: vi.fn().mockReturnValue([]),
      execute: vi.fn().mockResolvedValue({ content: 'tool result' }),
      get: vi.fn(),
    } as unknown as AgentRunnerDeps['toolRegistry'],
    agentConfig: {
      id: 'agent-alpha',
      display_name: 'Alpha',
      model: 'claude-sonnet-4-6',
      role: 'CODER' as const,
      api_key: 'test-key',
    },
    shutdownController,
    projectRoot: '/tmp/test-project',
    ...overrides,
  };
}

function makeEndTurnResponse(text: string): LLMResponse {
  return {
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function makeToolUseResponse(toolName: string, input: unknown): LLMResponse {
  return {
    content: [
      { type: 'text', text: `Using ${toolName}` },
      { type: 'tool_use', id: 'toolu_123', name: toolName, input },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 20, output_tokens: 15 },
  };
}

describe('AgentRunner', () => {
  let deps: AgentRunnerDeps;

  beforeEach(() => {
    vi.useFakeTimers();
    deps = createMockDeps();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('run()', () => {
    it('should exit when agent is removed from active.md', async () => {
      (deps.registry.isRegistered as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const runner = new AgentRunner(deps);
      await runner.run();

      expect(deps.registry.isRegistered).toHaveBeenCalledWith('agent-alpha');
    });

    it('should exit on shutdown signal when idle', async () => {
      // No tasks available, will enter idle
      (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      deps.idleIntervalMs = 50;

      // Stop after first iteration (deregister on second check)
      let calls = 0;
      (deps.registry.isRegistered as ReturnType<typeof vi.fn>).mockImplementation(() => {
        calls++;
        return Promise.resolve(calls <= 1);
      });

      vi.useRealTimers();
      const runner = new AgentRunner(deps);
      await runner.run();

      expect(deps.taskService.listTasks).toHaveBeenCalled();
      vi.useFakeTimers();
    });

    it('should find and work on an open task', async () => {
      (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue(['task-001']);
      (deps.llmProvider.createMessage as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeEndTurnResponse('Task completed!'),
      );

      // Stop after one iteration
      let calls = 0;
      (deps.registry.isRegistered as ReturnType<typeof vi.fn>).mockImplementation(() => {
        calls++;
        return Promise.resolve(calls <= 1);
      });

      const runner = new AgentRunner(deps);
      await runner.run();

      expect(deps.taskService.claimTask).toHaveBeenCalledWith('task-001', 'agent-alpha', 'CODER');
      expect(deps.taskService.updateStatus).toHaveBeenCalledWith(
        'task-001',
        'executing',
        'agent-alpha',
      );
      expect(deps.llmProvider.createMessage).toHaveBeenCalled();
    });
  });

  describe('findTask()', () => {
    it('should return null when no tasks exist', async () => {
      (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const runner = new AgentRunner(deps);
      const result = await runner.findTask();

      expect(result).toBeNull();
    });

    it('should skip already-claimed tasks', async () => {
      (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue(['claimed-task']);
      (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockResolvedValue(
        '# Claimed\n\n| Field | Value |\n|-------|-------|\n| id | claimed-task |\n| type | feature |\n| status | planning |\n| assigned_to | agent-beta |\n',
      );

      const runner = new AgentRunner(deps);
      const result = await runner.findTask();

      expect(result).toBeNull();
    });

    it('should return first claimable task', async () => {
      (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
        'task-001',
        'task-002',
      ]);

      const runner = new AgentRunner(deps);
      const result = await runner.findTask();

      expect(result).toBe('task-001');
    });
  });

  describe('workOnTask()', () => {
    it('should handle tool_use responses', async () => {
      // First response: tool use, second: end turn
      const createMessage = deps.llmProvider.createMessage as ReturnType<typeof vi.fn>;
      createMessage
        .mockResolvedValueOnce(makeToolUseResponse('list_tasks', {}))
        .mockResolvedValueOnce(makeEndTurnResponse('Done!'));

      // After tool use, task is still executing
      (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockResolvedValue(
        '# Test Task\n\n| Field | Value |\n|-------|-------|\n| id | task-001 |\n| type | feature |\n| status | executing |\n| assigned_to | agent-alpha |\n',
      );

      const runner = new AgentRunner(deps);
      await runner.workOnTask('task-001');

      expect(deps.toolRegistry.execute).toHaveBeenCalledWith('list_tasks', {});
      expect(createMessage).toHaveBeenCalledTimes(2);
    });

    it('should stop when complete_task tool sets status to done', async () => {
      const createMessage = deps.llmProvider.createMessage as ReturnType<typeof vi.fn>;
      createMessage.mockResolvedValueOnce(
        makeToolUseResponse('complete_task', { task_id: 'task-001', summary: 'Done' }),
      );

      // After tool execution, task status is done
      (deps.taskService.readTask as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          '# Test Task\n\n| Field | Value |\n|-------|-------|\n| id | task-001 |\n| type | feature |\n| status | open |\n| assigned_to | — |\n',
        )
        .mockResolvedValueOnce(
          '# Test Task\n\n| Field | Value |\n|-------|-------|\n| id | task-001 |\n| type | feature |\n| status | done |\n| assigned_to | agent-alpha |\n',
        );

      const runner = new AgentRunner(deps);
      await runner.workOnTask('task-001');

      expect(createMessage).toHaveBeenCalledTimes(1);
      expect(deps.logService.appendLog).toHaveBeenCalledWith(
        'task-001',
        'agent-alpha',
        'LLM loop finished',
      );
    });

    it('should escalate to human after LLM API retries fail', async () => {
      (deps.llmProvider.createMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('API down'),
      );

      const runner = new AgentRunner(deps);
      const workPromise = runner.workOnTask('task-001');

      // Advance through retry backoff delays (2s, 4s)
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);

      await workPromise;

      expect(deps.taskService.updateStatus).toHaveBeenCalledWith(
        'task-001',
        'needs_human',
        'agent-alpha',
      );
    });

    it('should handle claim failure gracefully', async () => {
      (deps.taskService.claimTask as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Already claimed'),
      );

      const runner = new AgentRunner(deps);
      await runner.workOnTask('task-001');

      expect(deps.logService.appendLog).toHaveBeenCalledWith(
        'task-001',
        'agent-alpha',
        expect.stringContaining('failed to claim'),
      );
      // Should not proceed to LLM
      expect(deps.llmProvider.createMessage).not.toHaveBeenCalled();
    });
  });
});
