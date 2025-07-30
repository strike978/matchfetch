import sys
from PySide6.QtCore import QThread, Signal
from PySide6.QtCore import Qt
from PySide6.QtGui import QIcon
from PySide6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout, QLabel, QComboBox,
    QRadioButton, QButtonGroup, QLineEdit, QPushButton, QTextEdit, QCheckBox, QGroupBox, QGridLayout, QFrame
)
from functools import partial
import json
import re
import requests


class FetchCountsJourneysThread(QThread):
    result_signal = Signal(object, object)

    def __init__(self, test_guid, cookies):
        super().__init__()
        self.test_guid = test_guid
        self.cookies = cookies

    def run(self):
        # Fetch match counts
        headers = {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }
        from time import sleep
        csrf_token = get_csrf_token(self.cookies)
        if csrf_token:
            headers['X-CSRF-Token'] = csrf_token
        import traceback
        debug_log = []
        total = close = distant = 0
        journeys = []
        try:
            with requests.Session() as session:
                # --- MATCH COUNTS ---
                count_url = f"https://www.ancestry.com/discoveryui-matches/parents/list/api/matchCount/{self.test_guid}"
                # Total
                payload_total = json.dumps({"lower": 0, "upper": 10})
                resp_total = session.post(
                    count_url, headers=headers, cookies=self.cookies, data=payload_total)
                if resp_total.status_code == 200:
                    data = resp_total.json()
                    debug_log.append(f"Total count raw: {data}")
                    total = data.get('count', 0)
                else:
                    debug_log.append(
                        f"Total count status: {resp_total.status_code}")
                # Close
                payload_close = json.dumps({"lower": 0, "upper": 9})
                resp_close = session.post(
                    count_url, headers=headers, cookies=self.cookies, data=payload_close)
                if resp_close.status_code == 200:
                    data = resp_close.json()
                    debug_log.append(f"Close count raw: {data}")
                    close = data.get('count', 0)
                else:
                    debug_log.append(
                        f"Close count status: {resp_close.status_code}")
                # Distant
                payload_distant = json.dumps({"lower": 10, "upper": 10})
                resp_distant = session.post(
                    count_url, headers=headers, cookies=self.cookies, data=payload_distant)
                if resp_distant.status_code == 200:
                    data = resp_distant.json()
                    debug_log.append(f"Distant count raw: {data}")
                    distant = data.get('count', 0)
                else:
                    debug_log.append(
                        f"Distant count status: {resp_distant.status_code}")

                # --- JOURNEYS ---
                url_journeys = f"https://www.ancestry.com/discoveryui-matches/parents/list/api/journeys/{self.test_guid}"
                resp_j = session.get(
                    url_journeys, headers=headers, cookies=self.cookies)
                journey_ids = set()
                if resp_j.status_code == 200:
                    data = resp_j.json()
                    debug_log.append(f"Journeys raw: {data}")
                    # The Go code expects a dict of arrays of objects with communityId
                    for arr in data.values():
                        if isinstance(arr, list):
                            for comm in arr:
                                cid = comm.get('communityId')
                                if cid:
                                    journey_ids.add(cid)
                else:
                    debug_log.append(f"Journeys status: {resp_j.status_code}")
                # Now fetch journey names
                if journey_ids:
                    names_url = "https://www.ancestry.com/dna/origins/branches/names"
                    payload = json.dumps(list(journey_ids))
                    names_headers = dict(headers)
                    names_headers['Content-Type'] = 'application/json'
                    resp_names = session.post(
                        names_url, headers=names_headers, cookies=self.cookies, data=payload)
                    if resp_names.status_code == 200:
                        names_data = resp_names.json()
                        debug_log.append(f"Journey names raw: {names_data}")
                        for cid in journey_ids:
                            jname = names_data.get(cid)
                            if jname:
                                journeys.append((cid, jname))
                    else:
                        debug_log.append(
                            f"Journey names status: {resp_names.status_code}")
        except Exception as e:
            debug_log.append(f"Exception: {e}\n{traceback.format_exc()}")
        self.result_signal.emit((total, close, distant), journeys)
        print("\n".join(debug_log))


# Ensure QThread and Signal are imported for background threads


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
    test_list = []
    if isinstance(tests_json, dict) and 'dnaSamplesData' in tests_json:
        for sample in tests_json['dnaSamplesData']:
            subject_name = sample.get('subjectName')
            test_guid = sample.get('testGuid')
            test_list.append((subject_name, test_guid))
    elif isinstance(tests_json, list):
        for test in tests_json:
            subject_name = test.get('subjectName')
            test_guid = test.get('testGuid')
            test_list.append((subject_name, test_guid))
    elif isinstance(tests_json, dict):
        subject_name = tests_json.get('subjectName')
        test_guid = tests_json.get('testGuid')
        test_list.append((subject_name, test_guid))
    return test_list


