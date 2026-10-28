// Step 2 of every edit-code operation: record the attempt BEFORE the code is checked.
// The conditional write makes this atomic: even many parallel requests can use at most
// MAX_ATTEMPTS attempts per 15-minute window. A correct code clears the counter (step 3).
import { util } from '@aws-appsync/utils';

const MAX_ATTEMPTS = 5;

export function request(ctx) {
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
        expression: '#cw = :cw AND #ca < :cmax',
        expressionNames: { '#cw': 'attemptWindowStart', '#ca': 'attempts' },
        expressionValues: util.dynamodb.toMapValues({
          ':cw': entry.attemptWindowStart,
          ':cmax': MAX_ATTEMPTS,
        }),
      },
    };
  }

  // Start a new window with this attempt as number 1.
  const condition =
    entry.attemptWindowStart === undefined || entry.attemptWindowStart === null
      ? {
          expression: 'attribute_not_exists(#cw)',
          expressionNames: { '#cw': 'attemptWindowStart' },
        }
      : {
          expression: '#cw = :cw',
          expressionNames: { '#cw': 'attemptWindowStart' },
          expressionValues: util.dynamodb.toMapValues({ ':cw': entry.attemptWindowStart }),
        };

  return {
    operation: 'UpdateItem',
    key,
    update: {
      expression: 'SET #w = :now, #a = :one',
      expressionNames: { '#w': 'attemptWindowStart', '#a': 'attempts' },
      expressionValues: util.dynamodb.toMapValues({
        ':now': util.time.nowEpochSeconds(),
        ':one': 1,
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
