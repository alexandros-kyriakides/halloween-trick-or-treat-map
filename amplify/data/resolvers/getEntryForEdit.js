// Step 3 for getEntryForEdit: check the edit code; if right, clear the attempt counter and
// return the entry (never the code itself).
import { util } from '@aws-appsync/utils';

const MAX_ATTEMPTS = 5;

function norm(s) {
  return (s ?? '').toUpperCase().replaceAll(' ', '').replaceAll('-', '');
}

function requireCorrectCode(ctx) {
  if (ctx.stash.superuser) {
    return;
  }
  const given = norm(ctx.args.editCode);
  if (given.length === 0 || given !== norm(ctx.stash.entry.editCode)) {
    const triesLeft = Math.max(0, MAX_ATTEMPTS - (ctx.stash.attemptsUsed ?? MAX_ATTEMPTS));
    util.error(
      triesLeft > 0
        ? `Wrong edit code. ${triesLeft} tries left.`
        : 'Wrong edit code. Too many attempts, try again later.',
      'WRONG_CODE',
      null,
      { triesLeft },
    );
  }
}

function toPin(e) {
  return {
    id: e.id,
    lat: e.lat,
    lng: e.lng,
    apartment: e.apartment ?? null,
    names: e.names ?? null,
    buzzer: e.buzzer ?? null,
    notes: e.notes ?? null,
    aptNumber: e.aptNumber ?? null,
    floor: e.floor ?? null,
    streetNumber: e.streetNumber ?? null,
  };
}

export function request(ctx) {
  requireCorrectCode(ctx);
  return {
    operation: 'UpdateItem',
    key: util.dynamodb.toMapValues({ id: ctx.stash.entry.id }),
    update: {
      expression: 'REMOVE #w, #a, #s',
      expressionNames: { '#w': 'attemptWindowStart', '#a': 'attempts', '#s': 'strikes' },
    },
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
  const pin = toPin(ctx.result);
  if (ctx.stash.superuser) {
    // Only the superuser gets the entry's own edit code, so they can give it back to a neighbour.
    pin.superuser = true;
    pin.editCode = ctx.stash.entry.editCode;
  }
  return pin;
}
