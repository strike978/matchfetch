
# Application version
import csv
import datetime
import hashlib
import json
import os
import re
import shutil
import tempfile
import time

import flet as ft
import requests
from flet import FontWeight

APP_VERSION = "1.0.2"


def atomic_json_save(data, filename):
    dir_name = os.path.dirname(os.path.abspath(filename)) or "."
    with tempfile.NamedTemporaryFile("w", dir=dir_name, delete=False, encoding="utf-8") as tf:
        json.dump(data, tf)
        tempname = tf.name
    shutil.move(tempname, filename)


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
    # Debug prints removed
    with requests.Session() as session:
        resp = session.post(url, headers=headers,
                            cookies=cookies, data=json.dumps(payload))
        # Debug prints removed
        try:
            resp_json = resp.json()
        except Exception as ex:
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
    # Debug prints removed
    with requests.Session() as session:
        resp = session.put(url, headers=headers,
                           cookies=cookies, data=json.dumps(payload))
        # Debug prints removed
        try:
            resp_json = resp.json()
        except Exception as ex:
            resp_json = {}
        if resp.status_code == 200:
            return resp_json
        else:
            return {}


def enrich_matches_with_journeys_ethnicities(test_guid, matches, cookies, batch_size=24, progress_callback=None):
    """
    For a list of matches, batch fetch journeys and ethnicities, and add them to each match dict.
    Modifies matches in place. Also resolves journey and subjourney names.
    Accepts an optional progress_callback(batch_num, batch_total, batch_start, batch_end) for UI updates.
    Skips batches that are already fully enriched (all sampleIds in batch are in enriched_ids).
    """
    sample_ids = [m.get('sampleId') for m in matches if m.get('sampleId')]
    total = len(sample_ids)
    # Debug prints removed
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
    # Try to load existing enriched_ids if present, else infer from matches
    if os.path.exists(progress_file):
        try:
            with open(progress_file, "r", encoding="utf-8") as pf:
                progress = json.load(pf)
                if "enriched_ids" in progress:
                    enriched_ids = set(progress["enriched_ids"])
        except Exception:
            pass
    # If enriched_ids is empty, infer from matches that already have enrichment fields
    if not enriched_ids:
        for m in matches:
            sid = m.get('sampleId')
            # Consider a match enriched if it has both journeys and regions fields
            if sid and m.get('journeys') is not None and m.get('regions') is not None:
                enriched_ids.add(sid)
    batch_total = (total + batch_size - 1) // batch_size
    for batch_num, i in enumerate(range(0, total, batch_size), start=1):
        batch = sample_ids[i:i+batch_size]
        to_enrich = [sid for sid in batch if sid not in enriched_ids]
        if progress_callback:
            progress_callback(batch_num, batch_total, i,
                              min(i+batch_size, total))
        if not to_enrich:
            continue
        try:
            comm_result = batch_fetch_journeys(test_guid, to_enrich, cookies)
            eth_result = batch_fetch_ethnicities(test_guid, to_enrich, cookies)
            batch_journey_ids = set()
            batch_branch_ids_for_subjourneys = set()
            for m in matches:
                sid = m.get('sampleId')
                if sid in to_enrich:
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
                        {'key': r.get('key'), 'percentage': r.get(
                            'percentage')}
                        for r in regions if 'key' in r and 'percentage' in r
                    ]
            journey_names = resolve_journey_names(
                list(batch_journey_ids), cookies)
            subjourney_names = resolve_subjourney_names(
                list(batch_branch_ids_for_subjourneys), cookies)
            for m in matches:
                sid = m.get('sampleId')
                if sid in to_enrich:
                    m['journey_names'] = [journey_names.get(
                        j, j) for j in m.get('journeys', [])]
                    subjourney_names_list = []
                    for branch_id in m.get('journeys', []):
                        branch_communities = subjourney_names.get(branch_id)
                        if isinstance(branch_communities, dict):
                            # Look for community IDs that match this branch
                            for comm_id in m.get('subjourneys', []):
                                name = branch_communities.get(comm_id)
                                if name and name not in subjourney_names_list:
                                    subjourney_names_list.append(name)
                    m['subjourneys'] = subjourney_names_list
                    enriched_ids.add(sid)
            # Only save progress if the batch completed without error
            atomic_json_save({"params": params, "matches": matches,
                             "enriched_ids": list(enriched_ids)}, progress_file)
        except Exception as ex:
            print(f"[ENRICH] Error in batch {batch_num}: {ex}")
            # Stop processing and propagate the error to halt the process
            raise
        time.sleep(2)


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
        pass
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
    # Debug prints removed
    try:
        with requests.Session() as session:
            resp = session.post(url, headers=headers,
                                cookies=cookies, data=payload)
            if resp.status_code == 200:
                resp_json = resp.json()
                # Debug prints removed
                # Return the full dict for each branch, not just the branch name
                result = {}
                for k, v in resp_json.items():
                    if isinstance(v, dict):
                        result[k] = v
                    else:
                        result[k] = {}
                return result
    except Exception as ex:
        pass
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


