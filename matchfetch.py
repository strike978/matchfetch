import json
import re

import flet as ft
import requests

REGIONS = {
    "00100": "Senegal",
    "00200": "Mali",
    "00300": "Ivory Coast & Ghana",
    "00401": "Benin & Togo",
    "00402": "Yorubaland",
    "00403": "Central West Africa",
    "00501": "Central Nigeria",
    "00502": "North-Central Nigeria",
    "00503": "Nigeria",
    "00600": "Nigerian Woodlands",
    "00700": "Cameroon",
    "00750": "Western Bantu Peoples",
    "00760": "Twa",
    "00800": "Southern Bantu Peoples",
    "00900": "Eastern Bantu Peoples",
    "01000": "Nilotic Peoples",
    "01100": "Ethiopia & Eritrea",
    "01200": "Somalia",
    "01300": "Khoisan, Aka & Mbuti Peoples",
    "01400": "Northern Africa",
    "01500": "Egypt",
    "01600": "Arabian Peninsula",
    "01700": "Levant",
    "01800": "Cyprus",
    "01900": "Anatolia & the Caucasus",
    "02000": "Iran/Persia",
    "02001": "Lower Central Asia",
    "02002": "Northern Iraq & Northern Iran",
    "02100": "Burusho",
    "02200": "Indo-Gangetic Plain",
    "02301": "Western Himalayas & the Hindu Kush",
    "02302": "Gujarat",
    "02303": "Gulf of Khambhat",
    "02401": "Southern India",
    "02402": "Southwest India",
    "02403": "The Deccan & the Gulf of Mannar",
    "02500": "Bengal",
    "02600": "Nepal & the Himalayan Foothills",
    "02700": "Tibetan Peoples",
    "02800": "Northern Asia",
    "02900": "Mongolia & Upper Central Asia",
    "03000": "Korea",
    "03100": "Japan",
    "03200": "Southern Japanese Islands",
    "03300": "Northern China",
    "03350": "Western China",
    "03400": "Southwestern China",
    "03500": "Central & Eastern China",
    "03600": "Southern China",
    "03700": "Dai",
    "03800": "Mainland Southeast Asia",
    "03850": "Maritime Southeast Asia",
    "03900": "Vietnam",
    "04000": "Northern & Central Philippines",
    "04150": "Central & Southern Philippines",
    "04151": "Luzon",
    "04152": "Western Visayas",
    "04200": "Guam",
    "04300": "Melanesia",
    "04400": "Aboriginal and/or Torres Strait Islander Peoples",
    "04500": "Tonga",
    "04600": "Samoa",
    "04700": "Hawaii",
    "04800": "New Zealand Maori",
    "04900": "Indigenous Arctic",
    "05000": "Indigenous Americas—North",
    "05100": "Indigenous Americas—Mexico ",
    "05200": "Indigenous Americas— Yucatán Peninsula ",
    "05300": "Indigenous Americas—Central",
    "05400": "Indigenous Americas—Panama & Costa Rica",
    "05500": "Indigenous Cuba",
    "05600": "Indigenous Haiti & Dominican Republic",
    "05700": "Indigenous Puerto Rico",
    "05800": "Indigenous Americas—Colombia & Venezuela",
    "05900": "Indigenous Americas—Ecuador",
    "06000": "Indigenous Americas—Bolivia & Peru",
    "06100": "Indigenous Americas—Chile",
    "06200": "Indigenous Eastern South America",
    "06300": "Ashkenazi Jews",
    "06301": "Sephardic Jews",
    "06400": "Finland",
    "06500": "Sweden",
    "06501": "Denmark",
    "06600": "Norway",
    "06601": "Iceland",
    "06700": "Baltics",
    "06800": "Central & Eastern Europe",
    "06801": "Russia",
    "06900": "The Balkans",
    "06950": "Eastern European Roma",
    "07000": "Greece & Albania",
    "07100": "Aegean Islands",
    "07200": "Malta",
    "07300": "Sardinia",
    "07400": "Southern Italy & the Eastern Mediterranean",
    "07500": "Northern Italy",
    "07600": "France",
    "07700": "Germanic Europe",
    "07701": "The Netherlands",
    "07800": "Basque",
    "07900": "Spain",
    "08000": "Portugal",
    "08100": "England & Northwestern Europe",
    "08101": "Cornwall",
    "08200": "Wales",
    "08300": "Scotland",
    "08400": "Ireland",
}


