// The first Intl call in a process loads ICU locale data, which on a cold Windows CI runner can
// take seconds and has blown the per-test timeout in clock-formatting tests (v0.6.0 release run).
// Paying that cost here, once per worker and outside any test's budget, removes the flake for
// every Intl-using test.
new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date());
new Intl.NumberFormat().format(1234.5);
