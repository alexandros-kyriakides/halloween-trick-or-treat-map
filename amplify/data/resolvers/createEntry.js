// createEntry: needs the group code and consent. Generates the entry's edit code
// (WORD-123, easy to remember) and returns it once; it is stored in DynamoDB for the admin.
import { util } from '@aws-appsync/utils';

// 1.5 km x 1.5 km box centred on 35.0757663 N, 33.3131540 E (750 m geodesic offsets, WGS84).
const SOUTH = 35.069006;
const NORTH = 35.0825266;
const WEST = 33.3049307;
const EAST = 33.3213773;

// apartment and buzzer are kept for entries saved before 30 Oct; the form now sends
// aptNumber + floor (apartments only) and no bell field.
const LIMITS = { apartment: 40, names: 60, buzzer: 40, notes: 200, aptNumber: 20, floor: 10 };

// Simple, friendly words that are easy to spell. 100 words x 1000 numbers = 100,000 codes.
const WORDS = [
  'PUMPKIN', 'GHOST', 'WITCH', 'BAT', 'CANDY', 'SPIDER', 'MOON', 'OWL', 'CAT', 'BROOM',
  'CAULDRON', 'LANTERN', 'CANDLE', 'MASK', 'CAPE', 'WIZARD', 'MUMMY', 'ZOMBIE', 'MONSTER', 'VAMPIRE',
  'GOBLIN', 'TROLL', 'DRAGON', 'FAIRY', 'PIRATE', 'ROBOT', 'ALIEN', 'NINJA', 'KNIGHT', 'PRINCESS',
  'TOFFEE', 'COOKIE', 'CARAMEL', 'LOLLIPOP', 'GUMMY', 'CHOCOLATE', 'MARSHMALLOW', 'CUPCAKE', 'MUFFIN', 'APPLE',
  'ACORN', 'LEAF', 'HAY', 'SCARECROW', 'CROW', 'RAVEN', 'TOAD', 'FROG', 'NEWT', 'SNAIL',
  'STAR', 'COMET', 'COSTUME', 'TREAT', 'TRICK', 'SPELL', 'POTION', 'MAGIC', 'WAND', 'HAT',
  'BONES', 'SHADOW', 'NIGHT', 'FOG', 'MIST', 'ECHO', 'ATTIC', 'CASTLE', 'TOWER', 'GATE',
  'CLOCK', 'KEY', 'DOOR', 'BELL', 'DRUM', 'FIDDLE', 'BANJO', 'TUBA', 'BAGEL', 'PICKLE',
  'SQUASH', 'GOURD', 'CORN', 'PIE', 'FUDGE', 'NOUGAT', 'JELLY', 'SPRINKLE', 'GIGGLE', 'BOO',
  'HOWL', 'GROWL', 'CREAK', 'SQUEAK', 'WOBBLE', 'TWIRL', 'BUBBLE', 'GLOW', 'SPARK', 'COBWEB',
];

function norm(s) {
  return (s ?? '').toUpperCase().replaceAll(' ', '').replaceAll('-', '');
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

const HEX = '0123456789abcdef';

// 32 random bits from a UUID v4 (util.autoId), instead of Math.random(), whose generator
// is not documented as secure. 2^32 is so much larger than 100 and 1000 that the
// modulo bias is below 1 in 40 million.
function randomInt(limit) {
  // The first 8 characters of a UUID are hex digits (the first dash is at index 8).
  const hex = util.autoId().toLowerCase();
  const value = [0, 1, 2, 3, 4, 5, 6, 7].reduce((acc, i) => acc * 16 + HEX.indexOf(hex.charAt(i)), 0);
  return value % limit;
}

function makeCode() {
  const word = WORDS[randomInt(WORDS.length)];
  const n = randomInt(1000);
  const digits = n < 10 ? `00${n}` : n < 100 ? `0${n}` : `${n}`;
  return `${word}-${digits}`;
}

export function request(ctx) {
  const args = ctx.args;
  const hideAt = util.time.parseISO8601ToEpochMilliSeconds(ctx.env.HIDE_AT);
  if (util.time.nowEpochMilliSeconds() >= hideAt) {
    util.error('The event is over and the map is closed.', 'CLOSED');
  }
  if (norm(args.groupCode) !== norm(ctx.env.GROUP_CODE)) {
    util.error('Wrong group code.', 'BAD_GROUP_CODE');
  }
  if (args.consent !== true) {
    util.error('Please accept the consent statement.', 'CONSENT_REQUIRED');
  }
  checkLocation(args.lat, args.lng);

  const id = util.autoId();
  const now = util.time.nowISO8601();
  const item = {
    lat: args.lat,
    lng: args.lng,
    editCode: makeCode(),
    createdAt: now,
    updatedAt: now,
    expiresAt: Math.floor(util.time.parseISO8601ToEpochMilliSeconds(ctx.env.DELETE_AT) / 1000),
  };
  for (const field of Object.keys(LIMITS)) {
    const v = cleanText(args[field], field);
    if (v !== null) {
      item[field] = v;
    }
  }

  return {
    operation: 'PutItem',
    key: util.dynamodb.toMapValues({ id }),
    attributeValues: util.dynamodb.toMapValues(item),
    condition: {
      expression: 'attribute_not_exists(#id)',
      expressionNames: { '#id': 'id' },
    },
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return { id: ctx.result.id, editCode: ctx.result.editCode };
}
