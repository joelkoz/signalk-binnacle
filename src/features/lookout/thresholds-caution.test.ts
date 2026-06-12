import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '$shared/settings';
import { thresholdsCaution } from './thresholds-caution';

describe('thresholdsCaution', () => {
  it('passes the defaults silently', () => {
    expect(thresholdsCaution(DEFAULT_THRESHOLDS)).toBeUndefined();
  });

  it('flags a zero danger threshold as disabling the danger alarm', () => {
    expect(thresholdsCaution({ ...DEFAULT_THRESHOLDS, dangerCpaMeters: 0 })).toContain('disables');
    expect(thresholdsCaution({ ...DEFAULT_THRESHOLDS, dangerTcpaSeconds: 0 })).toContain(
      'disables',
    );
  });

  it('flags a danger threshold above its warning counterpart', () => {
    expect(thresholdsCaution({ ...DEFAULT_THRESHOLDS, dangerCpaMeters: 2000 })).toContain(
      'warning',
    );
    expect(thresholdsCaution({ ...DEFAULT_THRESHOLDS, dangerTcpaSeconds: 1300 })).toContain(
      'warning',
    );
  });

  it('accepts danger equal to warning', () => {
    expect(
      thresholdsCaution({
        ...DEFAULT_THRESHOLDS,
        dangerCpaMeters: DEFAULT_THRESHOLDS.warningCpaMeters,
        dangerTcpaSeconds: DEFAULT_THRESHOLDS.warningTcpaSeconds,
      }),
    ).toBeUndefined();
  });
});
