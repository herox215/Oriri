import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { StoryService } from '../story/story-service.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

export function createGetStoryTool(storyService: StoryService): RegisterToolResult {
  const definition: Tool = {
    name: 'get_story',
    description:
      'START HERE. Read this first before doing anything else. ' +
      'The story is the collective memory of the project — it tells you what happened, ' +
      'what is going on, and what decisions were made. ' +
      'Always read the story before listing or inspecting individual tasks.',
    inputSchema: { type: 'object', properties: {} },
  };

  const handler: ToolHandler = async (): Promise<CallToolResult> => {
    const story = await storyService.getStory();
    return { content: [{ type: 'text', text: story }] };
  };

  return { definition, handler };
}
