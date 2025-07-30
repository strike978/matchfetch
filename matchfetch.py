import json
import re

import flet as ft
import requests


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
    # Test selection
    test_select = ft.Dropdown(label="Select a test", options=[], width=400)
    # Radio buttons for match type
    radio_group = ft.RadioGroup(content=ft.Row([
        ft.Radio(value="all", label="All matches"),
        ft.Radio(value="close", label="Close matches"),
        ft.Radio(value="distant", label="Distant matches"),
        ft.Radio(value="custom", label="Custom cM"),
    ]), value="all")
    # Number of matches / cM inputs
    num_matches = ft.TextField(
        label="Number of matches", value="", width=100, visible=False)
    min_cm = ft.TextField(label="Min cM", visible=False, width=100)
    max_cm = ft.TextField(label="Max cM", visible=False, width=100)
    # Journey checkboxes
    journey_checkboxes = ft.Column([])
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
    parent_row = ft.Row(parent_checkboxes)
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

    def on_test_selected(e):
        idx = None
        options = test_select.options or []
        # Hide fetch button and number of matches input immediately when switching tests
        fetch_btn.visible = False
        num_matches.visible = False
        min_cm.visible = False
        max_cm.visible = False
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
        num_matches.visible = False
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
        matches, error = fetch_matches(
            test_guid, n_matches, state["cookies"], csrf_token,
            shared_dna=shared_dna, journey_ids=journey_ids, parental_sides=parental_sides, match_type=match_type)
        import csv
        import os
        if error:
            status.value = error
        else:
            import datetime

            # Get person name for filename
            idx = None
            options = test_select.options or []
            for i, opt in enumerate(options):
                if opt.key == test_select.value:
                    idx = i-1
                    break
            person_name = "person"
            if idx is not None and idx >= 0:
                person_name = state["test_list"][idx][0] or "person"
            # Clean name for filename
            safe_name = "_".join(person_name.split()).replace(
                ',', '').replace('.', '').replace('/', '_')
            date_str = datetime.datetime.now().strftime("%Y%m%d")
            match_count = len(matches)
            filename = f"{safe_name}_{date_str}_{match_count}.csv"
            try:
                with open(filename, "w", newline='', encoding="utf-8") as f:
                    writer = csv.writer(f)
                    # Write header
                    writer.writerow(["Display Name", "Sample ID"])
                    for match in matches:
                        match_profile = match.get('matchProfile', {})
                        display_name = match_profile.get('displayName')
                        sample_id = match.get('sampleId')
                        writer.writerow([display_name or '', sample_id or ''])
                status.value = f"Saved {len(matches)} matches."
                csv_file_label.value = f"CSV file: {filename}"
                csv_file_label.visible = True
                open_csv_btn.visible = True
                last_csv_filename["filename"] = filename
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

    # Auto-load tests on app start
    load_tests()

    page.add(
        test_select,
        radio_group,
        ft.Row([num_matches, min_cm, max_cm]),
        ft.Text("🗺️ Journeys"),
        journey_checkboxes,
        ft.Text("👪 Parent"),
        parent_row,
        ft.Row([csv_file_label, open_csv_btn]),
        fetch_btn,
        status
    )


ft.app(target=main)
