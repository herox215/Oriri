import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

import { ConfigNotFoundError, ConfigValidationError } from '../shared/errors.js';
import { STORAGE_MODES, type OririConfig, type StorageMode } from './config-types.js';

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function validateConfig(raw: unknown): OririConfig {
  if (raw === null || typeof raw !== 'object') {
    throw new ConfigValidationError('Config must be a YAML mapping');
  }

  const config = raw as Record<string, unknown>;

  if (!('mode' in config)) {
    throw new ConfigValidationError('Missing required field: mode');
  }

  if (
    typeof config['mode'] !== 'string' ||
    !STORAGE_MODES.includes(config['mode'] as StorageMode)
  ) {
    throw new ConfigValidationError(
      `Invalid mode: "${String(config['mode'])}". Must be one of: ${STORAGE_MODES.join(', ')}`,
    );
  }

  return {
    mode: config['mode'] as StorageMode,
  };
}

export async function loadConfig(basePath: string): Promise<OririConfig> {
  const configPath = join(basePath, 'config.yaml');

  let raw: string;
  try {
    raw = await readFile(configPath, 'utf-8');
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new ConfigNotFoundError(configPath);
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown parse error';
    throw new ConfigValidationError(`Invalid YAML: ${message}`);
  }

  return validateConfig(parsed);
}
