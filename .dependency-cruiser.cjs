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
      name: 'entities-go-down-only',
      severity: 'error',
      comment: 'entities may import shared only.',
      from: { path: '^src/entities' },
      to: { path: '^src/(features|widgets|views|app)' },
    },
    {
      name: 'features-go-down-only',
      severity: 'error',
      comment: 'features may import entities and shared only, never widgets, views, or app.',
      from: { path: '^src/features' },
      to: { path: '^src/(widgets|views|app)' },
    },
    {
      name: 'no-cross-feature',
      severity: 'error',
      comment:
        'A feature may import another feature only through its index public API, not its internals.',
      from: { path: '^src/features/([^/]+)/' },
      to: {
        path: '^src/features/(?!$1/)[^/]+/.+',
        pathNot: '^src/features/[^/]+/index\\.(ts|js)$',
      },
    },
    {
      name: 'widgets-go-down-only',
      severity: 'error',
      comment: 'widgets may import features, entities, and shared only, never views or app.',
      from: { path: '^src/widgets' },
      to: { path: '^src/(views|app)' },
    },
    {
      name: 'views-go-down-only',
      severity: 'error',
      comment: 'views may not import app.',
      from: { path: '^src/views' },
      to: { path: '^src/app' },
    },
    {
      name: 'shared-imports-nothing-above',
      severity: 'error',
      comment: 'shared is the lowest layer and must not import any layer above it.',
      from: { path: '^src/shared' },
      to: { path: '^src/(entities|features|widgets|views|app)' },
    },
    {
      name: 'no-cross-slice-shared',
      severity: 'error',
      comment:
        'A shared slice may import another shared slice only through its index public API, not its internals.',
      from: { path: '^src/shared/([^/]+)/' },
      to: {
        path: '^src/shared/(?!$1/)[^/]+/.+',
        pathNot: '^src/shared/[^/]+/index\\.(ts|js)$',
      },
    },
    {
      name: 'no-cross-slice-entities',
      severity: 'error',
      comment:
        'An entities slice may import another entities slice only through its index public API, not its internals.',
      from: { path: '^src/entities/([^/]+)/' },
      to: {
        path: '^src/entities/(?!$1/)[^/]+/.+',
        pathNot: '^src/entities/[^/]+/index\\.(ts|js)$',
      },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(\\.test\\.ts$|\\.spec\\.ts$)' },
  },
};
