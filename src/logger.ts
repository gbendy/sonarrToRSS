
function prefixTimestamp(level: string, category: string, msg: string) {
  return `${new Date().toISOString()} ${level.padEnd(5).substring(0,5)} ${category.padEnd(7).substring(0,7)} ${msg}`;
}

export function assert(value: any, category: string, msg: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  console.assert(value, prefixTimestamp('assrt', category, msg));
}

export function debug(category: string, msg: string) {
  console.debug(prefixTimestamp('debug', category, msg));
}

export function error(category: string, msg: string) {
  console.error(prefixTimestamp('error', category, msg));
}

export function info(category: string, msg: string) {
  console.info(prefixTimestamp('info', category, msg));
}

export function trace(category: string, msg: string) {
  console.trace(prefixTimestamp('trace', category, msg));
}

export function warn(category: string, msg: string) {
  console.warn(prefixTimestamp('warn', category, msg));
}

export function forCategory(category: string) {
  return {
    assert: (value: any, msg: string) => assert(value, category, msg), // eslint-disable-line @typescript-eslint/no-explicit-any
    debug: debug.bind(null, category),
    error: error.bind(null, category),
    info: info.bind(null, category),
    trace: trace.bind(null, category),
    warn: warn.bind(null, category)
  };
}

export default {
  assert,
  debug,
  error,
  info,
  trace,
  warn,
  forCategory
};
