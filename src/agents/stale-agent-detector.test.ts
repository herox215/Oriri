/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StaleAgentDetector, type StaleAgentDetectorDeps } from './stale-agent-detector.js';
import type { ActiveAgent } from './agent-types.js';
import { AgentNotFoundError } from '../shared/errors.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

function createMockRegistry(agents: ActiveAgent[]): StaleAgentDetectorDeps['registry'] {
  return {
    listAgents: vi.fn().mockResolvedValue(agents),
    deregister: vi.fn().mockResolvedValue(undefined),
    register: vi.fn(),
    isRegistered: vi.fn(),
    updateLastSeen: vi.fn(),
    clearAll: vi.fn(),
  } as unknown as StaleAgentDetectorDeps['registry'];
}

describe('StaleAgentDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T16:00:00Z'));
  });

  describe('findStaleAgents()', () => {
    it('should return empty array when no agents exist', async () => {
      const registry = createMockRegistry([]);
      const detector = new StaleAgentDetector({ registry });

      const result = await detector.findStaleAgents(ONE_HOUR_MS, 'self');
      expect(result).toEqual([]);
    });

    it('should skip self', async () => {
      const agents: ActiveAgent[] = [
        { id: 'self', role: 'AGENT', model: 'test', pid: 0, since: '2026-03-15T10:00:00Z' },
      ];
      const registry = createMockRegistry(agents);
      const detector = new StaleAgentDetector({ registry });

      const result = await detector.findStaleAgents(ONE_HOUR_MS, 'self');
      expect(result).toEqual([]);
    });

    it('should detect MCP client with no lastSeen as stale', async () => {
      const agents: ActiveAgent[] = [
        { id: 'mcp-123', role: 'MCP_CLIENT', model: 'unknown', pid: 0, since: '2026-03-15T10:00:00Z' },
      ];
      const registry = createMockRegistry(agents);
      const detector = new StaleAgentDetector({ registry });

      const result = await detector.findStaleAgents(ONE_HOUR_MS, 'self');
      expect(result).toEqual([{ agentId: 'mcp-123', lastSeen: undefined, pid: 0 }]);
    });

    it('should detect MCP client with stale lastSeen', async () => {
      const agents: ActiveAgent[] = [
        {
          id: 'mcp-123',
          role: 'MCP_CLIENT',
          model: 'unknown',
          pid: 0,
          since: '2026-03-15T10:00:00Z',
          lastSeen: '2026-03-15T14:00:00Z', // 2 hours ago
        },
      ];
      const registry = createMockRegistry(agents);
      const detector = new StaleAgentDetector({ registry });

      const result = await detector.findStaleAgents(ONE_HOUR_MS, 'self');
      expect(result).toHaveLength(1);
      expect(result[0].agentId).toBe('mcp-123');
    });

    it('should NOT flag MCP client with recent lastSeen', async () => {
      const agents: ActiveAgent[] = [
        {
          id: 'mcp-123',
          role: 'MCP_CLIENT',
          model: 'unknown',
          pid: 0,
          since: '2026-03-15T10:00:00Z',
          lastSeen: '2026-03-15T15:30:00Z', // 30 minutes ago
        },
      ];
      const registry = createMockRegistry(agents);
      const detector = new StaleAgentDetector({ registry });

      const result = await detector.findStaleAgents(ONE_HOUR_MS, 'self');
      expect(result).toEqual([]);
    });

    it('should NOT flag agent with alive PID even without lastSeen', async () => {
      const agents: ActiveAgent[] = [
        {
          id: 'agent-alpha',
          role: 'AGENT',
          model: 'test',
          pid: process.pid, // current process — definitely alive
          since: '2026-03-15T10:00:00Z',
        },
      ];
      const registry = createMockRegistry(agents);
      const detector = new StaleAgentDetector({ registry });

      const result = await detector.findStaleAgents(ONE_HOUR_MS, 'self');
      expect(result).toEqual([]);
    });

    it('should flag agent with dead PID and stale lastSeen', async () => {
      const agents: ActiveAgent[] = [
        {
          id: 'agent-alpha',
          role: 'AGENT',
          model: 'test',
          pid: 999999, // very unlikely to be alive
          since: '2026-03-15T10:00:00Z',
          lastSeen: '2026-03-15T14:00:00Z',
        },
      ];
      const registry = createMockRegistry(agents);
      const detector = new StaleAgentDetector({ registry });

      const result = await detector.findStaleAgents(ONE_HOUR_MS, 'self');
      expect(result).toHaveLength(1);
      expect(result[0].agentId).toBe('agent-alpha');
    });
  });

  describe('cleanupStaleAgents()', () => {
    it('should deregister stale agents and return their IDs', async () => {
      const agents: ActiveAgent[] = [
        { id: 'mcp-old', role: 'MCP_CLIENT', model: 'unknown', pid: 0, since: '2026-03-15T10:00:00Z' },
      ];
      const registry = createMockRegistry(agents);
      const detector = new StaleAgentDetector({ registry });

      const cleaned = await detector.cleanupStaleAgents(ONE_HOUR_MS, 'self');
      expect(cleaned).toEqual(['mcp-old']);
      expect(registry.deregister).toHaveBeenCalledWith('mcp-old');
    });

    it('should handle concurrent deregistration gracefully', async () => {
      const agents: ActiveAgent[] = [
        { id: 'mcp-old', role: 'MCP_CLIENT', model: 'unknown', pid: 0, since: '2026-03-15T10:00:00Z' },
      ];
      const registry = createMockRegistry(agents);
      (registry.deregister as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AgentNotFoundError('mcp-old'),
      );
      const detector = new StaleAgentDetector({ registry });

      const cleaned = await detector.cleanupStaleAgents(ONE_HOUR_MS, 'self');
      expect(cleaned).toEqual([]);
    });
  });
});
