export interface StorageInterface {
  // Tasks
  readTask(id: string): Promise<string>;
  writeTask(id: string, content: string): Promise<void>;
  listTasks(): Promise<string[]>;
  deleteTask(id: string): Promise<void>;

  // Logs (append-only)
  appendLog(taskId: string, line: string): Promise<void>;
  readLog(taskId: string): Promise<string>;

  // Story
  readStory(): Promise<string>;
  appendStory(line: string): Promise<void>;
  writeStory(content: string): Promise<void>;

  // Story Archive
  readStoryArchive(): Promise<string>;
  appendStoryArchive(content: string): Promise<void>;

  // A2A
  readA2A(id: string): Promise<string>;
  writeA2A(id: string, content: string): Promise<void>;
  listA2A(): Promise<string[]>;

  // A2A Logs (append-only)
  appendA2ALog(id: string, line: string): Promise<void>;
  readA2ALog(id: string): Promise<string>;

  // Agents
  readActiveAgents(): Promise<string>;
  writeActiveAgents(content: string): Promise<void>;
}
