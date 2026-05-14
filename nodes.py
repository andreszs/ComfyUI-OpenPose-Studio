import json
import math
import os
import numpy as np
import torch
import cv2
import os.path
import folder_paths
from nodes import LoadImage


# OpenPose body keypoint connections (0-indexed)
# Same as the JS editor uses
LIMB_SEQ = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [1, 5], [5, 6], [6, 7], [1, 8],
    [8, 9], [9, 10], [1, 11], [11, 12],
    [12, 13], [14, 0], [14, 16], [15, 0],
    [15, 17]
]

# Colors for each limb (RGB)
LIMB_COLORS = [
    [0, 0, 255], [255, 0, 0], [255, 170, 0], [255, 255, 0],
    [255, 85, 0], [170, 255, 0], [85, 255, 0], [0, 255, 0],
    [0, 255, 85], [0, 255, 170], [0, 255, 255], [0, 170, 255],
    [0, 85, 255], [85, 0, 255], [170, 0, 255], [255, 0, 255],
    [255, 0, 170], [255, 0, 85]
]

KEYPOINT_COLORS = [
    [255, 0, 0], [255, 85, 0], [255, 170, 0], [255, 255, 0],
    [170, 255, 0], [85, 255, 0], [0, 255, 0], [0, 255, 85],
    [0, 255, 170], [0, 255, 255], [0, 170, 255], [0, 85, 255],
    [0, 0, 255], [85, 0, 255], [170, 0, 255], [255, 0, 255],
    [255, 0, 170], [255, 0, 85]
]

COCO17_TO_COCO18 = {
    0: 0,    # nose -> Nose
    1: 15,   # left_eye -> Left Eye
    2: 14,   # right_eye -> Right Eye
    3: 17,   # left_ear -> Left Ear
    4: 16,   # right_ear -> Right Ear
    5: 5,    # left_shoulder -> Left Shoulder
    6: 2,    # right_shoulder -> Right Shoulder
    7: 6,    # left_elbow -> Left Elbow
    8: 3,    # right_elbow -> Right Elbow
    9: 7,    # left_wrist -> Left Wrist
    10: 4,   # right_wrist -> Right Wrist
    11: 11,  # left_hip -> Left Hip
    12: 8,   # right_hip -> Right Hip
    13: 12,  # left_knee -> Left Knee
    14: 9,   # right_knee -> Right Knee
    15: 13,  # left_ankle -> Left Ankle
    16: 10   # right_ankle -> Right Ankle
}

# COCO-17 skeleton edges (COCO-18 index space, neck excluded)
COCO17_LIMB_SEQ = [
    [0, 15], [0, 14], [15, 17], [14, 16],
    [5, 2],
    [5, 6], [6, 7],
    [2, 3], [3, 4],
    [5, 11], [2, 8], [11, 8],
    [11, 12], [12, 13],
    [8, 9], [9, 10]
]

COCO17_LIMB_COLORS = [
    [0, 255, 0], [0, 255, 0], [0, 255, 0], [0, 255, 0],
    [255, 128, 0],
    [255, 128, 0], [255, 128, 0],
    [255, 128, 0], [255, 128, 0],
    [255, 128, 0], [255, 128, 0], [255, 128, 0],
    [51, 153, 255], [51, 153, 255],
    [51, 153, 255], [51, 153, 255]
]

COCO17_KEYPOINT_COLORS = [
    [0, 255, 0],    # 0  Nose
    [0, 0, 0],      # 1  Neck (not present in COCO17)
    [255, 128, 0],  # 2  Right Shoulder
    [255, 128, 0],  # 3  Right Elbow
    [255, 128, 0],  # 4  Right Wrist
    [255, 128, 0],  # 5  Left Shoulder
    [255, 128, 0],  # 6  Left Elbow
    [255, 128, 0],  # 7  Left Wrist
    [51, 153, 255], # 8  Right Hip
    [51, 153, 255], # 9  Right Knee
    [51, 153, 255], # 10 Right Ankle
    [51, 153, 255], # 11 Left Hip
    [51, 153, 255], # 12 Left Knee
    [51, 153, 255], # 13 Left Ankle
    [0, 255, 0],    # 14 Right Eye
    [0, 255, 0],    # 15 Left Eye
    [0, 255, 0],    # 16 Right Ear
    [0, 255, 0]     # 17 Left Ear
]

HAND_EDGES = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20]
]

