import { useState, useCallback } from 'react';
import { Box, useInput, useApp } from 'ink';
import type { ReactElement } from 'react';
import type { AgentRegistry } from '../../agents/agent-registry.js';
import type { TaskService } from '../../tasks/task-service.js';
import type { OririConfig, AgentConfig } from '../../config/config-types.js';
import type { Panel } from './types.js';
import { useAgents } from './hooks/use-agents.js';
import { useTasks } from './hooks/use-tasks.js';
import { AgentPanel } from './components/agent-panel.js';
import { TaskPanel } from './components/task-panel.js';
import { StatusBar } from './components/status-bar.js';
import { AgentStartModal } from './components/agent-start-modal.js';
import { spawnAgent, stopAgent } from './tui-process.js';

interface AppProps {
  registry: AgentRegistry;
  taskService: TaskService;
  config: OririConfig;
  projectRoot: string;
}

export function App({ registry, taskService, config, projectRoot }: AppProps): ReactElement {
  const { exit } = useApp();

  const agents = useAgents(registry);
  const tasks = useTasks(taskService);
  const agentConfigs: AgentConfig[] = config.agents ?? [];

  const [activePanel, setActivePanel] = useState<Panel>('agents');
  const [agentCursor, setAgentCursor] = useState(0);
  const [taskCursor, setTaskCursor] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCursor, setModalCursor] = useState(0);

  const activeAgentIds = new Set(agents.map((a) => a.id));

  const handleStopAgent = useCallback(async () => {
    const agent = agents[agentCursor];
    if (!agent) return;
    try {
      await stopAgent(registry, agent.id);
    } catch {
      // Agent may already be gone
    }
  }, [agents, agentCursor, registry]);

  const handleStartAgent = useCallback(
    (agentConfig: AgentConfig) => {
      spawnAgent(agentConfig.id, projectRoot);
    },
    [projectRoot],
  );

  useInput((input, key) => {
    if (modalOpen) {
      const startableConfigs = agentConfigs.filter((c) => !activeAgentIds.has(c.id));

      if (key.upArrow) {
        setModalCursor((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setModalCursor((prev) => Math.min(startableConfigs.length - 1, prev + 1));
      } else if (key.return) {
        const selected = startableConfigs[modalCursor];
        if (selected) {
          handleStartAgent(selected);
        }
        setModalOpen(false);
      } else if (key.escape) {
        setModalOpen(false);
      }
      return;
    }

    if (input === 'q') {
      exit();
      return;
    }

    if (key.tab) {
      setActivePanel((prev) => (prev === 'agents' ? 'tasks' : 'agents'));
      return;
    }

    if (key.upArrow) {
      if (activePanel === 'agents') {
        setAgentCursor((prev) => Math.max(0, prev - 1));
      } else {
        setTaskCursor((prev) => Math.max(0, prev - 1));
      }
      return;
    }

    if (key.downArrow) {
      if (activePanel === 'agents') {
        setAgentCursor((prev) => Math.min(agents.length - 1, prev + 1));
      } else {
        setTaskCursor((prev) => Math.min(tasks.length - 1, prev + 1));
      }
      return;
    }

    if (input === 'a') {
      setModalOpen(true);
      setModalCursor(0);
      return;
    }

    if (input === 's' && activePanel === 'agents') {
      void handleStopAgent();
      return;
    }
  });

  return (
    <Box flexDirection="column" width="100%">
      <AgentPanel agents={agents} selectedIndex={agentCursor} focused={activePanel === 'agents'} />
      <TaskPanel tasks={tasks} selectedIndex={taskCursor} focused={activePanel === 'tasks'} />
      {modalOpen && (
        <AgentStartModal
          configs={agentConfigs}
          activeAgentIds={activeAgentIds}
          selectedIndex={modalCursor}
        />
      )}
      <StatusBar activePanel={activePanel} modalOpen={modalOpen} />
    </Box>
  );
}