def sanitize_filename(name):
    # Remove or replace all invalid filename characters for Windows
    return re.sub(r'[<>:"/\\|?*\.]', '_', name)


def main(page: ft.Page):
    # --- UI setup and state ---
    page.title = f"MatchFetch v{APP_VERSION}"
    status = ft.Text("")
    log = ft.TextField(multiline=True, read_only=True,
                       min_lines=10, max_lines=20, expand=True)
    progress_file = "progress.json"
    resume_btn = ft.ElevatedButton("Resume previous session", visible=False)
    resume_label = ft.Text("", visible=False)
    test_select = ft.Dropdown(label="Select a test", options=[], width=400)
    radio_group = ft.RadioGroup(content=ft.Row([
        ft.Radio(value="all", label="All matches"),
        ft.Radio(value="close", label="Close matches"),
        ft.Radio(value="distant", label="Distant matches"),
        ft.Radio(value="custom", label="Custom cM"),
    ]), value="all", visible=False)
    loading_spinner = ft.ProgressRing(visible=False)
    num_matches = ft.TextField(
        label="Number of matches", value="", width=100, visible=False)
    min_cm = ft.TextField(label="Min cM", visible=False, width=100, value="90")
    max_cm = ft.TextField(label="Max cM", visible=False,
                          width=100, value="400")
    journey_label = ft.Text("🗺️ Journeys", visible=False)
    journey_checkboxes = ft.Column([], visible=False)
    journey_container = ft.Container(
        content=ft.Column([
            journey_label,
            journey_checkboxes
        ]),
        border=ft.border.all(1, "grey400"),
        border_radius=8,
        padding=10,
        margin=10,
        visible=False
    )
    parent_options = [
        ("maternal", "Maternal"),
        ("paternal", "Paternal"),
        ("both", "Both sides"),
        ("unassigned", "Unassigned"),
    ]
    parent_checkboxes = []
    for val, label in parent_options:
        cb = ft.Checkbox(label=label, key=val, value=False)
        parent_checkboxes.append(cb)
    parent_label = ft.Text("👪 Parent", visible=False)
    parent_row = ft.Row(parent_checkboxes, visible=False)
    parent_container = ft.Container(
        content=ft.Column([
            parent_label,
            parent_row
        ]),
        border=ft.border.all(1, "grey400"),
        border_radius=8,
        padding=10,
        margin=10,
        visible=False
    )
    csv_file_label = ft.Text("", visible=False)
    open_csv_btn = ft.ElevatedButton("Open CSV file", visible=False)
    last_csv_filename = {"filename": ""}
    fetch_btn = ft.ElevatedButton("Fetch Matches", visible=False)
    state = {"cookies": None, "test_list": [],
             "counts": (0, 0, 0), "journeys": []}

    # Privacy mode checkbox and info modal
    privacy_mode_checkbox = ft.Checkbox(
        label="Privacy mode", value=False)

    # Modal dialog must be created once and added to the page for Flet to show it
    info_text_spans = [
        ft.TextSpan("Privacy mode", style=ft.TextStyle(
            weight=ft.FontWeight.BOLD)),
        ft.TextSpan(" removes the "),
        ft.TextSpan("Name", style=ft.TextStyle(weight=ft.FontWeight.BOLD)),
        ft.TextSpan(", "),
        ft.TextSpan("Parent", style=ft.TextStyle(weight=ft.FontWeight.BOLD)),
        ft.TextSpan(", and "),
        ft.TextSpan("cM", style=ft.TextStyle(weight=ft.FontWeight.BOLD)),
        ft.TextSpan(" columns from the exported CSV.\n\n"),
        ft.TextSpan("The "),
        ft.TextSpan("ID", style=ft.TextStyle(weight=ft.FontWeight.BOLD)),
        ft.TextSpan(" column will show a unique "),
        ft.TextSpan("SHA-256 hash",
                    style=ft.TextStyle(weight=ft.FontWeight.BOLD)),
        ft.TextSpan(
            " instead of the real sample ID, making it impossible to recover the original ID.\n\n"),
        ft.TextSpan("The exported CSV filename will use the most common journey name in your data, instead of the test name, to further protect privacy.\n\n",
                    style=ft.TextStyle(italic=True)),
        ft.TextSpan("This helps protect the privacy of individuals in your match list while still letting you analyze and compare matches.",
                    style=ft.TextStyle(italic=True)),
    ]
    from flet import FontWeight, MainAxisAlignment, TextAlign, TextOverflow
    privacy_info_modal = ft.AlertDialog(
        title=ft.Row([
            ft.Icon(name="lock", color="blue", size=28),
            ft.Text("About Privacy Mode", weight=FontWeight.BOLD, size=20)
        ], alignment=MainAxisAlignment.START),
        content=ft.Container(
            ft.Text(
                spans=info_text_spans,
                selectable=True,
                size=16,
                color="white",
                text_align=TextAlign.LEFT,
                max_lines=12,
                overflow=TextOverflow.CLIP
            ),
            padding=20,
            bgcolor="#23272f",
            border_radius=8
        ),
        actions=[
            ft.TextButton(
                "Close", on_click=lambda e: close_privacy_info_modal(), style=ft.ButtonStyle(bgcolor="#e3e7ef", color="black", padding=ft.padding.symmetric(horizontal=16, vertical=8))
            )
        ],
        open=False,
        modal=True,
        shape=ft.RoundedRectangleBorder(radius=12),
        elevation=8
    )

    def show_privacy_info_modal(e=None):
        privacy_info_modal.open = True
        page.update()

    def close_privacy_info_modal():
        privacy_info_modal.open = False
        page.update()

    privacy_info_icon = ft.IconButton(
        icon="info_outline",
        tooltip="What is Privacy mode?",
        on_click=show_privacy_info_modal,
        style=ft.ButtonStyle(padding=0, shape=None, bgcolor=None)
    )

    # --- UI logic split into helpers ---
    def enforce_cm_bounds(e):
        field = e.control
        try:
            val = float(field.value)
            if val < 6:
                field.value = "6"
            elif val > 3490:
                field.value = "3490"
            else:
                field.value = str(int(val)) if val.is_integer() else str(val)
        except Exception:
            pass
        page.update()
    min_cm.on_blur = enforce_cm_bounds
    max_cm.on_blur = enforce_cm_bounds

    def on_parent_checkbox_changed(e):
        changed = e.control
        if changed.value:
            for cb in parent_checkboxes:
                if cb != changed:
                    cb.value = False
        page.update()
    for cb in parent_checkboxes:
        cb.on_change = on_parent_checkbox_changed

    def load_tests():
        # ...existing code from load_tests...
        progress = None
        if os.path.exists(progress_file):
            try:
                with open(progress_file, "r", encoding="utf-8") as pf:
                    progress = json.load(pf)
            except Exception:
                progress = None
        resume_label.visible = False
        resume_btn.visible = False
        tests_json, cookies = fetch_tests_json("cookie.txt")
        state["cookies"] = cookies
        state["test_list"] = parse_test_list(tests_json)
        options = [ft.dropdown.Option(
            "Select a test", "")] + [ft.dropdown.Option(text=n, key=g) for n, g in state["test_list"]]
        test_select.options = options
        test_select.value = ""
        page.update()

    def set_resume_ui(progress):
        matches = progress.get("matches", [])
        enriched_ids = progress.get("enriched_ids", [])
        resume_label.value = f"Resume available: {len(matches)} matches fetched, {len(enriched_ids) if enriched_ids else 0} processed."
        resume_label.visible = True
        resume_btn.visible = True

    def set_test_selection_ui(params):
        test_guid = params.get("test_guid", "")
        shared_dna = params.get("shared_dna", None)
        journey_ids = params.get("journey_ids", [])
        parental_sides = params.get("parental_sides", None)
        match_type = params.get("match_type", None)
        n_matches = params.get("n_matches", 0)
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
            return False
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
            num_matches.value = str(n_matches)
        else:
            radio_group.value = "all"
            num_matches.value = str(n_matches)
        for cb in journey_checkboxes.controls:
            if isinstance(cb, ft.Checkbox):
                cb.value = cb.key in journey_ids
        for cb in parent_checkboxes:
            if hasattr(cb, 'key') and hasattr(cb, 'value'):
                cb.value = (cb.key == parental_sides)
        resume_label.visible = False
        resume_btn.visible = False
        page.update()
        return True

    def fetch_paternal_cluster_code(test_guid, cookies):
        url = f"https://www.ancestry.com/dna/origins/inheritance/api/v1/matches/{test_guid}/paternal-cluster"
        headers = {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }
        csrf_token = get_csrf_token(cookies)
        if csrf_token:
            headers['x-csrf-token'] = csrf_token
        try:
            with requests.Session() as session:
                resp = session.get(url, headers=headers, cookies=cookies)
                if resp.status_code == 200:
                    data = resp.json()
                    code = data.get('item', {}).get('clusterCode', '')
                    if code in ('p1', 'p2'):
                        return code
        except Exception as ex:
            print(f"[fetch_paternal_cluster_code] Exception: {ex}")
        return ''

    def on_resume_clicked(e):
        if not os.path.exists(progress_file):
            resume_label.value = "No progress file found."
            resume_label.visible = True
            resume_btn.visible = False
            page.update()
            return
        with open(progress_file, "r", encoding="utf-8") as pf:
            progress = json.load(pf)
        params = progress.get("params", {})
        if not set_test_selection_ui(params):
            return
        on_fetch_clicked(None)

    def on_test_selected(e):
        idx = None
        options = test_select.options or []
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
        progress = None
        if os.path.exists(progress_file):
            try:
                with open(progress_file, "r", encoding="utf-8") as pf:
                    progress = json.load(pf)
            except Exception:
                progress = None
        if progress and "params" in progress and test_select.value:
            set_resume_ui(progress)
        else:
            resume_label.visible = False
            resume_btn.visible = False
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
        paternal_code = fetch_paternal_cluster_code(
            test_guid, state["cookies"])
        state["paternal_cluster_code"] = paternal_code
        counts, journeys = fetch_counts_journeys(test_guid, state["cookies"])
        state["counts"] = counts
        state["journeys"] = journeys
        loading_spinner.visible = False
        radio_group.visible = True
        journey_label.visible = True
        journey_checkboxes.visible = True
        journey_container.visible = True
        parent_label.visible = True
        parent_row.visible = True
        parent_container.visible = True
        status.visible = True
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
        # Always update visibility and values for custom, even if already selected
        if radio_group.value == "custom":
            num_matches.visible = False
            min_cm.visible = True
            max_cm.visible = True
            if not min_cm.value:
                min_cm.value = "90"
            if not max_cm.value:
                max_cm.value = "400"
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

    def enrichment_progress_callback(batch_num, batch_total, batch_start, batch_end):
        percent = (batch_num / batch_total) * 100 if batch_total else 100
        status.value = f"Processing batch {batch_num}/{batch_total} ({percent:.2f}%)..."
        page.update()

    def save_csv(matches, filename, region_keys, region_names, paternal_code, test_list, idx):
        # Use privacy mode to determine columns
        privacy_mode = privacy_mode_checkbox.value
        with open(filename, "w", newline='', encoding="utf-8") as f:
            writer = csv.writer(f)
            if privacy_mode:
                header = ["ID", "Journeys", "Sub Journeys"] + region_names
            else:
                header = ["Name", "ID", "Parent", "cM",
                          "Journeys", "Sub Journeys"] + region_names
            writer.writerow(header)
            for match in matches:
                match_profile = match.get('matchProfile', {})
                display_name = match_profile.get('displayName')
                sample_id = match.get('sampleId')
                match_cluster_code = match.get('matchClusterCode', '')
                cluster_val = ""
                if paternal_code in ("p1", "p2"):
                    if match_cluster_code == paternal_code:
                        cluster_val = "Paternal side"
                    elif match_cluster_code in ("p1", "p2"):
                        cluster_val = "Maternal side"
                    elif match_cluster_code == "both":
                        cluster_val = "Both sides"
                    elif match_cluster_code == "no_call":
                        cluster_val = "Unassigned"
                    else:
                        cluster_val = ""
                else:
                    cluster_val = ""
                cm_val = None
                rel = match.get('relationship', {})
                if isinstance(rel, dict):
                    cm_val = rel.get('sharedCentimorgans')
                if cm_val is None:
                    cm_val = match.get('cM', '')
                journey_names = match.get('journey_names', [])
                subjourneys = match.get('subjourneys', [])
                journey_names_strs = [str(j) for j in journey_names]
                journeys_str = ";".join(
                    journey_names_strs) if journey_names_strs else ""
                subjourneys_str = ";".join(
                    [str(sj) for sj in subjourneys]) if subjourneys else ""
                region_percentages = {r['key']: r['percentage'] for r in match.get(
                    'regions', []) if 'key' in r and 'percentage' in r}
                region_row = [region_percentages.get(
                    k, 0) for k in region_keys]
                if privacy_mode:
                    # Use SHA-256 hash of sample_id for anonymized ID
                    if sample_id:
                        hashed_id = hashlib.sha256(
                            str(sample_id).encode('utf-8')).hexdigest()
                    else:
                        hashed_id = ''
                    row = [hashed_id, journeys_str,
                           subjourneys_str] + region_row
                else:
                    row = [display_name or '', sample_id or '', cluster_val,
                           cm_val, journeys_str, subjourneys_str] + region_row
                writer.writerow(row)

    def on_fetch_clicked(e):
        # ...existing code from on_fetch_clicked, but split into helpers where possible...
        idx = None
        options = test_select.options or []
        fetch_btn.disabled = True
        page.update()
        for i, opt in enumerate(options):
            if opt.key == test_select.value:
                idx = i-1
                break
        if idx is None or idx < 0:
            status.value = "No test selected."
            fetch_btn.disabled = False
            page.update()
            return
        test_guid = state["test_list"][idx][1]
        shared_dna = None
        match_type = None
        is_custom_cm = radio_group.value == "custom"
        progress = {}
        if os.path.exists(progress_file):
            try:
                with open(progress_file, "r", encoding="utf-8") as pf:
                    progress = json.load(pf)
            except Exception:
                progress = {}
        resuming = False
        progress_params = progress.get("params", {})
        progress_n_matches = progress_params.get("n_matches")

        # --- FIX: Always use current min_cm/max_cm for custom cM, never from progress ---
        if is_custom_cm:
            minv = (min_cm.value or '').strip()
            maxv = (max_cm.value or '').strip()
            if not minv and not maxv:
                status.value = "Enter at least a min or max cM value."
                page.update()
                fetch_btn.disabled = False
                return
            try:
                minv_num = int(float(minv)) if minv else 6
            except Exception:
                minv_num = 6
            try:
                maxv_num = int(float(maxv)) if maxv else 3490
            except Exception:
                maxv_num = 3490
            minv_num = max(6, min(3490, minv_num))
            maxv_num = max(6, min(3490, maxv_num))
            min_cm.value = str(minv_num) if minv else ""
            max_cm.value = str(maxv_num) if maxv else ""
            if minv and maxv:
                shared_dna = f"{minv_num}-{maxv_num}"
            elif minv:
                shared_dna = f"{minv_num}-"
            elif maxv:
                shared_dna = f"6-{maxv_num}"
            n_matches = 999999
            user_n_matches = int(num_matches.value) if num_matches.value else 0
            n_matches_fetch = n_matches
        else:
            try:
                nval = num_matches.value if num_matches.value is not None else "0"
                n_matches = int(nval)
                if n_matches <= 0:
                    raise ValueError
            except Exception:
                status.value = "Enter a positive integer for matches."
                page.update()
                fetch_btn.disabled = False
                return
            user_n_matches = n_matches
            if radio_group.value == "close":
                match_type = "close"
            elif radio_group.value == "distant":
                match_type = "distant"
            else:
                match_type = "all"
            n_matches_fetch = n_matches
        journey_ids = [cb.key for cb in journey_checkboxes.controls if isinstance(
            cb, ft.Checkbox) and cb.value]
        parental_sides = None
        for cb in parent_checkboxes:
            if cb.value:
                parental_sides = cb.key
                break
        csrf_token = get_csrf_token(state["cookies"])
        status.value = f"Fetching matches for testGuid: {test_guid}"
        page.update()
        csv_file_label.visible = False
        csv_file_label.value = ""
        open_csv_btn.visible = False
        last_csv_filename["filename"] = ""
        page.update()
        progress_key = {
            "test_guid": test_guid,
            "shared_dna": shared_dna,
            "journey_ids": journey_ids,
            "parental_sides": parental_sides,
            "match_type": match_type,
            "n_matches": user_n_matches
        }
        matches = []
        error = ""
        resume = False
        existing_ids = set()
        if progress.get("params") == progress_key and "matches" in progress:
            matches = progress["matches"]
            resume = True
            status.value = f"Resuming from previous progress: {len(matches)} matches already fetched."
            for m in matches:
                sid = m.get('sampleId')
                if sid:
                    existing_ids.add(sid)
            page.update()
        else:
            if os.path.exists(progress_file):
                try:
                    os.remove(progress_file)
                except Exception:
                    pass
        items_per_page = 100
        total_fetched = len(matches)
        page_num = (total_fetched // items_per_page) + \
            1 if total_fetched else 1
        try:
            with requests.Session() as session:
                while total_fetched < (n_matches if not (is_custom_cm and progress.get("params")) else n_matches):
                    status.value = f"Fetching matches (page {page_num})... {total_fetched} fetched so far."
                    page.update()
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
                    try:
                        response = session.get(
                            url, headers=headers, cookies=state["cookies"])
                        if response.status_code == 200:
                            data = response.json()
                            match_list = data.get('matchList', [])
                            if not match_list:
                                break
                            new_matches = []
                            for m in match_list:
                                sid = m.get('sampleId')
                                if sid and sid not in existing_ids:
                                    new_matches.append(m)
                                    existing_ids.add(sid)
                            remaining = n_matches - len(matches)
                            matches.extend(new_matches[:remaining])
                            total_fetched = len(matches)
                            # Only save progress after a full page is processed without error
                            atomic_json_save(
                                {"params": progress_key, "matches": matches}, progress_file)
                            page.update()
                            if len(match_list) < items_per_page or total_fetched >= n_matches:
                                break
                            page_num += 1
                            time.sleep(2)
                        else:
                            error = f"HTTP error {response.status_code} on page {page_num}"
                            break
                    except Exception as ex:
                        error = f"JSON error on page {page_num}: {ex}"
                        break
        except Exception as ex:
            error = f"Exception during fetch: {ex}"
        if error:
            status.value = error + ". Progress saved. You can rerun to resume."
            set_resume_ui(progress)
            fetch_btn.disabled = False
            page.update()
            return
        status.value = f"Processing {len(matches)} matches..."
        page.update()
        try:
            enrich_matches_with_journeys_ethnicities(
                test_guid, matches, state["cookies"], batch_size=24, progress_callback=enrichment_progress_callback)
        except Exception as ex:
            status.value = f"Error during enrichment: {ex}. Progress saved. You can rerun to resume."
            set_resume_ui(progress)
            fetch_btn.disabled = False
            page.update()
            return
        status.value = f"Saving CSV..."
        page.update()
        privacy_mode = privacy_mode_checkbox.value
        if privacy_mode:
            # Find the most common journey name in the data
            from collections import Counter
            all_journeys = []
            for match in matches:
                journey_names = match.get('journey_names', [])
                if journey_names:
                    all_journeys.extend(journey_names)
            if all_journeys:
                most_common_journey, _ = Counter(
                    all_journeys).most_common(1)[0]
                journey_name = most_common_journey
            else:
                journey_name = "journey"
            safe_name = sanitize_filename("_".join(str(journey_name).split()))
        else:
            person_name = "person"
            if idx is not None and idx >= 0:
                person_name = state["test_list"][idx][0] or "person"
            safe_name = sanitize_filename("_".join(person_name.split()))
        date_str = datetime.datetime.now().strftime("%Y%m%d")
        match_count = len(matches)
        filename = f"{safe_name}_{date_str}_{match_count}.csv"
        try:
            region_keys = list(REGIONS.keys())
            region_names = [REGIONS[k] for k in region_keys]
            paternal_code = state.get("paternal_cluster_code", "")
            save_csv(matches, filename, region_keys, region_names,
                     paternal_code, state["test_list"], idx)
            status.value = f"Saved {len(matches)} matches."
            csv_file_label.value = f"{filename}"
            csv_file_label.visible = True
            open_csv_btn.visible = True
            last_csv_filename["filename"] = filename
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
        fetch_btn.disabled = False
        page.update()

    def on_open_csv_clicked(e):
        filename = last_csv_filename["filename"] or "matches.csv"
        try:
            os.startfile(filename)
        except Exception as ex:
            status.value = f"Could not open file: {ex}"
        page.update()

    # --- Event bindings ---
    test_select.on_change = on_test_selected
    radio_group.on_change = on_radio_changed
    fetch_btn.on_click = on_fetch_clicked
    open_csv_btn.on_click = on_open_csv_clicked
    resume_btn.on_click = on_resume_clicked

    # --- App start ---
    load_tests()
    page.add(
        privacy_info_modal,
        ft.Row([privacy_mode_checkbox, privacy_info_icon]),
        resume_label,
        resume_btn,
        test_select,
        loading_spinner,
        radio_group,
        ft.Row([num_matches, min_cm, max_cm]),
        journey_container,
        parent_container,
        ft.Row([csv_file_label, open_csv_btn]),
        fetch_btn,
        status
    )


ft.app(target=main)