HAND_KEYPOINT_COLORS = [
    [255, 255, 255],
    [255, 0, 0], [255, 0, 0], [255, 0, 0], [255, 0, 0],
    [255, 255, 0], [255, 255, 0], [255, 255, 0], [255, 255, 0],
    [0, 255, 0], [0, 255, 0], [0, 255, 0], [0, 255, 0],
    [0, 255, 255], [0, 255, 255], [0, 255, 255], [0, 255, 255],
    [255, 0, 255], [255, 0, 255], [255, 0, 255], [255, 0, 255]
]

DEBUG_RENDER = os.environ.get("OPENPOSE_EDITOR_DEBUG", "").strip().lower() in ("1", "true", "yes", "on")

RENDER_STYLE_VERSION = 2
RENDER_STYLE_KEYS = {
    "version": "comfyui_openpose_editor.renderer.version",
    "body": {
        "line_width": "comfyui_openpose_editor.renderer.body.line_width",
        "keypoint_color": "comfyui_openpose_editor.renderer.body.keypoint_color",
        "keypoint_radius": "comfyui_openpose_editor.renderer.body.keypoint_radius",
    },
    "hands": {
        "line_width": "comfyui_openpose_editor.renderer.hands.line_width",
        "keypoint_color": "comfyui_openpose_editor.renderer.hands.keypoint_color",
        "keypoint_radius": "comfyui_openpose_editor.renderer.hands.keypoint_radius",
    },
    "face": {
        "line_width": "comfyui_openpose_editor.renderer.face.line_width",
        "keypoint_color": "comfyui_openpose_editor.renderer.face.keypoint_color",
        "keypoint_radius": "comfyui_openpose_editor.renderer.face.keypoint_radius",
    },
}

DEFAULT_RENDER_STYLE = {
    "version": RENDER_STYLE_VERSION,
    "body": {
        "line_width": 4,
        "keypoint_color": None,
        "keypoint_radius": 4,
    },
    "hands": {
        "line_width": 2,
        "keypoint_color": None,
        "keypoint_radius": 4,
    },
    "face": {
        "line_width": 0,
        "keypoint_color": [255, 255, 255, 255],
        "keypoint_radius": 4,
    },
}

_runtime_render_style = None


def _debug_log(message, detail=None):
    if not DEBUG_RENDER:
        return
    if detail is None:
        print(f"[OpenPose Studio] {message}")
    else:
        print(f"[OpenPose Studio] {message}: {detail}")


def _clamp_number(value, min_value, max_value, fallback):
    try:
        num = float(value)
    except Exception:
        return fallback
    if not math.isfinite(num):
        return fallback
    return min(max_value, max(min_value, num))


def _normalize_style_color(value, fallback=None):
    if value is None and fallback is None:
        return None
    base = fallback if isinstance(fallback, list) else [0, 0, 0, 255]
    if value is None or not isinstance(value, list):
        value = base
    output = []
    for index in range(4):
        default = base[index] if index < len(base) else (255 if index == 3 else 0)
        output.append(int(round(_clamp_number(value[index] if index < len(value) else default, 0, 255, default))))
    return output


def _read_render_style_section(payload, section, defaults):
    key_map = RENDER_STYLE_KEYS[section]
    settings = {
        "line_width": int(round(_clamp_number(
            payload.get(key_map["line_width"]),
            0,
            12,
            defaults["line_width"],
        ))),
        "keypoint_color": _normalize_style_color(
            payload.get(key_map["keypoint_color"]),
            defaults["keypoint_color"],
        ),
        "keypoint_radius": int(round(_clamp_number(
            payload.get(key_map["keypoint_radius"]),
            0,
            24,
            defaults["keypoint_radius"],
        ))),
    }
    if settings["line_width"] <= 0 and settings["keypoint_radius"] <= 0:
        settings["line_width"] = defaults["line_width"]
        settings["keypoint_radius"] = defaults["keypoint_radius"]
    return settings


def _normalize_render_style_payload(payload):
    if not isinstance(payload, dict):
        return None
    version = int(round(_clamp_number(
        payload.get(RENDER_STYLE_KEYS["version"]),
        RENDER_STYLE_VERSION,
        RENDER_STYLE_VERSION,
        RENDER_STYLE_VERSION,
    )))
    return {
        "version": version,
        "body": _read_render_style_section(payload, "body", DEFAULT_RENDER_STYLE["body"]),
        "hands": _read_render_style_section(payload, "hands", DEFAULT_RENDER_STYLE["hands"]),
        "face": _read_render_style_section(payload, "face", DEFAULT_RENDER_STYLE["face"]),
    }


def set_runtime_render_style(payload):
    global _runtime_render_style
    _runtime_render_style = _normalize_render_style_payload(payload)
    return _runtime_render_style is not None


