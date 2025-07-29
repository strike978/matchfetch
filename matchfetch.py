import requests
import re


def fetch_and_print_match_list(test_guid, cookies, num_matches):
    items_per_page = 5
    matches = []
    page = 1
    headers = {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
    csrf_token = get_csrf_token(cookies)
    if csrf_token:
        headers['X-CSRF-Token'] = csrf_token
    while len(matches) < num_matches:
        url = f"https://www.ancestry.com/discoveryui-matches/parents/list/api/matchList/{test_guid}?itemsPerPage={items_per_page}&currentPage={page}"
        response = requests.get(url, headers=headers, cookies=cookies)
        if response.status_code == 200:
            try:
                data = response.json()
                match_list = data.get('matchList', [])
                if not match_list:
                    break
                matches.extend(match_list)
                if len(match_list) < items_per_page:
                    break  # No more pages
                page += 1
            except Exception as ex:
                print('Error parsing match list JSON:', ex)
                print(response.text)
                break
        else:
            print(
                f'Failed to fetch match list. Status: {response.status_code}')
            break
    if not matches:
        print('No matches found.')
        return
    print('Matches:')
    for idx, match in enumerate(matches[:num_matches], 1):
        match_profile = match.get('matchProfile', {})
        display_name = match_profile.get('displayName')
        sample_id = match.get('sampleId')
        print(f"[{idx}] displayName: {display_name}, sampleId: {sample_id}")


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
    response = requests.get(url, headers=headers, cookies=cookies)
    if response.status_code == 200:
        try:
            return response.json()
        except Exception as ex:
            print('Error parsing JSON:', ex)
            print(response.text)
            return None
    else:
        print(f'Failed to fetch tests. Status: {response.status_code}')
        return None


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
    else:
        print('Unexpected JSON structure:', tests_json)
    return test_list


def display_tests(test_list):
    for idx, (subject_name, test_guid) in enumerate(test_list, 1):
        print(f"[{idx}] subjectName: {subject_name}, testGuid: {test_guid}")


def select_test(test_list):
    if not test_list:
        print("No tests found.")
        return None
    while True:
        try:
            selection = int(input(f"Select a test [1-{len(test_list)}]: "))
            if 1 <= selection <= len(test_list):
                return test_list[selection-1]
            else:
                print("Invalid selection. Try again.")
        except ValueError:
            print("Please enter a valid number.")


def main():
    cookie_path = 'cookie.txt'
    with open(cookie_path, 'r', encoding='utf-8') as f:
        cookie_str = f.read().strip()
    cookies = parse_cookie_string(cookie_str)
    tests_json = fetch_tests_json(cookie_path)
    if tests_json is None:
        return
    print('Fetched tests:')
    test_list = parse_test_list(tests_json)
    display_tests(test_list)
    selected_test = select_test(test_list)
    if selected_test:
        print(f"Selected testGuid: {selected_test[1]}")
        while True:
            try:
                num_matches = int(
                    input("How many matches do you want to display? "))
                if num_matches > 0:
                    break
                else:
                    print("Please enter a positive number.")
            except ValueError:
                print("Please enter a valid number.")
        fetch_and_print_match_list(selected_test[1], cookies, num_matches)


if __name__ == '__main__':
    main()
