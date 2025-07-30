import sys
import requests
import re
import json
from functools import partial
from PySide6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout, QLabel, QComboBox,
    QRadioButton, QButtonGroup, QLineEdit, QPushButton, QTextEdit, QCheckBox, QGroupBox, QGridLayout
)
from PySide6.QtGui import QIcon
from PySide6.QtCore import Qt, QThread, Signal


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

    def __init__(self, test_guid, num_matches, cookies, csrf_token):
        super().__init__()
        self.test_guid = test_guid
        self.num_matches = num_matches
        self.cookies = cookies
        self.csrf_token = csrf_token

    def run(self):
        items_per_page = 5
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
                url = (
                    f"https://www.ancestry.com/discoveryui-matches/parents/list/api/matchList/"
                    f"{self.test_guid}?itemsPerPage={items_per_page}&currentPage={page}"
                )
                response = session.get(
                    url, headers=headers, cookies=self.cookies)
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
    def fetch_journeys(self, test_guid):
        # Step 1: Get journey IDs
        url = f"https://www.ancestry.com/discoveryui-matches/parents/list/api/journeys/{test_guid}"
        headers = {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json',
            'Referer': 'https://www.ancestry.com/discoveryui-matches/parents/list/',
            'Origin': 'https://www.ancestry.com',
        }
        csrf_token = get_csrf_token(self.cookies)
        if csrf_token:
            headers['X-CSRF-Token'] = csrf_token
        session = requests.Session()
        if self.cookies:
            for k, v in self.cookies.items():
                session.cookies.set(k, v)
        resp = session.get(url, headers=headers)
        journey_ids = []
        if resp.status_code == 200:
            try:
                journeys_resp = resp.json()
                for arr in journeys_resp.values():
                    for comm in arr:
                        jid = comm.get('communityId')
                        if jid:
                            journey_ids.append(jid)
            except Exception:
                pass
        # Step 2: Get journey names
        journey_names = {}
        if journey_ids:
            names_url = "https://www.ancestry.com/dna/origins/branches/names"
            names_headers = headers.copy()
            names_headers['Content-Type'] = 'application/json'
            resp2 = session.post(
                names_url, headers=names_headers, data=json.dumps(journey_ids))
            if resp2.status_code == 200:
                try:
                    journey_names = resp2.json()
                except Exception:
                    pass
        # Return list of (id, name)
        return [(jid, journey_names.get(jid, jid)) for jid in journey_ids]

    def fetch_match_counts(self, test_guid):
        url = f"https://www.ancestry.com/discoveryui-matches/parents/list/api/matchCount/{test_guid}"
        headers = {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Referer': 'https://www.ancestry.com/discoveryui-matches/parents/list/',
            'Origin': 'https://www.ancestry.com',
        }
        csrf_token = get_csrf_token(self.cookies)
        if csrf_token:
            headers['X-CSRF-Token'] = csrf_token
        # Add cookies
        session = requests.Session()
        if self.cookies:
            for k, v in self.cookies.items():
                session.cookies.set(k, v)

        def get_count(payload):
            try:
                resp = session.post(url, headers=headers,
                                    data=json.dumps(payload))
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get('count', 0)
            except Exception:
                pass
            return 0
        total = get_count({'lower': 0, 'upper': 10})
        close = get_count({'lower': 0, 'upper': 9})
        distant = get_count({'lower': 10, 'upper': 10})
        return total, close, distant

    def __init__(self):
        super().__init__()
        self.setWindowTitle("MatchFetch")
        self.setWindowIcon(QIcon("icon.png"))  # Use your icon file here
        self.resize(700, 500)
        self.cookies = None
        self.test_list = []
        self.selected_test_guid = None
        self.current_thread = None  # Keep reference to running thread
        self.match_count_total = 0
        self.match_count_close = 0
        self.match_count_distant = 0

        # Layouts
        main_layout = QVBoxLayout()
        self.setLayout(main_layout)

        # Test selection
        self.test_select = QComboBox()
        self.test_select.addItem("Select a test", None)
        self.test_select.setCurrentIndex(0)
        self.test_select.currentIndexChanged.connect(self.on_test_selected)
        main_layout.addWidget(self.test_select)

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
        main_layout.addLayout(radio_layout)
        self.radio_group.buttonClicked.connect(self.on_radio_changed)

        # Dynamic input row (number of matches or cM)
        self.matches_label = QLabel("Number of matches to fetch:")
        main_layout.addWidget(self.matches_label)
        self.input_row = QHBoxLayout()
        self.input_num_matches = QLineEdit()
        self.input_num_matches.setPlaceholderText("e.g. 5")
        self.input_num_matches.setText("5")
        self.input_min_cm = QLineEdit()
        self.input_min_cm.setPlaceholderText("Min cM")
        self.input_max_cm = QLineEdit()
        self.input_max_cm.setPlaceholderText("Max cM")
        self.input_row.addWidget(self.input_num_matches)
        main_layout.addLayout(self.input_row)

        # Filtering group
        filter_group = QGroupBox("Filter")
        self.filter_layout = QGridLayout()
        filter_group.setLayout(self.filter_layout)
        # Journeys
        self.filter_layout.addWidget(QLabel("Journeys:"), 0, 0)
        self.journey_checkboxes = []
        # Placeholders, will be filled after test selection
        # Parents
        self.filter_layout.addWidget(QLabel("Parent:"), 1, 0)
        self.cb_parent_paternal = QCheckBox("Maternal")
        self.cb_parent_maternal = QCheckBox("Paternal")
        self.cb_parent_both_signed = QCheckBox("Both sides")
        self.cb_parent_unassigned = QCheckBox("Unassigned")
        self.filter_layout.addWidget(self.cb_parent_paternal, 1, 1)
        self.filter_layout.addWidget(self.cb_parent_maternal, 1, 2)
        self.filter_layout.addWidget(self.cb_parent_both_signed, 1, 3)
        self.filter_layout.addWidget(self.cb_parent_unassigned, 1, 4)
        main_layout.addWidget(filter_group)

        # Fetch button
        self.fetch_button = QPushButton("Fetch Matches")
        self.fetch_button.clicked.connect(self.on_fetch_clicked)
        main_layout.addWidget(self.fetch_button)

        # Log area
        self.log = QTextEdit()
        self.log.setReadOnly(True)
        main_layout.addWidget(self.log, stretch=1)

        # Status
        self.status = QLabel("")
        main_layout.addWidget(self.status)

        self.load_tests()
        self.update_input_row()

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
            # Fetch and update match counts
            self.status.setText("Fetching match counts and journeys...")
            QApplication.setOverrideCursor(Qt.CursorShape.WaitCursor)
            total, close, distant = self.fetch_match_counts(
                self.selected_test_guid)
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
            # Remove old journey checkboxes
            for cb in getattr(self, 'journey_checkboxes', []):
                cb.setParent(None)
            self.journey_checkboxes = []
            # Fetch and add journey checkboxes
            journeys = self.fetch_journeys(self.selected_test_guid)
            col = 1
            for jid, jname in journeys:
                cb = QCheckBox(jname)
                cb.setObjectName(jid)
                self.journey_checkboxes.append(cb)
                self.filter_layout.addWidget(cb, 0, col)
                col += 1
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

    def on_fetch_clicked(self):
        if not self.selected_test_guid:
            self.status.setText("No test selected.")
            return
        if self.radio_custom.isChecked():
            min_cm = self.input_min_cm.text()
            max_cm = self.input_max_cm.text()
            num_matches = 5  # Or add a separate input if needed
        else:
            try:
                num_matches = int(self.input_num_matches.text())
                if num_matches <= 0:
                    raise ValueError
            except ValueError:
                self.status.setText("Enter a positive integer for matches.")
                return
        self.status.setText(
            f"Fetching matches for testGuid: {self.selected_test_guid}")
        csrf_token = get_csrf_token(self.cookies)
        self.current_thread = FetchMatchesThread(
            self.selected_test_guid, num_matches, self.cookies, csrf_token)
        self.current_thread.result_signal.connect(self.display_matches)
        self.current_thread.start()

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
