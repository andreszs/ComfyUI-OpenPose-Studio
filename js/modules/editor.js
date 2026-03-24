import { COCO_KEYPOINTS, getFormat, getFormatForPose, isFormatEditAllowed } from "../formats/index.js";
import { t } from "./i18n.js";
import { UiIcons } from "../ui-icons.js";
import {
	buildDonationFooterHtml,
	applyDonationFooterStyles,
	cloneKeypoints,
	DEFAULT_CANVAS_WIDTH,
	DEFAULT_CANVAS_HEIGHT,
	DEFAULT_POSE_COCO18,
	MISSING_KEYPOINT_DRAG_TYPE,
	drawBoneWithOutline,
	drawKeypointWithOutline,
	scaleKeypointsToCanvas,
	isValidKeypoint,
	normalizePresetData,
	readFileToText,
	getPersistedSetting,
	setPersistedSetting,
	removePersistedSetting,
	showToast,
	showConfirm,
	showPrompt
} from "../utils.js";

// Re-export COCO_KEYPOINTS for backwards compatibility
export { COCO_KEYPOINTS };

/**
 * Inject CSS for monochrome SVG UI icons (id-guarded to prevent duplicates).
 */
function ensureOpenPoseInjectedStyles() {
	const id = 'openpose-injected-ui-icons-v1';
	if (document.getElementById(id)) return;

	const style = document.createElement('style');
	style.id = id;
	style.textContent = `
		/* Monochrome SVG icons (currentColor) */
		.openpose-ui-icon {
			display: block;
			opacity: 0.72;
			pointer-events: none; /* icon shouldn't steal clicks */
		}

		button:hover .openpose-ui-icon,
		.openpose-icon-button:hover .openpose-ui-icon,
		.openpose-preset-iconbtn:hover .openpose-ui-icon {
			opacity: 0.92;
		}

		/* Compact icon buttons (Preset header) */
		.openpose-preset-iconbtn {
			min-width: 26px;
			height: 22px;
			padding: 0 6px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 6px;
		}

		/* If the preset header has a row container, keep spacing tight */
		.openpose-preset-iconrow {
			display: inline-flex;
			align-items: center;
			gap: 6px;
		}

		/* Optional: right-aligned header icon for group titles */
		.openpose-group-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
		}
		.openpose-group-header .openpose-group-icon {
			opacity: 0.72;
		}

		/* Right sidebar module icons - grid-based layout */
		.openpose-sidebar-item {
			display: grid;
			grid-template-columns: 18px 1fr;
			column-gap: 10px;
			align-items: center;
			padding: 6px 8px;
		}

		.openpose-sidebar-icon {
			width: 14px;
			height: 14px;
			display: grid;
			place-items: center;
			opacity: 0.78;
			color: rgba(255, 255, 255, 0.70);
		}

		.openpose-sidebar-icon svg {
			display: block;
		}

		.openpose-sidebar-item:hover .openpose-sidebar-icon {
			opacity: 0.92;
			color: rgba(255, 255, 255, 0.85);
		}

		.openpose-sidebar-text {
			display: flex;
			flex-direction: column;
			gap: 2px;
			min-width: 0;
		}

		.openpose-sidebar-title {
			line-height: 1.2;
		}

		.openpose-sidebar-desc {
			line-height: 1.25;
		}

		/* Donate-button wipe fill (left-to-right on hover) */
		.openpose-donate-btn {
			position: relative;
			overflow: hidden;
		}
		.openpose-donate-btn::before {
			content: "";
			position: absolute;
			inset: 0;
			background: var(--donate-accent, rgba(255,255,255,0.10));
			transform: scaleX(0);
			transform-origin: left;
			transition: transform 0.22s ease;
			z-index: 0;
			pointer-events: none;
		}
		.openpose-donate-btn:hover::before {
			transform: scaleX(1);
		}
	`;
	document.head.appendChild(style);
}

const isPoseEditorDebugEnabled = () => {
	if (typeof globalThis === "undefined") {
		return false;
	}
	return !!globalThis.OpenPoseEditorDebug?.poseEditor;
};

// Debug logging helper for OpenPose Studio
export function debugLog(...args) {
	if (!isPoseEditorDebugEnabled()) {
		return;
	}
	console.log(...args);
}

export function logLayout(label, data) {
	if (!isPoseEditorDebugEnabled()) {
		return;
	}
	console.debug(`[OpenPose Studio] ${label}`, data);
}

const POSE_BG_DATA_URL_KEY = "openpose_editor.poseEditor.bg.dataUrl";
const POSE_BG_MODE_KEY = "openpose_editor.poseEditor.bg.mode";
const POSE_BG_OPACITY_KEY = "openpose_editor.poseEditor.bg.opacity";
const POSE_BG_MODES = new Set(["contain", "cover"]);
const DEFAULT_BG_MODE = "contain";
const DEFAULT_BG_OPACITY = 0.5;

function normalizeBackgroundMode(value) {
	if (POSE_BG_MODES.has(value)) {
		return value;
	}
	return DEFAULT_BG_MODE;
}

function normalizeBackgroundOpacity(value) {
	const num = Number(value);
	if (!Number.isFinite(num)) {
		return DEFAULT_BG_OPACITY;
	}
	return Math.min(1, Math.max(0, num));
}

// Helper function to detect COCO keypoint schema and return appropriate title
export function getKeypointSchemaTitle(renderer) {
	if (!renderer) return "COCO Keypoints";
	const poses = renderer.getPoses ? renderer.getPoses() : [];

	// Return generic title only when there are no poses at all
	if (!poses || poses.length === 0) {
		return "COCO Keypoints";
	}

	// Use selected pose if available, otherwise fall back to first pose
	const selectedIndex = renderer.getSelectedPoseIndex ? renderer.getSelectedPoseIndex() : null;
	const activeIndex = selectedIndex != null && poses[selectedIndex] ? selectedIndex : 0;
	const keypoints = poses[activeIndex].keypoints;

	if (!keypoints || keypoints.length < 2) {
		return "COCO Keypoints";
	}
	// Use stored per-pose formatId; fall back to neck-presence heuristic for old data
	const pose = poses[activeIndex];
	const formatId = pose.formatId || ((keypoints[1] == null) ? "coco17" : "coco18");
	const format = getFormat(formatId);
	return format ? `${format.displayName} Keypoints` : "COCO Keypoints";
}

/**
 * Check if any keypoint from any pose lies outside the canvas bounds.
 * Includes body keypoints, face keypoints, and hand keypoints if present.
 * @param {Array} poses - Array of pose objects with keypoints, faceKeypoints, handLeftKeypoints, handRightKeypoints
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @returns {{outOfBounds: boolean, count: number}} - Returns object with boolean and count of out-of-bounds keypoints
 */
export function isAnyKeypointOutOfBounds(poses, canvasWidth, canvasHeight) {
	if (!Array.isArray(poses) || poses.length === 0) {
		return { outOfBounds: false, count: 0 };
	}

	const extractCoords = (point) => {
		if (!point) {
			return null;
		}
		if (Array.isArray(point)) {
			if (point.length < 2) {
				return null;
			}
			return { x: Number(point[0]), y: Number(point[1]) };
		}
		if (typeof point === "object") {
			return { x: Number(point.x), y: Number(point.y) };
		}
		return null;
	};

	const countOutOfBounds = (points) => {
		if (!Array.isArray(points)) {
			return 0;
		}
		let count = 0;
		for (const point of points) {
			const coords = extractCoords(point);
			if (!coords) {
				continue;
			}
			const x = coords.x;
			const y = coords.y;
			if (!Number.isFinite(x) || !Number.isFinite(y)) {
				continue;
			}
			if (x < 0 || y < 0 || x > canvasWidth || y > canvasHeight) {
				count++;
			}
		}
		return count;
	};

	let outOfBoundsCount = 0;
	for (const pose of poses) {
		if (!pose) {
			continue;
		}
		outOfBoundsCount += countOutOfBounds(pose.keypoints || pose);
		outOfBoundsCount += countOutOfBounds(pose.faceKeypoints || pose.face_keypoints_2d);
		outOfBoundsCount += countOutOfBounds(pose.handLeftKeypoints || pose.hand_left_keypoints_2d);
		outOfBoundsCount += countOutOfBounds(pose.handRightKeypoints || pose.hand_right_keypoints_2d);
	}

	return { outOfBounds: outOfBoundsCount > 0, count: outOfBoundsCount };
}

