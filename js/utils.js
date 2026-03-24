/**
 * Shared utilities for comfyui-openpose-studio
 */

import {
  getFormatForPose,
  getFormat,
  importPoseKeypoints,
} from "./formats/index.js";
import { t } from "./modules/i18n.js";

// ============================================================================
// Canvas Defaults
// ============================================================================

// Default canvas dimensions
export const DEFAULT_CANVAS_WIDTH = 512;
export const DEFAULT_CANVAS_HEIGHT = 512;
export const DEFAULT_PANEL_CANVAS_WIDTH = 768;
export const DEFAULT_PANEL_CANVAS_HEIGHT = 512;

// ============================================================================
// Static configuration constants (shared)
// ============================================================================

export const BLENDER_GRID_BACKGROUND = "#2b2b2b";
export const BLENDER_GRID_LINE = "#c7c7c7";
export const BLENDER_AXIS_X = "#3fae5b";
export const BLENDER_AXIS_Y = "#d45353";

export const PREVIEW_WIDTH = 200;
export const PREVIEW_HEIGHT = 200;
export const MISSING_KEYPOINT_DRAG_TYPE = "text/openpose-missing-keypoint";

export const POSES_LIST_URL = "/openpose/poses";
export const POSES_FILE_URL = "/openpose/poses/";

export const PREVIEW_OUTLINE_STROKE = "rgba(0,0,0,0.22)";
export const PREVIEW_OUTLINE_FILL = "rgba(0,0,0,0.28)";

export function drawBoneWithOutline(
  ctx,
  x1,
  y1,
  x2,
  y2,
  color,
  lineWidth,
  outlineWidth = 2,
  outlineColor = PREVIEW_OUTLINE_STROKE,
) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = lineWidth + outlineWidth;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function drawKeypointWithOutline(
  ctx,
  x,
  y,
  color,
  radius,
  outlineWidth = 1.2,
  outlineColor = PREVIEW_OUTLINE_FILL,
) {
  ctx.fillStyle = outlineColor;
  ctx.beginPath();
  ctx.arc(x, y, radius + outlineWidth, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export const FALLBACK_COMFY_THEME = {
  isLight: false,
  theme: "dark",
  background: "#202020",
  text: "#fff",
  menuBg: "#353535",
  menuBgSecondary: "#303030",
  inputBg: "#222",
  inputText: "#ddd",
  border: "#4e4e4e",
  error: "#ff4444",
  rowEven: "#222",
  rowOdd: "#353535",
  contentHover: "#222"
};

// Default built-in pose presets (COCO formats)
export const DEFAULT_POSE_COCO18 = {
  id: "coco-18-openpose",
  label: "COCO_18 (OpenPose)",
  keypoints: [
    [241, 77], [241, 120], [191, 118], [177, 183],
    [163, 252], [298, 118], [317, 182], [332, 245],
    [225, 241], [213, 359], [215, 454], [270, 240],
    [282, 360], [286, 456], [232, 59], [253, 60],
    [225, 70], [260, 72]
  ],
  canvas_width: 512,
  canvas_height: 512
};

export const DEFAULT_POSE_COCO17 = {
  id: "default-coco-18-ultralytics",
  label: "COCO_17 (Ultralytics)",
  keypoints: [
    [241, 77], null, [191, 118], [177, 183], [163, 252], [298, 118], [317, 182], [332, 245],
    [225, 241], [213, 359], [215, 454], [270, 240], [282, 360], [286, 456], [232, 59], [253, 60], [225, 70], [260, 72]
  ],
  canvas_width: 512,
  canvas_height: 512
};

// ============================================================================
// Format-Aware Skeleton Accessors (delegate to format registry)
// ============================================================================

/**
 * Get the appropriate skeleton edges based on the pose format.
 * @param {boolean} isCoco17 - True if pose is COCO-17 format
 * @returns {Array} Array of [keypoint_a, keypoint_b] pairs
 */
export function getSkeletonEdges(isCoco17 = false) {
  const format = getFormat(isCoco17 ? "coco17" : "coco18");
  return format.skeletonEdges;
}

/**
 * Get the appropriate skeleton edge colors based on the pose format.
 * @param {boolean} isCoco17 - True if pose is COCO-17 format
 * @returns {Array} Array of [r, g, b] color arrays
 */
export function getSkeletonEdgeColors(isCoco17 = false) {
  const format = getFormat(isCoco17 ? "coco17" : "coco18");
  return format.skeletonColors;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Show a toast notification using ComfyUI's native Toast API.
 * Falls back to console logging for older ComfyUI versions.
 * @param {string} severity - "info", "success", "warn", or "error"
 * @param {string} summary - Toast title
 * @param {string} detail - Toast message body
 * @param {number} lifeMs - Duration in milliseconds (default: 4000)
 * @returns {boolean} - True if toast was shown, false if fallback was used
 */
export function showToast(severity, summary, detail, lifeMs = 4000) {
  const toast = app?.extensionManager?.toast;
  if (toast && typeof toast.add === "function") {
    toast.add({ severity, summary, detail, life: lifeMs });
    return true;
  }
  // Fallback for older ComfyUI: never crash
  const fn =
    severity === "error"
      ? "error"
      : severity === "warn"
        ? "warn"
        : severity === "success"
          ? "log"
          : "log";
  console[fn](`[OpenPose Studio] ${summary}: ${detail}`);
  return false;
}

/**
 * Show a confirmation dialog using ComfyUI's dialog API.
 * Falls back to native confirm for older ComfyUI versions.
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {object} options - Additional dialog options
 * @returns {Promise<boolean>} - True if confirmed, false otherwise
 */
export async function showConfirm(title, message, options = null) {
  const dialog = app?.extensionManager?.dialog;
  if (dialog && typeof dialog.confirm === "function") {
    try {
      const result = await dialog.confirm({
        title: title ?? "",
        message: message ?? "",
        ...(options && typeof options === "object" ? options : {}),
      });
      return !!result;
    } catch (error) {
      // Fall back to native confirm
    }
  }
  try {
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const textTitle = title ? String(title) : "";
      const textMessage = message ? String(message) : "";
      const combined =
        textTitle && textMessage
          ? `${textTitle}\n\n${textMessage}`
          : textTitle || textMessage;
      return !!window.confirm(combined);
    }
  } catch (error) {
    // Ignore fallback errors
  }
  return false;
}

/**
 * Copy text to clipboard using Clipboard API with execCommand fallback.
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} - True if copied successfully
 */
export async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Fall through to legacy method
    }
    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        return true;
    } catch {
        return false;
    }
}

