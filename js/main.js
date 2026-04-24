import { app } from "/scripts/app.js";
import { ComfyWidgets } from "/scripts/widgets.js";
import "./comfy-theme-colors.js";
import { createModuleManager } from "./modules/index.js";
import { t } from "./modules/i18n.js";
import {
	poseEditorOverlay,
	poseEditorPresetWorkflow,
	poseEditorCanvasWorkflow,
	poseEditorSubsystemWorkflow
} from "./modules/editor.js";

import { OpenPoseCanvas2D } from "./canvas2d.js";
import {
	showToast,
	getFormatDisplayName,
	getComfyThemeSafe,
	getThemeOverlayColor,
	parsePosePayload,
	loadImageAsync,
	dataUrlToBlob,
	drawBoneWithOutline,
	drawKeypointWithOutline,
	getSkeletonEdges,
	getSkeletonEdgeColors,
	isKeypointPresent,
	DEFAULT_CANVAS_WIDTH,
	DEFAULT_CANVAS_HEIGHT,
	DEFAULT_PANEL_CANVAS_WIDTH,
	DEFAULT_PANEL_CANVAS_HEIGHT,
	cloneKeypoints,
	isValidKeypoint,
	getKeypointsBoundsCenter,
	scaleKeypointsToCanvas,
	isColorLight,
	adjustColor,
	normalizePresetData,
	normalizePoseJson,
	getSmokedGlassCanvasStyle,
	BLENDER_GRID_BACKGROUND,
	BLENDER_GRID_LINE,
	BLENDER_AXIS_X,
	BLENDER_AXIS_Y,
	DEFAULT_POSE_COCO18,
	DEFAULT_POSE_COCO17,
	POSES_LIST_URL,
	POSES_FILE_URL,
	PREVIEW_WIDTH,
	PREVIEW_HEIGHT,
	MISSING_KEYPOINT_DRAG_TYPE,
	getPersistedSetting,
	setPersistedSetting,
	injectGlobalAlertStyles
} from "./utils.js";
import { getFormatForPose, isFormatEditAllowed } from "./formats/index.js";

// Re-export for backwards compatibility
export { showToast } from "./utils.js";

// Inject global alert styles once on module load
injectGlobalAlertStyles();

// Persistence key for window maximize state
const PANEL_MAXIMIZED_KEY = "openpose_editor.panel.isMaximized";

const isOpenPoseDebugEnabled = () => {
	if (typeof globalThis === "undefined") {
		return false;
	}
	return !!globalThis.OpenPoseEditorDebug?.openpose;
};

function debugLog(...args) {
	if (!isOpenPoseDebugEnabled()) {
		return;
	}
	console.log(...args);
}

function logLayout(label, data) {
	if (!isOpenPoseDebugEnabled()) {
		return;
	}
	console.debug(`[OpenPose Studio] ${label}`, data);
}

/**
 * Render pose JSON to a data URL for node preview.
 * @param {string|object} poseJson - JSON string or parsed pose data
 * @param {number} previewWidth - Preview canvas width
 * @param {number} previewHeight - Preview canvas height
 * @returns {string|null} - Data URL of the rendered pose or null if invalid
 */
