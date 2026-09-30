# Third-place broadcast

The saved match is PICE (blue) versus ULS-CED (red), Game 1, BO5, 0–0.
Use **Swap sides** if the online lobby assigns the opposite colors. The schedule
and ticker now identify the third-place match. APO's 4–2 grand-final win over
PSITS remains saved in the playoff bracket. The current Program selection was
preserved. Adjust the third-place series score using Live production; the
seven-match championship bracket does not include a third-place fixture.

## Load the changes

Close the desk's running Node server, then launch **Start Broadcast Desk.bat**.
Refresh the control desk and OBS browser sources. Automatic approval review
blocked the attempted server restart, so the running backend still needs this
step. No OBS streaming process was stopped.

## Team cameras

Create a separate OBS scene for the cameras. Add cropped Discord Window Capture
sources, then put a 1920 × 1080 Browser Source above them:

`http://127.0.0.1:3210/overlay.html?scene=cameras`

There are two transparent openings, one per team, each 870 x 490 px.
Blue: X=60, Y=290. Red: X=990, Y=290. Crop each team's Discord view with
Alt-drag and fit it to its opening. Team labels follow Teams & draft.
Transition into and out of this OBS scene normally.
The desk's Team cameras tab includes the preview and dimensions.

## Draft and result controls

- Drag starting-five rows or hero cards in the Program monitor to swap slots
  within a team. Choose player + hero together or heroes only.
- The draft clock and caster ribbon are removed from the broadcast output.
- MVP displays Total Gold. Unknown equipment remains blank; spells and emblems
  are no longer fabricated from hero class or role. Verify screenshot items in
  the parser before applying them. Result screenshots do not reveal emblems.
- Codex is configured for `gpt-6-astra` with `max` reasoning. A real screenshot
  test timed out after 180 seconds; recognition accuracy is not verified.
  Keep local OCR responsible for changing live HUD numbers.
- Gold reads reject malformed compact numbers and implausible early-game
  totals. Manual-profile OCR now holds abrupt upward spikes; three consistent
  lower readings can recover a previously inflated value.
- The False V4.8 OCR scoreboard script also holds malformed/spiking gold.
  Refresh that browser source if using it. Its backup is alongside the script:
  `scoreboaedocr.js.before-third-place`.

Feed OCR the clean emulator/window capture. The two OBS color-key filters shown
in the screenshots remove parts of the game image; their similarity settings
were not changed. Keep any keyed presentation source separate from the clean
source used for recognition.

Production backup: `data/state.before-third-place-20260930.json`.
Validation: 128 automated tests and browser checks for camera layout,
control/preview swaps, Total Gold, clock/caster removal and blank unknown builds.
