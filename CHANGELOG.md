# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

#

## [1.0.5] - 2025-08-02

### Fixed

- Exported compare URLs in the CSV are now always lowercase for both test GUID and sample ID, ensuring consistent and clickable links.

## [1.0.4] - 2025-08-02

### Changed

- The regular CSV now has a "URL" column for each match, so you can click the link to view the match directly on Ancestry.
- Every export now gives you two files: a full CSV and a privacy CSV. The privacy CSV hides names and personal info, and uses a code instead of the real ID. The filename is based on the most common journey name, making it safer to share with others.

## [1.0.3] - 2025-08-01

### Fixed

- CSV export now works reliably with all Unicode characters, including emojis and special symbols. Problematic characters are automatically replaced, preventing export errors and ensuring all data is saved. Uses UTF-8 with BOM for best compatibility with Excel.

## [1.0.2] - 2025-08-01

### Fixed

- Subjourney names (like Portugal regions) now show up correctly in the CSV and app, even if their IDs use a different format. You will see all region names as expected.
- Ongoing improvements and bug fixes.

## [1.0.1] - 2025-08-01

### Changed

- Progress saving now stores the full `matches` list (including all enrichment data) in `progress.json` after each enrichment batch. This allows full resume of enrichment progress, including all journey and region data, after interruption.
- Only saves progress after a successful batch (atomic and robust progress saving).
- Error handling halts enrichment on the first failed batch, rather than skipping failed batches.
- `progress.json` also includes `params` and `enriched_ids` for session tracking and resuming.

### Fixed

- Prevented loss of enrichment data on interruption by saving all match data in progress.
- Improved atomic file write logic for progress files.

## [1.0.0] - 2025-07-XX

### Added

- Initial release of MatchFetch with Flet UI, batch fetching, enrichment, and CSV export.
- Privacy mode for anonymized CSV export.
- Robust error handling and progress saving.
