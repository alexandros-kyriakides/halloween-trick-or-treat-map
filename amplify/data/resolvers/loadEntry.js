// Step 1 of every edit-code operation: load the entry and refuse if it is locked.
// The superuser code (SUPER_CODE, optional, at least 10 characters, set in Amplify) works on
// every entry and is not subject to the per-entry lockout, so the admin can always get in.
// AppSync JS runtime: no throw/try, no regex, no ++/--, no classic for loops.
import { util } from '@aws-appsync/utils';

const MAX_ATTEMPTS = 5;
const BASE_WINDOW_SECONDS = 15 * 60;
// Each time an entry gets locked again, the next window doubles: 15, 30, 60 ... 3840 minutes.
// `strikes` counts those lockouts; a correct code clears it.
const MULTIPLIERS = [1, 2, 4, 8, 16, 32, 64, 128, 256];

function norm(s) {
  return (s ?? '').toUpperCase().replaceAll(' ', '').replaceAll('-', '');
}

export function request(ctx) {
  const hideAt = util.time.parseISO8601ToEpochMilliSeconds(ctx.env.HIDE_AT);
  if (util.time.nowEpochMilliSeconds() >= hideAt) {
    util.error('The event is over and the map is closed.', 'CLOSED');
  }
  return {
    operation: 'GetItem',
    key: util.dynamodb.toMapValues({ id: ctx.args.id }),
    consistentRead: true,
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  const entry = ctx.result;
  if (!entry) {
    util.error('This entry no longer exists.', 'NOT_FOUND');
  }
  const superCode = norm(ctx.env.SUPER_CODE ?? '');
  if (superCode.length >= 10 && norm(ctx.args.editCode) === superCode) {
    ctx.stash.entry = entry;
    ctx.stash.superuser = true;
    return entry;
  }
  const now = util.time.nowEpochSeconds();
  const windowStart = entry.attemptWindowStart ?? 0;
  const attempts = entry.attempts ?? 0;
  const strikes = Math.min(entry.strikes ?? 0, MULTIPLIERS.length - 1);
  const windowSeconds = BASE_WINDOW_SECONDS * MULTIPLIERS[strikes];
  const windowOpen = now - windowStart < windowSeconds;
  if (windowOpen && attempts >= MAX_ATTEMPTS) {
    const waitMinutes = Math.max(1, Math.ceil((windowStart + windowSeconds - now) / 60));
    util.error(`Too many wrong codes. Try again in ${waitMinutes} minutes.`, 'LOCKED', null, {
      waitMinutes,
    });
  }
  ctx.stash.entry = entry;
  ctx.stash.windowOpen = windowOpen;
  return entry;
}
