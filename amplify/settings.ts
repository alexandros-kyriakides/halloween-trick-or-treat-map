/**
 * Event settings. These become AppSync environment variables that the
 * resolvers read at runtime (ctx.env). Change them here and push to redeploy.
 *
 * Times are in UTC. Nicosia is UTC+2 after the clocks change on 25 Oct 2026.
 */
export const EVENT_SETTINGS = {
  /** Code shared in the Viber group. Not case-sensitive; spaces and dashes are ignored. */
  GROUP_CODE: '31OCT',
  /** After this moment the map shows nothing and no changes are accepted. 1 Nov 2026, 02:00 Nicosia. */
  HIDE_AT: '2026-11-01T00:00:00Z',
  /** Entries are stamped to be deleted automatically (DynamoDB TTL) from this moment. 8 Nov 2026, 02:00 Nicosia. */
  DELETE_AT: '2026-11-08T00:00:00Z',
};