export const poseEditorCanvasWorkflow = {
	setupEditorControls(container) {
		this.fileInput = container.querySelector(".openpose-file-input");
		this.fileInput.addEventListener("change", this.onLoad.bind(this));

		// Button event handlers
		container.querySelector('[data-action="add"]').addEventListener("click", () => {
			const presetId = this.presetSelect ? this.presetSelect.value : null;
			this.addPresetToCanvas(presetId);
		});
		container.querySelector('[data-action="remove"]').addEventListener("click", () => {
			this.removePose();
			this.recordHistory();
			this.saveToNode();
			this.refreshCocoKeypointsPanel();
		});
		container.querySelector('[data-action="reset"]').addEventListener("click", async () => {
			const confirmed = await showConfirm(
				"Clear all poses?",
				"This cannot be undone.",
			);
			if (!confirmed) {
				return;
			}
			this.resizeCanvas(DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT);
			this.resetCanvas();
			// Clear undo/redo history to make the operation non-reversible
			this.undo_history = [];
			this.redo_history = [];
			this.updateUndoButton();
			this.recordHistory();
			this.saveToNode();
			this.refreshCocoKeypointsPanel();
			// Show success toast after clearing
			showToast("success", "Pose Editor", t("toast.canvas_cleared"));
		});
		container.querySelector('[data-action="reset-size"]').addEventListener("click", () => {
			this.resizeCanvas(DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT);
			this.recordHistory();
			this.saveToNode();
		});
		container.querySelector('[data-action="save"]').addEventListener("click", () => this.save());
		container.querySelector('[data-action="load"]').addEventListener("click", () => this.load());
		const undoActionBtn = container.querySelector('[data-action="undo"]');
		if (undoActionBtn) {
			undoActionBtn.addEventListener("click", () => this.undo());
			this.undoButton = undoActionBtn;
		}
		container.querySelector('[data-action="ok"]').addEventListener("click", () => this.confirmAndClose());
		container.querySelector('[data-action="preset-prev"]').addEventListener("click", () => {
			this.stepPreset(-1);
		});
		container.querySelector('[data-action="preset-next"]').addEventListener("click", () => {
			this.stepPreset(1);
		});
		this.bindPresetReloadButtons = (root = container) => {
			root.querySelectorAll('[data-action="presets-reload"]').forEach((btn) => {
				if (btn.dataset.presetsReloadReady) {
					return;
				}
				btn.dataset.presetsReloadReady = "1";
				btn.addEventListener("click", () => {
					this.loadPresetsFromJson();
				});
			});
		};
		this.bindPresetReloadButtons(container);
		const cancelActionBtn = container.querySelector('[data-action="cancel"]');
		if (cancelActionBtn) {
			cancelActionBtn.addEventListener("click", () => this.requestClose());
		}

		// Background controls
		this.bgFileInput = container.querySelector(".openpose-bg-file-input");
		this.bgModeSelect = container.querySelector(".openpose-bg-mode-select");
		this.opacitySlider = container.querySelector(".openpose-opacity-slider");
		this.opacityValue = container.querySelector(".openpose-opacity-value");
		this.backgroundImage = null;
		this.backgroundOpacity = DEFAULT_BG_OPACITY;
		this.backgroundMode = DEFAULT_BG_MODE;
		this.setBackgroundControlsEnabled(false);
		this.restoreSessionBackground();

		container.querySelector('[data-action="load-bg"]').addEventListener("click", () => {
			this.bgFileInput.value = null;
			this.bgFileInput.click();
		});
		container.querySelector('[data-action="clear-bg"]').addEventListener("click", () => {
			this.clearBackground();
		});
		this.bgFileInput.addEventListener("change", (e) => {
			this.onLoadBackground(e);
		});
		this.bgModeSelect.addEventListener("change", () => {
			this.backgroundMode = this.bgModeSelect.value;
			this.updateSessionBackground({ mode: this.backgroundMode });
			this.applyBackground();
		});
		this.opacitySlider.addEventListener("input", () => {
			this.backgroundOpacity = this.opacitySlider.value / 100;
			if (this.opacityValue) {
				this.opacityValue.textContent = `${this.opacitySlider.value}%`;
			}
			this.updateSessionBackground({ opacity: this.backgroundOpacity });
			this.applyBackground();
		});

		// Width/Height inputs
		this.widthInput = container.querySelector(".openpose-width-input");
		this.heightInput = container.querySelector(".openpose-height-input");
		this.canvasBoundsWarningBanner = container.querySelector(".openpose-canvas-bounds-warning-banner");

		if (this.widthInput) {
			this.widthInput.addEventListener("change", () => {
				if (this.heightInput) {
					this.resizeCanvas(+this.widthInput.value, +this.heightInput.value);
					this.recordHistory();
					this.saveToNode();
				}
			});
		}

		if (this.heightInput) {
			this.heightInput.addEventListener("change", () => {
				if (this.widthInput) {
					this.resizeCanvas(+this.widthInput.value, +this.heightInput.value);
					this.recordHistory();
					this.saveToNode();
				}
			});
		}
		
		// Apply styling to canvas bounds warning banner
		if (this.canvasBoundsWarningBanner) {
			this.applyCanvasBoundsWarningStyles(this.canvasBoundsWarningBanner);
		}
	},

	tryExpandPanelForCanvas(targetCanvasWidth, availableCanvasWidth) {
		if (this.isMaximized || !this.panel || !this.canvasArea) {
			return false;
		}
		const available = Number(availableCanvasWidth) || 0;
		const needed = Math.ceil(targetCanvasWidth - available);
		if (needed <= 0) {
			return false;
		}
		const panelRect = this.panel.getBoundingClientRect();
		const currentWidth = panelRect.width || this.panel.offsetWidth || 0;
		if (currentWidth <= 0) {
			return false;
		}
		const maxUsableWidth = this.getMaxUsablePanelWidth();
		if (maxUsableWidth <= currentWidth) {
			return false;
		}
		const targetWidth = Math.min(maxUsableWidth, Math.ceil(currentWidth + needed));
		if (targetWidth <= currentWidth) {
			return false;
		}
		const previousRestore = Math.max(0, Number(this.panelRestoreWidth) || 0);
		const nextRestore = Math.max(previousRestore, targetWidth);
		if (nextRestore <= previousRestore) {
			return false;
		}
		this.panelRestoreWidth = nextRestore;
		this.applyPanelLayout();
		return true;
	},

	scheduleCanvasFit(attempt = 0) {
		if (!this.renderer) {
			return;
		}
		const maxAttempts = 6;
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				const area = this.canvasStage || this.canvasArea;
				if (area && (area.clientWidth <= 0 || area.clientHeight <= 0)) {
					if (attempt < maxAttempts) {
						setTimeout(() => this.scheduleCanvasFit(attempt + 1), 0);
					}
					return;
				}
				this.resizeCanvas(this.canvasWidth, this.canvasHeight);
				this.renderer.requestRedraw();
			});
		});
	},

	calcResolution(width, height) {
		let availableWidth = 0;
		let availableHeight = 0;

		const measureArea = this.canvasStage || this.canvasArea;
		if (measureArea) {
			const styles = window.getComputedStyle(measureArea);
			const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
			const padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
			availableWidth = measureArea.clientWidth - padX;
			availableHeight = measureArea.clientHeight - padY;
			logLayout(measureArea === this.canvasStage ? "calcResolution:canvasStage" : "calcResolution:canvasArea", {
				clientWidth: measureArea.clientWidth,
				clientHeight: measureArea.clientHeight,
				paddingLeft: styles.paddingLeft,
				paddingRight: styles.paddingRight,
				paddingTop: styles.paddingTop,
				paddingBottom: styles.paddingBottom,
				availableWidth,
				availableHeight
			});
		}

		if (availableWidth <= 0 || availableHeight <= 0) {
			// Fallback based on panel sizing heuristics
			availableWidth = Math.min(1100, window.innerWidth * 0.8) - 240;
			availableHeight = Math.min(750, window.innerHeight * 0.8) - 80;
			logLayout("calcResolution:fallback", {
				windowWidth: window.innerWidth,
				windowHeight: window.innerHeight,
				availableWidth,
				availableHeight
			});
		}
		const ratio = Math.min(availableWidth / width, availableHeight / height, 1);
		logLayout("calcResolution:result", {
			inputWidth: width,
			inputHeight: height,
			ratio,
			outputWidth: width * ratio,
			outputHeight: height * ratio
		});
		return {
			width: width * ratio,
			height: height * ratio,
			availableWidth,
			availableHeight
		};
	},

	resizeCanvas(width, height) {
		let resolution = this.calcResolution(width, height);
		const cssWidth = Math.round(resolution["width"]);
		const cssHeight = Math.round(resolution["height"]);

		this.canvasWidth = width;
		this.canvasHeight = height;

		if (this.widthInput) {
			this.widthInput.value = `${width}`;
		}
		if (this.heightInput) {
			this.heightInput.value = `${height}`;
		}

		// Use renderer to set canvas size
		this.renderer.setSize(width, height, cssWidth, cssHeight);

		this.canvasElem.style.width = `${cssWidth}px`;
		this.canvasElem.style.height = `${cssHeight}px`;

		// Re-apply background image if present
		if (this.backgroundImage) {
			this.applyBackground();
		}
		
		// Update canvas bounds warning based on new canvas size
		this.updateCanvasBoundsWarning();
	},

	addPresetToCanvas(presetId, options = {}) {
		const { silent = false } = options;
		// Check if this is an invalid file preset
		if (presetId && presetId.startsWith("invalid:")) {
			const filename = presetId.slice("invalid:".length);
			const emptyFile = this.emptyPoseFiles?.find(f => f.filename === filename);
			if (emptyFile) {
				showToast("error", t("toast.cannot_load_pose_title"), `${filename}\n${emptyFile.reason}`);
			}
			return;
		}

		const preset = this.presets.find(item => item.id === presetId) || this.presets[0];
		const rawKeypoints = preset ? preset.keypoints : cloneKeypoints(DEFAULT_POSE_COCO18.keypoints);
		// Allow caller to provide detected format id (from drag payload). Prefer explicit
		// formatId from options to avoid relying on sidebar selection or defaults.
		let detectedFormatPre = null;
		if (options && options.formatId) {
			detectedFormatPre = getFormat(options.formatId) || getFormatForPose(rawKeypoints);
		} else {
			detectedFormatPre = getFormatForPose(rawKeypoints);
		}
		const kpCountPre = detectedFormatPre && detectedFormatPre.keypoints ? detectedFormatPre.keypoints.length : 18;
		if (rawKeypoints.length >= kpCountPre) {
			const firstPersonKeypoints = rawKeypoints.slice(0, kpCountPre);
			if (!this.checkFormatCompatibility(firstPersonKeypoints)) {
				return;
			}
		}

		if (detectedFormatPre && !isFormatEditAllowed(detectedFormatPre.id)) {
			showToast("warn", "Pose Editor", t(`toast.${detectedFormatPre.id}_edit_disabled`), 7000);
			return;
		}

		const presetResolution = this.getPresetResolution(presetId);
		if (presetResolution) {
			// Auto-expand canvas if needed (never shrink)
			const oldWidth = this.canvasWidth;
			const oldHeight = this.canvasHeight;
			const newWidth = Math.max(oldWidth, presetResolution.width);
			const newHeight = Math.max(oldHeight, presetResolution.height);
			if (newWidth > oldWidth || newHeight > oldHeight) {
				this.resizeCanvas(newWidth, newHeight);
				showToast(
					"info",
					"OpenPose Studio",
					t("toast.canvas_auto_resized", { oldWidth, oldHeight, newWidth, newHeight }),
					4500
				);
			}
		}
		const keypoints = this.getPresetKeypoints(presetId);
		const faceKeypoints = this.getPresetFaceKeypoints(presetId);
		const { left: handLeftKeypoints, right: handRightKeypoints } = this.getPresetHandKeypoints(presetId);

		// Detect format (or reuse provided formatId) and get keypoint count for multi-person handling
		let detectedFormat = null;
		if (options && options.formatId) {
			detectedFormat = getFormat(options.formatId) || getFormatForPose(keypoints);
		} else {
			detectedFormat = getFormatForPose(keypoints);
		}
		const kpCount = detectedFormat && detectedFormat.keypoints ? detectedFormat.keypoints.length : 18;

		// Check format compatibility before adding any poses (avoids partial multi-person additions)
		if (keypoints.length >= kpCount) {
			const firstPersonKeypoints = keypoints.slice(0, kpCount);
			if (!this.checkFormatCompatibility(firstPersonKeypoints)) {
				return;
			}
		}
		// Handle multi-person presets by chunking every kpCount keypoints
		let personIndex = 0;
		for (let i = 0; i < keypoints.length; i += kpCount) {
			const personKeypoints = keypoints.slice(i, i + kpCount);
			const faceGroup = Array.isArray(faceKeypoints) ? faceKeypoints[personIndex] : null;
			const handLeftGroup = Array.isArray(handLeftKeypoints) ? handLeftKeypoints[personIndex] : null;
			const handRightGroup = Array.isArray(handRightKeypoints) ? handRightKeypoints[personIndex] : null;
			this.addPose(personKeypoints, faceGroup, handLeftGroup, handRightGroup, detectedFormat?.id || null);
			this.renderer.setSelectedPose(null);
			personIndex += 1;
		}
		// Trigger final redraw after all poses added
		this.renderer.requestRedraw();
		debugLog('[OpenPose Studio] Preset added. Total poses:', this.renderer.getPoses().length);
		this.recordHistory();
		this.saveToNode();
		// Refresh COCO keypoints panel to show the new pose format
		this.refreshCocoKeypointsPanel();
		// Show success feedback only if not silent
		if (!silent) {
			const fmtName = detectedFormat && detectedFormat.displayName ? detectedFormat.displayName : "Pose";
			const hasExtras = (Array.isArray(faceKeypoints) && faceKeypoints.length > 0) ||
				(Array.isArray(handLeftKeypoints) && handLeftKeypoints.length > 0) ||
				(Array.isArray(handRightKeypoints) && handRightKeypoints.length > 0);
			const msg = hasExtras 
			? t("toast.pose_added_with_note", { formatName: fmtName })
			: t("toast.pose_added", { formatName: fmtName });
		showToast("success", "Pose Editor", msg);
	}
},

addPose(keypoints = undefined, faceKeypoints = null, handLeftKeypoints = null, handRightKeypoints = null, formatId = null) {
	if (keypoints === undefined) {
		keypoints = cloneKeypoints(DEFAULT_POSE_COCO18.keypoints);
	}
		this.renderer.addPoseFromArray(keypoints, faceKeypoints, handLeftKeypoints, handRightKeypoints, formatId);
		this.updateRemoveState();
		// Trigger redraw to make new pose visible
		this.renderer.requestRedraw();
		debugLog('[OpenPose Studio] Pose added. Total poses:', this.renderer.getPoses().length);
		return true;
	},

	setPose(keypoints) {
		// Clear all poses and load from flat array via renderer
		this.renderer.loadFromFlatArray(keypoints);

		// Trigger redraw after loading all poses
		this.renderer.requestRedraw();
		debugLog('[OpenPose Studio] setPose completed. Total poses:', this.renderer.getPoses().length);
		this.saveToNode();
		this.refreshCocoKeypointsPanel();
		// After setPose, set baseline history and enable undo
		const state = this.renderer.serialize();
		const selection = this.renderer.getSelectedPoseIndex();
		const snapshot = JSON.stringify({ state, selection });
		this.undo_history = [snapshot];
		this.redo_history = [];
		this.updateUndoButton();
		this._initializing = false;
		this.updateCanvasBoundsWarning();
	},

	removePose() {
		// Use renderer API to remove selected pose
		const selectedIndex = this.renderer.getSelectedPoseIndex();
		if (selectedIndex < 0) {
			return;
		}
		this.renderer.removePose(selectedIndex);
		this.updateRemoveState();
	},

	resetCanvas() {
		// Clear all poses via renderer
		this.renderer.load({
			width: this.canvasWidth,
			height: this.canvasHeight,
			keypoints: []
		});
		// Re-apply background image if present
		if (this.backgroundImage) {
			this.applyBackground();
		}
		this.updateRemoveState();
		this._initializing = false;
		this.updateCanvasBoundsWarning();
	},

	handleEditorKeyDown(e) {
		if ((e.key === "ArrowDown" || e.key === "ArrowUp")) {
			const direction = e.key === "ArrowDown" ? 1 : -1;
			this.stepPreset(direction);
			e.preventDefault();
			e.stopImmediatePropagation();
			return;
		}
		if (e.key === "Delete") {
			// Delete key: remove selected pose
			const selectedIndex = this.renderer?.getSelectedPoseIndex();
			if (selectedIndex !== null && selectedIndex >= 0) {
				this.removePose();
				this.recordHistory();
				this.saveToNode();
				this.refreshCocoKeypointsPanel();
				e.preventDefault();
				e.stopImmediatePropagation();
			}
		}
		if (e.key === "Backspace") {
			// Backspace key: undo last action
			if (this.undo_history.length > 1) {
				this.undo();
				e.preventDefault();
				e.stopImmediatePropagation();
			}
		}
	}
};

