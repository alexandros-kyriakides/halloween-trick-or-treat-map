# Running the map again (next year)

How to bring the trick-or-treat map back for another Halloween: what to change in the code, and what to do in AWS and in Google Cloud. Start about **two weeks before** the event, so hosts have time to add their homes.

The work depends on whether last year's setup still exists:

| | Amplify app still there | Amplify app deleted |
| --- | --- | --- |
| Code changes (step 1) | Yes | Yes |
| AWS | Update environment variables, push (step 2A) | Create a new Amplify app (step 2B) |
| Google Cloud | Check the key still works (step 3A) | Point the key at the new site address (step 3B) |
| Site address | Same as last year | New address |

Keeping the Amplify app between years costs almost nothing: the site is static, and the DynamoDB table is pay-per-request and empty after the automatic clean-up.

## 1. Update the code

All dates are fixed in the code. Change them on a branch, open a pull request and merge it (Claude can do this if GitHub is connected to its session). Every merge to `main` redeploys the site.

| File | What to change |
| --- | --- |
| `amplify/settings.ts` | `HIDE_AT`: when the map closes. `DELETE_AT`: when entries are deleted. Both in UTC (see the note below). Also update the dates in the comments. |
| `src/i18n.ts` | `when` in English and Greek (the event day and start time shown on the page; check the weekday). The consent text in both languages, which names the deletion date ("Everything is deleted automatically from 8 November …"). |
| `README.md` | The dates in the opening bullets, and the expected `expiresAt` value in the runbook (`DELETE_AT` as Unix seconds: `date -u -d 2027-11-08T00:00:00Z +%s`). |
| `tests/backend.test.mjs` | Optional: `BEFORE_EVENT`, a moment before the new closing time. The tests still pass without this change. |

**Times in UTC.** Cyprus clocks go back on the last Sunday of October, so from then on Nicosia is UTC+2. A 02:00 Nicosia closing time on 1 November is therefore `T00:00:00Z`. Example for 2027:

```ts
HIDE_AT: '2027-11-01T00:00:00Z',   // 1 Nov 2027, 02:00 Nicosia
DELETE_AT: '2027-11-08T00:00:00Z', // 8 Nov 2027, 02:00 Nicosia
```

**Different area?** The map is a 1.5 km × 1.5 km box around Michalis Tourapis Park. To move or resize it, change `CENTER` and `BOUNDS` in `src/config.ts` **and** the same bounds in `amplify/data/resolvers/createEntry.js` and `amplify/data/resolvers/updateEntry.js`. The server enforces the box, so all three must match.

Check locally before merging:

```bash
npm install
npm test
npm run lint
npm run typecheck
npm run build
```

## 2A. AWS: the Amplify app is still there

1. **Sign in** to the AWS console and switch to the region the app was created in (top right).
2. Open **Amplify** → the app → **Hosting → Environment variables** → **Manage variables**:
   - `GROUP_CODE`: set a **new** code for this year. Never `31OCT` (it is in the git history), and not last year's.
   - `SUPER_CODE`: set a new admin code, at least 10 letters or digits and different from `GROUP_CODE`. Leave it out to switch admin editing off.
   - `VITE_GOOGLE_MAPS_API_KEY`: keep it, unless you create a new key in step 3.
   - **Save.**
3. **Check that Amplify can still read the repository:** the app page should list the `main` branch with its last build. If the next build fails because Amplify can't reach GitHub (for example, its GitHub access was revoked), reconnect the repository in the app's settings.
4. **Deploy:** merging the step 1 changes starts a build. If the code was already merged, use **Hosting → Deployments → Redeploy this version**. A build takes about 10 minutes. Each deploy also renews the public API key, which lasts 45 days from the deploy.
5. **Check the table** (optional):
   ```bash
   aws dynamodb scan --table-name halloween-map-entries-main --select COUNT
   ```
   It should be 0. Rows left from last year are deleted by DynamoDB's automatic expiry, and the site would hide them anyway, but you can delete leftovers with the bulk-removal commands in the README runbook.

## 2B. AWS: create the Amplify app again

1. **Sign in** to the AWS console and pick a region, for example **Europe (Frankfurt)**.
2. **Amplify → Create new app → GitHub.**
   - Authorise AWS for the `halloween-trick-or-treat-map` repository, then pick it and the `main` branch.
   - Leave **"My app is a monorepo"** unticked: the app is at the root of the repository.
   - The build settings come from `amplify.yml`; leave them as they are.
