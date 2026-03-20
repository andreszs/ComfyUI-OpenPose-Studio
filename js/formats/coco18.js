/**
 * COCO-18 (OpenPose) format module.
 * Standard OpenPose output with 18 keypoints including Neck.
 *
 * @see format-interface.js for the FORMAT contract.
 */

export const allowEditCoco18 = true;

// ── Keypoint metadata (COCO-18 index space) ────────────────────────
export const COCO_KEYPOINTS = [
	{ id: 0,  name: "Nose",           rgb: [255,   0,   0] },
	{ id: 1,  name: "Neck",           rgb: [255,  85,   0] },
	{ id: 2,  name: "Right Shoulder", rgb: [255, 170,   0] },
	{ id: 3,  name: "Right Elbow",    rgb: [255, 255,   0] },
	{ id: 4,  name: "Right Wrist",    rgb: [170, 255,   0] },
	{ id: 5,  name: "Left Shoulder",  rgb: [ 85, 255,   0] },
	{ id: 6,  name: "Left Elbow",     rgb: [  0, 255,   0] },
	{ id: 7,  name: "Left Wrist",     rgb: [  0, 255,  85] },
	{ id: 8,  name: "Right Hip",      rgb: [  0, 255, 170] },
	{ id: 9,  name: "Right Knee",     rgb: [  0, 255, 255] },
	{ id: 10, name: "Right Ankle",    rgb: [  0, 170, 255] },
	{ id: 11, name: "Left Hip",       rgb: [  0,  85, 255] },
	{ id: 12, name: "Left Knee",      rgb: [  0,   0, 255] },
	{ id: 13, name: "Left Ankle",     rgb: [ 85,   0, 255] },
	{ id: 14, name: "Right Eye",      rgb: [170,   0, 255] },
	{ id: 15, name: "Left Eye",       rgb: [255,   0, 255] },
	{ id: 16, name: "Right Ear",      rgb: [255,   0, 170] },
	{ id: 17, name: "Left Ear",       rgb: [255,   0,  85] }
];

// ── Skeleton topology ──────────────────────────────────────────────
const skeletonEdges = [
	[0, 1],   [1, 2],  [2, 3],   [3, 4],
	[1, 5],   [5, 6],  [6, 7],   [1, 8],
	[8, 9],   [9, 10], [1, 11],  [11, 12],
	[12, 13], [14, 0], [14, 16], [15, 0],
	[15, 17]
];

const skeletonColors = [
	[  0,   0, 255],
	[255,   0,   0],
	[255, 170,   0],
	[255, 255,   0],
	[255,  85,   0],
	[170, 255,   0],
	[ 85, 255,   0],
	[  0, 255,   0],
	[  0, 255,  85],
	[  0, 255, 170],
	[  0, 255, 255],
	[  0, 170, 255],
	[  0,  85, 255],
	[ 85,   0, 255],
	[170,   0, 255],
	[255,   0, 255],
	[255,   0, 170],
	[255,   0,  85]
];

// ── Derived data ───────────────────────────────────────────────────
const keypointColors = COCO_KEYPOINTS.map(kp => kp.rgb);

const presentIndices = new Set(
	Array.from({ length: 18 }, (_, i) => i)
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
	id: "coco18",
	displayName: "COCO-18 (OpenPose)",

	keypoints: COCO_KEYPOINTS,
	skeletonEdges,
	skeletonColors,
	keypointColors,
	presentIndices,

	/**
	 * Validate that an 18-slot keypoint array is a valid COCO-18 pose.
	 */
	isValidPose(keypoints) {
		if (!Array.isArray(keypoints) || keypoints.length !== 18) {
			return false;
		}
		// At least one keypoint must be present
		return keypoints.some(kp => kp != null);
	},

	/**
	 * Identity normalization - COCO-18 is the internal format.
	 */
	normalizePose(keypoints) {
		return keypoints;
	},

	/**
	 * Import from flat pose_keypoints_2d (54 values = 18 keypoints x 3).
	 */
	importPose(poseKeypoints2d, canvasWidth, canvasHeight) {
		if (!Array.isArray(poseKeypoints2d) || poseKeypoints2d.length < 54) {
			return null;
		}
		// Only handle exactly 18 keypoints
		if (Math.floor(poseKeypoints2d.length / 3) !== 18) {
			return null;
		}
		const keypoints = parseRawKeypoints(poseKeypoints2d, canvasWidth, canvasHeight);
		return keypoints.length === 18 ? keypoints : null;
	},

	/**
	 * Export from internal 18-slot representation. Identity for COCO-18.
	 */
	exportPose(internalKeypoints) {
		return internalKeypoints;
	},

	/**
	 * Detect if an 18-slot keypoint array matches COCO-18 (Neck present).
	 */
	detectFormat(keypoints) {
		if (!Array.isArray(keypoints) || keypoints.length < 2) {
			return false;
		}
		// COCO-18: Neck (index 1) is present
		return keypoints[1] != null;
	}
};
