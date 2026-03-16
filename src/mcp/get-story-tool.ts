import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { StoryService } from '../story/story-service.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

export function createGetStoryTool(storyService: StoryService): RegisterToolResult {
  const definition: Tool = {
    name: 'get_story',
    description: 'Read the collective memory (story.md) — shared context for all agents.',
    inputSchema: { type: 'object', properties: {} },
  };

  const handler: ToolHandler = async (): Promise<CallToolResult> => {
    const story = await storyService.getStory();
    return { content: [{ type: 'text', text: story }] };
  };

  return { definition, handler };
}
