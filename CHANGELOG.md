# Changelog

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
