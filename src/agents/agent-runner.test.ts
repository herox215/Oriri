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
      listAgents: vi.fn().mockResolvedValue([]),
      updateLastSeen: vi.fn().mockResolvedValue(undefined),
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

  describe('findOpenA2A()', () => {
    it('should return null when no a2aService is provided', async () => {
      const runner = new AgentRunner(deps);
      const result = await runner.findOpenA2A();

      expect(result).toBeNull();
    });

    it('should return null when no open A2As exist', async () => {
      deps.a2aService = {
        listA2A: vi.fn().mockResolvedValue([]),
        readA2A: vi.fn(),
        resolveA2A: vi.fn(),
        createA2A: vi.fn(),
      } as unknown as AgentRunnerDeps['a2aService'];

      const runner = new AgentRunner(deps);
      const result = await runner.findOpenA2A();

      expect(result).toBeNull();
    });

    it('should return first open A2A ID', async () => {
      deps.a2aService = {
        listA2A: vi.fn().mockResolvedValue(['a2a-001', 'a2a-002']),
        readA2A: vi.fn().mockImplementation((id: string) => {
          if (id === 'a2a-001') {
            return Promise.resolve(
              '# A2A\n\n| Field | Value |\n|-------|-------|\n| status | resolved |\n',
            );
          }
          return Promise.resolve(
            '# A2A\n\n| Field | Value |\n|-------|-------|\n| status | open |\n',
          );
        }),
        resolveA2A: vi.fn(),
        createA2A: vi.fn(),
      } as unknown as AgentRunnerDeps['a2aService'];

      const runner = new AgentRunner(deps);
      const result = await runner.findOpenA2A();

      expect(result).toBe('a2a-002');
    });
  });

  describe('workOnA2A()', () => {
    it('should return immediately if a2aService is missing', async () => {
      const runner = new AgentRunner(deps);
      await runner.workOnA2A('a2a-001');

      expect(deps.llmProvider.createMessage).not.toHaveBeenCalled();
    });

    it('should call LLM with A2A context and resolve on end_turn', async () => {
      deps.a2aService = {
        listA2A: vi.fn().mockResolvedValue(['a2a-001']),
        readA2A: vi.fn().mockResolvedValue(
          '# A2A: conflict_flag\n\n| Field | Value |\n|-------|-------|\n| id | a2a-001 |\n| type | conflict_flag |\n| status | open |\n',
        ),
        resolveA2A: vi.fn(),
        createA2A: vi.fn(),
      } as unknown as AgentRunnerDeps['a2aService'];
      deps.consentService = {
        vote: vi.fn(),
        checkConsent: vi.fn().mockResolvedValue({
          outcome: 'pending',
          yesCount: 0,
          noCount: 0,
          totalEligible: 0,
          detail: 'No voters configured',
        }),
      } as unknown as AgentRunnerDeps['consentService'];
      deps.agentConfig = {
        ...deps.agentConfig,
        role: 'COORDINATOR',
      };

      (deps.llmProvider.createMessage as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeEndTurnResponse('A2A analyzed, no action needed.'),
      );

      const runner = new AgentRunner(deps);
      await runner.workOnA2A('a2a-001');

      expect(deps.llmProvider.createMessage).toHaveBeenCalledTimes(1);
      const callArgs = (deps.llmProvider.createMessage as ReturnType<typeof vi.fn>).mock
        .calls[0] as [{ system: string; messages: { content: string }[] }];
      expect(callArgs[0].system).toContain('COORDINATOR');
      expect(callArgs[0].messages[0].content).toContain('a2a-001');
    });

    it('should stop when A2A is resolved via tool call', async () => {
      deps.a2aService = {
        listA2A: vi.fn().mockResolvedValue(['a2a-001']),
        readA2A: vi
          .fn()
          .mockResolvedValueOnce(
            '# A2A\n\n| Field | Value |\n|-------|-------|\n| id | a2a-001 |\n| type | agent_silent |\n| status | open |\n',
          )
          .mockResolvedValueOnce(
            '# A2A\n\n| Field | Value |\n|-------|-------|\n| id | a2a-001 |\n| type | agent_silent |\n| status | resolved |\n',
          ),
        resolveA2A: vi.fn(),
        createA2A: vi.fn(),
      } as unknown as AgentRunnerDeps['a2aService'];
      deps.consentService = {
        vote: vi.fn(),
        checkConsent: vi.fn().mockResolvedValue({
          outcome: 'pending',
          yesCount: 0,
          noCount: 0,
          totalEligible: 0,
          detail: '',
        }),
      } as unknown as AgentRunnerDeps['consentService'];
      deps.agentConfig = { ...deps.agentConfig, role: 'COORDINATOR' };

      (deps.llmProvider.createMessage as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeToolUseResponse('resolve_a2a', { a2a_id: 'a2a-001' }),
      );

      const runner = new AgentRunner(deps);
      await runner.workOnA2A('a2a-001');

      expect(deps.toolRegistry.execute).toHaveBeenCalledWith('resolve_a2a', { a2a_id: 'a2a-001' });
      // Only 1 LLM call since A2A gets resolved after tool execution
      expect(deps.llmProvider.createMessage).toHaveBeenCalledTimes(1);
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
