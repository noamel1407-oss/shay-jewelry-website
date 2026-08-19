# Scroll keyframe editor

Development tool for posing the homepage ring along the page scroll. It does not change the live production path until you paste an export into `index.html`.

## Setup

The homepage module exposes the existing Three r185 objects after they are created:

```js
window.threeScene = scene;
window.threeCamera = camera;
window.threeRenderer = renderer;
window.threeModel = pivot;
```

`pivot` is the group the production scroll animation writes to (`position` / `quaternion` / `scale`). The editor attaches TransformControls to this same object. It does not load another GLB.

## Guard

Inside `function frame()` in `index.html`, immediately after `requestAnimationFrame(frame)`:

```js
if (window.__editorActive || window.__scrollEditorPreview) return;
```

- **Edit:** `__editorActive = true`, `__scrollEditorPreview = false` — old path does not overwrite `pivot`.
- **Preview:** `__editorActive = false`, `__scrollEditorPreview = true` — old path still suppressed; editor keyframes play.
- **Production (no `?editor`):** both flags stay false; the existing ring path runs unchanged.

## Open the editor

Serve the site locally, then add `?editor` to the homepage URL:

```text
http://localhost:PORT/index.html?editor
```

Without `?editor`, `scroll-editor.js` is not imported at all (the homepage only dynamic-imports it when that query is present).

## Workflow

1. Open the site in editor mode (`?editor`).
2. Wait until the console logs `[ScrollEditor] … Editor attached.`
3. Scroll to a location on the real page.
4. Move / rotate / scale the ring (W / E / R, or the panel buttons). Drag the ring body for a screen-plane move.
5. Click **+ Add keyframe** (or **✓ Update keyframe** if one already exists at this scroll %). The 0% start pose is editable and cannot be deleted.
6. Repeat for other scroll positions.
7. Click a row in the list to jump the page to that keyframe.
8. **▶ Preview** plays the new keyframes on the real page (hides the panel). **✕ Edit** returns.
9. **📤 Export** copies a production snippet (keyframes + lerp/slerp playback). It does not contain the editor UI.

## Disable / remove

- Stop using it: drop `?editor` from the URL.
- Remove it: delete `scroll-editor.js`, remove the `<script type="module" src="scroll-editor.js">` tag, delete this README, and optionally revert the `window.three*` assignments, the `frame()` guard, and the `html.scroll-editor-on` CSS. `vendor/three/addons/controls/TransformControls.js` can stay; nothing in production imports it.
