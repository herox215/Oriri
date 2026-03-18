export interface StorageInterface {
  readTask(id: string): Promise<string>;
  writeTask(id: string, content: string): Promise<void>;
  listTasks(): Promise<string[]>;
  deleteTask(id: string): Promise<void>;
}