export const poseEditorSubsystemWorkflow = {
	refreshCocoKeypointsPanel() {
		// Update header title with detected keypoint schema
		if (this.cocoKeypointsLabel) {
			this.cocoKeypointsLabel.textContent = getKeypointSchemaTitle(this.renderer);
		}
		this.updateExtraButtonsState();
		// Update keypoints list
		this.refreshCocoKeypointsList();
	},

	updateExtraButtonsState() {
		const removeFaceBtn = this.removeFaceButton;
		const removeHandsBtn = this.removeHandsButton;
		const rightActions = this.container
			? this.container.querySelector(".openpose-right-actions")
			: null;
		if (!removeFaceBtn && !removeHandsBtn) {
			if (rightActions) {
				rightActions.style.display = "none";
			}
			return;
		}
		const poses = this.renderer ? this.renderer.getPoses() : [];
		const hasPose = poses.length > 0;
		const selectedIndex = this.renderer ? this.renderer.getSelectedPoseIndex() : null;
		const activeIndex = selectedIndex != null && selectedIndex >= 0
			? selectedIndex
			: (hasPose ? 0 : null);
		const activePose = activeIndex != null ? poses[activeIndex] : null;
		const canEdit = selectedIndex != null && selectedIndex >= 0;
		const getBlockStatus = (keypoints) => {
			const hasBlock = Array.isArray(keypoints);
			const hasData = hasBlock && keypoints.some((kp) => kp);
			return { hasBlock, hasData };
		};
		const faceStatus = activePose ? getBlockStatus(activePose.faceKeypoints) : { hasBlock: false, hasData: false };
		const leftStatus = activePose ? getBlockStatus(activePose.handLeftKeypoints) : { hasBlock: false, hasData: false };
		const rightStatus = activePose ? getBlockStatus(activePose.handRightKeypoints) : { hasBlock: false, hasData: false };
		const showFace = hasPose && faceStatus.hasBlock;
		const showHands = hasPose && (leftStatus.hasBlock || rightStatus.hasBlock);
		const enableFace = canEdit && faceStatus.hasData;
		const enableHands = canEdit && (leftStatus.hasData || rightStatus.hasData);
		const updateButton = (button, visible, enabled) => {
			if (!button) {
				return;
			}
			button.style.display = visible ? "" : "none";
			button.disabled = !enabled;
			button.style.opacity = enabled ? "1" : "0.5";
			button.style.cursor = enabled ? "pointer" : "not-allowed";
			button.style.background = enabled
				? "var(--openpose-btn-bg)"
				: "var(--openpose-btn-disabled-bg)";
		};
		updateButton(removeFaceBtn, showFace, enableFace);
		updateButton(removeHandsBtn, showHands, enableHands);
		if (rightActions) {
			rightActions.style.display = (showFace || showHands) ? "flex" : "none";
		}
	},

	refreshCocoKeypointsList() {
		if (!this.cocoKeypointsList) {
			return;
		}
		
		// DEBUG: Check the browser console for detailed logs when hovering "Left Ear" on canvas
		// Expected to see:
		// 1. Canvas hover detection: "[canvas2d] Detected hover on keypoint ID: 17"
		// 2. Canvas hover state change logs
		// 3. Sidebar styling check logs showing if keypointId 17 is in cocoKeypointRowElements
		// 4. Details about selectedKeypoints array length and format
		
		this.hoveredKeypointId = null;
		this.cocoKeypointRowElements.clear();

		// Read from renderer (single source of truth)
		const poses = this.renderer ? this.renderer.getPoses() : [];
		const selectedIndex = this.renderer ? this.renderer.getSelectedPoseIndex() : null;
		const noPoses = poses.length === 0;
		// Style + wire donation footer buttons (shared module)
		const donationRoot = this.cocoKeypointsList
			? this.cocoKeypointsList.closest(".openpose-coco-keypoints-card")
			: null;
		if (donationRoot) {
			applyDonationFooterStyles(donationRoot);
		}
		
		// Handle empty state
		if (noPoses) {
			const applyEmptySectionLabelStyles = (label) => {
				if (!label) {
					return;
				}
				label.style.color = "var(--openpose-text-muted)";
				label.style.fontFamily = "Arial, sans-serif";
				label.style.fontSize = "12px";
				label.style.fontWeight = "normal";
				label.style.marginTop = "6px";
				label.style.marginBottom = "10px";
				label.style.textAlign = "left";
			};
			const keypointsCard = this.cocoKeypointsList
				? this.cocoKeypointsList.closest(".openpose-coco-keypoints-card")
				: null;
			if (keypointsCard) {
				let headline = keypointsCard.querySelector(".openpose-coco-empty-headline");
				if (!headline) {
					headline = document.createElement("div");
					headline.className = "openpose-coco-empty-headline";
					const insertTarget = this.cocoKeypointsLabel || this.cocoKeypointsList;
					keypointsCard.insertBefore(headline, insertTarget);
				}
				headline.textContent = `${t("pose_editor.empty.headline")} \u{1F938}`;
				headline.style.color = "var(--openpose-text)";
				headline.style.fontFamily = "Arial, sans-serif";
				headline.style.fontSize = "13px";
				headline.style.fontWeight = "600";
				headline.style.padding = "4px 6px";
				headline.style.margin = "0 0 10px 0";
				headline.style.textAlign = "left";
				headline.style.display = "block";
			}
			if (this.cocoKeypointsLabel) {
				this.cocoKeypointsLabel.textContent = t("pose_editor.help.getting_started_label");
				this.cocoKeypointsLabel.style.display = "block";
				this.cocoKeypointsLabel.classList.add("openpose-coco-empty-section-label");
				applyEmptySectionLabelStyles(this.cocoKeypointsLabel);
			}
			const moduleManager = this.moduleManager;
			const emptyActions = moduleManager?.getEmptyActions?.() || [];
			const emptyActionsHtml = emptyActions
				.map((action) => {
					const icon = action.icon || "";
					const text = action.text || "";
					if (!text) {
						return "";
					}
					return `
    <div class="openpose-coco-keypoint-item openpose-sidebar-item">
        ${icon}
        <div class="openpose-sidebar-text">
            <span class="openpose-sidebar-title">${text}</span>
        </div>
    </div>`;
				})
				.join("");
			const tabSummaries = moduleManager?.getTabSummaries?.() || [];
			const tabRowsHtml = tabSummaries
				.map((summary) => {
					const icon = summary.icon || "";
					const title = summary.title || "";
					const description = summary.description || "";
					if (!title) {
						return "";
					}
					return `
    <div class="openpose-coco-keypoint-item openpose-coco-empty-tab-row openpose-sidebar-item" data-module-tab="${summary.id || ""}">
        ${icon}
        <div class="openpose-sidebar-text">
            <span class="openpose-sidebar-title">${title}</span>
            <div class="openpose-sidebar-desc">${description}</div>
        </div>
    </div>`;
				})
				.join("");
			const tabsSectionHtml = tabRowsHtml
				? `
    <div class="openpose-coco-empty-section-spacer"></div>
${tabRowsHtml}`
				: "";
			this.cocoKeypointsList.innerHTML = `
<div class="openpose-coco-empty-list openpose-muted-icons">
    <div class="openpose-coco-keypoint-item openpose-sidebar-item">
        ${UiIcons.svg('plus', { size: 14, className: 'openpose-sidebar-icon' })}
        <div class="openpose-sidebar-text">
            <span class="openpose-sidebar-title">${t("pose_editor.empty.action_insert_preset")}</span>
        </div>
    </div>
${emptyActionsHtml}
    <div class="openpose-coco-keypoint-item openpose-sidebar-item">
        ${UiIcons.svg('fileJson', { size: 14, className: 'openpose-sidebar-icon' })}
        <div class="openpose-sidebar-text">
            <span class="openpose-sidebar-title">${t("pose_editor.empty.action_load_json")}</span>
        </div>
    </div>
${tabsSectionHtml}
</div>
`;
			this.cocoKeypointsList.style.display = "flex";
			this.cocoKeypointsList.style.flexDirection = "column";
			this.cocoKeypointsList.style.gap = "0";
			this.cocoKeypointsList.style.flex = "1 1 auto";
			this.cocoKeypointsList.style.minHeight = "0";
			this.cocoKeypointsList.style.overflowY = "hidden";
			this.cocoKeypointsList.style.alignItems = "stretch";
			const emptyList = this.cocoKeypointsList.querySelector(".openpose-coco-empty-list");
			if (emptyList) {
				emptyList.style.display = "flex";
				emptyList.style.flexDirection = "column";
				emptyList.style.gap = "2px";
				emptyList.style.flex = "1 1 auto";
				emptyList.style.minHeight = "0";
				emptyList.style.overflowY = "auto";
				emptyList.style.paddingTop = "2px";
			}
			const sectionSpacer = this.cocoKeypointsList.querySelector(".openpose-coco-empty-section-spacer");
			if (sectionSpacer) {
				sectionSpacer.style.height = "0";
				sectionSpacer.style.flexShrink = "0";
				sectionSpacer.style.borderTop = "1px solid var(--openpose-border)";
				sectionSpacer.style.marginTop = "8px";
				sectionSpacer.style.marginBottom = "8px";
				sectionSpacer.style.width = "100%";
			}
			this.cocoKeypointsList.querySelectorAll(".openpose-coco-empty-section-label").forEach((label) => {
				applyEmptySectionLabelStyles(label);
				// Reduce contrast for empty state section headings
				label.style.opacity = "0.65";
			});
			this.cocoKeypointsList.querySelectorAll(".openpose-coco-keypoint-item").forEach((item) => {
				item.style.borderRadius = "4px";
				item.style.boxSizing = "border-box";
				item.style.backgroundColor = "var(--openpose-input-bg)";
				item.style.fontSize = "12px";
				item.style.fontFamily = "Arial, sans-serif";
				item.style.color = "var(--openpose-text-muted)";
				// Slightly reduce contrast for empty state list items
				item.style.opacity = "0.8";
				item.style.minHeight = "20px";
			});
			this.cocoKeypointsList.querySelectorAll(".openpose-sidebar-title").forEach((title) => {
				title.style.fontWeight = "600";
				title.style.color = "var(--openpose-input-text)";
			});
			this.cocoKeypointsList.querySelectorAll(".openpose-sidebar-desc").forEach((desc) => {
				desc.style.fontSize = "11px";
				desc.style.color = "var(--openpose-text-muted)";
				// Make descriptions very subdued (almost background text)
				desc.style.opacity = "0.45";
			});
			return;
		}
		
		// Normal state: show list and title
		this.cocoKeypointsList.style.display = "flex";
		const keypointsCard = this.cocoKeypointsList
			? this.cocoKeypointsList.closest(".openpose-coco-keypoints-card")
			: null;
		if (keypointsCard) {
			const headline = keypointsCard.querySelector(".openpose-coco-empty-headline");
			if (headline) {
				headline.style.display = "none";
			}
		}
		if (this.cocoKeypointsLabel) {
			this.cocoKeypointsLabel.textContent = getKeypointSchemaTitle(this.renderer);
			this.cocoKeypointsLabel.style.display = "block";
			this.cocoKeypointsLabel.classList.remove("openpose-coco-empty-section-label");
			this.cocoKeypointsLabel.style.marginBottom = "8px";
		}
		
		// Extract selected pose keypoints
		let selectedKeypoints = null;
		if (selectedIndex != null && poses[selectedIndex]) {
			selectedKeypoints = poses[selectedIndex].keypoints;
		}
		const canEdit = selectedIndex != null && selectedIndex >= 0;
		const activePose = canEdit
			? poses[selectedIndex]
			: (poses.length > 0 ? poses[0] : null);
		const activeKeypoints = activePose ? activePose.keypoints : null;
		
		       debugLog('[refreshCocoKeypointsList] Debug:', {
			       selectedIndex,
			       selectedKeypoints: selectedKeypoints ? selectedKeypoints.map(kp => kp ? 'present' : 'null') : 'none'
		       });
		
		// Sidebar is disabled ONLY when there are no poses at all
		const isDisabled = noPoses;
		
		// For displaying keypoint presence, use selected pose or fallback to first pose
		const displayKeypoints = selectedKeypoints || (poses.length > 0 ? poses[0].keypoints : []);
		
		// Use stored per-pose formatId; fall back to keypoint-based detection for old data
		let activeFormat = null;
		if (activePose) {
			activeFormat = getFormat(activePose.formatId) || getFormatForPose(activePose.keypoints);
		} else if (poses.length > 0) {
			const fallbackPose = poses[0];
			activeFormat = getFormat(fallbackPose.formatId) || getFormatForPose(fallbackPose.keypoints);
		} else {
			activeFormat = getFormatForPose([]);
		}

		this.cocoKeypointsList.innerHTML = "";

		// Apply list container styles
		this.cocoKeypointsList.style.display = "flex";
		this.cocoKeypointsList.style.flexDirection = "column";
		this.cocoKeypointsList.style.gap = "2px";
		this.cocoKeypointsList.style.flex = "1 1 auto";
		this.cocoKeypointsList.style.overflowY = "auto";

		// Create list items from active format keypoints (skip non-present/null entries)
		const formatKeypoints = Array.isArray(activeFormat?.keypoints) ? activeFormat.keypoints : COCO_KEYPOINTS;
		const presentIndexSet = activeFormat?.presentIndices instanceof Set
			? activeFormat.presentIndices
			: new Set(Array.from({ length: formatKeypoints.length }, (_, i) => i));
		const skeletonEdges = Array.isArray(activeFormat?.skeletonEdges) ? activeFormat.skeletonEdges : [];
		const keypointCount = formatKeypoints.length;
		const adjacency = Array.from({ length: keypointCount }, () => []);
		for (const edge of skeletonEdges) {
			if (!Array.isArray(edge) || edge.length < 2) {
				continue;
			}
			const [a, b] = edge;
			if (!Number.isInteger(a) || !Number.isInteger(b)) {
				continue;
			}
			if (a < 0 || b < 0 || a >= keypointCount || b >= keypointCount) {
				continue;
			}
			if (!presentIndexSet.has(a) || !presentIndexSet.has(b)) {
				continue;
			}
			adjacency[a].push(b);
			adjacency[b].push(a);
		}
		const getRemovalRoots = (formatId) => {
			if (formatId === "coco18") {
				return [1];
			}
			if (formatId === "coco17") {
				return [0, 2, 5, 8, 11];
			}
			return [];
		};
		const depth = new Array(keypointCount).fill(null);
		const queue = [];
		const seedRoot = (rootId) => {
			if (rootId == null || rootId < 0 || rootId >= keypointCount) {
				return;
			}
			if (!presentIndexSet.has(rootId)) {
				return;
			}
			if (depth[rootId] != null) {
				return;
			}
			depth[rootId] = 0;
			queue.push(rootId);
		};
		const runBfs = () => {
			while (queue.length > 0) {
				const current = queue.shift();
				const nextDepth = depth[current] + 1;
				for (const neighbor of adjacency[current]) {
					if (depth[neighbor] == null) {
						depth[neighbor] = nextDepth;
						queue.push(neighbor);
					}
				}
			}
		};
		getRemovalRoots(activeFormat?.id).forEach(seedRoot);
		runBfs();
		for (let i = 0; i < keypointCount; i++) {
			if (!presentIndexSet.has(i)) {
				continue;
			}
			if (depth[i] == null) {
				seedRoot(i);
				runBfs();
			}
		}
		const isKeypointRemovable = (keypointId, keypoints) => {
			return !!(keypoints && keypoints[keypointId]);
		};
		const createRemoveControl = () => {
			const control = document.createElement("button");
			control.type = "button";
			control.className = "openpose-coco-remove-control";
			control.textContent = "\u00D7";
			control.style.border = "none";
			control.style.background = "transparent";
			control.style.padding = "0";
			control.style.margin = "0";
			control.style.width = "16px";
			control.style.minWidth = "16px";
			control.style.height = "16px";
			control.style.minHeight = "16px";
			control.style.display = "inline-flex";
			control.style.alignItems = "center";
			control.style.justifyContent = "center";
			control.style.lineHeight = "1";
			control.style.fontSize = "14px";
			control.style.fontFamily = "Arial, sans-serif";
			control.style.color = "var(--openpose-text)";
			control.style.opacity = "0.7";
			control.style.cursor = "pointer";
			control.style.userSelect = "none";
			control.style.flexShrink = "0";
			control.addEventListener("mouseenter", () => {
				if (control.dataset.removeDisabled === "1") {
					return;
				}
				control.style.opacity = "1";
				control.style.color = "var(--openpose-text)";
			});
			control.addEventListener("mouseleave", () => {
				if (control.dataset.removeDisabled === "1") {
					return;
				}
				control.style.opacity = control.dataset.removeBaseOpacity || "0.7";
				control.style.color = "var(--openpose-text)";
			});
			return control;
		};
		
		// Debug: log format info
		debugLog('[refreshCocoKeypointsList] Format:', activeFormat?.id, 'Keypoint count:', formatKeypoints.length, 'presentIndices:', Array.from(presentIndexSet));
		
		for (let i = 0; i < formatKeypoints.length; i++) {
			if (!presentIndexSet.has(i)) {
				debugLog('[refreshCocoKeypointsList] Skipping index', i, '(not in presentIndexSet)');
				continue;
			}
			const keypoint = formatKeypoints[i];
			if (!keypoint) {
				debugLog('[refreshCocoKeypointsList] Skipping index', i, '(keypoint is null)');
				continue;
			}
			// Determine presence
			const keypointId = i;
			const isPresent = !isDisabled && displayKeypoints[keypointId] != null;
			const isMissing = !isDisabled && !isPresent;
			
			// Debug: log when adding rows for indices 16 and 17
			if (i === 16 || i === 17) {
				debugLog('[refreshCocoKeypointsList] Creating row for index', i, 'name:', keypoint.name);
			}

			const item = document.createElement("div");
			item.className = "openpose-coco-keypoint-item";
			item.style.display = "flex";
			item.style.alignItems = "center";
			item.style.justifyContent = "space-between";
			item.style.gap = "6px";
			item.style.padding = "3px 6px";
			item.style.borderRadius = "4px";
			item.style.boxSizing = "border-box";
			item.style.backgroundColor = "var(--openpose-input-bg)";
			item.style.fontSize = "12px";
			item.style.fontFamily = "Arial, sans-serif";
			item.style.color = "var(--openpose-input-text)";
			item.style.minHeight = "20px";
			if (isMissing) {
				item.classList.add("openpose-keypoint-missing");
			}

			// Left container: color swatch + keypoint name
			const leftContent = document.createElement("div");
			leftContent.style.display = "flex";
			leftContent.style.alignItems = "center";
			leftContent.style.gap = "6px";
			leftContent.style.minWidth = "0";
			leftContent.style.flex = "1";

			// Color swatch
			const swatch = document.createElement("span");
			swatch.className = "openpose-coco-color-swatch";
			swatch.style.width = "16px";
			swatch.style.height = "16px";
			swatch.style.borderRadius = "3px";
			swatch.style.flexShrink = "0";
			swatch.style.border = "1px solid var(--openpose-border)";
			swatch.style.backgroundColor = `rgb(${keypoint.rgb.join(", ")})`;

			// Keypoint name
			const name = document.createElement("span");
			name.className = "openpose-coco-keypoint-name";
			name.textContent = keypoint.name || `Keypoint ${keypointId}`;
			name.style.flex = "1";
			name.style.whiteSpace = "nowrap";
			name.style.overflow = "hidden";
			name.style.textOverflow = "ellipsis";
			name.style.transition = "color 0.15s ease";

			leftContent.appendChild(swatch);
			leftContent.appendChild(name);

			// Right container: status indicator
			const statusIcon = document.createElement("span");
			statusIcon.className = "openpose-coco-status-icon openpose-kp-status";
			statusIcon.style.flexShrink = "0";
			statusIcon.style.width = "16px";
			statusIcon.style.minWidth = "16px";
			statusIcon.style.flex = "0 0 16px";
			statusIcon.style.height = "20px";
			statusIcon.style.minHeight = "20px";
			statusIcon.style.display = "flex";
			statusIcon.style.alignItems = "center";
			statusIcon.style.justifyContent = "center";
			statusIcon.style.fontSize = "14px";
			statusIcon.style.fontWeight = "bold";
			statusIcon.style.color = "var(--openpose-text)";
			statusIcon.style.padding = "0";
			statusIcon.style.margin = "0";
			statusIcon.style.lineHeight = "20px";
			statusIcon.style.alignSelf = "center";

			if (isDisabled) {
				statusIcon.textContent = "";
				statusIcon.classList.add("is-disabled");
			} else if (isPresent) {
				statusIcon.textContent = "";
				statusIcon.classList.add("is-present");
			} else {
				statusIcon.textContent = "";
				statusIcon.classList.add("is-missing");
			}

			const rightContent = document.createElement("div");
			rightContent.style.display = "flex";
			rightContent.style.alignItems = "center";
			rightContent.style.gap = "4px";
			rightContent.style.flexShrink = "0";
			rightContent.style.width = "36px";
			rightContent.style.minWidth = "36px";
			rightContent.style.justifyContent = "flex-end";
			rightContent.appendChild(statusIcon);

			if (isPresent) {
				const removeControl = createRemoveControl();
				const keypointLabel = keypoint.name || `Keypoint ${keypointId}`;
				const removable = canEdit && isKeypointRemovable(keypointId, activeKeypoints);
				if (!canEdit) {
					removeControl.dataset.removeDisabled = "1";
					removeControl.dataset.removeBaseOpacity = "0.25";
					removeControl.style.opacity = "0.25";
					removeControl.style.cursor = "not-allowed";
					removeControl.title = "Select a pose to edit.";
				} else {
					removeControl.dataset.removeDisabled = "0";
					removeControl.dataset.removeBaseOpacity = "0.7";
					removeControl.style.opacity = "0.7";
					removeControl.style.cursor = "pointer";
					removeControl.title = `Remove ${keypointLabel}`;
				}
				removeControl.addEventListener("click", (event) => {
					event.stopPropagation();
					const activeIndex = this.renderer ? this.renderer.getSelectedPoseIndex() : null;
					if (activeIndex == null || activeIndex < 0) {
						return;
					}
					const posesNow = this.renderer ? this.renderer.getPoses() : [];
					const pose = posesNow[activeIndex];
					if (!pose || !pose.keypoints || !pose.keypoints[keypointId]) {
						return;
					}
					const didClear = this.renderer.clearKeypoint(activeIndex, keypointId);
					if (didClear) {
						showToast("success", "Pose Editor", `${keypointLabel} ` + t("toast.removed"));
					}
				});
				rightContent.appendChild(removeControl);
			}

			item.appendChild(leftContent);
			item.appendChild(rightContent);

			// Store row elements for style updates
			this.cocoKeypointRowElements.set(keypointId, { item, name, statusIcon });
			if (keypointId === 16 || keypointId === 17) {
				debugLog('[refreshCocoKeypointsList] Stored row for keypointId:', keypointId);
			}

			// Set up interactions only for present keypoints
			if (!isDisabled && isPresent) {
				item.style.cursor = "pointer";
				item.addEventListener("mouseenter", () => {
					this.hoveredKeypointId = keypointId;
					// Highlight keypoint in renderer
					if (this.renderer) {
						this.renderer.setHoveredKeypointId(keypointId);
					}
					this.refreshCocoKeypointRowStyles();
				});
				item.addEventListener("mouseleave", () => {
					this.hoveredKeypointId = null;
					// Clear keypoint highlight in renderer
					if (this.renderer) {
						this.renderer.setHoveredKeypointId(null);
					}
					this.refreshCocoKeypointRowStyles();
				});
			} else if (isMissing) {
				item.style.cursor = "grab";
				item.setAttribute("draggable", "true");
				item.addEventListener("dragstart", (event) => {
					if (!event.dataTransfer) {
						event.preventDefault();
						return;
					}
					item.style.cursor = "grabbing";
					event.dataTransfer.setData(MISSING_KEYPOINT_DRAG_TYPE, `${keypointId}`);
					event.dataTransfer.setData("text/plain", keypoint.name || `Keypoint ${keypointId}`);
					event.dataTransfer.effectAllowed = "copy";
					this._draggingMissingKeypoint = true;
				});
				item.addEventListener("dragend", () => {
					item.style.cursor = "grab";
					this._draggingMissingKeypoint = false;
				});
			} else {
				item.style.cursor = "default";
				item.style.opacity = "0.6";
			}

			this.cocoKeypointsList.appendChild(item);
		}

		const selectedPose = selectedIndex != null && poses[selectedIndex] ? poses[selectedIndex] : null;
		const selectedExtras = {};
		if (selectedPose && Array.isArray(selectedPose.faceKeypoints)) {
			selectedExtras.face_keypoints_2d = selectedPose.faceKeypoints;
		}
		if (selectedPose && Array.isArray(selectedPose.handLeftKeypoints)) {
			selectedExtras.hand_left_keypoints_2d = selectedPose.handLeftKeypoints;
		}
		if (selectedPose && Array.isArray(selectedPose.handRightKeypoints)) {
			selectedExtras.hand_right_keypoints_2d = selectedPose.handRightKeypoints;
		}
		debugLog("[refreshCocoKeypointsList] Selected pose extras keys:", Object.keys(selectedExtras));
		const hasFace = Array.isArray(selectedExtras.face_keypoints_2d) &&
			selectedExtras.face_keypoints_2d.length > 0 &&
			selectedExtras.face_keypoints_2d.some(kp => kp);
		const hasLeftHand = Array.isArray(selectedExtras.hand_left_keypoints_2d) &&
			selectedExtras.hand_left_keypoints_2d.length > 0 &&
			selectedExtras.hand_left_keypoints_2d.some(kp => kp);
		const hasRightHand = Array.isArray(selectedExtras.hand_right_keypoints_2d) &&
			selectedExtras.hand_right_keypoints_2d.length > 0 &&
			selectedExtras.hand_right_keypoints_2d.some(kp => kp);

		const addExtraActionRow = ({ label, emoji, onRemove }) => {
			const item = document.createElement("div");
			item.className = "openpose-coco-keypoint-item";
			item.style.display = "flex";
			item.style.alignItems = "center";
			item.style.justifyContent = "space-between";
			item.style.gap = "6px";
			item.style.padding = "3px 6px";
			item.style.borderRadius = "4px";
			item.style.boxSizing = "border-box";
			item.style.backgroundColor = "var(--openpose-input-bg)";
			item.style.fontSize = "12px";
			item.style.fontFamily = "Arial, sans-serif";
			item.style.color = "var(--openpose-input-text)";
			item.style.minHeight = "20px";
			item.style.cursor = "default";
			item.addEventListener("mouseenter", () => {
				item.style.backgroundColor = "var(--openpose-primary-hover-bg)";
			});
			item.addEventListener("mouseleave", () => {
				item.style.backgroundColor = "var(--openpose-input-bg)";
			});

			const leftContent = document.createElement("div");
			leftContent.style.display = "flex";
			leftContent.style.alignItems = "center";
			leftContent.style.gap = "6px";
			leftContent.style.minWidth = "0";
			leftContent.style.flex = "1";

			const swatch = document.createElement("span");
			swatch.className = "openpose-coco-color-swatch";
			swatch.style.width = "16px";
			swatch.style.height = "16px";
			swatch.style.borderRadius = "3px";
			swatch.style.flexShrink = "0";
			swatch.style.border = "1px solid var(--openpose-border)";
			swatch.style.display = "inline-flex";
			swatch.style.alignItems = "center";
			swatch.style.justifyContent = "center";
			swatch.style.fontSize = "12px";
			swatch.style.lineHeight = "1";
			swatch.style.backgroundColor = "var(--openpose-input-bg)";
			swatch.textContent = emoji;

			const name = document.createElement("span");
			name.className = "openpose-coco-keypoint-name";
			name.textContent = label;
			name.style.flex = "1";
			name.style.whiteSpace = "nowrap";
			name.style.overflow = "hidden";
			name.style.textOverflow = "ellipsis";
			name.style.transition = "color 0.15s ease";

			leftContent.appendChild(swatch);
			leftContent.appendChild(name);

			const rightContent = document.createElement("div");
			rightContent.style.display = "flex";
			rightContent.style.alignItems = "center";
			rightContent.style.gap = "4px";
			rightContent.style.flexShrink = "0";
			rightContent.style.width = "36px";
			rightContent.style.minWidth = "36px";
			rightContent.style.justifyContent = "flex-end";

			const removeControl = createRemoveControl();
			removeControl.dataset.removeDisabled = "0";
			removeControl.dataset.removeBaseOpacity = "0.7";
			removeControl.style.opacity = "0.7";
			removeControl.style.cursor = "pointer";
			removeControl.title = `Remove ${label}`;
			removeControl.addEventListener("click", (event) => {
				event.stopPropagation();
				onRemove();
			});

			item.appendChild(leftContent);
			rightContent.appendChild(removeControl);
			item.appendChild(rightContent);

			this.cocoKeypointsList.appendChild(item);
		};

		if (hasFace) {
			addExtraActionRow({
				label: "Face",
				emoji: "\u{1F642}",
				onRemove: () => {
					const activeIndex = this.renderer ? this.renderer.getSelectedPoseIndex() : null;
					if (activeIndex == null || activeIndex < 0) {
						return;
					}
					const didClear = this.renderer.clearFaceKeypoints(activeIndex);
					if (didClear) {
						showToast("success", "Pose Editor", t("toast.face_removed"));
						this.refreshCocoKeypointsPanel();
					}
				}
			});
		}
		if (hasLeftHand) {
			addExtraActionRow({
				label: "Left hand",
				emoji: "\u270B",
				onRemove: () => {
					const activeIndex = this.renderer ? this.renderer.getSelectedPoseIndex() : null;
					if (activeIndex == null || activeIndex < 0) {
						return;
					}
					const didClear = this.renderer.clearHandLeftKeypoints(activeIndex);
					if (didClear) {
						showToast("success", "Pose Editor", t("toast.left_hand_removed"));
						this.refreshCocoKeypointsPanel();
					}
				}
			});
		}
		if (hasRightHand) {
			addExtraActionRow({
				label: "Right hand",
				emoji: "\u{1F91A}",
				onRemove: () => {
					const activeIndex = this.renderer ? this.renderer.getSelectedPoseIndex() : null;
					if (activeIndex == null || activeIndex < 0) {
						return;
					}
					const didClear = this.renderer.clearHandRightKeypoints(activeIndex);
					if (didClear) {
						showToast("success", "Pose Editor", t("toast.right_hand_removed"));
						this.refreshCocoKeypointsPanel();
					}
				}
			});
		}
		
		// Apply styles to all rows
		this.refreshCocoKeypointRowStyles();
	},

	refreshCocoKeypointRowStyles() {
		// Apply styles to all keypoint rows, respecting hover state
		// Read from renderer (single source of truth)
		const poses = this.renderer ? this.renderer.getPoses() : [];
		const selectedIndex = this.renderer ? this.renderer.getSelectedPoseIndex() : null;
		const canvasHoveredKeypointId = this.renderer ? this.renderer.getCanvasHoveredKeypointId() : null;
		
		// Debug: log canvas hover state
		if (canvasHoveredKeypointId !== null) {
			debugLog('[refreshCocoKeypointRowStyles] Canvas hover ID:', canvasHoveredKeypointId, 'Sidebar row keys:', Array.from(this.cocoKeypointRowElements.keys()));
			if (selectedIndex !== null && poses[selectedIndex]) {
				const selectedKps = poses[selectedIndex].keypoints;
				debugLog('[refreshCocoKeypointRowStyles] Selected pose keypoints length:', selectedKps.length, 'Content:', selectedKps.map((kp, i) => i === 16 || i === 17 ? `[${i}]:${kp ? 'present' : 'null'}` : null).filter(Boolean));
			}
		}
		
		let selectedKeypoints = null;
		if (selectedIndex != null && poses[selectedIndex]) {
			selectedKeypoints = poses[selectedIndex].keypoints;
		}
		
		const noPoses = poses.length === 0;
		// Sidebar is disabled ONLY when there are no poses at all
		const isDisabled = noPoses;
		
		// For displaying keypoint presence, use selected pose or fallback to first pose
		const displayKeypoints = selectedKeypoints || (poses.length > 0 ? poses[0].keypoints : []);
		
		for (const [keypointId, { item, name, statusIcon }] of this.cocoKeypointRowElements) {
			// Debug: detailed logging for indices 16 and 17
			if (keypointId === 16 || keypointId === 17) {
				debugLog(`[refreshCocoKeypointRowStyles] Processing row keypointId=${keypointId}:`, {
					isDisabled,
					selectedKeypointsLength: selectedKeypoints ? selectedKeypoints.length : null,
					isPresent: selectedKeypoints ? selectedKeypoints[keypointId] != null : false,
					canvasHoveredKeypointId
				});
			}
			if (isDisabled) {
				// Neutral state: uniformly dimmed, no hover highlight
				name.style.color = "var(--openpose-input-text)";
				item.style.backgroundColor = "var(--openpose-input-bg)";
				item.style.opacity = "0.5";
				item.classList.add("openpose-keypoint-disabled");
				if (statusIcon) {
					statusIcon.style.color = "var(--openpose-text)";
					statusIcon.style.opacity = "0.7";
					statusIcon.textContent = "";
					statusIcon.classList.remove("is-present", "is-missing");
					statusIcon.classList.add("is-disabled");
				}
				item.classList.remove("openpose-keypoint-missing");
				continue;
			}

			const isPresent = displayKeypoints && displayKeypoints[keypointId] != null;
			const isHovered = keypointId === this.hoveredKeypointId && isPresent;
			// Canvas hover works even if keypoint is not "present" in sidebar, since we're hovering it directly on canvas
			const isCanvasHovered = keypointId === canvasHoveredKeypointId;
			const isMissing = !isPresent;
			if (statusIcon) {
				statusIcon.classList.remove("is-present", "is-missing", "is-disabled");
				if (isMissing) {
					statusIcon.textContent = "";
					statusIcon.classList.add("is-missing");
					statusIcon.style.opacity = "0.7";
				} else {
					statusIcon.textContent = "";
					statusIcon.classList.add("is-present");
					statusIcon.style.opacity = "1";
				}
			}

			// Priority: direct sidebar hover > canvas hover > disabled > missing > normal
			if (isHovered) {
				name.style.color = "var(--openpose-text)";
				item.style.backgroundColor = "var(--openpose-input-bg)";
				item.style.opacity = "1";
				item.classList.remove("openpose-keypoint-disabled");
				if (statusIcon) {
					statusIcon.style.color = "var(--openpose-text)";
				}
				item.classList.remove("openpose-keypoint-missing");
			} else if (isCanvasHovered) {
				// Canvas hover: white text with prominent primary hover background
				name.style.color = "var(--openpose-text)";
				item.style.backgroundColor = "var(--openpose-primary-hover-bg)";
				item.style.opacity = "1";
				item.classList.remove("openpose-keypoint-disabled");
				if (statusIcon) {
					statusIcon.style.color = "var(--openpose-text)";
				}
				item.classList.remove("openpose-keypoint-missing");
			} else if (isMissing) {
				// Missing keypoint - subtle solid background + grip
				name.style.color = "var(--openpose-input-text)";
				item.style.backgroundColor = "var(--openpose-input-bg)";
				item.style.opacity = "1";
				item.classList.remove("openpose-keypoint-disabled");
				if (statusIcon) {
					statusIcon.style.color = "var(--openpose-text)";
				}
				item.classList.add("openpose-keypoint-missing");
			} else {
				// Normal present state
				name.style.color = "var(--openpose-input-text)";
				item.style.backgroundColor = "var(--openpose-input-bg)";
				item.style.opacity = "1";
				item.classList.remove("openpose-keypoint-disabled");
				if (statusIcon) {
					statusIcon.style.color = "var(--openpose-text)";
				}
				item.classList.remove("openpose-keypoint-missing");
			}
		}
	},

	showKeypointHoverRing(keypointId) {
		// Hover ring is now handled by OpenPoseCanvas2D renderer
		if (!this.renderer) {
			return;
		}
		// Renderer displays hover ring visually
	},

	hideKeypointHoverRing() {
		// Hover ring is now handled by OpenPoseCanvas2D renderer
		if (!this.renderer) {
			return;
		}
		// TODO: Implement hover ring cleanup for OpenPoseCanvas2D renderer
	},

	setSidebarControlsDisabled(disabled) {
		const leftSidebar = this.leftSidebar;
		const rightSidebar = this.rightSidebar;

		const updateControlState = (control, enabled) => {
			control.disabled = !enabled;
			control.style.opacity = enabled ? "1" : "0.5";
			if (control.tagName === "BUTTON") {
				control.style.cursor = enabled ? "pointer" : "not-allowed";
			} else {
				control.style.cursor = enabled ? "" : "not-allowed";
			}
		};

		const disableControls = (sidebar, allowedActions = []) => {
			if (!sidebar) {
				return;
			}
			const controls = Array.from(sidebar.querySelectorAll("button, input, select, textarea"));
			controls.forEach((control) => {
				if (control.dataset.sidebarPrevDisabled === undefined) {
					control.dataset.sidebarPrevDisabled = control.disabled ? "1" : "0";
				}
				updateControlState(control, false);
			});
			allowedActions.forEach((action) => {
				const button = sidebar.querySelector(`[data-action="${action}"]`);
				if (!button) {
					return;
				}
				updateControlState(button, true);
			});
		};

		const restoreControls = (sidebar) => {
			if (!sidebar) {
				return;
			}
			const controls = Array.from(sidebar.querySelectorAll("button, input, select, textarea"));
			controls.forEach((control) => {
				if (control.dataset.sidebarPrevDisabled !== undefined) {
					const wasDisabled = control.dataset.sidebarPrevDisabled === "1";
					delete control.dataset.sidebarPrevDisabled;
					updateControlState(control, !wasDisabled);
				} else {
					updateControlState(control, true);
				}
			});
		};

		if (disabled) {
			disableControls(leftSidebar, []);
			disableControls(rightSidebar, []);
		} else {
			restoreControls(leftSidebar);
			restoreControls(rightSidebar);
		}
	},

	recordHistory() {
		if (this.lockMode) {
			return;
		}
		if (this.lockMode || this._initializing) {
		}
		// Store renderer state and selection index
		const state = this.renderer.serialize({ includeExtras: true });
		const selection = this.renderer.getSelectedPoseIndex();
		const keypointEdits = this.renderer.hasKeypointEdits ? this.renderer.hasKeypointEdits() : false;
		const snapshot = JSON.stringify({ state, selection, keypointEdits });
		const last = this.undo_history[this.undo_history.length - 1];
		if (snapshot === last) {
			return;
		}
		this.undo_history.push(snapshot);
		this.redo_history.length = 0;
		this.updateUndoButton();
	},

	onRendererChange(reason) {
		if (this._initializing) return;
		// Renderer emits change reasons: 'geometry', 'add', 'delete', 'select', 'clear', 'extras'
		// Only record history on completed interactions (not during drag/move)
		if (reason === 'geometry' || reason === 'add' || reason === 'delete' || reason === 'clear' || reason === 'extras') {
			// These are finalized state changes (drag completed, pose added/removed, canvas cleared)
			this.recordHistory();
			this.saveToNode();
			this.refreshCocoKeypointsPanel();
			this.updateCanvasBoundsWarning();
		} else if (reason === 'select') {
			// Selection change: update UI but don't record history
			this.updateRemoveState();
			this.refreshCocoKeypointsPanel();
		}
		// All other reasons (if any) are ignored to prevent excessive history recording
	},

	applyHistoryState(snapshot, selectionIndex = null) {
		if (!snapshot) {
			return;
		}
		this.lockMode = true;
		const error = this.loadJSON(snapshot);
		this.lockMode = false;
		if (error) {
			console.warn("[OpenPose Studio] Failed to restore history state:", error);
			return;
		}
		this.restoreSelection(selectionIndex);
		this.scheduleCanvasFit();
		this.saveToNode();
		this.updateUndoButton();
		this.updateCanvasBoundsWarning();
	},

	updateUndoButton() {
		if (!this.undoButton) {
			return;
		}
		const enabled = this.undo_history.length > 1;
		this.undoButton.disabled = !enabled;
		this.undoButton.style.opacity = enabled ? "1" : "0.5";
		this.undoButton.style.cursor = enabled ? "pointer" : "not-allowed";
		this.undoButton.style.background = enabled
			? "var(--openpose-btn-bg)"
			: "var(--openpose-btn-disabled-bg)";
	},

	undo() {
		if (this.undo_history.length <= 1) {
			return;
		}
		const current = this.undo_history.pop();
		this.redo_history.push(current);
		const previous = this.undo_history[this.undo_history.length - 1];
		// Restore renderer state and selection
		try {
			const { state, selection, keypointEdits } = JSON.parse(previous);
			this.renderer.load(state);
			this.renderer.setSelectedPose(selection);
			if (this.renderer.setKeypointEdits) {
				this.renderer.setKeypointEdits(keypointEdits);
			}
			this.saveToNode();
			this.refreshCocoKeypointsPanel();
			this.updateUndoButton();
			this.updateCanvasBoundsWarning();
		} catch (e) {
			console.warn("[OpenPose Studio] Failed to restore undo state:", e);
		}
	},

	redo() {
		if (this.redo_history.length === 0) {
			return;
		}
		const snapshot = this.redo_history.pop();
		this.undo_history.push(snapshot);
		// Restore renderer state and selection
		try {
			const { state, selection, keypointEdits } = JSON.parse(snapshot);
			this.renderer.load(state);
			this.renderer.setSelectedPose(selection);
			if (this.renderer.setKeypointEdits) {
				this.renderer.setKeypointEdits(keypointEdits);
			}
			this.saveToNode();
			this.refreshCocoKeypointsPanel();
			this.updateUndoButton();
			this.updateCanvasBoundsWarning();
		} catch (e) {
			console.warn("[OpenPose Studio] Failed to restore redo state:", e);
		}
	},

	saveToNode(force = false) {
		// During editing (allowCommitToNode=false), skip writing to node
		// This ensures changes are only persisted on Apply, not during editing
		if (this._initializing || !this.allowCommitToNode) {
			return;
		}

		const json = this.serializeJSON();

		// Use direct property assignment instead of setProperty to avoid
		// errors when node.options is not initialized
		if (!this.node.properties) {
			this.node.properties = {};
		}
		this.node.properties.savedPose = json;

		// Update the pose_json widget directly
		if (this.node.jsonWidget) {
			this.node.jsonWidget.value = json;
		}
		// Update node preview
		if (this.node.updatePreview) {
			this.node.updatePreview();
		}
	},

	load() {
		this.fileInput.value = null;
		this.fileInput.click();
	},

	async onLoad(e) {
		const file = this.fileInput.files[0];
		if (!file) {
			return;
		}
		try {
			const text = await readFileToText(file);
			if (typeof text !== "string" || text.trim().length === 0) {
				showToast("error", "Pose Editor", t("toast.empty_file"));
				return;
			}
			let presetIndex = null;
			let preflightError = null;
			try {
				const parsed = JSON.parse(text);
				const normalized = normalizePresetData(parsed, file.name);
				if (normalized && Array.isArray(normalized.presets) && normalized.presets.length > 1) {
				const poseCount = normalized.presets.length;
				const promptMessage = `Found ${poseCount} poses in this file. Enter the index of the pose you want to load (0–${poseCount - 1}).`;
					const selected = await showPrompt("Select pose index", promptMessage, "0");
					if (selected === null) {
						preflightError = t("toast.pose_selection_canceled");
					} else {
						const selectedIndex = Number(String(selected).trim());
						if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= normalized.presets.length) {
							preflightError = `Invalid pose index "${selected}".`;
						} else {
							presetIndex = selectedIndex;
						}
					}
				}
			} catch (error) {
				// Ignore preflight errors; loadJSON will report parsing issues.
			}
			if (preflightError) {
				showToast("error", t("toast.failed_load_pose_title"), preflightError);
				return;
			}
			const error = await this.loadJSON(text, file.name, { presetIndex });
			if (error != null) {
				showToast("error", t("toast.failed_load_pose_title"), error);
			}
			else {
				this.recordHistory();
				this.saveToNode();
				// Refresh COCO keypoints panel after loading
				this.refreshCocoKeypointsPanel();
			}
		} catch (err) {
			showToast("error", "Pose Editor", t("toast.failed_read_file"));
		}
	},

	shouldPreserveExtraKeypoints() {
		if (!this.renderer) return false;
		const poses = this.renderer.getPoses();
		if (!Array.isArray(poses) || poses.length === 0) return false;
		return poses.some(p =>
			(Array.isArray(p.faceKeypoints) && p.faceKeypoints.length > 0) ||
			(Array.isArray(p.handLeftKeypoints) && p.handLeftKeypoints.length > 0) ||
			(Array.isArray(p.handRightKeypoints) && p.handRightKeypoints.length > 0)
		);
	},

	buildOpenPosePayload(includeExtras) {
		if (!this.renderer) {
			return { canvas_width: this.canvasWidth, canvas_height: this.canvasHeight, people: [] };
		}
		const state = this.renderer.serialize({ includeExtras: true });
		const width = Number(state.width) || this.canvasWidth || DEFAULT_CANVAS_WIDTH;
		const height = Number(state.height) || this.canvasHeight || DEFAULT_CANVAS_HEIGHT;
		const poseGroups = Array.isArray(state.keypoints) ? state.keypoints : [];
		const faceGroups = Array.isArray(state.face_keypoints_2d) ? state.face_keypoints_2d : [];
		const handLeftGroups = Array.isArray(state.hand_left_keypoints_2d) ? state.hand_left_keypoints_2d : [];
		const handRightGroups = Array.isArray(state.hand_right_keypoints_2d) ? state.hand_right_keypoints_2d : [];
		const FACE_KEYPOINT_COUNT = 70;
		const HAND_KEYPOINT_COUNT = 21;
		const DEFAULT_SCORE = 1;

		const hasNonZeroCoords = (group) => {
			return Array.isArray(group) && group.length > 0;
		};

		const flattenKeypoints = (group, count) => {
			const total = Number.isFinite(count) && count > 0 ? count : 0;
			const output = new Array(total * 3).fill(0);
			if (!Array.isArray(group)) {
				return output;
			}
			const max = Math.min(group.length, total);
			for (let i = 0; i < max; i++) {
				const point = group[i];
				let x = null;
				let y = null;
				if (Array.isArray(point) && point.length >= 2) {
					x = Number(point[0]);
					y = Number(point[1]);
				} else if (point && typeof point === "object") {
					x = Number(point.x);
					y = Number(point.y);
				}
				const hasCoords = Number.isFinite(x) && Number.isFinite(y);
				const baseIndex = i * 3;
				output[baseIndex] = hasCoords ? x : 0;
				output[baseIndex + 1] = hasCoords ? y : 0;
				output[baseIndex + 2] = hasCoords ? DEFAULT_SCORE : 0;
			}
			return output;
		};

		const people = poseGroups.map((poseKeypoints, index) => {
			const bodyCount = Array.isArray(poseKeypoints) && poseKeypoints.length > 0 ? poseKeypoints.length : 18;
			const poseFlat = flattenKeypoints(poseKeypoints, bodyCount);
			const person = {
				pose_keypoints_2d: poseFlat
			};
			if (includeExtras && hasNonZeroCoords(faceGroups[index])) {
				person.face_keypoints_2d = flattenKeypoints(faceGroups[index], FACE_KEYPOINT_COUNT);
			}
			if (includeExtras && hasNonZeroCoords(handLeftGroups[index])) {
				person.hand_left_keypoints_2d = flattenKeypoints(handLeftGroups[index], HAND_KEYPOINT_COUNT);
			}
			if (includeExtras && hasNonZeroCoords(handRightGroups[index])) {
				person.hand_right_keypoints_2d = flattenKeypoints(handRightGroups[index], HAND_KEYPOINT_COUNT);
			}
			return person;
		});

		return {
			canvas_width: width,
			canvas_height: height,
			people
		};
	},

	serializeJSON() {
		// Use renderer as single source of truth
		const includeExtras = typeof this.shouldPreserveExtraKeypoints === "function"
			? this.shouldPreserveExtraKeypoints() : false;
		const payload = this.buildOpenPosePayload(includeExtras);
		return JSON.stringify(payload);
	},

	save() {
		// Use renderer as single source of truth
		const includeExtras = typeof this.shouldPreserveExtraKeypoints === "function"
			? this.shouldPreserveExtraKeypoints() : false;
		const json = JSON.stringify(this.buildOpenPosePayload(includeExtras));
		this.node.properties.savedPose = json;
		const blob = new Blob([json], { type: "application/json" });
		var filename = "pose-" + Date.now().toString() + ".json";
		var a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = filename;
		a.click();
		URL.revokeObjectURL(a.href);
	},

	loadJSON(text, filename = "", options = {}) {
		const { silent = false, presetIndex = null } = options;
		this._initializing = true;
		let json;
		try {
			json = JSON.parse(text);
		} catch (error) {
			return "JSON parse error: " + error.message;
		}

		const hasEditorKeypoints = json && typeof json === "object" && ("keypoints" in json || "width" in json || "height" in json);
		if (hasEditorKeypoints) {
			const width = Number(json["width"]);
			const height = Number(json["height"]);
			if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
				return "Invalid canvas dimensions in pose file (width and height must be positive numbers).";
			}
		}

		const normalized = normalizePresetData(json, filename);
		if (!normalized || !Array.isArray(normalized.presets) || normalized.presets.length === 0) {
			return "No valid poses found in file. Check file format and ensure it contains keypoint data.";
		}
		let preset = normalized.presets[0];
		if (normalized.presets.length > 1) {
			let selectedIndex = 0;
			if (Number.isInteger(presetIndex)) {
				if (presetIndex < 0 || presetIndex >= normalized.presets.length) {
					return `Invalid pose index "${presetIndex}".`;
				}
				selectedIndex = presetIndex;
			}
			preset = normalized.presets[selectedIndex];
		}
		const keypoints = Array.isArray(preset?.keypoints) ? preset.keypoints : [];
		const faceKeypoints = Array.isArray(preset?.faceKeypoints) ? preset.faceKeypoints : null;
		const handLeftKeypoints = Array.isArray(preset?.handLeftKeypoints) ? preset.handLeftKeypoints : null;
		const handRightKeypoints = Array.isArray(preset?.handRightKeypoints) ? preset.handRightKeypoints : null;
		
		// Detect format and get keypoint count
		const detectedFormat = getFormatForPose(keypoints);
		const kpCount = detectedFormat && detectedFormat.keypoints ? detectedFormat.keypoints.length : 18;
		
		if (keypoints.length < kpCount) {
			return "Pose has insufficient keypoints. Expected " + kpCount + " but got " + keypoints.length + ".";
		}
		if (detectedFormat && !isFormatEditAllowed(detectedFormat.id)) {
			showToast("warn", "Pose Editor", t(`toast.${detectedFormat.id}_edit_disabled`), 7000);
			return `Editing ${detectedFormat.displayName} poses is not allowed in this extension.`;
		}
		const baseWidth = Number(preset.canvas_width) || Number(preset.width) || Number(normalized.baseWidth);
		const baseHeight = Number(preset.canvas_height) || Number(preset.height) || Number(normalized.baseHeight);
		if (!Number.isFinite(baseWidth) || !Number.isFinite(baseHeight) || baseWidth <= 0 || baseHeight <= 0) {
			return "Invalid or missing canvas dimensions in pose file.";
		}

		this.resizeCanvas(baseWidth, baseHeight)
		this.resetCanvas();

		let loadedCount = 0;
		let personIndex = 0;
		for (let i = 0; i < keypoints.length; i += kpCount) {
			const group = keypoints.slice(i, i + kpCount);
			const faceGroup = Array.isArray(faceKeypoints) ? faceKeypoints[personIndex] : null;
			const handLeftGroup = Array.isArray(handLeftKeypoints) ? handLeftKeypoints[personIndex] : null;
			const handRightGroup = Array.isArray(handRightKeypoints) ? handRightKeypoints[personIndex] : null;
			personIndex += 1;
			if (group.length < kpCount) {
				continue;
			}
			if (!group.some(point => isValidKeypoint(point))) {
				continue;
			}
			this.addPose(group, faceGroup, handLeftGroup, handRightGroup)
			loadedCount += 1;
		}

		if (loadedCount === 0) {
			return "No valid poses could be loaded from the file. Check if keypoint data is valid.";
		}

		// Trigger redraw after loading all poses
		this.renderer.requestRedraw();
		debugLog('[OpenPose Studio] JSON loaded. Total poses:', this.renderer.getPoses().length);
		this.scheduleCanvasFit();
		// Refresh COCO keypoints panel to show the loaded pose format
		this.refreshCocoKeypointsPanel();
		// After initial load, set baseline history and enable undo
		const state = this.renderer.serialize({ includeExtras: true });
		const selection = this.renderer.getSelectedPoseIndex();
		const keypointEdits = this.renderer.hasKeypointEdits ? this.renderer.hasKeypointEdits() : false;
		const snapshot = JSON.stringify({ state, selection, keypointEdits });
		this.undo_history = [snapshot];
		this.redo_history = [];
		this.updateUndoButton();
		this._initializing = false;
		this.updateCanvasBoundsWarning();
		// Show success feedback only if not silent
		if (!silent) {
			const fmtName = detectedFormat && detectedFormat.displayName ? detectedFormat.displayName : "Pose";
			const hasExtras = (Array.isArray(faceKeypoints) && faceKeypoints.length > 0) ||
				(Array.isArray(handLeftKeypoints) && handLeftKeypoints.length > 0) ||
				(Array.isArray(handRightKeypoints) && handRightKeypoints.length > 0);
			const msg = hasExtras 
				? t("toast.pose_added_with_note", { formatName: fmtName })
				: t("toast.pose_added", { formatName: fmtName });
			showToast("success", "Pose Editor", msg);
		}
		return null;
	},

	setBackgroundControlsEnabled(enabled) {
		const updateControl = (control) => {
			if (!control) {
				return;
			}
			control.disabled = !enabled;
			control.style.opacity = enabled ? "1" : "0.5";
			control.style.cursor = enabled ? "" : "not-allowed";
			if (control.dataset.sidebarPrevDisabled !== undefined) {
				control.dataset.sidebarPrevDisabled = enabled ? "0" : "1";
			}
		};
		updateControl(this.bgModeSelect);
		updateControl(this.opacitySlider);
	},

	onLoadBackground(e) {
		const file = this.bgFileInput.files[0];
		if (!file) {
			return;
		}

		const reader = new FileReader();
		reader.onload = (event) => {
			const dataUrl = event.target.result;
			if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
				showToast("error", "OpenPose Studio", t("toast.invalid_bg_image"));
				return;
			}
			this.updateSessionBackground({
				dataUrl,
				mode: this.backgroundMode,
				opacity: this.backgroundOpacity
			});

			const img = new Image();
			img.onload = () => {
				this.backgroundImage = img;
				this.setBackgroundControlsEnabled(true);
				this.applyBackground();
			};
			img.src = dataUrl;
		};
		reader.readAsDataURL(file);
	},

	updateSessionBackground(patch) {
		const next = { ...(this.getSessionBackground() || {}), ...patch };
		const mode = normalizeBackgroundMode(next.mode);
		const opacity = normalizeBackgroundOpacity(next.opacity);
		const hasDataUrl = typeof next.dataUrl === "string" && next.dataUrl.startsWith("data:image/");

		if (Object.prototype.hasOwnProperty.call(patch || {}, "dataUrl")) {
			if (hasDataUrl) {
				const stored = setPersistedSetting(POSE_BG_DATA_URL_KEY, next.dataUrl);
				if (!stored) {
					removePersistedSetting(POSE_BG_DATA_URL_KEY);
					showToast("warn", "Pose Editor", t("toast.bg_too_large"));
				}
			} else {
				removePersistedSetting(POSE_BG_DATA_URL_KEY);
			}
		}
		if (Object.prototype.hasOwnProperty.call(patch || {}, "mode")) {
			setPersistedSetting(POSE_BG_MODE_KEY, mode);
		}
		if (Object.prototype.hasOwnProperty.call(patch || {}, "opacity")) {
			setPersistedSetting(POSE_BG_OPACITY_KEY, `${opacity}`);
		}
	},

	getSessionBackground() {
		const dataUrl = getPersistedSetting(POSE_BG_DATA_URL_KEY, null);
		const modeRaw = getPersistedSetting(POSE_BG_MODE_KEY, DEFAULT_BG_MODE);
		const opacityRaw = getPersistedSetting(POSE_BG_OPACITY_KEY, DEFAULT_BG_OPACITY);
		return {
			dataUrl: (typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) ? dataUrl : null,
			mode: normalizeBackgroundMode(modeRaw),
			opacity: normalizeBackgroundOpacity(opacityRaw)
		};
	},

	restoreSessionBackground() {
		const session = this.getSessionBackground();
		if (!session || !session.dataUrl) {
			return;
		}
		this.backgroundMode = session.mode || DEFAULT_BG_MODE;
		this.backgroundOpacity = typeof session.opacity === "number" ? session.opacity : DEFAULT_BG_OPACITY;
		if (this.bgModeSelect) {
			this.bgModeSelect.value = this.backgroundMode;
		}
		if (this.opacitySlider) {
			const pct = Math.round(this.backgroundOpacity * 100);
			this.opacitySlider.value = `${pct}`;
			if (this.opacityValue) {
				this.opacityValue.textContent = `${pct}%`;
			}
		}
		const img = new Image();
		img.onload = () => {
			this.backgroundImage = img;
			this.setBackgroundControlsEnabled(true);
			this.applyBackground();
		};
		img.src = session.dataUrl;
	},

	applyBackground() {
		if (!this.backgroundImage || !this.renderer) {
			return;
		}

		// Pass background image to renderer with mode and opacity
		this.renderer.setBackground(this.backgroundImage, this.backgroundMode, this.backgroundOpacity);
		this.renderer.requestRedraw();
	},

	applyCanvasBoundsWarningStyles(banner) {
		if (!banner) return;
		
		// Banner container
		banner.style.display = "none"; // Hidden by default
		banner.style.marginTop = "8px";
		banner.style.flexShrink = "0";
		
		// Content wrapper - match pose merger warning style
		const content = banner.querySelector(".openpose-canvas-bounds-warning-content");
		if (content) {
			content.style.display = "flex";
			content.style.alignItems = "flex-start";
			content.style.gap = "12px";
			content.style.padding = "12px 16px";
			content.style.borderRadius = "6px";
			content.style.backgroundColor = "rgba(244, 173, 62, 0.14)";
			content.style.border = "1px solid rgba(244, 173, 62, 0.40)";
			content.style.backdropFilter = "blur(2px)";
			content.style.webkitBackdropFilter = "blur(2px)";
			content.style.boxShadow = "0 6px 18px rgba(0,0,0,0.35)";
			content.style.boxSizing = "border-box";
			content.style.width = "100%";
		}
		
		// Icon
		const icon = banner.querySelector(".openpose-canvas-bounds-warning-icon");
		if (icon) {
			icon.style.fontSize = "18px";
			icon.style.lineHeight = "1.5";
			icon.style.color = "#fff";
			icon.style.flexShrink = "0";
			icon.style.display = "flex";
			icon.style.alignItems = "center";
			icon.style.justifyContent = "center";
		}
		
		// Text container
		const textDiv = banner.querySelector(".openpose-canvas-bounds-warning-text");
		if (textDiv) {
			textDiv.style.color = "#fff";
			textDiv.style.fontSize = "13px";
			textDiv.style.lineHeight = "1.5";
			textDiv.style.margin = "0";
			textDiv.style.flex = "1";
			textDiv.style.wordBreak = "break-word";
			textDiv.style.overflowWrap = "break-word";
		}
		
		// Message paragraph
		const message = banner.querySelector(".openpose-canvas-bounds-warning-message");
		if (message) {
			message.style.margin = "0";
			message.style.padding = "0";
			message.style.color = "#fff";
			message.style.fontSize = "13px";
			message.style.lineHeight = "1.5";
		}
	},

	updateCanvasBoundsWarning() {
		const poses = this.renderer ? this.renderer.getPoses() : [];
		if (!this._canvasBoundsPoseLogged && poses.length > 0) {
			debugLog("[OpenPose Studio] Canvas bounds sample pose:", poses[0]);
			this._canvasBoundsPoseLogged = true;
		}
		const boundsCheck = isAnyKeypointOutOfBounds(poses, this.canvasWidth, this.canvasHeight);
		
		if (this.canvasBoundsWarningBanner) {
			if (boundsCheck.outOfBounds) {
				this.canvasBoundsWarningBanner.style.display = "block";
				const message = this.canvasBoundsWarningBanner.querySelector(".openpose-canvas-bounds-warning-message");
				if (message && boundsCheck.count > 0) {
					message.textContent = `Canvas size is too small: ${boundsCheck.count} keypoint${boundsCheck.count !== 1 ? 's are' : ' is'} outside the canvas. Increase width/height or reposition poses.`;
				}
			} else {
				this.canvasBoundsWarningBanner.style.display = "none";
			}
		}

		return boundsCheck;
	},

	clearBackground() {
		this.backgroundImage = null;
		this.setBackgroundControlsEnabled(false);
		removePersistedSetting(POSE_BG_DATA_URL_KEY);
		removePersistedSetting(POSE_BG_MODE_KEY);
		removePersistedSetting(POSE_BG_OPACITY_KEY);
		// Clear background from renderer
		if (this.renderer) {
			this.renderer.setBackground(null, DEFAULT_BG_MODE, DEFAULT_BG_OPACITY);
		}
	}
};

