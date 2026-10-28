// Step 3 for deleteEntry: check the edit code, then delete only this entry.
import { util } from '@aws-appsync/utils';

const MAX_ATTEMPTS = 5;

function norm(s) {
  return (s ?? '').toUpperCase().replaceAll(' ', '').replaceAll('-', '');
}

function requireCorrectCode(ctx) {
  const given = norm(ctx.args.editCode);
  if (given.length === 0 || given !== norm(ctx.stash.entry.editCode)) {
    const triesLeft = Math.max(0, MAX_ATTEMPTS - (ctx.stash.attemptsUsed ?? MAX_ATTEMPTS));
    util.error(
      triesLeft > 0
        ? `Wrong edit code. ${triesLeft} tries left.`
        : 'Wrong edit code. Too many attempts, try again in 15 minutes.',
      'WRONG_CODE',
      null,
      { triesLeft },
    );
  }
}

export function request(ctx) {
  requireCorrectCode(ctx);
  return {
    operation: 'DeleteItem',
    key: util.dynamodb.toMapValues({ id: ctx.stash.entry.id }),
    condition: {
      expression: '#c = :c',
      expressionNames: { '#c': 'editCode' },
      expressionValues: util.dynamodb.toMapValues({ ':c': ctx.stash.entry.editCode }),
    },
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return true;
}
