import { WatcherError } from '../shared/errors.js';
import { NodeNotifierService, NotificationWatcher, readWatcherPid } from '../notifications/index.js';

export function watchCommand(basePath: string, opts: { stop: boolean }): void {
  if (opts.stop) {
    const pid = readWatcherPid(basePath);
    if (pid === null) {
      throw new WatcherError('No running watcher found (watcher.pid not found)');
    }
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`Oriri watcher (PID ${String(pid)}) stopped.`);
    } catch {
      throw new WatcherError(
        `Failed to stop watcher with PID ${String(pid)} — process may have already exited`,
      );
    }
    return;
  }

  const notificationService = new NodeNotifierService();
  const watcher = new NotificationWatcher({ basePath, notificationService });

  const shutdown = (): void => {
    watcher.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  watcher.start();
  console.log(`Oriri watcher started (PID ${String(process.pid)}). Press Ctrl+C to stop.`);
}
