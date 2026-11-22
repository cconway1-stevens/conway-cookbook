module.exports = {
  ci: {
    collect: {
      staticDistDir: 'dist',
      url: ['http://localhost/', 'http://localhost/recipes/apple-crumble-pie/', 'http://localhost/menu/'],
      numberOfRuns: 1,
    },
    assert: { assertions: { 'errors-in-console': 'warn', 'largest-contentful-paint': 'warn' } },
    upload: { target: 'filesystem', outputDir: '.lighthouseci/reports' },
  },
};