def get_runtime_render_style():
    if not isinstance(_runtime_render_style, dict):
        return DEFAULT_RENDER_STYLE
    return _runtime_render_style


def get_runtime_render_style_fingerprint():
    try:
        return json.dumps(get_runtime_render_style(), sort_keys=True, separators=(",", ":"))
    except Exception:
        return "default"


def _style_rgb(color, fallback):
    normalized = _normalize_style_color(color, fallback)
    if not normalized:
        return fallback
    alpha = normalized[3] / 255.0 if len(normalized) > 3 else 1.0
    return [int(round(channel * alpha)) for channel in normalized[:3]]


def _normalize_keypoints_for_render(keypoints):
    if not isinstance(keypoints, list):
        return None
    if len(keypoints) == 18:
        return keypoints
    if len(keypoints) == 17:
        remapped = [None] * 18
        for idx, kp in enumerate(keypoints):
            target_idx = COCO17_TO_COCO18.get(idx)
            if target_idx is not None:
                remapped[target_idx] = kp
        return remapped
    return None


def _coerce_dimension(value, fallback=512):
    try:
        number = float(value)
    except Exception:
        return fallback
    if not math.isfinite(number) or number <= 0:
        return fallback
    return int(number)


def _extract_keypoints_from_pose_keypoints_2d(pose_keypoints_2d, canvas_width, canvas_height):
    if not isinstance(pose_keypoints_2d, list) or not pose_keypoints_2d:
        return None

    if len(pose_keypoints_2d) % 3 == 0:
        step = 3
    elif len(pose_keypoints_2d) % 2 == 0:
        step = 2
    else:
        return None

    count = len(pose_keypoints_2d) // step
    if count not in (17, 18):
        return None

    epsilon = 0.5
    raw_keypoints = []
    for i in range(0, len(pose_keypoints_2d), step):
        x = pose_keypoints_2d[i]
        y = pose_keypoints_2d[i + 1]
        try:
            x = float(x)
            y = float(y)
        except Exception:
            raw_keypoints.append(None)
            continue

        if step == 3:
            try:
                conf = float(pose_keypoints_2d[i + 2])
            except Exception:
                conf = 0.0
        else:
            conf = 1.0 if (abs(x) > epsilon or abs(y) > epsilon) else 0.0

        if conf <= 0:
            raw_keypoints.append(None)
            continue

        if 0 <= x <= 1 and 0 <= y <= 1:
            final_x = round(x * canvas_width)
            final_y = round(y * canvas_height)
        else:
            final_x = round(x)
            final_y = round(y)

        raw_keypoints.append([final_x, final_y])

    if count == 17:
        return _normalize_keypoints_for_render(raw_keypoints)
    return raw_keypoints


def _extract_extra_keypoints_from_keypoints_2d(extra_keypoints_2d, canvas_width, canvas_height):
    if not isinstance(extra_keypoints_2d, list) or not extra_keypoints_2d:
        return None

    if len(extra_keypoints_2d) % 3 == 0:
        step = 3
    elif len(extra_keypoints_2d) % 2 == 0:
        step = 2
    else:
        return None

    epsilon = 0.5
    points = []
    for i in range(0, len(extra_keypoints_2d), step):
        x = extra_keypoints_2d[i]
        y = extra_keypoints_2d[i + 1]
        try:
            x = float(x)
            y = float(y)
        except Exception:
            points.append(None)
            continue

        if step == 3:
            try:
                conf = float(extra_keypoints_2d[i + 2])
            except Exception:
                conf = 0.0
        else:
            conf = 1.0 if (abs(x) > epsilon or abs(y) > epsilon) else 0.0

        if conf <= 0:
            points.append(None)
            continue

        if 0 <= x <= 1 and 0 <= y <= 1:
            final_x = round(x * canvas_width)
            final_y = round(y * canvas_height)
        else:
            final_x = round(x)
            final_y = round(y)

        if abs(final_x) <= epsilon and abs(final_y) <= epsilon:
            points.append(None)
            continue

        points.append([final_x, final_y])

    return points


def _has_nonzero_keypoints(points):
    if not isinstance(points, list):
        return False
    for point in points:
        if not point or len(point) < 2:
            continue
        x, y = point[0], point[1]
        try:
            x = float(x)
            y = float(y)
        except Exception:
            continue
        if x != 0 or y != 0:
            return True
    return False


def _normalize_legacy_pose_groups(raw_keypoints):
    if not isinstance(raw_keypoints, list) or not raw_keypoints:
        return []

    first = raw_keypoints[0]
    if isinstance(first, list):
        if len(first) > 0 and (isinstance(first[0], list) or first[0] is None):
            return raw_keypoints
        return [raw_keypoints]

    return []


