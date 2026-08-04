# MatchFetch

Fetch and explore your DNA match data from **AncestryDNA** and **23andMe**.

![MatchFetch screenshot](screenshot.png)

## Features

- **Two providers** — Switch between AncestryDNA and 23andMe with the service toggle in the top bar. Each provider keeps its own profiles and match data, stored separately in IndexedDB.
- **Match List** —
  - **AncestryDNA** — view all matches in a card layout with photos, names, and cM/segments. Filter by name, cM range, ancestral journeys, and ethnicity regions (with percentage ranges).
  - **23andMe** — view matches in a card layout with photos, names, shared cM/segments, and haplogroups. Filter by name, cM range, ancestry regions (with percentage ranges), Y-DNA/mtDNA, side, and grandparent birth locations (by country with a minimum of 1–4 locations).
- **Match Detail** — AncestryDNA: ethnicity breakdown grouped by macro region with confidence ranges, an ancestral journey tree, and interactive maps. 23andMe: ancestry composition with a trace-ancestry section, Y-DNA and mtDNA haplogroups, grandparent birth locations, and interactive region maps with descriptions and reference ethnicities.
- **Fetch Options** — AncestryDNA: fetch all matches, limit by count, or by cM range, with resume support. 23andMe: fetch matches and pull in ancestry composition and haplogroups for each sharing match.
- **Check for New Matches** — After fetching, pick up any new matches since the last fetch. Available for both AncestryDNA and 23andMe.
- **Persistent Storage** — All match data is saved locally in IndexedDB via Dexie.js. No re-fetching needed after the initial load.
- **Import / Export** — Download all data as JSON or restore from a backup.
- **Privacy** — Toggle to hide names on cards.

## Installation

1. Download or clone this repo
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select the `matchfetch-main` folder
5. The MatchFetch icon will appear in your toolbar

## Usage

1. Click the MatchFetch icon in your browser toolbar
2. Pick a provider (AncestryDNA or 23andMe) with the toggle in the top bar
3. **AncestryDNA** — select a profile, then click **Fetch** (or expand **Fetch options** for Count / cM Range). After fetching, use **Check for new matches** to pick up any new matches.
4. **23andMe** — select a profile, then click **Fetch** to fetch matches and pull in their ancestry and haplogroups. After fetching, use **Check for new matches** to pick up any new matches.
5. Cards appear progressively as data is fetched. Use **Filtering options** to narrow the list
6. Click any card to open the detail page
7. Use **Export** to download all data as JSON, **Import** to restore a previous backup

---

Created by Omar Nunez · Version 1.2.7