3. **Advanced settings → Environment variables:**
   - `GROUP_CODE`: a new code (never `31OCT`, not last year's). The build stops with a clear message if it is missing.
   - `SUPER_CODE`: optional admin code, at least 10 letters or digits, different from `GROUP_CODE`.
   - `VITE_GOOGLE_MAPS_API_KEY`: the Google key from step 3. Without it the site falls back to Esri maps.
4. **Service role:** choose **Create and use a new service role**. Amplify uses it during builds to create the table, the API and the hosting.
5. **Save and deploy.** The first build takes about 10 minutes and creates:
   - the DynamoDB table `halloween-map-entries-main`, with automatic expiry on `expiresAt`;
   - the AppSync API and its public API key;
   - the website.
6. **Note the new site address**, `https://main.<app-id>.amplifyapp.com`, on the app page. Google needs it in step 3B.

## 3A. Google Cloud: the key still exists

1. Open https://console.cloud.google.com and select last year's project (e.g. `halloween-map`).
2. **Billing:** the project must still be linked to an active billing account, or Google stops serving maps.
3. **APIs & Services → Enabled APIs:** both **Maps JavaScript API** (the live map) and **Maps Static API** (the print/PDF image) must be enabled.
4. **APIs & Services → Credentials →** the key:
   - **Application restrictions → Websites:** `https://main.<app-id>.amplifyapp.com/*` with the current site address.
   - **API restrictions:** only Maps JavaScript API and Maps Static API.

If the key was deleted, follow 3B.

## 3B. Google Cloud: new project or new key

1. https://console.cloud.google.com → **Create project**, e.g. `halloween-map`, and **link a billing account**. Google requires billing even for usage inside its free monthly allowance.
2. **APIs & Services → Library:** enable **Maps JavaScript API** and **Maps Static API**.
3. **APIs & Services → Credentials → Create credentials → API key.** Edit the key:
   - **Application restrictions → Websites:** add `https://main.<app-id>.amplifyapp.com/*`.
   - **API restrictions → Restrict key:** tick only Maps JavaScript API and Maps Static API.
4. **Put the key in Amplify:** Hosting → Environment variables → `VITE_GOOGLE_MAPS_API_KEY` → Save, then **Redeploy this version**. The key is built into the website, so it only takes effect after a new build.

The key is visible in the web page, as for every site that uses Google Maps. The website restriction is what stops others from using it.

## 4. Check before sharing the link

1. **Release check**, from a laptop with Python 3 (no installs). It asks for the group code without showing it:
   ```bash
   python3 scripts/smoke_test.py https://main.<app-id>.amplifyapp.com
   ```
   Every line must say PASS. It creates test entries and deletes them, except the deliberately locked one: delete that with the command it prints.
2. **Build log:** in Amplify, open the latest build and search the log for the group code. It must not appear.
3. **On a phone, inside Viber,** and on a laptop: open the link, enter the group code, add a home, copy the edit code, reopen the edit link, change something, remove the home, switch to Greek, try **Show my location**, and open **Print** to check the map image. Delete the test homes afterwards.
4. **Costs and clean-up:**
   - AWS budget alert (once per account): Billing and Cost Management → Budgets → Create budget → monthly cost, $5, email alert at 80 %.
   - A Google Cloud budget alert works the same way: Billing → Budgets & alerts.
   - Automatic deletion is on:
     ```bash
     aws dynamodb describe-time-to-live --table-name halloween-map-entries-main
     # expect: "TimeToLiveStatus": "ENABLED", "AttributeName": "expiresAt"
     ```
5. **Share it:** send the site address and the group code to the Viber group admin. Hosts add their homes; parents use the same link on the night.

## 5. After the event

- **Nothing to do for the map:** at `HIDE_AT` the server stops showing homes and refuses changes, even with the admin code.
- **Data:** each home is stamped with `DELETE_AT`, and DynamoDB deletes it on its own, usually within a few days of that time. To keep a copy first, use DynamoDB **Export to S3**, or save the scan output to a file.
- **Optional:**
  - **Remove everything:** delete the Amplify app (App settings → General → Delete app). This also deletes the table and anything still in it.
  - **Google:** delete the key, or leave it restricted to the site address.