def _normalize_pose_json(pose_json):
    try:
        payload = json.loads(pose_json) if isinstance(pose_json, str) else pose_json
    except Exception:
        return None

    if isinstance(payload, list):
        if len(payload) == 1 and isinstance(payload[0], dict):
            payload = payload[0]
        else:
            return None
    if not isinstance(payload, dict):
        return None

    schema = None
    poses = []

    if isinstance(payload.get("people"), list) or isinstance(payload.get("pose_keypoints_2d"), list):
        schema = "standard"
        width = _coerce_dimension(payload.get("canvas_width", 512))
        height = _coerce_dimension(payload.get("canvas_height", 512))
        people = payload.get("people")
        if not isinstance(people, list):
            people = [payload]
        for person in people:
            if not isinstance(person, dict):
                continue
            raw_kp2d = person.get("pose_keypoints_2d") or []
            # Determine format from flat array count (17 triplets = COCO-17, 18 = COCO-18).
            # Do NOT infer format from per-person keypoint nullity: a sparse COCO-18 person
            # whose neck confidence is 0 would otherwise be mis-identified as COCO-17.
            raw_step = 3 if (len(raw_kp2d) % 3 == 0) else (2 if len(raw_kp2d) % 2 == 0 else 0)
            person_format_is_coco17 = raw_step > 0 and (len(raw_kp2d) // raw_step) == 17
            keypoints = _extract_keypoints_from_pose_keypoints_2d(
                raw_kp2d,
                width,
                height
            )
            if not keypoints:
                continue
            face_keypoints = _extract_extra_keypoints_from_keypoints_2d(
                person.get("face_keypoints_2d"),
                width,
                height
            )
            hand_left_keypoints = _extract_extra_keypoints_from_keypoints_2d(
                person.get("hand_left_keypoints_2d"),
                width,
                height
            )
            hand_right_keypoints = _extract_extra_keypoints_from_keypoints_2d(
                person.get("hand_right_keypoints_2d"),
                width,
                height
            )
            poses.append({
                "keypoints": keypoints,
                "is_coco17": person_format_is_coco17,
                "face_keypoints": face_keypoints,
                "hand_left_keypoints": hand_left_keypoints,
                "hand_right_keypoints": hand_right_keypoints
            })
    elif "keypoints" in payload:
        schema = "legacy"
        width = _coerce_dimension(payload.get("width", 512))
        height = _coerce_dimension(payload.get("height", 512))
        declared_format = payload.get("format")
        pose_groups = _normalize_legacy_pose_groups(payload.get("keypoints", []))
        for group in pose_groups:
            normalized = _normalize_keypoints_for_render(group)
            if not normalized:
                continue
            is_coco17 = (
                declared_format == "coco17"
                or len(group) == 17
                or (len(normalized) == 18 and normalized[1] is None)
            )
            poses.append({
                "keypoints": normalized,
                "is_coco17": is_coco17
            })
    else:
        return None

    if not poses:
        return {
            "schema": schema or "unknown",
            "width": _coerce_dimension(payload.get("canvas_width", payload.get("width", 512))),
            "height": _coerce_dimension(payload.get("canvas_height", payload.get("height", 512))),
            "poses": []
        }

    return {
        "schema": schema or "unknown",
        "width": _coerce_dimension(width),
        "height": _coerce_dimension(height),
        "poses": poses
    }


def _extract_workflow_from_extra_pnginfo(extra_pnginfo):
    if not isinstance(extra_pnginfo, dict):
        return None
    workflow = extra_pnginfo.get("workflow")
    if isinstance(workflow, str):
        try:
            workflow = json.loads(workflow)
        except Exception:
            return None
    if not isinstance(workflow, dict):
        return None
    return workflow


def _coerce_pose_json_string(value):
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        try:
            return json.dumps(value)
        except Exception:
            return None
    return None


def draw_bodypose(canvas: np.ndarray, keypoints: list, limb_seq=LIMB_SEQ, limb_colors=LIMB_COLORS, keypoint_colors=KEYPOINT_COLORS, keypoint_radius: int = 4, line_width: int = 4, keypoint_color=None) -> np.ndarray:
    """
    Draw body pose on canvas.

    Args:
        canvas: The image canvas (H, W, 3)
        keypoints: List of [x, y] coordinates in pixel space

    Returns:
        Modified canvas with drawn pose
    """
    stickwidth = max(0, int(line_width))

    # Draw limbs
    if stickwidth > 0:
        for i, (k1_idx, k2_idx) in enumerate(limb_seq):
            if k1_idx >= len(keypoints) or k2_idx >= len(keypoints):
                continue

            kp1 = keypoints[k1_idx]
            kp2 = keypoints[k2_idx]

            if kp1 is None or kp2 is None:
                continue

            x1, y1 = int(kp1[0]), int(kp1[1])
            x2, y2 = int(kp2[0]), int(kp2[1])

            # Skip invalid keypoints
            if x1 <= 0 or y1 <= 0 or x2 <= 0 or y2 <= 0:
                continue

            # Get color for this limb
            color = limb_colors[i] if i < len(limb_colors) else [255, 255, 255]
            # Convert RGB to BGR for OpenCV, apply 0.6 factor like original
            color_bgr = [int(c * 0.6) for c in color[::-1]]

            # Draw limb as ellipse polygon (like original OpenPose)
            mX = (x1 + x2) / 2
            mY = (y1 + y2) / 2
            length = math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)
            angle = math.degrees(math.atan2(y1 - y2, x1 - x2))

            polygon = cv2.ellipse2Poly(
                (int(mX), int(mY)),
                (int(length / 2), stickwidth),
                int(angle), 0, 360, 1
            )
            cv2.fillConvexPoly(canvas, polygon, color_bgr)

    # Draw keypoints
    if keypoint_radius > 0:
        for i, kp in enumerate(keypoints):
            if kp is None:
                continue

            x, y = int(kp[0]), int(kp[1])
            if x <= 0 or y <= 0:
                continue

            color = _style_rgb(keypoint_color, keypoint_colors[i] if i < len(keypoint_colors) else [255, 255, 255])
            color_bgr = color[::-1]  # RGB to BGR
            cv2.circle(canvas, (x, y), keypoint_radius, color_bgr, thickness=-1)

    return canvas


