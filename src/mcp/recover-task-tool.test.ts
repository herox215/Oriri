import { describe, it, expect, vi } from 'vitest';
import { FileRecoveryService } from '../tasks/file-recovery-service.js';
import { createRecoverTaskTool } from './recover-task-tool.js';
import type { RecoveryResult } from '../tasks/file-recovery-service.js';

function makeRecoveryService(result: RecoveryResult): FileRecoveryService {
  return {
    recoverTask: vi.fn().mockResolvedValue(result),
    parseLogForReconstruction: vi.fn(),
    searchStoryForTask: vi.fn(),
  } as unknown as FileRecoveryService;
}

describe('createRecoverTaskTool', () => {
  it('has correct name and required fields', () => {
    const service = makeRecoveryService({
      success: true,
      source: 'none',
      taskId: 'task-abc',
      message: 'ok',
    });
    const { definition } = createRecoverTaskTool(service);
    expect(definition.name).toBe('recover_task');
    expect(definition.inputSchema.required).toContain('taskId');
    expect(definition.inputSchema.required).toContain('agentId');
  });

  it('returns JSON result from recovery service', async () => {
    const result: RecoveryResult = {
      success: true,
      source: 'log',
      taskId: 'task-abc',
      reconstructedMarkdown: '# Task',
      message: 'Reconstructed from log.',
    };
    const service = makeRecoveryService(result);
    const { handler } = createRecoverTaskTool(service);

    const toolResult = await handler({ taskId: 'task-abc', agentId: 'agent-x' });
    expect(toolResult.isError).toBeFalsy();
    const text = (toolResult.content[0] as { text: string }).text;
    const parsed = JSON.parse(text) as RecoveryResult;
    expect(parsed.success).toBe(true);
    expect(parsed.source).toBe('log');
    expect(parsed.taskId).toBe('task-abc');
  });

  it('passes taskContent to recovery service when provided', async () => {
    const result: RecoveryResult = {
      success: true,
      source: 'agent_memory',
      taskId: 'task-abc',
      message: 'Reconstructed from memory.',
    };
    const service = makeRecoveryService(result);
    const { handler } = createRecoverTaskTool(service);

    await handler({ taskId: 'task-abc', agentId: 'agent-x', taskContent: '# My Task' });

    expect(service.recoverTask).toHaveBeenCalledWith('task-abc', 'agent-x', '# My Task');
  });

  it('passes undefined taskContent when not provided', async () => {
    const result: RecoveryResult = {
      success: false,
      source: 'none',
      taskId: 'task-abc',
      a2aId: 'a2a-001',
      message: 'No context.',
    };
    const service = makeRecoveryService(result);
    const { handler } = createRecoverTaskTool(service);

    await handler({ taskId: 'task-abc', agentId: 'agent-x' });

    expect(service.recoverTask).toHaveBeenCalledWith('task-abc', 'agent-x', undefined);
  });
});
