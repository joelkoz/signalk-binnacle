import { vesselLabel } from '$entities/ais';
import type { Assessment } from '$entities/collision';
import { formatNm, formatTcpaMin } from '$shared/lib';

// The Signal K path Binnacle publishes its collision alert to, so other clients and
// devices on the boat see the same alarm.
export const NOTIFICATION_PATH = 'notifications.navigation.collision';

export type NotificationState = 'normal' | 'warn' | 'alarm';

export interface SkNotification {
  state: NotificationState;
  method: string[];
  message: string;
}

// The Signal K notification value for the current assessment. Danger raises an alarm with
// sound, a warning is a visual warn, and clear resets to normal.
export function buildNotification(assessment: Assessment): SkNotification {
  // worst is 'clear' exactly when there is no contact (assessContacts drops clear contacts),
  // so the empty check both clears the alert and narrows the type for the fields below.
  const top = assessment.contacts[0];
  if (!top) {
    return { state: 'normal', method: [], message: 'No collision risk' };
  }
  const name = vesselLabel(top.name, top.id);
  const cpa = formatNm(top.cpaMeters);
  const tcpa = formatTcpaMin(top.tcpaSeconds);
  const danger = assessment.worst === 'danger';
  return {
    state: danger ? 'alarm' : 'warn',
    method: danger ? ['visual', 'sound'] : ['visual'],
    message: `Collision ${assessment.worst}: ${name} CPA ${cpa} nm, TCPA ${tcpa} min`,
  };
}

// The transport the notifier publishes through: the legacy v1 delta publish or a v2
// REST-backed strategy, injected so the notifier never knows which. A returned promise is
// fire-and-forget; the strategy owns its own degrade contract and never rejects.
export interface NotificationPublishStrategy {
  // biome-ignore lint/suspicious/noConfusingVoidType: a strategy is either sync (void, the v1 delta publish) or async (a Promise, the v2 REST raise), and the caller fire-and-forgets either, so the union is intentional.
  publish(path: string, value: SkNotification): void | Promise<unknown>;
}

// Publishes the collision notification when its state, the worst contact, or that contact's
// coarse CPA or TCPA bucket changes, so the message refreshes as the contact closes without a
// server write on every per-second CPA tick. A clear is published only after an active alert,
// so loading the app does not write a redundant "normal".
export class CollisionNotifier {
  #publish: NotificationPublishStrategy['publish'];
  #last: string | undefined;
  #active = false;

  constructor(strategy: NotificationPublishStrategy) {
    this.#publish = (path, value) => strategy.publish(path, value);
  }

  update(assessment: Assessment): void {
    const value = buildNotification(assessment);
    const top = assessment.contacts[0];
    let signature: string = value.state;
    if (top) {
      const cpaBucket = Math.round(top.cpaMeters / 100);
      const tcpaBucket = Math.round(top.tcpaSeconds / 60);
      signature = `${value.state}|${top.id}|${cpaBucket}|${tcpaBucket}`;
    }
    if (signature === this.#last) return;
    this.#last = signature;
    if (value.state === 'normal' && !this.#active) return;
    this.#active = value.state !== 'normal';
    void this.#publish(NOTIFICATION_PATH, value);
  }
}
