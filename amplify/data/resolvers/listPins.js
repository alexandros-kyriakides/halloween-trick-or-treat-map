// listPins: everyone gets the pin locations; ids, names, apartment, buzzer and notes only with
// the group code (without it, ids are replaced by placeholders, so outsiders have nothing to
// aim edit-code guesses at). Edit codes and attempt counters are never returned.
// Items without numeric coordinates are skipped so one bad row can't break the whole list.
// After HIDE_AT: nothing.
import { util, runtime } from '@aws-appsync/utils';

function norm(s) {
  return (s ?? '').toUpperCase().replaceAll(' ', '').replaceAll('-', '');
}

export function request(ctx) {
  const hideAt = util.time.parseISO8601ToEpochMilliSeconds(ctx.env.HIDE_AT);
  if (util.time.nowEpochMilliSeconds() >= hideAt) {
    runtime.earlyReturn({ groupCodeOk: false, closed: true, pins: [] });
  }
  // A neighbourhood fits easily in one 1 MB scan page.
  return { operation: 'Scan', limit: 1000 };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  const given = norm(ctx.args.groupCode);
  const groupCodeOk = given.length > 0 && given === norm(ctx.env.GROUP_CODE);
  const valid = ctx.result.items.filter((e) => typeof e.lat === 'number' && typeof e.lng === 'number');
  const pins = valid.map((e, i) =>
    groupCodeOk
      ? {
          id: e.id,
          lat: e.lat,
          lng: e.lng,
          apartment: e.apartment ?? null,
          names: e.names ?? null,
          buzzer: e.buzzer ?? null,
          notes: e.notes ?? null,
        }
      : { id: `pin-${i}`, lat: e.lat, lng: e.lng },
  );
  return { groupCodeOk, closed: false, pins };
}
