const assert = require('node:assert/strict');
const test = require('node:test');

const stageRoutes = require('../src/routes/stage.routes');

test('pending stage invites are mounted as an authenticated GET route', () => {
  const pendingRoute = stageRoutes.stack
    .map((layer) => layer.route)
    .find((route) => route?.path === '/invites/pending');

  assert.ok(pendingRoute, 'the pending invite route must be registered');
  assert.equal(pendingRoute.methods.get, true);
  assert.equal(pendingRoute.stack.length, 2, 'authentication must run before the controller');
});
