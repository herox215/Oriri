import { useState, useEffect, useCallback } from 'react';
import type { AgentRegistry } from '../../../agents/agent-registry.js';
import type { ActiveAgent } from '../../../agents/agent-types.js';

const POLL_INTERVAL_MS = 2500;

export function useAgents(registry: AgentRegistry): ActiveAgent[] {
  const [agents, setAgents] = useState<ActiveAgent[]>([]);

  const poll = useCallback(async () => {
    try {
      const result = await registry.listAgents();
      setAgents(result);
    } catch {
      // Keep previous state on error
    }
  }, [registry]);

  useEffect(() => {
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [poll]);

  return agents;
}
