import { watch, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractStatusFromMarkdown } from '../tasks/task-markdown.js';
import { extractA2AStatusFromMarkdown, extractA2ATypeFromMarkdown } from '../a2a/a2a-markdown.js';
import type { NotificationService } from './notification-service.js';
import {
  DEFAULT_NOTIFICATION_CONFIG,
  type NotificationConfig,
  type OsNotification,
} from './notification-types.js';

const DEBOUNCE_MS = 300;
const PID_FILENAME = 'watcher.pid';

export interface NotificationWatcherDeps {
  basePath: string;
  notificationService: NotificationService;
  config?: NotificationConfig;
}

function extractIdFromMarkdown(markdown: string): string | null {
  const match = /\| id \| (\S+)/.exec(markdown);
  return match?.[1] ?? null;
}

export function shouldNotifyTaskChange(
  markdown: string,
  config: NotificationConfig,
): OsNotification | null {
  const status = extractStatusFromMarkdown(markdown);
  if (!status) return null;

  if (status === 'needs_human' && config.events.needsHuman) {
    const id = extractIdFromMarkdown(markdown) ?? 'unknown';
    return { title: 'Oriri — Human Gate', message: `Task ${id} needs your attention` };
  }

  if (status === 'done' && config.events.taskDone) {
    const id = extractIdFromMarkdown(markdown) ?? 'unknown';
    return { title: 'Oriri — Task Done', message: `Task ${id} completed` };
  }

  return null;
}

export function shouldNotifyA2AChange(
  markdown: string,
  config: NotificationConfig,
): OsNotification | null {
  const status = extractA2AStatusFromMarkdown(markdown);
  if (status !== 'open') return null;

  const type = extractA2ATypeFromMarkdown(markdown);
  if (!type) return null;

  if (type === 'agent_silent') {
    if (!config.events.agentSilent) return null;
    const id = extractIdFromMarkdown(markdown) ?? 'unknown';
    return { title: 'Oriri — Agent Stale', message: `Agent silent detected (${id})` };
  }

  // TODO: detect H2A response when H2A feature is implemented

  if (config.events.openConsent) {
    const id = extractIdFromMarkdown(markdown) ?? 'unknown';
    return { title: 'Oriri — Consent Needed', message: `Vote required on ${type} (${id})` };
  }

  return null;
}

export class NotificationWatcher {
  private watcher: ReturnType<typeof watch> | null = null;
  private readonly debounceMap = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly config: NotificationConfig;

  constructor(private readonly deps: NotificationWatcherDeps) {
    this.config = deps.config ?? DEFAULT_NOTIFICATION_CONFIG;
  }

  start(): void {
    if (this.watcher) return;

    this.writePid();

    this.watcher = watch(this.deps.basePath, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      this.handleFileChange(filename);
    });

    this.watcher.on('error', (err) => {
      console.error(`Oriri watcher error: ${err.message}`);
    });
  }

  stop(): void {
    for (const timer of this.debounceMap.values()) {
      clearTimeout(timer);
    }
    this.debounceMap.clear();

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    this.deletePid();
  }

  private handleFileChange(filename: string): void {
    const existing = this.debounceMap.get(filename);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceMap.delete(filename);
      void this.processFile(filename);
    }, DEBOUNCE_MS);

    this.debounceMap.set(filename, timer);
  }

  private async processFile(filename: string): Promise<void> {
    const isTask = /^tasks\/task-[^/]+\.md$/.test(filename) && !filename.endsWith('.log.md');
    const isA2A = /^agent-tasks\/a2a-[^/]+\.md$/.test(filename);

    if (!isTask && !isA2A) return;

    const fullPath = join(this.deps.basePath, filename);
    let markdown: string;
    try {
      markdown = await readFile(fullPath, 'utf8');
    } catch {
      return;
    }

    let notification: OsNotification | null = null;
    if (isTask) {
      notification = shouldNotifyTaskChange(markdown, this.config);
    } else {
      notification = shouldNotifyA2AChange(markdown, this.config);
    }

    if (notification) {
      this.deps.notificationService.send(notification);
    }
  }

  private pidPath(): string {
    return join(this.deps.basePath, PID_FILENAME);
  }

  private writePid(): void {
    try {
      writeFileSync(this.pidPath(), String(process.pid), 'utf8');
    } catch {
      // Non-fatal — watcher still works without PID file
    }
  }

  private deletePid(): void {
    try {
      unlinkSync(this.pidPath());
    } catch {
      // Already gone — ignore
    }
  }
}

export function readWatcherPid(basePath: string): number | null {
  try {
    const content = readFileSync(join(basePath, PID_FILENAME), 'utf8').trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}
