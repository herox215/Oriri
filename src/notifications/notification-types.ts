export interface NotificationConfig {
  events: {
    needsHuman: boolean;
    openConsent: boolean;
    agentSilent: boolean;
    taskDone: boolean;
  };
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  events: {
    needsHuman: true,
    openConsent: true,
    agentSilent: true,
    taskDone: false,
  },
};

export interface OsNotification {
  title: string;
  message: string;
}