export function applySidebarButtonStyles(buttons) {
  if (!buttons) {
    return;
  }
  Array.from(buttons).forEach((btn) => {
    if (!btn) {
      return;
    }
    btn.classList.add("openpose-sidebar-btn-styled");
  });
}

/**
 * Show a prompt dialog using ComfyUI's dialog API.
 * Falls back to native prompt for older ComfyUI versions.
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {string} defaultValue - Default input value
 * @param {object} options - Additional dialog options
 * @returns {Promise<string|null>} - Entered value or null if canceled
 */
export async function showPrompt(title, message, defaultValue = "", options = null) {
  const dialog = app?.extensionManager?.dialog;
  if (dialog && typeof dialog.prompt === "function") {
    try {
      const result = await dialog.prompt({
        title: title ?? "",
        message: message ?? "",
        defaultValue: defaultValue ?? "",
        ...(options && typeof options === "object" ? options : {}),
      });
      if (typeof result === "string") {
        return result;
      }
      if (result === null || result === undefined) {
        return null;
      }
      return String(result);
    } catch (error) {
      // Fall back to native prompt
    }
  }
  try {
    if (typeof window !== "undefined" && typeof window.prompt === "function") {
      const textTitle = title ? String(title) : "";
      const textMessage = message ? String(message) : "";
      const combined =
        textTitle && textMessage
          ? `${textTitle}\n\n${textMessage}`
          : textTitle || textMessage;
      const response = window.prompt(combined, String(defaultValue ?? ""));
      return response === null ? null : String(response);
    }
  } catch (error) {
    // Ignore fallback errors
  }
  return null;
}

// ============================================================================
// Persistence Helpers
// ============================================================================

const PERSIST_NAMESPACE = "openpose_editor.";

function normalizePersistKey(key) {
  if (typeof key !== "string") {
    return null;
  }
  const trimmed = key.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith(PERSIST_NAMESPACE)) {
    return trimmed;
  }
  return `${PERSIST_NAMESPACE}${trimmed}`;
}

function getLocalStorageSafe() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage || null;
  } catch (error) {
    return null;
  }
}

export function getPersistedSetting(key, defaultValue = null) {
  const storage = getLocalStorageSafe();
  const normalized = normalizePersistKey(key);
  if (!storage || !normalized) {
    return defaultValue;
  }
  try {
    const value = storage.getItem(normalized);
    return value === null ? defaultValue : value;
  } catch (error) {
    return defaultValue;
  }
}

export function setPersistedSetting(key, value) {
  const storage = getLocalStorageSafe();
  const normalized = normalizePersistKey(key);
  if (!storage || !normalized) {
    return false;
  }
  if (value === null || value === undefined) {
    return removePersistedSetting(key);
  }
  try {
    storage.setItem(normalized, String(value));
    return true;
  } catch (error) {
    return false;
  }
}

export function removePersistedSetting(key) {
  const storage = getLocalStorageSafe();
  const normalized = normalizePersistKey(key);
  if (!storage || !normalized) {
    return false;
  }
  try {
    storage.removeItem(normalized);
    return true;
  } catch (error) {
    return false;
  }
}

export function getPersistedJSON(key, defaultValue = null) {
  const raw = getPersistedSetting(key, null);
  if (raw === null || raw === undefined) {
    return defaultValue;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    removePersistedSetting(key);
    return defaultValue;
  }
}

export function setPersistedJSON(key, obj) {
  if (obj === undefined) {
    return removePersistedSetting(key);
  }
  try {
    return setPersistedSetting(key, JSON.stringify(obj));
  } catch (error) {
    return false;
  }
}

/**
 * Check if a keypoint is present and has valid coordinates
 * @param {Object} keypoint - Keypoint object with x, y properties
 * @returns {boolean} - True if keypoint is present with valid non-zero coordinates
 */
export function isKeypointPresent(keypoint) {
  if (!keypoint) {
    return false;
  }
  // Keypoints are {x, y} objects when present
  // Check if it has valid coordinates
  if (
    typeof keypoint === "object" &&
    keypoint.x !== undefined &&
    keypoint.y !== undefined
  ) {
    // A keypoint is missing if coordinates are [0, 0]
    if (keypoint.x === 0 && keypoint.y === 0) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Get display name for a format ID using the format registry.
 * @param {string} formatId - Format identifier (e.g. "coco17", "coco18")
 * @returns {string} Human-readable format name
 */
export function getFormatDisplayName(formatId) {
  const format = getFormat(formatId);
  return format ? format.displayName : "COCO Keypoints";
}

export function getComfyThemeSafe() {
  if (typeof window === "undefined") {
    return FALLBACK_COMFY_THEME;
  }
  if (typeof window.getComfyTheme === "function") {
    return window.getComfyTheme();
  }
  if (window.ComfyTheme && typeof window.ComfyTheme.getTheme === "function") {
    return window.ComfyTheme.getTheme();
  }
  return FALLBACK_COMFY_THEME;
}

export function getThemeOverlayColor(theme) {
  const resolved = theme || getComfyThemeSafe();
  return resolved.isLight ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.5)";
}

export function parsePosePayload(poseJson) {
  if (!poseJson) {
    return null;
  }
  if (typeof poseJson === "string") {
    try {
      return JSON.parse(poseJson);
    } catch {
      return null;
    }
  }
  if (typeof poseJson === "object") {
    return poseJson;
  }
  return null;
}

export async function loadImageAsync(imageURL) {
  return new Promise((resolve) => {
    const e = new Image();
    e.setAttribute("crossorigin", "anonymous");
    e.addEventListener("load", () => {
      resolve(e);
    });
    e.src = imageURL;
    return e;
  });
}

export async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return await response.blob();
}

