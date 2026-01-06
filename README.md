# MatchFetch

MatchFetch is a Windows application for fetching and managing your Ancestry and 23andMe DNA matches. It uses a built-in browser to securely access Ancestry.com and 23andMe, retrieving your DNA match data and storing it locally in a SQL database.

## Features

- **Secure Login**: Authenticate with your Ancestry or 23andMe account through a secure browser interface without storing any credentials locally.
- **Data Storage**: Store match data in a local SQL database for fast access and offline viewing.
- **Progress Tracking**: Monitor real-time progress during data fetching with detailed status updates.
- **Match Details**: View in-depth information about each match, including number of shared DNA segments, genetic communities, and ethnicity regions.
- **Export Matches**: Export your matches in JSON format for external use.
- **Database Management**: Clear and refresh match data for specific tests as needed.

## Requirements

- Windows 10 or later (64-bit)
- .NET 9.0 runtime (included in the installer)

## Installation

1. Download the latest version (v2.0.0) from the [Releases](https://github.com/strike978/matchfetch/releases) page.
2. Run the installer.
3. Launch MatchFetch from the Start menu.

## Usage

1. Launch MatchFetch from the Start menu or desktop shortcut.
2. Select your DNA testing service (Ancestry or 23andMe) from the dropdown.
3. Select a DNA test from the dropdown.
4. Click "Fetch Matches" to start retrieving your DNA matches.
5. View match details, including genetic communities, and ethnicity regions.
6. Data is automatically saved to the local SQL database for future reference.

## Disclaimer

This application is not affiliated with Ancestry.com or 23andMe. Use at your own risk and in accordance with each service's terms of service. The developers are not responsible for any misuse or violations of their policies.