class FetchMatchesThread(QThread):
    result_signal = Signal(list, str)

    def __init__(self, test_guid, num_matches, cookies, csrf_token, shared_dna=None, journey_ids=None, parental_sides=None, match_type=None):
        super().__init__()
        self.test_guid = test_guid
        self.num_matches = num_matches
        self.cookies = cookies
        self.csrf_token = csrf_token
        self.shared_dna = shared_dna  # e.g. "90-400" or None
        self.journey_ids = journey_ids or []  # list of journey IDs
        # e.g. "maternal", "paternal", "both", "unassigned", or None
        self.parental_sides = parental_sides
        self.match_type = match_type  # "all", "close", "distant", or None
        self._should_stop = False

    def stop(self):
        self._should_stop = True

    def run(self):
        items_per_page = 100
        matches = []
        page = 1
        headers = {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }
        if self.csrf_token:
            headers['X-CSRF-Token'] = self.csrf_token
        with requests.Session() as session:
            while len(matches) < self.num_matches:
                if self._should_stop:
                    break
                base_url = f"https://www.ancestry.com/discoveryui-matches/parents/list/api/matchList/{self.test_guid}?itemsPerPage={items_per_page}&currentPage={page}"
                # Add parentalSides if set
                if self.parental_sides:
                    base_url += f"&parentalSides={self.parental_sides}"
                # Add sharedDna for close/distant, or use custom cM
                if self.match_type == "close":
                    base_url += "&sharedDna=closeMatches"
                elif self.match_type == "distant":
                    base_url += "&sharedDna=distantMatches"
                elif self.shared_dna:
                    base_url += f"&sharedDna={self.shared_dna}"
                # Add journey filter if set
                if self.journey_ids:
                    import json as _json
                    jf = self.journey_ids
                    if not isinstance(jf, str):
                        jf = _json.dumps(jf)
                    base_url += f"&searchCommunity={jf}"
                url = base_url
                print(f"[FetchMatchesThread] Fetching URL: {url}")
                response = session.get(
                    url, headers=headers, cookies=self.cookies)
                if self._should_stop:
                    break
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
        self.result_signal.emit(
            matches[:self.num_matches], "" if matches else "No matches found.")


