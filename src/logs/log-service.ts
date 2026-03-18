import type { StorageInterface } from '../storage/storage-interface.js';

export class LogService {
  constructor(private readonly storage: StorageInterface) {}

  async appendLog(taskId: string, agentId: string, message: string): Promise<void> {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const line = `[${timestamp}] ${agentId} | ${message}`;
    await this.storage.appendLog(taskId, line);
  }

  async getLog(taskId: string): Promise<string> {
    return this.storage.readLog(taskId);
  }
}
