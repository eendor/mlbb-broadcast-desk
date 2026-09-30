"""Collapse the desk outputs into ONE OBS scene while OBS is closed.

The single `PASIKLAB - Program` browser source loads overlay.html with no
scene parameter, so it already follows whatever scene is picked in Live
Production. All overlays therefore live in one OBS scene. The game Window
Capture sits beneath it so transparent overlays (draft, scoreboard, rails)
show the match, while full-screen overlays cover it.
"""
import copy
import datetime
import json
import os
from pathlib import Path
import subprocess

running = subprocess.check_output(
    ['tasklist', '/FI', 'IMAGENAME eq obs64.exe', '/FO', 'CSV'],
    creationflags=subprocess.CREATE_NO_WINDOW).decode(errors='replace')
if 'obs64.exe' in running.lower():
    raise SystemExit('Close OBS before editing scenes; its active collection must not be edited on disk.')

target = Path(os.environ['APPDATA']) / 'obs-studio/basic/scenes/Untitled.json'
original = target.read_bytes()
data = json.loads(original)
stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
backup = target.with_name(f'Untitled.before-consolidate-{stamp}.json.backup')
backup.write_bytes(original)

sources = data['sources']

def find(name, kind=None):
    return next((s for s in sources if s['name'] == name and (kind is None or s['id'] == kind)), None)

program = find('PASIKLAB - Program', 'browser_source')
window_capture = find('Window Capture', 'window_capture')
overlay = find('Overlay', 'scene')
program_uuid = program['uuid']
capture_uuid = window_capture['uuid'] if window_capture else None

# A full-canvas scene item stretched to 1920x1080 via bounds.
def scene_item(source, number):
    return {
        'name': source['name'], 'source_uuid': source['uuid'], 'visible': True,
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

# Program browser on top (id 2), game capture beneath (id 1).
items = []
if capture_uuid:
    items.append(scene_item(window_capture, 1))
items.append(scene_item(program, 2))
overlay['settings'] = {'id_counter': len(items) + 1, 'custom_size': False, 'items': items}

# Drop every extra scene and the per-scene browser sources added earlier.
keep_scenes = {'Overlay', 'Game', 'Scene'}
keep_browser = {'PASIKLAB - Program'}
pruned = []
for s in sources:
    if s['id'] == 'scene' and s['name'] not in keep_scenes:
        continue
    if s['id'] == 'browser_source' and s['name'] not in keep_browser:
        continue
    pruned.append(s)
data['sources'] = pruned

kept_scene_names = [s['name'] for s in pruned if s['id'] == 'scene']
data['scene_order'] = [{'name': n} for n in ['Overlay'] + [x for x in kept_scene_names if x != 'Overlay']]
data['current_scene'] = data['current_program_scene'] = 'Overlay'

target.write_text(json.dumps(data, ensure_ascii=False, indent=4), encoding='utf-8')
print(json.dumps({
    'overlay_items': [i['name'] for i in items],
    'scenes': [s['name'] for s in pruned if s['id'] == 'scene'],
    'backup': str(backup),
}))
