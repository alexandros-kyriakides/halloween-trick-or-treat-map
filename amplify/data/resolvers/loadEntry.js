// Step 1 of every edit-code operation: load the entry and refuse if it is locked.
// AppSync JS runtime: no throw/try, no regex, no ++/--, no classic for loops.
import { util } from '@aws-appsync/utils';

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;

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
  const now = util.time.nowEpochSeconds();
  const windowStart = entry.attemptWindowStart ?? 0;
  const attempts = entry.attempts ?? 0;
  const windowOpen = now - windowStart < WINDOW_SECONDS;
  if (windowOpen && attempts >= MAX_ATTEMPTS) {
    const waitMinutes = Math.max(1, Math.ceil((windowStart + WINDOW_SECONDS - now) / 60));
    util.error(`Too many wrong codes. Try again in ${waitMinutes} minutes.`, 'LOCKED', null, {
      waitMinutes,
    });
  }
  ctx.stash.entry = entry;
  ctx.stash.windowOpen = windowOpen;
  return entry;
}
