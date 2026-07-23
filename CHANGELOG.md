# Changelog

## [2.0.1] - 2026-07-23

### Added
- Added a localized Gallery warning that lists unavailable configured pose libraries with their paths and system-reported failure reasons.
- Added recovery guidance so users can unlock a drive or fix a configured path, then reload the Gallery and Presets selector without restarting ComfyUI.

### Changed
- Increased the initial height of newly inserted OpenPose Studio nodes so the pose preview has enough room to display at a useful size.

### Fixed
- Prevented inaccessible pose libraries, including locked BitLocker drives, from blocking OpenPose Studio initialization and node registration.

---

## [2.0.0] - 2026-07-22

### Added
- Added a focused, transactional editor for the 21 keypoints of each imported OpenPose hand, with precise point dragging, hover feedback, cancel/confirm controls, and one undo entry per confirmed session.
- Added whole-hand selection and controls for moving, resizing, rotating, mirroring, and opening the focused hand editor.
- Added optional wrist-to-hand-anchor alignment so connected hands move together with their corresponding body wrists.
- Added Gallery filtering by pose filename or library path.

### Changed
- Replaced the body keypoint sidebar with anatomical hand keypoint names while the focused hand editor is active.
- Made the focused hand viewport square and kept contribution buttons available during hand editing.
- Documented hand editing across all localized READMEs with new screenshots.

---

## [1.8.3] - 2026-07-20

### Added
- Added custom pose libraries through ComfyUI's `extra_model_paths.yaml`, including recursive discovery across multiple configured roots.
- Added regression coverage for nested libraries, duplicate root names, legacy API compatibility, source selection, and traversal protection.

### Changed
- Grouped Gallery poses by their full logical library path while keeping absolute server paths private.
- Updated Gallery statistics to report the actual number of poses, JSON files, and libraries.
- Preserved compatibility with older frontend and backend versions during pose discovery.

### Security
- Hardened pose file resolution with configured-root containment checks, including protection against traversal and symlink escapes.

---

## [1.8.2] - 2026-07-20

### Changed
- Refreshed the animated Comfy Registry banner with the standardized node screenshot and simplified node-to-editor sequence.
- Versioned the banner filename as `banner_182.gif` to prevent stale CDN and browser caches from serving an older preview.

---

## [1.8.1] - 2026-07-20

### Added
- Added an animated Comfy Registry banner highlighting the OpenPose Studio node, visual editor, and multi-pose area workflow.

### Changed
- Replaced the generic Registry description with a concise summary of visual pose editing, presets, and ControlNet-ready outputs.
- Updated all localized READMEs with current ComfyUI Nodes 2.0 compatibility and troubleshooting guidance.
- Corrected the package metadata to reference the English README in `docs/`.

### Removed
- Removed the obsolete `TODO.md` file and its roadmap references from every localized README.

---

## [1.7.0] - 2026-05-07

### Fixed
- Fixed the OpenPose Studio node preview to work correctly with ComfyUI Nodes 2.0, restoring full preview functionality for users on the new node system.
- Preserved backward compatibility so the preview continues to work with classic ComfyUI nodes.
- Fixed direct `Pose JSON` widget edits not refreshing the preview; changes to the widget value now immediately update the displayed pose.

---

## [1.6.0] - 2026-05-04

### Added
- Added full UI translations for French, Russian, Portuguese, and German — the editor interface is now fully localized in nine languages.
- Keypoint list controls and drag handles in the sidebar are now hidden when no pose is selected, preventing unintended interaction with an empty state.
- Documented the `pose_keypoint` optional input in the English README, with a screenshot showing how to wire an external keypoint source into the node.
- All localized READMEs now display locale-specific screenshots for the `areas` input section.

---

## [1.5.0] - 2026-04-30

### Added
- Added a conditioning area overlay that visualizes ComfyUI-LoRA-Pipeline area boundaries as labeled badges directly on the canvas, with a per-area visibility toggle.
- Added a drag-to-delete trash target for keypoints.
- Added an `areas` optional input to the node, accepting area data from ComfyUI-LoRA-Pipeline.
- Documented `areas` input support in the English README and all eight localized READMEs.

---

## [1.4.0] - 2026-04-24

### Added
- Added a `pose_keypoint` optional input that accepts keypoint data from DWPose Estimator and other compatible nodes, allowing external pose sources to be loaded directly into the editor.
- Added JSON format compatibility to correctly handle various keypoint data structures from different upstream nodes.

---

## [1.3.0] - 2026-04-14

### Added
- Added an external rotation handle on the active pose for on-canvas rotation.
- Added external mirror handles on the active pose for on-canvas horizontal flip.
- Selection and preselection bounding boxes now remain fully visible when a pose is positioned near canvas edges.

### Changed
- Aligned top sidebar controls to the right for a cleaner layout.

---

## [1.2.1] - 2026-04-11

### Added
- Added shift-marquee additive keypoint selection: hold Shift while dragging a marquee to add keypoints to the current selection.
- Added live canvas preview updates while a marquee selection is being dragged.

---

## [1.2.0] - 2026-04-11

### Added
- Added multi-keypoint marquee selection within the active pose, with bounding-box resize handles.

### Fixed
- Fixed the Delete key removing selected keypoints before triggering pose deletion.

---

## [1.1.0] - 2026-03-24

### Added
- Added insertion of missing keypoints by drag and drop onto the canvas.
- Added double-click chain completion for loose keypoints.

### Changed
- Allowed deletion of arbitrary keypoints, not only distal ones.
- Preserved COCO-18 format when deleting the Neck keypoint.

### Fixed
- Removed the invalid third pose from `carrying.json`.

---

## [1.0.0] - 2026-03-20

- Initial release of ComfyUI OpenPose Studio.