// ============================================================================
// Keypoint Geometry & Transform Utilities
// ============================================================================

/**
 * Deep clone array of keypoints (as [x, y] pairs)
 * @param {Array} points - Array of [x, y] or null values
 * @returns {Array} - Deep cloned keypoint array
 */
export function cloneKeypoints(points) {
  return points.map((point) =>
    Array.isArray(point) ? [point[0], point[1]] : null,
  );
}

/**
 * Validate a single keypoint coordinate pair
 * @param {Array} point - [x, y] coordinate pair
 * @returns {boolean} - True if valid, non-zero coordinates
 */
export function isValidKeypoint(point) {
  if (!Array.isArray(point) || point.length < 2) {
    return false;
  }
  const x = Number(point[0]);
  const y = Number(point[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return false;
  }
  // Treat [0, 0] as invalid/missing (upper-body presets)
  return !(x === 0 && y === 0);
}

/**
 * Calculate bounding box center of valid keypoints
 * @param {Array} points - Array of [x, y] coordinate pairs
 * @returns {Array|null} - [centerX, centerY] or null if no valid keypoints
 */
export function getKeypointsBoundsCenter(points) {
  if (!Array.isArray(points)) {
    return null;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    if (!isValidKeypoint(point)) {
      continue;
    }
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
    minY = Math.min(minY, point[1]);
    maxY = Math.max(maxY, point[1]);
  }

  if (
    !isFinite(minX) ||
    !isFinite(maxX) ||
    !isFinite(minY) ||
    !isFinite(maxY)
  ) {
    return null;
  }

  return [minX + (maxX - minX) / 2, minY + (maxY - minY) / 2];
}

/**
 * Scale keypoint coordinates from one canvas size to another
 * @param {Array} points - Array of [x, y] coordinate pairs
 * @param {number} baseWidth - Original canvas width
 * @param {number} baseHeight - Original canvas height
 * @param {number} targetWidth - Target canvas width
 * @param {number} targetHeight - Target canvas height
 * @returns {Array} - Scaled keypoint coordinates
 */
export function scaleKeypointsToCanvas(
  points,
  baseWidth,
  baseHeight,
  targetWidth,
  targetHeight,
) {
  const scaleX = targetWidth / baseWidth;
  const scaleY = targetHeight / baseHeight;
  return points.map((point) => {
    if (!Array.isArray(point) || point.length < 2) {
      return null;
    }
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return [Math.round(x * scaleX), Math.round(y * scaleY)];
  });
}

/**
 * Validate keypoint count matches the selected format's keypoint structure.
 * Accepts keypoint arrays where total % format.keypoints.length === 0.
 * @param {number} count - Total keypoint count
 * @param {string} formatId - Format ID for validation (defaults to auto-detect or coco18)
 * @returns {boolean} - True if valid for the format
 */
export function isValidKeypointCount(count, formatId = null) {
  if (count === 0) return false;

  // If no explicit format, try to auto-detect from count or default to coco18
  let kpPerPerson = 18; // Default
  if (formatId) {
    const format = getFormat(formatId);
    if (format && format.keypoints && Array.isArray(format.keypoints)) {
      kpPerPerson = format.keypoints.length;
    }
  } else {
    // Auto-detect: if count is divisible by 17 or 18, pick the appropriate one
    // Prefer 18 if ambiguous (0 % 17 and 0 % 18 are same for lcm)
    if (count % 17 === 0 && count % 18 === 0) {
      kpPerPerson = 18; // Default to COCO-18
    } else if (count % 17 === 0) {
      kpPerPerson = 17; // Pure COCO-17 (or multiples)
    } else if (count % 18 === 0) {
      kpPerPerson = 18; // Pure COCO-18
    } else {
      return false; // Not divisible by either
    }
  }

  return count % kpPerPerson === 0;
}

// ============================================================================
// Pose Data Normalization
// ============================================================================

/**
 * Extract and remap keypoints from a flattened pose_keypoints_2d array.
 * Handles both COCO-17 (51 values) and COCO-18 (54 values) formats.
 * COCO-17 keypoints are remapped into COCO-18 index positions.
 * Coordinates in [0,1] range are denormalized to pixel values.
 *
 * Delegates to the format registry for format-specific import logic.
 *
 * @param {Array} poseKeypoints2d - Flat array of [x, y, confidence, ...] values
 * @param {number} canvasWidth - Canvas width for denormalization
 * @param {number} canvasHeight - Canvas height for denormalization
 * @returns {Array|null} - 18-element [x,y] keypoint array, or null if invalid
 */
export function extractKeypointsFromPoseKeypoints2d(
  poseKeypoints2d,
  canvasWidth,
  canvasHeight,
) {
  if (!Array.isArray(poseKeypoints2d)) {
    return null;
  }
  if (poseKeypoints2d.length % 3 === 0) {
    return importPoseKeypoints(poseKeypoints2d, canvasWidth, canvasHeight);
  }
  if (poseKeypoints2d.length % 2 === 0) {
    const epsilon = 0.5;
    const withConf = [];
    for (let i = 0; i < poseKeypoints2d.length; i += 2) {
      const x = Number(poseKeypoints2d[i]);
      const y = Number(poseKeypoints2d[i + 1]);
      const conf =
        Number.isFinite(x)
        && Number.isFinite(y)
        && (Math.abs(x) > epsilon || Math.abs(y) > epsilon)
          ? 1
          : 0;
      withConf.push(x, y, conf);
    }
    return importPoseKeypoints(withConf, canvasWidth, canvasHeight);
  }
  return null;
}

function normalizeExtraKeypointsGroup(points, canvasWidth, canvasHeight) {
  const epsilon = 0.5;
  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }
  const normalized = [];
  for (const point of points) {
    if (!Array.isArray(point) || point.length < 2) {
      normalized.push(null);
      continue;
    }
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      normalized.push(null);
      continue;
    }
    let finalX;
    let finalY;
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
      finalX = Math.round(x * canvasWidth);
      finalY = Math.round(y * canvasHeight);
    } else {
      finalX = Math.round(x);
      finalY = Math.round(y);
    }
    if (Math.abs(finalX) <= epsilon && Math.abs(finalY) <= epsilon) {
      normalized.push(null);
      continue;
    }
    normalized.push([finalX, finalY]);
  }
  return normalized.length ? normalized : null;
}

