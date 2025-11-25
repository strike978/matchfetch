# MatchFetch

MatchFetch is a Windows application for fetching and managing your Ancestry DNA matches. It uses a built-in browser to securely access Ancestry.com, retrieving your DNA match data and storing it locally in a SQLite database.

## Features

- **Secure Login**: Authenticate with your Ancestry.com account through a secure browser interface without storing any credentials locally.
- **Match Fetching**: Automatically retrieve all your DNA matches with comprehensive details including shared DNA segments, genetic communities, and ethnicity regions.
- **Data Storage**: Store match data in a local SQLite database for fast access and offline viewing.
- **Progress Tracking**: Monitor real-time progress during data fetching with detailed status updates.
- **Match Details**: View in-depth information about each match, including shared DNA segments, genetic communities, and ethnicity regions.
- **Database Management**: Clear and refresh match data for specific tests as needed.

## Requirements

- Windows 10 or later (64-bit)
- .NET 9.0 runtime (included in the installer)

## Installation

1. Download the latest installer from the [Releases](https://github.com/strike978/matchfetch/releases) page.
2. Run the installer and follow the setup wizard.
3. The app will be installed to `%LOCALAPPDATA%\MatchFetch`.
4. Optionally create a desktop shortcut during installation.

## Usage

1. Launch MatchFetch from the Start menu or desktop shortcut.
2. Click "Open Ancestry Window" to authenticate with your Ancestry.com account.
3. Select a DNA test from the dropdown.
4. Click "Fetch Matches" to start retrieving your DNA matches.
5. View match details, including shared DNA segments, genetic communities, and ethnicity regions.
6. Data is automatically saved to the local database for future reference.

## Disclaimer

This application is not affiliated with Ancestry.com. Use at your own risk and in accordance with Ancestry's terms of service. The developers are not responsible for any misuse or violations of Ancestry's policies.
