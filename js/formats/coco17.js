/**
 * COCO-17 (Ultralytics / TensorFlow.js) format module.
 * 17 keypoints without Neck. Internally remapped to COCO-18 index space
 * with index 1 (Neck) = null.
 *
 * @see format-interface.js for the FORMAT contract.
 */

import { COCO_KEYPOINTS } from "./coco18.js";

export const allowEditCoco17 = false;

// ── COCO-17 native keypoint order ──────────────────────────────────
// [0]nose, [1]left_eye, [2]right_eye, [3]left_ear, [4]right_ear,
// [5]left_shoulder, [6]right_shoulder, [7]left_elbow, [8]right_elbow,
// [9]left_wrist, [10]right_wrist, [11]left_hip, [12]right_hip,
// [13]left_knee, [14]right_knee, [15]left_ankle, [16]right_ankle

// Mapping from COCO-17 native index to COCO-18 index space
const coco17ToCoco18 = {
	0:  0,   // nose       -> Nose
	1:  15,  // left_eye   -> Left Eye
	2:  14,  // right_eye  -> Right Eye
	3:  17,  // left_ear   -> Left Ear
	4:  16,  // right_ear  -> Right Ear
	5:  5,   // left_shoulder  -> Left Shoulder
	6:  2,   // right_shoulder -> Right Shoulder
	7:  6,   // left_elbow     -> Left Elbow
	8:  3,   // right_elbow    -> Right Elbow
	9:  7,   // left_wrist     -> Left Wrist
	10: 4,   // right_wrist    -> Right Wrist
	11: 11,  // left_hip   -> Left Hip
	12: 8,   // right_hip  -> Right Hip
	13: 12,  // left_knee  -> Left Knee
	14: 9,   // right_knee -> Right Knee
	15: 13,  // left_ankle -> Left Ankle
	16: 10   // right_ankle -> Right Ankle
};

// ── Skeleton topology (using COCO-18 indices, after remapping) ─────
const skeletonEdges = [
	// Head connections (no Neck)
	[0, 15],  // Nose - Left Eye
	[0, 14],  // Nose - Right Eye
	[15, 17], // Left Eye - Left Ear
	[14, 16], // Right Eye - Right Ear
	// Upper body - connect shoulders directly (no Neck)
	[5, 2],   // Left Shoulder - Right Shoulder
	// Left arm
	[5, 6],   // Left Shoulder - Left Elbow
	[6, 7],   // Left Elbow - Left Wrist
	// Right arm
	[2, 3],   // Right Shoulder - Right Elbow
	[3, 4],   // Right Elbow - Right Wrist
	// Torso (connect shoulders to hips directly)
	[5, 11],  // Left Shoulder - Left Hip
	[2, 8],   // Right Shoulder - Right Hip
	[11, 8],  // Left Hip - Right Hip
	// Left leg
	[11, 12], // Left Hip - Left Knee
	[12, 13], // Left Knee - Left Ankle
	// Right leg
	[8, 9],   // Right Hip - Right Knee
	[9, 10]   // Right Knee - Right Ankle
];

const skeletonColors = [
	// Head (4 edges) - GREEN
	[0, 255, 0], // Nose - Left Eye
	[0, 255, 0], // Nose - Right Eye
	[0, 255, 0], // Left Eye - Left Ear
	[0, 255, 0], // Right Eye - Right Ear
	// Upper body + arms + torso (8 edges) - ORANGE
	[255, 128, 0], // Left Shoulder - Right Shoulder
	[255, 128, 0], // Left Shoulder - Left Elbow
	[255, 128, 0], // Left Elbow - Left Wrist
	[255, 128, 0], // Right Shoulder - Right Elbow
	[255, 128, 0], // Right Elbow - Right Wrist
	[255, 128, 0], // Left Shoulder - Left Hip
	[255, 128, 0], // Right Shoulder - Right Hip
	[255, 128, 0], // Left Hip - Right Hip
	// Legs (4 edges) - BLUE
	[51, 153, 255], // Left Hip - Left Knee
	[51, 153, 255], // Left Knee - Left Ankle
	[51, 153, 255], // Right Hip - Right Knee
	[51, 153, 255]  // Right Knee - Right Ankle
];

// ── Derived data ───────────────────────────────────────────────────
// Keypoint colors follow Ultralytics COCO-17 palette mapping (18-slot index space)
const keypointColors = [
	// Ultralytics COCO17 keypoint colors mapped into our 18-slot COCO-18 index space.
	// Source: ultralytics/utils/plotting.py (Annotator.kpt_color -> Colors.pose_palette)
	[0, 255, 0],    // 0  Nose
	[0, 0, 0],      // 1  Neck (not present in COCO17)
	[255, 128, 0],  // 2  Right Shoulder
	[255, 128, 0],  // 3  Right Elbow
	[255, 128, 0],  // 4  Right Wrist
	[255, 128, 0],  // 5  Left Shoulder
	[255, 128, 0],  // 6  Left Elbow
	[255, 128, 0],  // 7  Left Wrist
	[51, 153, 255], // 8  Right Hip
	[51, 153, 255], // 9  Right Knee
	[51, 153, 255], // 10 Right Ankle
	[51, 153, 255], // 11 Left Hip
	[51, 153, 255], // 12 Left Knee
	[51, 153, 255], // 13 Left Ankle
	[0, 255, 0],    // 14 Right Eye
	[0, 255, 0],    // 15 Left Eye
	[0, 255, 0],    // 16 Right Ear
	[0, 255, 0]     // 17 Left Ear
];