function renderPoseToDataURL(poseJson, previewWidth = PREVIEW_WIDTH, previewHeight = PREVIEW_HEIGHT) {
	const normalized = normalizePoseJson(poseJson);
	if (!normalized || !Array.isArray(normalized.poses) || normalized.poses.length === 0) {
		return null;
	}
	const poseWidth = Number(normalized.width) || DEFAULT_CANVAS_WIDTH;
	const poseHeight = Number(normalized.height) || DEFAULT_CANVAS_HEIGHT;
	const poses = normalized.poses;

	// Create offscreen canvas
	const canvas = document.createElement("canvas");
	canvas.width = previewWidth;
	canvas.height = previewHeight;
	const ctx = canvas.getContext("2d");

	const smokedGlass = getSmokedGlassCanvasStyle(getComfyThemeSafe());
	const previewSurface = smokedGlass.surface;
	const previewBorder = smokedGlass.border;

	// --- Viewport background (letterbox/pillarbox areas outside canvas frame) ---
	ctx.clearRect(0, 0, previewWidth, previewHeight);
	const letterboxBg = previewSurface ? adjustColor(previewSurface, -20) : "#111";
	ctx.fillStyle = letterboxBg;
	ctx.fillRect(0, 0, previewWidth, previewHeight);
	if (previewBorder) {
		ctx.strokeStyle = previewBorder;
		ctx.lineWidth = 1;
		ctx.strokeRect(0.5, 0.5, previewWidth - 1, previewHeight - 1);
	}

	// --- Canvas frame: contain-fit to preserve pose aspect ratio ---
	const padding = 8;
	const availW = previewWidth - padding * 2;
	const availH = previewHeight - padding * 2;
	const poseAspect = poseWidth / poseHeight;
	let frameW = availW;
	let frameH = availH;
	if (availW / availH >= poseAspect) {
		frameW = Math.round(availH * poseAspect);
	} else {
		frameH = Math.round(availW / poseAspect);
	}
	frameW = Math.max(4, frameW);
	frameH = Math.max(4, frameH);
	const frameX = Math.round((previewWidth - frameW) / 2);
	const frameY = Math.round((previewHeight - frameH) / 2);

	// Canvas frame background
	if (previewSurface) {
		ctx.fillStyle = previewSurface;
		ctx.fillRect(frameX, frameY, frameW, frameH);
	}

	// --- Pose rendering inside canvas frame ---
	const scale = Math.min(frameW / poseWidth, frameH / poseHeight);
	const offsetX = frameX + (frameW - poseWidth * scale) / 2;
	const offsetY = frameY + (frameH - poseHeight * scale) / 2;

	const lineWidth = Math.max(1, 4 * scale);
	const radius = Math.max(2, 3 * scale);

	// Draw each person (format-driven per pose)
	for (const pose of poses) {
		const person = pose.keypoints;
		if (!Array.isArray(person) || person.length === 0) {
			continue;
		}
		const detectedFormat = getFormatForPose(person);
		const personEdges = detectedFormat.skeletonEdges;
		const personColors = detectedFormat.skeletonColors;
		const keypointColors = Array.isArray(detectedFormat?.keypointColors) ? detectedFormat.keypointColors : null;
		const formatKeypoints = Array.isArray(detectedFormat?.keypoints) ? detectedFormat.keypoints : null;

		// Draw limbs
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

		// Draw keypoints
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

	// --- Center axis guides: vertical red, horizontal green ---
	ctx.save();
	ctx.globalAlpha = 0.4;
	ctx.lineWidth = 1;
	const cx = frameX + Math.round(frameW / 2) + 0.5;
	const cy = frameY + Math.round(frameH / 2) + 0.5;
	// Vertical axis: red (BLENDER_AXIS_Y)
	ctx.strokeStyle = BLENDER_AXIS_Y;
	ctx.beginPath();
	ctx.moveTo(cx, frameY);
	ctx.lineTo(cx, frameY + frameH);
	ctx.stroke();
	// Horizontal axis: green (BLENDER_AXIS_X)
	ctx.strokeStyle = BLENDER_AXIS_X;
	ctx.beginPath();
	ctx.moveTo(frameX, cy);
	ctx.lineTo(frameX + frameW, cy);
	ctx.stroke();
	ctx.restore();

	// --- Canvas frame border ---
	if (previewBorder) {
		ctx.strokeStyle = previewBorder;
		ctx.lineWidth = 1;
		ctx.strokeRect(frameX + 0.5, frameY + 0.5, frameW - 1, frameH - 1);
	}

	// --- Canvas size label (top-left of canvas frame) ---
	const fontSize = Math.max(8, Math.min(11, frameW / 10));
	ctx.font = `${fontSize}px sans-serif`;
	ctx.textBaseline = "top";
	const labelInset = 4;
	const badgePad = 2;
	const drawBadge = (text, x) => {
		const tMetrics = ctx.measureText(text);
		const textW = tMetrics.width;
		const badgeW = textW + badgePad * 2;
		const badgeH = fontSize + badgePad * 2;
		const textX = x + badgePad;
		const badgeX = x;
		ctx.fillStyle = "rgba(0,0,0,0.55)";
		ctx.fillRect(badgeX, frameY + labelInset, badgeW, badgeH);
		ctx.fillStyle = "rgba(255,255,255,0.88)";
		ctx.textAlign = "left";
		ctx.fillText(text, textX, frameY + labelInset + badgePad);
	};

	drawBadge(`${poseWidth}\u00d7${poseHeight}`, frameX + labelInset);

	return canvas.toDataURL("image/png");
}

/**
 * Extract keypoints from pose_keypoints_2d format (flattened: [x1,y1,conf1,x2,y2,conf2,...])
 * Handles both COCO-17 (TensorFlow.js / Ultralytics order) and COCO-18 (OpenPose order)
 * COCO-17 poses are automatically remapped to COCO-18 index space for internal use
 */
class OpenPosePanel {
    node = null;
	canvas = null;
	canvasElem = null
	panel = null

	undo_history = []
	redo_history = []

	moduleManager = null;

	lockMode = false;

	// Store original state to allow cancel
	originalPose = null;
	originalPoseData = null; // Deep clone of node pose data for cancel functionality
	workingPoseData = null;  // Working copy loaded into renderer during editing
	allowCommitToNode = false; // Flag to control whether saveToNode actually commits to node

	// Hover ring state for keypoint list interaction
	hoverRingState = {
		ring: null,      // Hover ring state
		keypointId: null // The currently hovered keypoint id
	};

	constructor(panel, node) {
		this.panel = panel;
		this.panel?.classList?.add("ope-openpose-modal", "ope-openpose-shell-panel", "ope-openpose-modal-shell");
			this._initializing = true;  // Prevent saveToNode during init
			this._initializing = false;
        this.node = node;
        this._initializing = true;  // Prevent saveToNode during init

        // Save original pose for cancel functionality - both as string and deep-cloned JSON
        this.originalPose = node.properties.savedPose || "";
        try {
            this.originalPoseData = JSON.parse(this.originalPose);
        } catch (e) {
            this.originalPoseData = null;
        }
        // Initialize working copy as a deep clone
        if (this.originalPoseData) {
            this.workingPoseData = JSON.parse(JSON.stringify(this.originalPoseData));
        }

        // Panel size - responsive to viewport with margins
        this.panelMarginX = 60;
        this.panelMarginY = 30;
        this.panelMaxWidth = 1500;
        this.sidebarWidth = 280;
        this.sidebarMinWidth = 220;
        this.panelRestoreWidth = DEFAULT_PANEL_CANVAS_WIDTH + 2 * this.sidebarWidth + 72;
        this.panelRestoreHeight = DEFAULT_PANEL_CANVAS_HEIGHT + 240;
        this.panelMaximizedMargin = 20;
        
        // Load persisted maximize state
        const persistedMaximized = getPersistedSetting(PANEL_MAXIMIZED_KEY, "false");
        this.isMaximized = persistedMaximized === "true";
        
        this.schedulePanelLayout();
        this._resizeHandler = () => this.schedulePanelLayout();
        window.addEventListener("resize", this._resizeHandler);
        if (typeof ResizeObserver !== "undefined") {
            const target = document.documentElement || document.body;
            if (target) {
                this._viewportObserver = new ResizeObserver(() => this.schedulePanelLayout());
                this._viewportObserver.observe(target);
            }
        }

        // Hide the default footer (we'll use our own controls)
        if (this.panel.footer) {
			this.panel.footer.classList.add("ope-openpose-native-footer");
        }

        this.createTitlebarButtons();

		const rootHtml = poseEditorOverlay.buildUI();

		const container = this.panel.addHTML(rootHtml, "openpose-container");
        this.container = container;
		this.ensureMissingKeypointStyles();
		this.initThemeSupport();

        this.tabAccent = "var(--openpose-primary-bg)";
        this.tabHoverText = "var(--openpose-primary-text)";
        this.tabBg = "var(--openpose-panel-bg)";
        this.tabInactiveText = "var(--openpose-text-muted)";
        this.tabActiveText = "var(--openpose-primary-text)";
        this.tabActiveBg = "var(--openpose-primary-bg)";
        this.tabActiveBorder = "inset 0 -2px 0 var(--openpose-primary-bg)";
        this.tabShadow = "var(--openpose-tab-shadow)";

        poseEditorOverlay.initUI(container, {
            sidebarWidth: this.sidebarWidth,
            sidebarMinWidth: this.sidebarMinWidth,
            tabStyles: this.getTabStyleConfig()
        });
		this.panelDragHandle = container.querySelector('[data-role="drag-handle"]');
		this.isPanelDragging = false;
		this.panelDragOffsetX = 0;
		this.panelDragOffsetY = 0;
		this._panelDragMouseMoveHandler = (event) => this.onPanelDragMouseMove(event);
		this._panelDragMouseUpHandler = () => this.stopPanelDrag();
		this._panelDragMouseDownHandler = (event) => this.onPanelDragMouseDown(event);
		this.applyPanelLayout();

        const tabMaximize = container.querySelector(".openpose-tab-maximize");
        if (tabMaximize) {
            tabMaximize.addEventListener("click", () => this.toggleMaximize());
            this.maximizeButton = tabMaximize;
            this.updateMaximizeButton();
        }
		this.updatePanelDragHandleState();

        const tabClose = container.querySelector(".openpose-tab-close");
        if (tabClose) {
            tabClose.addEventListener("click", () => this.requestClose());
        }

		const contributeBtn = container.querySelector(".openpose-tab-contribute");
		if (contributeBtn) {
			contributeBtn.addEventListener("click", () => {
				this.setActiveTab("about");
				showToast(
					"info",
					t("about.support.toast_title"),
					t("about.support.toast_body")
				);
			});
		}

        const leftPlaceholder = container.querySelector(".openpose-sidebar-placeholder-left");
        const rightPlaceholder = container.querySelector(".openpose-sidebar-placeholder-right");
        const leftSidebar = container.querySelector(".openpose-sidebar:not(.openpose-sidebar-right)");
        const rightSidebar = container.querySelector(".openpose-sidebar-right");
        this.leftSidebar = leftSidebar;
        this.rightSidebar = rightSidebar;
        this.leftSidebarPlaceholder = leftPlaceholder;
        this.rightSidebarPlaceholder = rightPlaceholder;
        this.previewFrame = container.querySelector(".openpose-preset-preview-frame");
        this.previewCanvas = container.querySelector(".openpose-preset-preview");
        if (this.previewCanvas) {
            this.previewCanvas.width = 180;
            this.previewCanvas.height = 180;
            this.previewCtx = this.previewCanvas.getContext("2d");
        }

        // Presets (loaded from JSON)
        this.presetsLoading = true;
        this.presets = [];
        this.presetBaseWidth = DEFAULT_CANVAS_WIDTH;
        this.presetBaseHeight = DEFAULT_CANVAS_HEIGHT;

        // Populate preset selector
        this.presetSelect = container.querySelector(".openpose-preset-select");
        this.showPresetsLoadingState();
        this.renderPresetPreviewLoading();
        if (this.presetSelect) {
            this.presetSelect.addEventListener("change", () => {
                this.renderPresetPreview(this.presetSelect.value);
            });
        }

        const canvasArea = container.querySelector(".openpose-canvas-area");
        const canvasStage = container.querySelector(".openpose-canvas-area .canvas-container");
        this.canvasArea = canvasArea;
        this.canvasStage = canvasStage;
        if (canvasStage) {
			logLayout("canvas-stage-init", {
				clientWidth: canvasStage.clientWidth,
				clientHeight: canvasStage.clientHeight
			});
		} else if (canvasArea) {
			logLayout("canvas-area-init", {
				clientWidth: canvasArea.clientWidth,
				clientHeight: canvasArea.clientHeight
			});
		}

        const isPresetDrag = (event) => {
            const types = Array.from(event?.dataTransfer?.types || []);
            return types.includes("text/openpose-preset");
        };
        const isMissingKeypointDrag = (event) => {
            const types = Array.from(event?.dataTransfer?.types || []);
            return types.includes(MISSING_KEYPOINT_DRAG_TYPE);
        };

        if (this.previewCanvas) {
            this.previewCanvas.setAttribute("draggable", "true");
            // Set default border to gray
            this.previewCanvas.style.border = "1px solid var(--openpose-canvas-border)";
            
            const setPreviewBorder = (active) => {
                if (active) {
                    // On hover: use red if invalid, otherwise use primary color
                    const borderColor = this._presetIsInvalid ? "#FF6B6B" : "var(--openpose-primary-hover-bg)";
                    this.previewCanvas.style.border = `1px dashed ${borderColor}`;
                } else {
                    // Default: always gray
                    this.previewCanvas.style.border = "1px solid var(--openpose-canvas-border)";
                }
            };
            this.previewCanvas.addEventListener("mouseenter", () => {
                this._previewCanvasHover = true;
                setPreviewBorder(true);
            });
            this.previewCanvas.addEventListener("mouseleave", () => {
                this._previewCanvasHover = false;
                if (!this._previewCanvasDragging) {
                    setPreviewBorder(false);
                }
            });
            this.previewCanvas.addEventListener("dragstart", (event) => {
                const presetId = this.presetSelect ? this.presetSelect.value : null;
                // Prevent drag if preset is invalid
                if (!presetId || presetId.startsWith("invalid:") || !event.dataTransfer) {
                    event.preventDefault();
                    return;
                }
				// Include preset id and detected format id in the drag payload so drop side
				// can use the same format assumptions without re-detecting from selection
				event.dataTransfer.setData("text/openpose-preset", presetId);
				event.dataTransfer.setData("text/plain", presetId);
				try {
					const preset = this.presets.find(p => p.id === presetId) || this.presets[0];
					const rawKeypoints = preset ? preset.keypoints : cloneKeypoints(DEFAULT_POSE_COCO18.keypoints);
					const fmt = getFormatForPose(rawKeypoints);
					if (fmt && fmt.id) {
						event.dataTransfer.setData("text/openpose-preset-format", fmt.id);
					}
				} catch (e) {
					// ignore
				}
                event.dataTransfer.effectAllowed = "copy";
                this._previewCanvasDragging = true;
                this._draggingPreset = true;
                this.previewCanvas.style.cursor = "grabbing";
                setPreviewBorder(true);
            });
            this.previewCanvas.addEventListener("dragend", () => {
                this._draggingPreset = false;
                if (typeof this._forceClearCanvasDropHighlight === "function") {
                    this._forceClearCanvasDropHighlight("preview-dragend");
                }
                this._previewCanvasDragging = false;
                this.previewCanvas.style.cursor = this._presetIsInvalid ? "not-allowed" : "grab";
                if (!this._previewCanvasHover) {
                    setPreviewBorder(false);
                }
            });
        }

        this.canvasWidth = DEFAULT_CANVAS_WIDTH;
        this.canvasHeight = DEFAULT_CANVAS_HEIGHT;

		       this.canvasElem = container.querySelector(".openpose-editor-canvas");
		       debugLog('[OpenPosePanel] Canvas element found:', {
			       canvasElem: this.canvasElem,
			       tagName: this.canvasElem?.tagName,
			       clientWidth: this.canvasElem?.clientWidth,
			       clientHeight: this.canvasElem?.clientHeight,
			       offsetWidth: this.canvasElem?.offsetWidth,
			       offsetHeight: this.canvasElem?.offsetHeight
		       });

		// Extract canvas dimensions from saved pose BEFORE initializing Canvas2D
		// This prevents rendering at default 512×512 and then resizing
		const savedDimensions = this.extractCanvasDimensionsFromPose(this.node.properties.savedPose);
		       if (savedDimensions) {
			       this.canvasWidth = savedDimensions.width;
			       this.canvasHeight = savedDimensions.height;
			       debugLog('[OpenPosePanel] Using saved canvas dimensions:', {
				       width: this.canvasWidth,
				       height: this.canvasHeight
			       });
		       }
		
		this.canvasElem.width = this.canvasWidth;
		this.canvasElem.height = this.canvasHeight;
		
		       debugLog('[OpenPosePanel] Canvas dimensions set to:', {
			       canvasElem_width: this.canvasElem.width,
			       canvasElem_height: this.canvasElem.height,
			       clientWidth: this.canvasElem.clientWidth,
			       clientHeight: this.canvasElem.clientHeight
		       });

		// Instantiate native renderer as single source of truth
		this.renderer = new OpenPoseCanvas2D(this.canvasElem, {
			logicalWidth: this.canvasWidth,
			logicalHeight: this.canvasHeight
		});
		this.setCanvasBackgroundFill(this.canvasBackgroundFill);
		this.setCanvasGridColor(this.canvasGridColor);
		// Wire up change events for history/UI updates (geometry, add, delete, clear)
		this.renderer.onChange((reason) => {
			this.onRendererChange(reason);
		});
		// Wire up selection change events for sidebar updates
		this.renderer.onSelectionChange(() => {
			this.refreshCocoKeypointsPanel();
			this.refreshCocoKeypointRowStyles();
		});
		// Wire up hover change events for sidebar styling
		this.renderer.onHoverChange(() => {
			this.refreshCocoKeypointRowStyles();
		});
		this.canvas = null; // Use this.renderer instead
        poseEditorOverlay.applyStyles(container, {
            sidebarWidth: this.sidebarWidth,
            sidebarMinWidth: this.sidebarMinWidth,
            tabStyles: this.getTabStyleConfig()
        });
        // canvas is always null in Canvas2D (use this.renderer instead)
        const dropHighlightTarget = this.canvasElem;
        const dropTarget = dropHighlightTarget;
        const ensureDebugId = (el) => {
            if (!el) {
                return null;
            }
            if (!el.__openposeId) {
                const nextId = (window.__openposeIdCounter || 0) + 1;
                window.__openposeIdCounter = nextId;
                el.__openposeId = `openpose-${nextId}`;
            }
            return el.__openposeId;
        };
        const describeElement = (el) => {
            if (!el) {
                return null;
            }
            return {
                id: ensureDebugId(el),
                tagName: el.tagName,
                className: typeof el.className === "string" ? el.className : ""
            };
        };
        const logDropHighlight = (active, event, reason) => {
            if (!isOpenPoseDebugEnabled()) {
                return;
            }
            const highlightEl = dropHighlightTarget;
            const computed = highlightEl ? window.getComputedStyle(highlightEl) : null;
            console.debug("[OpenPose Drag] highlight", {
                active,
                reason,
                type: event?.type || null,
                isPresetDrag: event ? isPresetDrag(event) : null,
                target: describeElement(event?.target),
                currentTarget: describeElement(event?.currentTarget),
                highlight: describeElement(highlightEl),
                inlineOutline: highlightEl?.style?.outline || "",
                inlineOutlineOffset: highlightEl?.style?.outlineOffset || "",
                computedOutlineStyle: computed?.outlineStyle,
                computedOutlineWidth: computed?.outlineWidth,
                computedOutlineColor: computed?.outlineColor
            });
        };
        const setCanvasDropHighlight = (active, event, reason) => {
            if (!dropHighlightTarget) {
                return;
            }
            if (!this._canvasDropOutlineBase) {
                this._canvasDropOutlineBase = dropHighlightTarget.style.outline || "";
                this._canvasDropOutlineOffsetBase = dropHighlightTarget.style.outlineOffset || "";
            }
            this._canvasDropVisible = active;
            dropHighlightTarget.classList.toggle("openpose-drop-highlight", active);
            dropHighlightTarget.style.outline = active
                ? "4px dashed var(--openpose-primary-bg)"
                : this._canvasDropOutlineBase;
            dropHighlightTarget.style.outlineOffset = active
                ? "3px"
                : this._canvasDropOutlineOffsetBase;
            logDropHighlight(active, event, reason);
        };
        const clearCanvasDropHighlight = (event, reason) => {
            if (this._dragLeaveTimeout) {
                clearTimeout(this._dragLeaveTimeout);
                this._dragLeaveTimeout = null;
            }
            this._dragOverCanvas = false;
            setCanvasDropHighlight(false, event, reason || "clear");
        };
        const forceClearCanvasDropHighlight = (reason, event) => {
            if (!dropHighlightTarget) {
                return;
            }
            if (this._dragLeaveTimeout) {
                clearTimeout(this._dragLeaveTimeout);
                this._dragLeaveTimeout = null;
            }
            this._dragOverCanvas = false;
            this._canvasDropVisible = false;
            dropHighlightTarget.classList.remove("openpose-drop-highlight");
            dropHighlightTarget.style.outline = "";
            dropHighlightTarget.style.outlineOffset = "";
            logDropHighlight(false, event, reason || "force-clear");
        };
        const handleCanvasDrag = (event) => {
            const isPreset = isPresetDrag(event);
            const isMissingKeypoint = isMissingKeypointDrag(event);
            if ((!this._draggingPreset || !isPreset) && (!this._draggingMissingKeypoint || !isMissingKeypoint)) {
                this._dragOverCanvas = false;
                clearCanvasDropHighlight(event, "drag-ignore");
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "copy";
            }
            if (isPreset || isMissingKeypoint) {
                this._dragOverCanvas = true;
                setCanvasDropHighlight(true, event, "drag-over");
            }
        };
        if (dropTarget) {
            ensureDebugId(dropTarget);
            dropTarget.addEventListener("dragenter", (event) => {
                if (this._dragLeaveTimeout) {
                    clearTimeout(this._dragLeaveTimeout);
                    this._dragLeaveTimeout = null;
                }
                handleCanvasDrag(event);
            });
            dropTarget.addEventListener("dragover", handleCanvasDrag);
            dropTarget.addEventListener("dragleave", (event) => {
                if (this._dragLeaveTimeout) {
                    clearTimeout(this._dragLeaveTimeout);
                }
                this._dragLeaveTimeout = setTimeout(() => {
                    if (this._dragOverCanvas) {
                        this._dragOverCanvas = false;
                        clearCanvasDropHighlight(event, "drag-leave-confirmed");
                    }
                }, 0);
            });
            dropTarget.addEventListener("drop", (event) => {
                const isPreset = isPresetDrag(event);
                const missingKeypointId = event.dataTransfer?.getData(MISSING_KEYPOINT_DRAG_TYPE);
                const isMissingKeypoint = Boolean(missingKeypointId);
                if (isPreset || isMissingKeypoint) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                this._dragOverCanvas = false;
                clearCanvasDropHighlight(event, "drop");
                if (isPreset) {
					const presetId = event.dataTransfer?.getData("text/openpose-preset")
						|| this.presetSelect?.value;
					const draggedFormatId = event.dataTransfer?.getData("text/openpose-preset-format") || null;
					if (presetId) {
						this.addPresetToCanvas(presetId, { formatId: draggedFormatId });
					}
                } else if (isMissingKeypoint) {
                    this._draggingMissingKeypoint = false;
                    const keypointIdNum = parseInt(missingKeypointId, 10);
                    if (!Number.isFinite(keypointIdNum) || keypointIdNum < 0) {
                        return;
                    }
                    const selectedPoseIndex = this.renderer ? this.renderer.getSelectedPoseIndex() : null;
                    if (selectedPoseIndex == null || selectedPoseIndex < 0) {
                        showToast("warn", "Pose Editor", t("toast.no_pose_selected"));
                        return;
                    }
                    const poses = this.renderer ? this.renderer.getPoses() : [];
                    const selectedPose = poses[selectedPoseIndex];
                    if (!selectedPose) {
                        return;
                    }
                    const format = getFormatForPose(selectedPose.keypoints);
                    if (!isFormatEditAllowed(format ? format.id : null)) {
                        showToast("warn", "Pose Editor", t("toast.coco17_edit_disabled"));
                        return;
                    }
                    const logical = this.renderer.screenToLogical(event.clientX, event.clientY);
                    const didPlace = this.renderer.placeKeypoint(selectedPoseIndex, keypointIdNum, logical.x, logical.y);
                    if (didPlace) {
                        this.recordHistory();
                        this.saveToNode();
                        this.refreshCocoKeypointsPanel();
                    }
                }
            });
        }
        this._clearCanvasDropHighlight = clearCanvasDropHighlight;
        this._forceClearCanvasDropHighlight = forceClearCanvasDropHighlight;
        const globalDragClear = (event) => {
            forceClearCanvasDropHighlight("global-clear", event);
        };
        document.addEventListener("dragend", globalDragClear, true);
        document.addEventListener("drop", globalDragClear, true);
        window.addEventListener("pointerup", globalDragClear, true);
        window.addEventListener("mouseup", globalDragClear, true);
        this._globalDragClear = globalDragClear;
        if (this._dragHighlightWatchdog) {
            clearInterval(this._dragHighlightWatchdog);
        }
        this._dragHighlightWatchdog = setInterval(() => {
            if (!this._draggingPreset && !this._draggingMissingKeypoint) {
                forceClearCanvasDropHighlight("watchdog-not-dragging");
                return;
            }
            if (!this._dragOverCanvas && this._canvasDropVisible) {
                clearCanvasDropHighlight(null, "watchdog-not-over");
            }
        }, 100);
        if (!this.activeTab) {
            this.activeTab = "editor";
        }
        this.moduleManager = createModuleManager(container, this);
        const moduleInit = this.moduleManager.init();
        moduleInit.then(() => {
            poseEditorOverlay.applyStyles(container, {
                sidebarWidth: this.sidebarWidth,
                sidebarMinWidth: this.sidebarMinWidth,
                tabStyles: this.getTabStyleConfig()
            });
            if (typeof this.bindPresetReloadButtons === "function") {
                this.bindPresetReloadButtons(container);
            }
            this.setupTabs(container);
            // Ensure the static "Pose Editor" tab is translated
            // (it was built before i18n init in the constructor)
            const editorTab = container.querySelector('.openpose-tab[data-tab="editor"]');
            if (editorTab) editorTab.textContent = t("pose_editor.tab.editor");
            this.refreshCocoKeypointsPanel();
            this.loadPresetsFromJson();
        }).catch((error) => {
            console.warn("[OpenPose Studio] Module init failed, continuing without optional modules.", error);
            this.setupTabs(container);
            this.loadPresetsFromJson();
        });
        container.querySelectorAll('[data-action="overlay-close"]').forEach((btn) => {
            btn.remove();
        });
        this.removeButton = container.querySelector('[data-action="remove"]');
        this.updateRemoveState();
        
        // Initialize COCO Keypoints panel
        this.cocoKeypointsList = container.querySelector(".openpose-coco-keypoints-list");
        this.cocoKeypointsLabel = container.querySelector(".openpose-coco-keypoints-label");
        this.hoveredKeypointId = null;
        this.cocoKeypointRowElements = new Map();
        this.refreshCocoKeypointsPanel();

        this.setupEditorControls(container);

        // Check if node has existing pose data with valid keypoints
        const hasPoseData = this.hasPoseData(this.node.properties.savedPose);

        if (hasPoseData) {
            const error = this.loadJSON(this.node.properties.savedPose, "", { silent: true });
            if (error) {
                console.error("[OpenPose Studio] Failed to restore saved pose JSON", error)
				this.resizeCanvas(this.canvasWidth, this.canvasHeight)
                // Don't auto-load preset on error - keep canvas empty
            }
            this.scheduleCanvasFit();
        }
        else {
			this.resizeCanvas(this.canvasWidth, this.canvasHeight)
            // No existing pose data - keep canvas empty
            // User can explicitly add poses via preset selection or "Add" button
            this.scheduleCanvasFit();
        }
        this.recordHistory();
        this.updateRemoveState();

		const keyHandler = this.onKeyDown.bind(this);

		document.addEventListener("keydown", keyHandler)

		// Track if changes were confirmed
		this.confirmed = false;

		this.panel.onClose = () => {
			document.removeEventListener("keydown", keyHandler)
			this.stopPanelDrag();
			if (this.panelDragHandle && this._panelDragMouseDownHandler) {
				this.panelDragHandle.removeEventListener("mousedown", this._panelDragMouseDownHandler);
			}
			if (this._globalDragClear) {
				document.removeEventListener("dragend", this._globalDragClear, true);
				document.removeEventListener("drop", this._globalDragClear, true);
				window.removeEventListener("pointerup", this._globalDragClear, true);
				window.removeEventListener("mouseup", this._globalDragClear, true);
				this._globalDragClear = null;
			}
			if (this._dragHighlightWatchdog) {
				clearInterval(this._dragHighlightWatchdog);
				this._dragHighlightWatchdog = null;
			}
			if (typeof this._forceClearCanvasDropHighlight === "function") {
				this._forceClearCanvasDropHighlight("panel-close");
				this._forceClearCanvasDropHighlight = null;
			}
            window.removeEventListener("resize", this._resizeHandler);
            if (this._viewportObserver) {
                this._viewportObserver.disconnect();
                this._viewportObserver = null;
            }
            if (this._layoutRaf) {
                cancelAnimationFrame(this._layoutRaf);
                this._layoutRaf = null;
            }
			if (this._forcePointerUpHandler) {
				window.removeEventListener("pointerup", this._forcePointerUpHandler, true);
				window.removeEventListener("mouseup", this._forcePointerUpHandler, true);
				this._forcePointerUpHandler = null;
			}
			if (this._themeCleanup) {
				this._themeCleanup();
				this._themeCleanup = null;
			}
			// Remove the backdrop overlay
			if (this.panel.backdrop) {
				this.panel.backdrop.remove();
			}
			// If not confirmed, restore original pose (cancel)
			if (!this.confirmed) {
				this.cancelChanges();
			}
		}

        // Initialization complete - allow saveToNode
        this._initializing = false;
	}

	initThemeSupport() {
		const applyTheme = (theme) => {
			this.applyThemeTokens(theme);
		};
		if (typeof window !== "undefined" && typeof window.watchThemeChanges === "function") {
			this._themeCleanup = window.watchThemeChanges(applyTheme);
		} else {
			applyTheme(getComfyThemeSafe());
		}
	}

	logThemeReport() {
		if (typeof window === "undefined") {
			return;
		}
		if (typeof window.printThemeReport === "function") {
			window.printThemeReport();
			return;
		}
		const theme = getComfyThemeSafe();
		console.group("OpenPose Theme Colors");
		console.table(theme);
		console.groupEnd();
	}

	ensureMissingKeypointStyles() {
		return;
	}

	applyThemeTokens(theme) {
		if (!this.container) {
			return;
		}
		const resolved = theme || getComfyThemeSafe();
		this.currentTheme = resolved;

		const panelBg = resolved.menuBg || resolved.background;
		const panelBgSecondaryBase = resolved.menuBgSecondary || panelBg;
		const panelBgSecondary = adjustColor(panelBgSecondaryBase, resolved.isLight ? -12 : -10);
		const inputBg = resolved.inputBg || panelBgSecondary;
		const text = resolved.text || resolved.inputText;
		const textMuted = resolved.inputText || resolved.text;
		const missingText = adjustColor(textMuted, resolved.isLight ? 100 : 20);
		const border = resolved.border || resolved.text;
		const error = resolved.error || "#ef4444";
		const hoverBg = resolved.contentHover || panelBgSecondary;
		const primaryBg = resolved.primaryBg || hoverBg || border;
		const primaryHover = resolved.primaryHover || primaryBg;
		const primaryText = isColorLight(primaryBg) ? "#222222" : "#ffffff";
		const statusInfo = resolved.primaryBg || "#cbd5f5";
		const statusSuccess = resolved.isLight ? "#15803d" : "#86efac";
		const statusWarn = resolved.isLight ? "#b45309" : "#facc15";
		const statusError = resolved.error || "#fca5a5";
		const statusNeutral = textMuted;
		const overlayBg = getThemeOverlayColor(resolved);
		const tabShadow = resolved.isLight
			? "0 0 6px rgba(0,0,0,0.2)"
			: "0 0 10px rgba(0,0,0,0.55)";
		const smokedGlass = getSmokedGlassCanvasStyle(resolved, {
			inputBg,
			menuBgSecondary: panelBgSecondary,
			menuBg: panelBg,
			background: resolved.background,
			border,
			text,
			inputText: textMuted
		});
		const canvasSurface = smokedGlass.surface;
		const canvasBorder = smokedGlass.border;
		const canvasShadow = smokedGlass.shadow;
		const gridColor = smokedGlass.gridColor;

		this.container.style.setProperty("--openpose-panel-bg", panelBg);
		this.container.style.setProperty("--openpose-panel-bg-secondary", panelBgSecondary);
		this.container.style.setProperty("--openpose-input-bg", inputBg);
		this.container.style.setProperty("--openpose-input-text", textMuted);
		this.container.style.setProperty("--openpose-text", text);
		this.container.style.setProperty("--openpose-text-muted", textMuted);
		this.container.style.setProperty("--openpose-text-missing", missingText);
		this.container.style.setProperty("--openpose-border", border);
		this.container.style.setProperty("--openpose-hover-bg", hoverBg);
		this.container.style.setProperty("--openpose-btn-bg", panelBgSecondaryBase);
		this.container.style.setProperty("--openpose-btn-hover-bg", hoverBg);
		this.container.style.setProperty("--openpose-btn-disabled-bg", panelBg);
		this.container.style.setProperty("--openpose-btn-primary-bg", panelBgSecondaryBase);
		this.container.style.setProperty("--openpose-btn-primary-hover-bg", hoverBg);
		this.container.style.setProperty("--openpose-overlay-bg", overlayBg);
		this.container.style.setProperty("--openpose-tab-shadow", tabShadow);
		this.container.style.setProperty("--openpose-primary-bg", primaryBg);
		this.container.style.setProperty("--openpose-primary-hover-bg", primaryHover);
		this.container.style.setProperty("--openpose-primary-text", primaryText);
		this.container.style.setProperty("--openpose-link", primaryBg);
		this.container.style.setProperty("--openpose-error", error);
		this.container.style.setProperty("--openpose-status-info", statusInfo);
		this.container.style.setProperty("--openpose-status-success", statusSuccess);
		this.container.style.setProperty("--openpose-status-warn", statusWarn);
		this.container.style.setProperty("--openpose-status-error", statusError);
		this.container.style.setProperty("--openpose-status-neutral", statusNeutral);
		this.container.style.setProperty("--openpose-card-radius", "8px");
		this.container.style.setProperty("--openpose-canvas-bg", canvasSurface);
		this.container.style.setProperty("--openpose-canvas-border", canvasBorder);
		this.container.style.setProperty("--openpose-canvas-shadow", canvasShadow);
		this.canvasGlassStyle = smokedGlass;

		if (this.panel?.backdrop) {
			this.panel.backdrop.style.background = overlayBg;
		}

		this.setCanvasBackgroundFill(canvasSurface);
		this.setCanvasGridColor(gridColor);
	}

	setCanvasBackgroundFill(fillStyle) {
		if (!fillStyle) {
			return;
		}
		this.canvasBackgroundFill = fillStyle;
		if (this.renderer && typeof this.renderer.setBackgroundFillStyle === "function") {
			this.renderer.setBackgroundFillStyle(fillStyle);
		}
	}

	getCanvasGlassStyle() {
		if (this.canvasGlassStyle) {
			return this.canvasGlassStyle;
		}
		const fallback = getSmokedGlassCanvasStyle(getComfyThemeSafe());
		this.canvasGlassStyle = fallback;
		return fallback;
	}

	getPreviewSurfaceFill() {
		const glass = this.getCanvasGlassStyle();
		return glass?.surface || "transparent";
	}

	setCanvasGridColor(color) {
		if (!color) {
			return;
		}
		this.canvasGridColor = color;
		if (this.renderer && typeof this.renderer.setGrid === "function") {
			const enabled = typeof this.renderer.gridEnabled === "boolean"
				? this.renderer.gridEnabled
				: true;
			this.renderer.setGrid(enabled, color);
		}
	}

	getCanvasGridBaseColor() {
		return BLENDER_GRID_BACKGROUND;
	}

	getCanvasGridLineColor() {
		return BLENDER_GRID_LINE;
	}

	buildCanvasGridPattern(targetCanvas = this.canvas) {
		const baseColor = this.getCanvasGridBaseColor();
		const lineColor = this.getCanvasGridLineColor();
		const step = 64;
		const width = Math.max(1, Math.round(targetCanvas?.width || 0));
		const height = Math.max(1, Math.round(targetCanvas?.height || 0));
		if (!width || !height) {
			return baseColor;
		}
		const patternCanvas = document.createElement("canvas");
		patternCanvas.width = width;
		patternCanvas.height = height;
		const ctx = patternCanvas.getContext("2d");
		if (!ctx) {
			return baseColor;
		}
		ctx.fillStyle = baseColor;
		ctx.fillRect(0, 0, width, height);
		ctx.lineWidth = 1;
		ctx.strokeStyle = lineColor;
		ctx.setLineDash([1, 7]);
		ctx.globalAlpha = 0.8;
		const centerX = Math.round(width / 2) + 0.5;
		const centerY = Math.round(height / 2) + 0.5;

		const drawLine = (x1, y1, x2, y2) => {
			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.stroke();
		};

		for (let x = step; x < width; x += step) {
			const aligned = Math.round(x) + 0.5;
			if (Math.abs(aligned - centerX) < 0.25) {
				continue;
			}
			drawLine(aligned, 0, aligned, height);
		}

		for (let y = step; y < height; y += step) {
			const aligned = Math.round(y) + 0.5;
			if (Math.abs(aligned - centerY) < 0.25) {
				continue;
			}
			drawLine(0, aligned, width, aligned);
		}

		ctx.setLineDash([]);
		ctx.globalAlpha = 1;
		ctx.strokeStyle = BLENDER_AXIS_X;
		drawLine(0, centerY, width, centerY);
		ctx.strokeStyle = BLENDER_AXIS_Y;
		drawLine(centerX, 0, centerX, height);

		return baseColor;
	}

	getPanelHeader() {
		return (
			this.panel?.header ||
			this.panel?.querySelector(".panel-header") ||
			this.panel?.querySelector(".header")
		);
	}

	getPanelHeaderHeight() {
		const header = this.getPanelHeader();
		if (!header) {
			return 40;
		}
		const rect = header.getBoundingClientRect();
		const height = rect.height || header.offsetHeight || 0;
		return height > 0 ? height : 40;
	}

	removePanelDragListeners() {
		if (this._panelDragMouseMoveHandler) {
			document.removeEventListener("mousemove", this._panelDragMouseMoveHandler);
		}
		if (this._panelDragMouseUpHandler) {
			document.removeEventListener("mouseup", this._panelDragMouseUpHandler);
		}
	}

	stopPanelDrag() {
		this.isPanelDragging = false;
		this.removePanelDragListeners();
		this.panelDragHandle?.classList.remove("ope-dragging");
	}

	updatePanelDragHandleState() {
		if (!this.panelDragHandle || !this._panelDragMouseDownHandler) {
			return;
		}
		const canDrag = !this.isMaximized;
		this.panelDragHandle.classList.toggle("ope-drag-enabled", canDrag);
		this.panelDragHandle.classList.remove("ope-dragging");
		this.panelDragHandle.removeEventListener("mousedown", this._panelDragMouseDownHandler);
		if (canDrag) {
			this.panelDragHandle.addEventListener("mousedown", this._panelDragMouseDownHandler);
		} else {
			this.stopPanelDrag();
		}
	}

	clampPanelPosition(left, top) {
		if (!this.panel) {
			return {
				left: Math.floor(left),
				top: Math.floor(top)
			};
		}
		const rect = this.panel.getBoundingClientRect();
		const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
		const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
		const minVisibleWidth = Math.min(rect.width, 160);
		const tabsRow = this.container?.querySelector(".ope-openpose-shell-tabs-row");
		const tabsRowHeight = tabsRow?.getBoundingClientRect().height || 44;
		const minVisibleTop = Math.min(rect.height, Math.max(24, Math.floor(tabsRowHeight)));
		const minLeft = Math.floor(minVisibleWidth - rect.width);
		const maxLeft = Math.floor(viewportWidth - minVisibleWidth);
		const minTop = 0;
		const maxTop = Math.floor(viewportHeight - minVisibleTop);
		return {
			left: Math.min(maxLeft, Math.max(minLeft, Math.floor(left))),
			top: Math.min(maxTop, Math.max(minTop, Math.floor(top)))
		};
	}

	onPanelDragMouseMove(event) {
		if (!this.isPanelDragging || this.isMaximized || !this.panel) {
			return;
		}
		const unclampedLeft = event.clientX - this.panelDragOffsetX;
		const unclampedTop = event.clientY - this.panelDragOffsetY;
		const clamped = this.clampPanelPosition(unclampedLeft, unclampedTop);
		this.panel.style.setProperty("left", `${clamped.left}px`, "important");
		this.panel.style.setProperty("top", `${clamped.top}px`, "important");
	}

	onPanelDragMouseDown(event) {
		if (this.isMaximized || !this.panel || !this.panelDragHandle) {
			return;
		}
		if (event.button !== 0) {
			return;
		}
		const rect = this.panel.getBoundingClientRect();
		this.panelDragOffsetX = event.clientX - rect.left;
		this.panelDragOffsetY = event.clientY - rect.top;
		this.isPanelDragging = true;
		this.panelDragHandle.classList.add("ope-dragging");
		document.addEventListener("mousemove", this._panelDragMouseMoveHandler);
		document.addEventListener("mouseup", this._panelDragMouseUpHandler);
		event.preventDefault();
	}

	schedulePanelLayout() {
		if (this._layoutRaf) {
			return;
		}
		this._layoutRaf = requestAnimationFrame(() => {
			this._layoutRaf = null;
			this.applyPanelLayout();
		});
	}

	applyPanelLayout() {
		if (!this.panel) {
			return;
		}
		const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
		const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
		const baseMarginX = Math.max(0, Number(this.panelMarginX) || 0);
		const baseMarginY = Math.max(0, Number(this.panelMarginY) || 0);
		const maxWidth = Math.max(0, Number(this.panelMaxWidth) || 0);
		const restoreWidth = Math.max(0, Number(this.panelRestoreWidth) || 0);
		const restoreHeight = Math.max(0, Number(this.panelRestoreHeight) || 0);
		const maximizeMargin = Math.max(0, Number(this.panelMaximizedMargin) || 0);

		// Auto-maximize at narrow widths (responsive behavior)
		const autoMaximizeThreshold = 900;
		if (viewportWidth <= autoMaximizeThreshold) {
			if (!this.isMaximized) {
				this.stopPanelDrag();
				this.isMaximized = true;
				this.updateMaximizeButton();
			}
		}

		const marginX = this.isMaximized ? maximizeMargin : baseMarginX;
		const marginY = this.isMaximized ? maximizeMargin : baseMarginY;

		let width = viewportWidth - marginX * 2;
		let height = viewportHeight - marginY * 2;
		let left = marginX;
		let top = marginY;

		if (!this.isMaximized) {
			if (restoreWidth > 0) {
				width = Math.min(width, restoreWidth);
			}
			if (restoreHeight > 0) {
				height = Math.min(height, restoreHeight);
			}
			if (maxWidth > 0) {
				width = Math.min(width, maxWidth);
			}
			left = Math.max(marginX, Math.floor((viewportWidth - width) / 2));
			top = Math.max(marginY, Math.floor((viewportHeight - height) / 2));
		}

		if (width <= 0) {
			width = viewportWidth;
			left = 0;
		}
		if (height <= 0) {
			height = viewportHeight;
			top = 0;
		}

		width = Math.max(0, Math.floor(width));
		height = Math.max(0, Math.floor(height));
		left = Math.max(0, Math.floor(left));
		top = Math.max(0, Math.floor(top));

		this.panel.style.cssText = `
            position: fixed !important;
            width: ${width}px !important;
            height: ${height}px !important;
            left: ${left}px !important;
            top: ${top}px !important;
            z-index: 1000 !important;
            margin: 0 !important;
        `;
		this.panel.classList.toggle("ope-openpose-modal-maximized", this.isMaximized);

		const footer = this.panel.footer || this.panel.querySelector(".dialog-footer");
		if (footer) {
			footer.classList.add("ope-openpose-native-footer");
		}
		const dialogContent = this.panel.querySelector(".dialog-content");
		if (dialogContent) {
			dialogContent.classList.add("ope-openpose-dialog-content");
			dialogContent.style.height = `${Math.max(0, height - this.getPanelHeaderHeight())}px`;
		}
		this.updatePanelDragHandleState();

		// Recalculate canvas view scale after panel layout changes.
		// IMPORTANT: Do NOT change canvas logical dimensions (canvasWidth/canvasHeight)
		// They must remain as defined in the node JSON. Only recalculate the display scale.
		if (this.renderer && this.canvasStage) {
			// Wait for the CSS size transition to finish before refitting the canvas.
			// clientWidth/clientHeight during a CSS transition return the mid-animation
			// value, so running scheduleCanvasFit() immediately via RAF would compute
			// the wrong available area.  Listen for transitionend on the panel element
			// and gate on 'width' so the handler fires exactly once per layout change.
			if (this._fitAfterTransition) {
				this.panel.removeEventListener('transitionend', this._fitAfterTransition);
				this._fitAfterTransition = null;
			}
			const handler = (e) => {
				if (e.target !== this.panel || e.propertyName !== 'width') return;
				this.panel.removeEventListener('transitionend', handler);
				this._fitAfterTransition = null;
				this.scheduleCanvasFit();
			};
			this._fitAfterTransition = handler;
			this.panel.addEventListener('transitionend', handler);
		}
	}

	getMaxUsablePanelWidth() {
		const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
		const baseMarginX = Math.max(0, Number(this.panelMarginX) || 0);
		const maxWidth = Math.max(0, Number(this.panelMaxWidth) || 0);
		const maximizeMargin = Math.max(0, Number(this.panelMaximizedMargin) || 0);
		const marginX = this.isMaximized ? maximizeMargin : baseMarginX;
		let width = viewportWidth - marginX * 2;
		if (maxWidth > 0) {
			width = Math.min(width, maxWidth);
		}
		return Math.max(0, Math.floor(width));
	}

	setMaximized(isMaximized) {
		const nextMaximized = Boolean(isMaximized);
		if (nextMaximized && !this.isMaximized) {
			this.stopPanelDrag();
		}
		this.isMaximized = nextMaximized;
		this.panel?.classList?.toggle("ope-openpose-modal-maximized", this.isMaximized);
		this.updateMaximizeButton();
		this.updatePanelDragHandleState();
		this.schedulePanelLayout();
		
		// Persist maximize state
		setPersistedSetting(PANEL_MAXIMIZED_KEY, this.isMaximized ? "true" : "false");
	}

	toggleMaximize() {
		this.setMaximized(!this.isMaximized);
	}

	updateMaximizeButton() {
		if (!this.maximizeButton) {
			return;
		}
		this.maximizeButton.textContent = this.isMaximized ? "\u{1F5D7}" : "\u{1F5D6}";
		this.maximizeButton.title = this.isMaximized ? "Restore" : "Maximize";
	}

	normalizePoseName(rawName) {
		if (!rawName || typeof rawName !== "string") {
			return "";
		}
		return rawName.toLowerCase();
	}

	createTitlebarButtons() {
		const header =
			this.panel?.header ||
			this.panel?.querySelector(".panel-header") ||
			this.panel?.querySelector(".header");
		if (!header) {
			return;
		}
		const closeBtn =
			header.querySelector(".panel-close") ||
			header.querySelector("button.close") ||
			header.querySelector(".close");
		if (closeBtn) {
			closeBtn.classList.add("ope-openpose-native-close");
		}
		header.classList.add("ope-openpose-native-header");
	}

	updateRemoveState() {
		if (!this.removeButton) {
			return;
		}
		// Use renderer API to check if a pose is selected
		const selectedIndex = this.renderer.getSelectedPoseIndex();
		const enabled = selectedIndex >= 0;
		this.removeButton.disabled = !enabled;
		this.removeButton.style.opacity = enabled ? "1" : "0.5";
		this.removeButton.style.cursor = enabled ? "pointer" : "not-allowed";
		this.removeButton.style.background = enabled
			? "var(--openpose-btn-bg)"
			: "var(--openpose-btn-disabled-bg)";
	}

	setupTabs(container) {
		this.tabButtons = Array.from(container.querySelectorAll(".openpose-tab"));
		this.mainLayout = container.querySelector(".openpose-main");
		this.tabButtons.forEach((button) => {
			if (button.dataset.tabReady) {
				return;
			}
			button.dataset.tabReady = "1";
			button.addEventListener("click", () => {
				const tab = button.dataset.tab || "editor";
				this.setActiveTab(tab);
			});
		});
		const desiredTab = this.activeTab || "editor";
		const hasDesired = this.tabButtons.some((btn) => btn.dataset.tab === desiredTab);
		this.setActiveTab(hasDesired ? desiredTab : "editor");
	}

	getTabStyleConfig() {
		return {
			tabBg: this.tabBg,
			tabInactiveText: this.tabInactiveText,
			tabActiveText: this.tabActiveText,
			tabActiveBg: this.tabActiveBg,
			tabHoverText: this.tabHoverText,
			tabActiveBorder: this.tabActiveBorder,
			tabShadow: this.tabShadow
		};
	}

	setSidebarsVisible(visible) {
		const sidebars = [this.leftSidebar, this.rightSidebar];
		const placeholders = [this.leftSidebarPlaceholder, this.rightSidebarPlaceholder];
		sidebars.forEach((sidebar) => {
			if (!sidebar) {
				return;
			}
			sidebar.hidden = !visible;
			sidebar.setAttribute("aria-hidden", visible ? "false" : "true");
			if (visible) {
				const prev = sidebar.dataset.prevDisplay || "flex";
				sidebar.style.display = prev;
				delete sidebar.dataset.prevDisplay;
			} else {
				if (!sidebar.dataset.prevDisplay) {
					sidebar.dataset.prevDisplay = sidebar.style.display || "flex";
				}
				sidebar.style.display = "none";
			}
		});
		placeholders.forEach((sidebar) => {
			if (!sidebar) {
				return;
			}
			if (visible) {
				sidebar.style.display = "none";
			} else {
				sidebar.style.display = "flex";
			}
		});
	}

	setCanvasAreaVisible(visible) {
		if (!this.canvasArea) {
			return;
		}
		if (visible) {
			const prev = this.canvasArea.dataset.prevDisplay || "flex";
			this.canvasArea.style.display = prev;
			delete this.canvasArea.dataset.prevDisplay;
		} else {
			if (!this.canvasArea.dataset.prevDisplay) {
				this.canvasArea.dataset.prevDisplay = this.canvasArea.style.display || "flex";
			}
			this.canvasArea.style.display = "none";
		}
	}


	setOverlayPlaceholderWidths(compact = false) {
		const leftPlaceholder = this.leftSidebarPlaceholder;
		const rightPlaceholder = this.rightSidebarPlaceholder;
		if (!leftPlaceholder || !rightPlaceholder) {
			return;
		}
		const leftVisible = this.leftSidebar && !this.leftSidebar.hidden;
		const rightVisible = this.rightSidebar && !this.rightSidebar.hidden;
		if (leftVisible || rightVisible) {
			leftPlaceholder.style.display = "none";
			rightPlaceholder.style.display = "none";
			leftPlaceholder.style.flex = "0 0 auto";
			rightPlaceholder.style.flex = "0 0 auto";
			leftPlaceholder.style.width = "0";
			rightPlaceholder.style.width = "0";
			leftPlaceholder.style.minWidth = "0";
			rightPlaceholder.style.minWidth = "0";
			return;
		}
		if (compact) {
			leftPlaceholder.style.display = "none";
			rightPlaceholder.style.display = "none";
			leftPlaceholder.style.flex = "0 0 auto";
			rightPlaceholder.style.flex = "0 0 auto";
			leftPlaceholder.style.width = "0";
			rightPlaceholder.style.width = "0";
			leftPlaceholder.style.minWidth = "0";
			rightPlaceholder.style.minWidth = "0";
			return;
		}
		const marginWidth = "12%";
		leftPlaceholder.style.display = "flex";
		rightPlaceholder.style.display = "flex";
		leftPlaceholder.style.flex = `0 0 ${marginWidth}`;
		rightPlaceholder.style.flex = `0 0 ${marginWidth}`;
		leftPlaceholder.style.width = marginWidth;
		rightPlaceholder.style.width = marginWidth;
		leftPlaceholder.style.minWidth = "80px";
		rightPlaceholder.style.minWidth = "80px";
	}

	setActiveTab(tabName) {
		const nextTab = tabName || "editor";
		this.activeTab = nextTab;
		poseEditorOverlay.applyTabButtonStyles(this.tabButtons, nextTab, this.getTabStyleConfig());

		if (nextTab === "editor") {
			this.moduleManager?.deactivateActive();
			this.setCanvasAreaVisible(true);
			this.setSidebarsVisible(true);
			this.setOverlayPlaceholderWidths(false);
			this.setSidebarControlsDisabled(false);
			this.setBackgroundControlsEnabled(!!this.backgroundImage);
			this.scheduleCanvasFit();
			return;
		}

		this.setSidebarControlsDisabled(true);
		this.setBackgroundControlsEnabled(false);
		const handled = this.moduleManager?.activate(nextTab);
		if (handled === false) {
			this.setActiveTab("editor");
		}
	}

	toggleOverlay(name) {
		const nextTab = this.activeTab === name ? "editor" : name;
		this.setActiveTab(nextTab);
	}

	async loadPresetsFromJson() {
		this.presetsLoading = true;
		this.renderPresetPreviewLoading();
		this.moduleManager?.notifyPresetsLoadStart?.();
		const defaultPreset = {
			id: DEFAULT_POSE_COCO18.id,
			label: DEFAULT_POSE_COCO18.label,
			keypoints: cloneKeypoints(DEFAULT_POSE_COCO18.keypoints),
			canvas_width: DEFAULT_CANVAS_WIDTH,
			canvas_height: DEFAULT_CANVAS_HEIGHT
		};
		// Mark built-in preset as plugin-provided
		defaultPreset.group = "Built-in poses";

		// Built-in defaults are defined statically above; no runtime JSON load required
		try {
			// Fetch list of pose files from the server
			const listResponse = await fetch(POSES_LIST_URL, { cache: "no-store" });
			if (!listResponse.ok) {
				throw new Error(`Failed to list pose files: ${listResponse.status}`);
			}
			const { files } = await listResponse.json();

			if (!files || !files.length) {
				throw new Error("No pose files found.");
			}

			// Load each pose file and merge presets
			const allPresets = [];
			let baseWidth = 512;
			let baseHeight = 512;
			let firstFile = true;

			for (const filename of files) {
				try {
					const fileResponse = await fetch(POSES_FILE_URL + filename, { cache: "no-store" });
					if (!fileResponse.ok) {
						console.warn(`[OpenPose Studio] Failed to load ${filename}`);
						this.moduleManager?.notifyPresetFileError?.({
							filename,
							reason: "No poses found in this file. Try selecting another file. You can also verify it's valid JSON using an online validator like jsonlint.com"
						});
						continue;
					}

					let payload;
					try {
						payload = await fileResponse.json();
					} catch (parseError) {
						console.warn(`[OpenPose Studio] Invalid JSON in ${filename}:`, parseError);
						this.moduleManager?.notifyPresetFileError?.({
							filename,
							reason: "Invalid JSON format"
						});
						continue;
					}

					const normalized = normalizePresetData(payload, filename);
					if (!normalized || !normalized.presets || normalized.presets.length === 0) {
						let reason = "Unsupported format";
						if (normalized && normalized.presets && normalized.presets.length === 0) {
							reason = "Empty collection";
						} else if (Array.isArray(payload.people) || Array.isArray(payload.keypoints)) {
							reason = "Missing or invalid keypoints";
						} else if (payload && typeof payload === "object" && Object.keys(payload).length > 0) {
							reason = "No valid poses found";
						}
						this.moduleManager?.notifyPresetFileError?.({ filename, reason });
						console.warn(`[OpenPose Studio] Invalid preset file: ${filename} (${reason})`);
						continue;
					}

					const fileInfo = { filename, payload, normalized };
					this.moduleManager?.notifyPresetFileLoaded?.(fileInfo);

					// Use first valid file's canvas size as base
					if (firstFile) {
						baseWidth = normalized.baseWidth;
						baseHeight = normalized.baseHeight;
						firstFile = false;
					}

					// Determine group based on path and format
					let group;
					const slashIndex = filename.lastIndexOf("/");

					if (slashIndex !== -1) {
						// File is in a subdirectory - use subdirectory path as group
						group = filename.substring(0, slashIndex).replace(/[_-]/g, " ");
					} else {
						// File is in root - use filename for category, "User-defined" for OpenPose
						const baseName = filename.replace(/\.json$/i, "").replace(/[_-]/g, " ");
						group = normalized.format === "dictionary" ? baseName : "User-defined";
					}

					for (const preset of normalized.presets) {
						// Validate the preset data
						const validationError = this.validatePresetData(preset.keypoints, preset.label);
						
						const presetEntry = {
							id: `${filename}:${preset.id}`,
							label: preset.label,
							group,
							keypoints: cloneKeypoints(preset.keypoints),
							faceKeypoints: Array.isArray(preset.faceKeypoints)
								? preset.faceKeypoints.map((group) => (
									Array.isArray(group) ? cloneKeypoints(group) : null
								))
								: null,
							handLeftKeypoints: Array.isArray(preset.handLeftKeypoints)
								? preset.handLeftKeypoints.map((group) => (
									Array.isArray(group) ? cloneKeypoints(group) : null
								))
								: null,
							handRightKeypoints: Array.isArray(preset.handRightKeypoints)
								? preset.handRightKeypoints.map((group) => (
									Array.isArray(group) ? cloneKeypoints(group) : null
								))
								: null,
							canvas_width: Number(preset.canvas_width) || Number(preset.width) || normalized.baseWidth,
							canvas_height: Number(preset.canvas_height) || Number(preset.height) || normalized.baseHeight,
							validationError  // Track validation error if any
						};
						this.moduleManager?.decoratePreset?.(presetEntry, fileInfo);
						allPresets.push(presetEntry);
					}
				} catch (fileError) {
					console.warn(`[OpenPose Studio] Error loading ${filename}:`, fileError);
					this.moduleManager?.notifyPresetFileError?.({
						filename,
						reason: "Failed to process file"
					});
				}
			}

			if (allPresets.length > 0) {
				this.presets = [
					defaultPreset,
					...allPresets
				];
                this.presetBaseWidth = baseWidth;
                this.presetBaseHeight = baseHeight;
            } else {
				// No external presets; keep only the built-in default preset
				this.presets = [defaultPreset];
                this.presetBaseWidth = DEFAULT_CANVAS_WIDTH;
                this.presetBaseHeight = DEFAULT_CANVAS_HEIGHT;
            }
            this.presetsLoading = false;
            this.presetSelect.disabled = false;
            this.populatePresetSelect();
            this.renderPresetPreview(this.presetSelect?.value);
			this.moduleManager?.notifyPresetsLoaded?.({ presets: this.presets });
        } catch (error) {
            this.presets = [defaultPreset];
            this.presetBaseWidth = DEFAULT_CANVAS_WIDTH;
            this.presetBaseHeight = DEFAULT_CANVAS_HEIGHT;
            this.presetsLoading = false;
            this.presetSelect.disabled = false;
            this.populatePresetSelect();
            this.renderPresetPreview(this.presetSelect?.value);
			this.moduleManager?.notifyPresetsLoaded?.({ presets: this.presets, error });
            console.warn("[OpenPose Studio] Preset load failed, using defaults.", error);
        }
	}

	confirmAndClose() {
		// Enable committing to node, save changes, and mark as confirmed
		this.allowCommitToNode = true;
		this.saveToNode(true);
		this.confirmed = true;
		this.panel.close();
	}

	hasUnsavedChanges() {
		if (this.confirmed || this._initializing) {
			return false;
		}
		const current = this.serializeJSON();
		return current !== (this.originalPose || "");
	}

	requestClose() {
		this.panel.close();
	}

	cancelChanges() {
		// Restore the original pose from the deep-cloned snapshot
		// This ensures that all edits made during the session are discarded
		if (!this.node.properties) {
			this.node.properties = {};
		}
		
		// Restore from the string representation
		this.node.properties.savedPose = this.originalPose;
		
		// Restore the widget value
		if (this.node.jsonWidget) {
			this.node.jsonWidget.value = this.originalPose;
		}
		
		// Trigger preview update to reflect restoration
		if (this.node.updatePreview) {
			this.node.updatePreview();
		}
	}

	onKeyDown(e) {
		// Global keyboard handler that routes to tab-specific shortcut handlers
		const tagName = (e.target?.tagName || "").toLowerCase();
		if (tagName === "input" || tagName === "textarea" || tagName === "select" || e.target?.isContentEditable) {
			return;
		}
		// Global shortcuts
		if (e.key === "Escape") {
			this.requestClose();
			e.preventDefault();
			e.stopImmediatePropagation();
			return;
		}
		// Tab-specific shortcuts
		if (this.activeTab === "editor") {
			this.handleEditorKeyDown(e);
			return;
		}
		if (this.moduleManager?.handleKeyDown(e)) {
			e.preventDefault();
			e.stopImmediatePropagation();
			return;
		}
	}

	/**
	 * Detect the COCO format of poses currently on the canvas.
	 * @returns {"coco17"|"coco18"|null} The format, or null if canvas is empty.
	 */
	getCanvasFormat() {
		if (!this.renderer) {
			return null;
		}
		const poses = this.renderer.getPoses();
		if (poses.length === 0) {
			return null;
		}
		// Use stored per-pose formatId; fall back to neck-presence heuristic for old data
		const firstPose = poses[0];
		if (firstPose.formatId) {
			return firstPose.formatId;
		}
		const neckKeypoint = firstPose.keypoints[1];
		const neckIsMissing = !neckKeypoint || !isKeypointPresent(neckKeypoint);
		return neckIsMissing ? "coco17" : "coco18";
	}

	/**
	 * Check whether an incoming pose's format is compatible with existing canvas poses.
	 * If the canvas is empty, any format is allowed.
	 * @param {Array} keypoints - The incoming pose keypoints (18-element array)
	 * @returns {boolean} True if compatible (or canvas is empty), false if blocked.
	 */
	checkFormatCompatibility(keypoints) {
		const canvasFormat = this.getCanvasFormat();
		if (canvasFormat === null) {
			return true;
		}
		const incomingIsCoco17 = !isValidKeypoint(keypoints[1]);
		const incomingFormat = incomingIsCoco17 ? "coco17" : "coco18";
		if (canvasFormat !== incomingFormat) {
			const canvasLabel = getFormatDisplayName(canvasFormat);
			const incomingLabel = getFormatDisplayName(incomingFormat);
			showToast(
				"error",
				t("toast.format_incompatibility_title"),
				t("toast.format_incompatibility_detail", { canvasLabel, incomingLabel }),
				7000
			);
			return false;
		}
		return true;
	}

	hasPoseData(poseJson) {
		/**
		 * Check if the given pose JSON string contains actual keypoint data.
		 * Returns false if the JSON is empty, falsy, or has no valid keypoints.
		 */
		try {
			let data = parsePosePayload(poseJson);
			if (!data || typeof data !== "object") {
				return false;
			}
			if (Array.isArray(data)) {
				if (data.length === 1 && data[0] !== null && typeof data[0] === "object" && !Array.isArray(data[0])) {
					data = data[0];
				} else {
					return false;
				}
			}

			// Check editor format: has keypoints array with actual data
			if (Array.isArray(data.keypoints) && data.keypoints.length > 0) {
				// Flatten nested keypoints if needed
				let flatKeypoints = [];
				for (const group of data.keypoints) {
					if (Array.isArray(group)) {
						flatKeypoints.push(...group);
					}
				}
				// Must have at least some valid keypoints
				if (flatKeypoints.length > 0 && flatKeypoints.some(point => isValidKeypoint(point))) {
					return true;
				}
			}

			// Check POSE_KEYPOINT format: has people with pose_keypoints_2d
			if (Array.isArray(data.people) && data.people.length > 0) {
				for (const person of data.people) {
					if (person && Array.isArray(person.pose_keypoints_2d) && person.pose_keypoints_2d.length > 0) {
						const step = person.pose_keypoints_2d.length % 3 === 0 ? 3 : 2;
						// Check if any valid keypoints exist (format: [x, y, conf, ...] or [x, y, ...])
						for (let i = 0; i < person.pose_keypoints_2d.length; i += step) {
							const x = person.pose_keypoints_2d[i];
							const y = person.pose_keypoints_2d[i + 1];
							if (Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0) {
								return true;
							}
						}
					}
				}
			}

			// Check dictionary/category format
			const keys = Object.keys(data);
			for (const key of keys) {
				const pose = data[key];
				if (!pose || typeof pose !== "object") continue;

				// Check for pose_keypoints_2d in this pose
				if (Array.isArray(pose.pose_keypoints_2d) && pose.pose_keypoints_2d.length > 0) {
					const step = pose.pose_keypoints_2d.length % 3 === 0 ? 3 : 2;
					for (let i = 0; i < pose.pose_keypoints_2d.length; i += step) {
						const x = pose.pose_keypoints_2d[i];
						const y = pose.pose_keypoints_2d[i + 1];
						if (Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0) {
							return true;
						}
					}
				}

				// Check for people array in this pose
				if (Array.isArray(pose.people) && pose.people.length > 0) {
					for (const person of pose.people) {
						if (person && Array.isArray(person.pose_keypoints_2d) && person.pose_keypoints_2d.length > 0) {
							const step = person.pose_keypoints_2d.length % 3 === 0 ? 3 : 2;
							for (let i = 0; i < person.pose_keypoints_2d.length; i += step) {
								const x = person.pose_keypoints_2d[i];
								const y = person.pose_keypoints_2d[i + 1];
								if (Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0) {
									return true;
								}
							}
						}
					}
				}
			}

			return false;
		} catch (error) {
			// Invalid JSON or parse error - no pose data
			return false;
		}
	}

	extractCanvasDimensionsFromPose(poseJson) {
		/**
		 * Extract canvas width and height from saved pose JSON.
		 * Returns {width, height} object if valid dimensions found, null otherwise.
		 * This is used to set correct canvas size BEFORE Canvas2D initialization to avoid resize flash.
		 */
		if (!poseJson || typeof poseJson !== "string") {
			return null;
		}

		try {
			let data = JSON.parse(poseJson);
			if (!data || typeof data !== "object") {
				return null;
			}
			if (Array.isArray(data)) {
				if (data.length === 1 && data[0] !== null && typeof data[0] === "object" && !Array.isArray(data[0])) {
					data = data[0];
				} else {
					return null;
				}
			}

			// Check editor format: width and height at top level
			const width = Number(data.width);
			const height = Number(data.height);
			if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
				return { width, height };
			}

			// Check POSE_KEYPOINT format: canvas_width and canvas_height
			const canvasWidth = Number(data.canvas_width);
			const canvasHeight = Number(data.canvas_height);
			if (Number.isFinite(canvasWidth) && Number.isFinite(canvasHeight) && canvasWidth > 0 && canvasHeight > 0) {
				return { width: canvasWidth, height: canvasHeight };
			}

			return null;
		} catch (error) {
			// Invalid JSON - no dimensions to extract
			return null;
		}
	}

    restoreSelection(selectionIndex) {
        if (!this.renderer) {
            return;
        }
        const poses = this.renderer.getPoses();
        if (
            typeof selectionIndex !== "number"
            || selectionIndex < 0
            || selectionIndex >= poses.length
        ) {
            this.renderer.setSelectedPose(null);
        } else {
            this.renderer.setSelectedPose(selectionIndex);
        }
        this.updateRemoveState();
    }


}

