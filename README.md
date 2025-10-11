# MatchFetch

**Export and analyze your AncestryDNA match data with ease.**

MatchFetch is a powerful desktop application that allows you to securely export your DNA match list from Ancestry.com for advanced analysis and research. With the companion Chrome extension, you can download your match data in just a few clicks and explore it with sophisticated filtering and visualization tools.

## Features

### 🧬 DNA Match Export

- **Secure Data Export**: Safely download your DNA match list from Ancestry.com
- **Comprehensive Data**: Includes centimorgan values, shared segments, regions, and more
- **Batch Processing**: Efficiently process hundreds or thousands of matches
- **Real-time Progress**: Live updates during the export process

### 🔍 Advanced Match Explorer

- **Powerful Filtering**: Filter by name, parental side, gender, cM range, regions, and journeys
- **Smart Search**: Search matches by display name with autocomplete disabled for privacy
- **Dynamic Filters**: Parental side and region filters automatically populate based on your data
- **Sorting Options**: Sort by centimorgan values, shared segments, or date

### 📊 Data Visualization

- **Match Statistics**: View total matches, filtered results, and average cM values
- **Regional Analysis**: Explore genetic regions with percentage breakdowns
- **Journey Insights**: Analyze genetic communities and migration patterns
- **Detailed Match Profiles**: In-depth view of individual matches

### 🔒 Privacy First

- **Local Processing**: All data is processed and stored locally on your computer
- **No Cloud Storage**: Your genetic data never leaves your device
- **Secure Authentication**: Uses your existing Ancestry.com session cookies
- **No Third-party Sharing**: Zero data collection or sharing with external services

## Installation

### Prerequisites

- Windows 10/11 (64-bit)
- Google Chrome browser
- Active Ancestry.com account with DNA test results

### Download

1. Download the latest release: `matchfetch-win64.exe`
2. Run the installer and follow the setup wizard
3. Install the MatchFetch Chrome extension from the Chrome Web Store

## Quick Start

### 1. Install Chrome Extension

- Add the MatchFetch extension to Chrome
- The extension will appear in your browser toolbar

### 2. Visit Ancestry DNA Matches

- Navigate to [Ancestry DNA Matches](https://www.ancestry.com/discoveryui-matches/list/)
- Ensure you're logged in to your account

### 3. Connect and Export

- Open the MatchFetch desktop app
- Click the Chrome extension icon
- Click "Connect App to Ancestry"
- Confirm cookie sharing when prompted
- Select your DNA test and export parameters
- Start the export process

### 4. Explore Your Data

- Use the Match Explorer to filter and analyze your matches
- Apply filters for parental side, cM range, regions, and more
- View detailed match profiles with regional and journey data
- Export filtered results for further analysis

## Usage Guide

### Data Fetch Options

- **Number of Matches**: Export a specific number of matches
- **Centimorgan Range**: Export matches within a specific cM range (6-3490)
- **Resume Support**: Continue interrupted exports from where you left off

### Match Explorer Features

- **Search**: Find matches by display name
- **Parental Side**: Filter by maternal, paternal, or both sides
- **Gender**: Filter by male/female matches
- **cM Range**: Set minimum and maximum centimorgan values
- **Regions**: Filter by genetic regions and specific locations
- **Journey Communities**: Explore migration patterns and genetic communities

### File Management

- **JSON Export**: Data is saved in standard JSON format
- **File Loading**: Drag and drop JSON files to load match data
- **Cross-session**: Load previously exported data anytime

## Technical Details

### Architecture

- **Desktop App**: Built with Wails (Go + HTML/CSS/JavaScript)
- **Chrome Extension**: Manifest V3 with native messaging
- **Data Format**: JSON with comprehensive match information
- **Communication**: Secure native messaging between extension and app

### Data Structure

```json
{
  "displayName": "Match Name",
  "sharedCentimorgans": 45.2,
  "numSharedSegments": 3,
  "side": "Maternal side",
  "regions": {
    "Europe": [
      {
        "name": "Ireland",
        "percentage": 15.2,
        "lowerConfidence": 12.1,
        "upperConfidence": 18.3
      }
    ]
  },
  "branches": [
    {
      "name": "Irish",
      "overallConnectionPercent": 78,
      "communities": [
        {
          "name": "County Cork",
          "connectionPercent": 45
        }
      ]
    }
  ]
}
```

## System Requirements

- **Operating System**: Windows 10/11 (64-bit)
- **Memory**: 4GB RAM minimum, 8GB recommended
- **Storage**: 100MB free space
- **Browser**: Google Chrome (latest version)
- **Internet**: Active internet connection for data export

## Support

### Troubleshooting

- **Connection Issues**: Ensure the desktop app is running before using the extension
- **Missing Cookies**: Visit your Ancestry DNA matches page before connecting
- **Export Errors**: Check your internet connection and Ancestry.com login status

### Common Issues

- **"Missing required authentication token"**: Visit Ancestry DNA matches page first
- **"Could not connect to MatchFetch app"**: Restart the desktop application
- **Empty match list**: Verify you have DNA matches on Ancestry.com

## Privacy & Security

MatchFetch is designed with privacy as a core principle:

- **Local Data Storage**: All match data is stored locally on your computer
- **No Telemetry**: No usage statistics or analytics are collected
- **Secure Communication**: Uses Chrome's native messaging for secure extension-app communication
- **Authentication Only**: Only accesses necessary cookies for Ancestry.com authentication
- **Open Source Ready**: Transparent code structure for security auditing

## License

Copyright © 2025 MatchFetch. All rights reserved.

---

**Made with ❤️ for genealogy enthusiasts and DNA researchers**