function extractExtraKeypointsFromKeypoints2d(
  extraKeypoints2d,
  canvasWidth,
  canvasHeight,
) {
  const epsilon = 0.5;
  if (!Array.isArray(extraKeypoints2d) || extraKeypoints2d.length < 3) {
    return null;
  }
  let step = 3;
  if (extraKeypoints2d.length % 3 === 0) {
    step = 3;
  } else if (extraKeypoints2d.length % 2 === 0) {
    step = 2;
  } else {
    return null;
  }
  const points = [];
  for (let i = 0; i < extraKeypoints2d.length; i += step) {
    const x = Number(extraKeypoints2d[i]);
    const y = Number(extraKeypoints2d[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      points.push(null);
      continue;
    }
    let finalX;
    let finalY;
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
      finalX = Math.round(x * canvasWidth);
      finalY = Math.round(y * canvasHeight);
    } else {
      finalX = Math.round(x);
      finalY = Math.round(y);
    }
    if (Math.abs(finalX) <= epsilon && Math.abs(finalY) <= epsilon) {
      points.push(null);
      continue;
    }
    points.push([finalX, finalY]);
  }
  return points.length ? points : null;
}

function extractFaceKeypointsFromFaceKeypoints2d(
  faceKeypoints2d,
  canvasWidth,
  canvasHeight,
) {
  return extractExtraKeypointsFromKeypoints2d(
    faceKeypoints2d,
    canvasWidth,
    canvasHeight,
  );
}

function extractHandKeypointsFromHandKeypoints2d(
  handKeypoints2d,
  canvasWidth,
  canvasHeight,
) {
  return extractExtraKeypointsFromKeypoints2d(
    handKeypoints2d,
    canvasWidth,
    canvasHeight,
  );
}

function normalizeExtraGroupsFromPayload(extraGroups, canvasWidth, canvasHeight) {
  if (!Array.isArray(extraGroups) || extraGroups.length === 0) {
    return null;
  }
  if (typeof extraGroups[0] === "number") {
    return [
      extractExtraKeypointsFromKeypoints2d(
        extraGroups,
        canvasWidth,
        canvasHeight,
      ),
    ];
  }
  return extraGroups.map((group) =>
    normalizeExtraKeypointsGroup(group, canvasWidth, canvasHeight),
  );
}

function hasExtraKeypoints(groups) {
  return (
    Array.isArray(groups) &&
    groups.some((group) => Array.isArray(group) && group.length > 0)
  );
}

function normalizeLegacyKeypoint(point) {
  if (Array.isArray(point) && point.length >= 2) {
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return [x, y];
  }
  if (point && typeof point === "object") {
    const x = Number(point.x);
    const y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return [x, y];
  }
  return null;
}

function normalizeLegacyKeypointsGroup(group) {
  if (!Array.isArray(group) || group.length === 0) {
    return null;
  }
  if (group.length !== 17 && group.length !== 18) {
    return null;
  }
  const normalized = group.map((point) => normalizeLegacyKeypoint(point));
  if (group.length === 17) {
    const format = getFormat("coco17");
    if (format && typeof format.normalizePose === "function") {
      const remapped = format.normalizePose(normalized);
      return Array.isArray(remapped) ? remapped : null;
    }
    return null;
  }
  return normalized;
}

function normalizeLegacyKeypointsGroups(keypoints) {
  if (!Array.isArray(keypoints) || keypoints.length === 0) {
    return [];
  }
  const first = keypoints[0];
  const isNested =
    Array.isArray(first) &&
    (Array.isArray(first[0]) || first[0] === null || typeof first[0] === "object");
  if (isNested) {
    return keypoints;
  }
  const flat = keypoints;
  let groupSize = null;
  if (flat.length > 18 && flat.length % 18 === 0) {
    groupSize = 18;
  } else if (flat.length > 17 && flat.length % 17 === 0) {
    groupSize = 17;
  }
  if (groupSize) {
    const groups = [];
    for (let i = 0; i < flat.length; i += groupSize) {
      groups.push(flat.slice(i, i + groupSize));
    }
    return groups;
  }
  return [flat];
}

function normalizeLegacyExtraGroups(extraGroups, canvasWidth, canvasHeight) {
  if (!Array.isArray(extraGroups) || extraGroups.length === 0) {
    return null;
  }
  if (typeof extraGroups[0] === "number") {
    return [
      extractExtraKeypointsFromKeypoints2d(
        extraGroups,
        canvasWidth,
        canvasHeight,
      ),
    ];
  }
  const first = extraGroups[0];
  const isNested =
    Array.isArray(first) &&
    (Array.isArray(first[0]) || first[0] === null || typeof first[0] === "object");
  const groups = isNested ? extraGroups : [extraGroups];
  return groups.map((group) =>
    normalizeExtraKeypointsGroup(group, canvasWidth, canvasHeight),
  );
}

