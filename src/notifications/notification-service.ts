import notifier from 'node-notifier';
import type { OsNotification } from './notification-types.js';

export interface NotificationService {
  send(notification: OsNotification): void;
}

export class NodeNotifierService implements NotificationService {
  send(notification: OsNotification): void {
    notifier.notify({
      title: notification.title,
      message: notification.message,
    });
  }
}
