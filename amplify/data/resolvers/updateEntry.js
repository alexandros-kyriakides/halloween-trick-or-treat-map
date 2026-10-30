// Step 3 for updateEntry: validate input, check the edit code, then save.
// Writing is conditional on the stored code, so a concurrent delete/change can't be overwritten.
import { util } from '@aws-appsync/utils';

const MAX_ATTEMPTS = 5;
// 1.5 km x 1.5 km box centred on 35.0757663 N, 33.3131540 E (750 m geodesic offsets, WGS84).
const SOUTH = 35.069006;
const NORTH = 35.0825266;
const WEST = 33.3049307;
const EAST = 33.3213773;

const LIMITS = { apartment: 40, names: 60, buzzer: 40, notes: 200 };

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

function checkLocation(lat, lng) {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < SOUTH ||
    lat > NORTH ||
    lng < WEST ||
    lng > EAST
  ) {
    util.error('This location is outside the map area.', 'OUTSIDE_AREA');
  }
}

function cleanText(value, field) {
  if (value === null || value === undefined) {
    return null;
  }
  const s = value.trim();
  if (s.length === 0) {
    return null;
  }
  if (s.length > LIMITS[field]) {
    util.error(`The ${field} field is too long (max ${LIMITS[field]} characters).`, 'TOO_LONG', null, {
      field,
    });
  }
  return s;
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
  };
}

export function request(ctx) {
  const args = ctx.args;
  checkLocation(args.lat, args.lng);
  const text = {
    apartment: cleanText(args.apartment, 'apartment'),
    names: cleanText(args.names, 'names'),
    buzzer: cleanText(args.buzzer, 'buzzer'),
    notes: cleanText(args.notes, 'notes'),
  };
  requireCorrectCode(ctx);

  const sets = ['#lat = :lat', '#lng = :lng', '#updatedAt = :updatedAt'];
  const removes = ['#w', '#a', '#s'];
  const names = {
    '#lat': 'lat',
    '#lng': 'lng',
    '#updatedAt': 'updatedAt',
    '#w': 'attemptWindowStart',
    '#a': 'attempts',
    '#s': 'strikes',
  };
  const values = { ':lat': args.lat, ':lng': args.lng, ':updatedAt': util.time.nowISO8601() };

  for (const field of Object.keys(text)) {
    names[`#${field}`] = field;
    if (text[field] === null) {
      removes.push(`#${field}`);
    } else {
      sets.push(`#${field} = :${field}`);
      values[`:${field}`] = text[field];
    }
  }

  return {
    operation: 'UpdateItem',
    key: util.dynamodb.toMapValues({ id: ctx.stash.entry.id }),
    update: {
      expression: `SET ${sets.join(', ')} REMOVE ${removes.join(', ')}`,
      expressionNames: names,
      expressionValues: util.dynamodb.toMapValues(values),
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
  return toPin(ctx.result);
}
