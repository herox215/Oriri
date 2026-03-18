import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { InitError } from '../shared/errors.js';
import {
  CONFIG_YAML,
  STORY_MD,
  STORY_ARCHIVE_MD,
  RULES_MD,
  ACTIVE_AGENTS_MD,
} from '../shared/default-content.js';

export async function initCommand(options: { force: boolean; cwd?: string }): Promise<void> {
  const baseDir = join(options.cwd ?? process.cwd(), '.oriri');

  const exists = await access(baseDir)
    .then(() => true)
    .catch(() => false);

  if (exists && !options.force) {
    throw new InitError(`.oriri/ already exists. Use "oriri init --force" to reinitialize.`);
  }

  if (exists && options.force) {
    console.log('Warning: .oriri/ already exists. Reinitializing with --force.');
  }

  await mkdir(join(baseDir, 'tasks'), { recursive: true });
  await mkdir(join(baseDir, 'human-tasks'), { recursive: true });
  await mkdir(join(baseDir, 'agent-tasks'), { recursive: true });
  await mkdir(join(baseDir, 'agents'), { recursive: true });

  const files: Array<[string, string]> = [
    ['config.yaml', CONFIG_YAML],
    ['story.md', STORY_MD],
    ['story.archive.md', STORY_ARCHIVE_MD],
    ['rules.md', RULES_MD],
    [join('agents', 'active.md'), ACTIVE_AGENTS_MD],
  ];

  for (const [relativePath, content] of files) {
    await writeFile(join(baseDir, relativePath), content, 'utf-8');
  }

  console.log('Initialized Oriri in .oriri/');
}