export const poseEditorPresetWorkflow = {
    populatePresetSelect() {
        if (!this.presetSelect) {
            return;
        }
        const previous = this.presetSelect.value;
        this.presetSelect.innerHTML = "";
        const groupMap = new Map();
        for (const preset of this.presets) {
            const groupName = preset.group || "";
            let container = this.presetSelect;
            if (groupName) {
                if (!groupMap.has(groupName)) {
                    const optgroup = document.createElement("optgroup");
                    optgroup.label = groupName;
                    groupMap.set(groupName, optgroup);
                    this.presetSelect.appendChild(optgroup);
                }
                container = groupMap.get(groupName);
            }
            const option = document.createElement("option");
            option.value = preset.id;

            // Add warning icon if preset has validation error
            // Show the preset's `label` as the visible text (keep id as option value)
            let displayLabel = (preset && preset.label) ? preset.label : this.normalizePoseName(preset.id);
            if (preset.validationError) {
                displayLabel = `\u26A0\uFE0F ${displayLabel}`;
                option.title = `Invalid preset JSON: ${preset.validationError}`;
            }

            option.textContent = displayLabel;
            container.appendChild(option);
        }

        // Add invalid file presets if available
        if (this.emptyPoseFiles && this.emptyPoseFiles.length > 0) {
            if (!groupMap.has("Invalid Files")) {
                const optgroup = document.createElement("optgroup");
                optgroup.label = "Invalid Files";
                groupMap.set("Invalid Files", optgroup);
                this.presetSelect.appendChild(optgroup);
            }
            const invalidGroup = groupMap.get("Invalid Files");
            for (const { filename, reason } of this.emptyPoseFiles) {
                const option = document.createElement("option");
                option.value = `invalid:${filename}`;
                option.textContent = `\u26A0\uFE0F ${filename}`;
                option.title = `Invalid preset JSON: ${reason}`;
                invalidGroup.appendChild(option);
            }
        }

        if (previous && this.presetSelect.options.length > 0) {
            // Check if previous value still exists
            let found = false;
            for (const opt of this.presetSelect.options) {
                if (opt.value === previous) {
                    found = true;
                    break;
                }
            }
            if (found) {
                this.presetSelect.value = previous;
            } else {
                this.presetSelect.value = this.presets[0]?.id || "";
            }
        } else {
            this.presetSelect.value = this.presets[0]?.id || "";
        }
        this.renderPresetPreview(this.presetSelect.value);
    },

    showPresetsLoadingState() {
        if (!this.presetSelect) {
            return;
        }
        // Disable the selector and show "Loading..." placeholder
        this.presetSelect.disabled = true;
        this.presetSelect.innerHTML = "";
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Loading...";
        option.selected = true;
        option.disabled = true;
        this.presetSelect.appendChild(option);
    },

    stepPreset(direction) {
        if (!this.presetSelect) {
            return;
        }
        const options = this.presetSelect.options;
        if (!options || options.length === 0) {
            return;
        }
        let nextIndex = this.presetSelect.selectedIndex;
        if (nextIndex < 0) {
            nextIndex = 0;
        }
        nextIndex += direction;
        if (nextIndex < 0) {
            nextIndex = 0;
        } else if (nextIndex >= options.length) {
            nextIndex = options.length - 1;
        }
        if (nextIndex === this.presetSelect.selectedIndex) {
            return;
        }
        this.presetSelect.selectedIndex = nextIndex;
        this.presetSelect.dispatchEvent(new Event("change", { bubbles: true }));
    },

    getPresetSourceId(preset) {
        if (!preset?.id || typeof preset.id !== "string") {
            return "Default";
        }
        // Derive grouping from the filename embedded in the preset ID
        // so that a root file (e.g. "wariza.json") and a same-named
        // directory (e.g. "wariza/") always produce distinct keys.
        const splitIndex = preset.id.indexOf(":");
        if (splitIndex !== -1) {
            const filename = preset.id.slice(0, splitIndex);
            const slashIdx = filename.lastIndexOf("/");
            if (slashIdx !== -1) {
                // Subdirectory file: group by directory path
                return filename.slice(0, slashIdx);
            }
            // Root file: group by full filename (includes .json)
            return filename;
        }
        if (preset.group) {
            return `group:${preset.group}`;
        }
        return "Default";
    },

    renderPresetThumbnail(canvas, keypoints, baseWidth, baseHeight) {
        if (!canvas || !keypoints) {
            return;
        }

        // Detect format and get keypoint count
        const detectedFormat = getFormatForPose(keypoints);
        const kpCount = detectedFormat && detectedFormat.keypoints ? detectedFormat.keypoints.length : 18;

        if (keypoints.length < kpCount) {
            return;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return;
        }
        const width = canvas.width;
        const height = canvas.height;
        const padding = 10;

        ctx.clearRect(0, 0, width, height);
        const previewSurface = this.getPreviewSurfaceFill();
        if (previewSurface) {
            ctx.fillStyle = previewSurface;
            ctx.fillRect(0, 0, width, height);
        }

        // Use preset canvas dimensions when available to center correctly
        const standardCanvasWidth = Number(baseWidth) || this.presetBaseWidth || 512;
        const standardCanvasHeight = Number(baseHeight) || this.presetBaseHeight || 768;

        // Calculate scale to fit entire standard canvas into thumbnail with padding
        const scale = Math.min(
            (width - padding * 2) / standardCanvasWidth,
            (height - padding * 2) / standardCanvasHeight
        );

        // Center the scaled standard canvas in the thumbnail
        const offsetX = (width - standardCanvasWidth * scale) / 2;
        const offsetY = (height - standardCanvasHeight * scale) / 2;

        const lineWidth = Math.max(1, 4 * scale);
        const radius = Math.max(2, 3 * scale);

        for (let i = 0; i < keypoints.length; i += kpCount) {
            const person = keypoints.slice(i, i + kpCount);
            if (person.length < kpCount) continue;

            // Use detected format for rendering
            const personEdges = detectedFormat.skeletonEdges;
            const personColors = detectedFormat.skeletonColors;
            const keypointColors = Array.isArray(detectedFormat?.keypointColors) ? detectedFormat.keypointColors : null;
            const formatKeypoints = Array.isArray(detectedFormat?.keypoints) ? detectedFormat.keypoints : null;

            for (let j = 0; j < personEdges.length; j++) {
                const [a, b] = personEdges[j];
                const pa = person[a];
                const pb = person[b];
                if (!isValidKeypoint(pa) || !isValidKeypoint(pb)) continue;

                const strokeColor = `rgba(${personColors[j].join(", ")}, 0.7)`;
                drawBoneWithOutline(
                    ctx,
                    pa[0] * scale + offsetX,
                    pa[1] * scale + offsetY,
                    pb[0] * scale + offsetX,
                    pb[1] * scale + offsetY,
                    strokeColor,
                    lineWidth
                );
            }

            for (let j = 0; j < person.length; j++) {
                const p = person[j];
                if (!isValidKeypoint(p)) continue;
                const kpColor = (keypointColors && keypointColors[j])
                    || (formatKeypoints && formatKeypoints[j] && formatKeypoints[j].rgb)
                    || [255, 255, 255];
                const fillColor = `rgb(${kpColor.join(", ")})`;
                drawKeypointWithOutline(
                    ctx,
                    p[0] * scale + offsetX,
                    p[1] * scale + offsetY,
                    fillColor,
                    radius
                );
            }
        }
    },

    getPresetKeypoints(presetId) {
        const preset = this.presets.find(item => item.id === presetId) || this.presets[0];
        if (!preset) {
            return cloneKeypoints(DEFAULT_POSE_COCO18.keypoints);
        }
        const baseWidth = Number(preset.canvas_width) || Number(preset.width) || this.presetBaseWidth;
        const baseHeight = Number(preset.canvas_height) || Number(preset.height) || this.presetBaseHeight;
        return scaleKeypointsToCanvas(
            preset.keypoints,
            baseWidth,
            baseHeight,
            this.canvasWidth,
            this.canvasHeight
        );
    },

    getPresetFaceKeypoints(presetId) {
        const preset = this.presets.find(item => item.id === presetId) || this.presets[0];
        if (!preset || !Array.isArray(preset.faceKeypoints)) {
            return null;
        }
        const baseWidth = Number(preset.canvas_width) || Number(preset.width) || this.presetBaseWidth;
        const baseHeight = Number(preset.canvas_height) || Number(preset.height) || this.presetBaseHeight;
        return preset.faceKeypoints.map((group) => (
            Array.isArray(group)
                ? scaleKeypointsToCanvas(
                    group,
                    baseWidth,
                    baseHeight,
                    this.canvasWidth,
                    this.canvasHeight
                )
                : null
        ));
    },

    getPresetHandKeypoints(presetId) {
        const preset = this.presets.find(item => item.id === presetId) || this.presets[0];
        if (!preset) {
            return { left: null, right: null };
        }
        const baseWidth = Number(preset.canvas_width) || Number(preset.width) || this.presetBaseWidth;
        const baseHeight = Number(preset.canvas_height) || Number(preset.height) || this.presetBaseHeight;
        const handLeftKeypoints = Array.isArray(preset.handLeftKeypoints)
            ? preset.handLeftKeypoints.map((group) => (
                Array.isArray(group)
                    ? scaleKeypointsToCanvas(
                        group,
                        baseWidth,
                        baseHeight,
                        this.canvasWidth,
                        this.canvasHeight
                    )
                    : null
            ))
            : null;
        const handRightKeypoints = Array.isArray(preset.handRightKeypoints)
            ? preset.handRightKeypoints.map((group) => (
                Array.isArray(group)
                    ? scaleKeypointsToCanvas(
                        group,
                        baseWidth,
                        baseHeight,
                        this.canvasWidth,
                        this.canvasHeight
                    )
                    : null
            ))
            : null;
        return { left: handLeftKeypoints, right: handRightKeypoints };
    },

    getPresetResolution(presetId) {
        const preset = this.presets.find(item => item.id === presetId) || this.presets[0];
        const width = Number(preset?.canvas_width) || Number(preset?.width) || this.presetBaseWidth || DEFAULT_CANVAS_WIDTH;
        const height = Number(preset?.canvas_height) || Number(preset?.height) || this.presetBaseHeight || DEFAULT_CANVAS_HEIGHT;
        return { width, height };
    },

    updatePresetPreviewSize(presetId) {
        if (!this.previewCanvas) {
            return;
        }
        const cssWidth = Math.max(
            120,
            Math.round(this.previewFrame?.clientWidth || this.previewCanvas.clientWidth || 180)
        );
        let cssHeight = Math.round(this.previewFrame?.clientHeight || 0);
        if (!cssHeight) {
            const { width, height } = this.getPresetResolution(presetId);
            const ratio = width > 0 ? height / width : 1;
            cssHeight = Math.max(60, Math.round(cssWidth * ratio));
        }

        if (this.previewCanvas.width !== cssWidth || this.previewCanvas.height !== cssHeight) {
            this.previewCanvas.width = cssWidth;
            this.previewCanvas.height = cssHeight;
        }
        if (!this.previewFrame) {
            this.previewCanvas.style.height = `${cssHeight}px`;
        }
    },

    renderPresetPreviewInvalid(filename, reason) {
        if (!this.previewCtx || !this.previewCanvas) {
            return;
        }

        const cssWidth = Math.max(
            120,
            Math.round(this.previewFrame?.clientWidth || this.previewCanvas.clientWidth || 180)
        );
        let cssHeight = Math.round(this.previewFrame?.clientHeight || 0);
        if (!cssHeight) {
            cssHeight = cssWidth;
        }

        if (this.previewCanvas.width !== cssWidth || this.previewCanvas.height !== cssHeight) {
            this.previewCanvas.width = cssWidth;
            this.previewCanvas.height = cssHeight;
        }
        if (!this.previewFrame) {
            this.previewCanvas.style.height = `${cssHeight}px`;
        }

        const ctx = this.previewCtx;
        const width = this.previewCanvas.width;
        const height = this.previewCanvas.height;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = this.getPreviewSurfaceFill();
        ctx.fillRect(0, 0, width, height);

        // Draw yellow warning sign centered
        ctx.fillStyle = "#FFD700";
        ctx.font = "bold 80px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("\u26A0\uFE0F", width / 2, height / 2);
    },

    updatePreviewInvalidState(isInvalid) {
        if (!this.previewCanvas) {
            return;
        }
        if (isInvalid) {
            this.previewCanvas.style.cursor = "not-allowed";
        } else {
            this.previewCanvas.style.cursor = "grab";
        }
        this.previewCanvas.style.border = "1px solid var(--openpose-canvas-border)";
        this._presetIsInvalid = isInvalid;
    },

    renderPresetPreviewLoading() {
        if (!this.previewCtx || !this.previewCanvas) {
            return;
        }

        const cssWidth = Math.max(
            120,
            Math.round(this.previewFrame?.clientWidth || this.previewCanvas.clientWidth || 180)
        );
        let cssHeight = Math.round(this.previewFrame?.clientHeight || 0);
        if (!cssHeight) {
            cssHeight = cssWidth;
        }

        if (this.previewCanvas.width !== cssWidth || this.previewCanvas.height !== cssHeight) {
            this.previewCanvas.width = cssWidth;
            this.previewCanvas.height = cssHeight;
        }
        if (!this.previewFrame) {
            this.previewCanvas.style.height = `${cssHeight}px`;
        }

        const ctx = this.previewCtx;
        const width = this.previewCanvas.width;
        const height = this.previewCanvas.height;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = this.getPreviewSurfaceFill();
        ctx.fillRect(0, 0, width, height);

        // Draw centered hourglass icon (same style as invalid-pose warning icon)
        ctx.fillStyle = "#999";
        ctx.font = "bold 80px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("\u231B", width / 2, height / 2);
    },

    renderPresetPreview(presetId) {
        if (!this.previewCtx || !this.previewCanvas) {
            return;
        }
        if (this.presetsLoading) {
            this.renderPresetPreviewLoading();
            this.updatePreviewInvalidState(false);
            return;
        }

        // Handle invalid file presets
        if (presetId && presetId.startsWith("invalid:")) {
            const filename = presetId.slice("invalid:".length);
            const emptyFile = this.emptyPoseFiles?.find(f => f.filename === filename);
            if (emptyFile) {
                this.renderPresetPreviewInvalid(filename, emptyFile.reason);
                this.updatePreviewInvalidState(true);
            }
            return;
        }

        this.updatePreviewInvalidState(false);
        this.updatePresetPreviewSize(presetId);

        const preset = this.presets.find(item => item.id === presetId) || this.presets[0];
        const keypoints = preset ? preset.keypoints : null;

        // Detect format and get keypoint count
        const detectedFormat = getFormatForPose(keypoints || []);
        const kpCount = detectedFormat && detectedFormat.keypoints ? detectedFormat.keypoints.length : 18;

        const ctx = this.previewCtx;
        const width = this.previewCanvas.width;
        const height = this.previewCanvas.height;
        const padding = 10;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = this.getPreviewSurfaceFill();
        ctx.fillRect(0, 0, width, height);

        if (!keypoints || keypoints.length < kpCount) {
            return;
        }

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        for (const point of keypoints) {
            if (!isValidKeypoint(point)) continue;
            minX = Math.min(minX, point[0]);
            maxX = Math.max(maxX, point[0]);
            minY = Math.min(minY, point[1]);
            maxY = Math.max(maxY, point[1]);
        }

        if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
            return;
        }

        const boxWidth = Math.max(1, maxX - minX);
        const boxHeight = Math.max(1, maxY - minY);
        const scale = Math.min(
            (width - padding * 2) / boxWidth,
            (height - padding * 2) / boxHeight
        );
        const offsetX = (width - boxWidth * scale) / 2 - minX * scale;
        const offsetY = (height - boxHeight * scale) / 2 - minY * scale;

        const lineWidth = Math.max(1, 4 * scale);
        const radius = Math.max(2, 3 * scale);

        for (let i = 0; i < keypoints.length; i += kpCount) {
            const person = keypoints.slice(i, i + kpCount);
            if (person.length < kpCount) continue;

            // Use detected format for rendering
            const personEdges = detectedFormat.skeletonEdges;
            const personColors = detectedFormat.skeletonColors;
            const keypointColors = Array.isArray(detectedFormat?.keypointColors) ? detectedFormat.keypointColors : null;
            const formatKeypoints = Array.isArray(detectedFormat?.keypoints) ? detectedFormat.keypoints : null;

            for (let j = 0; j < personEdges.length; j++) {
                const [a, b] = personEdges[j];
                const pa = person[a];
                const pb = person[b];
                if (!isValidKeypoint(pa) || !isValidKeypoint(pb)) continue;

                const strokeColor = `rgba(${personColors[j].join(", ")}, 0.7)`;
                drawBoneWithOutline(
                    ctx,
                    pa[0] * scale + offsetX,
                    pa[1] * scale + offsetY,
                    pb[0] * scale + offsetX,
                    pb[1] * scale + offsetY,
                    strokeColor,
                    lineWidth
                );
            }

            for (let j = 0; j < person.length; j++) {
                const p = person[j];
                if (!isValidKeypoint(p)) continue;
                const kpColor = (keypointColors && keypointColors[j])
                    || (formatKeypoints && formatKeypoints[j] && formatKeypoints[j].rgb)
                    || [255, 255, 255];
                const fillColor = `rgb(${kpColor.join(", ")})`;
                drawKeypointWithOutline(
                    ctx,
                    p[0] * scale + offsetX,
                    p[1] * scale + offsetY,
                    fillColor,
                    radius
                );
            }
        }
    },

    validatePresetData(keypoints, label = "") {
        /**
         * Validate preset keypoint data and return any validation error message.
         * Returns null if valid, or an error string if invalid.
         */
        if (!Array.isArray(keypoints)) {
            return "Invalid keypoints format";
        }

        if (keypoints.length === 0) {
            return "No keypoints found";
        }

        // Detect format to determine expected keypoint count
        const detectedFormat = getFormatForPose(keypoints);
        const kpCount = detectedFormat && detectedFormat.keypoints ? detectedFormat.keypoints.length : 18;

        // Check if keypoints array has valid count
        if (keypoints.length < kpCount) {
            return `Expected at least ${kpCount} keypoints, found ${keypoints.length}`;
        }

        // Check if any valid keypoints exist in each pose group
        let hasValidKeypoints = false;
        for (let i = 0; i < keypoints.length; i += kpCount) {
            const group = keypoints.slice(i, i + kpCount);
            if (group.length < kpCount) {
                continue;
            }
            if (group.some(point => isValidKeypoint(point))) {
                hasValidKeypoints = true;
                break;
            }
        }

        if (!hasValidKeypoints) {
            return "No valid keypoints in pose";
        }

        return null; // Valid preset
    },

    getPoseGroups() {
        if (!this.renderer) {
            return [];
        }
        const poses = this.renderer.getPoses();
        return poses.length > 0 ? poses : [];
    },

    getSelectedPoseIndex() {
        return this.renderer ? this.renderer.getSelectedPoseIndex() : -1;
    }
};