/**
 * Normalize pose JSON (STANDARD and LEGACY) into a canonical representation.
 *
 * STANDARD schema:
 *  { canvas_width, canvas_height, people: [{ pose_keypoints_2d, face_keypoints_2d?, hand_*_keypoints_2d? }] }
 *
 * LEGACY schema:
 *  { width, height, format?, keypoints: [[x,y], ...] or [[...], [...]], face_keypoints_2d?, hand_*_keypoints_2d? }
 *
 * @param {string|object} raw - JSON string or parsed object
 * @returns {object|null} - { width, height, poses: [{ keypoints, faceKeypoints?, handLeftKeypoints?, handRightKeypoints? }] }
 */
export function normalizePoseJson(raw) {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") {
    return null;
  }

  if (Array.isArray(data.people)) {
    const width = Number(data.canvas_width) || DEFAULT_CANVAS_WIDTH;
    const height = Number(data.canvas_height) || DEFAULT_CANVAS_HEIGHT;
    const poses = [];
    for (const person of data.people) {
      if (!person || !Array.isArray(person.pose_keypoints_2d)) {
        continue;
      }
      const keypoints = extractKeypointsFromPoseKeypoints2d(
        person.pose_keypoints_2d,
        width,
        height,
      );
      if (!Array.isArray(keypoints) || keypoints.length === 0) {
        continue;
      }
      const pose = { keypoints };
      const face = extractFaceKeypointsFromFaceKeypoints2d(
        person.face_keypoints_2d,
        width,
        height,
      );
      const leftHand = extractHandKeypointsFromHandKeypoints2d(
        person.hand_left_keypoints_2d,
        width,
        height,
      );
      const rightHand = extractHandKeypointsFromHandKeypoints2d(
        person.hand_right_keypoints_2d,
        width,
        height,
      );
      if (Array.isArray(face)) {
        pose.faceKeypoints = face;
      }
      if (Array.isArray(leftHand)) {
        pose.handLeftKeypoints = leftHand;
      }
      if (Array.isArray(rightHand)) {
        pose.handRightKeypoints = rightHand;
      }
      poses.push(pose);
    }
    if (poses.length === 0) {
      return null;
    }
    return { width, height, poses };
  }

  if (Array.isArray(data.keypoints)) {
    const width = Number(data.width) || DEFAULT_CANVAS_WIDTH;
    const height = Number(data.height) || DEFAULT_CANVAS_HEIGHT;
    const poseGroups = normalizeLegacyKeypointsGroups(data.keypoints);
    const faceGroups = normalizeLegacyExtraGroups(
      data.face_keypoints_2d,
      width,
      height,
    );
    const handLeftGroups = normalizeLegacyExtraGroups(
      data.hand_left_keypoints_2d,
      width,
      height,
    );
    const handRightGroups = normalizeLegacyExtraGroups(
      data.hand_right_keypoints_2d,
      width,
      height,
    );
    const poses = [];
    for (let i = 0; i < poseGroups.length; i += 1) {
      const group = poseGroups[i];
      const keypoints = normalizeLegacyKeypointsGroup(group);
      if (!Array.isArray(keypoints) || keypoints.length === 0) {
        continue;
      }
      const pose = { keypoints };
      const faceGroup = Array.isArray(faceGroups) ? faceGroups[i] : null;
      const leftHandGroup = Array.isArray(handLeftGroups) ? handLeftGroups[i] : null;
      const rightHandGroup = Array.isArray(handRightGroups) ? handRightGroups[i] : null;
      if (Array.isArray(faceGroup)) {
        pose.faceKeypoints = faceGroup;
      }
      if (Array.isArray(leftHandGroup)) {
        pose.handLeftKeypoints = leftHandGroup;
      }
      if (Array.isArray(rightHandGroup)) {
        pose.handRightKeypoints = rightHandGroup;
      }
      poses.push(pose);
    }
    if (poses.length === 0) {
      return null;
    }
    return { width, height, poses };
  }

  return null;
}

/**
 * Normalize preset data from various JSON formats into a standard structure.
 *
 * Supported formats:
 * 1. POSE_KEYPOINT format: { people: [{pose_keypoints_2d: [...]}], canvas_width, canvas_height }
 * 2. Editor export format: { width, height, keypoints: [...] }
 * 3. Category dictionary: { "pose-name": { canvas_width, canvas_height, people: [...] }, ... }
 *
 * @param {object} payload - The JSON payload
 * @param {string} filename - The filename (used for generating IDs)
 * @returns {object|null} - Normalized data with { presets, baseWidth, baseHeight, format }
 */
