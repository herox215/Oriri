import { useState, useCallback } from 'react';
import { Box, useInput, useApp } from 'ink';
import type { ReactElement } from 'react';
import type { AgentRegistry } from '../../agents/agent-registry.js';
import type { TaskService } from '../../tasks/task-service.js';
import type { LogService } from '../../logs/log-service.js';
import { AGENT_ROLES, type AgentRole, type OririConfig, type ProviderConfig } from '../../config/config-types.js';
import type { Panel } from './types.js';
import { useAgents } from './hooks/use-agents.js';
import { useTasks } from './hooks/use-tasks.js';
import { AgentPanel } from './components/agent-panel.js';
import { TaskPanel } from './components/task-panel.js';
import { StatusBar } from './components/status-bar.js';
import { AgentStartModal } from './components/agent-start-modal.js';
import { HumanInputModal } from './components/human-input-modal.js';
import { CreateTaskModal } from './components/create-task-modal.js';
import { spawnAgent, stopAgent } from './tui-process.js';

interface AppProps {
  registry: AgentRegistry;
  taskService: TaskService;
  logService: LogService;
  config: OririConfig;
  projectRoot: string;
}

export function App({ registry, taskService, logService, config, projectRoot }: AppProps): ReactElement {
  const { exit } = useApp();

  const agents = useAgents(registry);
  const tasks = useTasks(taskService);
  const providers: ProviderConfig[] = config.provider ?? [];

  const [activePanel, setActivePanel] = useState<Panel>('agents');
  const [agentCursor, setAgentCursor] = useState(0);
  const [taskCursor, setTaskCursor] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<'provider' | 'role'>('provider');
  const [modalCursor, setModalCursor] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<ProviderConfig | null>(null);
  const [humanModalTask, setHumanModalTask] = useState<{ id: string; title: string } | null>(null);
  const [humanModalLog, setHumanModalLog] = useState('');
  const [createTaskOpen, setCreateTaskOpen] = useState(false);

  const handleStopAgent = useCallback(async () => {
    if (agentCursor >= agents.length) return;
    const agent = agents[agentCursor];
    if (!agent) return;
    try {
      await stopAgent(registry, agent.id);
    } catch {
      // Agent may already be gone
    }
  }, [agents, agentCursor, registry]);

  const handleStartAgent = useCallback(
    (provider: ProviderConfig, role: AgentRole) => {
      spawnAgent(provider.name, role, projectRoot);
    },
    [projectRoot],
  );

  const handleOpenHumanModal = useCallback(async () => {
    const task = tasks[taskCursor];
    if (!task || task.status !== 'needs_human') return;
    try {
      const log = await logService.getLog(task.id);
      const lines = log.split('\n').filter((l) => l.trim());
      const tail = lines.slice(-5).join('\n');
      setHumanModalLog(tail);
      setHumanModalTask({ id: task.id, title: task.title });
    } catch {
      setHumanModalLog('');
      setHumanModalTask({ id: task.id, title: task.title });
    }
  }, [tasks, taskCursor, logService]);

  const handleHumanSubmit = useCallback(
    async (text: string) => {
      if (!humanModalTask) return;
      await taskService.handleHumanInput(humanModalTask.id, text);
      setHumanModalTask(null);
      setHumanModalLog('');
    },
    [humanModalTask, taskService],
  );

  const handleCreateTask = useCallback(
    async (text: string) => {
      const contextBundle = `### User Request\n\n${text}`;
      await taskService.createTask({
        title: text,
        type: 'chore',
        createdBy: 'cli',
        status: 'open',
        contextBundle,
      });
      setCreateTaskOpen(false);
    },
    [taskService],
  );

  useInput((input, key) => {
    if (createTaskOpen) {
      // CreateTaskModal handles its own input via TextInput + useInput
      return;
    }

    if (humanModalTask) {
      // HumanInputModal handles its own input via TextInput + useInput
      return;
    }

    if (modalOpen) {
      const listLength = modalStep === 'provider' ? providers.length : AGENT_ROLES.length;
      if (key.upArrow) {
        setModalCursor((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setModalCursor((prev) => Math.min(listLength - 1, prev + 1));
      } else if (key.return) {
        if (modalStep === 'provider') {
          const selected = providers[modalCursor];
          if (selected) {
            setSelectedProvider(selected);
            setModalStep('role');
            setModalCursor(0);
          }
        } else {
          const role = AGENT_ROLES[modalCursor];
          if (selectedProvider && role) {
            handleStartAgent(selectedProvider, role);
          }
          setModalOpen(false);
          setModalStep('provider');
          setSelectedProvider(null);
        }
      } else if (key.escape) {
        if (modalStep === 'role') {
          setModalStep('provider');
          setModalCursor(0);
          setSelectedProvider(null);
        } else {
          setModalOpen(false);
        }
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

    if (key.return && activePanel === 'tasks') {
      void handleOpenHumanModal();
      return;
    }

    if (input === 'n') {
      setCreateTaskOpen(true);
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
          providers={providers}
          selectedIndex={modalCursor}
          step={modalStep}
        />
      )}
      {createTaskOpen && (
        <CreateTaskModal
          onSubmit={(text) => void handleCreateTask(text)}
          onCancel={() => setCreateTaskOpen(false)}
        />
      )}
      {humanModalTask && (
        <HumanInputModal
          taskId={humanModalTask.id}
          taskTitle={humanModalTask.title}
          logEntries={humanModalLog}
          onSubmit={(text) => void handleHumanSubmit(text)}
          onCancel={() => {
            setHumanModalTask(null);
            setHumanModalLog('');
          }}
        />
      )}
      <StatusBar activePanel={activePanel} modalOpen={modalOpen || humanModalTask !== null || createTaskOpen} modalStep={modalOpen ? modalStep : undefined} isTextInput={humanModalTask !== null || createTaskOpen} />
    </Box>
  );
}