function buildPoseEditorOverlayHtml() {
	return `
<div class="openpose-tab-bar ope-openpose-shell-tabs-row ope-openpose-modal-titlebar ope-openpose-modal-tabs">
	<div class="openpose-tab-scroll-area ope-openpose-shell-header-left">
        <button class="openpose-tab is-active" data-tab="editor">${t("pose_editor.tab.editor")}</button>
        <div class="openpose-tab-modules" data-module-slot="tabs"></div>
    </div>
	<div class="ope-openpose-shell-drag-handle ope-openpose-modal-drag-handle" data-role="drag-handle" aria-hidden="true"></div>
	<div class="openpose-tab-controls ope-openpose-shell-header-right ope-openpose-modal-controls">
		<button class="openpose-tab-contribute" data-action="open-about" title="Open About">${t("pose_editor.tab.contribute")} 💙</button>
        <button class="openpose-tab-maximize" data-action="toggle-maximize"></button>
        <button class="openpose-tab-close" data-action="close-editor">\u{2716}\u{FE0F}</button>
    </div>
</div>
<div class="openpose-main ope-openpose-shell-main">
    <div class="openpose-sidebar">
        <div class="openpose-sidebar-card">
            <div class="openpose-preset-header">
                <label class="openpose-label">${t("pose_editor.label.preset")}</label>
                <div class="openpose-preset-header-controls openpose-preset-iconrow">
                    <button class="openpose-btn openpose-btn-icon openpose-preset-iconbtn" data-action="preset-prev" title="${t("pose_editor.label.preset_prev")}">${UiIcons.svg('chevronUp', { size: 14, className: 'openpose-ui-icon' })}</button>
                    <button class="openpose-btn openpose-btn-icon openpose-preset-iconbtn" data-action="preset-next" title="${t("pose_editor.label.preset_next")}">${UiIcons.svg('chevronDown', { size: 14, className: 'openpose-ui-icon' })}</button>
                    <button class="openpose-btn openpose-btn-icon openpose-preset-iconbtn" data-action="presets-reload" title="${t("pose_editor.label.presets_reload")}">${UiIcons.svg('refresh', { size: 14, className: 'openpose-ui-icon' })}</button>
                </div>
            </div>
            <select class="openpose-input openpose-preset-select"></select>
            <div class="openpose-preset-preview-frame">
                <canvas class="openpose-preset-preview"></canvas>
            </div>
            <div class="openpose-action-row">
                <button class="openpose-btn openpose-btn-icon" data-action="add" title="${t("pose_editor.btn.add_pose")}">${UiIcons.svg('plus', { size: 14, className: 'openpose-ui-icon' })}</button>
                <button class="openpose-btn openpose-btn-icon" data-action="remove" title="${t("pose_editor.btn.remove_pose")}">${UiIcons.svg('minus', { size: 14, className: 'openpose-ui-icon' })}</button>
                <button class="openpose-btn openpose-btn-icon" data-action="reset" title="${t("pose_editor.btn.clear_canvas")}">${UiIcons.svg('pencil', { size: 14, className: 'openpose-ui-icon' })}</button>
                <button class="openpose-btn openpose-btn-icon" data-action="undo" title="${t("pose_editor.btn.undo_edit")}">${UiIcons.svg('undo', { size: 14, className: 'openpose-ui-icon' })}</button>
            </div>
            <div class="openpose-section-group">
                <div class="openpose-section-header">
                    <label class="openpose-label">${t("pose_editor.label.json_pose_file")}</label>
                    <span class="openpose-section-icon">${UiIcons.svg('fileJson', { size: 14, className: 'openpose-ui-icon' })}</span>
                </div>
                <div class="openpose-save-row">
                    <button class="openpose-btn" data-action="load">${t("pose_editor.btn.load")}</button>
                    <button class="openpose-btn" data-action="save">${t("pose_editor.btn.save")}</button>
                </div>
            </div>
            <div class="openpose-section-group">
                <div class="openpose-section-header">
                    <label class="openpose-label">${t("pose_editor.label.canvas_size")}</label>
                    <span class="openpose-section-icon">${UiIcons.svg('canvas', { size: 14, className: 'openpose-ui-icon' })}</span>
                </div>
            <div class="openpose-canvas-dimensions-row">
                <div class="openpose-canvas-dimension">
                    <input class="openpose-input openpose-width-input" type="number" min="64" max="4096" step="64" title="${t("pose_editor.input.width")}" />
                </div>
                <div class="openpose-canvas-dimension">
                    <input class="openpose-input openpose-height-input" type="number" min="64" max="4096" step="64" title="${t("pose_editor.input.height")}" />
                </div>
                <button class="openpose-btn openpose-btn-icon" data-action="reset-size" title="${t("pose_editor.btn.reset_size")}">${UiIcons.svg('resetCcw', { size: 14, className: 'openpose-ui-icon' })}</button>
            </div>
            <div class="openpose-canvas-bounds-warning-banner" style="display: none;">
                <div class="openpose-canvas-bounds-warning-content">
                    <span class="openpose-canvas-bounds-warning-icon">\u{26A0}</span>
                    <div class="openpose-canvas-bounds-warning-text">
                        <p class="openpose-canvas-bounds-warning-message">${t("pose_editor.warning.canvas_bounds")}</p>
                    </div>
                </div>
            </div>
            </div>
            <div class="openpose-section-group">
                <div class="openpose-section-header">
                    <label class="openpose-label">${t("pose_editor.label.background")}</label>
                    <span class="openpose-section-icon">${UiIcons.svg('image', { size: 14, className: 'openpose-ui-icon' })}</span>
                </div>
                <div class="openpose-bg-buttons-row">
                    <button class="openpose-btn" data-action="load-bg">${t("pose_editor.btn.load")}</button>
                    <button class="openpose-btn" data-action="clear-bg">${t("pose_editor.btn.bg_remove")}</button>
                </div>
            </div>
            <div class="openpose-bg-mode-row">
                <label class="openpose-label-inline">${t("pose_editor.label.mode")}</label>
                <select class="openpose-input openpose-bg-mode-select">
                    <option value="contain">${t("pose_editor.mode.contain")}</option>
                    <option value="cover">${t("pose_editor.mode.cover")}</option>
                </select>
            </div>
            <div class="openpose-opacity-row">
                <label class="openpose-label-inline">${t("pose_editor.label.opacity")}</label>
                <input class="openpose-opacity-slider" type="range" min="0" max="100" value="50" />
            </div>
            <div class="openpose-spacer"></div>
            <div class="openpose-footer-actions-row">
                <button class="openpose-btn openpose-cancel-btn" data-action="cancel">${t("pose_editor.btn.cancel")}</button>
                <button class="openpose-btn openpose-apply-btn" data-action="ok">${t("pose_editor.btn.apply")}</button>
            </div>
        </div>
    </div>
    <div class="openpose-sidebar openpose-sidebar-placeholder openpose-sidebar-placeholder-left"></div>
    <div class="openpose-canvas-area">
        <div class="canvas-container">
            <canvas class="openpose-editor-canvas"></canvas>
            <div class="canvas-drag-overlay"></div>
        </div>
    </div>
    <div class="openpose-sidebar openpose-sidebar-placeholder openpose-sidebar-placeholder-right"></div>
    <div class="openpose-sidebar openpose-sidebar-right">
        <div class="openpose-sidebar-card openpose-coco-keypoints-card">
            <label class="openpose-label openpose-coco-keypoints-label">${t("pose_editor.keypoints.label")}</label>
            <div class="openpose-coco-keypoints-list"></div>
            <div class="openpose-spacer"></div>
            ${buildDonationFooterHtml()}
        </div>
    </div>
    <div class="openpose-module-slot openpose-module-overlay-slot" data-module-slot="overlay"></div>
<div class="openpose-module-slot openpose-module-panels-slot" data-module-slot="module-panels"></div>
</div>
<input class="openpose-file-input" type="file" accept=".json" />
<input class="openpose-bg-file-input" type="file" accept="image/*" />
	`;
}