class MatchFetchWindow(QWidget):
    def closeEvent(self, event):
        # Properly stop the fetch thread if running
        if hasattr(self, 'current_thread') and self.current_thread is not None:
            if self.current_thread.isRunning():
                self.current_thread.stop()

    def __init__(self):
        super().__init__()
        self.setWindowTitle("MatchFetch")
        self.setWindowIcon(QIcon("icon.png"))
        self.resize(700, 500)
        self.cookies = None
        self.test_list = []
        self.selected_test_guid = None
        self.current_thread = None
        self.match_count_total = 0
        self.match_count_close = 0
        self.match_count_distant = 0

        # Layouts
        self.main_layout = QVBoxLayout()
        self.setLayout(self.main_layout)

        # Test selection
        self.test_select = QComboBox()
        self.test_select.addItem("Select a test", None)
        self.test_select.setCurrentIndex(0)
        self.test_select.currentIndexChanged.connect(self.on_test_selected)
        self.main_layout.addWidget(self.test_select)

        # Match filter radios
        self.radio_group = QButtonGroup(self)
        radio_layout = QHBoxLayout()
        self.radio_all = QRadioButton("All matches")
        self.radio_close = QRadioButton("Close matches")
        self.radio_distant = QRadioButton("Distant matches")
        self.radio_custom = QRadioButton("Custom cM")
        self.radio_all.setChecked(True)
        for i, radio in enumerate([self.radio_all, self.radio_close, self.radio_distant, self.radio_custom]):
            self.radio_group.addButton(radio, i)
            radio_layout.addWidget(radio)
        self.main_layout.addLayout(radio_layout)
        self.radio_group.buttonClicked.connect(self.on_radio_changed)

        # Dynamic input row (number of matches or cM)
        self.matches_label = QLabel("Number of matches to fetch")
        self.main_layout.addWidget(self.matches_label)
        self.input_row = QHBoxLayout()
        self.input_num_matches = QLineEdit()
        self.input_num_matches.setPlaceholderText("e.g. 5")
        self.input_num_matches.setText("5")
        self.input_min_cm = QLineEdit()
        self.input_min_cm.setPlaceholderText("Min cM")
        self.input_max_cm = QLineEdit()
        self.input_max_cm.setPlaceholderText("Max cM")
        self.input_row.addWidget(self.input_num_matches)
        self.main_layout.addLayout(self.input_row)

        # Filtering group
        filter_group = QGroupBox("Filter")
        filter_vbox = QVBoxLayout()
        filter_group.setLayout(filter_vbox)

        # Journeys section
        journeys_label = QLabel("🗺️ Journeys")
        filter_vbox.addWidget(journeys_label)
        self.journey_hbox = QHBoxLayout()
        filter_vbox.addLayout(self.journey_hbox)
        self.journey_checkboxes = []

        # Horizontal line
        hline = QFrame()
        hline.setFrameShape(QFrame.Shape.HLine)
        hline.setFrameShadow(QFrame.Shadow.Sunken)
        filter_vbox.addWidget(hline)

        # Parents section
        parent_label = QLabel("👪 Parent")
        filter_vbox.addWidget(parent_label)
        parent_hbox = QHBoxLayout()
        self.rb_parent_maternal = QRadioButton("Maternal")
        self.rb_parent_paternal = QRadioButton("Paternal")
        self.rb_parent_unassigned = QRadioButton("Unassigned")
        self.rb_parent_none = QRadioButton("All")
        self.rb_parent_none.setChecked(True)
        self.parent_radio_group = QButtonGroup(self)
        self.parent_radio_group.addButton(self.rb_parent_none, 0)
        self.parent_radio_group.addButton(self.rb_parent_maternal, 1)
        self.parent_radio_group.addButton(self.rb_parent_paternal, 2)
        self.parent_radio_group.addButton(self.rb_parent_unassigned, 3)
        parent_hbox.addWidget(self.rb_parent_none)
        parent_hbox.addWidget(self.rb_parent_maternal)
        parent_hbox.addWidget(self.rb_parent_paternal)
        parent_hbox.addWidget(self.rb_parent_unassigned)
        filter_vbox.addLayout(parent_hbox)
        self.main_layout.addWidget(filter_group)

        # Fetch button
        self.fetch_button = QPushButton("Fetch Matches")
        self.fetch_button.clicked.connect(self.on_fetch_clicked)
        self.main_layout.addWidget(self.fetch_button)

        # Log area
        self.log = QTextEdit()
        self.log.setReadOnly(True)
        self.main_layout.addWidget(self.log, stretch=1)

        # Status
        self.status = QLabel("")
        self.main_layout.addWidget(self.status)

        self.load_tests()
        self.update_input_row()

    def on_fetch_clicked(self):
        # Stop previous thread if running
        if hasattr(self, 'current_thread') and self.current_thread is not None:
            if self.current_thread.isRunning():
                self.current_thread.stop()
                self.current_thread.wait()
        if not self.selected_test_guid:
            self.status.setText("No test selected.")
            return
        # Gather filters
        shared_dna = None
        num_matches = 5
        match_type = None
        if self.radio_custom.isChecked():
            min_cm = self.input_min_cm.text().strip()
            max_cm = self.input_max_cm.text().strip()
            if min_cm and max_cm:
                shared_dna = f"{min_cm}-{max_cm}"
            elif min_cm:
                shared_dna = f"{min_cm}-"
            elif max_cm:
                shared_dna = f"0-{max_cm}"
            num_matches = 1000  # default high value for custom cM, or make this user-configurable
        else:
            try:
                num_matches = int(self.input_num_matches.text())
                if num_matches <= 0:
                    raise ValueError
            except ValueError:
                self.status.setText("Enter a positive integer for matches.")
                return
            # Determine match_type from radio selection
            if self.radio_close.isChecked():
                match_type = "close"
            elif self.radio_distant.isChecked():
                match_type = "distant"
            else:
                match_type = "all"
            shared_dna = None  # Only set shared_dna for custom cM
        # Journey filter
        journey_ids = [cb.objectName() for cb in getattr(
            self, 'journey_checkboxes', []) if cb.isChecked()]
        # Parent filter (radio buttons)
        parental_sides = None
        if self.rb_parent_maternal.isChecked():
            parental_sides = "maternal"
        elif self.rb_parent_paternal.isChecked():
            parental_sides = "paternal"
        elif self.rb_parent_unassigned.isChecked():
            parental_sides = "unassigned"
        # If 'All' is selected, parental_sides remains None
        # Start fetch
        self.status.setText(
            f"Fetching matches for testGuid: {self.selected_test_guid}")
        csrf_token = get_csrf_token(self.cookies)
        self.current_thread = FetchMatchesThread(
            self.selected_test_guid, num_matches, self.cookies, csrf_token,
            shared_dna=shared_dna, journey_ids=journey_ids, parental_sides=parental_sides, match_type=match_type)
        self.current_thread.result_signal.connect(self.display_matches)
        self.current_thread.start()

    def load_tests(self):
        tests_json, cookies = fetch_tests_json('cookie.txt')
        self.cookies = cookies
        self.test_list = parse_test_list(tests_json)
        self.test_select.clear()
        self.test_select.blockSignals(True)
        self.test_select.clear()
        self.test_select.addItem("Select a test", None)
        for idx, (subject_name, test_guid) in enumerate(self.test_list, 1):
            self.test_select.addItem(
                f"[{idx}] {subject_name} ({test_guid})", test_guid)
        self.test_select.setCurrentIndex(0)
        self.selected_test_guid = None
        self.test_select.blockSignals(False)

    def on_test_selected(self, idx):
        if idx == 0:
            self.selected_test_guid = None
            self.radio_all.setText("All matches")
            self.radio_close.setText("Close matches")
            self.radio_distant.setText("Distant matches")
            # Remove journey checkboxes
            for cb in getattr(self, 'journey_checkboxes', []):
                cb.setParent(None)
            self.journey_checkboxes = []
            # Reset cached counts
            self.match_count_total = 0
            self.match_count_close = 0
            self.match_count_distant = 0
            return
        elif 1 <= idx <= len(self.test_list):
            self.selected_test_guid = self.test_list[idx-1][1]
            # Remove old journey checkboxes
            for cb in getattr(self, 'journey_checkboxes', []):
                cb.setParent(None)
            self.journey_checkboxes = []
            # Remove all widgets from journey_hbox
            while self.journey_hbox.count():
                item = self.journey_hbox.takeAt(0)
                widget = item.widget()
                if widget:
                    widget.setParent(None)
            # Start background thread to fetch counts and journeys
            self.status.setText("Fetching match counts and journeys...")
            QApplication.setOverrideCursor(Qt.CursorShape.WaitCursor)
            self.counts_journeys_thread = FetchCountsJourneysThread(
                self.selected_test_guid, self.cookies)
            self.counts_journeys_thread.result_signal.connect(
                self.on_counts_journeys_ready)
            self.counts_journeys_thread.start()

    def on_counts_journeys_ready(self, counts, journeys):
        total, close, distant = counts
        self.match_count_total = total
        self.match_count_close = close
        self.match_count_distant = distant
        self.radio_all.setText(f"All matches ({total})")
        self.radio_close.setText(f"Close matches ({close})")
        self.radio_distant.setText(f"Distant matches ({distant})")
        # Always select 'All matches' radio
        self.radio_all.setChecked(True)
        # Set matches input to total
        self.input_num_matches.setText(str(total))
        # Add journey checkboxes
        for jid, jname in journeys:
            cb = QCheckBox(jname)
            cb.setObjectName(jid)
            self.journey_checkboxes.append(cb)
            self.journey_hbox.addWidget(cb)
        QApplication.restoreOverrideCursor()
        self.status.setText("")
        self.update_input_row()

    def on_radio_changed(self):
        # Set matches input to the cached count for the selected radio
        if self.selected_test_guid:
            if self.radio_all.isChecked():
                self.input_num_matches.setText(str(self.match_count_total))
            elif self.radio_close.isChecked():
                self.input_num_matches.setText(str(self.match_count_close))
            elif self.radio_distant.isChecked():
                self.input_num_matches.setText(str(self.match_count_distant))
        self.update_input_row()

    def update_input_row(self):
        # Remove all widgets from input_row
        while self.input_row.count():
            item = self.input_row.takeAt(0)
            widget = item.widget()
            if widget:
                widget.setParent(None)
        if self.radio_custom.isChecked():
            self.matches_label.hide()
            self.input_row.addWidget(self.input_min_cm)
            self.input_row.addWidget(self.input_max_cm)
        else:
            self.matches_label.show()
            self.input_row.addWidget(self.input_num_matches)

    def display_matches(self, matches, error):
        self.log.clear()
        if error:
            self.status.setText(error)
            self.log.append(error)
            return
        self.log.append(f"Fetched {len(matches)} matches:")
        for idx, match in enumerate(matches, 1):
            match_profile = match.get('matchProfile', {})
            display_name = match_profile.get('displayName')
            sample_id = match.get('sampleId')
            self.log.append(f"{idx}. {display_name or ''} | {sample_id or ''}")
        self.status.setText(f"Fetched {len(matches)} matches. (See below)")


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = MatchFetchWindow()
    window.show()
    sys.exit(app.exec())
