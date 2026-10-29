# Trick-or-treat map

A one-night neighbourhood map for Saturday 31 October 2026. Neighbours add their home (or apartment) to the map; parents use it on the night to find homes taking part.

- No accounts. Everyone uses the same link.
- The **group code** (shared in Viber) shows names and details and lets people add their home. Without it, visitors see only the pumpkins on the map.
- Each home gets an **edit code** such as `PUMPKIN-417`, shown on screen once, with Copy and Send-to-Viber buttons. Codes are remembered on the device that created them, so editing usually needs no typing.
- After 5 wrong edit codes, a home stops accepting codes for 15 minutes. Each further lockout doubles that (30, 60, 120 minutes …) until a correct code is used.
- At **1 Nov 02:00** (Nicosia) the map empties and stops accepting changes. Entries are deleted automatically from **8 Nov**.
- English and Greek, switchable in the top bar.

## Deploy (about 15 minutes)

1. Create an empty **private** repository on GitHub, e.g. `halloween-map`.
2. Unzip and push:
   ```bash
   unzip halloween-map.zip && cd halloween-map
   git init && git add . && git commit -m "Initial version"
   git branch -M main
   git remote add origin https://github.com/<you>/halloween-map.git
   git push -u origin main
   ```
3. In the AWS console, pick a region (e.g. Europe (Frankfurt)) and open **Amplify → Create new app → GitHub**.
   - Authorise AWS for that one repository, then pick it and the `main` branch.
   - The build settings come from `amplify.yml`; leave them as they are.
   - Under **Advanced settings → Environment variables**, add `GROUP_CODE` with the code you will share in Viber. The deploy stops with a clear message if it's missing.
   - When asked for a service role, choose **Create and use a new service role**.
4. **Save and deploy.** The first build takes about 5–10 minutes and creates DynamoDB, AppSync and the website.
5. The site address is shown on the app page: `https://main.<app-id>.amplifyapp.com`. Send that link plus the group code to the Viber admin.

After that, every `git push` to `main` redeploys automatically.

## Admin: codes and changes

All entries live in one DynamoDB table: **DynamoDB → Tables → `halloween-map-entries-main` → Explore table items**.

| Column | What it is |
|---|---|
| `names`, `apartment`, `buzzer`, `notes` | What the host typed |
| `lat`, `lng` | Pin position |
| `editCode` | The home's edit code, to give back to someone who forgot it |
| `attempts`, `attemptWindowStart`, `strikes` | Wrong-code counter and lockout level (cleared after a correct code) |
| `expiresAt` | Automatic deletion time (Unix seconds) |

- **Someone forgot their code:** find their row by names or apartment and read them `editCode`.
- **Change an entry:** take its `editCode` and use **Edit** on the site, so the site's checks still apply. Editing the row directly in the console also works, but nothing is checked there.
- **Remove spam or an unwanted entry:** select the row → **Actions → Delete items**.
- **Unlock a home after wrong codes:** delete the `attempts`, `attemptWindowStart` and `strikes` values on that row.

## Settings

**Group code:** set in the Amplify console, never in the repository: **Hosting → Environment variables → `GROUP_CODE`**. Case, spaces and dashes are ignored. After changing it, redeploy (**Deployments → Redeploy this version**, or push any commit).

Everything else is in `amplify/settings.ts`; edit, commit and push:

| Setting | Now | Meaning |
|---|---|---|
| `HIDE_AT` | `2026-11-01T00:00:00Z` | When the map empties and closes (02:00 Nicosia) |
| `DELETE_AT` | `2026-11-08T00:00:00Z` | Entries are stamped to be deleted from this time (applies to entries created after the change) |

The event date and time shown on the page are in `src/i18n.ts` (`when`), in both languages.

## After Halloween

DynamoDB deletes the entries automatically from 8 Nov (AWS says typically within a few days of that time). The site itself shows nothing after 1 Nov 02:00. To remove everything at once, delete the app in **Amplify → App settings → General → Delete app**. That also deletes the table.

**Cost:** for a neighbourhood this is almost certainly under $1 in total: AppSync and DynamoDB are pay-per-request, and Amplify Hosting has a free tier.

## Work on it locally

```bash
npm install
npm run demo      # the site with sample homes (group code: DEMO), running the real backend logic in the browser
npm test          # backend tests: the real AppSync resolvers against an in-memory table
npm run lint      # checks the resolvers against AppSync's JavaScript runtime rules
npm run typecheck
```

### How it is built

- `amplify/backend.ts`: the DynamoDB table (pay-per-request, TTL on `expiresAt`) and the AppSync settings.
- `amplify/data/resource.ts`: the GraphQL API, with five operations and a public API key.
- `amplify/data/resolvers/`: AppSync JavaScript resolvers, with all rules enforced server-side:
  - `listPins`: locations for everyone; details only with the group code; edit codes are never returned.
  - `createEntry`: checks the group code, consent, map area and text lengths; generates the edit code.
  - `getEntryForEdit`, `updateEntry`, `deleteEntry`: each runs `loadEntry` → `countAttempt` → the operation. The attempt is counted with a conditional write *before* the code is compared, so even parallel requests get at most 5 tries per window; repeated lockouts double the window. Without the group code, `listPins` returns placeholder ids, so outsiders can't target entries.
- `src/`: React + Leaflet front end with OpenStreetMap tiles.
- `customHttp.yml`: security headers (Content-Security-Policy, noindex, `strict-origin-when-cross-origin` referrer, which OpenStreetMap's tile policy needs).
- `devsim/`: the in-memory AppSync/DynamoDB stand-in used by `npm run demo` and the tests. It never ships in the real site.

Map area: a 2 km × 2 km box centred on 35.0757663 N, 33.3131540 E. Its edges are 1 km geodesic offsets: S 35.0667526, N 35.0847800, W 33.3021896, E 33.3241184.
