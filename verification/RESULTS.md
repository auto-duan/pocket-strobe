# Verification — 2026-11-15 (Asia/Shanghai)

- Initial git working tree clean; only this project changed.
- Consent checkbox/state/gate/modal removed. Manual start only; default 1 Hz. Idle safety and reduced-motion text are nonblocking.
- Running output: fixed inset-0, no padding, only one compact floating stop button (44px minimum touch target); main/settings/header/warnings hidden. Safe-area offsets apply only to stop button.
- npm run typecheck, npm test (7/7), npm run build: passed. Controller and torch cleanup unchanged; cancellation, late streams, serialized writes and permission errors remain covered.
- Chrome browser smoke passed: no consent or autoplay; default/preset; reduced-motion warning; viewport coverage and no horizontal/vertical active overflow at 320x568, 390x844, 1280x900; idle widths 320/360/390/700/701/1280; hidden settings/header/warnings; compact focused keyboard-accessible stop; Enter, button click, arbitrary background tap, Escape, pagehide, visibility hidden all stop. Zero page errors.
- All automated starts force output black before interaction: no visible flashes. Screenshots: mobile-idle.png, desktop-idle.png, mobile-active-black.png.
- Browser system fullscreen remains optional and best effort, not implied by viewport coverage.

## Real-device checks not performed

Rear LED/permissions on physical Android/iOS, measured pulse timing, heat/battery, actual mobile browser chrome/fullscreen, Wake Lock and OS suspension. Browser/hardware stalls can delay torch-off; no hardware guarantee implied by tests.
