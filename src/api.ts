// Talks to the AppSync GraphQL API using the public API key from amplify_outputs.json
// (copied into the site by the build). In demo mode (`npm run demo`) it runs the real
// resolvers in the browser against an in-memory table instead.

export type Pin = {
  id: string;
  lat: number;
  lng: number;
  apartment?: string | null;
  names?: string | null;
  buzzer?: string | null;
  notes?: string | null;
  /** Only from getEntryForEdit, when the superuser code was used. */
  superuser?: boolean | null;
  editCode?: string | null;
};

export type PinList = { groupCodeOk: boolean; closed: boolean; pins: Pin[] };

export type EntryFields = {
  lat: number;
  lng: number;
  apartment: string | null;
  names: string | null;
  buzzer: string | null;
  notes: string | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public type: string,
    public info: Record<string, unknown> | null = null,
  ) {
    super(message);
  }
}

type Call = (field: string, query: string, variables: Record<string, unknown>) => Promise<unknown>;

let callPromise: Promise<Call> | null = null;

async function makeRemoteCall(): Promise<Call> {
  const res = await fetch('/amplify_outputs.json', { cache: 'no-store' });
  if (!res.ok) throw new ApiError('Missing amplify_outputs.json', 'NETWORK');
  const outputs = await res.json();
  const url: string = outputs.data.url;
  const apiKey: string = outputs.data.api_key;
  return async (field, query, variables) => {
    let body: { data?: Record<string, unknown>; errors?: { message: string; errorType?: string; errorInfo?: Record<string, unknown> }[] };
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ query, variables }),
      });
      body = await r.json();
    } catch {
      throw new ApiError('Network error', 'NETWORK');
    }
    if (body.errors?.length) {
      const e = body.errors[0];
      throw new ApiError(e.message, e.errorType ?? 'ERROR', e.errorInfo ?? null);
    }
    return body.data?.[field];
  };
}

async function makeDemoCall(): Promise<Call> {
  const [{ createSimBackend }, { EVENT_SETTINGS }] = await Promise.all([
    import('../devsim/backend.js'),
    import('../amplify/settings.ts'),
  ]);
  // Demo mode uses the group code DEMO; the real code only exists in the Amplify console.
  const env = { ...EVENT_SETTINGS, GROUP_CODE: 'DEMO' };
  const sim = createSimBackend({ env });
  const near = (dLat: number, dLng: number) => ({ lat: 35.0757663 + dLat, lng: 33.313154 + dLng });
  const seed = [
    { ...near(0.0021, -0.0012), apartment: '101', names: 'Eleni & Andreas', buzzer: 'Papadopoulos' },
    { ...near(0.0021, -0.0012), apartment: '302', names: 'Sophie', notes: 'Lift is on the left' },
    { ...near(0.0021, -0.0012), apartment: '4th floor', names: 'Marios & Christina' },
    { ...near(-0.0018, 0.0026), names: 'Anna', notes: 'Side gate, ring twice' },
    { ...near(0.0006, 0.0041), names: 'Giorgos & Maria' },
    { ...near(-0.0042, -0.0035), names: 'The Charalambous family' },
  ];
  for (const s of seed) await sim.call('createEntry', { groupCode: env.GROUP_CODE, consent: true, ...s });
  return async (field, _query, variables) => {
    await new Promise((r) => setTimeout(r, 250));
    try {
      // Variable names match the GraphQL argument names, so they can be passed straight through.
      return await sim.call(field, variables);
    } catch (e) {
      const err = e as { message: string; errorType?: string; errorInfo?: Record<string, unknown> };
      if (err.errorType) throw new ApiError(err.message, err.errorType, err.errorInfo ?? null);
      throw e;
    }
  };
}

function call<T>(field: string, query: string, variables: Record<string, unknown>): Promise<T> {
  if (!callPromise) {
    callPromise = import.meta.env.MODE === 'demo' ? makeDemoCall() : makeRemoteCall();
    callPromise.catch(() => (callPromise = null));
  }
  return callPromise.then((c) => c(field, query, variables) as Promise<T>);
}

const PIN = 'id lat lng apartment names buzzer notes';
const FIELD_VARS = '$lat: Float!, $lng: Float!, $apartment: String, $names: String, $buzzer: String, $notes: String';
const FIELD_ARGS = 'lat: $lat, lng: $lng, apartment: $apartment, names: $names, buzzer: $buzzer, notes: $notes';

export const api = {
  listPins: (groupCode: string | null) =>
    call<PinList>('listPins', `query ($groupCode: String) { listPins(groupCode: $groupCode) { groupCodeOk closed pins { ${PIN} } } }`, {
      groupCode,
    }),

  createEntry: (groupCode: string, fields: EntryFields) =>
    call<{ id: string; editCode: string }>(
      'createEntry',
      `mutation ($groupCode: String!, $consent: Boolean!, ${FIELD_VARS}) {
        createEntry(groupCode: $groupCode, consent: $consent, ${FIELD_ARGS}) { id editCode } }`,
      { groupCode, consent: true, ...fields },
    ),

  getEntryForEdit: (id: string, editCode: string) =>
    call<Pin>('getEntryForEdit', `query ($id: ID!, $editCode: String!) { getEntryForEdit(id: $id, editCode: $editCode) { ${PIN} superuser editCode } }`, {
      id,
      editCode,
    }),

  updateEntry: (id: string, editCode: string, fields: EntryFields) =>
    call<Pin>(
      'updateEntry',
      `mutation ($id: ID!, $editCode: String!, ${FIELD_VARS}) {
        updateEntry(id: $id, editCode: $editCode, ${FIELD_ARGS}) { ${PIN} } }`,
      { id, editCode, ...fields },
    ),

  deleteEntry: (id: string, editCode: string) =>
    call<boolean>('deleteEntry', `mutation ($id: ID!, $editCode: String!) { deleteEntry(id: $id, editCode: $editCode) }`, {
      id,
      editCode,
    }),
};
