import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigNotFoundError, ConfigValidationError } from '../shared/errors.js';
import { loadConfig } from './config-loader.js';

describe('loadConfig', () => {
  let testDir: string;
  let basePath: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'oriri-config-test-'));
    basePath = testDir;
    await mkdir(basePath, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  async function writeConfig(content: string): Promise<void> {
    await writeFile(join(basePath, 'config.yaml'), content, 'utf-8');
  }

  // Happy path

  describe('minimal config', () => {
    it('should parse mode-only config', async () => {
      await writeConfig('mode: local');
      const config = await loadConfig(basePath);
      expect(config.mode).toBe('local');
      expect(config.agents).toBeUndefined();
    });

    it('should accept mode: server', async () => {
      await writeConfig('mode: server');
      const config = await loadConfig(basePath);
      expect(config.mode).toBe('server');
    });

    it('should accept mode: hybrid', async () => {
      await writeConfig('mode: hybrid');
      const config = await loadConfig(basePath);
      expect(config.mode).toBe('hybrid');
    });
  });

  describe('full config with agents', () => {
    it('should parse agents with all fields', async () => {
      await writeConfig(`
mode: local
agents:
  - id: agent-alpha
    display_name: Alpha
    model: claude-sonnet-4-6
    role: AGENT
    api_key: sk-test-123
    capabilities:
      - typescript
      - testing
  - id: agent-beta
    display_name: Beta
    model: claude-haiku-4-5
    role: AGENT
`);
      const config = await loadConfig(basePath);
      expect(config.mode).toBe('local');
      expect(config.agents).toHaveLength(2);

      const agents = config.agents;
      expect(agents).toBeDefined();

      const alpha = agents?.[0];
      expect(alpha?.id).toBe('agent-alpha');
      expect(alpha?.display_name).toBe('Alpha');
      expect(alpha?.model).toBe('claude-sonnet-4-6');
      expect(alpha?.role).toBe('AGENT');
      expect(alpha?.api_key).toBe('sk-test-123');
      expect(alpha?.capabilities).toEqual(['typescript', 'testing']);

      const beta = agents?.[1];
      expect(beta?.id).toBe('agent-beta');
      expect(beta?.role).toBe('AGENT');
      expect(beta?.api_key).toBeUndefined();
      expect(beta?.capabilities).toBeUndefined();
    });

    it('should accept empty agents array', async () => {
      await writeConfig('mode: local\nagents: []');
      const config = await loadConfig(basePath);
      expect(config.agents).toEqual([]);
    });
  });

  // Environment variable resolution

  describe('environment variable resolution', () => {
    const ENV_KEY = 'ORIRI_TEST_API_KEY';
    const ENV_HOST = 'ORIRI_TEST_HOST';
    const ENV_PORT = 'ORIRI_TEST_PORT';

    afterEach(() => {
      process.env[ENV_KEY] = undefined;
      process.env[ENV_HOST] = undefined;
      process.env[ENV_PORT] = undefined;
    });

    it('should resolve ${ENV_VAR} in string values', async () => {
      process.env[ENV_KEY] = 'sk-resolved-key';
      await writeConfig(`
mode: local
agents:
  - id: agent-alpha
    display_name: Alpha
    model: claude-sonnet-4-6
    role: AGENT
    api_key: \${${ENV_KEY}}
`);
      const config = await loadConfig(basePath);
      expect(config.agents?.[0]?.api_key).toBe('sk-resolved-key');
    });

    it('should resolve partial substitution in strings', async () => {
      process.env[ENV_HOST] = 'localhost';
      process.env[ENV_PORT] = '8080';
      await writeConfig(`
mode: local
agents:
  - id: agent-alpha
    display_name: Alpha
    model: \${${ENV_HOST}}:\${${ENV_PORT}}
    role: AGENT
`);
      const config = await loadConfig(basePath);
      expect(config.agents?.[0]?.model).toBe('localhost:8080');
    });

    it('should throw ConfigValidationError for undefined env var', async () => {
      await writeConfig(`
mode: local
agents:
  - id: agent-alpha
    display_name: Alpha
    model: claude-sonnet-4-6
    role: AGENT
    api_key: \${NONEXISTENT_VAR_12345}
`);
      await expect(loadConfig(basePath)).rejects.toThrow(ConfigValidationError);
      await expect(loadConfig(basePath)).rejects.toThrow('NONEXISTENT_VAR_12345');
    });

    it('should not affect non-string values', async () => {
      await writeConfig('mode: local');
      const config = await loadConfig(basePath);
      expect(config.mode).toBe('local');
    });
  });

  // Mode validation

  describe('mode validation', () => {
    it('should throw on invalid mode', async () => {
      await writeConfig('mode: distributed');
      await expect(loadConfig(basePath)).rejects.toThrow(ConfigValidationError);
      await expect(loadConfig(basePath)).rejects.toThrow('Invalid mode: "distributed"');
    });

    it('should throw on missing mode', async () => {
      await writeConfig('agents: []');
      await expect(loadConfig(basePath)).rejects.toThrow(ConfigValidationError);
      await expect(loadConfig(basePath)).rejects.toThrow('Missing required field: mode');
    });
  });

  // Agent validation

  describe('agent validation', () => {
    it('should throw on missing required fields', async () => {
      await writeConfig(`
mode: local
agents:
  - id: agent-alpha
    display_name: Alpha
`);
      await expect(loadConfig(basePath)).rejects.toThrow(ConfigValidationError);
      await expect(loadConfig(basePath)).rejects.toThrow('agents[0]');
    });

    it('should throw on unknown role', async () => {
      await writeConfig(`
mode: local
agents:
  - id: agent-alpha
    display_name: Alpha
    model: claude-sonnet-4-6
    role: DEBUGGER
`);
      await expect(loadConfig(basePath)).rejects.toThrow(ConfigValidationError);
      await expect(loadConfig(basePath)).rejects.toThrow('agents[0].role "DEBUGGER" is invalid');
    });

    it('should throw on non-array agents', async () => {
      await writeConfig('mode: local\nagents: not-a-list');
      await expect(loadConfig(basePath)).rejects.toThrow(ConfigValidationError);
      await expect(loadConfig(basePath)).rejects.toThrow('agents must be a list');
    });

    it('should throw on non-string capabilities', async () => {
      await writeConfig(`
mode: local
agents:
  - id: agent-alpha
    display_name: Alpha
    model: claude-sonnet-4-6
    role: AGENT
    capabilities:
      - 123
`);
      await expect(loadConfig(basePath)).rejects.toThrow(ConfigValidationError);
      await expect(loadConfig(basePath)).rejects.toThrow('capabilities must be a list of strings');
    });

    it('should validate both roles', async () => {
      for (const role of ['AGENT', 'MCP_CLIENT']) {
        await writeConfig(`
mode: local
agents:
  - id: agent-test
    display_name: Test
    model: test-model
    role: ${role}
`);
        const config = await loadConfig(basePath);
        expect(config.agents?.[0]?.role).toBe(role);
      }
    });
  });

  // File errors

  describe('file errors', () => {
    it('should throw ConfigNotFoundError for missing config.yaml', async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), 'oriri-empty-'));
      try {
        await expect(loadConfig(emptyDir)).rejects.toThrow(ConfigNotFoundError);
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });

    it('should throw ConfigValidationError for invalid YAML syntax', async () => {
      await writeConfig('mode: local\n  bad indent: here\n: invalid');
      await expect(loadConfig(basePath)).rejects.toThrow(ConfigValidationError);
      await expect(loadConfig(basePath)).rejects.toThrow('Invalid YAML');
    });

    it('should throw ConfigValidationError for empty file', async () => {
      await writeConfig('');
      await expect(loadConfig(basePath)).rejects.toThrow(ConfigValidationError);
      await expect(loadConfig(basePath)).rejects.toThrow('Config must be a YAML mapping');
    });
  });

  // Edge cases

  describe('edge cases', () => {
    it('should ignore unknown extra fields in config', async () => {
      await writeConfig('mode: local\nunknown_field: some_value');
      const config = await loadConfig(basePath);
      expect(config.mode).toBe('local');
    });

    it('should ignore unknown extra fields in agent entries', async () => {
      await writeConfig(`
mode: local
agents:
  - id: agent-alpha
    display_name: Alpha
    model: claude-sonnet-4-6
    role: AGENT
    extra_field: extra_value
`);
      const config = await loadConfig(basePath);
      expect(config.agents?.[0]?.id).toBe('agent-alpha');
    });

    it('should handle config with comments', async () => {
      await writeConfig(`
# Oriri Configuration
mode: local  # local mode for MVP
`);
      const config = await loadConfig(basePath);
      expect(config.mode).toBe('local');
    });
  });
});
