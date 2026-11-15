# Verification — 2026-11-16

- `npm run typecheck`, `npm test` (38 tests), `npm run build`: pass.
- `node scripts/smoke.mjs`: Chrome, black-only output override. Fixed bottom dock geometry at 320×568, 390×844, 1280×900 across top/middle/end scroll; content bottom padding exceeds dock, no horizontal overflow.
- Native number input: real keyboard blocks letters/exponents/signs; decimal typing, trailing dot editing, empty/range errors, invalid paste events, programmatically injected exponent rejected on start; shared mode values and six presets 12/20/30/45/60/70.
- Manual start only, no consent gate, immersive output and compact stop, tap/Escape/Enter/pagehide/hidden cleanup. Pending camera cancellation tested with mock.
- Idle mobile/desktop screenshots reviewed; active screenshot black-only. No real flashes or hardware LED exercised.
- Real mobile soft keyboard behavior, LED, permissions, actual frequency, system fullscreen and wake lock still require device checks. Fixed dock uses safe-area insets; no claim of universal soft-keyboard visibility.
