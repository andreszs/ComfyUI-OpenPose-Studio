/**
 * OpenPoseCanvas2D - Native Canvas 2D renderer for OpenPose Studio
 * No Fabric.js dependencies. Pure CanvasRenderingContext2D.
 */


import { getSkeletonEdges, getSkeletonEdgeColors, isValidKeypoint, PREVIEW_OUTLINE_STROKE, PREVIEW_OUTLINE_FILL } from "./utils.js";
import { COCO_KEYPOINTS, getFormat, detectFormat, detectFormatFromMetadata, DEFAULT_FORMAT_ID, isFormatEditAllowed } from "./formats/index.js";

const HAND_EDGES = [
	[0, 1], [1, 2], [2, 3], [3, 4],
	[0, 5], [5, 6], [6, 7], [7, 8],
	[0, 9], [9, 10], [10, 11], [11, 12],
	[0, 13], [13, 14], [14, 15], [15, 16],
	[0, 17], [17, 18], [18, 19], [19, 20]
];

const HAND_KEYPOINT_COLORS = [
	[100, 100, 100],
	[100, 0, 0], [150, 0, 0], [200, 0, 0], [255, 0, 0],
	[100, 100, 0], [150, 150, 0], [200, 200, 0], [255, 255, 0],
	[0, 100, 50], [0, 150, 75], [0, 200, 100], [0, 255, 125],
	[0, 50, 100], [0, 75, 150], [0, 100, 200], [0, 125, 255],
	[100, 0, 100], [150, 0, 150], [200, 0, 200], [255, 0, 255]
];

const EXTRA_KEYPOINT_EPSILON = 0.5;

// Palette for conditioning area overlays.  Colors are distinct and legible on
// both dark and light backgrounds, and chosen to avoid clashing with the red/
// green/blue OpenPose skeleton colors.
const AREA_OVERLAY_COLORS = [
	[41,  121, 255],  // Blue
	[255, 140,   0],  // Orange
	[0,   200,  80],  // Green
	[220,  50, 220],  // Magenta
	[0,   200, 230],  // Cyan
	[210, 180,   0],  // Gold
];

/**
 * Draw a rounded rectangle path on ctx.
 * Falls back to a plain rect when r === 0 or the dimensions are too small.
 */
function _drawRoundRect(ctx, x, y, w, h, r) {
	r = Math.min(Math.max(0, r), Math.min(w, h) / 2);
	if (r < 0.5) {
		ctx.rect(x, y, w, h);
		return;
	}
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y,     x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x,     y + h, r);
	ctx.arcTo(x,     y + h, x,     y,     r);
	ctx.arcTo(x,     y,     x + w, y,     r);
	ctx.closePath();
}

const isCanvas2DDebugEnabled = () => {
	if (typeof globalThis === "undefined") {
		return false;
	}
	return !!globalThis.OpenPoseEditorDebug?.canvas2d;
};

// Debug logging helper
function debugLog(...args) {
	if (!isCanvas2DDebugEnabled()) {
		return;
	}
	console.log(...args);
}


export class OpenPoseCanvas2D {
	       constructor(canvasElement, options = {}) {
		       debugLog('[OpenPoseCanvas2D] Constructor called with:', {
			       canvasElement,
			       canvasElementTagName: canvasElement?.tagName,
			       options
		       });
		       this.canvas = canvasElement;
		       this.ctx = canvasElement.getContext('2d');
		       debugLog('[OpenPoseCanvas2D] Context obtained:', {
			       hasContext: !!this.ctx,
			       contextType: typeof this.ctx,
			       canvasWidth: this.canvas.width,
			       canvasHeight: this.canvas.height
		       });
		
		// Logical size (matches JSON width/height)
		this.logicalWidth = options.logicalWidth || 768;
		this.logicalHeight = options.logicalHeight || 512;
		
		// State
		this.poses = []; // Array of {keypoints: Array(18) of {x,y} or null}
		this.selectedPoseIndex = null;
		this.hoveredKeypointId = null;
		this.sidebarHoveredKeypointId = null; // Track sidebar hover separately (takes priority)
		this.canvasHoveredKeypointId = null; // Track canvas hover separately
		this.canvasHoveredPoseIndex = null; // Track which pose is being hovered on canvas
		this.selectionBoxHovered = false; // Track if pointer is inside selection bounding box
		this.hoveredHandle = null; // Track which scale handle is being hovered ('nw', 'ne', etc.)
		this.preselectionPoseIndex = null; // Track which pose would be selected on click (hover preselection)
		this.activeFormatId = DEFAULT_FORMAT_ID; // Track the active format
		this.keypointEdits = false;

		// Conditioning area overlays (set from OpenPosePanel, not serialized)
		this.conditioningAreas = [];
		this.conditioningAreasVisible = true;
		// Per-area hidden state: Set of area indices (0-based) individually toggled off
		this.conditioningAreaHidden = new Set();
		// Hit-rects for the badge row — populated each draw, used for pointer hit-test
		this._areaBadgeHitRects = [];
		// True while the pointer is hovering any badge in the badge row
		this.isHoveringBadge = false;

		// Canvas hover debouncing
		this.canvasHoverDebounceTimer = null;
		this.pendingCanvasHoverId = null;
		this.pendingCanvasHoveredPoseIndex = null;
		
		// Grid
		this.gridEnabled = true;  // ENABLE GRID BY DEFAULT
		this.gridColor = 'rgba(220, 220, 220, 0.80)';  // Light gray, increased visibility
		this.gridSpacing = 64;  // Original spacing
		this.gridThickness = 1.25;
		
		// Background
		this.backgroundImage = null;
		this.backgroundMode = 'contain'; // 'contain' or 'cover'
		this.backgroundOpacity = 0.5;
		this.backgroundFillStyle = options.backgroundFillStyle || '#1a1a1a';
		
		// Interaction state
		this.activeDragMode = 'none'; // 'none' | 'movePose' | 'dragKeypoint' | 'scalePose' | 'rotatePose' | 'marquee' | 'moveSelectedKeypoints' | 'scaleSelectedKeypoints'
		this.activeKeypointId = null;
		this.activeScaleHandle = null; // 'tl' | 'tr' | 'bl' | 'br'
		this.dragStartPointer = null;
		this.dragStartPose = null;
		this.dragStartKeypoint = null;
		this.rotatePivot = null;
		this.rotateStartAngle = null;

		// Multi-keypoint selection state (active pose only)
		this.selectedKeypointIds = new Set(); // Set of keypointId integers; always scoped to selectedPoseIndex
		this.marqueeRect = null; // {x1,y1,x2,y2} in logical coords while marquee drag is live; null otherwise
		this.marqueeSelectionBase = null; // Set snapshot of selectedKeypointIds at marquee start when Shift held; null for replace-mode
		this.dragStartKeypointMap = null; // Map<keypointId,{x,y}> snapshot for moveSelectedKeypoints / scaleSelectedKeypoints
		
		// Constants
		this.keypointRadius = 5;
		this.faceKeypointRadius = 2;
		this.keypointHitRadius = 10;
		this.lineWidth = 10;
		this.handLineWidth = 3;
		this.handleSize = 8;
		this.handleHitRadius = 12;
		
		// Callbacks
		this.onChangeCallback = null;
		this.onSelectionChangeCallback = null;
		this.onHoverChangeCallback = null;
		
		// Drag-to-delete trash target state
		this.trashTargetHovered = false;

		// Dirty flag for efficient rendering
		this.isDirty = true;
		this.animationFrameId = null;
		
		// Bind event handlers
		this.handlePointerDown = this.handlePointerDown.bind(this);
		this.handlePointerMove = this.handlePointerMove.bind(this);
		this.handlePointerUp = this.handlePointerUp.bind(this);
		this.handlePointerLeave = this.handlePointerLeave.bind(this);
		this.handleDoubleClick = this.handleDoubleClick.bind(this);
		
		// Attach events
		this.canvas.addEventListener('pointerdown', this.handlePointerDown);
		this.canvas.addEventListener('pointermove', this.handlePointerMove);
		this.canvas.addEventListener('pointerup', this.handlePointerUp);
		this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
		this.canvas.addEventListener('dblclick', this.handleDoubleClick);
		
		// Initialize canvas dimensions with HiDPI support
		this.initializeCanvasSize();
		
		// Initial render
		this.requestRedraw();
	}
	
	       initializeCanvasSize() {
		       debugLog('[OpenPoseCanvas2D] initializeCanvasSize called');
		
		// Set up HiDPI canvas with proper dimensions
		const dpr = window.devicePixelRatio || 1;
		
		// Use logical dimensions directly - they are passed in constructor options
		const cssWidth = this.logicalWidth;
		const cssHeight = this.logicalHeight;
		
		       debugLog('[OpenPoseCanvas2D] Initializing with dimensions:', {
			       logicalWidth: this.logicalWidth,
			       logicalHeight: this.logicalHeight,
			       dpr,
			       cssWidth,
			       cssHeight
		       });
		
		// Set physical canvas resolution for HiDPI
		this.canvas.width = this.logicalWidth * dpr;
		this.canvas.height = this.logicalHeight * dpr;
		
		// Set CSS display size
		this.canvas.style.width = cssWidth + 'px';
		this.canvas.style.height = cssHeight + 'px';
		
		// Reset and scale context for HiDPI
		// This maps logical coordinates to physical pixels
		this.ctx.resetTransform();
		this.ctx.scale(dpr, dpr);
		
		// Fill with dark background for visibility
		this.clearAndFillBackground();
		
		       debugLog('[OpenPoseCanvas2D] Canvas initialized successfully:', {
			       canvasWidth: this.canvas.width,
			       canvasHeight: this.canvas.height,
			       canvasStyleWidth: this.canvas.style.width,
			       canvasStyleHeight: this.canvas.style.height
		       });
	}
	
	setSize(logicalWidth, logicalHeight, cssWidth, cssHeight) {
		this.logicalWidth = logicalWidth;
		this.logicalHeight = logicalHeight;
		
		// HiDPI rendering
		const dpr = window.devicePixelRatio || 1;
		this.canvas.width = logicalWidth * dpr;
		this.canvas.height = logicalHeight * dpr;
		this.canvas.style.width = cssWidth + 'px';
		this.canvas.style.height = cssHeight + 'px';
		
		// Reset and scale context for HiDPI
		this.ctx.resetTransform();
		this.ctx.scale(dpr, dpr);
		
		// Fill with dark background for visibility
		this.clearAndFillBackground();
		
		this.requestRedraw();
	}
	
	setGrid(enabled, color, spacing, thickness) {
		this.gridEnabled = enabled;
		if (color !== undefined) this.gridColor = color;
		if (spacing !== undefined) this.gridSpacing = spacing;
		if (thickness !== undefined) this.gridThickness = thickness;
		this.requestRedraw();
	}
	
	setBackground(imageElement, mode, opacity) {
		this.backgroundImage = imageElement;
		if (mode !== undefined) this.backgroundMode = mode;
		if (opacity !== undefined) this.backgroundOpacity = opacity;
		this.requestRedraw();
	}

	setBackgroundFillStyle(fillStyle) {
		if (!fillStyle) {
			return;
		}
		this.backgroundFillStyle = fillStyle;
		this.requestRedraw();
	}