const DEFAULT_TAB_STYLES = {
    tabBg: "var(--openpose-panel-bg)",
    tabInactiveText: "var(--openpose-text-muted)",
    tabActiveText: "var(--openpose-primary-text)",
    tabActiveBg: "var(--openpose-primary-bg)",
    tabHoverText: "var(--openpose-primary-text)",
    tabActiveBorder: "inset 0 -2px 0 var(--openpose-primary-bg)",
    tabShadow: "var(--openpose-tab-shadow)"
};

const resolveTabStyles = (tabStyles = {}) => ({
    ...DEFAULT_TAB_STYLES,
    ...tabStyles
});

export function applyTabButtonStyles(tabButtons, activeTab, tabStyles = {}) {
    (tabButtons || []).forEach((button) => {
        if (!button) {
            return;
        }
        const isActive = button.dataset.tab === activeTab;
        button.classList.toggle("is-active", isActive);
    });
}

const OPENPOSE_EDITOR_SHELL_STYLESHEET_ID = "openpose-editor-shell-stylesheet";
const OPENPOSE_EDITOR_SHELL_STYLESHEET_URL = "/extensions/comfyui-openpose-studio/assets/openpose_editor.css";

function resolveExtensionAssetUrl(assetName) {
	if (assetName === "openpose_editor.css") {
		return OPENPOSE_EDITOR_SHELL_STYLESHEET_URL;
	}
	return `/extensions/comfyui-openpose-studio/assets/${assetName}`;
}

