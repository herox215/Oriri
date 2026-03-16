import { describe, it, expect, vi } from 'vitest';
import { createCheckDeadlocksTool } from './check-deadlocks-tool.js';
import type { DeadlockDetector } from '../tasks/deadlock-detector.js';

function makeDeadlockDetector(returnedIds: string[]): DeadlockDetector {
  return {
    checkDeadlocks: vi.fn(() => Promise.resolve(returnedIds)),
    checkBlockedTasks: vi.fn(() => Promise.resolve([])),
  } as unknown as DeadlockDetector;
}

describe('createCheckDeadlocksTool', () => {
  it('returns empty array when no deadlocks found', async () => {
    const detector = makeDeadlockDetector([]);
    const { handler } = createCheckDeadlocksTool(detector);

    const result = await handler({});
    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text) as {
      created_a2a_ids: string[];
    };
    expect(data.created_a2a_ids).toEqual([]);
  });

  it('returns created A2A IDs when deadlocks detected', async () => {
    const detector = makeDeadlockDetector(['A2A-001', 'A2A-002']);
    const { handler } = createCheckDeadlocksTool(detector);

    const result = await handler({ client_id: 'agent-x' });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text) as {
      created_a2a_ids: string[];
    };
    expect(data.created_a2a_ids).toEqual(['A2A-001', 'A2A-002']);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(detector.checkDeadlocks).toHaveBeenCalledWith('agent-x');
  });

  it('uses mcp-anonymous when no client_id provided', async () => {
    const detector = makeDeadlockDetector([]);
    const { handler } = createCheckDeadlocksTool(detector);

    await handler({});
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(detector.checkDeadlocks).toHaveBeenCalledWith('mcp-anonymous');
  });

  it('tool definition has correct name', () => {
    const detector = makeDeadlockDetector([]);
    const { definition } = createCheckDeadlocksTool(detector);
    expect(definition.name).toBe('check_deadlocks');
  });
});
