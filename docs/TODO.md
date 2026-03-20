# TODO

> [!NOTE]
> These are some features I originally planned to ship, but I couldn’t finish them after running out of AI tokens. Until I receive contributions to fund more tokens, development will need to wait for the next billing cycle; after that, I’ll start cherry-picking features to implement gradually, prioritizing what’s most useful and urgent.

## Pose Editor improvements
- Implement drag-and-drop editing of keypoints directly inside the canvas.
- Implement a dedicated **hands keypoints editor** (left/right hand).
- Implement a dedicated **face keypoints editor**.
- Implement actions to **insert missing face keypoints** when a pose does not include face data.
- Implement actions to **insert missing hands keypoints** when a pose does not include hands data.
- Implement a method to allow editing hands and faces.
- Add support for horizontal pose mirroring (left/right flip).
- Add a setting to **configure grid opacity** (make the grid more/less visible).
- Implement **interactive canvas resizing** in the editor via drag handle:
  - Allow resizing by click-dragging from the **bottom-right corner** of the editor canvas.
- Implement canvas zooming with mouse wheel.

## Render configuration (Python node)
- Finish the **Render** section so it actually controls how poses are rendered from the **Python node**.
  - Define the settings contract between frontend UI and backend node (schema/fields/defaults).
  - Ensure settings are persisted and applied consistently (node -> render).

## Poses Merger improvements
- Allow exporting all poses using a unified resolution.
  - Carefully evaluate scaling and centering so no pose gets clipped or falls outside the canvas.
- Add an option to list and manage **all poses contained in a pose collection JSON file**, instead of forcing the user to select a single pose at import time.
- Display the **resolution (width x height)** of each loaded pose as a column in the Added Files table.
- Allow renaming poses when exporting to a pose collection JSON file.
- Allow editing pose names inside an existing pose collection JSON file.
- Add the ability to **rename poses inside collections** from the merger UI (without re-exporting everything).

## Collections canvas sizing
- Implement a mechanism to **set/choose the canvas size for pose collections** as JSON files are added/merged.
  - Decide whether the canvas size is user-selected, inferred from inputs, or derived from an export preset.

## Stability & Data Handling
- Add validation for malformed or incomplete pose JSON files.
- Improve error feedback when importing unsupported or corrupted files.
- Some invalid/broken JSON pose files won't display in the gallery with their respective warning.
- Be more flexible when importing pose JSON files that do **not** include `canvas_width` / `canvas_height`:
  - Accept the file anyway.
  - Define a clear fallback strategy (e.g., infer from known formats, prompt the user, or default to a configurable size).

## UI / UX
- No pending tasks at this time.

## Quality of Life
- Better default naming for unnamed poses.
- Small visual indicators for single-pose vs pose collection sources.
