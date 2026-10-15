/**
 * Core implementation of hierarchical log level filtering.
 *
 * Design decisions (stated plainly so the reader knows exactly what they get):
 *
 * 1. Severity ordering is trace < debug < info < warn < error < fatal.
 *    "silent" is special: it is both the minimum-value sentinel (so every real
 *    level passes it) and the name used when a namespace is fully muted.
 *    This double duty is intentional — there is no separate "off" concept.
 *
 * 2. Thresholds are per-namespace and looked up by longest-prefix match on the
 *    dot-separated namespace. If you set "app" to "warn" and "app.db" to
 *    "debug", a message under "app.db.pool" uses the "app.db" threshold
 *    ("debug"), while "app.cache" uses the "app" threshold ("warn").
 *    An exact namespace always wins over a prefix of the same length by
 *    construction, because exact match is a prefix of itself and is set
 *    explicitly.
 *
 * 3. The root threshold (empty-string namespace "") is the fallback. It
 *    defaults to "info". Setting it to "silent" mutes everything that has no
 *    more specific threshold.
 *
 * 4. shouldLog(namespace, level) returns a boolean. It does not format or
 *    transport — that is the caller's job. Keeping this library to a single
 *    responsibility is the point.
 *
 * 5. Unknown level strings throw. A typo like "war" should not silently pass
 *    everything; failing loud at configuration time is cheaper than losing logs
 *    in production.
 */

/**
 * Frozen map of level name to numeric severity.
 * Higher number = more severe.
 */
export const LEVELS = Object.freeze({
  silent: 0,
  trace: 1,
  debug: 2,
  info: 3,
  warn: 4,
  error: 5,
  fatal: 6,
});

/**
 * Reverse lookup: numeric severity to canonical name.
 * Built from LEVELS so the two can never drift apart.
 */
const NAMES = Object.freeze(
  Object.fromEntries(
    Object.entries(LEVELS).map(([name, value]) => [value, name])
  )
);

/**
 * @param {string} level
 * @returns {number} numeric severity
 * @throws {RangeError} if the level is not a known name
 */
function toValue(level) {
  if (typeof level !== 'string') {
    throw new TypeError(`level must be a string, got ${typeof level}`);
  }
  const v = LEVELS[level];
  if (v === undefined) {
    throw new RangeError(`Unknown log level: ${level}`);
  }
  return v;
}

/**
 * @param {string} ns
 * @returns {string[]} dot-separated segments, or [''] for the root
 */
function segments(ns) {
  if (ns === '') return [''];
  return ns.split('.');
}

export class LogLevelFilter {
  /**
   * @param {{ '': string } & Record<string, string>} [initial]
   *   Optional initial thresholds. Pass { '': 'warn' } to set the root.
   *   Keys are dot-separated namespaces; values are level names.
   */
  constructor(initial) {
    /** @type {Map<string, number>} */
    this.thresholds = new Map();
    // Root defaults to info. Done before applying `initial` so an explicit
    // '' in the initial map still overrides it.
    this.thresholds.set('', LEVELS.info);
    if (initial !== undefined && initial !== null) {
      if (typeof initial !== 'object') {
        throw new TypeError('initial thresholds must be an object');
      }
      for (const [ns, level] of Object.entries(initial)) {
        this.setThreshold(ns, level);
      }
    }
  }

  /**
   * Set the threshold for a namespace.
   * @param {string} namespace dot-separated, or '' for root
   * @param {string} level one of the names in LEVELS
   * @throws {RangeError} on unknown level
   */
  setThreshold(namespace, level) {
    if (typeof namespace !== 'string') {
      throw new TypeError('namespace must be a string');
    }
    const value = toValue(level);
    this.thresholds.set(namespace, value);
  }

  /**
   * Get the threshold for a namespace by longest-prefix match, falling back
   * to the root ('') which is always present.
   * @param {string} namespace
   * @returns {string} canonical level name
   */
  getThreshold(namespace) {
    if (typeof namespace !== 'string') {
      throw new TypeError('namespace must be a string');
    }
    const segs = segments(namespace);
    let bestKey = '';
    let bestValue = this.thresholds.get('');
    // Walk prefixes from shortest to longest so the longest match wins.
    for (let i = 0; i < segs.length; i++) {
      const candidate = segs.slice(0, i + 1).join('.');
      const v = this.thresholds.get(candidate);
      if (v !== undefined) {
        bestKey = candidate;
        bestValue = v;
      }
    }
    // bestKey is kept for debuggability but not returned; callers get the name.
    void bestKey;
    return NAMES[bestValue];
  }

  /**
   * Decide whether a message at `level` under `namespace` should propagate.
   * @param {string} namespace
   * @param {string} level
   * @returns {boolean}
   */
  shouldLog(namespace, level) {
    const messageValue = toValue(level);
    const thresholdValue = toValue(this.getThreshold(namespace));
    // `silent` (0) as a threshold passes every real level (>=1) because
    // nothing is less severe than silent. As a *message* level, silent (0)
    // is gated by any real threshold (>=1): a silent message never propagates
    // unless the threshold is also silent. This is consistent with the rule
    // "message severity must be >= threshold".
    return messageValue >= thresholdValue;
  }

  /**
   * Remove a namespace's threshold, causing it to fall back to its parent.
   * The root ('') cannot be unset — it always exists.
   * @param {string} namespace
   * @returns {boolean} true if a threshold was removed
   */
  unsetThreshold(namespace) {
    if (namespace === '') return false;
    return this.thresholds.delete(namespace);
  }
}