function ensureOpenPoseEditorShellStylesheet() {
	if (document.getElementById(OPENPOSE_EDITOR_SHELL_STYLESHEET_ID)) {
		return;
	}
	const link = document.createElement("link");
	link.id = OPENPOSE_EDITOR_SHELL_STYLESHEET_ID;
	link.rel = "stylesheet";
	link.href = resolveExtensionAssetUrl("openpose_editor.css");
	document.head.appendChild(link);
}

export function applyPoseEditorStyles(container, options = {}) {
    if (!container) {
        return;
    }

    // Inject monochrome SVG icon styles (id-guarded)
    ensureOpenPoseInjectedStyles();
	ensureOpenPoseEditorShellStylesheet();

    const sidebarWidth = Number.isFinite(options.sidebarWidth) ? options.sidebarWidth : 280;
    const sidebarMinWidth = Number.isFinite(options.sidebarMinWidth) ? options.sidebarMinWidth : 220;
	container.classList.add("ope-openpose-modal");
	container.style.setProperty("--ope-openpose-sidebar-width", `${sidebarWidth}px`);
	container.style.setProperty("--ope-openpose-sidebar-min-width", `${sidebarMinWidth}px`);

	container.querySelectorAll(".openpose-tab").forEach((tab) => {
		tab.classList.add("ope-openpose-shell-tab");
	});

    container.querySelectorAll(".openpose-muted-icons span, .openpose-muted-icons .openpose-coco-empty-tab-icon").forEach((icon) => {
        const text = icon.textContent || "";
		const hasEmoji = text && text.length > 0 && text.length <= 3;
        if (hasEmoji || icon.classList.contains("openpose-coco-empty-tab-icon")) {
			icon.classList.add("openpose-muted-icon");
        }
    });

	container.querySelectorAll(".openpose-coco-keypoint-item").forEach((item) => {
		item.classList.add("openpose-coco-keypoint-row");
	});
    
    // --- Keypoint hover logic using hoveredKeypointName ---
    if (!container._hoveredKeypointName) container._hoveredKeypointName = null;
    const footerActionsRow = container.querySelector(".openpose-footer-actions-row");
    if (footerActionsRow) {
		footerActionsRow.classList.add("ope-openpose-shell-footer-row");
    }

    const applyBtn = container.querySelector(".openpose-apply-btn");
    if (applyBtn) {
		applyBtn.textContent = "Apply";
    }
}

export const poseEditorOverlay = {
    id: "editor",
    buildUI: buildPoseEditorOverlayHtml,
    applyStyles: applyPoseEditorStyles,
    initUI: applyPoseEditorStyles,
    applyTabButtonStyles
};
