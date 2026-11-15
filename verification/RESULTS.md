# Verification — 2026-11-15 (Asia/Shanghai)

- Initial tree clean; only pocket-strobe changed.
- Shared 0.1–999 Hz target, default 15; no slider; shared 12/15/20/24/30 presets. Exact drafts including 999.0 retained across modes.
- Strict decimal validation rejects excess precision rather than rounding. Empty/trailing-decimal editing supported; invalid current draft blocks start, never falls back to stale values. Mobile decimal keyboard and labelled spinbutton min/max/step, keyboard arrow steps.
- typecheck, build, 38 unit tests, git diff --check passed. High 999 Hz target stays unchanged, timer writes bounded to <=64/second in fake-time test; slow writes serialized without queued pulses; late permissions/cleanup and no future pulses after stop tested. Screen max one update/frame including 0.1,12.3,999.
- Chrome smoke passed full input/preset/mode/start/invalid matrix at 390 and 1280px. Layout checked 320/360/390/700/701/1280; immersive output and compact focused stop at 320x568,390x844,1280x900. Escape, Enter, button, arbitrary tap, pagehide, hidden visibility stop. Zero page errors.
- All automated starts force black output before interaction; no actual flashing. Idle and black active screenshots generated locally (ignored by git).
- Actual frequency prominently unmeasured/not guaranteed; screen frame quantization/aliasing and LED serialized minimum 16ms scheduling disclosed, without changing target config.

## Not hardware-verified
Physical Android/iOS LED/permissions, measured pulse timing, heat/battery, mobile browser chrome/fullscreen, Wake Lock, OS suspension. Hardware/driver stalls can delay off; 999 Hz is not a physical achievement claim.
