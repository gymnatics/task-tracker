export type Priority = "low" | "medium" | "high";
export type Recurrence =
  | { type: "none" }
  | { type: "daily"; interval: number }
  | { type: "weekly"; interval: number; weekdays: number[] }
  | { type: "monthly"; interval: number; day: number };

export type Task = {
  id: string;
  name: string;
  description?: string;
  priority: Priority;
  dueDate: string;
  createdAt: string;
  status: "active" | "paused" | "completed";
  recurrence: Recurrence;
  categories: string[];
  notifiedAt?: string;
};

export type SettingsModel = {
  inAppNotifications: boolean;
  emailNotifications: boolean;
  emailTo?: string;
  emailServiceId?: string;
  emailTemplateId?: string;
  emailPublicKey?: string;
  hasOnboarded?: boolean;
};
