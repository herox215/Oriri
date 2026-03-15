import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';

import type { ToolDefinition, ToolResult } from './tool-types.js';

export interface CodeToolsDeps {
  projectRoot: string;
}

function ok(content: string): ToolResult {
  return { content };
}

function err(content: string): ToolResult {
  return { content, isError: true };
}

function validatePath(projectRoot: string, inputPath: string): string {
  const resolved = resolve(projectRoot, inputPath);
  if (!resolved.startsWith(projectRoot)) {
    throw new Error(`Path "${inputPath}" escapes project root`);
  }
  return resolved;
}

export function createCodeTools(deps: CodeToolsDeps): ToolDefinition[] {
  const { projectRoot } = deps;

  return [
    {
      name: 'read_file',
      description: 'Read the contents of a file relative to the project root.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the project root' },
        },
        required: ['path'],
      },
      async handler(input: unknown): Promise<ToolResult> {
        try {
          const { path } = input as { path: string };
          const fullPath = validatePath(projectRoot, path);
          const content = await readFile(fullPath, 'utf-8');
          return ok(content);
        } catch (error: unknown) {
          return err(error instanceof Error ? error.message : 'Failed to read file');
        }
      },
    },
    {
      name: 'write_file',
      description:
        'Write content to a file relative to the project root. Creates directories if needed.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the project root' },
          content: { type: 'string', description: 'The content to write' },
        },
        required: ['path', 'content'],
      },
      async handler(input: unknown): Promise<ToolResult> {
        try {
          const { path, content } = input as { path: string; content: string };
          const fullPath = validatePath(projectRoot, path);
          await mkdir(dirname(fullPath), { recursive: true });
          await writeFile(fullPath, content, 'utf-8');
          return ok(`File written: ${path}`);
        } catch (error: unknown) {
          return err(error instanceof Error ? error.message : 'Failed to write file');
        }
      },
    },
    {
      name: 'run_command',
      description:
        'Run a shell command in the project root. Returns stdout and stderr. Use for builds, tests, etc.',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The command to run (passed to /bin/sh -c)' },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 30000)',
          },
        },
        required: ['command'],
      },
      async handler(input: unknown): Promise<ToolResult> {
        try {
          const { command, timeout = 30_000 } = input as { command: string; timeout?: number };

          const result = await new Promise<{ stdout: string; stderr: string }>((res) => {
            execFile(
              '/bin/sh',
              ['-c', command],
              { cwd: projectRoot, timeout, maxBuffer: 1024 * 1024 },
              (error, stdout, stderr) => {
                if (error) {
                  // Include output even on error (non-zero exit)
                  res({
                    stdout,
                    stderr: `${stderr}\n[exit code: ${String(error.code ?? 'unknown')}]`,
                  });
                } else {
                  res({ stdout, stderr });
                }
              },
            );
          });

          const output = [result.stdout, result.stderr].filter(Boolean).join('\n---\n');
          return ok(output || '(no output)');
        } catch (error: unknown) {
          return err(error instanceof Error ? error.message : 'Failed to run command');
        }
      },
    },
    {
      name: 'search_files',
      description:
        'Search for files matching a pattern in the project. Returns file paths and optionally matching lines.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Text pattern to search for in file contents (simple substring match)',
          },
          path: {
            type: 'string',
            description: 'Subdirectory to search in (relative to project root, default: ".")',
          },
        },
        required: ['pattern'],
      },
      async handler(input: unknown): Promise<ToolResult> {
        try {
          const { pattern, path: subPath = '.' } = input as { pattern: string; path?: string };
          const searchRoot = validatePath(projectRoot, subPath);

          const matches: string[] = [];
          await searchDir(searchRoot, pattern, projectRoot, matches);

          if (matches.length === 0) {
            return ok(`No matches found for "${pattern}".`);
          }
          return ok(matches.join('\n'));
        } catch (error: unknown) {
          return err(error instanceof Error ? error.message : 'Failed to search files');
        }
      },
    },
  ];
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.oriri', 'dist', 'coverage']);

async function searchDir(
  dir: string,
  pattern: string,
  projectRoot: string,
  matches: string[],
  maxResults = 50,
): Promise<void> {
  if (matches.length >= maxResults) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (matches.length >= maxResults) break;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await searchDir(join(dir, entry.name), pattern, projectRoot, matches, maxResults);
    } else if (entry.isFile()) {
      try {
        const fullPath = join(dir, entry.name);
        const content = await readFile(fullPath, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(pattern)) {
            const relPath = fullPath.slice(projectRoot.length + 1);
            matches.push(`${relPath}:${String(i + 1)}: ${lines[i].trim()}`);
            if (matches.length >= maxResults) break;
          }
        }
      } catch {
        // Skip binary or unreadable files
      }
    }
  }
}
