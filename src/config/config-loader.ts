import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

import { ConfigNotFoundError, ConfigValidationError } from '../shared/errors.js';
import {
  AGENT_ROLES,
  STORAGE_MODES,
  type AgentConfig,
  type AgentRole,
  type OririConfig,
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

function validateAgent(raw: unknown, index: number): AgentConfig {
  const prefix = `agents[${String(index)}]`;

  if (raw === null || typeof raw !== 'object') {
    throw new ConfigValidationError(`${prefix} must be a mapping`);
  }

  const agent = raw as Record<string, unknown>;

  for (const field of ['id', 'display_name', 'model', 'role'] as const) {
    if (!(field in agent) || typeof agent[field] !== 'string') {
      throw new ConfigValidationError(`${prefix} is missing required string field: ${field}`);
    }
  }

  const role = agent['role'] as string;
  if (!AGENT_ROLES.includes(role as AgentRole)) {
    throw new ConfigValidationError(
      `${prefix}.role "${role}" is invalid. Must be one of: ${AGENT_ROLES.join(', ')}`,
    );
  }

  if ('capabilities' in agent && agent['capabilities'] !== undefined) {
    if (
      !Array.isArray(agent['capabilities']) ||
      !agent['capabilities'].every((c: unknown): c is string => typeof c === 'string')
    ) {
      throw new ConfigValidationError(`${prefix}.capabilities must be a list of strings`);
    }
  }

  if (
    'api_key' in agent &&
    agent['api_key'] !== undefined &&
    typeof agent['api_key'] !== 'string'
  ) {
    throw new ConfigValidationError(`${prefix}.api_key must be a string`);
  }

  const result: AgentConfig = {
    id: agent['id'] as string,
    display_name: agent['display_name'] as string,
    model: agent['model'] as string,
    role: agent['role'] as AgentRole,
  };

  if (typeof agent['api_key'] === 'string') {
    result.api_key = agent['api_key'];
  }

  if (Array.isArray(agent['capabilities'])) {
    result.capabilities = agent['capabilities'] as string[];
  }

  return result;
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

  if ('agents' in config && config['agents'] !== undefined) {
    if (!Array.isArray(config['agents'])) {
      throw new ConfigValidationError('agents must be a list');
    }
    result.agents = config['agents'].map((entry: unknown, index: number) =>
      validateAgent(entry, index),
    );
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
