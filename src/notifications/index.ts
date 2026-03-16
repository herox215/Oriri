export type { NotificationService } from './notification-service.js';
export { NodeNotifierService } from './notification-service.js';
export type { NotificationConfig, OsNotification } from './notification-types.js';
export { DEFAULT_NOTIFICATION_CONFIG } from './notification-types.js';
export {
  NotificationWatcher,
  readWatcherPid,
  shouldNotifyTaskChange,
  shouldNotifyA2AChange,
} from './notification-watcher.js';
