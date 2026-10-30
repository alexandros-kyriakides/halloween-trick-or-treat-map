// Step 2 of every edit-code operation: record the attempt BEFORE the code is checked.
// The conditional write makes this atomic: even many parallel requests can use at most
// MAX_ATTEMPTS attempts per window. A correct code clears the counter (step 3).
// Every write requires the item to still exist: an attempt racing a delete must never
// re-create the entry as an item without coordinates (that would break listPins for everyone).
import { util, runtime } from '@aws-appsync/utils';

const MAX_ATTEMPTS = 5;

export function request(ctx) {
  if (ctx.stash.superuser) {
    runtime.earlyReturn(ctx.stash.entry);
  }
  const entry = ctx.stash.entry;
  const key = util.dynamodb.toMapValues({ id: entry.id });

  if (ctx.stash.windowOpen) {
    // Same window: +1, only if the window is unchanged and attempts are left.
    return {
      operation: 'UpdateItem',
      key,
      update: {
        expression: 'SET #a = #a + :one',
        expressionNames: { '#a': 'attempts' },
        expressionValues: util.dynamodb.toMapValues({ ':one': 1 }),
      },
      condition: {
        expression: 'attribute_exists(#id) AND #cw = :cw AND #ca < :cmax',
        expressionNames: { '#id': 'id', '#cw': 'attemptWindowStart', '#ca': 'attempts' },
        expressionValues: util.dynamodb.toMapValues({
          ':cw': entry.attemptWindowStart,
          ':cmax': MAX_ATTEMPTS,
        }),
      },
    };
  }

  // Start a new window with this attempt as number 1. If the previous window ended locked,
  // add a strike so the new window is twice as long.
  const previousLocked = (entry.attempts ?? 0) >= MAX_ATTEMPTS;
  const strikes = (entry.strikes ?? 0) + (previousLocked ? 1 : 0);
  const condition =
    entry.attemptWindowStart === undefined || entry.attemptWindowStart === null
      ? {
          expression: 'attribute_exists(#id) AND attribute_not_exists(#cw)',
          expressionNames: { '#id': 'id', '#cw': 'attemptWindowStart' },
        }
      : {
          expression: 'attribute_exists(#id) AND #cw = :cw',
          expressionNames: { '#id': 'id', '#cw': 'attemptWindowStart' },
          expressionValues: util.dynamodb.toMapValues({ ':cw': entry.attemptWindowStart }),
        };

  return {
    operation: 'UpdateItem',
    key,
    update: {
      expression: 'SET #w = :now, #a = :one, #s = :strikes',
      expressionNames: { '#w': 'attemptWindowStart', '#a': 'attempts', '#s': 'strikes' },
      expressionValues: util.dynamodb.toMapValues({
        ':now': util.time.nowEpochSeconds(),
        ':one': 1,
        ':strikes': strikes,
      }),
    },
    condition,
  };
}

export function response(ctx) {
  if (ctx.error) {
    if (ctx.error.type === 'DynamoDB:ConditionalCheckFailedException') {
      util.error('Too many attempts at once. Please wait a moment and try again.', 'BUSY');
    }
    util.error(ctx.error.message, ctx.error.type);
  }
  ctx.stash.attemptsUsed = ctx.result.attempts;
  return ctx.result;
}
