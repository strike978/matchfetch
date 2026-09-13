# MatchFetch

MatchFetch brings all your DNA matches into one place, right in your browser. Pull down every match or narrow the fetch by count or cM range — and if it gets interrupted, resume right where you left off.

![MatchFetch screenshot](screenshot.png)

## Features

- **Fetch all your matches**, or limit them by count or cM range. If a fetch is interrupted, you can pick up right where you left off.
- **Browse matches in a card layout** with photos, names, and shared cM/segments. Filter by name, cM range, and more.
- **Explore each match in detail** with ethnicity breakdowns and interactive maps.
- **Everything is saved locally** in IndexedDB, so you only fetch once. No re-fetching needed after the initial load.
- **Switch between profiles and DNA services**, each keeping its own data.
- **Import / export your data** as JSON anytime for a backup.
- **Privacy** — toggle to hide names on cards.

## Installation

1. Download or clone this repo
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select the `matchfetch-main` folder
5. The MatchFetch icon will appear in your toolbar

## Usage

1. Click the MatchFetch icon in your browser toolbar
2. Pick a DNA service with the toggle in the top bar
3. Select a profile, then click **Fetch** (or expand **Fetch options** for Count / cM Range). After fetching, use **Check for new matches** to pick up any new matches.
4. Cards appear progressively as data is fetched. Use **Filtering options** to narrow the list
5. Click any card to open the detail page
6. Use **Export** to download all data as JSON, **Import** to restore a previous backup

---

Created by Omar Nunez