export function normalizePresetData(payload, filename = "") {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  // POSE_KEYPOINT format: { people: [{pose_keypoints_2d: [...]}], canvas_width, canvas_height }
  if (Array.isArray(payload.people) && payload.people.length > 0) {
    const baseWidth = Number(payload.canvas_width) || 512;
    const baseHeight = Number(payload.canvas_height) || 512;
    const baseName = filename.replace(/\.json$/i, "").replace(/^.*[/\\]/, "");

    // Extract keypoints from all people
    const allKeypoints = [];
    const faceKeypoints = [];
    const handLeftKeypoints = [];
    const handRightKeypoints = [];
    for (const person of payload.people) {
      if (person && Array.isArray(person.pose_keypoints_2d)) {
        const kps = extractKeypointsFromPoseKeypoints2d(
          person.pose_keypoints_2d,
          baseWidth,
          baseHeight,
        );
        if (kps) {
          allKeypoints.push(...kps);
          const face = extractFaceKeypointsFromFaceKeypoints2d(
            person.face_keypoints_2d,
            baseWidth,
            baseHeight,
          );
          const leftHand = extractHandKeypointsFromHandKeypoints2d(
            person.hand_left_keypoints_2d,
            baseWidth,
            baseHeight,
          );
          const rightHand = extractHandKeypointsFromHandKeypoints2d(
            person.hand_right_keypoints_2d,
            baseWidth,
            baseHeight,
          );
          faceKeypoints.push(face);
          handLeftKeypoints.push(leftHand);
          handRightKeypoints.push(rightHand);
        }
      }
    }

    if (allKeypoints.length > 0 && isValidKeypointCount(allKeypoints.length)) {
      const preset = {
        id: baseName,
        label: baseName.replace(/[_-]/g, " "),
        keypoints: allKeypoints,
        canvas_width: baseWidth,
        canvas_height: baseHeight,
      };
      if (hasExtraKeypoints(faceKeypoints)) {
        preset.faceKeypoints = faceKeypoints;
      }
      if (hasExtraKeypoints(handLeftKeypoints)) {
        preset.handLeftKeypoints = handLeftKeypoints;
      }
      if (hasExtraKeypoints(handRightKeypoints)) {
        preset.handRightKeypoints = handRightKeypoints;
      }
      const presets = [preset];
      return { presets, baseWidth, baseHeight, format: "pose_keypoint" };
    }
  }

  // Editor export format: { width, height, keypoints }
  if (Array.isArray(payload.keypoints)) {
    const baseWidth = Number(payload.width) || 512;
    const baseHeight = Number(payload.height) || 512;
    const baseName = filename.replace(/\.json$/i, "").replace(/^.*[/\\]/, "");
    const keypoints = payload.keypoints;
    let flatKeypoints = [];

    if (
      keypoints.length > 0 &&
      Array.isArray(keypoints[0]) &&
      (Array.isArray(keypoints[0][0]) || keypoints[0][0] === null)
    ) {
      for (const group of keypoints) {
        if (Array.isArray(group)) {
          flatKeypoints.push(...group);
        }
      }
    } else {
      flatKeypoints = keypoints;
    }

    if (
      flatKeypoints.length > 0 &&
      isValidKeypointCount(flatKeypoints.length)
    ) {
      const preset = {
        id: baseName || "pose",
        label: (baseName || "pose").replace(/[_-]/g, " "),
        keypoints: flatKeypoints,
        canvas_width: baseWidth,
        canvas_height: baseHeight,
      };
      const faceGroups = normalizeExtraGroupsFromPayload(
        payload.face_keypoints_2d,
        baseWidth,
        baseHeight,
      );
      const handLeftGroups = normalizeExtraGroupsFromPayload(
        payload.hand_left_keypoints_2d,
        baseWidth,
        baseHeight,
      );
      const handRightGroups = normalizeExtraGroupsFromPayload(
        payload.hand_right_keypoints_2d,
        baseWidth,
        baseHeight,
      );
      if (hasExtraKeypoints(faceGroups)) {
        preset.faceKeypoints = faceGroups;
      }
      if (hasExtraKeypoints(handLeftGroups)) {
        preset.handLeftKeypoints = handLeftGroups;
      }
      if (hasExtraKeypoints(handRightGroups)) {
        preset.handRightKeypoints = handRightGroups;
      }
      const presets = [preset];
      return { presets, baseWidth, baseHeight, format: "editor" };
    }
  }

  // Category format: { "pose-name": { canvas_width, canvas_height, people: [...] }, ... }
  const keys = Object.keys(payload);
  if (keys.length > 0) {
    const presets = [];
    let baseWidth = 512;
    let baseHeight = 512;
    let firstPose = true;

    for (const key of keys) {
      const pose = payload[key];
      if (!pose || typeof pose !== "object") continue;

      const poseWidth = Number(pose.canvas_width) || 512;
      const poseHeight = Number(pose.canvas_height) || 512;

      const people = Array.isArray(pose.people)
        ? pose.people
        : Array.isArray(pose.pose_keypoints_2d)
          ? [
              {
                pose_keypoints_2d: pose.pose_keypoints_2d,
                face_keypoints_2d: pose.face_keypoints_2d,
                hand_left_keypoints_2d: pose.hand_left_keypoints_2d,
                hand_right_keypoints_2d: pose.hand_right_keypoints_2d,
              },
            ]
          : [];

      if (people.length === 0) continue;

      // Use first pose's dimensions as base
      if (firstPose) {
        baseWidth = poseWidth;
        baseHeight = poseHeight;
        firstPose = false;
      }

      const allKeypoints = [];
      const faceKeypoints = [];
      const handLeftKeypoints = [];
      const handRightKeypoints = [];
      for (const person of people) {
        if (!person || !Array.isArray(person.pose_keypoints_2d)) continue;
        const kps = extractKeypointsFromPoseKeypoints2d(
          person.pose_keypoints_2d,
          poseWidth,
          poseHeight,
        );
        if (kps) {
          allKeypoints.push(...kps);
          const face = extractFaceKeypointsFromFaceKeypoints2d(
            person.face_keypoints_2d,
            poseWidth,
            poseHeight,
          );
          const leftHand = extractHandKeypointsFromHandKeypoints2d(
            person.hand_left_keypoints_2d,
            poseWidth,
            poseHeight,
          );
          const rightHand = extractHandKeypointsFromHandKeypoints2d(
            person.hand_right_keypoints_2d,
            poseWidth,
            poseHeight,
          );
          faceKeypoints.push(face);
          handLeftKeypoints.push(leftHand);
          handRightKeypoints.push(rightHand);
        }
      }

      if (
        allKeypoints.length === 0 ||
        !isValidKeypointCount(allKeypoints.length)
      )
        continue;

      const preset = {
        id: key,
        label: key.replace(/[_-]/g, " "),
        keypoints: allKeypoints,
        canvas_width: poseWidth || baseWidth,
        canvas_height: poseHeight || baseHeight,
      };
      if (hasExtraKeypoints(faceKeypoints)) {
        preset.faceKeypoints = faceKeypoints;
      }
      if (hasExtraKeypoints(handLeftKeypoints)) {
        preset.handLeftKeypoints = handLeftKeypoints;
      }
      if (hasExtraKeypoints(handRightKeypoints)) {
        preset.handRightKeypoints = handRightKeypoints;
      }
      presets.push(preset);
    }

    if (presets.length > 0) {
      return { presets, baseWidth, baseHeight, format: "dictionary" };
    }
  }

  return null;
}

