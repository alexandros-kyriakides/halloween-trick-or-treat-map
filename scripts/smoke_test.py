#!/usr/bin/env python3
"""Release check against the REAL deployed site and AppSync API.

    python3 scripts/smoke_test.py https://main.<app-id>.amplifyapp.com

Asks for the group code without echoing it (or reads HM_GROUP_CODE). Python 3 standard
library only. Creates three entries marked "SMOKE TEST", checks every access rule, deletes
what it can, and lists anything left over. Entry C is locked on purpose (lockout test), so it
can't be deleted through the API; the script prints the command that removes it.

Exit code 0 = every check passed.
"""
import getpass
import json
import os
import re
import sys
import urllib.error
import urllib.request

CENTER = (35.0757663, 33.313154)
# A spot ~400 m south-east of the centre, inside the 1.5 km box.
TEST_POINT = (35.0722, 33.3170)
OUTSIDE_POINT = (35.0900, 33.3131)  # ~1.6 km north of the centre: outside the box
MARK = 'SMOKE TEST - please ignore'

results = []


def check(name, ok, detail=''):
    results.append((name, ok))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f'  ({detail})' if detail and not ok else ''))
    return ok


def http(url, data=None, headers=None, method=None):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
    except (urllib.error.URLError, OSError) as e:
        print(f'      network error for {url}: {e}')
        return 0, {}, b''


class Api:
    def __init__(self, url, key):
        self.url, self.key = url, key

    def call(self, query, variables=None):
        body = json.dumps({'query': query, 'variables': variables or {}}).encode()
        status, _, raw = http(self.url, body, {'content-type': 'application/json', 'x-api-key': self.key})
        out = json.loads(raw)
        if out.get('errors'):
            e = out['errors'][0]
            return None, (e.get('errorType'), e.get('errorInfo') or {}, e.get('message'))
        return out['data'], None


PIN = 'id lat lng apartment names buzzer notes'
LIST = 'query ($g: String) { listPins(groupCode: $g) { groupCodeOk closed pins { %s } } }' % PIN
CREATE = ('mutation ($g: String!, $lat: Float!, $lng: Float!, $names: String, $apartment: String) {'
          ' createEntry(groupCode: $g, consent: true, lat: $lat, lng: $lng, names: $names, apartment: $apartment, streetNumber: "1") { id editCode } }')
GET = 'query ($id: ID!, $c: String!) { getEntryForEdit(id: $id, editCode: $c) { %s } }' % PIN
UPDATE = ('mutation ($id: ID!, $c: String!, $lat: Float!, $lng: Float!, $names: String, $apartment: String, $notes: String) {'
          ' updateEntry(id: $id, editCode: $c, lat: $lat, lng: $lng, names: $names, apartment: $apartment, notes: $notes, streetNumber: "1") { %s } }' % PIN)
DELETE = 'mutation ($id: ID!, $c: String!) { deleteEntry(id: $id, editCode: $c) }'


def wrong_code(real):
    return 'BAT-000' if real.upper() != 'BAT-000' else 'CAT-000'