	clearAndFillBackground() {
		if (!this.ctx) {
			return;
		}
		this.ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);
		if (!this.backgroundFillStyle) {
			return;
		}
		this.ctx.fillStyle = this.backgroundFillStyle;
		this.ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
	}
	
	setPoses(posesArray) {
		this.poses = posesArray.map(pose => {
			const kps = pose.keypoints || pose;
			return {
				keypoints: kps,
				formatId: pose.formatId || detectFormat(kps),
				faceKeypoints: this.normalizeExtraKeypoints(pose.faceKeypoints || pose.face_keypoints_2d),
				handLeftKeypoints: this.normalizeExtraKeypoints(pose.handLeftKeypoints || pose.hand_left_keypoints_2d),
				handRightKeypoints: this.normalizeExtraKeypoints(pose.handRightKeypoints || pose.hand_right_keypoints_2d)
			};
		});
		this.keypointEdits = false;
		this.requestRedraw();
	}
	
	getPoses() {
		return this.poses.map(pose => ({
			keypoints: pose.keypoints,
			formatId: pose.formatId,
			faceKeypoints: pose.faceKeypoints,
			handLeftKeypoints: pose.handLeftKeypoints,
			handRightKeypoints: pose.handRightKeypoints
		}));
	}
	
	       addPose(keypoints18, faceKeypoints = null, handLeftKeypoints = null, handRightKeypoints = null, formatId = null) {
		       // Use caller-supplied formatId when available so that per-file format detected
		       // at import time is preserved across all persons in the same file, preventing
		       // a sparse person (null neck) from being mis-detected as COCO-17.
		       const resolvedFormatId = formatId !== null ? formatId : detectFormat(keypoints18);
		       this.poses.push({ keypoints: keypoints18, formatId: resolvedFormatId, faceKeypoints, handLeftKeypoints, handRightKeypoints });
		       this.selectedPoseIndex = this.poses.length - 1;
		       debugLog('[OpenPoseCanvas2D] addPose:', {
			       poseIndex: this.selectedPoseIndex,
			       keypointsCount: keypoints18.length,
			       firstKeypoint: keypoints18[0],
			       totalPoses: this.poses.length
		       });
		       this.requestRedraw();
		       this.notifyChange('add');
	}

	/**
	 * Convert a raw [x,y] keypoint array to internal {x,y} format with
	 * validation and bounds-clamping, then add as a new pose.
	 * @param {Array} xyPairs - 18-element array of [x,y] pairs
	 */
	addPoseFromArray(xyPairs, faceKeypoints = null, handLeftKeypoints = null, handRightKeypoints = null, formatId = null) {
		const converted = [];
		for (let i = 0; i < xyPairs.length; i++) {
			const point = xyPairs[i];
			if (isValidKeypoint(point)) {
				const x = Number(point[0]);
				const y = Number(point[1]);
				if (Number.isFinite(x) && Number.isFinite(y) &&
					x >= 0 && y >= 0 &&
					x <= this.logicalWidth && y <= this.logicalHeight) {
					converted.push({ x, y });
				} else {
					converted.push(null);
				}
			} else {
				converted.push(null);
			}
		}
		const convertedFaceKeypoints = this.normalizeExtraKeypoints(faceKeypoints);
		const convertedHandLeftKeypoints = this.normalizeExtraKeypoints(handLeftKeypoints);
		const convertedHandRightKeypoints = this.normalizeExtraKeypoints(handRightKeypoints);
		this.addPose(converted, convertedFaceKeypoints, convertedHandLeftKeypoints, convertedHandRightKeypoints, formatId);
	}

	normalizeExtraKeypoints(points) {
		if (!Array.isArray(points)) {
			return null;
		}
		const converted = [];
		for (let i = 0; i < points.length; i++) {
			const point = points[i];
			let x;
			let y;
			if (point && typeof point === "object" && !Array.isArray(point)) {
				x = Number(point.x);
				y = Number(point.y);
				if (Math.abs(x) <= EXTRA_KEYPOINT_EPSILON && Math.abs(y) <= EXTRA_KEYPOINT_EPSILON) {
					converted.push(null);
					continue;
				}
			} else if (isValidKeypoint(point)) {
				x = Number(point[0]);
				y = Number(point[1]);
			} else {
				converted.push(null);
				continue;
			}
			if (Math.abs(x) <= EXTRA_KEYPOINT_EPSILON && Math.abs(y) <= EXTRA_KEYPOINT_EPSILON) {
				converted.push(null);
				continue;
			}
			if (Number.isFinite(x) && Number.isFinite(y) &&
				x >= 0 && y >= 0 &&
				x <= this.logicalWidth && y <= this.logicalHeight) {
				converted.push({ x, y });
			} else {
				converted.push(null);
			}
		}
		return converted;
	}

	/**
	 * Clear all poses and bulk-load from a flat [x,y] keypoint array,
	 * chunked into groups of format's keypoint count per pose.
	 * @param {Array} flatXYPairs - Flat array of [x,y] pairs (length multiple of format keypoint count)
	 * @param {string} formatId - Optional format ID (defaults to activeFormatId)
	 */
	loadFromFlatArray(flatXYPairs, formatId = null) {
		const format = getFormat(formatId || this.activeFormatId);
		const kpCount = format && format.keypoints ? format.keypoints.length : 18;
		
		this.poses = [];
		this.selectedPoseIndex = null;
		this.keypointEdits = false;
		const resolvedFormatId = (format && format.id) ? format.id : null;
		for (let i = 0; i < flatXYPairs.length; i += kpCount) {
			const chunk = flatXYPairs.slice(i, i + kpCount);
			if (chunk.length >= kpCount) {
				this.addPoseFromArray(chunk, null, null, null, resolvedFormatId);
			}
		}
		this.requestRedraw();
	}

	removePose(index) {
		if (index >= 0 && index < this.poses.length) {
			this.poses.splice(index, 1);
			if (this.selectedPoseIndex === index) {
				this.selectedPoseIndex = this.poses.length > 0 ? Math.min(index, this.poses.length - 1) : null;
				this.selectedKeypointIds = new Set();
			} else if (this.selectedPoseIndex > index) {
				this.selectedPoseIndex--;
			}
			this.requestRedraw();
			this.notifyChange('delete');
		}
	}
	
	setSelectedPose(indexOrNull) {
		if (this.selectedPoseIndex !== indexOrNull) {
			// Clear multi-keypoint selection whenever the active pose changes
			this.selectedKeypointIds = new Set();
		}
		this.selectedPoseIndex = indexOrNull;
		this.notifySelectionChange();
		this.requestRedraw();
	}
	
	getSelectedPoseIndex() {
		return this.selectedPoseIndex;
	}
	
	getCanvasHoveredKeypointId() {
		return this.canvasHoveredKeypointId;
	}
	
	getCanvasHoveredPoseIndex() {
		return this.canvasHoveredPoseIndex;
	}
	
	setHoveredKeypointId(idOrNull) {
		this.sidebarHoveredKeypointId = idOrNull;
		// Sidebar hover takes priority over canvas hover
		this.hoveredKeypointId = idOrNull !== null ? idOrNull : this.canvasHoveredKeypointId;
		this.updateCursor();
		this.requestRedraw();
	}
	
	/**
	 * Update canvas hover state with debouncing.
	 * Tracks both the hovered pose index and keypoint ID for accurate multi-pose targeting.
	 * Sidebar hover takes priority - if sidebar is hovering, canvas hover is ignored.
	 */
	updateCanvasHoveredKeypoint(newHoverId, newHoveredPoseIndex = null) {
		// Clear any pending hover update
		if (this.canvasHoverDebounceTimer) {
			clearTimeout(this.canvasHoverDebounceTimer);
			this.canvasHoverDebounceTimer = null;
		}
		
		// Store pending ID and pose index for debouncing
		this.pendingCanvasHoverId = newHoverId;
		this.pendingCanvasHoveredPoseIndex = newHoveredPoseIndex;
		
		// Debounce: only update after a small delay
		this.canvasHoverDebounceTimer = setTimeout(() => {
			this.canvasHoverDebounceTimer = null;
			
			// Only update if the ID or pose actually changed
			if (this.canvasHoveredKeypointId !== this.pendingCanvasHoverId || 
			    this.canvasHoveredPoseIndex !== this.pendingCanvasHoveredPoseIndex) {
				this.canvasHoveredKeypointId = this.pendingCanvasHoverId;
				this.canvasHoveredPoseIndex = this.pendingCanvasHoveredPoseIndex;
				
				// Debug: log when hover state changes
				if (this.canvasHoveredKeypointId === 17 || this.canvasHoveredKeypointId === 16) {
					debugLog('[canvas2d] Canvas hover state changed to:', {
						hoveredKeypointId: this.canvasHoveredKeypointId,
						hoveredPoseIndex: this.canvasHoveredPoseIndex
					});
				}
				
				// If sidebar is NOT hovering, apply canvas hover to display
				if (this.sidebarHoveredKeypointId === null) {
					this.hoveredKeypointId = this.canvasHoveredKeypointId;
					this.requestRedraw();
				}
				
				// Notify hover change listeners (e.g., sidebar styling)
				if (this.onHoverChangeCallback) {
					this.onHoverChangeCallback();
				}
				
				// Update cursor based on new hover state
				this.updateCursor();
			}
		}, 16); // ~1 frame at 60fps
	}
	
	/**
	 * Update canvas cursor based on current interaction state.
	 * Crosshair when hovering/dragging keypoints, default otherwise.
	 */
	updateCursor() {
		if (!this.canvas) return;

		// During an active rotation drag, show grabbing cursor
		if (this.activeDragMode === 'rotatePose') {
			this.canvas.style.cursor = 'grabbing';
		}
		// Mirror handles use pointer — communicated via getHandleCursor map; no drag mode needed
		// During an active scale drag, show the resize cursor for that handle
		else if ((this.activeDragMode === 'scalePose' || this.activeDragMode === 'scaleSelectedKeypoints') && this.activeScaleHandle) {
			this.canvas.style.cursor = this.getHandleCursor(this.activeScaleHandle);
		}
		// During an active drag of a keypoint or selected keypoints, always show crosshair/move
		else if (this.activeDragMode === 'dragKeypoint' || this.activeDragMode === 'moveSelectedKeypoints') {
			this.canvas.style.cursor = 'crosshair';
		}
		// During marquee draw, show crosshair
		else if (this.activeDragMode === 'marquee') {
			this.canvas.style.cursor = 'crosshair';
		}
		// When hovering a scale handle, show the appropriate resize cursor
		else if (this.hoveredHandle) {
			this.canvas.style.cursor = this.getHandleCursor(this.hoveredHandle);
		}
		// When hovering a keypoint (sidebar or canvas), show crosshair
		else if (this.hoveredKeypointId !== null) {
			this.canvas.style.cursor = 'crosshair';
		}
		// When hovering a conditioning area badge, show pointer
		else if (this.isHoveringBadge) {
			this.canvas.style.cursor = 'pointer';
		}
		// Otherwise, default cursor
		else {
			this.canvas.style.cursor = 'default';
		}
	}

	/**
	 * Get the appropriate cursor style for a scale handle.
	 */
	getHandleCursor(handleName) {
		const cursorMap = {
			nw: 'nwse-resize',  // Top-left corner
			se: 'nwse-resize',  // Bottom-right corner
			ne: 'nesw-resize',  // Top-right corner
			sw: 'nesw-resize',  // Bottom-left corner
			n: 'ns-resize',     // Top middle
			s: 'ns-resize',     // Bottom middle
			w: 'ew-resize',     // Left middle
			e: 'ew-resize',     // Right middle
			rotate: 'grab',     // Rotation handle
			mirrorV: 'pointer', // Vertical mirror (L/R flip) — instant click
			mirrorH: 'pointer'  // Horizontal mirror (U/D flip) — instant click
		};
		return cursorMap[handleName] || 'default';
	}
	
	destroy() {
		// Clean up debounce timer
		if (this.canvasHoverDebounceTimer) {
			clearTimeout(this.canvasHoverDebounceTimer);
		}
		this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
		this.canvas.removeEventListener('pointermove', this.handlePointerMove);
		this.canvas.removeEventListener('pointerup', this.handlePointerUp);
		this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
		this.canvas.removeEventListener('dblclick', this.handleDoubleClick);
		if (this.animationFrameId) {
			clearTimeout(this.animationFrameId); // Clear timeout instead of canceling RAF
		}
	}
	
	onChange(callback) {
		this.onChangeCallback = callback;
	}
	
	onSelectionChange(callback) {
		this.onSelectionChangeCallback = callback;
	}
	
	onHoverChange(callback) {
		this.onHoverChangeCallback = callback;
	}
	
	notifyChange(reason) {
		if (this.onChangeCallback) {
			this.onChangeCallback(reason);
		}
	}
	
	notifySelectionChange() {
		if (this.onSelectionChangeCallback) {
			this.onSelectionChangeCallback();
		}
	}

	hasExtraKeypoints() {
		return this.poses.some((pose) => (
			(Array.isArray(pose.faceKeypoints) && pose.faceKeypoints.length > 0) ||
			(Array.isArray(pose.handLeftKeypoints) && pose.handLeftKeypoints.length > 0) ||
			(Array.isArray(pose.handRightKeypoints) && pose.handRightKeypoints.length > 0)
		));
	}

	getPoseExtrasStatus(poseIndex) {
		if (poseIndex == null || poseIndex < 0 || poseIndex >= this.poses.length) {
			return { face: false, hands: false };
		}
		const pose = this.poses[poseIndex];
		const face = Array.isArray(pose.faceKeypoints) && pose.faceKeypoints.length > 0;
		const handLeft = Array.isArray(pose.handLeftKeypoints) && pose.handLeftKeypoints.length > 0;
		const handRight = Array.isArray(pose.handRightKeypoints) && pose.handRightKeypoints.length > 0;
		return { face, hands: handLeft || handRight };
	}

	clearFaceKeypoints(poseIndex) {
		if (poseIndex == null || poseIndex < 0 || poseIndex >= this.poses.length) {
			return false;
		}
		const pose = this.poses[poseIndex];
		const hasFaceArray = Array.isArray(pose.faceKeypoints);
		const faceLength = hasFaceArray ? pose.faceKeypoints.length : 0;
		if (!hasFaceArray || faceLength === 0) {
			pose.faceKeypoints = [];
			return false;
		}
		pose.faceKeypoints = new Array(faceLength).fill(null);
		this.requestRedraw();
		this.notifyChange('extras');
		return true;
	}

	clearHandKeypoints(poseIndex) {
		if (poseIndex == null || poseIndex < 0 || poseIndex >= this.poses.length) {
			return false;
		}
		const pose = this.poses[poseIndex];
		const hasHandLeftArray = Array.isArray(pose.handLeftKeypoints);
		const hasHandRightArray = Array.isArray(pose.handRightKeypoints);
		const handLeftLength = hasHandLeftArray ? pose.handLeftKeypoints.length : 0;
		const handRightLength = hasHandRightArray ? pose.handRightKeypoints.length : 0;
		if (handLeftLength === 0 && handRightLength === 0) {
			if (!hasHandLeftArray) {
				pose.handLeftKeypoints = [];
			}
			if (!hasHandRightArray) {
				pose.handRightKeypoints = [];
			}
			return false;
		}
		if (hasHandLeftArray) {
			pose.handLeftKeypoints = new Array(handLeftLength).fill(null);
		} else {
			pose.handLeftKeypoints = [];
		}
		if (hasHandRightArray) {
			pose.handRightKeypoints = new Array(handRightLength).fill(null);
		} else {
			pose.handRightKeypoints = [];
		}
		this.requestRedraw();
		this.notifyChange('extras');
		return true;
	}

	clearHandLeftKeypoints(poseIndex) {
		if (poseIndex == null || poseIndex < 0 || poseIndex >= this.poses.length) {
			return false;
		}
		const pose = this.poses[poseIndex];
		const hasArray = Array.isArray(pose.handLeftKeypoints);
		const len = hasArray ? pose.handLeftKeypoints.length : 0;
		if (len === 0) {
			if (!hasArray) {
				pose.handLeftKeypoints = [];
			}
			return false;
		}
		pose.handLeftKeypoints = new Array(len).fill(null);
		this.requestRedraw();
		this.notifyChange('extras');
		return true;
	}

	clearHandRightKeypoints(poseIndex) {
		if (poseIndex == null || poseIndex < 0 || poseIndex >= this.poses.length) {
			return false;
		}
		const pose = this.poses[poseIndex];
		const hasArray = Array.isArray(pose.handRightKeypoints);
		const len = hasArray ? pose.handRightKeypoints.length : 0;
		if (len === 0) {
			if (!hasArray) {
				pose.handRightKeypoints = [];
			}
			return false;
		}
		pose.handRightKeypoints = new Array(len).fill(null);
		this.requestRedraw();
		this.notifyChange('extras');
		return true;
	}

	clearKeypoint(poseIndex, keypointId) {
		if (poseIndex == null || poseIndex < 0 || poseIndex >= this.poses.length) {
			return false;
		}
		const pose = this.poses[poseIndex];
		if (!pose || !Array.isArray(pose.keypoints)) {
			return false;
		}
		if (keypointId == null || keypointId < 0 || keypointId >= pose.keypoints.length) {
			return false;
		}
		if (!pose.keypoints[keypointId]) {
			return false;
		}
		pose.keypoints[keypointId] = null;
		this.markKeypointEdited();
		this.requestRedraw();
		this.notifyChange('geometry');
		return true;
	}

	/**
	 * Place a missing keypoint at the specified logical canvas coordinates.
	 * Only places when the slot is currently null (does not overwrite existing keypoints).
	 * After placement, the render loop will automatically draw any skeleton lines whose
	 * both endpoints are now present, without any extra work needed here.
	 */
	placeKeypoint(poseIndex, keypointId, x, y) {
		if (poseIndex == null || poseIndex < 0 || poseIndex >= this.poses.length) {
			return false;
		}
		const pose = this.poses[poseIndex];
		if (!pose || !Array.isArray(pose.keypoints)) {
			return false;
		}
		if (keypointId == null || keypointId < 0 || keypointId >= pose.keypoints.length) {
			return false;
		}
		if (pose.keypoints[keypointId]) {
			// Slot is already occupied — refuse to overwrite
			return false;
		}
		pose.keypoints[keypointId] = {
			x: Math.max(0, Math.min(this.logicalWidth, x)),
			y: Math.max(0, Math.min(this.logicalHeight, y))
		};
		this.markKeypointEdited();
		this.requestRedraw();
		this.notifyChange('geometry');
		return true;
	}

	hasKeypointEdits() {
		return this.keypointEdits;
	}

	setKeypointEdits(value) {
		this.keypointEdits = !!value;
	}

	markKeypointEdited() {
		this.keypointEdits = true;
	}
	
	serialize(options = {}) {
		const includeExtras = !!options.includeExtras;
		const includeFace = includeExtras || !!options.includeFace;
		const includeHands = includeExtras || !!options.includeHands;
		const payload = {
			width: this.logicalWidth,
			format: this.activeFormatId,
			height: this.logicalHeight,
			keypoints: this.poses.map(pose => 
				pose.keypoints.map(kp => kp ? [kp.x, kp.y] : null)
			)
		};
		const hasFace = this.poses.some((pose) =>
			Array.isArray(pose.faceKeypoints) && pose.faceKeypoints.length > 0
		);
		const hasHandLeft = this.poses.some((pose) =>
			Array.isArray(pose.handLeftKeypoints) && pose.handLeftKeypoints.length > 0
		);
		const hasHandRight = this.poses.some((pose) =>
			Array.isArray(pose.handRightKeypoints) && pose.handRightKeypoints.length > 0
		);
		if (includeFace && hasFace) {
			payload.face_keypoints_2d = this.poses.map((pose) => (
				Array.isArray(pose.faceKeypoints)
					? pose.faceKeypoints.map(kp => kp ? [kp.x, kp.y] : null)
					: null
			));
		}
		if (includeHands && hasHandLeft) {
			payload.hand_left_keypoints_2d = this.poses.map((pose) => (
				Array.isArray(pose.handLeftKeypoints)
					? pose.handLeftKeypoints.map(kp => kp ? [kp.x, kp.y] : null)
					: null
			));
		}
		if (includeHands && hasHandRight) {
			payload.hand_right_keypoints_2d = this.poses.map((pose) => (
				Array.isArray(pose.handRightKeypoints)
					? pose.handRightKeypoints.map(kp => kp ? [kp.x, kp.y] : null)
					: null
			));
		}
		return payload;
	}
	
	load(serializedObject) {
		this.logicalWidth = serializedObject.width || 768;
		this.logicalHeight = serializedObject.height || 512;
		
		// Restore format metadata (prefer explicit, fall back to detection)
		const poseKeypoints = serializedObject.keypoints || [];
		const flatKeypoints = poseKeypoints.length > 0 && Array.isArray(poseKeypoints[0]) 
			? poseKeypoints.flat() 
			: poseKeypoints;
		this.activeFormatId = detectFormatFromMetadata(
			serializedObject.format,
			flatKeypoints
		) || DEFAULT_FORMAT_ID;
		
		// Convert from [x,y] format to {x,y} format
		const faceKeypoints = Array.isArray(serializedObject.face_keypoints_2d)
			? serializedObject.face_keypoints_2d
			: Array.isArray(serializedObject.faceKeypoints)
				? serializedObject.faceKeypoints
				: null;
		const handLeftKeypoints = Array.isArray(serializedObject.hand_left_keypoints_2d)
			? serializedObject.hand_left_keypoints_2d
			: Array.isArray(serializedObject.handLeftKeypoints)
				? serializedObject.handLeftKeypoints
				: null;
		const handRightKeypoints = Array.isArray(serializedObject.hand_right_keypoints_2d)
			? serializedObject.hand_right_keypoints_2d
			: Array.isArray(serializedObject.handRightKeypoints)
				? serializedObject.handRightKeypoints
				: null;
		this.poses = (serializedObject.keypoints || []).map((poseKeypoints, index) =>
			({
				keypoints: poseKeypoints.map(kp => 
					kp && kp.length === 2 ? { x: kp[0], y: kp[1] } : null
				),
				formatId: this.activeFormatId,
				faceKeypoints: this.normalizeExtraKeypoints(
					faceKeypoints ? faceKeypoints[index] : null
				),
				handLeftKeypoints: this.normalizeExtraKeypoints(
					handLeftKeypoints ? handLeftKeypoints[index] : null
				),
				handRightKeypoints: this.normalizeExtraKeypoints(
					handRightKeypoints ? handRightKeypoints[index] : null
				)
			})
		);
		this.keypointEdits = false;
		
		this.requestRedraw();
	}
	
	       requestRedraw() {
		       debugLog('[OpenPoseCanvas2D] requestRedraw called - rendering immediately:', {
			       isDirty: this.isDirty,
			       posesCount: this.poses.length
		       });
		       // Render immediately instead of deferring
		       this.render();
	}
	
	       render() {
		       debugLog('[OpenPoseCanvas2D] render() called');
		       try {
			       const ctx = this.ctx;
			       debugLog('[OpenPoseCanvas2D] Canvas state before render:', {
				       hasCtx: !!ctx,
				       canvasWidth: this.canvas.width,
				       canvasHeight: this.canvas.height,
				       logicalWidth: this.logicalWidth,
				       logicalHeight: this.logicalHeight,
				       posesLength: this.poses.length
			       });
			       // Clear and fill background
			       this.clearAndFillBackground();
			       debugLog('[OpenPoseCanvas2D] Background filled');
			       // Draw grid
			       if (this.gridEnabled) {
				       debugLog('[OpenPoseCanvas2D] Drawing grid');
				       this.drawGrid();
				       debugLog('[OpenPoseCanvas2D] Grid drawn');
			       }
			       // Draw background image if present
			       if (this.backgroundImage) {
				       debugLog('[OpenPoseCanvas2D] Drawing background image');
				       this.drawBackground();
				       debugLog('[OpenPoseCanvas2D] Background image drawn');
			       }
			       // Draw conditioning area overlays (above background/grid, below poses)
			       if (this.conditioningAreasVisible && this.conditioningAreas && this.conditioningAreas.length > 0) {
				       this.drawConditioningAreaOverlays();
			       }
			       // Draw drag-to-delete trash target beneath poses so dragged
			       // keypoints and skeleton lines always render on top of it.
			       if (this.activeDragMode === 'dragKeypoint') {
				       this.drawTrashTarget();
			       }
			       // Draw poses
			       if (this.poses.length > 0) {
				       debugLog('[OpenPoseCanvas2D] Drawing', this.poses.length, 'poses');
				       for (let i = 0; i < this.poses.length; i++) {
					       this.drawPose(this.poses[i], i === this.selectedPoseIndex);
				       }
				       debugLog('[OpenPoseCanvas2D] Poses drawn');
			       }
			       // Draw selection UI for selected pose (only when no multi-keypoint selection is active)
			       if (this.selectedPoseIndex !== null && this.selectedPoseIndex < this.poses.length && this.selectedKeypointIds.size === 0) {
				       debugLog('[OpenPoseCanvas2D] Drawing selection UI for pose', this.selectedPoseIndex);
				       this.drawSelectionUI(this.poses[this.selectedPoseIndex]);
				       debugLog('[OpenPoseCanvas2D] Selection UI drawn');
			       }
			       // Draw preselection UI for hovered pose (if different from selected)
			       if (this.preselectionPoseIndex !== null && this.preselectionPoseIndex < this.poses.length) {
				       debugLog('[OpenPoseCanvas2D] Drawing preselection UI for pose', this.preselectionPoseIndex);
				       this.drawPreselectionUI(this.poses[this.preselectionPoseIndex]);
				       debugLog('[OpenPoseCanvas2D] Preselection UI drawn');
			       }
			       // Draw hovered keypoint highlight
			       if (this.hoveredKeypointId !== null) {
				       // If sidebar is hovering, draw on the selected pose
				       if (this.sidebarHoveredKeypointId !== null && this.selectedPoseIndex !== null && this.selectedPoseIndex < this.poses.length) {
					       debugLog('[OpenPoseCanvas2D] Drawing hover ring for sidebar-hovered keypoint', this.hoveredKeypointId);
					       this.drawHoveredKeypoint(this.poses[this.selectedPoseIndex], this.hoveredKeypointId);
				       }
				       // If canvas is hovering, draw on the hovered pose
				       else if (this.canvasHoveredKeypointId !== null && this.canvasHoveredPoseIndex !== null && this.canvasHoveredPoseIndex < this.poses.length) {
					       debugLog('[OpenPoseCanvas2D] Drawing hover ring for canvas-hovered keypoint', this.hoveredKeypointId, 'on pose', this.canvasHoveredPoseIndex);
					       this.drawHoveredKeypoint(this.poses[this.canvasHoveredPoseIndex], this.hoveredKeypointId);
				       }
				       debugLog('[OpenPoseCanvas2D] Hover ring drawn');
			       }
			       // Draw multi-keypoint selection highlights and bbox (active pose only)
			       if (this.selectedKeypointIds.size > 0) {
				       this.drawSelectedKeypointHighlights();
				       this.drawMultiSelectionUI();
			       }
			       // Draw live marquee rectangle during drag
			       if (this.marqueeRect !== null) {
				       this.drawMarqueeRect();
			       }
		
		} catch (error) {
			console.error('[OpenPoseCanvas2D] ERROR in render():', error);
		}
	}

	/**
	 * Update the conditioning area overlay data and request a redraw.
	 * Resets per-area hidden state when the area list is replaced.
	 * @param {Array} areas - Array of {x, y, width, height, strength} (normalized 0-1)
	 */
	setConditioningAreas(areas) {
		this.conditioningAreas = Array.isArray(areas) ? areas : [];
		this.conditioningAreaHidden = new Set();
		this._areaBadgeHitRects = [];
		this.requestRedraw();
	}

	/**
	 * Show or hide the conditioning area overlay without discarding the data.
	 * @param {boolean} visible
	 */
	setConditioningAreasVisible(visible) {
		this.conditioningAreasVisible = !!visible;
		this.requestRedraw();
	}

	/**
	 * Draw semi-transparent filled rectangles for each visible conditioning area,
	 * plus a compact horizontal badge row at the very top of the canvas.
	 *
	 * Badge row layout: badges are placed left-to-right starting at BADGE_ROW_X,
	 * BADGE_ROW_Y — independent of each area's position.
	 *
	 * Click hit-rects are stored in this._areaBadgeHitRects for handlePointerDown.
	 *
	 * Per-area visibility is tracked in this.conditioningAreaHidden (Set of indices).
	 * The global this.conditioningAreasVisible guard is applied in render() before
	 * this method is called — so when the global toggle is off, this is never called.
	 */
	drawConditioningAreaOverlays() {
		if (!this.conditioningAreas || this.conditioningAreas.length === 0) return;

		const ctx  = this.ctx;
		const W    = this.logicalWidth;
		const H    = this.logicalHeight;
		const RADIUS = 3;

		// ── Pass 1: area fills (only visible areas) ──────────────────────────────
		for (let i = 0; i < this.conditioningAreas.length; i++) {
			if (this.conditioningAreaHidden.has(i)) continue;
			const area  = this.conditioningAreas[i];
			const color = AREA_OVERLAY_COLORS[i % AREA_OVERLAY_COLORS.length];
			const rx = Math.round(area.x * W);
			const ry = Math.round(area.y * H);
			const rw = Math.round(area.width * W);
			const rh = Math.round(area.height * H);
			if (rw < 1 || rh < 1) continue;
			ctx.save();
			ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.12)`;
			ctx.beginPath();
			_drawRoundRect(ctx, rx, ry, rw, rh, RADIUS);
			ctx.fill();
			ctx.restore();
		}

		// ── Pass 2: area borders (only visible areas) ─────────────────────────────
		for (let i = 0; i < this.conditioningAreas.length; i++) {
			if (this.conditioningAreaHidden.has(i)) continue;
			const area  = this.conditioningAreas[i];
			const color = AREA_OVERLAY_COLORS[i % AREA_OVERLAY_COLORS.length];
			const rx = Math.round(area.x * W);
			const ry = Math.round(area.y * H);
			const rw = Math.round(area.width * W);
			const rh = Math.round(area.height * H);
			if (rw < 1 || rh < 1) continue;
			ctx.save();
			ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.82)`;
			ctx.lineWidth = 2;
			ctx.beginPath();
			_drawRoundRect(ctx, rx, ry, rw, rh, RADIUS);
			ctx.stroke();
			ctx.restore();
		}

		// ── Pass 3: badge row at top of canvas ────────────────────────────────────
		const FONT_SIZE    = 11;
		const PAD_H        = 5;
		const PAD_V        = 3;
		const BADGE_GAP    = 4;
		const BADGE_ROW_X  = 6;   // left inset from canvas edge
		const BADGE_ROW_Y  = 6;   // top inset from canvas edge
		const BADGE_RADIUS = 3;
		const BORDER_W     = 1.5; // outline width for hidden badges

		this._areaBadgeHitRects = [];

		ctx.save();
		ctx.font          = `bold ${FONT_SIZE}px sans-serif`;
		ctx.textBaseline  = "top";
		ctx.textAlign     = "left";

		let cursorX = BADGE_ROW_X;

		for (let i = 0; i < this.conditioningAreas.length; i++) {
			const color   = AREA_OVERLAY_COLORS[i % AREA_OVERLAY_COLORS.length];
			const label   = `A${i + 1}`;
			const hidden  = this.conditioningAreaHidden.has(i);

			const textW   = ctx.measureText(label).width;
			const badgeW  = Math.ceil(textW + PAD_H * 2);
			const badgeH  = FONT_SIZE + PAD_V * 2;
			const bx      = cursorX;
			const by      = BADGE_ROW_Y;

			// Store hit rect for pointer handling (logical coords)
			this._areaBadgeHitRects.push({ x: bx, y: by, w: badgeW, h: badgeH, index: i });

			if (hidden) {
				// Outline style: transparent fill, colored border, colored text
				ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.85)`;
				ctx.lineWidth   = BORDER_W;
				ctx.fillStyle   = "rgba(0, 0, 0, 0)"; // transparent
				ctx.beginPath();
				_drawRoundRect(ctx, bx, by, badgeW, badgeH, BADGE_RADIUS);
				ctx.stroke();
				ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.90)`;
				ctx.fillText(label, bx + PAD_H, by + PAD_V);
			} else {
				// Filled style: colored fill, white text
				ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.72)`;
				ctx.beginPath();
				_drawRoundRect(ctx, bx, by, badgeW, badgeH, BADGE_RADIUS);
				ctx.fill();
				ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
				ctx.fillText(label, bx + PAD_H, by + PAD_V);
			}

			cursorX += badgeW + BADGE_GAP;
		}

		ctx.restore();
	}

	drawGrid() {
		const ctx = this.ctx;
		const centerX = this.logicalWidth / 2;
		const centerY = this.logicalHeight / 2;
		const pixelAlign = (value) => Math.round(value) + 0.5;
		
		// Draw grid lines (dashed, light gray) - skip center lines
		ctx.strokeStyle = this.gridColor;
		ctx.lineWidth = this.gridThickness;
		ctx.setLineDash([4, 4]); // Dashed pattern
		ctx.beginPath();
		
		// Vertical lines (skip the center vertical line)
		for (let x = 0; x <= this.logicalWidth; x += this.gridSpacing) {
			if (Math.abs(x - centerX) < 0.1) continue; // Skip center line
			const alignedX = pixelAlign(x);
			ctx.moveTo(alignedX, 0);
			ctx.lineTo(alignedX, this.logicalHeight);
		}
		
		// Horizontal lines (skip the center horizontal line)
		for (let y = 0; y <= this.logicalHeight; y += this.gridSpacing) {
			if (Math.abs(y - centerY) < 0.1) continue; // Skip center line
			const alignedY = pixelAlign(y);
			ctx.moveTo(0, alignedY);
			ctx.lineTo(this.logicalWidth, alignedY);
		}
		
		ctx.stroke();
		ctx.setLineDash([]); // Reset to solid
		
		// Draw center axes like Blender (clean, without grid interference)
		const axisOffset = 0.5;
		
		// Vertical center axis (RED for Y-axis)
		ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(centerX + axisOffset, 0);
		ctx.lineTo(centerX + axisOffset, this.logicalHeight);
		ctx.stroke();
		
		// Horizontal center axis (GREEN for X-axis)
		ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, centerY + axisOffset);
		ctx.lineTo(this.logicalWidth, centerY + axisOffset);
		ctx.stroke();
	}
	
	drawBackground() {
		if (!this.backgroundImage) return;
		
		const ctx = this.ctx;
		const img = this.backgroundImage;
		const canvasRatio = this.logicalWidth / this.logicalHeight;
		const imgRatio = img.width / img.height;
		
		let drawWidth, drawHeight, drawX, drawY;
		
		if (this.backgroundMode === 'contain') {
			// Fit image inside canvas, letterbox
			if (imgRatio > canvasRatio) {
				drawWidth = this.logicalWidth;
				drawHeight = this.logicalWidth / imgRatio;
				drawX = 0;
				drawY = (this.logicalHeight - drawHeight) / 2;
			} else {
				drawWidth = this.logicalHeight * imgRatio;
				drawHeight = this.logicalHeight;
				drawX = (this.logicalWidth - drawWidth) / 2;
				drawY = 0;
			}
		} else { // cover
			// Fill canvas, crop overflow
			if (imgRatio > canvasRatio) {
				drawWidth = this.logicalHeight * imgRatio;
				drawHeight = this.logicalHeight;
				drawX = (this.logicalWidth - drawWidth) / 2;
				drawY = 0;
			} else {
				drawWidth = this.logicalWidth;
				drawHeight = this.logicalWidth / imgRatio;
				drawX = 0;
				drawY = (this.logicalHeight - drawHeight) / 2;
			}
		}
		
		ctx.globalAlpha = this.backgroundOpacity;
		ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
		ctx.globalAlpha = 1.0;
	}
	
	drawPose(pose, isSelected) {
		// Use stored per-pose formatId; fall back to neck-presence heuristic for old data
		const formatId = pose.formatId || (pose.keypoints[1] == null ? 'coco17' : 'coco18');
		const format = getFormat(formatId) || getFormat(DEFAULT_FORMAT_ID);
		const edges = Array.isArray(format?.skeletonEdges) ? format.skeletonEdges : [];
		const colors = Array.isArray(format?.skeletonColors) ? format.skeletonColors : [];
		const keypointColors = Array.isArray(format?.keypointColors) ? format.keypointColors : null;
		const formatKeypoints = Array.isArray(format?.keypoints) ? format.keypoints : null;
		
		// Draw skeleton lines
		for (let i = 0; i < edges.length; i++) {
			const [a, b] = edges[i];
			const kpA = pose.keypoints[a];
			const kpB = pose.keypoints[b];
			
			if (kpA && kpB) {
				const color = colors[i] || [255, 255, 255];
				this.drawLine(kpA.x, kpA.y, kpB.x, kpB.y, color);
			}
		}
		
		// Draw keypoints
		for (let i = 0; i < pose.keypoints.length; i++) {
			const kp = pose.keypoints[i];
			if (kp) {
				this.drawKeypoint(kp.x, kp.y, this.getKeypointColor(i, keypointColors, formatKeypoints));
			}
		}

		this.drawFaceKeypoints(pose);
		this.drawHandKeypoints(pose.handLeftKeypoints, "left", pose);
		this.drawHandKeypoints(pose.handRightKeypoints, "right", pose);
	}
	
	drawLine(x1, y1, x2, y2, color) {
		const ctx = this.ctx;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.strokeStyle = PREVIEW_OUTLINE_STROKE;
		ctx.lineWidth = this.lineWidth + 2;
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();

		ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.7)`;
		ctx.lineWidth = this.lineWidth;
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();
	}
	
	drawKeypoint(x, y, color) {
		const ctx = this.ctx;
		const fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
		ctx.fillStyle = PREVIEW_OUTLINE_FILL;
		ctx.beginPath();
		ctx.arc(x, y, this.keypointRadius + 1.2, 0, Math.PI * 2);
		ctx.fill();

		ctx.fillStyle = fillStyle;
		ctx.beginPath();
		ctx.arc(x, y, this.keypointRadius, 0, Math.PI * 2);
		ctx.fill();
	}

	drawFaceKeypoints(pose) {
		if (!pose || !Array.isArray(pose.faceKeypoints)) {
			return;
		}
		const ctx = this.ctx;
		ctx.fillStyle = "#ffffff";
		const radius = this.faceKeypointRadius;
		for (let i = 0; i < pose.faceKeypoints.length; i++) {
			const kp = pose.faceKeypoints[i];
			if (!kp) {
				continue;
			}
			ctx.beginPath();
			ctx.arc(kp.x, kp.y, radius, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	drawHandKeypoints(handKeypoints, handLabel, pose) {
		if (!Array.isArray(handKeypoints) || handKeypoints.length === 0) {
			return;
		}
		const totalPoints = handKeypoints.length;
		const missingCount = handKeypoints.reduce((count, kp) => (kp ? count : count + 1), 0);
		if (totalPoints >= 20 && missingCount >= Math.ceil(totalPoints * 0.7)) {
			const warnKey = handLabel === "right" ? "_warnedHandRightZero" : "_warnedHandLeftZero";
			if (pose && !pose[warnKey]) {
				console.warn("[OpenPose Studio] Hand keypoints are mostly (0,0); source data does not include full hand coordinates.", {
					hand: handLabel || "unknown",
					missing: missingCount,
					total: totalPoints
				});
				pose[warnKey] = true;
			}
		}
		for (let i = 0; i < HAND_EDGES.length; i++) {
			const [a, b] = HAND_EDGES[i];
			const kpA = handKeypoints[a];
			const kpB = handKeypoints[b];
			if (kpA && kpB) {
				const color = HAND_KEYPOINT_COLORS[b] || [255, 255, 255];
				this.drawHandLine(kpA.x, kpA.y, kpB.x, kpB.y, color);
			}
		}
		const ctx = this.ctx;
		const radius = this.keypointRadius;
		for (let i = 0; i < handKeypoints.length; i++) {
			const kp = handKeypoints[i];
			if (!kp) {
				continue;
			}
			const color = HAND_KEYPOINT_COLORS[i] || [255, 255, 255];
			ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
			ctx.beginPath();
			ctx.arc(kp.x, kp.y, radius, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	drawHandLine(x1, y1, x2, y2, color) {
		const ctx = this.ctx;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.strokeStyle = PREVIEW_OUTLINE_STROKE;
		ctx.lineWidth = this.handLineWidth + 1;
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();

		ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.8)`;
		ctx.lineWidth = this.handLineWidth;
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();
	}
	
	drawSelectionUI(pose) {
		const bbox = this.getPoseBounds(pose);
		if (!bbox) return;

		const ctx = this.ctx;
		const padding = 10;

		// Determine if selection is "active" (hovered or being dragged)
		const isActive = this.selectionBoxHovered || this.activeDragMode !== 'none';

		// Colors: cyan when active, neutral gray when passive
		const activeColor = 'rgba(100, 200, 255, 0.8)';
		const passiveColor = 'rgba(160, 160, 160, 0.5)';
		const boxColor = isActive ? activeColor : passiveColor;

		const activeHandleFill = 'rgba(100, 200, 255, 0.9)';
		const passiveHandleFill = 'rgba(140, 140, 140, 0.7)';
		const handleFillColor = isActive ? activeHandleFill : passiveHandleFill;

		// Draw bounding box — clamp to [1, dim-1] so the full 2px stroke stays inside the canvas
		// clip area even when the pose is flush against a canvas edge.
		const bxL = Math.max(1, bbox.minX - padding);
		const bxT = Math.max(1, bbox.minY - padding);
		const bxR = Math.min(this.logicalWidth  - 1, bbox.maxX + padding);
		const bxB = Math.min(this.logicalHeight - 1, bbox.maxY + padding);
		ctx.strokeStyle = boxColor;
		ctx.lineWidth = 2;
		ctx.setLineDash([5, 5]);
		ctx.strokeRect(bxL, bxT, bxR - bxL, bxB - bxT);
		ctx.setLineDash([]);

		// Draw scale handles (8 total: 4 corners + 4 sides)
		const handles = this.getScaleHandles(bbox, padding);
		ctx.fillStyle = handleFillColor;
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
		ctx.lineWidth = 2;

		const handleSize = 6;

		for (const [handleName, handle] of Object.entries(handles)) {
			if (['nw', 'ne', 'sw', 'se'].includes(handleName)) {
				// Corner handles: circles
				ctx.beginPath();
				ctx.arc(handle.x, handle.y, handleSize / 2, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
			} else {
				// Side handles: squares
				ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
				ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
			}
		}

		// Draw rotation handle above bounding box
		const rotHandle = this.getRotationHandle(bbox, padding);
		const nHandle = handles['n'];
		const isRotActive = this.activeDragMode === 'rotatePose' || this.hoveredHandle === 'rotate';
		const rotColor = isRotActive ? 'rgba(255, 190, 60, 0.95)' : boxColor;

		// Stem line from 'n' scale handle to rotation handle — solid, thin
		ctx.strokeStyle = rotColor;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(nHandle.x, nHandle.y);
		ctx.lineTo(rotHandle.x, rotHandle.y);
		ctx.stroke();

		// Rotation handle icon: 270° clockwise arc, gap at top, filled arrowhead at arc end.
		// This is the standard rotation symbol used in Canva, CSS editors and design tools:
		//   arc starts upper-right (-45°), sweeps clockwise through bottom, ends upper-left (225°).
		const rotR = 7;
		const rotIconStart = -Math.PI / 4;               // -45°  → upper-right of handle center
		const rotIconEnd   =  Math.PI * 1.25;            // 225°  → upper-left  of handle center
		ctx.strokeStyle = rotColor;
		ctx.lineWidth = 2;
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.arc(rotHandle.x, rotHandle.y, rotR, rotIconStart, rotIconEnd, false);
		ctx.stroke();
		ctx.lineCap = 'butt';

		// Filled triangle arrowhead at arc end (225°).
		// Forward direction (clockwise tangent) at 225° is 225° + 90° = 315° (upper-right).
		const arcEndX  = rotHandle.x + rotR * Math.cos(rotIconEnd);
		const arcEndY  = rotHandle.y + rotR * Math.sin(rotIconEnd);
		const fwdAngle = rotIconEnd + Math.PI / 2;  // clockwise tangent = upper-right
		const aHalf    = 4.5;   // half-length: tip extends aHalf ahead, base aHalf behind
		const aWide    = 2.5;   // half-width of the arrowhead base
		const tipX  = arcEndX + aHalf * Math.cos(fwdAngle);
		const tipY  = arcEndY + aHalf * Math.sin(fwdAngle);
		const baseX = arcEndX - aHalf * Math.cos(fwdAngle);
		const baseY = arcEndY - aHalf * Math.sin(fwdAngle);
		const perpA = fwdAngle + Math.PI / 2;
		ctx.fillStyle = rotColor;
		ctx.beginPath();
		ctx.moveTo(tipX, tipY);
		ctx.lineTo(baseX + aWide * Math.cos(perpA), baseY + aWide * Math.sin(perpA));
		ctx.lineTo(baseX - aWide * Math.cos(perpA), baseY - aWide * Math.sin(perpA));
		ctx.closePath();
		ctx.fill();

		// ── Vertical mirror handle (right side, mirrors L/R) ──
		const mirrorVHandle = this.getMirrorVHandle(bbox, padding);
		const eHandle = handles['e'];
		const isMirrorVHovered = this.hoveredHandle === 'mirrorV';
		const mirrorVColor = isMirrorVHovered ? 'rgba(100, 255, 160, 0.95)' : boxColor;

		// Stem from 'e' resize handle to mirror handle
		ctx.strokeStyle = mirrorVColor;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(eHandle.x, eHandle.y);
		ctx.lineTo(mirrorVHandle.x, mirrorVHandle.y);
		ctx.stroke();

		// Mirror icon: vertical axis line + two outward filled triangles (standard flip symbol)
		// Axis line (the plane of reflection)
		const mvX = mirrorVHandle.x;
		const mvY = mirrorVHandle.y;
		ctx.strokeStyle = mirrorVColor;
		ctx.lineWidth = 1.5;
		ctx.setLineDash([2, 2]);
		ctx.beginPath();
		ctx.moveTo(mvX, mvY - 9);
		ctx.lineTo(mvX, mvY + 9);
		ctx.stroke();
		ctx.setLineDash([]);
		// Left triangle (pointing left)
		ctx.fillStyle = mirrorVColor;
		ctx.beginPath();
		ctx.moveTo(mvX - 10, mvY);           // tip
		ctx.lineTo(mvX - 4,  mvY - 5);       // base top
		ctx.lineTo(mvX - 4,  mvY + 5);       // base bottom
		ctx.closePath();
		ctx.fill();
		// Right triangle (pointing right)
		ctx.beginPath();
		ctx.moveTo(mvX + 10, mvY);           // tip
		ctx.lineTo(mvX + 4,  mvY - 5);       // base top
		ctx.lineTo(mvX + 4,  mvY + 5);       // base bottom
		ctx.closePath();
		ctx.fill();

		// ── Horizontal mirror handle (bottom, mirrors U/D) ──
		const mirrorHHandle = this.getMirrorHHandle(bbox, padding);
		const sHandle = handles['s'];
		const isMirrorHHovered = this.hoveredHandle === 'mirrorH';
		const mirrorHColor = isMirrorHHovered ? 'rgba(100, 255, 160, 0.95)' : boxColor;

		// Stem from 's' resize handle to mirror handle
		ctx.strokeStyle = mirrorHColor;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(sHandle.x, sHandle.y);
		ctx.lineTo(mirrorHHandle.x, mirrorHHandle.y);
		ctx.stroke();

		// Mirror icon: horizontal axis line + two outward filled triangles (standard flip symbol)
		const mhX = mirrorHHandle.x;
		const mhY = mirrorHHandle.y;
		ctx.strokeStyle = mirrorHColor;
		ctx.lineWidth = 1.5;
		ctx.setLineDash([2, 2]);
		ctx.beginPath();
		ctx.moveTo(mhX - 9, mhY);
		ctx.lineTo(mhX + 9, mhY);
		ctx.stroke();
		ctx.setLineDash([]);
		// Top triangle (pointing up)
		ctx.fillStyle = mirrorHColor;
		ctx.beginPath();
		ctx.moveTo(mhX,      mhY - 10);      // tip
		ctx.lineTo(mhX - 5,  mhY - 4);       // base left
		ctx.lineTo(mhX + 5,  mhY - 4);       // base right
		ctx.closePath();
		ctx.fill();
		// Bottom triangle (pointing down)
		ctx.beginPath();
		ctx.moveTo(mhX,      mhY + 10);      // tip
		ctx.lineTo(mhX - 5,  mhY + 4);       // base left
		ctx.lineTo(mhX + 5,  mhY + 4);       // base right
		ctx.closePath();
		ctx.fill();
	}

	/**
	 * Apply a mirror transform to the whole active pose.
	 * axis: 'vertical' = left-right flip (mirrors across vertical axis through bbox center)
	 *       'horizontal' = up-down flip (mirrors across horizontal axis through bbox center)
	 */
	applyMirrorToPose(poseIndex, axis) {
		if (poseIndex === null || poseIndex < 0 || poseIndex >= this.poses.length) return;
		const pose = this.poses[poseIndex];
		const bbox = this.getPoseBounds(pose);
		if (!bbox) return;
		const cx = (bbox.minX + bbox.maxX) / 2;
		const cy = (bbox.minY + bbox.maxY) / 2;
		const mirrorPoint = (kp) => {
			if (!kp) return null;
			if (axis === 'vertical') {
				return { x: 2 * cx - kp.x, y: kp.y };
			}
			return { x: kp.x, y: 2 * cy - kp.y };
		};
		for (let i = 0; i < pose.keypoints.length; i++) {
			pose.keypoints[i] = mirrorPoint(pose.keypoints[i]);
		}
		if (Array.isArray(pose.faceKeypoints)) {
			for (let i = 0; i < pose.faceKeypoints.length; i++) {
				pose.faceKeypoints[i] = mirrorPoint(pose.faceKeypoints[i]);
			}
		}
		if (Array.isArray(pose.handLeftKeypoints)) {
			for (let i = 0; i < pose.handLeftKeypoints.length; i++) {
				pose.handLeftKeypoints[i] = mirrorPoint(pose.handLeftKeypoints[i]);
			}
		}
		if (Array.isArray(pose.handRightKeypoints)) {
			for (let i = 0; i < pose.handRightKeypoints.length; i++) {
				pose.handRightKeypoints[i] = mirrorPoint(pose.handRightKeypoints[i]);
			}
		}
		this.requestRedraw();
		this.notifyChange('geometry');
	}

	drawPreselectionUI(pose) {
		const bbox = this.getPoseBounds(pose);
		if (!bbox) return;

		const ctx = this.ctx;
		const padding = 10;

		// Use subdued gray color (same as passive selection box)
		const preselectionColor = 'rgba(160, 160, 160, 0.5)';

		// Draw dashed bounding box — clamp to [1, dim-1] so the full 2px stroke stays inside
		// the canvas clip area even when the pose is flush against a canvas edge.
		const bxL = Math.max(1, bbox.minX - padding);
		const bxT = Math.max(1, bbox.minY - padding);
		const bxR = Math.min(this.logicalWidth  - 1, bbox.maxX + padding);
		const bxB = Math.min(this.logicalHeight - 1, bbox.maxY + padding);
		ctx.strokeStyle = preselectionColor;
		ctx.lineWidth = 2;
		ctx.setLineDash([5, 5]);
		ctx.strokeRect(bxL, bxT, bxR - bxL, bxB - bxT);
		ctx.setLineDash([]);
	}

	drawHoveredKeypoint(pose, keypointId) {
		const kp = pose.keypoints[keypointId];
		if (!kp) return;

		const ctx = this.ctx;
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(kp.x, kp.y, this.keypointRadius + 3, 0, Math.PI * 2);
		ctx.stroke();
	}

	getPoseBounds(pose) {
		let minX = Infinity, minY = Infinity;
		let maxX = -Infinity, maxY = -Infinity;
		let hasPoints = false;
		
		for (const kp of pose.keypoints) {
			if (kp) {
				minX = Math.min(minX, kp.x);
				minY = Math.min(minY, kp.y);
				maxX = Math.max(maxX, kp.x);
				maxY = Math.max(maxY, kp.y);
				hasPoints = true;
			}
		}
		
		return hasPoints ? { minX, minY, maxX, maxY } : null;
	}
	
	getScaleHandles(bbox, padding) {
		const cornerHandles = {
			nw: { x: bbox.minX - padding, y: bbox.minY - padding },
			ne: { x: bbox.maxX + padding, y: bbox.minY - padding },
			sw: { x: bbox.minX - padding, y: bbox.maxY + padding },
			se: { x: bbox.maxX + padding, y: bbox.maxY + padding }
		};
		
		// Mid-edge handles for non-uniform scaling
		const midX = (bbox.minX + bbox.maxX) / 2;
		const midY = (bbox.minY + bbox.maxY) / 2;
		
		const sideHandles = {
			n: { x: midX, y: bbox.minY - padding },   // Top
			s: { x: midX, y: bbox.maxY + padding },   // Bottom
			w: { x: bbox.minX - padding, y: midY },   // Left
			e: { x: bbox.maxX + padding, y: midY }    // Right
		};
		
		return { ...cornerHandles, ...sideHandles };
	}

	getRotationHandle(bbox, padding) {
		const midX = (bbox.minX + bbox.maxX) / 2;
		const handleY = bbox.minY - padding - 28;
		return { x: midX, y: Math.max(16, handleY) };
	}

	getMirrorVHandle(bbox, padding) {
		// Right side: vertical mirror (left-right flip). Offset 28px beyond the 'e' resize handle.
		const midY = (bbox.minY + bbox.maxY) / 2;
		const handleX = bbox.maxX + padding + 28;
		return { x: Math.min(this.logicalWidth - 16, handleX), y: midY };
	}

	getMirrorHHandle(bbox, padding) {
		// Bottom: horizontal mirror (up-down flip). Offset 28px beyond the 's' resize handle.
		const midX = (bbox.minX + bbox.maxX) / 2;
		const handleY = bbox.maxY + padding + 28;
		return { x: midX, y: Math.min(this.logicalHeight - 16, handleY) };
	}

	/**
	 * Compute the bounding box of only the currently selected keypoints
	 * (those in this.selectedKeypointIds) within the active pose.
	 * Returns null if there are no selected keypoints with valid positions.
	 */
	getSelectedKeypointsBounds() {
		if (this.selectedPoseIndex === null || this.selectedKeypointIds.size === 0) return null;
		const pose = this.poses[this.selectedPoseIndex];
		if (!pose) return null;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		let hasPoints = false;
		for (const kpId of this.selectedKeypointIds) {
			const kp = pose.keypoints[kpId];
			if (kp) {
				minX = Math.min(minX, kp.x); minY = Math.min(minY, kp.y);
				maxX = Math.max(maxX, kp.x); maxY = Math.max(maxY, kp.y);
				hasPoints = true;
			}
		}
		return hasPoints ? { minX, minY, maxX, maxY } : null;
	}

	/**
	 * Draw highlight rings for all selected keypoints on the active pose.
	 */
	drawSelectedKeypointHighlights() {
		if (this.selectedPoseIndex === null || this.selectedKeypointIds.size === 0) return;
		const pose = this.poses[this.selectedPoseIndex];
		if (!pose) return;
		const ctx = this.ctx;
		ctx.strokeStyle = 'rgba(100, 200, 255, 0.95)';
		ctx.lineWidth = 2.5;
		for (const kpId of this.selectedKeypointIds) {
			const kp = pose.keypoints[kpId];
			if (kp) {
				ctx.beginPath();
				ctx.arc(kp.x, kp.y, this.keypointRadius + 4, 0, Math.PI * 2);
				ctx.stroke();
			}
		}
	}

	/**
	 * Draw the persistent dashed bounding box around the selected keypoints
	 * along with scale handles (active-pose only).
	 */
	drawMultiSelectionUI() {
		const bbox = this.getSelectedKeypointsBounds();
		if (!bbox) return;
		const ctx = this.ctx;
		const padding = 10;
		const isActive = this.activeDragMode === 'moveSelectedKeypoints' || this.activeDragMode === 'scaleSelectedKeypoints';
		const boxColor = isActive ? 'rgba(100, 200, 255, 0.9)' : 'rgba(100, 200, 255, 0.65)';
		const handleFill = isActive ? 'rgba(100, 200, 255, 0.95)' : 'rgba(100, 200, 255, 0.75)';

		ctx.strokeStyle = boxColor;
		ctx.lineWidth = 1.5;
		ctx.setLineDash([4, 4]);
		ctx.strokeRect(
			bbox.minX - padding, bbox.minY - padding,
			bbox.maxX - bbox.minX + padding * 2,
			bbox.maxY - bbox.minY + padding * 2
		);
		ctx.setLineDash([]);

		// Draw scale handles (same layout as pose handles)
		const handles = this.getScaleHandles(bbox, padding);
		const handleSize = 6;
		ctx.fillStyle = handleFill;
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
		ctx.lineWidth = 1.5;
		for (const [handleName, handle] of Object.entries(handles)) {
			if (['nw', 'ne', 'sw', 'se'].includes(handleName)) {
				ctx.beginPath();
				ctx.arc(handle.x, handle.y, handleSize / 2, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
			} else {
				ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
				ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
			}
		}
	}

	/**
	 * Returns the radius (logical canvas units) of the quarter-circle trash
	 * drop-zone anchored flush to the top-right corner.
	 */
	_getTrashTargetRadius() {
		return 76;
	}

	/**
	 * Draw the drag-to-delete trash target as a quarter-circle sector anchored
	 * flush to the top-right corner of the canvas.  The shape is always a
	 * portion of a full circle whose centre sits exactly at the corner, so
	 * no gap exists between the canvas edge and the visible shape.
	 *
	 * Called only while a keypoint is being actively dragged.
	 */
	drawTrashTarget() {
		const ctx = this.ctx;
		const R = this._getTrashTargetRadius();
		const hovered = this.trashTargetHovered;

		// Corner of the canvas (circle centre)
		const cornerX = this.logicalWidth;
		const cornerY = 0;

		// Quarter-circle sector: arc from angle π/2 (pointing down) to π
		// (pointing left), sweeping clockwise — this traces exactly the
		// portion of the circle that sits inside the canvas.
		ctx.save();
		ctx.beginPath();
		ctx.moveTo(cornerX, cornerY);
		ctx.arc(cornerX, cornerY, R, Math.PI / 2, Math.PI, false);
		ctx.closePath();

		ctx.fillStyle = hovered
			? 'rgba(195, 30, 30, 0.82)'
			: 'rgba(20, 20, 20, 0.52)';
		ctx.fill();

		// Icon centre: place it along the 45° bisector of the quarter circle,
		// at 40% of R from the corner.  This sits within the filled sector and
		// reads as the visual centre of the drop zone.
		const ICON_OFFSET = R * 0.40; // distance from corner along each axis
		const icx = cornerX - ICON_OFFSET;
		const icy = cornerY + ICON_OFFSET;

		const iconSize = 22; // logical units — trash-can proportions base
		const iconColor  = hovered ? 'rgba(255, 110, 110, 0.97)' : 'rgba(215, 215, 215, 0.90)';
		const stripeColor = hovered ? 'rgba(160, 25, 25, 0.90)' : 'rgba(20, 20, 20, 0.62)';

		// Lid bar
		const lidW = iconSize * 0.88;
		const lidH = iconSize * 0.13;
		const lidX = icx - lidW / 2;
		const lidY = icy - iconSize * 0.54;

		// Handle nub
		const nubW = iconSize * 0.32;
		const nubH = iconSize * 0.14;
		const nubX = icx - nubW / 2;
		const nubY = lidY - nubH;

		// Body
		const bodyW = iconSize * 0.70;
		const bodyH = iconSize * 0.60;
		const bodyX = icx - bodyW / 2;
		const bodyY = lidY + lidH + iconSize * 0.06;

		ctx.fillStyle = iconColor;

		// Nub
		ctx.beginPath();
		_drawRoundRect(ctx, nubX, nubY, nubW, nubH, 2);
		ctx.fill();

		// Lid bar
		ctx.beginPath();
		_drawRoundRect(ctx, lidX, lidY, lidW, lidH, 2);
		ctx.fill();

		// Body
		ctx.beginPath();
		_drawRoundRect(ctx, bodyX, bodyY, bodyW, bodyH, 3);
		ctx.fill();

		// 3 vertical stripe cutouts inside the body
		const stripeCount = 3;
		const stripeSpacing = bodyW / (stripeCount + 1);
		const stripeInset = bodyH * 0.12;
		const sw = 1.6;
		ctx.fillStyle = stripeColor;
		for (let s = 1; s <= stripeCount; s++) {
			const sx = bodyX + stripeSpacing * s;
			const sy = bodyY + stripeInset;
			const sh = bodyH - stripeInset * 2;
			ctx.fillRect(sx - sw / 2, sy, sw, sh);
		}

		ctx.restore();
	}

	/**
	 * Draw the live marquee selection rectangle during drag.
	 */
	drawMarqueeRect() {
		if (!this.marqueeRect) return;
		const ctx = this.ctx;
		const rect = this.marqueeRect;
		const x = Math.min(rect.x1, rect.x2);
		const y = Math.min(rect.y1, rect.y2);
		const w = Math.abs(rect.x2 - rect.x1);
		const h = Math.abs(rect.y2 - rect.y1);
		ctx.strokeStyle = 'rgba(100, 200, 255, 0.85)';
		ctx.fillStyle = 'rgba(100, 200, 255, 0.10)';
		ctx.lineWidth = 1.5;
		ctx.setLineDash([4, 4]);
		ctx.beginPath();
		ctx.rect(x, y, w, h);
		ctx.fill();
		ctx.stroke();
		ctx.setLineDash([]);
	}
	
	// Event handlers
	screenToLogical(clientX, clientY) {
		const rect = this.canvas.getBoundingClientRect();
		return {
			x: (clientX - rect.left) * (this.logicalWidth / rect.width),
			y: (clientY - rect.top) * (this.logicalHeight / rect.height)
		};
	}
	
	handlePointerDown(evt) {
		const pointer = this.screenToLogical(evt.clientX, evt.clientY);
		this.dragStartPointer = pointer;
		const isShift = evt.shiftKey;

		// ── 0. Area badge row hit-test (highest priority, primary button only) ──
		// Only active when conditioning areas are globally visible and data exists.
		if (!isShift && evt.button === 0
			&& this.conditioningAreasVisible
			&& this._areaBadgeHitRects && this._areaBadgeHitRects.length > 0) {
			for (const rect of this._areaBadgeHitRects) {
				if (pointer.x >= rect.x && pointer.x <= rect.x + rect.w
					&& pointer.y >= rect.y && pointer.y <= rect.y + rect.h) {
					// Toggle per-area visibility
					if (this.conditioningAreaHidden.has(rect.index)) {
						this.conditioningAreaHidden.delete(rect.index);
					} else {
						this.conditioningAreaHidden.add(rect.index);
					}
					this.requestRedraw();
					evt.stopPropagation();
					return;
				}
			}
		}

		// ── 1. Multi-keypoint selection bbox scale handles (active pose only) ──
		if (!isShift && this.selectedPoseIndex !== null && this.selectedKeypointIds.size > 0) {
			const mkBbox = this.getSelectedKeypointsBounds();
			if (mkBbox) {
				const handles = this.getScaleHandles(mkBbox, 10);
				for (const [name, handle] of Object.entries(handles)) {
					const dist = Math.sqrt((pointer.x - handle.x) ** 2 + (pointer.y - handle.y) ** 2);
					if (dist <= this.handleHitRadius) {
						this.activeDragMode = 'scaleSelectedKeypoints';
						this.activeScaleHandle = name;
						// Snapshot selected keypoints' start positions
						const pose = this.poses[this.selectedPoseIndex];
						this.dragStartKeypointMap = new Map();
						for (const kpId of this.selectedKeypointIds) {
							const kp = pose.keypoints[kpId];
							if (kp) this.dragStartKeypointMap.set(kpId, { x: kp.x, y: kp.y });
						}
						this.canvas.setPointerCapture(evt.pointerId);
						this.updateCursor();
						return;
					}
				}
			}
		}

		// ── 2. Pose-level scale + rotation handles (only when no multi-kp selection active) ──
		if (!isShift && this.selectedPoseIndex !== null && this.selectedKeypointIds.size === 0) {
			const pose = this.poses[this.selectedPoseIndex];
			const bbox = this.getPoseBounds(pose);
			if (bbox) {
				// Check rotation handle first (physically separated above the box)
				const rotHandle = this.getRotationHandle(bbox, 10);
				const rotDist = Math.sqrt((pointer.x - rotHandle.x) ** 2 + (pointer.y - rotHandle.y) ** 2);
				if (rotDist <= this.handleHitRadius) {
					this.activeDragMode = 'rotatePose';
					this.dragStartPose = JSON.parse(JSON.stringify(pose));
					this.rotatePivot = {
						x: (bbox.minX + bbox.maxX) / 2,
						y: (bbox.minY + bbox.maxY) / 2
					};
					this.rotateStartAngle = Math.atan2(pointer.y - this.rotatePivot.y, pointer.x - this.rotatePivot.x);
					this.canvas.setPointerCapture(evt.pointerId);
					this.updateCursor();
					return;
				}
				// Check mirror handles (instant-click, no drag)
				const mirrorVHandle = this.getMirrorVHandle(bbox, 10);
				const mirrorVDist = Math.sqrt((pointer.x - mirrorVHandle.x) ** 2 + (pointer.y - mirrorVHandle.y) ** 2);
				if (mirrorVDist <= this.handleHitRadius) {
					this.applyMirrorToPose(this.selectedPoseIndex, 'vertical');
					return;
				}
				const mirrorHHandle = this.getMirrorHHandle(bbox, 10);
				const mirrorHDist = Math.sqrt((pointer.x - mirrorHHandle.x) ** 2 + (pointer.y - mirrorHHandle.y) ** 2);
				if (mirrorHDist <= this.handleHitRadius) {
					this.applyMirrorToPose(this.selectedPoseIndex, 'horizontal');
					return;
				}
				const handles = this.getScaleHandles(bbox, 10);
				for (const [name, handle] of Object.entries(handles)) {
					const dist = Math.sqrt((pointer.x - handle.x) ** 2 + (pointer.y - handle.y) ** 2);
					if (dist <= this.handleHitRadius) {
						this.activeDragMode = 'scalePose';
						this.activeScaleHandle = name;
						this.dragStartPose = JSON.parse(JSON.stringify(pose));
						this.canvas.setPointerCapture(evt.pointerId);
						return;
					}
				}
			}
		}

		// ── 3. Keypoint hit-test ──
		// For Shift+Click: only act on keypoints from the active pose.
		// For plain click: find the topmost keypoint across all poses.
		if (isShift) {
			// Shift+Click: toggle keypoint in active pose only
			if (this.selectedPoseIndex !== null) {
				const activePose = this.poses[this.selectedPoseIndex];
				for (let kpId = 0; kpId < activePose.keypoints.length; kpId++) {
					const kp = activePose.keypoints[kpId];
					if (kp) {
						const dist = Math.sqrt((pointer.x - kp.x) ** 2 + (pointer.y - kp.y) ** 2);
						if (dist <= this.keypointHitRadius) {
							if (this.selectedKeypointIds.has(kpId)) {
								this.selectedKeypointIds.delete(kpId);
							} else {
								this.selectedKeypointIds.add(kpId);
							}
							this.requestRedraw();
							return; // Shift+Click never starts a drag
						}
					}
				}
			}
			// Shift+Click on empty space or inactive pose keypoint — fall through to step 5 for marquee start
		}

		// Plain click: hit-test all poses (topmost first)
		for (let poseIdx = this.poses.length - 1; poseIdx >= 0; poseIdx--) {
			const pose = this.poses[poseIdx];
			for (let kpId = 0; kpId < pose.keypoints.length; kpId++) {
				const kp = pose.keypoints[kpId];
				if (kp) {
					const dist = Math.sqrt((pointer.x - kp.x) ** 2 + (pointer.y - kp.y) ** 2);
					if (dist <= this.keypointHitRadius) {
						this.preselectionPoseIndex = null;
						this.selectionBoxHovered = true;
						this.hoveredHandle = null;
						// If this keypoint is part of the active multi-selection, move the whole group
						if (poseIdx === this.selectedPoseIndex && this.selectedKeypointIds.has(kpId) && this.selectedKeypointIds.size > 0) {
							// Move all selected keypoints together
							this.activeDragMode = 'moveSelectedKeypoints';
							const snapshotMap = new Map();
							for (const id of this.selectedKeypointIds) {
								const kpSnap = pose.keypoints[id];
								if (kpSnap) snapshotMap.set(id, { x: kpSnap.x, y: kpSnap.y });
							}
							this.dragStartKeypointMap = snapshotMap;
							this.canvas.setPointerCapture(evt.pointerId);
							this.updateCursor();
							return;
						}
						// Otherwise: plain single-keypoint drag (clears multi-selection)
						this.selectedKeypointIds = new Set();
						this.setSelectedPose(poseIdx);
						this.activeDragMode = 'dragKeypoint';
						this.activeKeypointId = kpId;
						this.dragStartKeypoint = {
							poseIndex: poseIdx,
							keypointId: kpId,
							x: kp.x,
							y: kp.y
						};
						this.updateCursor();
						this.canvas.setPointerCapture(evt.pointerId);
						return;
					}
				}
			}
		}

		// ── 4. Pose body hit (bounding box) ──
		if (!isShift) for (let poseIdx = this.poses.length - 1; poseIdx >= 0; poseIdx--) {
			const pose = this.poses[poseIdx];
			const bbox = this.getPoseBounds(pose);
			if (bbox) {
				if (pointer.x >= bbox.minX && pointer.x <= bbox.maxX &&
					pointer.y >= bbox.minY && pointer.y <= bbox.maxY) {
					// If clicking inside the active pose's body with a multi-selection,
					// do not clear the selection — start moving the selected keypoints
					if (poseIdx === this.selectedPoseIndex && this.selectedKeypointIds.size > 0) {
						this.preselectionPoseIndex = null;
						this.selectionBoxHovered = true;
						this.hoveredHandle = null;
						this.activeDragMode = 'moveSelectedKeypoints';
						const snapshotMap = new Map();
						const activePose = this.poses[this.selectedPoseIndex];
						for (const id of this.selectedKeypointIds) {
							const kpSnap = activePose.keypoints[id];
							if (kpSnap) snapshotMap.set(id, { x: kpSnap.x, y: kpSnap.y });
						}
						this.dragStartKeypointMap = snapshotMap;
						this.canvas.setPointerCapture(evt.pointerId);
						this.updateCursor();
						return;
					}
					this.preselectionPoseIndex = null;
					this.selectionBoxHovered = true;
					this.hoveredHandle = null;
					this.selectedKeypointIds = new Set();
					this.setSelectedPose(poseIdx);
					this.activeDragMode = 'movePose';
					this.dragStartPose = JSON.parse(JSON.stringify(pose));
					this.canvas.setPointerCapture(evt.pointerId);
					return;
				}
			}
		}

		// ── 5. Empty space — start marquee selection (only if a pose is selected) ──
		if (isShift && this.selectedPoseIndex !== null && this.selectedKeypointIds.size > 0) {
			// Shift-marquee: additive — keep existing selection as the base
			this.marqueeSelectionBase = new Set(this.selectedKeypointIds);
		} else {
			this.selectedKeypointIds = new Set();
			this.marqueeSelectionBase = null;
		}
		if (this.selectedPoseIndex !== null) {
			// Start marquee to select keypoints from the active pose
			this.activeDragMode = 'marquee';
			this.marqueeRect = { x1: pointer.x, y1: pointer.y, x2: pointer.x, y2: pointer.y };
			this.canvas.setPointerCapture(evt.pointerId);
			this.updateCursor();
			return;
		}

		// No pose selected — plain deselect
		this.setSelectedPose(null);
	}
	
	handlePointerMove(evt) {
		const pointer = this.screenToLogical(evt.clientX, evt.clientY);

		// ── Badge row hover: pointer cursor and tooltip ──
		{
			const wasBadge = this.isHoveringBadge;
			let hitBadge = null;
			if (this.conditioningAreasVisible && this._areaBadgeHitRects && this._areaBadgeHitRects.length > 0) {
				for (const br of this._areaBadgeHitRects) {
					if (pointer.x >= br.x && pointer.x <= br.x + br.w &&
					    pointer.y >= br.y && pointer.y <= br.y + br.h) {
						hitBadge = br;
						break;
					}
				}
			}
			if (hitBadge) {
				this.isHoveringBadge = true;
				const area = this.conditioningAreas[hitBadge.index];
				if (area) {
					const n = hitBadge.index + 1;
					this.canvas.title = `A${n}  x: ${area.x.toFixed(2)}  y: ${area.y.toFixed(2)}  w: ${area.width.toFixed(2)}  h: ${area.height.toFixed(2)}`;
				}
			} else {
				this.isHoveringBadge = false;
				this.canvas.title = '';
			}
			if (wasBadge !== this.isHoveringBadge) {
				this.updateCursor();
			}
		}

		// Always detect canvas hover, even when not dragging
		let hoveredKeypointId = null;
		let hoveredPoseIndex = null;
		
		// Check keypoint hit in reverse order (top to bottom)
		for (let poseIdx = this.poses.length - 1; poseIdx >= 0; poseIdx--) {
			const pose = this.poses[poseIdx];
			for (let kpId = 0; kpId < pose.keypoints.length; kpId++) {
				const kp = pose.keypoints[kpId];
				if (kp) {
					const dist = Math.sqrt((pointer.x - kp.x) ** 2 + (pointer.y - kp.y) ** 2);
					if (dist <= this.keypointHitRadius) {
						hoveredKeypointId = kpId;
						hoveredPoseIndex = poseIdx;
						break; // Found a keypoint, stop searching
					}
				}
			}
			if (hoveredKeypointId !== null) {
				break; // Found in this pose, stop searching other poses
			}
		}
		
		// Update canvas hover with pose index (sidebar hover takes priority internally)
		this.updateCanvasHoveredKeypoint(hoveredKeypointId, hoveredPoseIndex);

		// Debug: log hover detection when hovering keypoint 17 (Left Ear)
		if (hoveredKeypointId === 17 || hoveredKeypointId === 16) {
			debugLog('[canvas2d] Detected hover on keypoint ID:', hoveredKeypointId, 'Pose:', hoveredPoseIndex);
		}

		// Check if pointer is hovering a scale handle or inside the selection bounding box.
		// Multi-keypoint selection handles take priority over pose-level handles.
		const wasSelectionBoxHovered = this.selectionBoxHovered;
		const wasHoveredHandle = this.hoveredHandle;
		this.selectionBoxHovered = false;
		this.hoveredHandle = null;
		if (this.selectedPoseIndex !== null && this.selectedPoseIndex < this.poses.length) {
			// Priority 1: multi-keypoint selection bbox handles
			if (this.selectedKeypointIds.size > 0) {
				const mkBbox = this.getSelectedKeypointsBounds();
				if (mkBbox) {
					const padding = 10;
					const handles = this.getScaleHandles(mkBbox, padding);
					for (const [name, handle] of Object.entries(handles)) {
						const dist = Math.sqrt((pointer.x - handle.x) ** 2 + (pointer.y - handle.y) ** 2);
						if (dist <= this.handleHitRadius) {
							this.hoveredHandle = name;
							this.selectionBoxHovered = true;
							break;
						}
					}
					if (!this.hoveredHandle) {
						const inBounds = (
							pointer.x >= mkBbox.minX - padding &&
							pointer.x <= mkBbox.maxX + padding &&
							pointer.y >= mkBbox.minY - padding &&
							pointer.y <= mkBbox.maxY + padding
						);
						this.selectionBoxHovered = inBounds;
					}
				}
			} else {
				// Priority 2: pose-level bbox handles (only when no multi-selection)
				const selectedPose = this.poses[this.selectedPoseIndex];
				const bbox = this.getPoseBounds(selectedPose);
				if (bbox) {
					const padding = 10;
					// Check rotation handle first
					const rotHandle = this.getRotationHandle(bbox, padding);
					const rotDist = Math.sqrt((pointer.x - rotHandle.x) ** 2 + (pointer.y - rotHandle.y) ** 2);
					if (rotDist <= this.handleHitRadius) {
						this.hoveredHandle = 'rotate';
						this.selectionBoxHovered = true;
					} else {
						// Check mirror handles
						const mirrorVHandle = this.getMirrorVHandle(bbox, padding);
						const mirrorVDist = Math.sqrt((pointer.x - mirrorVHandle.x) ** 2 + (pointer.y - mirrorVHandle.y) ** 2);
						if (mirrorVDist <= this.handleHitRadius) {
							this.hoveredHandle = 'mirrorV';
							this.selectionBoxHovered = true;
						} else {
							const mirrorHHandle = this.getMirrorHHandle(bbox, padding);
							const mirrorHDist = Math.sqrt((pointer.x - mirrorHHandle.x) ** 2 + (pointer.y - mirrorHHandle.y) ** 2);
							if (mirrorHDist <= this.handleHitRadius) {
								this.hoveredHandle = 'mirrorH';
								this.selectionBoxHovered = true;
							} else {
								const handles = this.getScaleHandles(bbox, padding);
								for (const [name, handle] of Object.entries(handles)) {
									const dist = Math.sqrt((pointer.x - handle.x) ** 2 + (pointer.y - handle.y) ** 2);
									if (dist <= this.handleHitRadius) {
										this.hoveredHandle = name;
										this.selectionBoxHovered = true;
										break;
									}
								}
							}
						}
					}
					if (!this.hoveredHandle) {
						const inBounds = (
							pointer.x >= bbox.minX - padding &&
							pointer.x <= bbox.maxX + padding &&
							pointer.y >= bbox.minY - padding &&
							pointer.y <= bbox.maxY + padding
						);
						this.selectionBoxHovered = inBounds;
					}
				}
			}
		}
		// Update cursor and redraw if hover state changed
		if (wasSelectionBoxHovered !== this.selectionBoxHovered || wasHoveredHandle !== this.hoveredHandle) {
			this.updateCursor();
			this.requestRedraw();
		}

		// Hover preselection: detect which pose would be selected on click
		const prevPreselection = this.preselectionPoseIndex;
		this.preselectionPoseIndex = null;

		// Only show preselection when not hovering over handles of the selected pose
		if (!this.hoveredHandle) {
			// Check poses in reverse order (top to bottom) for preselection
			for (let poseIdx = this.poses.length - 1; poseIdx >= 0; poseIdx--) {
				// Skip the currently selected pose - it has its own selection UI
				if (poseIdx === this.selectedPoseIndex) continue;

				const pose = this.poses[poseIdx];
				const bbox = this.getPoseBounds(pose);
				if (bbox) {
					// Check if pointer is within bounding box
					if (pointer.x >= bbox.minX && pointer.x <= bbox.maxX &&
						pointer.y >= bbox.minY && pointer.y <= bbox.maxY) {
						this.preselectionPoseIndex = poseIdx;
						break;
					}
				}
			}
		}

		// Redraw if preselection changed
		if (prevPreselection !== this.preselectionPoseIndex) {
			this.requestRedraw();
		}

		// Return early if not actively dragging (hover detection done)
		if (this.activeDragMode === 'none') return;

		// ── Marquee drag ──
		if (this.activeDragMode === 'marquee') {
			this.marqueeRect.x2 = pointer.x;
			this.marqueeRect.y2 = pointer.y;
			// Live-preview: update selectedKeypointIds to match keypoints inside current rect
			if (this.selectedPoseIndex !== null && this.selectedPoseIndex < this.poses.length) {
				const rect = this.marqueeRect;
				const rxMin = Math.min(rect.x1, rect.x2);
				const rxMax = Math.max(rect.x1, rect.x2);
				const ryMin = Math.min(rect.y1, rect.y2);
				const ryMax = Math.max(rect.y1, rect.y2);
				const liveSelection = this.marqueeSelectionBase ? new Set(this.marqueeSelectionBase) : new Set();
				const activePose = this.poses[this.selectedPoseIndex];
				for (let kpId = 0; kpId < activePose.keypoints.length; kpId++) {
					const kp = activePose.keypoints[kpId];
					if (kp && kp.x >= rxMin && kp.x <= rxMax && kp.y >= ryMin && kp.y <= ryMax) {
						liveSelection.add(kpId);
					}
				}
				this.selectedKeypointIds = liveSelection;
			}
			this.requestRedraw();
			return;
		}
		
		const pose = this.poses[this.selectedPoseIndex];
		
		if (this.activeDragMode === 'dragKeypoint') {
			// Clamp to canvas bounds
			pose.keypoints[this.activeKeypointId] = {
				x: Math.max(0, Math.min(this.logicalWidth, pointer.x)),
				y: Math.max(0, Math.min(this.logicalHeight, pointer.y))
			};
			// Update trash target hover state (radial hit-test against quarter-circle)
			const R = this._getTrashTargetRadius();
			const wasHovered = this.trashTargetHovered;
			const dx = this.logicalWidth - pointer.x;
			const dy = pointer.y;
			this.trashTargetHovered = (dx * dx + dy * dy <= R * R);
			if (wasHovered !== this.trashTargetHovered) {
				this.requestRedraw();
				return;
			}
			this.requestRedraw();
		}
		else if (this.activeDragMode === 'moveSelectedKeypoints') {
			// Delta-move all selected keypoints from their start positions
			const dx = pointer.x - this.dragStartPointer.x;
			const dy = pointer.y - this.dragStartPointer.y;
			for (const [kpId, startPos] of this.dragStartKeypointMap) {
				pose.keypoints[kpId] = {
					x: Math.max(0, Math.min(this.logicalWidth, startPos.x + dx)),
					y: Math.max(0, Math.min(this.logicalHeight, startPos.y + dy))
				};
			}
			this.requestRedraw();
		}
		else if (this.activeDragMode === 'scaleSelectedKeypoints') {
			// Compute bbox from the snapshot positions in dragStartKeypointMap
			let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
			for (const pos of this.dragStartKeypointMap.values()) {
				minX = Math.min(minX, pos.x); minY = Math.min(minY, pos.y);
				maxX = Math.max(maxX, pos.x); maxY = Math.max(maxY, pos.y);
			}
			const bbox = { minX, minY, maxX, maxY };
			const handle = this.activeScaleHandle;
			let scaleX = 1, scaleY = 1, anchorX, anchorY;

			if (['nw', 'ne', 'sw', 'se'].includes(handle)) {
				const anchorMap = {
					nw: { x: bbox.maxX, y: bbox.maxY },
					ne: { x: bbox.minX, y: bbox.maxY },
					sw: { x: bbox.maxX, y: bbox.minY },
					se: { x: bbox.minX, y: bbox.minY }
				};
				const anchor = anchorMap[handle];
				anchorX = anchor.x; anchorY = anchor.y;
				const handleOriginal = this.getScaleHandles(bbox, 10)[handle];
				const originalDist = Math.sqrt((handleOriginal.x - anchorX) ** 2 + (handleOriginal.y - anchorY) ** 2);
				const currentDist = Math.sqrt((pointer.x - anchorX) ** 2 + (pointer.y - anchorY) ** 2);
				let scale = originalDist > 0 ? currentDist / originalDist : 1;
				scale = Math.max(0.1, Math.min(10, scale));
				scaleX = scale; scaleY = scale;
			} else if (handle === 'e') {
				anchorX = bbox.minX; anchorY = (bbox.minY + bbox.maxY) / 2;
				const w = bbox.maxX - bbox.minX;
				scaleX = w > 0 ? Math.max(0.1, Math.min(10, (pointer.x - anchorX) / w)) : 1; scaleY = 1;
			} else if (handle === 'w') {
				anchorX = bbox.maxX; anchorY = (bbox.minY + bbox.maxY) / 2;
				const w = bbox.maxX - bbox.minX;
				scaleX = w > 0 ? Math.max(0.1, Math.min(10, (anchorX - pointer.x) / w)) : 1; scaleY = 1;
			} else if (handle === 's') {
				anchorX = (bbox.minX + bbox.maxX) / 2; anchorY = bbox.minY;
				const h = bbox.maxY - bbox.minY;
				scaleX = 1; scaleY = h > 0 ? Math.max(0.1, Math.min(10, (pointer.y - anchorY) / h)) : 1;
			} else if (handle === 'n') {
				anchorX = (bbox.minX + bbox.maxX) / 2; anchorY = bbox.maxY;
				const h = bbox.maxY - bbox.minY;
				scaleX = 1; scaleY = h > 0 ? Math.max(0.1, Math.min(10, (anchorY - pointer.y) / h)) : 1;
			}

			for (const [kpId, startPos] of this.dragStartKeypointMap) {
				pose.keypoints[kpId] = {
					x: anchorX + (startPos.x - anchorX) * scaleX,
					y: anchorY + (startPos.y - anchorY) * scaleY
				};
			}
			this.requestRedraw();
		}
		else if (this.activeDragMode === 'movePose') {
			const dx = pointer.x - this.dragStartPointer.x;
			const dy = pointer.y - this.dragStartPointer.y;
			
			for (let i = 0; i < pose.keypoints.length; i++) {
				const originalKp = this.dragStartPose.keypoints[i];
				if (originalKp) {
					pose.keypoints[i] = {
						x: Math.max(0, Math.min(this.logicalWidth, originalKp.x + dx)),
						y: Math.max(0, Math.min(this.logicalHeight, originalKp.y + dy))
					};
				}
			}
			if (Array.isArray(pose.faceKeypoints) && Array.isArray(this.dragStartPose.faceKeypoints)) {
				for (let i = 0; i < pose.faceKeypoints.length; i++) {
					const originalKp = this.dragStartPose.faceKeypoints[i];
					if (originalKp) {
						pose.faceKeypoints[i] = {
							x: Math.max(0, Math.min(this.logicalWidth, originalKp.x + dx)),
							y: Math.max(0, Math.min(this.logicalHeight, originalKp.y + dy))
						};
					}
				}
			}
			if (Array.isArray(pose.handLeftKeypoints) && Array.isArray(this.dragStartPose.handLeftKeypoints)) {
				for (let i = 0; i < pose.handLeftKeypoints.length; i++) {
					const originalKp = this.dragStartPose.handLeftKeypoints[i];
					if (originalKp) {
						pose.handLeftKeypoints[i] = {
							x: Math.max(0, Math.min(this.logicalWidth, originalKp.x + dx)),
							y: Math.max(0, Math.min(this.logicalHeight, originalKp.y + dy))
						};
					}
				}
			}
			if (Array.isArray(pose.handRightKeypoints) && Array.isArray(this.dragStartPose.handRightKeypoints)) {
				for (let i = 0; i < pose.handRightKeypoints.length; i++) {
					const originalKp = this.dragStartPose.handRightKeypoints[i];
					if (originalKp) {
						pose.handRightKeypoints[i] = {
							x: Math.max(0, Math.min(this.logicalWidth, originalKp.x + dx)),
							y: Math.max(0, Math.min(this.logicalHeight, originalKp.y + dy))
						};
					}
				}
			}
			this.requestRedraw();
		}
		else if (this.activeDragMode === 'scalePose') {
			const bbox = this.getPoseBounds(this.dragStartPose);
			if (!bbox) return;
			
			const handle = this.activeScaleHandle;
			let scaleX = 1;
			let scaleY = 1;
			let anchorX, anchorY;
			
			// Determine anchor and scale based on handle type
			if (['nw', 'ne', 'sw', 'se'].includes(handle)) {
				// CORNER HANDLES: Uniform scaling
				const anchorMap = {
					nw: { x: bbox.maxX, y: bbox.maxY },
					ne: { x: bbox.minX, y: bbox.maxY },
					sw: { x: bbox.maxX, y: bbox.minY },
					se: { x: bbox.minX, y: bbox.minY }
				};
				const anchor = anchorMap[handle];
				anchorX = anchor.x;
				anchorY = anchor.y;
				
				// Calculate uniform scale factor
				const handleOriginal = this.getScaleHandles(bbox, 10)[handle];
				const originalDist = Math.sqrt(
					(handleOriginal.x - anchor.x) ** 2 + (handleOriginal.y - anchor.y) ** 2
				);
				const currentDist = Math.sqrt(
					(pointer.x - anchor.x) ** 2 + (pointer.y - anchor.y) ** 2
				);
				
				let scale = currentDist / originalDist;
				scale = Math.max(0.1, Math.min(10, scale)); // Clamp
				scaleX = scale;
				scaleY = scale;
			} else if (handle === 'e') {
				// RIGHT: Scale X only
				anchorX = bbox.minX;
				anchorY = (bbox.minY + bbox.maxY) / 2;
				const originalWidth = bbox.maxX - bbox.minX;
				const newWidth = pointer.x - anchorX;
				scaleX = newWidth / originalWidth;
				scaleX = Math.max(0.1, Math.min(10, scaleX));
				scaleY = 1;
			} else if (handle === 'w') {
				// LEFT: Scale X only
				anchorX = bbox.maxX;
				anchorY = (bbox.minY + bbox.maxY) / 2;
				const originalWidth = bbox.maxX - bbox.minX;
				const newWidth = anchorX - pointer.x;
				scaleX = newWidth / originalWidth;
				scaleX = Math.max(0.1, Math.min(10, scaleX));
				scaleY = 1;
			} else if (handle === 's') {
				// BOTTOM: Scale Y only
				anchorX = (bbox.minX + bbox.maxX) / 2;
				anchorY = bbox.minY;
				const originalHeight = bbox.maxY - bbox.minY;
				const newHeight = pointer.y - anchorY;
				scaleY = newHeight / originalHeight;
				scaleY = Math.max(0.1, Math.min(10, scaleY));
				scaleX = 1;
			} else if (handle === 'n') {
				// TOP: Scale Y only
				anchorX = (bbox.minX + bbox.maxX) / 2;
				anchorY = bbox.maxY;
				const originalHeight = bbox.maxY - bbox.minY;
				const newHeight = anchorY - pointer.y;
				scaleY = newHeight / originalHeight;
				scaleY = Math.max(0.1, Math.min(10, scaleY));
				scaleX = 1;
			}
			
			// Apply scale
			for (let i = 0; i < pose.keypoints.length; i++) {
				const originalKp = this.dragStartPose.keypoints[i];
				if (originalKp) {
					pose.keypoints[i] = {
						x: anchorX + (originalKp.x - anchorX) * scaleX,
						y: anchorY + (originalKp.y - anchorY) * scaleY
					};
				}
			}
			if (Array.isArray(pose.faceKeypoints) && Array.isArray(this.dragStartPose.faceKeypoints)) {
				for (let i = 0; i < pose.faceKeypoints.length; i++) {
					const originalKp = this.dragStartPose.faceKeypoints[i];
					if (originalKp) {
						pose.faceKeypoints[i] = {
							x: anchorX + (originalKp.x - anchorX) * scaleX,
							y: anchorY + (originalKp.y - anchorY) * scaleY
						};
					}
				}
			}
			if (Array.isArray(pose.handLeftKeypoints) && Array.isArray(this.dragStartPose.handLeftKeypoints)) {
				for (let i = 0; i < pose.handLeftKeypoints.length; i++) {
					const originalKp = this.dragStartPose.handLeftKeypoints[i];
					if (originalKp) {
						pose.handLeftKeypoints[i] = {
							x: anchorX + (originalKp.x - anchorX) * scaleX,
							y: anchorY + (originalKp.y - anchorY) * scaleY
						};
					}
				}
			}
			if (Array.isArray(pose.handRightKeypoints) && Array.isArray(this.dragStartPose.handRightKeypoints)) {
				for (let i = 0; i < pose.handRightKeypoints.length; i++) {
					const originalKp = this.dragStartPose.handRightKeypoints[i];
					if (originalKp) {
						pose.handRightKeypoints[i] = {
							x: anchorX + (originalKp.x - anchorX) * scaleX,
							y: anchorY + (originalKp.y - anchorY) * scaleY
						};
					}
				}
			}
			this.requestRedraw();
		}
		else if (this.activeDragMode === 'rotatePose') {
			if (!this.rotatePivot || this.rotateStartAngle === null) return;
			const cx = this.rotatePivot.x;
			const cy = this.rotatePivot.y;
			const currentAngle = Math.atan2(pointer.y - cy, pointer.x - cx);
			const deltaAngle = currentAngle - this.rotateStartAngle;
			const cosA = Math.cos(deltaAngle);
			const sinA = Math.sin(deltaAngle);
			const rotatePoint = (kp) => {
				if (!kp) return null;
				const dx = kp.x - cx;
				const dy = kp.y - cy;
				return {
					x: cx + dx * cosA - dy * sinA,
					y: cy + dx * sinA + dy * cosA
				};
			};
			for (let i = 0; i < pose.keypoints.length; i++) {
				pose.keypoints[i] = rotatePoint(this.dragStartPose.keypoints[i]);
			}
			if (Array.isArray(pose.faceKeypoints) && Array.isArray(this.dragStartPose.faceKeypoints)) {
				for (let i = 0; i < pose.faceKeypoints.length; i++) {
					pose.faceKeypoints[i] = rotatePoint(this.dragStartPose.faceKeypoints[i]);
				}
			}
			if (Array.isArray(pose.handLeftKeypoints) && Array.isArray(this.dragStartPose.handLeftKeypoints)) {
				for (let i = 0; i < pose.handLeftKeypoints.length; i++) {
					pose.handLeftKeypoints[i] = rotatePoint(this.dragStartPose.handLeftKeypoints[i]);
				}
			}
			if (Array.isArray(pose.handRightKeypoints) && Array.isArray(this.dragStartPose.handRightKeypoints)) {
				for (let i = 0; i < pose.handRightKeypoints.length; i++) {
					pose.handRightKeypoints[i] = rotatePoint(this.dragStartPose.handRightKeypoints[i]);
				}
			}
			this.requestRedraw();
		}
	}
	
	handlePointerUp(evt) {
		// ── Drag-to-delete: drop on trash target deletes the keypoint ──
		if (this.activeDragMode === 'dragKeypoint' && this.trashTargetHovered && this.dragStartKeypoint) {
			const { poseIndex, keypointId } = this.dragStartKeypoint;
			// Restore keypoint to start position before clearing (so we nullify cleanly)
			const pose = this.poses[poseIndex];
			if (pose && pose.keypoints) {
				pose.keypoints[keypointId] = null;
				this.markKeypointEdited();
			}
			// Reset all drag state
			this.trashTargetHovered = false;
			this.activeDragMode = 'none';
			this.activeKeypointId = null;
			this.dragStartPointer = null;
			this.dragStartKeypoint = null;
			this.canvas.releasePointerCapture(evt.pointerId);
			this.notifyChange('geometry');
			this.updateCursor();
			this.requestRedraw();
			return;
		}

		if (this.activeDragMode === 'dragKeypoint' && this.dragStartKeypoint) {
			const pose = this.poses[this.dragStartKeypoint.poseIndex];
			const kp = pose ? pose.keypoints[this.dragStartKeypoint.keypointId] : null;
			if (kp && (kp.x !== this.dragStartKeypoint.x || kp.y !== this.dragStartKeypoint.y)) {
				this.markKeypointEdited();
			}
		}

		// Finalise marquee: select keypoints from active pose inside the rect
		if (this.activeDragMode === 'marquee' && this.marqueeRect !== null) {
			const rect = this.marqueeRect;
			const rxMin = Math.min(rect.x1, rect.x2);
			const rxMax = Math.max(rect.x1, rect.x2);
			const ryMin = Math.min(rect.y1, rect.y2);
			const ryMax = Math.max(rect.y1, rect.y2);
			const dragWidth = rxMax - rxMin;
			const dragHeight = ryMax - ryMin;
			// Treat sub-5px drag as a plain click: deselect the pose (same as original empty-space click)
			const isClick = dragWidth < 5 && dragHeight < 5;
			if (isClick) {
				this.marqueeRect = null;
				this.marqueeSelectionBase = null;
				this.setSelectedPose(null);
			} else {
				const newSelection = this.marqueeSelectionBase ? new Set(this.marqueeSelectionBase) : new Set();
				if (this.selectedPoseIndex !== null && this.selectedPoseIndex < this.poses.length) {
					const activePose = this.poses[this.selectedPoseIndex];
					for (let kpId = 0; kpId < activePose.keypoints.length; kpId++) {
						const kp = activePose.keypoints[kpId];
						if (kp && kp.x >= rxMin && kp.x <= rxMax && kp.y >= ryMin && kp.y <= ryMax) {
							newSelection.add(kpId);
						}
					}
				}
				this.selectedKeypointIds = newSelection;
				this.marqueeRect = null;
				this.marqueeSelectionBase = null;
				this.notifyChange('select');
			}
		}

		if (this.activeDragMode === 'moveSelectedKeypoints' || this.activeDragMode === 'scaleSelectedKeypoints') {
			this.markKeypointEdited();
			this.notifyChange('geometry');
		} else if (this.activeDragMode !== 'none' && this.activeDragMode !== 'marquee') {
			this.notifyChange('geometry');
		}
		
		this.trashTargetHovered = false;
		this.activeDragMode = 'none';
		this.activeKeypointId = null;
		this.activeScaleHandle = null;
		this.dragStartPointer = null;
		this.dragStartPose = null;
		this.dragStartKeypoint = null;
		this.dragStartKeypointMap = null;
		this.rotatePivot = null;
		this.rotateStartAngle = null;
		this.canvas.releasePointerCapture(evt.pointerId);
		
		// Update cursor after drag ends (may restore to default or keep crosshair if still hovering)
		this.updateCursor();
		this.requestRedraw();
	}
	
	handlePointerLeave(evt) {
		// Clear canvas hover when pointer leaves the canvas
		this.updateCanvasHoveredKeypoint(null, null);
		// Reset selection box, handle hover state, and preselection
		const needsRedraw = this.selectionBoxHovered || this.hoveredHandle || this.preselectionPoseIndex !== null;
		this.selectionBoxHovered = false;
		this.hoveredHandle = null;
		this.preselectionPoseIndex = null;
		// Clear badge hover state
		this.isHoveringBadge = false;
		this.canvas.title = '';
		if (needsRedraw) {
			this.requestRedraw();
		}
		// Update cursor to default
		this.updateCursor();
	}

	/**
	 * Double-click on a loose keypoint (one with no currently-drawn skeleton connections)
	 * completes the chain by placing all missing intermediate keypoints between the
	 * double-clicked keypoint and the nearest existing neighbor reachable through the
	 * skeleton topology. Intermediate points are placed equidistantly along the straight
	 * line between the two endpoints. Does nothing if the keypoint is already connected
	 * or if no reachable neighbor exists.
	 */
	handleDoubleClick(evt) {
		evt.preventDefault();
		const pointer = this.screenToLogical(evt.clientX, evt.clientY);

		// Hit-test: find which keypoint was double-clicked (reverse order, topmost first)
		let hitPoseIdx = null;
		let hitKeypointId = null;
		for (let poseIdx = this.poses.length - 1; poseIdx >= 0; poseIdx--) {
			const pose = this.poses[poseIdx];
			for (let kpId = 0; kpId < pose.keypoints.length; kpId++) {
				const kp = pose.keypoints[kpId];
				if (kp) {
					const dx = pointer.x - kp.x;
					const dy = pointer.y - kp.y;
					if (Math.sqrt(dx * dx + dy * dy) <= this.keypointHitRadius) {
						hitPoseIdx = poseIdx;
						hitKeypointId = kpId;
						break;
					}
				}
			}
			if (hitPoseIdx !== null) break;
		}

		if (hitPoseIdx === null) return;

		// Ensure the double-clicked pose becomes the active selection
		if (this.selectedPoseIndex !== hitPoseIdx) {
			this.setSelectedPose(hitPoseIdx);
		}

		const pose = this.poses[hitPoseIdx];

		// Respect existing format edit restrictions (e.g. COCO-17 is read-only)
		const formatId = pose.formatId || (pose.keypoints[1] == null ? 'coco17' : 'coco18');
		if (!isFormatEditAllowed(formatId)) {
			return;
		}

		// Build adjacency from the active skeleton topology for this pose
		const format = getFormat(formatId) || getFormat(DEFAULT_FORMAT_ID);
		const edges = Array.isArray(format?.skeletonEdges) ? format.skeletonEdges : [];
		const kpCount = pose.keypoints.length;
		const adjacency = Array.from({ length: kpCount }, () => []);
		for (const edge of edges) {
			if (!Array.isArray(edge) || edge.length < 2) continue;
			const [a, b] = edge;
			if (a >= 0 && a < kpCount && b >= 0 && b < kpCount) {
				adjacency[a].push(b);
				adjacency[b].push(a);
			}
		}

		// A keypoint is "loose" when none of its direct skeleton neighbors are present.
		// If it already has at least one drawn connection, there is nothing to complete.
		const directNeighbors = adjacency[hitKeypointId];
		const hasDirectConnection = directNeighbors.some(n => pose.keypoints[n] != null);
		if (hasDirectConnection) {
			return;
		}

		// BFS outward through only missing keypoints to find the nearest present one.
		// BFS guarantees the first present keypoint found is reachable via the fewest hops.
		const visited = new Set([hitKeypointId]);
		const queue = [];
		for (const neighbor of directNeighbors) {
			if (!visited.has(neighbor)) {
				visited.add(neighbor);
				queue.push({ id: neighbor, path: [neighbor] });
			}
		}

		let bestChain = null;
		while (queue.length > 0) {
			const { id, path } = queue.shift();
			if (pose.keypoints[id] != null) {
				// Nearest reachable existing keypoint found.
				// path is [n1, n2, ..., target] where n1..n_{k-1} are missing and target is present.
				bestChain = {
					target: id,
					missing: path.slice(0, -1),
					hopCount: path.length
				};
				break;
			}
			// This node is also missing — continue BFS
			for (const next of adjacency[id]) {
				if (!visited.has(next)) {
					visited.add(next);
					queue.push({ id: next, path: [...path, next] });
				}
			}
		}

		if (!bestChain || bestChain.missing.length === 0) {
			// No reachable existing neighbor found, or nothing to fill in
			return;
		}

		// Place missing intermediate keypoints equidistantly along the straight line
		// from the double-clicked keypoint to the found existing neighbor.
		// For k missing nodes and hopCount total hops the interpolation factor for
		// the k-th intermediate is t = (k+1) / hopCount.
		const startKp = pose.keypoints[hitKeypointId];
		const targetKp = pose.keypoints[bestChain.target];
		let placed = 0;
		for (let k = 0; k < bestChain.missing.length; k++) {
			const midId = bestChain.missing[k];
			if (pose.keypoints[midId] != null) {
				continue; // Safety: already present, never overwrite
			}
			const t = (k + 1) / bestChain.hopCount;
			pose.keypoints[midId] = {
				x: Math.max(0, Math.min(this.logicalWidth,  startKp.x + t * (targetKp.x - startKp.x))),
				y: Math.max(0, Math.min(this.logicalHeight, startKp.y + t * (targetKp.y - startKp.y)))
			};
			placed++;
		}

		if (placed > 0) {
			this.markKeypointEdited();
			this.requestRedraw();
			this.notifyChange('geometry');
		}
	}

	getKeypointColor(keypointId, keypointColors = null, formatKeypoints = null) {
		const colors = Array.isArray(keypointColors) ? keypointColors : null;
		if (colors && colors[keypointId]) {
			return colors[keypointId];
		}
		const keypoints = Array.isArray(formatKeypoints) ? formatKeypoints : null;
		if (keypoints && keypoints[keypointId] && Array.isArray(keypoints[keypointId].rgb)) {
			return keypoints[keypointId].rgb;
		}
		const fallbackFormat = getFormat(this.activeFormatId) || getFormat(DEFAULT_FORMAT_ID);
		const fallbackColors = Array.isArray(fallbackFormat?.keypointColors) ? fallbackFormat.keypointColors : null;
		if (fallbackColors && fallbackColors[keypointId]) {
			return fallbackColors[keypointId];
		}
		const fallbackKeypoints = Array.isArray(fallbackFormat?.keypoints) ? fallbackFormat.keypoints : null;
		if (fallbackKeypoints && fallbackKeypoints[keypointId] && Array.isArray(fallbackKeypoints[keypointId].rgb)) {
			return fallbackKeypoints[keypointId].rgb;
		}
		return [255, 255, 255];
	}
}
