import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LogLevelFilter, LEVELS } from '../src/core.js';

// ---- LEVELS constant -------------------------------------------------------

test('LEVELS is frozen and has the expected entries', () => {
  assert.equal(Object.isFrozen(LEVELS), true);
  assert.deepEqual({ ...LEVELS }, {
    silent: 0, trace: 1, debug: 2, info: 3, warn: 4, error: 5, fatal: 6,
  });
});

test('severity ordering: silent < trace < debug < info < warn < error < fatal', () => {
  assert.ok(LEVELS.silent < LEVELS.trace);
  assert.ok(LEVELS.trace < LEVELS.debug);
  assert.ok(LEVELS.debug < LEVELS.info);
  assert.ok(LEVELS.info < LEVELS.warn);
  assert.ok(LEVELS.warn < LEVELS.error);
  assert.ok(LEVELS.error < LEVELS.fatal);
});

// ---- Defaults --------------------------------------------------------------

test('default root threshold is info', () => {
  const f = new LogLevelFilter();
  assert.equal(f.getThreshold('anything'), 'info');
  assert.equal(f.getThreshold('app.db.pool'), 'info');
});

test('default shouldLog respects info threshold', () => {
  const f = new LogLevelFilter();
  assert.equal(f.shouldLog('app', 'info'), true);
  assert.equal(f.shouldLog('app', 'debug'), false);
  assert.equal(f.shouldLog('app', 'warn'), true);
  assert.equal(f.shouldLog('app', 'error'), true);
  assert.equal(f.shouldLog('app', 'trace'), false);
});

// ---- Constructor initial thresholds ---------------------------------------

test('constructor accepts initial thresholds including root', () => {
  const f = new LogLevelFilter({ '': 'warn', 'app.db': 'debug' });
  assert.equal(f.getThreshold('app'), 'warn');
  assert.equal(f.getThreshold('app.db'), 'debug');
  assert.equal(f.getThreshold('app.db.pool'), 'debug');
  assert.equal(f.getThreshold('other'), 'warn');
});

test('constructor with null initial is treated as no overrides', () => {
  const f = new LogLevelFilter(null);
  assert.equal(f.getThreshold('app'), 'info');
});

test('constructor with non-object initial throws TypeError', () => {
  assert.throws(() => new LogLevelFilter(42), /must be an object/);
  assert.throws(() => new LogLevelFilter('info'), /must be an object/);
});

// ---- setThreshold / getThreshold ------------------------------------------

test('setThreshold overrides root and specific namespaces', () => {
  const f = new LogLevelFilter();
  f.setThreshold('', 'warn');
  assert.equal(f.getThreshold('app'), 'warn');
  f.setThreshold('app', 'debug');
  assert.equal(f.getThreshold('app'), 'debug');
  assert.equal(f.getThreshold('other'), 'warn');
});

test('setThreshold with unknown level throws RangeError', () => {
  const f = new LogLevelFilter();
  assert.throws(() => f.setThreshold('app', 'war'), /Unknown log level: war/);
  assert.throws(() => f.setThreshold('app', 'verbose'), /Unknown log level: verbose/);
});

test('setThreshold with non-string level throws TypeError', () => {
  const f = new LogLevelFilter();
  assert.throws(() => f.setThreshold('app', 3), /level must be a string/);
});

test('setThreshold with non-string namespace throws TypeError', () => {
  const f = new LogLevelFilter();
  assert.throws(() => f.setThreshold(42, 'info'), /namespace must be a string/);
});

// ---- Longest-prefix matching ----------------------------------------------

test('longest-prefix match wins over shorter prefixes', () => {
  const f = new LogLevelFilter();
  f.setThreshold('', 'error');
  f.setThreshold('app', 'warn');
  f.setThreshold('app.db', 'debug');
  f.setThreshold('app.db.pool', 'trace');

  assert.equal(f.getThreshold('app'), 'warn');
  assert.equal(f.getThreshold('app.cache'), 'warn');
  assert.equal(f.getThreshold('app.db'), 'debug');
  assert.equal(f.getThreshold('app.db.schema'), 'debug');
  assert.equal(f.getThreshold('app.db.pool'), 'trace');
  assert.equal(f.getThreshold('app.db.pool.conn'), 'trace');
  assert.equal(f.getThreshold('other'), 'error');
});

test('exact namespace match beats parent prefix', () => {
  const f = new LogLevelFilter();
  f.setThreshold('app', 'error');
  f.setThreshold('app.db', 'trace');
  assert.equal(f.getThreshold('app.db'), 'trace');
  assert.equal(f.shouldLog('app.db', 'trace'), true);
  assert.equal(f.shouldLog('app', 'trace'), false);
});

