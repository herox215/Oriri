/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOririTools, type OririToolsDeps } from './oriri-tools.js';
import type { ToolDefinition } from './tool-types.js';

function createMockDeps(): OririToolsDeps {
  return {
    taskService: {
      listTasks: vi.fn().mockResolvedValue(['abc12345', 'def67890']),
      readTask: vi.fn().mockImplementation((id: string) => {
        if (id === 'abc12345') {
          return Promise.resolve(
            '# Fix login bug\n\n| Field | Value |\n|-------|-------|\n| id | abc12345 |\n| type | bug |\n| status | open |\n| assigned_to | — |\n',
          );
        }
        return Promise.resolve(
          '# Add dashboard\n\n| Field | Value |\n|-------|-------|\n| id | def67890 |\n| type | feature |\n| status | planning |\n| assigned_to | agent-beta |\n',
        );
      }),
      claimTask: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    } as unknown as OririToolsDeps['taskService'],
    logService: {
      appendLog: vi.fn().mockResolvedValue(undefined),
    } as unknown as OririToolsDeps['logService'],
    storage: {
      readStory: vi.fn().mockResolvedValue('# Story\n\nSome context here.'),
    } as unknown as OririToolsDeps['storage'],
    consentService: {
      vote: vi.fn().mockResolvedValue(undefined),
      checkConsent: vi
        .fn()
        .mockResolvedValue({ outcome: 'pending', yesCount: 0, noCount: 0, totalEligible: 0, detail: '' }),
    } as unknown as OririToolsDeps['consentService'],
    a2aService: {
      createA2A: vi.fn().mockResolvedValue('a2a-123'),
      readA2A: vi.fn().mockResolvedValue('# A2A markdown'),
      listA2A: vi.fn().mockResolvedValue([]),
      resolveA2A: vi.fn().mockResolvedValue(undefined),
    } as unknown as OririToolsDeps['a2aService'],
    agentId: 'agent-alpha',
    role: 'CODER',
  };
}

function findTool(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool;
}

