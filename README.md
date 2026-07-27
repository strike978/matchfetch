# MatchFetch

Fetch, browse, and explore your AncestryDNA match data.

![MatchFetch screenshot](screenshot.png)

## Features

- **Match List** — View all matches in a card layout with photos, names, cM/segments, and journey pills. Filter by name, cM range, ancestral journeys, and ethnicity regions (with percentage ranges).
- **Match Detail** — Click any match to see their ethnicity breakdown grouped by macro region with confidence ranges, plus a hierarchical ancestral journey tree. Both tabs include interactive Leaflet maps.
- **Multiple Kits** — Switch between DNA kits, each stored separately in IndexedDB.
- **Fetch Modes** — Fetch by count (first N matches) or by cM range (all matches within a centimorgan window). Resume interrupted fetches.
- **Persistent Storage** — All match data, profiles, ethnicity estimates, and journeys are saved locally in IndexedDB via Dexie.js. No re-fetching needed after the initial load.
- **Import / Export** — Download all data as JSON or restore from a backup.
- **Privacy** — Toggle to hide names on cards.

## Installation

1. Download or clone this repo
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select the `matchfetch_ext` folder
5. The MatchFetch icon will appear in your toolbar

## Usage

1. Click the MatchFetch icon in your browser toolbar
2. Select a kit from the dropdown
3. Choose **Count** (enter number of matches) or **cM Range** (enter min/max cM), then click **Fetch**
4. Cards appear progressively as data is fetched. Click any card to open the detail page with maps
5. Use **Export** to download all data as JSON, **Import** to restore a previous backup

---

Created by Omar Nunez · Version 0.0.9

_23andMe support coming soon._
