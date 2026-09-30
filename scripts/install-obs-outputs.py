"""Put ALL overlay browser sources into ONE OBS scene while OBS is closed.

Each overlay (draft, scoreboard, MVP, cameras, sponsors, etc.) becomes its
own fixed 1920x1080 browser source inside a single scene named `Overlay`.
The game Window Capture sits at the bottom. Toggle each overlay source's
eye icon to show/hide it; they all live in the same scene.
"""
import copy
import datetime
import json
import os
from pathlib import Path
import subprocess
import uuid

running = subprocess.check_output(
    ['tasklist', '/FI', 'IMAGENAME eq obs64.exe', '/FO', 'CSV'],
    creationflags=subprocess.CREATE_NO_WINDOW).decode(errors='replace')
if 'obs64.exe' in running.lower():
    raise SystemExit('Close OBS before editing scenes; its active collection must not be edited on disk.')

target = Path(os.environ['APPDATA']) / 'obs-studio/basic/scenes/Untitled.json'
original = target.read_bytes()
data = json.loads(original)
stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
backup = target.with_name(f'Untitled.before-one-scene-{stamp}.json.backup')
backup.write_bytes(original)

sources = data['sources']
base_url = 'http://127.0.0.1:3210/overlay.html'

# Every overlay as its own fixed-scene browser source. Full-screen overlays
# are hidden by default; the transparent match overlays start visible.
overlays = [
    ('PASIKLAB - Draft Arena', 'draft', True),
    ('PASIKLAB - In-game HUD', 'scoreboard', False),
    ('PASIKLAB - Player Stat Rails', 'players', False),
    ('PASIKLAB - Team Cameras', 'cameras', False),
    ('PASIKLAB - Starting Soon', 'countdown', False),
    ('PASIKLAB - Playoffs Bracket', 'playoffs', False),
    ('PASIKLAB - Match Result', 'postgame', False),
    ('PASIKLAB - Game MVP', 'mvp', False),
    ('PASIKLAB - Match Schedule', 'schedule', False),
    ('PASIKLAB - Intermission', 'intermission', False),
    ('PASIKLAB - Sponsors', 'sponsors', False),
    ('PASIKLAB - Ad Break', 'ads', False),
    ('PASIKLAB - Swiss Archive', 'swiss', False),
]

def find(name, kind=None):
    return next((s for s in sources if s['name'] == name and (kind is None or s['id'] == kind)), None)

window_capture = find('Window Capture', 'window_capture')

def browser_source(name, key, visible_default):
    src = find(name, 'browser_source')
    if src is None:
        src = {'prev_ver': 537001986, 'name': name, 'uuid': str(uuid.uuid4()),
               'id': 'browser_source', 'versioned_id': 'browser_source',
               'mixers': 255, 'sync': 0, 'flags': 0, 'volume': 1.0, 'balance': 0.5,
               'enabled': True, 'muted': False, 'monitoring_type': 0,
               'hotkeys': {}, 'private_settings': {}}
        sources.append(src)
    src['settings'] = {
        'url': base_url + '?scene=' + key, 'width': 1920, 'height': 1080,
        'fps': 60, 'fps_custom': True, 'shutdown': True, 'restart_when_active': False,
        'css': 'body { background-color: rgba(0,0,0,0); margin: 0px auto; overflow: hidden; }'}
    return src

def scene_item(source, number, visible):
    return {
        'name': source['name'], 'source_uuid': source['uuid'], 'visible': visible,
        'locked': False, 'rot': 0.0, 'scale_ref': {'x': 1920.0, 'y': 1080.0},
        'align': 5, 'bounds_type': 2, 'bounds_align': 0, 'bounds_crop': False,
        'crop_left': 0, 'crop_top': 0, 'crop_right': 0, 'crop_bottom': 0,
        'id': number, 'group_item_backup': False,
        'pos': {'x': 0.0, 'y': 0.0}, 'pos_rel': {'x': -1920 / 1080, 'y': -1.0},
        'scale': {'x': 1.0, 'y': 1.0}, 'scale_rel': {'x': 1.0, 'y': 1.0},
        'bounds': {'x': 1920.0, 'y': 1080.0}, 'bounds_rel': {'x': 1920 / 540, 'y': 2.0},
        'scale_filter': 'disable', 'blend_method': 'default', 'blend_type': 'normal',
        'show_transition': {'duration': 300}, 'hide_transition': {'duration': 300},
        'private_settings': {},
    }

# Build the single Overlay scene: game capture at bottom, then every overlay.
overlay = find('Overlay', 'scene')
items = []
number = 1
if window_capture:
    items.append(scene_item(window_capture, number, True))
    number += 1
# Add overlays bottom-up so full-screen ones sit above the match overlays.
for name, key, visible_default in overlays:
    src = browser_source(name, key, visible_default)
    items.append(scene_item(src, number, visible_default))
    number += 1
overlay['settings'] = {'id_counter': number, 'custom_size': False, 'items': items}

# Keep only the Overlay scene and the Game (OCR) scene; drop extras and the
# now-unused Program source.
keep_scenes = {'Overlay', 'Game'}
keep_browser = {name for name, _, _ in overlays}
pruned = []
for s in sources:
    if s['id'] == 'scene' and s['name'] not in keep_scenes:
        continue
    if s['id'] == 'browser_source' and s['name'] not in keep_browser:
        continue
    pruned.append(s)
data['sources'] = pruned

data['scene_order'] = [{'name': 'Overlay'}, {'name': 'Game'}]
data['current_scene'] = data['current_program_scene'] = 'Overlay'

target.write_text(json.dumps(data, ensure_ascii=False, indent=4), encoding='utf-8')
print(json.dumps({
    'overlay_items': [(i['name'], i['visible']) for i in items],
    'scenes': [s['name'] for s in pruned if s['id'] == 'scene'],
    'backup': str(backup),
}, indent=2))