def main():
    if len(sys.argv) != 2 or not sys.argv[1].startswith('http'):
        print(__doc__)
        return 2
    site = sys.argv[1].rstrip('/')
    group = os.environ.get('HM_GROUP_CODE') or getpass.getpass('Group code (not shown): ')
    if group.strip().upper().replace('-', '').replace(' ', '') == '31OCT':
        check('group code is not the leaked 31OCT', False, 'rotate GROUP_CODE before launch')

    # ---------- site, headers, assets ----------
    status, headers, html = http(site + '/')
    h = {k.lower(): v for k, v in headers.items()}
    check('site loads', status == 200, f'HTTP {status}')
    check('Content-Security-Policy header', 'content-security-policy' in h)
    check('Referrer-Policy is strict-origin-when-cross-origin',
          h.get('referrer-policy') == 'strict-origin-when-cross-origin', h.get('referrer-policy'))
    check('X-Robots-Tag noindex', 'noindex' in h.get('x-robots-tag', ''), h.get('x-robots-tag'))
    assets = re.findall(r'(?:src|href)="(/assets/[^"]+\.(?:js|css))"', html.decode('utf-8', 'replace'))
    leaked = []
    for a in assets:
        _, _, body = http(site + a)
        if group.strip() and group.strip().lower() in body.decode('utf-8', 'replace').lower():
            leaked.append(a)
    check(f'group code absent from {len(assets)} frontend assets', bool(assets) and not leaked, ', '.join(leaked))

    status, _, raw = http(site + '/amplify_outputs.json')
    outputs = json.loads(raw)
    check('amplify_outputs.json has only API URL/key config, no group code',
          status == 200 and group.strip().lower() not in raw.decode().lower())
    api = Api(outputs['data']['url'], outputs['data']['api_key'])

    # Map tile (Esri street map) with the Referer a browser sends under strict-origin-when-cross-origin
    t_status, _, _ = http('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/16/25921/39158',
                          headers={'Referer': site + '/', 'User-Agent': 'Mozilla/5.0 (smoke test)'})
    check('map tile served with site Referer', t_status == 200, f'HTTP {t_status}')

    # ---------- access rules ----------
    d, err = api.call(LIST)
    pins = (d or {}).get('listPins', {}).get('pins', [])
    check('listPins without code works', err is None, err)
    check('without code: no names/apartment/bell/notes',
          all(p['names'] is None and p['apartment'] is None and p['buzzer'] is None and p['notes'] is None for p in pins))
    check('without code: placeholder ids only', all(p['id'].startswith('pin-') for p in pins))

    d, err = api.call(LIST, {'g': 'WRONG-' + group})
    check('wrong group code: no details', err is None and not d['listPins']['groupCodeOk']
          and all(p['names'] is None for p in d['listPins']['pins']))
    _, err = api.call(CREATE, {'g': 'WRONG-' + group, 'lat': TEST_POINT[0], 'lng': TEST_POINT[1], 'names': MARK})
    check('wrong group code: create rejected', err and err[0] == 'BAD_GROUP_CODE', err)

    _, err = api.call(CREATE, {'g': group, 'lat': OUTSIDE_POINT[0], 'lng': OUTSIDE_POINT[1], 'names': MARK})
    check('outside the 1.5 km box: rejected', err and err[0] == 'OUTSIDE_AREA', err)

    made = {}
    for label, apt in (('A', 'A-101'), ('B', 'B-202'), ('C', 'C-lockout')):
        d, err = api.call(CREATE, {'g': group, 'lat': TEST_POINT[0], 'lng': TEST_POINT[1], 'names': MARK, 'apartment': apt})
        ok = err is None and re.fullmatch(r'[A-Z]+-\d{3}', d['createEntry']['editCode'] or '')
        check(f'create entry {label} (same coordinates)', bool(ok), err)
        if ok:
            made[label] = d['createEntry']
    if len(made) < 3:
        return finish(api, group, made)
    A, B, C = made['A'], made['B'], made['C']

    d, _ = api.call(LIST)
    anon_ids = {p['id'] for p in d['listPins']['pins']}
    check('new entries not exposed by real id without code', not ({A['id'], B['id'], C['id']} & anon_ids))

    _, err = api.call(GET, {'id': A['id'], 'c': wrong_code(A['editCode'])})
    check('wrong edit code rejected, 4 tries left', err and err[0] == 'WRONG_CODE' and err[1].get('triesLeft') == 4, err)
    _, err = api.call(GET, {'id': A['id'], 'c': B['editCode']})
    check("B's code rejected on A", err and err[0] == 'WRONG_CODE', err)
    _, err = api.call(DELETE, {'id': A['id'], 'c': B['editCode']})
    check("B's code cannot delete A", err and err[0] == 'WRONG_CODE', err)

    d, err = api.call(GET, {'id': A['id'], 'c': A['editCode'].lower()})
    check('correct code reads A (case-insensitive)', err is None and d['getEntryForEdit']['apartment'] == 'A-101', err)
    d, err = api.call(UPDATE, {'id': A['id'], 'c': A['editCode'], 'lat': TEST_POINT[0], 'lng': TEST_POINT[1],
                               'names': MARK, 'apartment': 'A-101', 'notes': 'updated'})
    check('correct code updates A', err is None and d['updateEntry']['notes'] == 'updated', err)
    d, _ = api.call(LIST, {'g': group})
    by_apt = {p['apartment']: p for p in d['listPins']['pins'] if p['names'] == MARK}
    check('B unchanged by A update', by_apt.get('B-202', {}).get('notes') is None and 'A-101' in by_apt)

    d, err = api.call(DELETE, {'id': A['id'], 'c': A['editCode']})
    check('correct code deletes A', err is None and d['deleteEntry'] is True, err)
    d, _ = api.call(LIST, {'g': group})
    apts = {p['apartment'] for p in d['listPins']['pins'] if p['names'] == MARK}
    check('B still present after deleting A', 'B-202' in apts and 'A-101' not in apts, apts)
    d, err = api.call(DELETE, {'id': B['id'], 'c': B['editCode']})
    check('correct code deletes B', err is None and d['deleteEntry'] is True, err)
    del made['A'], made['B']

    for i in range(5):
        _, err = api.call(GET, {'id': C['id'], 'c': wrong_code(C['editCode'])})
    check('5th wrong code reports 0 tries left', err and err[0] == 'WRONG_CODE' and err[1].get('triesLeft') == 0, err)
    _, err = api.call(GET, {'id': C['id'], 'c': C['editCode']})
    check('after 5 wrong codes even the right code is LOCKED', err and err[0] == 'LOCKED', err)

    return finish(api, group, made)


def finish(api, group, made):
    d, _ = api.call(LIST, {'g': group})
    left = [p for p in (d or {}).get('listPins', {}).get('pins', []) if p['names'] == MARK]
    print()
    if left:
        print('Test entries still in production (delete them now):')
        for p in left:
            print(f"  {p['id']}  apartment={p['apartment']}")
            print(f"    aws dynamodb delete-item --table-name halloween-map-entries-main --key '{{\"id\":{{\"S\":\"{p['id']}\"}}}}'")
        print('  or DynamoDB console -> halloween-map-entries-main -> Explore items -> select -> Actions -> Delete items')
    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
