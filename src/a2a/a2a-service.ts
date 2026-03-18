import type { StorageInterface } from '../storage/storage-interface.js';
import { StorageReadError, A2ANotFoundError, A2ALimitExceededError } from '../shared/errors.js';
import type { A2AType } from './a2a-types.js';
import { generateA2AId } from './a2a-id.js';
import {
  buildA2AMarkdown,
  extractA2AStatusFromMarkdown,
  extractA2ATargetTaskFromMarkdown,
  replaceA2AStatusInMarkdown,
  type VoterEntry,
} from './a2a-markdown.js';

export interface CreateA2AInput {
  type: A2AType;
  createdBy: string;
  targetTaskId?: string;
  targetAgentId?: string;
  description: string;
  voters?: VoterEntry[];
  deadline?: string;
}

function formatLogLine(agentId: string, message: string): string {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return `[${timestamp}] ${agentId} | ${message}`;
}

const MAX_OPEN_A2A_PER_TARGET = 3;

export class A2AService {
  constructor(private readonly storage: StorageInterface) {}

  async countOpenA2AForTarget(targetTaskId: string): Promise<number> {
    const ids = await this.storage.listA2A();
    let count = 0;
    for (const id of ids) {
      try {
        const markdown = await this.storage.readA2A(id);
        const status = extractA2AStatusFromMarkdown(markdown);
        const target = extractA2ATargetTaskFromMarkdown(markdown);
        if (status === 'open' && target === targetTaskId) {
          count++;
        }
      } catch {
        continue;
      }
    }
    return count;
  }

  async createA2A(input: CreateA2AInput): Promise<string> {
    if (input.targetTaskId) {
      const openCount = await this.countOpenA2AForTarget(input.targetTaskId);
      if (openCount >= MAX_OPEN_A2A_PER_TARGET) {
        throw new A2ALimitExceededError(input.targetTaskId, MAX_OPEN_A2A_PER_TARGET);
      }
    }

    const existingIds = await this.storage.listA2A();
    const id = generateA2AId(input.createdBy, input.type, existingIds);
    const createdAt = new Date().toISOString();

    const deadline =
      input.deadline ??
      (input.voters && input.voters.length > 0
        ? new Date(new Date(createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
        : undefined);

    const markdown = buildA2AMarkdown({
      id,
      type: input.type,
      status: 'open',
      createdBy: input.createdBy,
      createdAt,
      targetTaskId: input.targetTaskId,
      targetAgentId: input.targetAgentId,
      description: input.description,
      voters: input.voters,
      deadline,
    });

    await this.storage.writeA2A(id, markdown);
    await this.storage.appendA2ALog(
      id,
      formatLogLine(input.createdBy, `created A2A task: ${input.type}`),
    );

    return id;
  }

  async readA2A(id: string): Promise<string> {
    try {
      return await this.storage.readA2A(id);
    } catch (error: unknown) {
      if (error instanceof StorageReadError) {
        throw new A2ANotFoundError(id);
      }
      throw error;
    }
  }

  async readA2ALog(id: string): Promise<string> {
    return this.storage.readA2ALog(id);
  }

  async listA2A(): Promise<string[]> {
    return this.storage.listA2A();
  }

  async resolveA2A(id: string, agentId: string): Promise<void> {
    const markdown = await this.readA2A(id);
    const updated = replaceA2AStatusInMarkdown(markdown, 'resolved');

    await this.storage.writeA2A(id, updated);
    await this.storage.appendA2ALog(id, formatLogLine(agentId, 'resolved'));

    const targetTaskId = extractA2ATargetTaskFromMarkdown(markdown);
    if (targetTaskId !== null) {
      await this.storage.appendLog(
        targetTaskId,
        formatLogLine(agentId, `(via a2a-${id} ✓) resolved`),
      );
    }
  }
}
