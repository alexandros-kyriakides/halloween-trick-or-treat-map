import { a, defineData, type ClientSchema } from '@aws-amplify/backend';

/**
 * No accounts: the API is reached with a public API key, and every rule is
 * enforced inside the resolvers in ./resolvers:
 *  - the group code unlocks names/notes and adding a home
 *  - each entry's edit code unlocks changing or deleting that entry
 *  - edit codes are stored in DynamoDB but never returned by any query
 *
 * There are no Amplify "models", so no automatic list/get/update operations
 * exist that could expose the table directly.
 */

const DS = 'EntriesTable'; // added in backend.ts

const ddb = (entry: string) => a.handler.custom({ dataSource: DS, entry });

// Every edit-code operation runs: load entry -> count the attempt -> do the work.
const guarded = (entry: string) => [
  ddb('./resolvers/loadEntry.js'),
  ddb('./resolvers/countAttempt.js'),
  ddb(entry),
];

const schema = a.schema({
  Pin: a.customType({
    id: a.id().required(),
    lat: a.float().required(),
    lng: a.float().required(),
    apartment: a.string(),
    names: a.string(),
    buzzer: a.string(),
    notes: a.string(),
    // Only set by getEntryForEdit when the superuser code was used.
    superuser: a.boolean(),
    editCode: a.string(),
  }),

  PinList: a.customType({
    groupCodeOk: a.boolean().required(),
    closed: a.boolean().required(),
    pins: a.ref('Pin').required().array().required(),
  }),

  CreatedEntry: a.customType({
    id: a.id().required(),
    editCode: a.string().required(),
  }),

  listPins: a
    .query()
    .arguments({ groupCode: a.string() })
    .returns(a.ref('PinList').required())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(ddb('./resolvers/listPins.js')),

  getEntryForEdit: a
    .query()
    .arguments({ id: a.id().required(), editCode: a.string().required() })
    .returns(a.ref('Pin').required())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(guarded('./resolvers/getEntryForEdit.js')),

  createEntry: a
    .mutation()
    .arguments({
      groupCode: a.string().required(),
      consent: a.boolean().required(),
      lat: a.float().required(),
      lng: a.float().required(),
      apartment: a.string(),
      names: a.string(),
      buzzer: a.string(),
      notes: a.string(),
    })
    .returns(a.ref('CreatedEntry').required())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(ddb('./resolvers/createEntry.js')),

  updateEntry: a
    .mutation()
    .arguments({
      id: a.id().required(),
      editCode: a.string().required(),
      lat: a.float().required(),
      lng: a.float().required(),
      apartment: a.string(),
      names: a.string(),
      buzzer: a.string(),
      notes: a.string(),
    })
    .returns(a.ref('Pin').required())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(guarded('./resolvers/updateEntry.js')),

  deleteEntry: a
    .mutation()
    .arguments({ id: a.id().required(), editCode: a.string().required() })
    .returns(a.boolean().required())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(guarded('./resolvers/deleteEntry.js')),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    // The key is public (it ships in the web page). It only needs to outlive the event.
    apiKeyAuthorizationMode: { expiresInDays: 45 },
  },
});
