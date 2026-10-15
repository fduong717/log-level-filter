# log-level-filter

Hierarchical log level filtering. Decide whether a message at a given severity should propagate, with runtime-tunable thresholds per dot-separated namespace.

```js
import { LogLevelFilter, LEVELS } from 'log-level-filter';

const filter = new LogLevelFilter({ '': 'info' });

filter.setThreshold('app', 'warn');
filter.setThreshold('app.db', 'debug');

filter.shouldLog('app.db.pool', 'debug'); // true  — 'app.db' threshold
filter.shouldLog('app.cache', 'debug');    // false — falls back to 'app' = warn
filter.shouldLog('app.cache', 'error');   // true
```

## Why this exists

Most logging libraries bundle formatting, transports, and filtering into one object that grows until it is hard to test in isolation. This library does exactly one thing: answer the yes/no question "should this message at this level under this namespace propagate?" It does not format, does not write anywhere, and does not know about transports. Pair it with whatever logger you already use.

Thresholds are looked up by longest dot-separated prefix match. Setting `app` to `warn` and `app.db` to `debug` means `app.db.pool` uses the `debug` threshold while `app.cache` uses `warn`. The root namespace `''` is the fallback and defaults to `info`.

## Levels and ordering

Severity is ordered `silent < trace < debug < info < warn < error < fatal`. `LEVELS` is a frozen map of name to numeric value. A message propagates when its severity is greater than or equal to the threshold for its namespace.

`silent` is the minimum value and plays a double role: as a **threshold** it passes every real level (it is the least restrictive gate), and as a **message level** it is gated by any real threshold (a `silent` message only propagates when the threshold is also `silent`). This is the one awkward edge. If you use `silent` as a threshold to mean "off", remember it actually means "let everything through" — to mute a namespace, set its threshold to `fatal` instead, or simply don't log at that namespace.

## Errors

Unknown level strings throw `RangeError` at configuration time and at call time. A typo like `war` fails immediately rather than silently passing or blocking the wrong messages.

## API

- `new LogLevelFilter(initial?)` — construct with optional `{ namespace: level }` map. Root `''` defaults to `info`.
- `filter.setThreshold(namespace, level)` — set the threshold for a namespace.
- `filter.getThreshold(namespace)` — return the canonical level name for a namespace via longest-prefix match.
- `filter.shouldLog(namespace, level)` — boolean: does this message propagate?
- `filter.unsetThreshold(namespace)` — remove a namespace's override so it falls back to its parent. Root cannot be unset; returns `false` in that case.
- `LEVELS` — frozen `{ silent: 0, trace: 1, debug: 2, info: 3, warn: 4, error: 5, fatal: 6 }`.
