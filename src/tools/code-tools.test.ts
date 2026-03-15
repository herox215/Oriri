import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCodeTools } from './code-tools.js';
import type { ToolDefinition } from './tool-types.js';

function findTool(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool;
}

describe('createCodeTools', () => {
  let projectRoot: string;
  let tools: ToolDefinition[];

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'oriri-code-tools-'));
    tools = createCodeTools({ projectRoot });

    // Create test files
    await mkdir(join(projectRoot, 'src'), { recursive: true });
    await writeFile(join(projectRoot, 'src', 'index.ts'), 'export const hello = "world";\n');
    await writeFile(join(projectRoot, 'README.md'), '# Test Project\n');
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('should create all expected tools', () => {
    const names = tools.map((t) => t.name);
    expect(names).toEqual(['read_file', 'write_file', 'run_command', 'search_files']);
  });

  describe('read_file', () => {
    it('should read a file relative to project root', async () => {
      const tool = findTool(tools, 'read_file');
      const result = await tool.handler({ path: 'src/index.ts' });

      expect(result.content).toBe('export const hello = "world";\n');
      expect(result.isError).toBeUndefined();
    });

    it('should return error for nonexistent file', async () => {
      const tool = findTool(tools, 'read_file');
      const result = await tool.handler({ path: 'nonexistent.ts' });

      expect(result.isError).toBe(true);
    });

    it('should reject path traversal', async () => {
      const tool = findTool(tools, 'read_file');
      const result = await tool.handler({ path: '../../etc/passwd' });

      expect(result.isError).toBe(true);
      expect(result.content).toContain('escapes project root');
    });
  });

  describe('write_file', () => {
    it('should write a file relative to project root', async () => {
      const tool = findTool(tools, 'write_file');
      const result = await tool.handler({ path: 'src/new-file.ts', content: 'const x = 1;\n' });

      expect(result.content).toContain('File written');
      const written = await readFile(join(projectRoot, 'src', 'new-file.ts'), 'utf-8');
      expect(written).toBe('const x = 1;\n');
    });

    it('should create directories as needed', async () => {
      const tool = findTool(tools, 'write_file');
      await tool.handler({ path: 'a/b/c/deep.ts', content: 'deep\n' });

      const written = await readFile(join(projectRoot, 'a', 'b', 'c', 'deep.ts'), 'utf-8');
      expect(written).toBe('deep\n');
    });

    it('should reject path traversal', async () => {
      const tool = findTool(tools, 'write_file');
      const result = await tool.handler({ path: '../escape.txt', content: 'nope' });

      expect(result.isError).toBe(true);
      expect(result.content).toContain('escapes project root');
    });
  });

  describe('run_command', () => {
    it('should run a command and return output', async () => {
      const tool = findTool(tools, 'run_command');
      const result = await tool.handler({ command: 'echo hello' });

      expect(result.content).toContain('hello');
    });

    it('should include stderr on non-zero exit', async () => {
      const tool = findTool(tools, 'run_command');
      const result = await tool.handler({ command: 'exit 1' });

      expect(result.content).toContain('exit code');
    });

    it('should run in the project root', async () => {
      const tool = findTool(tools, 'run_command');
      const result = await tool.handler({ command: 'ls src/index.ts' });

      expect(result.content).toContain('index.ts');
    });
  });

  describe('search_files', () => {
    it('should find matching lines in files', async () => {
      const tool = findTool(tools, 'search_files');
      const result = await tool.handler({ pattern: 'hello' });

      expect(result.content).toContain('src/index.ts');
      expect(result.content).toContain('hello');
    });

    it('should search within a subdirectory', async () => {
      const tool = findTool(tools, 'search_files');
      const result = await tool.handler({ pattern: 'Test Project', path: '.' });

      expect(result.content).toContain('README.md');
    });

    it('should handle no matches', async () => {
      const tool = findTool(tools, 'search_files');
      const result = await tool.handler({ pattern: 'zzz_nonexistent_pattern_zzz' });

      expect(result.content).toContain('No matches found');
    });
  });
});
