const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  verbose: 3,
  debug: 4,
  trace: 5
};

export type LogLevel = keyof typeof logLevels;

let currentLevel = logLevels.info;

export function setLevel(level: LogLevel) {
  if (logLevels[level] === undefined) {
    return;
  }
  currentLevel = logLevels[level];
}

function prefixTimestamp(level: string, category: string, msg: string) {
  return `${new Date().toISOString()} ${level.padEnd(5).substring(0,5)} ${category.padEnd(7).substring(0,7)} ${msg}`;
}

export function assert(value: any, category: string, msg: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  console.assert(value, prefixTimestamp('assrt', category, msg));
}

export function error(category: string, msg: string) {
  console.error(prefixTimestamp('error', category, msg));
}

export function warn(category: string, msg: string) {
  if (currentLevel >= logLevels.warn) {
    console.warn(prefixTimestamp('warn', category, msg));
  }
}

export function info(category: string, msg: string) {
  if (currentLevel >= logLevels.info) {
    console.info(prefixTimestamp('info', category, msg));
  }
}

export function verbose(category: string, msg: string) {
  if (currentLevel >= logLevels.verbose) {
    console.info(prefixTimestamp('verbose', category, msg));
  }
}

export function debug(category: string, msg: string) {
  if (currentLevel >= logLevels.debug) {
    console.debug(prefixTimestamp('debug', category, msg));
  }
}

export function trace(category: string, msg: string) {
  if (currentLevel >= logLevels.trace) {
    console.trace(prefixTimestamp('trace', category, msg));
  }
}

export function forCategory(category: string) {
  return {
    assert: (value: any, msg: string) => assert(value, category, msg), // eslint-disable-line @typescript-eslint/no-explicit-any
    error: error.bind(null, category),
    warn: warn.bind(null, category),
    info: info.bind(null, category),
    verbose: verbose.bind(null, category),
    debug: debug.bind(null, category),
    trace: trace.bind(null, category),
    setLevel: setLevel
  };
}

export default {
  assert,
  error,
  warn,
  info,
  verbose,
  debug,
  trace,
  forCategory,
  setLevel
};
