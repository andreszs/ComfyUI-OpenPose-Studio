/**
 * Format registry for pose format modules.
 * Provides format-agnostic access to keypoint metadata, skeleton topology,
 * colors, and import/export logic.
 *
 * @see format-interface.js for the FORMAT contract.
 */

import { FORMAT as COCO18, allowEditCoco18 } from "./coco18.js";
import { FORMAT as COCO17, allowEditCoco17 } from "./coco17.js";

// Re-export COCO_KEYPOINTS for convenience (canonical source is coco18.js)
export { COCO_KEYPOINTS } from "./coco18.js";

// ── Registry ───────────────────────────────────────────────────────

const formats = new Map();
formats.set(COCO18.id, COCO18);
formats.set(COCO17.id, COCO17);

/** Default format when no detection is possible. */
export const DEFAULT_FORMAT_ID = "coco18";

/**
 * Get a format object by its ID.
 * @param {string} id - Format identifier (e.g. "coco17", "coco18")
 * @returns {PoseFormat|null} The format object, or null if not found
 */
export function getFormat(id) {
	return formats.get(id) || null;
}

/**
 * List all registered format objects.
 * @returns {PoseFormat[]}
 */
export function listFormats() {
	return Array.from(formats.values());
}

// ── Edit permission ─────────────────────────────────────────────────

/**
 * Check whether editing is allowed for a given format.
 * @param {string} formatId - "coco17" or "coco18"
 * @returns {boolean} True if editing is allowed
 */
export function isFormatEditAllowed(formatId) {
	if (formatId === "coco17") return allowEditCoco17;
	if (formatId === "coco18") return allowEditCoco18;
	return true;
}

// ── Detection ──────────────────────────────────────────────────────

/**
 * Detect the format of an 18-slot internal keypoint array.
 * Checks index 1 (Neck): null -> COCO-17, present -> COCO-18.
 *
 * @param {Array} keypoints - 18-slot keypoint array ({x,y} objects or [x,y] pairs or nulls)
 * @returns {string} Format ID ("coco17" or "coco18")
 */
export function detectFormat(keypoints) {
	if (!Array.isArray(keypoints) || keypoints.length < 2) {
		return DEFAULT_FORMAT_ID;
	}
	return keypoints[1] == null ? "coco17" : "coco18";
}

/**
 * Detect format from a flat pose_keypoints_2d array (with confidence values).
 * 51 values (17*3) -> COCO-17, 54 values (18*3) -> COCO-18.
 *
 * @param {Array} poseKeypoints2d - Flat array of [x, y, confidence, ...] values
 * @returns {string} Format ID ("coco17" or "coco18"), defaults to DEFAULT_FORMAT_ID
 */
export function detectFormatFromFlat(poseKeypoints2d) {
	if (!Array.isArray(poseKeypoints2d)) {
		return DEFAULT_FORMAT_ID;
	}
	const count = Math.floor(poseKeypoints2d.length / 3);
	if (count === 17) return "coco17";
	if (count === 18) return "coco18";
	return DEFAULT_FORMAT_ID;
}

/**
 * Detect format from an explicit metadata field, or fall back to keypoint
 * detection. Recognizes format strings like "coco17", "coco17_ultralytics",
 * "coco18", "openpose", etc.
 *
 * @param {string|undefined} formatField - Optional format metadata string
 * @param {Array|undefined} keypoints - Optional internal keypoints for fallback
 * @returns {string} Format ID
 */
export function detectFormatFromMetadata(formatField, keypoints) {
	if (typeof formatField === "string") {
		const lower = formatField.toLowerCase();
		if (lower.includes("coco17") || lower.includes("coco-17") || lower.includes("ultralytics")) {
			return "coco17";
		}
		if (lower.includes("coco18") || lower.includes("coco-18") || lower.includes("openpose")) {
			return "coco18";
		}
	}
	if (keypoints) {
		return detectFormat(keypoints);
	}
	return DEFAULT_FORMAT_ID;
}

/**
 * Convenience: detect format and return the format object.
 *
 * @param {Array} keypoints - 18-slot internal keypoint array
 * @returns {PoseFormat} The detected format object (never null, falls back to default)
 */
export function getFormatForPose(keypoints) {
	const id = detectFormat(keypoints);
	return formats.get(id) || formats.get(DEFAULT_FORMAT_ID);
}

/**
 * Import a flat pose_keypoints_2d array into the internal 18-slot representation.
 * Auto-detects COCO-17 vs COCO-18 by keypoint count.
 *
 * @param {Array} poseKeypoints2d - Flat array of [x, y, confidence, ...] values
 * @param {number} canvasWidth - Canvas width for denormalization
 * @param {number} canvasHeight - Canvas height for denormalization
 * @returns {Array|null} 18-slot keypoint array, or null if invalid
 */
export function importPoseKeypoints(poseKeypoints2d, canvasWidth, canvasHeight) {
	if (!Array.isArray(poseKeypoints2d) || poseKeypoints2d.length < 51) {
		return null;
	}
	const formatId = detectFormatFromFlat(poseKeypoints2d);
	const format = formats.get(formatId);
	if (!format) {
		return null;
	}
	return format.importPose(poseKeypoints2d, canvasWidth, canvasHeight);
}
