# MatchFetch

<p align="center">
   <img src="icon.png" alt="MatchFetch icon" width="120" style="margin-bottom:1em;" />
</p>
<p align="center">
   <img src="Animation.gif" alt="MatchFetch demo animation" style="max-width:480px; border-radius:10px; box-shadow:0 2px 12px rgba(0,0,0,0.10); background:#222;" />
</p>

<p align="center" style="font-size:1.08em; color:#444; margin-top:0.5em;">
   <strong>MatchFetch is a desktop application for downloading and exporting DNA match data from Ancestry.com.</strong><br>
    It provides advanced privacy features and flexible filtering to help you analyze your match list securely and efficiently.
</p>

<p align="center" style="color:#2b7a2b; font-size:1.05em; margin-top:0.5em;">
   <strong>Your data stays private: all processing happens locally on your computer.</strong>
</p>

**For help on how to use MatchFetch, see the online guide:**
👉 [https://admixr.com/matchfetch/how-to-use.html](https://admixr.com/matchfetch/how-to-use.html)

## Features

- Fetches DNA matches from Ancestry.com using your account cookies
- Adds community (journey) and ethnicity information to your matches
- Flexible filtering by cM and cluster
- Exports both **Full Data** and **Anonymized** results in both JSON and SQLite DB formats
- Resume feature: automatically saves progress and allows you to continue interrupted sessions

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
   - (Optional) Select cluster.

5. **Fetch matches**

   - Click "Fetch Matches". The app will download your matches in batches.
   - Progress is saved automatically. If interrupted, you can resume later using the "Resume previous session" button.

6. **Exported Files**
   - When finished, the app saves two sets of files in the project folder:
     - **Full Data**: Contains all fields, including names and IDs, as both a `.json` and `.db` (SQLite) file.
     - **Anonymized**: Removes sensitive fields and anonymizes IDs for privacy, as both a `.json` and `.db` (SQLite) file.
   - The UI will show both file types for each export, with clear icons and labels.
   - Click the info icon next to "Anonymized" for details about privacy features.

## Privacy Features

- **Anonymized Export**:
  - Removes Name, Cluster, and cM fields from both JSON and DB exports
  - Replaces IDs with SHA-256 hashes (not reversible)
  - Uses the most common journey name as the filename (instead of the test name)
  - See the in-app info dialog (info icon) for a full explanation
- **Full Data Export**:
  - Contains all fields for your own analysis (not for sharing)

## Region Data Format

- Each match's `Regions` field (in JSON) is a dictionary sorted from highest to lowest percentage.
- Each region entry looks like:
  ```json
  "Senegal": {
     "percentage": 4,
     "lowerConfidence": 2,
     "upperConfidence": 4
  }
  ```
- Only regions with nonzero percentages are included.
- In the DB export, regions are stored in a separate table and can be joined by match ID.

## Resume Feature

- If the app is closed or interrupted, your progress is saved automatically.
- When you restart, you can resume from where you left off using the "Resume previous session" button.

## Troubleshooting

- If you see errors about cookies or login, make sure your `cookie.txt` is up to date and you are logged in to Ancestry.com in your browser.
- For network errors, check your internet connection and try again.

## License

This project is for personal/research use only. Not affiliated with Ancestry.com.

## Support

For more support, join our [Discord](https://discord.com/invite/eGvnrp8TDs).
