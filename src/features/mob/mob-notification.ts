import type { LatLon } from '$shared/geo';
import { formatLatitude, formatLongitude } from '$shared/lib';

export interface MobNotificationValue {
  state: 'emergency' | 'normal';
  method: string[];
  message: string;
  // Not in the notification schema proper, but carried so other clients can mark the spot.
  position?: LatLon;
}

export function mobNotification(position: LatLon): MobNotificationValue {
  return {
    state: 'emergency',
    method: ['visual', 'sound'],
    message: `Man overboard at ${formatLatitude(position.latitude)} ${formatLongitude(position.longitude)}`,
    position,
  };
}

export function mobClearNotification(): MobNotificationValue {
  return { state: 'normal', method: [], message: 'Man overboard cleared' };
}
