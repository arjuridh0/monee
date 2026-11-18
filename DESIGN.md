# Monee interface

## Direction and purpose

A warm pocket ledger for everyday household money. Preserve the original cute, friendly character: cream canvas, dark mascot-colored navigation, rounded headings and animated 2.5D companions. The user rejected the overly flat, square redesign on 16 November 2026. Improve density, alignment and interaction polish without replacing that identity.

## First viewport and behavior

- Desktop shows the page title; mobile relies on the active bottom tab and keeps semantic headings visually hidden. Home retains a compact personal greeting and lock action, with the balance immediately below. Label income, spending and savings separately; omit the reset explanation.
- One white balance surface and one grouped allowance surface; transactions remain open rows. Avoid cards inside cards.
- Empty states use a compact companion and one clear next step. No motivational filler or decorative information panels.
- Settings group related controls with small colored icon cues. Show readable labels and current values.
- Mascot selection uses a looping frameless carousel with consistent 2.5D artwork on soft oval washes. The full picker background, including the plain header, transitions between green, blue and amber with the active preview. Keep a back arrow and one apply action; no preview cards or 3D models.
- Desktop retains an analytics column; mobile has a compact floating dark navigation bar with a 48 px add button and no notch.
- The mobile highlight is a persistent element within each two-link group, sliding horizontally for 220 ms with no bounce or size change. Its coordinates stay local to the navbar while each route restores its own scroll position. Switching groups never carries it across the add button; reduced motion removes translation.
- PWA installation uses one compact invitation above mobile navigation or at the desktop bottom right. Preserve the app's icon, theme and typography. Show it after setup when installation is available; defer it for seven days after dismissal. Yield to update notices and open dialogs. Safari gets an explicit installation guide.
- Catat opens voice capture, with an 80 px icon microphone and compact manual/receipt alternatives. Opening the sheet never starts capture. Keep the mascot stage frameless and stable between listening/loading states. No consent checkboxes: retain provider disclosure and explicit microphone/read actions. Selecting a receipt never uploads it.
- Voice and receipt review use the same in-form bucket picker: a named icon, full bucket name, themed selected row and check mark. Opening the list reveals choices above the sticky save footer. Support touch, arrows, type-ahead, Enter and Escape; choosing a bucket only edits the draft. No native mobile bucket dropdown or nested modal.
- Dates use one themed, inline calendar across history, manual entry, voice review, receipts, onboarding income and savings edits. Weeks begin Monday; show selected and current dates distinctly. Support month/year selection, arrows, Home/End, PageUp/PageDown and Escape without closing the containing form. Keep day rows 44 px tall and columns evenly spaced on narrow phones. PWA invitations and update banners yield to an open calendar. History offers 7/30-day shortcuts; a custom range replaces period bounds for both summary and transactions, and has an explicit return-to-period action.
- Keep savings empty states compact, with the companion beside the explanation and action. Disabled controls keep readable neutral ink; busy controls retain their action color. All primary actions use white text on a sufficiently dark mascot accent, including Bumi amber #9C641D.

## System

- Self-hosted Baloo 2 for headings and Satoshi for body and tabular currency amounts. Rounded titles provide personality; financial figures stay easy to compare.
- Warm cream canvas #F7F3EA; white task surfaces; dark ink; existing green, blue and amber mascot accents. Dark navigation follows the selected mascot.
- 14 px control corners, 20 px grouped surfaces, 26 px major balance/empty panels. Restrained soft shadows only where they clarify elevation.
- At least 44 px interaction targets; visible keyboard focus; accessible control borders and text contrast. Loading, empty, disabled and recovery states remain explicit.
- Keep motion brief: 150-300 ms feedback, existing mascot animation and carousel transitions. Respect reduced motion. Do not introduce another animation library.

## Implementation and verification

Code-led changes to the existing application. Impeccable guides visual hierarchy, spacing, accessibility and motion; gpt-taste informs composition and detail. Marketing AIDA, scroll pinning and huge section spacing do not apply to an everyday money app. Preserve financial logic, records and authentication. Verify the production build with automated desktop/mobile checks, then inspect real interaction and screenshots in Ego Browser. Update only `LOCAL_REPORT.md` at the project root (ignored by Git). Do not create separate QA reports or screenshot galleries.
