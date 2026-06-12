import { withTimeout } from '$shared/lib';
import { authInit, deleteResource } from './resource';
import type { NotificationState } from './types';

// Thin client for the server's v2 Notifications API (signalk-server src/api/notifications).
// Raising returns a server-assigned uuid notification id; silence, acknowledge, update, and
// clear all address that id (the routes uuid-validate it, so there is no path-addressed form).
// Every call degrades to undefined or false on any failure and never throws.
const NOTIFICATIONS_API = '/signalk/v2/api/notifications';

export interface RaiseNotificationOptions {
  state: NotificationState;
  message: string;
  // Path to file the notification under (the server prefixes 'notifications.' when absent
  // from the value); defaults to notifications.{id} when omitted.
  path?: string;
  // Append the assigned id to the path, so repeated raises do not collide.
  idInPath?: boolean;
  includePosition?: boolean;
  includeCreatedAt?: boolean;
  data?: Record<string, unknown>;
}

export interface UpdateNotificationOptions {
  state?: NotificationState;
  message?: string;
  data?: Record<string, unknown>;
}

async function postJson(
  url: string,
  token: string | undefined,
  body?: unknown,
): Promise<Response | undefined> {
  try {
    return await fetch(
      url,
      withTimeout(
        authInit(token, {
          method: 'POST',
          ...(body !== undefined
            ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
            : {}),
        }),
      ),
    );
  } catch {
    return undefined;
  }
}

async function idFrom(response: Response | undefined): Promise<string | undefined> {
  if (!response?.ok) return undefined;
  try {
    const body = (await response.json()) as { id?: unknown };
    return typeof body?.id === 'string' ? body.id : undefined;
  } catch {
    return undefined;
  }
}

// Raise a new notification; the response carries the assigned id the caller needs for every
// follow-up (update, silence, acknowledge, clear).
export async function postNotification(
  base: string,
  token: string | undefined,
  options: RaiseNotificationOptions,
): Promise<string | undefined> {
  return idFrom(await postJson(`${base}${NOTIFICATIONS_API}`, token, options));
}

// The three ways an update lands: applied; the server no longer knows the id (a restart reaped
// it, so a fresh raise is right); or the transport failed (a fresh raise would also fail, and
// could orphan a still-raised duplicate once the link returns).
export type UpdateNotificationResult = 'updated' | 'missing' | 'failed';

// Update a raised notification in place (state, message, or data). A state change resets the
// server-side silenced and acknowledged flags.
export async function updateNotification(
  base: string,
  token: string | undefined,
  id: string,
  options: UpdateNotificationOptions,
): Promise<UpdateNotificationResult> {
  try {
    const response = await fetch(
      `${base}${NOTIFICATIONS_API}/${id}`,
      withTimeout(
        authInit(token, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options),
        }),
      ),
    );
    if (response.ok) return 'updated';
    // The server answers 400 "Notification not found!" for an unknown or reaped id, so only 400
    // warrants a re-raise; an auth refusal or absent API keeps the id and the caller's v1 delta
    // fallback carries the change.
    return response.status === 400 ? 'missing' : 'failed';
  } catch {
    return 'failed';
  }
}

// Clear a notification: the server sets its state to normal and emits the final delta
// (DELETE removes nothing immediately; a cleaner reaps normal-state entries later).
export async function resolveNotification(
  base: string,
  token: string | undefined,
  id: string,
): Promise<boolean> {
  return deleteResource(`${base}${NOTIFICATIONS_API}/${id}`, token);
}

export async function silenceNotification(
  base: string,
  token: string | undefined,
  id: string,
): Promise<boolean> {
  const response = await postJson(`${base}${NOTIFICATIONS_API}/${id}/silence`, token);
  return response?.ok ?? false;
}

export async function acknowledgeNotification(
  base: string,
  token: string | undefined,
  id: string,
): Promise<boolean> {
  const response = await postJson(`${base}${NOTIFICATIONS_API}/${id}/acknowledge`, token);
  return response?.ok ?? false;
}

// The server's MOB convenience route: raises an emergency at notifications.mob.{id} with
// position and createdAt included.
export async function postMobNotification(
  base: string,
  token: string | undefined,
  message?: string,
): Promise<string | undefined> {
  const body = message === undefined ? {} : { message };
  return idFrom(await postJson(`${base}${NOTIFICATIONS_API}/mob`, token, body));
}