def draw_face_keypoints(canvas: np.ndarray, keypoints: list, radius: int = 2, keypoint_color=None, line_width: int = 0) -> np.ndarray:
    if not isinstance(keypoints, list):
        return canvas
    if radius <= 0:
        return canvas
    for kp in keypoints:
        if kp is None or len(kp) < 2:
            continue
        x, y = int(kp[0]), int(kp[1])
        if x <= 0 or y <= 0:
            continue
        if line_width > 0:
            cv2.circle(canvas, (x, y), radius + int(line_width), (0, 0, 0), thickness=-1)
        cv2.circle(canvas, (x, y), radius, _style_rgb(keypoint_color, [255, 255, 255])[::-1], thickness=-1)
    return canvas


def draw_hand_keypoints(canvas: np.ndarray, keypoints: list, line_width: int = 2, keypoint_color=None) -> np.ndarray:
    if not isinstance(keypoints, list) or len(keypoints) == 0:
        return canvas
    line_width = max(0, int(line_width))
    if line_width <= 0:
        return canvas

    for edge in HAND_EDGES:
        a, b = edge
        if a >= len(keypoints) or b >= len(keypoints):
            continue
        kp_a = keypoints[a]
        kp_b = keypoints[b]
        if kp_a is None or kp_b is None:
            continue
        x1, y1 = int(kp_a[0]), int(kp_a[1])
        x2, y2 = int(kp_b[0]), int(kp_b[1])
        if x1 <= 0 or y1 <= 0 or x2 <= 0 or y2 <= 0:
            continue
        color = _style_rgb(keypoint_color, HAND_KEYPOINT_COLORS[b] if b < len(HAND_KEYPOINT_COLORS) else [255, 255, 255])
        color_bgr = color[::-1]
        cv2.line(canvas, (x1, y1), (x2, y2), color_bgr, thickness=line_width)

    return canvas


def _hand_joint_dot_radius(canvas_width, canvas_height):
    return 2


def draw_hand_joint_dots(canvas: np.ndarray, keypoints: list, radius: int, keypoint_color=None) -> np.ndarray:
    if not isinstance(keypoints, list) or len(keypoints) == 0:
        return canvas
    if radius <= 0:
        return canvas
    dot_color_bgr = _style_rgb(keypoint_color, [0, 0, 255])[::-1]
    for kp in keypoints:
        if kp is None or len(kp) < 2:
            continue
        x, y = int(kp[0]), int(kp[1])
        if x <= 0 or y <= 0:
            continue
        cv2.circle(canvas, (x, y), radius, dot_color_bgr, thickness=-1)
    return canvas


