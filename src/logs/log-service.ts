import type { StorageInterface } from '../storage/storage-interface.js';

export class LogService {
  constructor(private readonly storage: StorageInterface) {}

  async appendLog(taskId: string, agentId: string, message: string, h2a = false): Promise<void> {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const line = `[${timestamp}] ${agentId} | ${message}`;
    if (h2a) {
      await this.storage.appendHumanTaskLog(taskId, line);
    } else {
      await this.storage.appendLog(taskId, line);
    }
  }

  async getLog(taskId: string, h2a = false): Promise<string> {
    if (h2a) {
      return this.storage.readHumanTaskLog(taskId);
    }
    return this.storage.readLog(taskId);
  }
}