/**
 * Read a File object as text using FileReader.
 * @param {File} file - File to read
 * @returns {Promise<string>} - File contents as text
 */
export function readFileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.onerror = () => {
      reject(reader.error);
    };
    reader.readAsText(file);
  });
}

// ============================================================================
// Color Utilities
// ============================================================================

/**
 * Determine if a color is light or dark based on luminance
 * Supports hex (#fff, #ffffff, #ffffffff) and rgb/rgba formats
 * @param {string} color - Color string (hex or rgb/rgba)
 * @returns {boolean} - True if color is light (luminance > 0.6)
 */
export function isColorLight(color) {
  if (!color || typeof color !== "string") {
    return false;
  }
  const value = color.trim();
  let r = null;
  let g = null;
  let b = null;
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6 || hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
  } else if (value.startsWith("rgb")) {
    const match = value.match(/rgba?\(([^)]+)\)/i);
    if (match) {
      const parts = match[1].split(",").map((part) => part.trim());
      if (parts.length >= 3) {
        r = Number(parts[0]);
        g = Number(parts[1]);
        b = Number(parts[2]);
      }
    }
  }
  if (![r, g, b].every((v) => Number.isFinite(v))) {
    return false;
  }
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6;
}

/**
 * Adjust color brightness by adding/subtracting a value from RGB components
 * Clamps results to [0, 255] range. Preserves alpha channel if present.
 * @param {string} color - Color string (hex or rgb/rgba)
 * @param {number} amount - Amount to adjust (-255 to 255)
 * @returns {string} - Adjusted color in rgb/rgba format, or original color if invalid
 */
export function adjustColor(color, amount) {
  if (!color || typeof color !== "string") {
    return color;
  }
  const value = color.trim();
  let r = null;
  let g = null;
  let b = null;
  let alpha = null;
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6 || hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      if (hex.length === 8) {
        alpha = parseInt(hex.slice(6, 8), 16) / 255;
      }
    }
  } else if (value.startsWith("rgb")) {
    const match = value.match(/rgba?\(([^)]+)\)/i);
    if (match) {
      const parts = match[1].split(",").map((part) => part.trim());
      if (parts.length >= 3) {
        r = Number(parts[0]);
        g = Number(parts[1]);
        b = Number(parts[2]);
        if (parts.length >= 4) {
          alpha = Number(parts[3]);
        }
      }
    }
  }
  if (![r, g, b].every((v) => Number.isFinite(v))) {
    return color;
  }
  const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
  const rr = clamp(r + amount);
  const gg = clamp(g + amount);
  const bb = clamp(b + amount);
  if (Number.isFinite(alpha)) {
    return `rgba(${rr}, ${gg}, ${bb}, ${alpha})`;
  }
  return `rgb(${rr}, ${gg}, ${bb})`;
}

// Convert a theme color string into an rgba() string with a forced alpha.
export function toRgba(color, alpha) {
  if (!color || typeof color !== "string") {
    return null;
  }
  const input = color.trim();
  const clampAlpha = (value) => Math.max(0, Math.min(1, value));
  const safeAlpha = Number.isFinite(alpha) ? clampAlpha(alpha) : 1;
  if (input.startsWith("#")) {
    const hex = input.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
    }
    return null;
  }
  if (input.startsWith("rgb")) {
    const match = input.match(/rgba?\(([^)]+)\)/i);
    if (!match) {
      return null;
    }
    const parts = match[1].split(",").map((part) => part.trim());
    if (parts.length < 3) {
      return null;
    }
    const r = Number(parts[0]);
    const g = Number(parts[1]);
    const b = Number(parts[2]);
    if (![r, g, b].every((v) => Number.isFinite(v))) {
      return null;
    }
    return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
  }
  return null;
}

// Smoked-glass style tuning constants (per-theme).
// Light theme: make the canvas more opaque and darker (mid neutral) to preserve contrast.
const GLASS_ALPHA = { light: 0.94, dark: 0.65 };
const GLASS_BORDER_ALPHA = { light: 0.42, dark: 0.4 };
const GLASS_SHADOW_ALPHA = { light: 0.75, dark: 0.75 };
const GLASS_SHADOW = {
  light: { x: 0, y: 1, blur: 1 },
  dark: { x: 0, y: 1, blur: 1 },
};
const GLASS_GRID_ALPHA = { light: 0.16, dark: 0.14 };

// Neutral canvas base to avoid "white wash" in light theme (esp. small previews).
const CANVAS_NEUTRAL_BASE = { light: "#9DA3AD" };