def _is_dictionary_payload(payload):
    if not isinstance(payload, dict):
        return False
    if "people" in payload or "pose_keypoints_2d" in payload or "keypoints" in payload:
        return False
    return len(payload) > 0


def _strip_pose_components(payload, show_body, show_face, show_hands):
    if not isinstance(payload, dict):
        return

    if not show_body:
        if "pose_keypoints_2d" in payload:
            del payload["pose_keypoints_2d"]
        if "keypoints" in payload:
            del payload["keypoints"]

    if not show_face and "face_keypoints_2d" in payload:
        del payload["face_keypoints_2d"]

    if not show_hands:
        if "hand_left_keypoints_2d" in payload:
            del payload["hand_left_keypoints_2d"]
        if "hand_right_keypoints_2d" in payload:
            del payload["hand_right_keypoints_2d"]
        if "hand_keypoints_2d" in payload:
            del payload["hand_keypoints_2d"]

    people = payload.get("people")
    if isinstance(people, list):
        for person in people:
            _strip_pose_components(person, show_body, show_face, show_hands)


def _apply_export_filter(pose_json, show_body, show_face, show_hands):
    if show_body and show_face and show_hands:
        return pose_json

    try:
        payload = json.loads(pose_json)
    except Exception:
        return pose_json

    if _is_dictionary_payload(payload):
        for key in list(payload.keys()):
            _strip_pose_components(payload[key], show_body, show_face, show_hands)
    else:
        _strip_pose_components(payload, show_body, show_face, show_hands)

    try:
        return json.dumps(payload)
    except Exception:
        return pose_json


def convert_to_pose_keypoint(pose_json: str, show_body=True, show_face=True, show_hands=True) -> dict:
    """
    Convert editor JSON format to POSE_KEYPOINT format for comfyui_controlnet_aux.

    Editor format:
        {"width": W, "height": H, "keypoints": [[[x1,y1], [x2,y2], ...], ...]}

    POSE_KEYPOINT format:
        {"canvas_width": W, "canvas_height": H, "people": [{"pose_keypoints_2d": [...]}]}

    The pose_keypoints_2d array is flattened: [x1, y1, conf1, x2, y2, conf2, ...]
    Coordinates are in PIXEL space (not normalized).
    """
    if not show_body:
        return {
            "canvas_width": 512,
            "canvas_height": 512,
            "people": [],
        }

    normalized = _normalize_pose_json(pose_json)
    if not normalized:
        return {
            "canvas_width": 512,
            "canvas_height": 512,
            "people": [],
        }

    width = normalized.get("width", 512)
    height = normalized.get("height", 512)
    poses = normalized.get("poses", [])
    schema = normalized.get("schema", "unknown")

    def flatten_keypoints(points):
        output = []
        if not isinstance(points, list):
            return output
        for kp in points:
            if kp is not None and len(kp) >= 2:
                x = float(kp[0])
                y = float(kp[1])
                conf = 1.0
            else:
                x, y, conf = 0.0, 0.0, 0.0
            output.extend([x, y, conf])
        return output

    people = []
    for pose in poses:
        keypoints = pose.get("keypoints") if isinstance(pose, dict) else None
        if not isinstance(keypoints, list) or len(keypoints) < 17:
            continue

        # Flatten keypoints and add confidence (pixel coordinates)
        pose_keypoints_2d = flatten_keypoints(keypoints)
        person = {
            "pose_keypoints_2d": pose_keypoints_2d,
            "face_keypoints_2d": None,
            "hand_left_keypoints_2d": None,
            "hand_right_keypoints_2d": None,
        }

        if schema == "standard":
            if show_face:
                face_keypoints = pose.get("face_keypoints") if isinstance(pose, dict) else None
                if _has_nonzero_keypoints(face_keypoints):
                    person["face_keypoints_2d"] = flatten_keypoints(face_keypoints)
            if show_hands:
                hand_left_keypoints = pose.get("hand_left_keypoints") if isinstance(pose, dict) else None
                hand_right_keypoints = pose.get("hand_right_keypoints") if isinstance(pose, dict) else None
                if _has_nonzero_keypoints(hand_left_keypoints):
                    person["hand_left_keypoints_2d"] = flatten_keypoints(hand_left_keypoints)
                if _has_nonzero_keypoints(hand_right_keypoints):
                    person["hand_right_keypoints_2d"] = flatten_keypoints(hand_right_keypoints)

        people.append(person)

    return {
        "canvas_width": width,
        "canvas_height": height,
        "people": people,
    }


