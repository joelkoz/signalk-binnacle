import { describe, expect, it } from 'vitest';
import { SubscriptionRegistry } from './subscription-registry';
import type { Context, Path } from './types';

const path = (s: string) => s as Path;

describe('SubscriptionRegistry', () => {
  it('sends one subscribe on first demand for a path', () => {
    const sent: unknown[] = [];
    const reg = new SubscriptionRegistry((m) => sent.push(m));
    reg.add([{ path: path('navigation.position'), policy: 'instant', minPeriod: 1000 }]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      context: 'vessels.self',
      subscribe: [{ path: 'navigation.position', policy: 'instant', minPeriod: 1000 }],
    });
  });

  it('refcounts: a second demand for the same path does not resubscribe', () => {
    const sent: unknown[] = [];
    const reg = new SubscriptionRegistry((m) => sent.push(m));
    reg.add([{ path: path('navigation.position') }]);
    reg.add([{ path: path('navigation.position') }]);
    expect(sent).toHaveLength(1);
  });

  it('unsubscribes only when the last demand is released', () => {
    const sent: unknown[] = [];
    const reg = new SubscriptionRegistry((m) => sent.push(m));
    const off1 = reg.add([{ path: path('navigation.position') }]);
    const off2 = reg.add([{ path: path('navigation.position') }]);
    off1();
    expect(sent).toHaveLength(1);
    off2();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({
      context: 'vessels.self',
      unsubscribe: [{ path: 'navigation.position' }],
    });
  });

  it('resubscribeAll re-sends every active subscription', () => {
    const sent: unknown[] = [];
    const reg = new SubscriptionRegistry((m) => sent.push(m));
    reg.add([{ path: path('navigation.position') }]);
    reg.add([{ path: path('navigation.headingTrue'), context: 'vessels.*' as Context }]);
    sent.length = 0;
    reg.resubscribeAll();
    expect(sent).toHaveLength(2);
  });
});
