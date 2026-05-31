module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make the graph impossible to reason about.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'layers-go-down-only',
      severity: 'error',
      comment: 'Lower FSD layers must not import higher ones.',
      from: { path: '^src/entities' },
      to: { path: '^src/(features|widgets|views|app)' },
    },
    {
      name: 'shared-imports-nothing-above',
      severity: 'error',
      comment: 'shared is the lowest layer and must not import any layer above it.',
      from: { path: '^src/shared' },
      to: { path: '^src/(entities|features|widgets|views|app)' },
    },
    {
      name: 'no-cross-feature-internals',
      severity: 'error',
      comment: 'A feature may import another feature only through its index public API.',
      from: { path: '^src/features/([^/]+)/.+' },
      to: {
        path: '^src/features/([^/]+)/.+',
        pathNot: ['^src/features/$1/.+', '^src/features/[^/]+/index\\.(ts|js)$'],
      },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(\\.test\\.ts$|\\.spec\\.ts$)' },
  },
};