def render_pose_image(pose_json: str, show_body=True, show_face=True, show_hands=True, keypoint_radius: int = 4) -> np.ndarray:
    """
    Render pose from JSON to image.

    Args:
        pose_json: JSON string with format:
            {"width": W, "height": H, "keypoints": [[[x1,y1], [x2,y2], ...], ...]}

    Returns:
        RGB image as numpy array (H, W, 3) in 0-1 float range
    """
    normalized = _normalize_pose_json(pose_json)
    if not normalized:
        canvas = np.zeros((512, 512, 3), dtype=np.uint8)
        canvas_rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)
        return canvas_rgb.astype(np.float32) / 255.0

    width = normalized.get("width", 512)
    height = normalized.get("height", 512)
    schema = normalized.get("schema", "unknown")
    poses = normalized.get("poses", [])
    render_style = get_runtime_render_style()
    body_style = render_style["body"]
    hands_style = render_style["hands"]
    face_style = render_style["face"]

    # Create black canvas (RGB)
    canvas = np.zeros((height, width, 3), dtype=np.uint8)

    if not show_body:
        canvas_rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)
        return canvas_rgb.astype(np.float32) / 255.0

    if DEBUG_RENDER:
        _debug_log("Detected schema", schema)
        _debug_log("Canvas size", f"{width}x{height}")
        if poses:
            sample_pose = poses[0].get("keypoints", []) if isinstance(poses[0], dict) else []
            _debug_log("Body keypoints count", len(sample_pose))
            _debug_log("Keypoint sample", sample_pose[:6])
        else:
            _debug_log("Body keypoints count", 0)

    # Draw each pose
    for pose in poses:
        keypoints = pose.get("keypoints") if isinstance(pose, dict) else None
        if not isinstance(keypoints, list):
            continue

        normalized_keypoints = _normalize_keypoints_for_render(keypoints)
        if not normalized_keypoints:
            continue

        is_coco17 = bool(pose.get("is_coco17")) if isinstance(pose, dict) else False
        limb_seq = COCO17_LIMB_SEQ if is_coco17 else LIMB_SEQ
        limb_colors = COCO17_LIMB_COLORS if is_coco17 else LIMB_COLORS
        keypoint_colors = COCO17_KEYPOINT_COLORS if is_coco17 else KEYPOINT_COLORS

        if DEBUG_RENDER:
            sample = normalized_keypoints[:6]
            selected_format = "coco17" if is_coco17 else "coco18"
            _debug_log("Render format", selected_format)
            _debug_log("Color source", f"dots={selected_format} lines={selected_format}")
            _debug_log(
                "Color samples",
                {
                    "right_eye": keypoint_colors[14],
                    "left_eye": keypoint_colors[15],
                    "right_ear": keypoint_colors[16],
                    "left_ear": keypoint_colors[17]
                }
            )
            _debug_log("Keypoint counts", f"raw={len(keypoints)} normalized={len(normalized_keypoints)}")
            _debug_log("Keypoint sample", sample)
            _debug_log("Limb edges", len(limb_seq))

        canvas = draw_bodypose(
            canvas,
            normalized_keypoints,
            limb_seq=limb_seq,
            limb_colors=limb_colors,
            keypoint_colors=keypoint_colors,
            keypoint_radius=body_style["keypoint_radius"],
            line_width=body_style["line_width"],
            keypoint_color=body_style["keypoint_color"],
        )

        if schema == "standard":
            if show_face:
                face_keypoints = pose.get("face_keypoints") if isinstance(pose, dict) else None
                if _has_nonzero_keypoints(face_keypoints):
                    canvas = draw_face_keypoints(
                        canvas,
                        face_keypoints,
                        face_style["keypoint_radius"],
                        face_style["keypoint_color"],
                        face_style["line_width"],
                    )
            if show_hands:
                hand_left_keypoints = pose.get("hand_left_keypoints") if isinstance(pose, dict) else None
                hand_right_keypoints = pose.get("hand_right_keypoints") if isinstance(pose, dict) else None
                if _has_nonzero_keypoints(hand_left_keypoints):
                    canvas = draw_hand_keypoints(
                        canvas,
                        hand_left_keypoints,
                        hands_style["line_width"],
                        hands_style["keypoint_color"],
                    )
                    canvas = draw_hand_joint_dots(
                        canvas,
                        hand_left_keypoints,
                        hands_style["keypoint_radius"],
                        hands_style["keypoint_color"],
                    )
                if _has_nonzero_keypoints(hand_right_keypoints):
                    canvas = draw_hand_keypoints(
                        canvas,
                        hand_right_keypoints,
                        hands_style["line_width"],
                        hands_style["keypoint_color"],
                    )
                    canvas = draw_hand_joint_dots(
                        canvas,
                        hand_right_keypoints,
                        hands_style["keypoint_radius"],
                        hands_style["keypoint_color"],
                    )

    # Convert BGR to RGB and normalize to 0-1
    canvas_rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)
    return canvas_rgb.astype(np.float32) / 255.0


