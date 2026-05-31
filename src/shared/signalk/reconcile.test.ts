import type { Context, Delta } from '@signalk/server-api';
import { describe, expect, it } from 'vitest';
import { reconcileDelta } from './reconcile';
import type { LeafWrite } from './types';

function collect(delta: Delta): LeafWrite[] {
  const out: LeafWrite[] = [];
  reconcileDelta(delta, (w) => out.push(w));
  return out;
}

describe('reconcileDelta', () => {
  it('flattens values with the delta context', () => {
    const delta = {
      context: 'vessels.self' as Context,
      updates: [
        {
          values: [
            { path: 'navigation.speedOverGround', value: 3.85 },
            { path: 'navigation.courseOverGroundTrue', value: 2.97 },
          ],
        },
      ],
    } as unknown as Delta;
    const writes = collect(delta);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual({
      context: 'vessels.self',
      path: 'navigation.speedOverGround',
      value: 3.85,
    });
  });

  it('defaults a missing context to vessels.self', () => {
    const delta = {
      updates: [{ values: [{ path: 'navigation.headingTrue', value: 1.1 }] }],
    } as unknown as Delta;
    expect(collect(delta)[0].context).toBe('vessels.self');
  });

  it('ignores meta-only updates', () => {
    const delta = {
      context: 'vessels.self' as Context,
      updates: [{ meta: [{ path: 'navigation.speedOverGround', value: { units: 'm/s' } }] }],
    } as unknown as Delta;
    expect(collect(delta)).toHaveLength(0);
  });

  it('tolerates updates with neither values nor meta', () => {
    const delta = {
      context: 'vessels.self' as Context,
      updates: [{}],
    } as unknown as Delta;
    expect(collect(delta)).toHaveLength(0);
  });
});
