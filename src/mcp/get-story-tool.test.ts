import { describe, it, expect, vi } from 'vitest';
import { StoryService } from '../story/story-service.js';
import { createGetStoryTool } from './get-story-tool.js';
import type { StorageInterface } from '../storage/storage-interface.js';
import { RoleService } from '../agents/role-service.js';

function makeStorage(story = 'story content'): StorageInterface {
  return {
    readStory: vi.fn(async () => story),
    appendStory: vi.fn(),
    writeStory: vi.fn(),
    readTask: vi.fn(),
    writeTask: vi.fn(),
    listTasks: vi.fn(),
    deleteTask: vi.fn(),
    appendLog: vi.fn(),
    readLog: vi.fn(),
    readStoryArchive: vi.fn(),
    appendStoryArchive: vi.fn(),
    readActiveAgents: vi.fn(),
    writeActiveAgents: vi.fn(),
    readA2A: vi.fn(),
    writeA2A: vi.fn(),
    listA2A: vi.fn(),
    appendA2ALog: vi.fn(),
    readA2ALog: vi.fn(),
  } as unknown as StorageInterface;
}

describe('createGetStoryTool', () => {
  it('returns story content', async () => {
    const storage = makeStorage('# Story\nsome history');
    const storyService = new StoryService(storage, new RoleService());
    const { handler } = createGetStoryTool(storyService);

    const result = await handler({});

    expect(result.isError).toBeFalsy();
    expect((result.content[0] as { text: string }).text).toBe('# Story\nsome history');
  });

  it('tool definition has correct name', () => {
    const storage = makeStorage();
    const storyService = new StoryService(storage, new RoleService());
    const { definition } = createGetStoryTool(storyService);

    expect(definition.name).toBe('get_story');
  });
});
