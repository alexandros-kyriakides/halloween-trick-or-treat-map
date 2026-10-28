// listPins: everyone gets the pin locations; names, apartment, buzzer and notes only with the
// group code. Edit codes and attempt counters are never returned. After HIDE_AT: nothing.
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
  const pins = ctx.result.items.map((e) =>
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
      : { id: e.id, lat: e.lat, lng: e.lng },
  );
  return { groupCodeOk, closed: false, pins };
}
