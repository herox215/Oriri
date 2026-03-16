import { cp, mkdir, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { loadConfig } from '../config/config-loader.js';
import { BackupError } from '../shared/errors.js';

const execFileAsync = promisify(execFile);

function makeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function runGitSnapshot(cwd: string, timestamp: string): Promise<void> {
  try {
    await execFileAsync('git', ['add', '.oriri'], { cwd });
    await execFileAsync(
      'git',
      ['commit', '-m', `[auto] Oriri snapshot ${timestamp}`, '--allow-empty'],
      { cwd },
    );
  } catch {
    // git snapshot is best-effort — do not fail the backup if git is unavailable
  }
}

export async function backupCommand(options: { target?: string; cwd?: string }): Promise<void> {
  const workDir = options.cwd ?? process.cwd();
  const basePath = join(workDir, '.oriri');

  const exists = await access(basePath)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    throw new BackupError('.oriri/ not found — run "oriri init" first');
  }

  const config = await loadConfig(basePath);

  const targetRoot = options.target ?? join(workDir, 'oriri-backups');
  await mkdir(targetRoot, { recursive: true });

  const timestamp = makeTimestamp();
  const dest = join(targetRoot, `oriri-backup-${timestamp}`);

  try {
    await cp(basePath, dest, { recursive: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BackupError(`Failed to copy .oriri/ to ${dest}: ${message}`);
  }

  console.log(`Backup created: ${dest}`);

  if (config.mode === 'server' && config.backup?.auto_snapshot === true) {
    await runGitSnapshot(workDir, timestamp);
    console.log('Git snapshot committed.');
  }
}
