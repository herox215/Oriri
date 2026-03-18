import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { InitError } from '../shared/errors.js';
import { CONFIG_YAML } from '../shared/default-content.js';

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

  await writeFile(join(baseDir, 'config.yaml'), CONFIG_YAML, 'utf-8');

  console.log('Initialized Oriri in .oriri/');
}