test('namespace with empty segments still resolves via prefix walk', () => {
  // "app..db" splits to ['app', '', 'db']; the prefixes are "app", "app.",
  // and "app..db". Only thresholds we set explicitly will match.
  const f = new LogLevelFilter();
  f.setThreshold('app', 'warn');
  assert.equal(f.getThreshold('app..db'), 'warn');
  f.setThreshold('app..db', 'trace');
  assert.equal(f.getThreshold('app..db'), 'trace');
});

// ---- shouldLog gating ------------------------------------------------------

test('shouldLog true when message severity >= threshold', () => {
  const f = new LogLevelFilter();
  f.setThreshold('app', 'warn');
  assert.equal(f.shouldLog('app', 'warn'), true);
  assert.equal(f.shouldLog('app', 'error'), true);
  assert.equal(f.shouldLog('app', 'fatal'), true);
  assert.equal(f.shouldLog('app', 'info'), false);
  assert.equal(f.shouldLog('app', 'debug'), false);
  assert.equal(f.shouldLog('app', 'trace'), false);
});

test('shouldLog with trace threshold passes everything except silent', () => {
  const f = new LogLevelFilter();
  f.setThreshold('app', 'trace');
  assert.equal(f.shouldLog('app', 'trace'), true);
  assert.equal(f.shouldLog('app', 'debug'), true);
  assert.equal(f.shouldLog('app', 'info'), true);
  assert.equal(f.shouldLog('app', 'warn'), true);
  assert.equal(f.shouldLog('app', 'error'), true);
  assert.equal(f.shouldLog('app', 'fatal'), true);
});

test('shouldLog with fatal threshold passes only fatal', () => {
  const f = new LogLevelFilter();
  f.setThreshold('app', 'fatal');
  assert.equal(f.shouldLog('app', 'fatal'), true);
  assert.equal(f.shouldLog('app', 'error'), false);
  assert.equal(f.shouldLog('app', 'trace'), false);
});

test('shouldLog with unknown message level throws RangeError', () => {
  const f = new LogLevelFilter();
  assert.throws(() => f.shouldLog('app', 'verbose'), /Unknown log level: verbose/);
});

// ---- silent semantics ------------------------------------------------------

test('silent threshold passes every real level', () => {
  const f = new LogLevelFilter();
  f.setThreshold('app', 'silent');
  assert.equal(f.shouldLog('app', 'trace'), true);
  assert.equal(f.shouldLog('app', 'debug'), true);
  assert.equal(f.shouldLog('app', 'info'), true);
  assert.equal(f.shouldLog('app', 'warn'), true);
  assert.equal(f.shouldLog('app', 'error'), true);
  assert.equal(f.shouldLog('app', 'fatal'), true);
});

test('silent as a message level never propagates under a real threshold', () => {
  const f = new LogLevelFilter();
  f.setThreshold('app', 'trace');
  assert.equal(f.shouldLog('app', 'silent'), false);
});

test('silent message propagates only when threshold is also silent', () => {
  const f = new LogLevelFilter();
  f.setThreshold('app', 'silent');
  assert.equal(f.shouldLog('app', 'silent'), true);
});

test('setting root to silent mutes all namespaces without explicit override', () => {
  const f = new LogLevelFilter();
  f.setThreshold('', 'silent');
  f.setThreshold('app.loud', 'debug');
  assert.equal(f.shouldLog('app.loud', 'debug'), true);
  assert.equal(f.shouldLog('app.quiet', 'debug'), true); // silent threshold passes all
  assert.equal(f.shouldLog('app.quiet', 'trace'), true);
});

// ---- unsetThreshold --------------------------------------------------------

test('unsetThreshold removes override and falls back to parent', () => {
  const f = new LogLevelFilter();
  f.setThreshold('', 'warn');
  f.setThreshold('app', 'debug');
  f.setThreshold('app.db', 'trace');
  assert.equal(f.getThreshold('app.db'), 'trace');
  assert.equal(f.unsetThreshold('app.db'), true);
  assert.equal(f.getThreshold('app.db'), 'debug');
});

test('unsetThreshold on non-existent threshold returns false', () => {
  const f = new LogLevelFilter();
  assert.equal(f.unsetThreshold('app.never'), false);
});

test('unsetThreshold on root returns false and leaves root intact', () => {
  const f = new LogLevelFilter();
  assert.equal(f.unsetThreshold(''), false);
  assert.equal(f.getThreshold('app'), 'info');
});

// ---- root namespace handling ----------------------------------------------

test('root namespace getThreshold returns canonical name', () => {
  const f = new LogLevelFilter();
  assert.equal(f.getThreshold(''), 'info');
  f.setThreshold('', 'error');
  assert.equal(f.getThreshold(''), 'error');
});

test('shouldLog on root namespace uses root threshold', () => {
  const f = new LogLevelFilter();
  f.setThreshold('', 'warn');
  assert.equal(f.shouldLog('', 'warn'), true);
  assert.equal(f.shouldLog('', 'debug'), false);
});
