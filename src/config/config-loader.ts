import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

import { ConfigNotFoundError, ConfigValidationError } from '../shared/errors.js';
import {
  LLM_PROVIDERS,
  STORAGE_MODES,
  type BackupConfig,
  type LLMProviderType,
  type OririConfig,
  type ProviderConfig,
  type StorageMode,
} from './config-types.js';

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

const ENV_VAR_PATTERN = /\$\{([^}]+)\}/g;

function resolveEnvVars(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (_match, varName: string) => {
    const resolved = process.env[varName];
    if (resolved === undefined) {
      throw new ConfigValidationError(
        `Environment variable ${varName} is not set (referenced in config.yaml)`,
      );
    }
    return resolved;
  });
}

function resolveEnvVarsDeep(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return resolveEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVarsDeep);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVarsDeep(value);
    }
    return result;
  }
  return obj;
}

function validateProvider(raw: unknown, index: number): ProviderConfig {
  const prefix = `provider[${String(index)}]`;

  if (raw === null || typeof raw !== 'object') {
    throw new ConfigValidationError(`${prefix} must be a mapping`);
  }

  const entry = raw as Record<string, unknown>;

  for (const field of ['name', 'model', 'key'] as const) {
    if (!(field in entry) || typeof entry[field] !== 'string') {
      throw new ConfigValidationError(`${prefix} is missing required string field: ${field}`);
    }
  }

  const name = entry['name'] as string;

  // Infer LLM provider type from name — must match a known provider
  if (!LLM_PROVIDERS.includes(name as LLMProviderType)) {
    // Allow any name; the LLM provider factory will validate at runtime
  }

  return {
    name,
    model: entry['model'] as string,
    key: entry['key'] as string,
  };
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

  const result: OririConfig = {
    mode: config['mode'] as StorageMode,
  };

  if ('provider' in config && config['provider'] !== undefined) {
    if (!Array.isArray(config['provider'])) {
      throw new ConfigValidationError('provider must be a list');
    }
    result.provider = config['provider'].map((entry: unknown, index: number) =>
      validateProvider(entry, index),
    );
  }

  if ('backup' in config && config['backup'] !== undefined) {
    if (config['backup'] === null || typeof config['backup'] !== 'object') {
      throw new ConfigValidationError('backup must be a mapping');
    }
    const backup = config['backup'] as Record<string, unknown>;
    const backupConfig: BackupConfig = {};
    if ('auto_snapshot' in backup && backup['auto_snapshot'] !== undefined) {
      if (typeof backup['auto_snapshot'] !== 'boolean') {
        throw new ConfigValidationError('backup.auto_snapshot must be a boolean');
      }
      backupConfig.auto_snapshot = backup['auto_snapshot'];
    }
    result.backup = backupConfig;
  }

  return result;
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

  const resolved = resolveEnvVarsDeep(parsed);

  return validateConfig(resolved);
}
