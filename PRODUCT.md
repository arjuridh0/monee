# Monee

Monee is a personal finance web app and installable PWA for recording daily income, spending, bucket allocations and savings goals. The owner and their partner use one account on laptops and phones. Cloudflare D1 is the account ledger; IndexedDB is a per-device working cache with offline changes queued for sync.

## Daily work

- Understand the available balance and remaining bucket allowance.
- Record a transaction quickly, manually or through voice or a receipt.
- Review and correct history; manage savings goals and recurring income templates.
- Rename and configure buckets without requiring a separate category workflow.
- Export and restore backups, control the local PIN and select a mascot/theme.

## Constraints and commitments

- Indonesian interface, rupiah amounts, legible tabular numbers.
- Existing user records, calculations and backup compatibility must be preserved.
- Cloudflare hosts the app and protects server AI endpoints. Provider keys stay on the server.
- Email and an account PIN identify the account across devices. Cloudflare Access verifies registration, legacy activation and PIN recovery. A rolling Monee session expires after 30 days without activity; a separate device PIN is optional and local only.
- The PIN does not encrypt IndexedDB. Cloud records exclude PIN hashes and salts.
- Local legacy data is never copied automatically: the user previews counts and explicitly chooses import or skip.
- Keep existing 2.5D mascots. Remove 3D models and their runtime.
- The mascot picker must have a plain heading, back arrow, no decorative cards and circular navigation in both directions.
- Keep app branding consistent with PWA, browser and install icons.
- Prefer clear task-oriented layouts with restrained motion over motivational panels, ornamental card stacks and heavy shadows.

## Review

Success means usable desktop and mobile screens, honest loading/error states, tested financial behavior and a documented distinction between verified results and external configuration or hardware limitations.