class OpenPoseStudio:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "pose_json": ("STRING", {"default": "", "multiline": False}),
                "render_body": ("BOOLEAN", {"default": True, "label": "render_body"}),
                "render_hand": ("BOOLEAN", {"default": True, "label": "render_hand"}),
                "render_face": ("BOOLEAN", {"default": True, "label": "render_face"}),
            },
            "optional": {
                "pose_keypoint": ("POSE_KEYPOINT", {}),
                "areas": ("CONDITIONING_AREAS", {}),
            }
        }

    RETURN_TYPES = ("IMAGE", "STRING", "POSE_KEYPOINT")
    RETURN_NAMES = ("IMAGE", "JSON", "KPS")
    FUNCTION = "render"
    CATEGORY = "OpenPose Studio"

    @classmethod
    def IS_CHANGED(s, pose_json, render_body, render_hand, render_face, **kwargs):
        return get_runtime_render_style_fingerprint()

    def render(self, pose_json, render_body, render_hand, render_face, **kwargs):
        """
        Render the pose from JSON to IMAGE and POSE_KEYPOINT.
        """
        # If a POSE_KEYPOINT is connected, serialize it to JSON and use it in
        # place of the pose_json widget value.  POSE_KEYPOINT is a Python list
        # in the DWPose array format: [{canvas_width, canvas_height, people}].
        pose_keypoint_input = kwargs.get("pose_keypoint")
        if pose_keypoint_input is not None:
            try:
                pose_json = json.dumps(pose_keypoint_input)
            except Exception:
                pass

        if not pose_json or pose_json.strip() == "":
            # Return empty black image and empty pose if no pose
            empty = np.zeros((512, 512, 3), dtype=np.float32)
            empty_pose = {
                "canvas_width": 512,
                "canvas_height": 512,
                "people": [],
            }
            return {"ui": {"pose_json": [""]}, "result": (torch.from_numpy(empty).unsqueeze(0), "", empty_pose)}

        filtered_pose_json = _apply_export_filter(
            pose_json,
            render_body,
            render_face,
            render_hand
        )

        if not render_body:
            normalized = _normalize_pose_json(filtered_pose_json)
            width = normalized.get("width", 512) if normalized else 512
            height = normalized.get("height", 512) if normalized else 512
            empty = np.zeros((height, width, 3), dtype=np.float32)
            empty_pose = {
                "canvas_width": width,
                "canvas_height": height,
                "people": [],
            }
            return {"ui": {"pose_json": [pose_json]}, "result": (torch.from_numpy(empty).unsqueeze(0), filtered_pose_json, empty_pose)}

        try:
            # Render pose from JSON
            image = render_pose_image(
                filtered_pose_json,
                show_body=render_body,
                show_face=render_face,
                show_hands=render_hand
            )
            # Convert to torch tensor with batch dimension
            tensor = torch.from_numpy(image).unsqueeze(0)

            pose_keypoint = convert_to_pose_keypoint(
                filtered_pose_json,
                show_body=render_body,
                show_face=render_face,
                show_hands=render_hand
            )
            return {"ui": {"pose_json": [pose_json]}, "result": (tensor, filtered_pose_json, pose_keypoint)}
        except Exception as e:
            print(f"[OpenPose Studio] Error rendering pose: {e}")
            empty = np.zeros((512, 512, 3), dtype=np.float32)
            empty_pose = {
                "canvas_width": 512,
                "canvas_height": 512,
                "people": [],
            }
            return {"ui": {"pose_json": [pose_json]}, "result": (torch.from_numpy(empty).unsqueeze(0), filtered_pose_json, empty_pose)}


class OPS_ShowString:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "text": ("STRING", {"forceInput": True}),
            }
        }

    INPUT_IS_LIST = True
    RETURN_TYPES = ()
    FUNCTION = "show_text"
    OUTPUT_NODE = True
    CATEGORY = "OpenPose Studio"

    def show_text(self, text):
        return {"ui": {"text": text}}


NODE_CLASS_MAPPINGS = {
    "OpenPoseStudio": OpenPoseStudio,
    "OPS_ShowString": OPS_ShowString,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "OpenPoseStudio": "OpenPose Studio",
    "OPS_ShowString": "Show String",
}