// Resolve the shared canvas surface/border/shadow/grid colors from the active theme.
export function getSmokedGlassCanvasStyle(theme, fallback = {}) {
  const isLight =
    theme?.isLight ??
    fallback.isLight ??
    (typeof document !== "undefined"
      ? document.documentElement?.classList?.contains("comfy-theme-light")
      : false) ??
    false;
  const base =
    theme?.inputBg ||
    theme?.menuBgSecondary ||
    theme?.menuBg ||
    theme?.background ||
    fallback.inputBg ||
    fallback.menuBgSecondary ||
    fallback.menuBg ||
    fallback.background;

  const borderBase =
    theme?.border || theme?.text || fallback.border || fallback.text;
  const textBase =
    theme?.text || theme?.inputText || fallback.text || fallback.inputText;
  const surfaceBase = isLight ? CANVAS_NEUTRAL_BASE.light : base;
  const surface =
    toRgba(surfaceBase, isLight ? GLASS_ALPHA.light : GLASS_ALPHA.dark) ||
    surfaceBase;
  const border = "rgba(255,255,255,0.3)";
  const shadowColor =
    toRgba(
      "#000000",
      isLight ? GLASS_SHADOW_ALPHA.light : GLASS_SHADOW_ALPHA.dark,
    ) || "#000000";
  const shadowSpec = isLight ? GLASS_SHADOW.light : GLASS_SHADOW.dark;
  const shadow = `${shadowSpec.x}px ${shadowSpec.y}px ${shadowSpec.blur}px ${shadowColor}`;
  const gridBase = isLight ? "#000000" : (borderBase || textBase);
  const gridAlpha = isLight ? GLASS_GRID_ALPHA.light : GLASS_GRID_ALPHA.dark;
  const gridColor =
    toRgba(gridBase, gridAlpha) || toRgba(textBase, gridAlpha) || gridBase;

  return {
    isLight,
    surface,
    border,
    shadow,
    shadowColor,
    shadowSpec,
    gridColor,
  };
}

// ============================================================================
// Global Alert Styles
// ============================================================================

let globalAlertStylesInjected = false;

/**
 * Injects universal alert CSS styles into the document.
 * Creates a unified alert component system for warnings, info, etc.
 * Should be called once when the module loads.
 */
export function injectGlobalAlertStyles() {
  if (globalAlertStylesInjected) {
    return;
  }
  globalAlertStylesInjected = true;
}

// ============================================================================
// Donation Footer (shared by Pose Editor and Pose Merger sidebars)
// ============================================================================

const DONATE_KOFI_URL = "https://ko-fi.com/D1D716OLPM";
const DONATE_PAYPAL_URL = "https://www.paypal.com/ncp/payment/GEEM324PDD9NC";
const DONATE_USDC_ADDRESS = "0xe36a336fC6cc9Daae657b4A380dA492AB9601e73";

/**
 * Returns the donation footer HTML (support text + 3 buttons).
 * Drop this inside any sidebar card; call applyDonationFooterStyles() after.
 */
export function buildDonationFooterHtml() {
  return `
    <div class="openpose-donation-footer">
      <div class="openpose-donation-footer-text">${t("pose_editor.support.text")}</div>
      <div class="openpose-donation-footer-btns">
        <button class="openpose-btn openpose-support-btn" type="button" data-url="${DONATE_KOFI_URL}" title="${t("pose_editor.support.tooltip.kofi")}">Ko-fi</button>
        <button class="openpose-btn openpose-support-btn" type="button" data-url="${DONATE_PAYPAL_URL}" title="${t("pose_editor.support.tooltip.paypal")}">PayPal</button>
        <button class="openpose-btn openpose-support-btn" type="button" data-action="usdc" title="${t("pose_editor.support.tooltip.usdc")}">USDC</button>
      </div>
    </div>`;
}

/**
 * Apply styles + wire click/hover handlers for every .openpose-donation-footer
 * found inside `container`.  Safe to call repeatedly (guards via dataset flags).
 */
export function applyDonationFooterStyles(container) {
  if (!container) return;

  container.querySelectorAll(".openpose-donation-footer").forEach((footer) => {
    footer.classList.add("openpose-donation-footer-styled");

    footer.querySelectorAll(".openpose-support-btn").forEach((btn) => {
      if (!btn) return;
      const btnUrl = btn.dataset.url || "";
      const btnAction = btn.dataset.action || "";
      const isKofi = btnUrl.includes("ko-fi");
      const isPaypal = btnUrl.includes("paypal");
      const isUsdc = btnAction === "usdc";
      const accentColor = isKofi ? "#FF5E5B" : isPaypal ? "#009CDE" : isUsdc ? "#D4A017" : null;
      const wipeColor = isKofi ? "rgba(255, 94, 91, 0.18)"
        : isPaypal ? "rgba(0, 156, 222, 0.18)"
        : isUsdc ? "rgba(212, 160, 23, 0.18)"
        : null;
      btn.classList.add("openpose-donate-btn", "openpose-donate-btn-base");
      if (isKofi) btn.classList.add("openpose-donate-btn-kofi");
      if (isPaypal) btn.classList.add("openpose-donate-btn-paypal");
      if (isUsdc) btn.classList.add("openpose-donate-btn-usdc");
      if (accentColor) {
        btn.style.setProperty("--donate-accent", wipeColor);
      }

      if (!btn.dataset.clickReady) {
        btn.dataset.clickReady = "1";
        if (isUsdc) {
          btn.addEventListener("click", async () => {
            const confirmed = await showConfirm(
              t("about.usdc.confirm.title"),
              t("about.usdc.confirm.message"),
            );
            if (!confirmed) return;
            if (!DONATE_USDC_ADDRESS) {
              showToast("warn", t("about.usdc.toast_title"), t("about.usdc.not_found"));
              return;
            }
            try {
              if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
                await navigator.clipboard.writeText(DONATE_USDC_ADDRESS);
              } else {
                const textarea = document.createElement("textarea");
                textarea.value = DONATE_USDC_ADDRESS;
                textarea.setAttribute("readonly", "true");
                textarea.style.position = "absolute";
                textarea.style.left = "-9999px";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
              }
              showToast("info", t("about.usdc.copied.title"), t("about.usdc.copied.body"));
            } catch (err) {
              console.error("[OpenPose Studio] Failed to copy USDC address:", err);
              showToast("error", t("about.usdc.toast_title"), t("about.usdc.copy_failed"));
            }
          });
        } else {
          const url = btn.dataset.url;
          if (url) {
            btn.addEventListener("click", () => {
              window.open(url, "_blank", "noopener,noreferrer");
            });
          }
        }
      }
    });
  });
}
