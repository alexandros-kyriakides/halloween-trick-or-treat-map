// Local stand-in for '@aws-appsync/utils' so the real resolver files can run in Node tests and
// in the browser demo mode. Only the parts the resolvers use are implemented.

export const clock = {
  /** Override in tests to simulate other times. */
  offsetMs: 0,
  now() {
    return Date.now() + this.offsetMs;
  },
};

export class AppSyncError extends Error {
  constructor(message, type, data, info) {
    super(message);
    this.errorType = type ?? 'Error';
    this.data = data ?? null;
    this.errorInfo = info ?? null;
  }
}

export class EarlyReturn {
  constructor(value) {
    this.value = value;
  }
}

function marshal(v) {
  if (v === null || v === undefined) return { NULL: true };
  if (typeof v === 'string') return { S: v };
  if (typeof v === 'number') return { N: String(v) };
  if (typeof v === 'boolean') return { BOOL: v };
  if (Array.isArray(v)) return { L: v.map(marshal) };
  return { M: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, marshal(x)])) };
}

export function unmarshal(a) {
  if ('NULL' in a) return null;
  if ('S' in a) return a.S;
  if ('N' in a) return Number(a.N);
  if ('BOOL' in a) return a.BOOL;
  if ('L' in a) return a.L.map(unmarshal);
  if ('M' in a) return Object.fromEntries(Object.entries(a.M).map(([k, x]) => [k, unmarshal(x)]));
  throw new Error(`Cannot unmarshal ${JSON.stringify(a)}`);
}

export const util = {
  autoId: () => crypto.randomUUID(),
  error(message, type, data, info) {
    throw new AppSyncError(message, type, data, info);
  },
  time: {
    nowEpochMilliSeconds: () => clock.now(),
    nowEpochSeconds: () => Math.floor(clock.now() / 1000),
    nowISO8601: () => new Date(clock.now()).toISOString(),
    parseISO8601ToEpochMilliSeconds: (s) => {
      const t = Date.parse(s);
      if (Number.isNaN(t)) throw new Error(`Bad ISO date ${s}`);
      return t;
    },
  },
  dynamodb: {
    toMapValues: (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, marshal(v)])),
  },
};

export const runtime = {
  earlyReturn(value) {
    throw new EarlyReturn(value);
  },
};