def batch_fetch_journeys(test_guid, sample_ids, cookies):
    """
    Fetch journeys (communities) for a batch of sample IDs.
    Returns: {sample_id: {'journeys': [...], 'subjourneys': [...]}}
    """
    url = f"https://www.ancestry.com/dna/origins/secure/compare/{test_guid}/batchCommunities"
    payload = [test_guid] + sample_ids
    headers = {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
    print(f"\n[BATCH JOURNEYS] URL: {url}")
    print(f"[BATCH JOURNEYS] Payload: {payload}")
    print(f"[BATCH JOURNEYS] Headers: {headers}")
    with requests.Session() as session:
        resp = session.post(url, headers=headers,
                            cookies=cookies, data=json.dumps(payload))
        print(f"[BATCH JOURNEYS] Status: {resp.status_code}")
        try:
            resp_json = resp.json()
            print(
                f"[BATCH JOURNEYS] Response: {json.dumps(resp_json)[:500]}{'...truncated' if len(json.dumps(resp_json)) > 500 else ''}")
        except Exception as ex:
            print(f"[BATCH JOURNEYS] Response not JSON: {ex}")
            resp_json = {}
        if resp.status_code == 200:
            return resp_json
        else:
            return {}


def batch_fetch_ethnicities(test_guid, sample_ids, cookies):
    """
    Fetch ethnicities for a batch of sample IDs.
    Returns: {sample_id: {'regions': [{'key':..., 'label':..., 'percentage':...}, ...]}}
    """
    url = f"https://www.ancestry.com/dna/origins/secure/compare/{test_guid}/batchEthnicity"
    payload = [test_guid] + sample_ids
    headers = {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
    print(f"\n[BATCH ETHNICITIES] URL: {url}")
    print(f"[BATCH ETHNICITIES] Payload: {payload}")
    print(f"[BATCH ETHNICITIES] Headers: {headers}")
    with requests.Session() as session:
        resp = session.put(url, headers=headers,
                           cookies=cookies, data=json.dumps(payload))
        print(f"[BATCH ETHNICITIES] Status: {resp.status_code}")
        try:
            resp_json = resp.json()
            print(
                f"[BATCH ETHNICITIES] Response: {json.dumps(resp_json)[:500]}{'...truncated' if len(json.dumps(resp_json)) > 500 else ''}")
        except Exception as ex:
            print(f"[BATCH ETHNICITIES] Response not JSON: {ex}")
            resp_json = {}
        if resp.status_code == 200:
            return resp_json
        else:
            return {}


def enrich_matches_with_journeys_ethnicities(test_guid, matches, cookies, batch_size=24):
    """
    For a list of matches, batch fetch journeys and ethnicities, and add them to each match dict.
    Modifies matches in place. Also resolves journey and subjourney names.
    """
    sample_ids = [m.get('sampleId') for m in matches if m.get('sampleId')]
    total = len(sample_ids)
    print(
        f"\n[ENRICH] Total matches to enrich: {total}, batch size: {batch_size}")
    import os
    progress_file = "progress.json"
    # Try to load params from progress file if present, else fallback to minimal params
    params = None
    if os.path.exists(progress_file):
        try:
            with open(progress_file, "r", encoding="utf-8") as pf:
                progress = json.load(pf)
                params = progress.get("params")
        except Exception:
            params = None
    if not params:
        params = {"test_guid": test_guid}
    enriched_ids = set()
    # Try to load existing enriched_ids if present
    if os.path.exists(progress_file):
        try:
            with open(progress_file, "r", encoding="utf-8") as pf:
                progress = json.load(pf)
                if "enriched_ids" in progress:
                    enriched_ids = set(progress["enriched_ids"])
        except Exception:
            pass
    import time
    for i in range(0, total, batch_size):
        batch = sample_ids[i:i+batch_size]
        print(f"[ENRICH] Processing batch {i//batch_size+1}: {batch}")
        comm_result = batch_fetch_journeys(test_guid, batch, cookies)
        eth_result = batch_fetch_ethnicities(test_guid, batch, cookies)
        batch_journey_ids = set()
        batch_branch_ids_for_subjourneys = set()
        for m in matches:
            sid = m.get('sampleId')
            if sid in batch:
                comm = comm_result.get(sid, {})
                journeys = []
                subjourneys = []
                branch_ids_for_subjourneys = []
                if isinstance(comm, dict):
                    branches = comm.get('branches', [])
                    if isinstance(branches, list):
                        journeys = [b.get('id') for b in branches if isinstance(
                            b, dict) and 'id' in b]
                        for b in branches:
                            if isinstance(b, dict):
                                branch_id = b.get('id')
                                communities = b.get('communities', [])
                                if isinstance(communities, list) and branch_id:
                                    if communities:
                                        branch_ids_for_subjourneys.append(
                                            branch_id)
                                    subjourneys.extend(
                                        [c.get('id') for c in communities if isinstance(c, dict) and 'id' in c])
                m['journeys'] = journeys
                m['subjourneys'] = subjourneys
                m['subjourney_branch_ids'] = branch_ids_for_subjourneys
                batch_journey_ids.update(journeys)
                batch_branch_ids_for_subjourneys.update(
                    branch_ids_for_subjourneys)
                eth = eth_result.get(sid, {})
                regions = eth.get('regions', [])
                m['regions'] = [
                    {'key': r.get('key'), 'percentage': r.get('percentage')}
                    for r in regions if 'key' in r and 'percentage' in r
                ]
                print(f"[ENRICHED] SampleID: {sid}")
                print(f"  Journeys (branches): {journeys}")
                print(f"  Subjourneys (communities): {subjourneys}")
                print(
                    f"  Branch IDs for subjourney names: {branch_ids_for_subjourneys}")
                print(
                    f"  Regions: {[f'{r['key']}:{r['percentage']}' for r in m['regions']]}")
        journey_names = resolve_journey_names(list(batch_journey_ids), cookies)
        subjourney_names = resolve_subjourney_names(
            list(batch_branch_ids_for_subjourneys), cookies)
        for m in matches:
            sid = m.get('sampleId')
            if sid in batch:
                m['journey_names'] = [journey_names.get(
                    j, j) for j in m.get('journeys', [])]
                subjourney_names_list = []
                for branch_id in m.get('journeys', []):
                    branch_communities = subjourney_names.get(branch_id)
                    if isinstance(branch_communities, dict):
                        comm_ids = [c for c in m.get(
                            'subjourneys', []) if c.startswith(branch_id + '.')]
                        for comm_id in comm_ids:
                            name = branch_communities.get(comm_id)
                            if name and name not in subjourney_names_list:
                                subjourney_names_list.append(name)
                m['subjourneys'] = subjourney_names_list
                enriched_ids.add(sid)
        # Save progress after each batch enrichment (params + matches + enriched_ids)
        try:
            with open(progress_file, "w", encoding="utf-8") as pf:
                json.dump({"params": params, "matches": matches,
                          "enriched_ids": list(enriched_ids)}, pf)
        except Exception as ex:
            print(f"[ENRICH] Could not save progress after batch: {ex}")
        time.sleep(2)  # Delay between batches


def resolve_journey_names(journey_ids, cookies):
    """
    Given a list of journey (branch) IDs, return a dict {id: name}
    """
    if not journey_ids:
        return {}
    url = "https://www.ancestry.com/dna/origins/branches/names"
    headers = {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
    payload = json.dumps(journey_ids)
    try:
        with requests.Session() as session:
            resp = session.post(url, headers=headers,
                                cookies=cookies, data=payload)
            if resp.status_code == 200:
                return resp.json()
    except Exception as ex:
        print(f"[resolve_journey_names] Exception: {ex}")
    return {j: j for j in journey_ids}


def resolve_subjourney_names(subjourney_ids, cookies):
    """
    Given a list of branch IDs (not community IDs), return a dict {branch_id: subjourney/community name}
    """
    if not subjourney_ids:
        return {}
    url = "https://www.ancestry.com/dna/origins/communities/names"
    headers = {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
    payload = json.dumps(subjourney_ids)
    print(f"[DEBUG] /communities/names API payload (branch IDs): {payload}")
    try:
        with requests.Session() as session:
            resp = session.post(url, headers=headers,
                                cookies=cookies, data=payload)
            if resp.status_code == 200:
                resp_json = resp.json()
                print(
                    f"[DEBUG] /communities/names API response: {json.dumps(resp_json)}")
                # Return the full dict for each branch, not just the branch name
                result = {}
                for k, v in resp_json.items():
                    if isinstance(v, dict):
                        result[k] = v
                    else:
                        result[k] = {}
                return result
    except Exception as ex:
        print(f"[resolve_subjourney_names] Exception: {ex}")
    return {sj: sj for sj in subjourney_ids}


def parse_cookie_string(cookie_string):
    cookies = {}
    if not cookie_string:
        return cookies
    cookie_string = cookie_string.strip()
    pairs = re.split(r';|\n', cookie_string)
    for pair in pairs:
        pair = pair.strip()
        if not pair:
            continue
        if '=' in pair:
            k, v = pair.split('=', 1)
            cookies[k.strip()] = v.strip()
    return cookies


def get_csrf_token(cookies):
    if not cookies:
        return None
    csrf_cookie = cookies.get('_dnamatches-matchlistui-x-csrf-token')
    if csrf_cookie:
        return re.split(r'%7C|\|', csrf_cookie)[0]
    return None


def fetch_tests_json(cookie_path):
    with open(cookie_path, 'r', encoding='utf-8') as f:
        cookie_str = f.read().strip()
    cookies = parse_cookie_string(cookie_str)
    url = 'https://www.ancestry.com/dna/insights/api/dnaSubnav/tests'
    headers = {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
    with requests.Session() as session:
        response = session.get(url, headers=headers, cookies=cookies)
    if response.status_code == 200:
        try:
            return response.json(), cookies
        except Exception:
            return None, cookies
    else:
        return None, cookies


def parse_test_list(tests_json):
    # Assume API always returns dict with 'dnaSamplesData' list
    test_list = []
    for sample in tests_json.get('dnaSamplesData', []):
        subject_name = sample.get('subjectName')
        test_guid = sample.get('testGuid')
        test_list.append((subject_name, test_guid))
    return test_list


def fetch_counts_journeys(test_guid, cookies):
    headers = {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
    csrf_token = get_csrf_token(cookies)
    if csrf_token:
        headers['X-CSRF-Token'] = csrf_token
    total = close = distant = 0
    journeys = []
    journey_ids = set()
    debug_log = []
    try:
        with requests.Session() as session:
            count_url = f"https://www.ancestry.com/discoveryui-matches/parents/list/api/matchCount/{test_guid}"
            payload_total = json.dumps({"lower": 0, "upper": 10})
            resp_total = session.post(
                count_url, headers=headers, cookies=cookies, data=payload_total)
            if resp_total.status_code == 200:
                data = resp_total.json()
                total = data.get('count', 0)
            payload_close = json.dumps({"lower": 0, "upper": 9})
            resp_close = session.post(
                count_url, headers=headers, cookies=cookies, data=payload_close)
            if resp_close.status_code == 200:
                data = resp_close.json()
                close = data.get('count', 0)
            payload_distant = json.dumps({"lower": 10, "upper": 10})
            resp_distant = session.post(
                count_url, headers=headers, cookies=cookies, data=payload_distant)
            if resp_distant.status_code == 200:
                data = resp_distant.json()
                distant = data.get('count', 0)
            url_journeys = f"https://www.ancestry.com/discoveryui-matches/parents/list/api/journeys/{test_guid}"
            resp_j = session.get(
                url_journeys, headers=headers, cookies=cookies)
            if resp_j.status_code == 200:
                data = resp_j.json()
                for arr in data.values():
                    if isinstance(arr, list):
                        for comm in arr:
                            cid = comm.get('communityId')
                            if cid:
                                journey_ids.add(cid)
            if journey_ids:
                names_url = "https://www.ancestry.com/dna/origins/branches/names"
                payload = json.dumps(list(journey_ids))
                names_headers = dict(headers)
                names_headers['Content-Type'] = 'application/json'
                resp_names = session.post(
                    names_url, headers=names_headers, cookies=cookies, data=payload)
                if resp_names.status_code == 200:
                    names_data = resp_names.json()
                    for cid in journey_ids:
                        jname = names_data.get(cid)
                        if jname:
                            journeys.append((cid, jname))
    except Exception as e:
        debug_log.append(f"Exception: {e}")
    return (total, close, distant), journeys


def fetch_matches(test_guid, num_matches, cookies, csrf_token, shared_dna=None, journey_ids=None, parental_sides=None, match_type=None):
    items_per_page = 100
    matches = []
    page = 1
    headers = {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
    if csrf_token:
        headers['X-CSRF-Token'] = csrf_token
    with requests.Session() as session:
        while len(matches) < num_matches:
            base_url = f"https://www.ancestry.com/discoveryui-matches/parents/list/api/matchList/{test_guid}?itemsPerPage={items_per_page}&currentPage={page}"
            if parental_sides:
                base_url += f"&parentalSides={parental_sides}"
            if match_type == "close":
                base_url += "&sharedDna=closeMatches"
            elif match_type == "distant":
                base_url += "&sharedDna=distantMatches"
            elif shared_dna:
                base_url += f"&sharedDna={shared_dna}"
            if journey_ids:
                import json as _json
                jf = journey_ids
                if not isinstance(jf, str):
                    jf = _json.dumps(jf)
                base_url += f"&searchCommunity={jf}"
            url = base_url
            response = session.get(url, headers=headers, cookies=cookies)
            if response.status_code == 200:
                try:
                    data = response.json()
                    match_list = data.get('matchList', [])
                    if not match_list:
                        break
                    matches.extend(match_list)
                    if len(match_list) < items_per_page:
                        break
                    page += 1
                except Exception:
                    break
            else:
                break
    return matches[:num_matches], "" if matches else "No matches found."


def main(page: ft.Page):
    page.title = "MatchFetch"
    status = ft.Text("")
    log = ft.TextField(multiline=True, read_only=True,
                       min_lines=10, max_lines=20, expand=True)
    progress_file = "progress.json"
    # Resume UI
    resume_btn = ft.ElevatedButton("Resume previous session", visible=False)
    resume_label = ft.Text("", visible=False)
    # Test selection
    test_select = ft.Dropdown(label="Select a test", options=[], width=400)
    # Radio buttons for match type
    radio_group = ft.RadioGroup(content=ft.Row([
        ft.Radio(value="all", label="All matches"),
        ft.Radio(value="close", label="Close matches"),
        ft.Radio(value="distant", label="Distant matches"),
        ft.Radio(value="custom", label="Custom cM"),
    ]), value="all", visible=False)

    # Loading spinner below test_select
    loading_spinner = ft.ProgressRing(visible=False)
    # Number of matches / cM inputs
    num_matches = ft.TextField(
        label="Number of matches", value="", width=100, visible=False)
    min_cm = ft.TextField(label="Min cM", visible=False, width=100)
    max_cm = ft.TextField(label="Max cM", visible=False, width=100)
    # Journey label and checkboxes
    journey_label = ft.Text("🗺️ Journeys", visible=False)
    journey_checkboxes = ft.Column([], visible=False)
    # Parent filter as exclusive checkboxes
    parent_options = [
        ("maternal", "Maternal"),
        ("paternal", "Paternal"),
        ("both", "Both sides"),
        ("unassigned", "Unassigned"),
    ]
    parent_checkboxes = []

    def on_parent_checkbox_changed(e):
        # Only allow one checked at a time, but allow all to be unchecked
        changed = e.control
        if changed.value:
            for cb in parent_checkboxes:
                if cb != changed:
                    cb.value = False
        page.update()
    for val, label in parent_options:
        cb = ft.Checkbox(label=label, key=val, value=False,
                         on_change=on_parent_checkbox_changed)
        parent_checkboxes.append(cb)
    parent_label = ft.Text("👪 Parent", visible=False)
    parent_row = ft.Row(parent_checkboxes, visible=False)
    # No CSV filename input needed; always save to 'matches.csv'
    # CSV file output label (hidden by default)
    csv_file_label = ft.Text("", visible=False)
    # Button to open CSV file (hidden by default)
    open_csv_btn = ft.ElevatedButton("Open CSV file", visible=False)
    # Store last CSV filename for open button
    last_csv_filename = {"filename": ""}
    # Fetch button
    fetch_btn = ft.ElevatedButton("Fetch Matches", visible=False)
    # Store cookies and test list
    state = {"cookies": None, "test_list": [],
             "counts": (0, 0, 0), "journeys": []}

    def load_tests():
        # Check for progress file and show resume UI if present
        import os
        progress = None
        if os.path.exists(progress_file):
            try:
                with open(progress_file, "r", encoding="utf-8") as pf:
                    progress = json.load(pf)
            except Exception:
                progress = None
        if progress and "params" in progress:
            params = progress["params"]
            matches = progress.get("matches", [])
            enriched_ids = progress.get("enriched_ids", [])
            resume_label.value = f"Resume available: {len(matches)} matches fetched, {len(enriched_ids) if enriched_ids else 0} enriched."
            resume_label.visible = True
            resume_btn.visible = True
        else:
            resume_label.visible = False
            resume_btn.visible = False
        # ...existing code...
        tests_json, cookies = fetch_tests_json("cookie.txt")
        state["cookies"] = cookies
        state["test_list"] = parse_test_list(tests_json)
        # Show subject name as label, use test_guid as value/key
        options = [ft.dropdown.Option("Select a test", "")] + [
            ft.dropdown.Option(text=n, key=g) for n, g in state["test_list"]
        ]
        test_select.options = options
        test_select.value = ""
        page.update()

    def on_resume_clicked(e):
        # Load progress and resume as if fetch was started
        import os
        if not os.path.exists(progress_file):
            resume_label.value = "No progress file found."
            resume_label.visible = True
            resume_btn.visible = False
            page.update()
            return
        # Load params from progress file
        with open(progress_file, "r", encoding="utf-8") as pf:
            progress = json.load(pf)
        params = progress.get("params", {})
        # Set UI to match params
        # Set test selection
        test_guid = params.get("test_guid", "")
        shared_dna = params.get("shared_dna", None)
        journey_ids = params.get("journey_ids", [])
        parental_sides = params.get("parental_sides", None)
        match_type = params.get("match_type", None)
        n_matches = params.get("n_matches", 0)
        # Set test dropdown
        found = False
        options = test_select.options or []
        for opt in options:
            if hasattr(opt, 'key') and opt.key == test_guid:
                test_select.value = test_guid
                found = True
                break
        if not found:
            resume_label.value = "Test not found in current list."
            page.update()
            return
        # Set radio group and fields
        if match_type == "close":
            radio_group.value = "close"
        elif match_type == "distant":
            radio_group.value = "distant"
        elif shared_dna:
            radio_group.value = "custom"
            min_cm.value, max_cm.value = "", ""
            if shared_dna:
                parts = shared_dna.split("-")
                if len(parts) == 2:
                    min_cm.value = parts[0]
                    max_cm.value = parts[1]
        else:
            radio_group.value = "all"
        num_matches.value = str(n_matches)
        # Set journey checkboxes
        for cb in journey_checkboxes.controls:
            if isinstance(cb, ft.Checkbox):
                cb.value = cb.key in journey_ids
        # Set parent checkboxes
        for cb in parent_checkboxes:
            if hasattr(cb, 'key') and hasattr(cb, 'value'):
                cb.value = (cb.key == parental_sides)
        # Hide resume UI
        resume_label.visible = False
        resume_btn.visible = False
        page.update()
        # Call fetch as if user clicked fetch
        on_fetch_clicked(None)

    def on_test_selected(e):
        idx = None
        options = test_select.options or []
        # Hide everything below test_select except spinner
        radio_group.visible = False
        fetch_btn.visible = False
        num_matches.visible = False
        min_cm.visible = False
        max_cm.visible = False
        journey_label.visible = False
        journey_checkboxes.visible = False
        parent_label.visible = False
        parent_row.visible = False
        csv_file_label.visible = False
        open_csv_btn.visible = False
        status.visible = False
        loading_spinner.visible = True
        page.update()
        for i, opt in enumerate(options):
            if opt.key == test_select.value:
                idx = i-1
                break
        if idx is None or idx < 0:
            status.value = "No test selected."
            journey_checkboxes.controls.clear()
            page.update()
            return
        test_guid = state["test_list"][idx][1]
        counts, journeys = fetch_counts_journeys(test_guid, state["cookies"])
        state["counts"] = counts
        state["journeys"] = journeys
        # Hide spinner after data is loaded
        loading_spinner.visible = False
        # Show everything below test_select
        radio_group.visible = True
        journey_label.visible = True
        journey_checkboxes.visible = True
        parent_label.visible = True
        parent_row.visible = True
        status.visible = True
        # Update radio labels (rebuild radios) and set default to 'all'
        radio_group.content = ft.Row([
            ft.Radio(value="all", label=f"All matches ({counts[0]})"),
            ft.Radio(value="close", label=f"Close matches ({counts[1]})"),
            ft.Radio(value="distant", label=f"Distant matches ({counts[2]})"),
            ft.Radio(value="custom", label="Custom cM"),
        ])
        radio_group.value = "all"
        num_matches.value = str(counts[0])
        num_matches.visible = True
        journey_checkboxes.controls.clear()
        for jid, jname in journeys:
            journey_checkboxes.controls.append(
                ft.Checkbox(label=jname, key=jid))
        fetch_btn.visible = True
        page.update()

    def on_radio_changed(e):
        if radio_group.value == "custom":
            num_matches.visible = False
            min_cm.visible = True
            max_cm.visible = True
        else:
            num_matches.visible = True
            min_cm.visible = False
            max_cm.visible = False
            if radio_group.value == "all":
                num_matches.value = str(state["counts"][0])
            elif radio_group.value == "close":
                num_matches.value = str(state["counts"][1])
            elif radio_group.value == "distant":
                num_matches.value = str(state["counts"][2])
        page.update()

    def on_fetch_clicked(e):
        import csv
        import datetime
        import os
        import time
        idx = None
        options = test_select.options or []
        for i, opt in enumerate(options):
            if opt.key == test_select.value:
                idx = i-1
                break
        if idx is None or idx < 0:
            status.value = "No test selected."
            page.update()
            return
        test_guid = state["test_list"][idx][1]
        shared_dna = None
        match_type = None
        try:
            nval = num_matches.value if num_matches.value is not None else "0"
            n_matches = int(nval)
            if n_matches <= 0:
                raise ValueError
        except Exception:
            status.value = "Enter a positive integer for matches."
            page.update()
            return
        if radio_group.value == "custom":
            minv = min_cm.value.strip() if min_cm.value else ""
            maxv = max_cm.value.strip() if max_cm.value else ""
            if minv and maxv:
                shared_dna = f"{minv}-{maxv}"
            elif minv:
                shared_dna = f"{minv}-"
            elif maxv:
                shared_dna = f"0-{maxv}"
            n_matches = 999999
        else:
            if radio_group.value == "close":
                match_type = "close"
            elif radio_group.value == "distant":
                match_type = "distant"
            else:
                match_type = "all"
        journey_ids = [cb.key for cb in journey_checkboxes.controls if isinstance(
            cb, ft.Checkbox) and cb.value]
        # Only one parent checkbox can be selected
        parental_sides = None
        for cb in parent_checkboxes:
            if cb.value:
                parental_sides = cb.key
                break
        csrf_token = get_csrf_token(state["cookies"])
        # Print API request info
        print("\n--- Fetch Matches API Request ---")
        print(f"test_guid: {test_guid}")
        print(f"n_matches: {n_matches}")
        print(f"shared_dna: {shared_dna}")
        print(f"journey_ids: {journey_ids}")
        print(f"parental_sides: {parental_sides}")
        print(f"match_type: {match_type}")
        print(f"csrf_token: {csrf_token}")
        print("-------------------------------\n")
        status.value = f"Fetching matches for testGuid: {test_guid}"
        page.update()
        # Hide CSV file label before processing
        csv_file_label.visible = False
        csv_file_label.value = ""
        open_csv_btn.visible = False
        last_csv_filename["filename"] = ""
        page.update()

        # Progress/resume system
        progress = {}
        if os.path.exists(progress_file):
            try:
                with open(progress_file, "r", encoding="utf-8") as pf:
                    progress = json.load(pf)
            except Exception:
                progress = {}
        # Check if progress matches current params
        progress_key = {
            "test_guid": test_guid,
            "shared_dna": shared_dna,
            "journey_ids": journey_ids,
            "parental_sides": parental_sides,
            "match_type": match_type,
            "n_matches": n_matches
        }
        matches = []
        error = ""
        resume = False
        existing_ids = set()
        if progress.get("params") == progress_key and "matches" in progress:
            matches = progress["matches"]
            resume = True
            status.value = f"Resuming from previous progress: {len(matches)} matches already fetched."
            # Track existing sampleIds to avoid duplicates
            for m in matches:
                sid = m.get('sampleId')
                if sid:
                    existing_ids.add(sid)
            page.update()
        else:
            # New run, clear progress file
            if os.path.exists(progress_file):
                try:
                    os.remove(progress_file)
                except Exception:
                    pass

        # Fetch matches with progress
        items_per_page = 100
        page_num = (len(matches) // items_per_page) + 1 if matches else 1
        total_fetched = len(matches)
        import time
        try:
            with requests.Session() as session:
                while total_fetched < n_matches:
                    base_url = f"https://www.ancestry.com/discoveryui-matches/parents/list/api/matchList/{test_guid}?itemsPerPage={items_per_page}&currentPage={page_num}"
                    if parental_sides:
                        base_url += f"&parentalSides={parental_sides}"
                    if match_type == "close":
                        base_url += "&sharedDna=closeMatches"
                    elif match_type == "distant":
                        base_url += "&sharedDna=distantMatches"
                    elif shared_dna:
                        base_url += f"&sharedDna={shared_dna}"
                    if journey_ids:
                        import json as _json
                        jf = journey_ids
                        if not isinstance(jf, str):
                            jf = _json.dumps(jf)
                        base_url += f"&searchCommunity={jf}"
                    url = base_url
                    headers = {
                        'User-Agent': 'Mozilla/5.0',
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    }
                    if csrf_token:
                        headers['X-CSRF-Token'] = csrf_token
                    response = session.get(
                        url, headers=headers, cookies=state["cookies"])
                    if response.status_code == 200:
                        try:
                            data = response.json()
                            match_list = data.get('matchList', [])
                            if not match_list:
                                break
                            # Only add up to n_matches total, and avoid duplicates
                            new_matches = []
                            for m in match_list:
                                sid = m.get('sampleId')
                                if sid and sid not in existing_ids:
                                    new_matches.append(m)
                                    existing_ids.add(sid)
                            remaining = n_matches - len(matches)
                            matches.extend(new_matches[:remaining])
                            total_fetched = len(matches)
                            # Save progress after each page
                            with open(progress_file, "w", encoding="utf-8") as pf:
                                json.dump({"params": progress_key,
                                          "matches": matches}, pf)
                            if len(match_list) < items_per_page or total_fetched >= n_matches:
                                break
                            page_num += 1
                            time.sleep(2)  # Delay between fetching each page
                        except Exception as ex:
                            error = f"JSON error on page {page_num}: {ex}"
                            break
                    else:
                        error = f"HTTP error {response.status_code} on page {page_num}"
                        break
        except Exception as ex:
            error = f"Exception during fetch: {ex}"

        if error:
            status.value = error + ". Progress saved. You can rerun to resume."
            # Show resume UI immediately
            resume_label.value = "Resume available: {} matches fetched, {} enriched.".format(
                len(matches), len(progress.get("enriched_ids", [])) if "enriched_ids" in progress else 0)
            resume_label.visible = True
            resume_btn.visible = True
            page.update()
            return

        # Enrich matches with journeys and ethnicities, and resolve subjourney names before CSV export
        status.value = f"Enriching {len(matches)} matches..."
        page.update()
        try:
            enrich_matches_with_journeys_ethnicities(
                test_guid, matches, state["cookies"], batch_size=24)
        except Exception as ex:
            status.value = f"Error during enrichment: {ex}. Progress saved. You can rerun to resume."
            resume_label.value = "Resume available: {} matches fetched, {} enriched.".format(len(
                matches), len(progress.get("enriched_ids", [])) if "enriched_ids" in progress else 0)
            resume_label.visible = True
            resume_btn.visible = True
            page.update()
            return

        # Save CSV
        status.value = f"Saving CSV..."
        page.update()
        person_name = "person"
        if idx is not None and idx >= 0:
            person_name = state["test_list"][idx][0] or "person"
        safe_name = "_".join(person_name.split()).replace(
            ',', '').replace('.', '').replace('/', '_')
        date_str = datetime.datetime.now().strftime("%Y%m%d")
        match_count = len(matches)
        filename = f"{safe_name}_{date_str}_{match_count}.csv"
        try:
            region_keys = list(REGIONS.keys())
            region_names = [REGIONS[k] for k in region_keys]
            with open(filename, "w", newline='', encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow([
                    "Display Name", "Sample ID", "Journeys", "Subjourneys"
                ] + region_names)
                for match in matches:
                    match_profile = match.get('matchProfile', {})
                    display_name = match_profile.get('displayName')
                    sample_id = match.get('sampleId')
                    journey_names = match.get('journey_names', [])
                    subjourneys = match.get('subjourneys', [])
                    print(
                        f"[DEBUG CSV] SampleID: {sample_id} | Subjourneys: {subjourneys}")
                    journey_names_strs = [str(j) for j in journey_names]
                    journeys_str = ";".join(
                        journey_names_strs) if journey_names_strs else ""
                    subjourneys_str = ";".join(
                        [str(sj) for sj in subjourneys]) if subjourneys else ""
                    region_percentages = {r['key']: r['percentage'] for r in match.get(
                        'regions', []) if 'key' in r and 'percentage' in r}
                    region_row = [region_percentages.get(
                        k, 0) for k in region_keys]
                    writer.writerow([
                        display_name or '', sample_id or '', journeys_str, subjourneys_str
                    ] + region_row)
            status.value = f"Saved {len(matches)} matches."
            csv_file_label.value = f"CSV file: {filename}"
            csv_file_label.visible = True
            open_csv_btn.visible = True
            last_csv_filename["filename"] = filename
            # Remove progress file after successful completion
            if os.path.exists(progress_file):
                try:
                    os.remove(progress_file)
                except Exception:
                    pass
        except Exception as ex:
            status.value = f"Error saving CSV: {ex}"
            csv_file_label.value = ""
            csv_file_label.visible = False
            open_csv_btn.visible = False
            last_csv_filename["filename"] = ""
        page.update()

    def on_open_csv_clicked(e):
        import os
        filename = last_csv_filename["filename"] or "matches.csv"
        try:
            os.startfile(filename)
        except Exception as ex:
            status.value = f"Could not open file: {ex}"
        page.update()

    test_select.on_change = on_test_selected
    radio_group.on_change = on_radio_changed
    fetch_btn.on_click = on_fetch_clicked
    open_csv_btn.on_click = on_open_csv_clicked
    resume_btn.on_click = on_resume_clicked

    # Auto-load tests on app start
    load_tests()

    page.add(
        resume_label,
        resume_btn,
        test_select,
        loading_spinner,
        radio_group,
        ft.Row([num_matches, min_cm, max_cm]),
        journey_label,
        journey_checkboxes,
        parent_label,
        parent_row,
        ft.Row([csv_file_label, open_csv_btn]),
        fetch_btn,
        status
    )


ft.app(target=main)
