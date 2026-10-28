// In-memory simulation of the AppSync API + DynamoDB table, running the REAL resolver files from
// amplify/data/resolvers. Used by the automated tests and by the local demo mode of the website.
// It understands only the DynamoDB expression forms the resolvers use.
import { AppSyncError, EarlyReturn, unmarshal } from './appsync-utils.js';
import * as listPins from '../amplify/data/resolvers/listPins.js';
import * as createEntry from '../amplify/data/resolvers/createEntry.js';
import * as loadEntry from '../amplify/data/resolvers/loadEntry.js';
import * as countAttempt from '../amplify/data/resolvers/countAttempt.js';
import * as getEntryForEdit from '../amplify/data/resolvers/getEntryForEdit.js';
import * as updateEntry from '../amplify/data/resolvers/updateEntry.js';
import * as deleteEntry from '../amplify/data/resolvers/deleteEntry.js';

const PIPELINES = {
  listPins: [listPins],
  createEntry: [createEntry],
  getEntryForEdit: [loadEntry, countAttempt, getEntryForEdit],
  updateEntry: [loadEntry, countAttempt, updateEntry],
  deleteEntry: [loadEntry, countAttempt, deleteEntry],
};

class ConditionFailed extends Error {}

// ---------- tiny DynamoDB expression engine ----------

function tokenize(expr) {
  const tokens = [];
  const re = /\s*(attribute_not_exists|attribute_exists|AND|OR|SET|REMOVE|<>|<=|>=|[=<>(),+\-]|[#:][A-Za-z0-9_]+)/y;
  let m;
  let pos = 0;
  while (pos < expr.length) {
    re.lastIndex = pos;
    m = re.exec(expr);
    if (!m) {
      if (expr.slice(pos).trim() === '') break;
      throw new Error(`Cannot parse expression near: ${expr.slice(pos)}`);
    }
    tokens.push(m[1]);
    pos = re.lastIndex;
  }
  return tokens;
}

function makeResolver(names = {}, values = {}) {
  const vals = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, unmarshal(v)]));
  return {
    name(tok) {
      if (!(tok in names)) throw new Error(`Undefined name ${tok}`);
      return names[tok];
    },
    operand(tok, item) {
      if (tok.startsWith(':')) {
        if (!(tok in vals)) throw new Error(`Undefined value ${tok}`);
        return vals[tok];
      }
      return item?.[this.name(tok)];
    },
  };
}

function evalCondition(cond, item) {
  if (!cond) return true;
  const r = makeResolver(cond.expressionNames, cond.expressionValues);
  const t = tokenize(cond.expression);
  let i = 0;
  const expr = () => {
    let v = term();
    while (t[i] === 'OR') {
      i += 1;
      const rhs = term();
      v = v || rhs;
    }
    return v;
  };
  const term = () => {
    let v = factor();
    while (t[i] === 'AND') {
      i += 1;
      const rhs = factor();
      v = v && rhs;
    }
    return v;
  };
  const factor = () => {
    const tok = t[i];
    if (tok === '(') {
      i += 1;
      const v = expr();
      i += 1; // ')'
      return v;
    }
    if (tok === 'attribute_exists' || tok === 'attribute_not_exists') {
      const attr = r.name(t[i + 2]);
      i += 4;
      const exists = item !== undefined && item[attr] !== undefined;
      return tok === 'attribute_exists' ? exists : !exists;
    }
    const a = r.operand(t[i], item);
    const op = t[i + 1];
    const b = r.operand(t[i + 2], item);
    i += 3;
    if (a === undefined || b === undefined) return false;
    switch (op) {
      case '=': return a === b;
      case '<>': return a !== b;
      case '<': return a < b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '>=': return a >= b;
      default: throw new Error(`Unknown operator ${op}`);
    }
  };
  return expr();
}

function applyUpdate(update, item) {
  const r = makeResolver(update.expressionNames, update.expressionValues);
  const t = tokenize(update.expression);
  const next = { ...item };
  let i = 0;
  let mode = null;
  while (i < t.length) {
    const tok = t[i];
    if (tok === 'SET' || tok === 'REMOVE') {
      mode = tok;
      i += 1;
      continue;
    }
    if (tok === ',') {
      i += 1;
      continue;
    }
    if (mode === 'REMOVE') {
      delete next[r.name(tok)];
      i += 1;
      continue;
    }
    // SET path = operand [(+|-) operand]
    const attr = r.name(tok);
    let v = r.operand(t[i + 2], item);
    i += 3;
    if (t[i] === '+' || t[i] === '-') {
      const rhs = r.operand(t[i + 1], item);
      if (typeof v !== 'number' || typeof rhs !== 'number') {
        throw new AppSyncError('Invalid UpdateExpression: operand type mismatch', 'DynamoDB:ValidationException');
      }
      v = t[i] === '+' ? v + rhs : v - rhs;
      i += 2;
    }
    next[attr] = v;
  }
  return next;
}

// ---------- the simulated backend ----------

export function createSimBackend({ env }) {
  const table = new Map();

  function execute(req) {
    const key = req.key ? Object.fromEntries(Object.entries(req.key).map(([k, v]) => [k, unmarshal(v)])) : null;
    const current = key ? table.get(key.id) : undefined;
    const check = () => {
      if (!evalCondition(req.condition, current)) throw new ConditionFailed();
    };
    switch (req.operation) {
      case 'GetItem':
        return current ? structuredClone(current) : null;
      case 'Scan':
        return { items: [...table.values()].slice(0, req.limit ?? 1000).map((x) => structuredClone(x)), nextToken: null };
      case 'PutItem': {
        check();
        const attrs = Object.fromEntries(Object.entries(req.attributeValues).map(([k, v]) => [k, unmarshal(v)]));
        const item = { ...attrs, ...key };
        table.set(key.id, item);
        return structuredClone(item);
      }
      case 'UpdateItem': {
        // Like DynamoDB, an update on a missing item creates it unless a condition prevents that.
        check();
        const item = applyUpdate(req.update, current ?? { ...key });
        table.set(key.id, item);
        return structuredClone(item);
      }
      case 'DeleteItem': {
        check();
        table.delete(key.id);
        return current ? structuredClone(current) : null;
      }
      default:
        throw new Error(`Unsupported operation ${req.operation}`);
    }
  }

  /** Runs one GraphQL field's pipeline. Resolves with data or rejects with AppSyncError. */
  async function call(field, args) {
    const fns = PIPELINES[field];
    if (!fns) throw new Error(`Unknown field ${field}`);
    const ctx = { args: structuredClone(args), env: { ...env }, stash: {}, prev: { result: {} } };
    for (const fn of fns) {
      let req;
      try {
        req = fn.request(ctx);
      } catch (e) {
        if (e instanceof EarlyReturn) {
          ctx.prev = { result: e.value };
          continue;
        }
        throw e;
      }
      ctx.result = undefined;
      ctx.error = undefined;
      try {
        ctx.result = execute(req);
      } catch (e) {
        if (e instanceof ConditionFailed) {
          ctx.error = { message: 'The conditional request failed', type: 'DynamoDB:ConditionalCheckFailedException' };
        } else {
          throw e;
        }
      }
      ctx.prev = { result: fn.response(ctx) };
    }
    return structuredClone(ctx.prev.result);
  }

  return { call, table, execute };
}