Object.assign(OpenPosePanel.prototype, poseEditorPresetWorkflow);
Object.assign(OpenPosePanel.prototype, poseEditorCanvasWorkflow);
Object.assign(OpenPosePanel.prototype, poseEditorSubsystemWorkflow);

app.registerExtension({
    name: "Nui.OpenPoseEditor",

    // Listen for executed events directly on the api so the OpenPose Studio
    // node preview is always refreshed after execution, regardless of whether
    // the pose_json input is a typed widget value, a connected STRING link, or
    // a connected POSE_KEYPOINT link (the Python side serialises POSE_KEYPOINT
    // to JSON and echoes it back through the UI dict in all cases).
    async setup(app) {
        app.api.addEventListener("executed", ({ detail }) => {
            const nodeId = detail.display_node || detail.node;
            const node = app.graph.getNodeById(nodeId);
            if (!node || node.comfyClass !== "OpenPoseStudio") return;
            const poseJson = detail.output?.pose_json?.[0];
            if (typeof poseJson !== "string" || poseJson.trim().length === 0) return;
            if (!node.properties) node.properties = {};
            node.properties.savedPose = poseJson;
            if (node.jsonWidget) node.jsonWidget.value = poseJson;
            if (typeof node.updatePreview === "function") node.updatePreview();
        });
    },

	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		if (nodeData.name === "OpenPoseStudio") {
            const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
            nodeType.prototype.getExtraMenuOptions = function (_, options) {
                const r = getExtraMenuOptions ? getExtraMenuOptions.apply(this, arguments) : undefined;
                options.push({
                    content: "Open in Editor",
                    callback: () => {
                        if (typeof this.openOpenPoseEditor === "function") {
                            this.openOpenPoseEditor();
                            return;
                        }
                        const w = this.widgets?.find(w => (w.name || "").toLowerCase().includes("open editor"));
                        if (w?.callback) {
                            w.callback();
                        }
                    },
                });
                return r;
            };

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                if (!this.properties) {
                    this.properties = {};
                    this.properties.savedPose = "";
                }

                this.serialize_widgets = true;

                // Find the pose_json widget (created by Python INPUT_TYPES)
                this.jsonWidget = this.widgets.find(w => w.name === "pose_json");

                this.openOpenPoseEditor = () => {
                    const graphCanvas = LiteGraph.LGraphCanvas.active_canvas
                    if (graphCanvas == null)
                        return;

                    // Create backdrop overlay to block interaction with workflow
                    const backdrop = document.createElement("div");
					backdrop.className = "openpose-backdrop ope-openpose-shell-backdrop ope-openpose-modal-backdrop";
                    backdrop.style.cssText = `
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100vw;
                        height: 100vh;
                        z-index: 999;
                    `;
                    document.body.appendChild(backdrop);

                    const panel = graphCanvas.createPanel("OpenPose Studio", { closable: true });
                    panel.node = this;
                    panel.classList.add("openpose-editor");
                    panel.backdrop = backdrop;
                    backdrop.addEventListener("click", (event) => {
                        if (event.target === backdrop) {
                            panel.close();
                        }
                    });

                    this.openPosePanel = new OpenPosePanel(panel, this);
                    document.body.appendChild(this.openPosePanel.panel);
                    const _originalClose = panel.close.bind(panel);
					panel.close = function() {
						if (panel.classList.contains("ope-is-closing") || panel.classList.contains("ope-openpose-modal-closing")) { return; }
						panel.classList.add("ope-is-closing", "ope-openpose-modal-closing");
						backdrop.classList.add("ope-is-closing", "ope-openpose-modal-closing");
						panel.classList.remove("ope-is-open", "ope-openpose-modal-open");
						backdrop.classList.remove("ope-is-open", "ope-openpose-modal-open");
                        const onEnd = (e) => {
							if (e.target === panel && e.propertyName === "opacity") {
                                panel.removeEventListener("transitionend", onEnd);
                                _originalClose();
                            }
                        };
                        panel.addEventListener("transitionend", onEnd);
                    };
                    requestAnimationFrame(() => {
                        void panel.offsetWidth;
						panel.classList.remove("ope-is-closing", "ope-openpose-modal-closing");
						backdrop.classList.remove("ope-is-closing", "ope-openpose-modal-closing");
						panel.classList.add("ope-is-open", "ope-openpose-modal-open");
						backdrop.classList.add("ope-is-open", "ope-openpose-modal-open");
                    });
                };

                // Add preview image widget at the end (like Load Image node)
                this.previewWidget = this.addCustomWidget({
                    name: "preview",
                    type: "image",
                    value: null,
                    draw: function(ctx, node, widgetWidth, y, widgetHeight) {
                        const margin = 10;
                        const size = Math.min(widgetWidth - margin * 2, 180);
                        const x = (widgetWidth - size) / 2;

                        const theme = getComfyThemeSafe();
                        const smokedGlass = getSmokedGlassCanvasStyle(theme);
                        const previewSurface = smokedGlass.surface;
                        const previewBorder = smokedGlass.border;
                        const shadowSpec = smokedGlass.shadowSpec;
                        const shadowColor = smokedGlass.shadowColor;

                        if (previewSurface) {
                            ctx.fillStyle = previewSurface;
                            ctx.fillRect(x, y, size, size);
                        }
                        if (previewSurface && shadowSpec && shadowColor) {
                            ctx.save();
                            ctx.shadowColor = shadowColor;
                            ctx.shadowBlur = shadowSpec.blur;
                            ctx.shadowOffsetX = shadowSpec.x;
                            ctx.shadowOffsetY = shadowSpec.y;
                            const inset = Math.max(1, Math.round(shadowSpec.blur / 7));
                            ctx.fillStyle = previewSurface;
                            ctx.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
                            ctx.restore();
                        }
                        const isPreviewHovered = !!node?._openposePreviewHover;
                        const previewHoverBorder = theme?.primaryBg || "#2f8cff";

                        // Draw image if available
                        if (this.image && this.image.complete) {
                            ctx.drawImage(this.image, x, y, size, size);
                        } else {
                            // Draw placeholder text
                            ctx.fillStyle = "#555";
                            ctx.font = "12px Arial";
                            ctx.textAlign = "center";
                            ctx.textBaseline = "middle";
                            ctx.fillText("No pose", x + size / 2, y + size / 2);
                        }

                        // Subtle edit affordance overlay (always visible)
                        const iconPadding = Math.round(Math.max(8, size * 0.05));
                        const iconSize = Math.round(Math.max(12, size * 0.12));
                        const iconInset = Math.round(Math.max(4, iconSize * 0.25));
                        const iconBox = iconSize + iconInset * 2;
                        const iconX = x + size - iconPadding - iconBox;
                        const iconY = y + size - iconPadding - iconBox;
                        const iconBg = theme.isLight ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.22)";
                        const iconFg = theme.isLight ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.78)";
                        const roundRect = (rc, rx, ry, rw, rh, rr) => {
                            const r = Math.min(rr, rw / 2, rh / 2);
                            rc.beginPath();
                            rc.moveTo(rx + r, ry);
                            rc.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
                            rc.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
                            rc.arcTo(rx, ry + rh, rx, ry, r);
                            rc.arcTo(rx, ry, rx + rw, ry, r);
                            rc.closePath();
                        };

                        ctx.save();
                        ctx.shadowColor = theme.isLight ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.35)";
                        ctx.shadowBlur = 4;
                        roundRect(ctx, iconX, iconY, iconBox, iconBox, Math.round(iconBox * 0.22));
                        ctx.fillStyle = iconBg;
                        ctx.fill();
                        ctx.shadowBlur = 0;
                        ctx.fillStyle = iconFg;
                        ctx.font = `${iconSize}px "Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText("✎", iconX + iconBox / 2, iconY + iconBox / 2 + 0.5);
                        ctx.restore();

                        // Border drawn last so hover color is visible over preview image.
                        if (previewBorder) {
                            ctx.strokeStyle = isPreviewHovered ? previewHoverBorder : previewBorder;
                            ctx.lineWidth = 1;
                            ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
                        }
                    },
                    computeSize: function() {
                        return [200, 190];
                    },
                    serialize: false
                });
                this.previewWidget.image = null;
                this.previewWidget.onPointerDown = (pointer, node, canvas) => {
                    if (!node || typeof node.openOpenPoseEditor !== "function") {
                        return false;
                    }
                    pointer.onClick = () => {
                        debugLog("[OpenPose Studio] Preview click -> open editor", {
                            nodeId: node.id
                        });
                        node.openOpenPoseEditor();
                    };
                    return true;
                };

                const previewNode = this;
                const setPreviewCursor = (active, canvas) => {
                    if (!canvas || !canvas.canvas) {
                        return;
                    }
                    if (previewNode._openposePreviewHover !== active) {
                        previewNode._openposePreviewHover = active;
                        previewNode.setDirtyCanvas?.(true);
                    }
                    if (active) {
                        if (!previewNode._openposePreviewCursorActive) {
                            previewNode._openposePreviewCursorActive = true;
                            previewNode._openposePreviewCanvas = canvas;
                            if (canvas.state && previewNode._openposePreviewPrevCursorState === undefined) {
                                previewNode._openposePreviewPrevCursorState = canvas.state.shouldSetCursor;
                                canvas.state.shouldSetCursor = false;
                            }
                        }
                        canvas.canvas.style.cursor = "pointer";
                    } else if (previewNode._openposePreviewCursorActive) {
                        previewNode._openposePreviewCursorActive = false;
                        if (previewNode._openposePreviewCanvas?.state) {
                            previewNode._openposePreviewCanvas.state.shouldSetCursor =
                                previewNode._openposePreviewPrevCursorState !== undefined
                                    ? previewNode._openposePreviewPrevCursorState
                                    : true;
                        }
                        previewNode._openposePreviewPrevCursorState = undefined;
                        previewNode._openposePreviewCanvas = null;
                    }
                };

                const bindPreviewElement = (element) => {
                    if (!element || element.dataset?.openposePreviewBound) {
                        return;
                    }
                    element.dataset.openposePreviewBound = "1";
                    element.style.pointerEvents = "auto";
                    element.style.cursor = "pointer";
                    element.addEventListener("click", (event) => {
                        event.stopPropagation();
                        debugLog("[OpenPose Studio] Preview element click -> open editor", {
                            nodeId: previewNode.id
                        });
                        if (typeof previewNode.openOpenPoseEditor === "function") {
                            previewNode.openOpenPoseEditor();
                        }
                    });
                };

                if (this.previewWidget.element) {
                    bindPreviewElement(this.previewWidget.element);
                }

                const onMouseMove = this.onMouseMove;
                this.onMouseMove = function(e, pos, canvas) {
                    if (typeof onMouseMove === "function") {
                        onMouseMove.apply(this, arguments);
                    }
                    if (!canvas || typeof canvas.getWidgetAtCursor !== "function" || !this.previewWidget) {
                        return;
                    }
                    const overWidget = canvas.getWidgetAtCursor(this);
                    setPreviewCursor(overWidget === this.previewWidget, canvas);
                };

                const onMouseLeave = this.onMouseLeave;
                this.onMouseLeave = function(e) {
                    setPreviewCursor(false, this._openposePreviewCanvas || LiteGraph.LGraphCanvas.active_canvas);
                    if (typeof onMouseLeave === "function") {
                        return onMouseLeave.apply(this, arguments);
                    }
                };

                // Method to update preview
                this.updatePreview = () => {
                    if (this.previewWidget?.element) {
                        bindPreviewElement(this.previewWidget.element);
                    }
                    if (!this.jsonWidget && Array.isArray(this.widgets)) {
                        this.jsonWidget = this.widgets.find(w => w.name === "pose_json");
                    }
                    const widgetValue = this.jsonWidget ? this.jsonWidget.value : null;
                    const poseJson = (widgetValue && (typeof widgetValue !== "string" || widgetValue.trim().length > 0))
                        ? widgetValue
                        : this.properties.savedPose;
                    if (!poseJson) {
                        this.previewWidget.image = null;
                        this.setDirtyCanvas(true);
                        return;
                    }

                    const dataUrl = renderPoseToDataURL(poseJson);
                    if (dataUrl) {
                        const img = new Image();
                        img.onload = () => {
                            this.previewWidget.image = img;
                            this.setDirtyCanvas(true);
                        };
                        img.src = dataUrl;
                    } else {
                        this.previewWidget.image = null;
                        this.setDirtyCanvas(true);
                    }
                };

                // Sync incoming connected Pose JSON back into widget state and preview
                // after each server-side execution. Handled globally in the extension
                // setup() via api.addEventListener("executed", ...) to avoid relying
                // on the indirect node.onExecuted dispatch chain.

                // Set reasonable node size (will auto-expand for widgets)
                const targetSize = this.computeSize();
                targetSize[0] = Math.max(targetSize[0], 250);
                targetSize[1] = Math.max(targetSize[1], 280);
                this.setSize(targetSize);

                // Restore savedPose from properties on load and update preview
                requestAnimationFrame(() => {
                    if (this.properties.savedPose && this.jsonWidget) {
                        this.jsonWidget.value = this.properties.savedPose;
                    }
                    this.updatePreview();
                });
            }

            const onPropertyChanged = nodeType.prototype.onPropertyChanged;
            nodeType.prototype.onPropertyChanged = function(property, value) {
                if (property === "savedPose") {
                    if (this.jsonWidget) {
                        this.jsonWidget.value = value;
                    }
                    // Update preview when pose changes
                    if (this.updatePreview) {
                        this.updatePreview();
                    }
                }
                else if (onPropertyChanged) {
                    onPropertyChanged.apply(this, arguments)
                }
            }

            const onWidgetChanged = nodeType.prototype.onWidgetChanged;
            nodeType.prototype.onWidgetChanged = function(name, value, oldValue, widget) {
                if (name === "pose_json") {
                    if (!this.properties) {
                        this.properties = {};
                    }
                    if (typeof value === "string") {
                        this.properties.savedPose = value;
                    } else if (value && typeof value === "object") {
                        try {
                            this.properties.savedPose = JSON.stringify(value);
                        } catch {
                            // Ignore serialization errors to avoid breaking widget changes
                        }
                    }
                    if (this.updatePreview) {
                        this.updatePreview();
                    }
                }
                if (onWidgetChanged) {
                    return onWidgetChanged.apply(this, arguments);
                }
            }
            return;
        }
    }
});