describe('createOririTools', () => {
  let deps: OririToolsDeps;
  let tools: ToolDefinition[];

  beforeEach(() => {
    deps = createMockDeps();
    tools = createOririTools(deps);
  });

  it('should create all expected tools', () => {
    const names = tools.map((t) => t.name);
    expect(names).toEqual([
      'list_tasks',
      'claim_task',
      'append_log',
      'complete_task',
      'get_story',
      'create_a2a',
      'vote',
      'resolve_a2a',
      'list_a2a',
      'check_consent',
    ]);
  });

  describe('list_tasks', () => {
    it('should return task summaries', async () => {
      const tool = findTool(tools, 'list_tasks');
      const result = await tool.handler({});

      expect(result.content).toContain('abc12345');
      expect(result.content).toContain('Fix login bug');
      expect(result.content).toContain('open');
      expect(result.content).toContain('def67890');
      expect(result.content).toContain('planning');
    });

    it('should handle empty task list', async () => {
      (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const tool = findTool(tools, 'list_tasks');
      const result = await tool.handler({});

      expect(result.content).toBe('No tasks found.');
    });
  });

  describe('claim_task', () => {
    it('should claim a task with agent ID and role', async () => {
      const tool = findTool(tools, 'claim_task');
      const result = await tool.handler({ task_id: 'abc12345' });

      expect(result.content).toContain('Successfully claimed');
      expect(deps.taskService.claimTask).toHaveBeenCalledWith('abc12345', 'agent-alpha', 'CODER');
    });

    it('should return error on failure', async () => {
      (deps.taskService.claimTask as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Task already claimed'),
      );
      const tool = findTool(tools, 'claim_task');
      const result = await tool.handler({ task_id: 'abc12345' });

      expect(result.isError).toBe(true);
      expect(result.content).toContain('Task already claimed');
    });
  });

  describe('append_log', () => {
    it('should append a log entry', async () => {
      const tool = findTool(tools, 'append_log');
      const result = await tool.handler({ task_id: 'abc12345', message: 'Working on fix' });

      expect(result.content).toBe('Log entry appended.');
      expect(deps.logService.appendLog).toHaveBeenCalledWith(
        'abc12345',
        'agent-alpha',
        'Working on fix',
      );
    });
  });

  describe('complete_task', () => {
    it('should log summary and update status to done', async () => {
      const tool = findTool(tools, 'complete_task');
      const result = await tool.handler({ task_id: 'abc12345', summary: 'Fixed the login bug' });

      expect(result.content).toContain('done');
      expect(deps.logService.appendLog).toHaveBeenCalledWith(
        'abc12345',
        'agent-alpha',
        'completing task: Fixed the login bug',
      );
      expect(deps.taskService.updateStatus).toHaveBeenCalledWith('abc12345', 'done', 'agent-alpha');
    });
  });

  describe('get_story', () => {
    it('should return story content', async () => {
      const tool = findTool(tools, 'get_story');
      const result = await tool.handler({});

      expect(result.content).toContain('Some context here.');
    });

    it('should handle empty story', async () => {
      (deps.storage.readStory as ReturnType<typeof vi.fn>).mockResolvedValue('');
      const tool = findTool(tools, 'get_story');
      const result = await tool.handler({});

      expect(result.content).toBe('(story.md is empty)');
    });
  });

  describe('create_a2a', () => {
    it('should create an A2A task', async () => {
      const tool = findTool(tools, 'create_a2a');
      const result = await tool.handler({ type: 'conflict_flag', description: 'test conflict' });

      expect(result.isError).toBeUndefined();
      expect(result.content).toContain('a2a-123');
      expect(deps.a2aService.createA2A).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'conflict_flag',
          createdBy: 'agent-alpha',
          description: 'test conflict',
        }),
      );
    });

    it('should reject invalid A2A type', async () => {
      const tool = findTool(tools, 'create_a2a');
      const result = await tool.handler({ type: 'invalid_type', description: 'test' });

      expect(result.isError).toBe(true);
      expect(result.content).toContain('Invalid A2A type');
    });
  });

  describe('resolve_a2a', () => {
    it('should resolve an A2A task', async () => {
      const tool = findTool(tools, 'resolve_a2a');
      const result = await tool.handler({ a2a_id: 'abc12345' });

      expect(result.isError).toBeUndefined();
      expect(result.content).toContain('resolved');
      expect(deps.a2aService.resolveA2A).toHaveBeenCalledWith('abc12345', 'agent-alpha');
    });
  });

  describe('list_a2a', () => {
    it('should return empty message when no A2As', async () => {
      const tool = findTool(tools, 'list_a2a');
      const result = await tool.handler({});

      expect(result.content).toBe('No A2A tasks found.');
    });
  });

  describe('check_consent', () => {
    it('should return consent result as JSON', async () => {
      const tool = findTool(tools, 'check_consent');
      const result = await tool.handler({ a2a_id: 'abc12345' });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content) as Record<string, unknown>;
      expect(parsed).toHaveProperty('outcome', 'pending');
    });
  });

  describe('vote', () => {
    it('should cast vote and return success message', async () => {
      const tool = findTool(tools, 'vote');
      const result = await tool.handler({ a2a_id: 'abc12345', vote: 'YES' });

      expect(result.isError).toBeUndefined();
      expect(result.content).toContain('YES');
      expect(result.content).toContain('abc12345');
      expect(deps.consentService.vote).toHaveBeenCalledWith(
        'abc12345',
        'agent-alpha',
        'CODER',
        'YES',
        undefined,
      );
    });

    it('should pass reason when provided', async () => {
      const tool = findTool(tools, 'vote');
      await tool.handler({ a2a_id: 'abc12345', vote: 'NO', reason: 'Bad idea' });

      expect(deps.consentService.vote).toHaveBeenCalledWith(
        'abc12345',
        'agent-alpha',
        'CODER',
        'NO',
        'Bad idea',
      );
    });

    it('should return error when vote fails', async () => {
      (deps.consentService.vote as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Vote already cast'),
      );
      const tool = findTool(tools, 'vote');
      const result = await tool.handler({ a2a_id: 'abc12345', vote: 'YES' });

      expect(result.isError).toBe(true);
      expect(result.content).toContain('Vote already cast');
    });
  });
});
