import { apiFetch } from './api-client';

export interface Notification {
  id: string;
  user_id: string | null;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

export const listNotifications = (token: string, limit = 30) =>
  apiFetch<Notification[]>(`/api/v1/notifications?limit=${limit}`, {}, token);

export const markNotificationRead = (token: string, id: string) =>
  apiFetch<Notification>(`/api/v1/notifications/${id}/read`, { method: 'POST' }, token);
