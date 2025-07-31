# MatchFetch

<p align="center">
  <img src="icon.png" alt="MatchFetch icon" width="120" style="margin-bottom:1em;" />
</p>
<p align="center">
  <img src="Animation.gif" alt="MatchFetch demo animation" style="max-width:480px; border-radius:10px; box-shadow:0 2px 12px rgba(0,0,0,0.10); background:#222;" />
</p>

<p align="center" style="font-size:1.08em; color:#444; margin-top:0.5em;">
  <strong>MatchFetch is a desktop application for downloading and exporting DNA match data from Ancestry.com.</strong><br>
  It provides privacy features and flexible filtering to help you analyze your match list securely and efficiently.
</p>

<p align="center" style="color:#2b7a2b; font-size:1.05em; margin-top:0.5em;">
  <strong>Your data stays private: all processing happens locally on your computer.</strong>
</p>

**For help on how to use MatchFetch, see the online guide:**
👉 [https://admixr.com/matchfetch/how-to-use.html](https://admixr.com/matchfetch/how-to-use.html)

## Features

- Fetches DNA matches from Ancestry.com using your account cookies
- Adds community (journey) and ethnicity information to your matches
- Flexible filtering by cM, parental side, and community
- Privacy mode: anonymizes IDs and removes sensitive columns in exports
- Exports results to CSV for further analysis

## Requirements

- Python 3.8+
- [Flet](https://flet.dev/) (for the UI)
- [requests](https://pypi.org/project/requests/)

## Installation

1. Clone or download this repository.
2. Install dependencies:
   ```sh
   pip install flet requests
   ```
3. Obtain your Ancestry.com session cookies and save them in a file named `cookie.txt` in the project directory. (See below for details.)

## How to Run

Run the application with:

```sh
python matchfetch.py
```

This will open the MatchFetch UI.

## Usage Guide

1. **Load your Ancestry.com cookies**

   - In your browser, go to https://www.ancestry.com/discoveryui-matches/list/ and make sure you are logged in.
   - Open your browser's developer tools (usually F12), go to the Network tab, and reload the page.
   - Click on any network request and look for the "cookie" header under Request Headers.
   - Copy the entire cookie string and paste it into a file named `cookie.txt` in the project folder.
   - The format should be a standard cookie string (e.g., `name1=value1; name2=value2; ...`).

2. **Start the app**

   - Run `python matchfetch.py`.
   - The app will load your tests (DNA kits) automatically.

3. **Select a test**

   - Use the dropdown to select the DNA kit you want to fetch matches for.

4. **Choose match filters**

   - Select match type: All, Close, Distant, or Custom cM range.
   - (Optional) Set minimum/maximum cM for custom filtering.
   - (Optional) Select specific communities (journeys) or parental side.

5. **Enable Privacy Mode (optional)**

   - Check the "Privacy mode" box to anonymize IDs and remove sensitive columns in the export.
   - Click the info icon for details about privacy mode.

6. **Fetch matches**

   - Click "Fetch Matches". The app will download your matches in batches.
   - Progress is saved automatically. If interrupted, you can resume later.

7. **Export and open CSV**
   - When finished, the app saves a CSV file in the project folder.
   - Click "Open CSV file" to view the results.

## Privacy Mode

- Removes Name, Parent, and cM columns from the export
- Replaces IDs with SHA-256 hashes
- Uses the most common journey name as the filename (instead of the test name)
- See the in-app info dialog for more details

## Troubleshooting

- If you see errors about cookies or login, make sure your `cookie.txt` is up to date and you are logged in to Ancestry.com in your browser.
- For network errors, check your internet connection and try again.

## License

This project is for personal/research use only. Not affiliated with Ancestry.com.

## Support

For more support, join our [Discord](https://discord.com/invite/eGvnrp8TDs).
