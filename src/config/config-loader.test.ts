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

  describe('minimal config', () => {
    it('should parse mode-only config', async () => {
      await writeConfig('mode: local');
      const config = await loadConfig(basePath);
      expect(config.mode).toBe('local');
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

  describe('mode validation', () => {
    it('should throw on invalid mode', async () => {
      await writeConfig('mode: distributed');
      await expect(loadConfig(basePath)).rejects.toThrow(ConfigValidationError);
      await expect(loadConfig(basePath)).rejects.toThrow('Invalid mode: "distributed"');
    });

    it('should throw on missing mode', async () => {
      await writeConfig('something: else');
      await expect(loadConfig(basePath)).rejects.toThrow(ConfigValidationError);
      await expect(loadConfig(basePath)).rejects.toThrow('Missing required field: mode');
    });
  });

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

  describe('edge cases', () => {
    it('should ignore unknown extra fields in config', async () => {
      await writeConfig('mode: local\nunknown_field: some_value');
      const config = await loadConfig(basePath);
      expect(config.mode).toBe('local');
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