const keypoints = COCO_KEYPOINTS.map((kp, i) => ({
	...kp,
	rgb: keypointColors[i]
}));

// All indices except 1 (Neck) are present
const presentIndices = new Set(
	Array.from({ length: 18 }, (_, i) => i).filter(i => i !== 1)
);

// ── Helpers ────────────────────────────────────────────────────────

function parseRawKeypoints(poseKeypoints2d, canvasWidth, canvasHeight) {
	const rawKeypoints = [];
	for (let i = 0; i < poseKeypoints2d.length; i += 3) {
		const x = Number(poseKeypoints2d[i]);
		const y = Number(poseKeypoints2d[i + 1]);
		const conf = Number(poseKeypoints2d[i + 2]) || 0;

		if (!Number.isFinite(x) || !Number.isFinite(y) || conf <= 0) {
			rawKeypoints.push(null);
			continue;
		}

		let finalX, finalY;
		if (x <= 1 && y <= 1 && x >= 0 && y >= 0) {
			finalX = Math.round(x * canvasWidth);
			finalY = Math.round(y * canvasHeight);
		} else {
			finalX = Math.round(x);
			finalY = Math.round(y);
		}

		rawKeypoints.push([finalX, finalY]);
	}
	return rawKeypoints;
}

// ── FORMAT object ──────────────────────────────────────────────────

export const FORMAT = {
	id: "coco17",
	displayName: "COCO-17 (Ultralytics)",

	keypoints,
	skeletonEdges,
	skeletonColors,
	keypointColors,
	presentIndices,

	/**
	 * Validate that an 18-slot keypoint array is a valid COCO-17 pose.
	 * Neck (index 1) must be absent.
	 */
	isValidPose(keypoints) {
		if (!Array.isArray(keypoints) || keypoints.length !== 18) {
			return false;
		}
		// Neck must be null
		if (keypoints[1] != null) {
			return false;
		}
		// At least one keypoint must be present
		return keypoints.some(kp => kp != null);
	},

	/**
	 * Remap from COCO-17 native order (17 keypoints) to internal 18-slot
	 * COCO-18 index space. If input is already 18 slots, return as-is.
	 */
	normalizePose(keypoints) {
		if (!Array.isArray(keypoints)) {
			return null;
		}
		// Already in 18-slot format (previously remapped)
		if (keypoints.length === 18) {
			return keypoints;
		}
		// Remap from 17-slot native order
		if (keypoints.length === 17) {
			const remapped = new Array(18).fill(null);
			for (let i = 0; i < 17; i++) {
				const targetIdx = coco17ToCoco18[i];
				remapped[targetIdx] = keypoints[i];
			}
			return remapped;
		}
		return null;
	},

	/**
	 * Import from flat pose_keypoints_2d (51 values = 17 keypoints x 3).
	 * Remaps to internal 18-slot COCO-18 index space.
	 */
	importPose(poseKeypoints2d, canvasWidth, canvasHeight) {
		if (!Array.isArray(poseKeypoints2d) || poseKeypoints2d.length < 51) {
			return null;
		}
		// Only handle exactly 17 keypoints
		if (Math.floor(poseKeypoints2d.length / 3) !== 17) {
			return null;
		}
		const rawKeypoints = parseRawKeypoints(poseKeypoints2d, canvasWidth, canvasHeight);
		if (rawKeypoints.length !== 17) {
			return null;
		}
		// Remap to 18-slot COCO-18 index space
		const keypoints = new Array(18).fill(null);
		for (let coco17Idx = 0; coco17Idx < 17; coco17Idx++) {
			const coco18Idx = coco17ToCoco18[coco17Idx];
			keypoints[coco18Idx] = rawKeypoints[coco17Idx];
		}
		// Index 1 (Neck) remains null
		return keypoints;
	},

	/**
	 * Export from internal 18-slot representation.
	 * COCO-17 data stays in 18-slot format with Neck = null.
	 */
	exportPose(internalKeypoints) {
		return internalKeypoints;
	},

	/**
	 * Detect if an 18-slot keypoint array matches COCO-17 (Neck absent).
	 */
	detectFormat(keypoints) {
		if (!Array.isArray(keypoints) || keypoints.length < 2) {
			return false;
		}
		// COCO-17: Neck (index 1) is null/absent
		return keypoints[1] == null;
	}
};
