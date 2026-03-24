"""Regression tests for malformed multi-person pose import.

Bug: a people[] entry with only a few non-null keypoints (e.g. an isolated arm
fragment) was incorrectly promoted into a standalone pose during import.

Repro: poses/misc/carrying.json contains a bogus third person entry with only
two valid keypoints (right-elbow + right-wrist).  Before the fix, importing
this file produced three poses instead of two.

Run with:
    python -m pytest tests/test_normalize_pose_json.py -v
  or:
    python tests/test_normalize_pose_json.py
"""

import importlib.util
import os
import sys
import types
import unittest

# ---------------------------------------------------------------------------
# Mock heavy / ComfyUI-specific dependencies so nodes.py can be imported in a
# plain Python environment (no ComfyUI, no GPU libraries required).
# ---------------------------------------------------------------------------

class _PermissiveMock(types.ModuleType):
    """Module mock that returns a sentinel for any attribute access, allowing
    type annotations (e.g. np.ndarray) to be evaluated at module load time."""

    class _Sentinel:
        """Returned for any unknown attribute; also callable and subscriptable."""
        def __call__(self, *a, **kw):
            return self
        def __getitem__(self, item):
            return self
        def __getattr__(self, name):
            return type(self)()

    def __getattr__(self, name):
        sentinel = self._Sentinel()
        object.__setattr__(self, name, sentinel)
        return sentinel


def _mock_module(name, attrs=None):
    if name in sys.modules:
        return
    mod = _PermissiveMock(name)
    if attrs:
        for k, v in attrs.items():
            setattr(mod, k, v)
    sys.modules[name] = mod


_mock_module("numpy")
_mock_module("torch")
_mock_module("cv2")
_mock_module("folder_paths")
# 'from nodes import LoadImage' inside nodes.py must resolve to our mock.
_mock_module("nodes", {"LoadImage": object})

# ---------------------------------------------------------------------------
# Load the repository's nodes.py as an isolated module.
# ---------------------------------------------------------------------------
_REPO_NODES = os.path.join(os.path.dirname(__file__), "..", "nodes.py")
_spec = importlib.util.spec_from_file_location("openpose_studio_nodes", _REPO_NODES)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

_normalize_pose_json = _mod._normalize_pose_json
_MIN = _mod._MIN_BODY_KEYPOINTS_FOR_VALID_PERSON

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _flat18(*valid_indices):
    """Return a 54-value (18-triplet) flat array with only the given indices set."""
    arr = [0] * 54
    for i in valid_indices:
        arr[i * 3] = 100 + i * 10
        arr[i * 3 + 1] = 200 + i * 10
        arr[i * 3 + 2] = 1
    return arr


def _full18():
    """Return a 54-value flat array where every keypoint is valid."""
    return _flat18(*range(18))


# ---------------------------------------------------------------------------
# Repro data from poses/misc/carrying.json
# ---------------------------------------------------------------------------

CARRYING_JSON = {
    "canvas_width": 512,
    "canvas_height": 768,
    "people": [
        {
            "pose_keypoints_2d": [
                242, 142, 1, 219, 218, 1, 154, 226, 1, 144, 258, 1, 0, 0, 0,
                282, 215, 1, 0, 0, 0, 373, 341, 1, 219, 462, 1, 228, 622, 1,
                217, 806, 1, 321, 445, 1, 335, 595, 1, 344, 769, 1, 210, 134, 1,
                246, 128, 1, 179, 152, 1, 0, 0, 0,
            ],
        },
        {
            "pose_keypoints_2d": [
                315, 168, 1, 361, 219, 1, 336, 226, 1, 0, 0, 0, 0, 0, 0,
                360, 230, 1, 265, 277, 1, 198, 235, 1, 277, 410, 1, 133, 328, 1,
                62, 498, 1, 277, 421, 1, 163, 313, 1, 118, 533, 1, 297, 160, 1,
                330, 148, 1, 0, 0, 0, 358, 150, 1,
            ],
        },
        {
            # Bogus fragment: only right-elbow (index 3) and right-wrist (index 4)
            # are non-zero.  Must NOT become a standalone pose.
            "pose_keypoints_2d": (
                [0, 0, 0] * 3          # indices 0-2
                + [173, 394, 1]        # index 3 (right elbow)
                + [183, 398, 1]        # index 4 (right wrist)
                + [0, 0, 0] * 13      # indices 5-17
            ),
        },
    ],
}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestMalformedMultiPersonImport(unittest.TestCase):

    # --- core repro ---

    def test_carrying_json_yields_exactly_two_poses(self):
        """Repro: carrying.json must produce 2 poses, not 3."""
        result = _normalize_pose_json(CARRYING_JSON)
        self.assertIsNotNone(result, "_normalize_pose_json must not return None")
        poses = result.get("poses", [])
        self.assertEqual(
            len(poses), 2,
            f"Expected 2 poses, got {len(poses)}. "
            "The bogus third entry (2 keypoints) must be discarded.",
        )

    # --- isolated fragment cases ---

    def test_person_with_one_keypoint_is_rejected(self):
        payload = {
            "canvas_width": 512, "canvas_height": 512,
            "people": [{"pose_keypoints_2d": _flat18(5)}],
        }
        result = _normalize_pose_json(payload)
        poses = result.get("poses", []) if result else []
        self.assertEqual(len(poses), 0, "1-keypoint entry must be rejected.")

    def test_person_with_two_keypoints_is_rejected(self):
        payload = {
            "canvas_width": 512, "canvas_height": 512,
            "people": [{"pose_keypoints_2d": _flat18(3, 4)}],
        }
        result = _normalize_pose_json(payload)
        poses = result.get("poses", []) if result else []
        self.assertEqual(len(poses), 0, "2-keypoint entry must be rejected.")

    # --- threshold boundary ---

    def test_person_at_threshold_is_accepted(self):
        """Exactly _MIN valid keypoints → kept."""
        flat = _flat18(*range(_MIN))
        payload = {
            "canvas_width": 512, "canvas_height": 512,
            "people": [{"pose_keypoints_2d": flat}],
        }
        result = _normalize_pose_json(payload)
        poses = result.get("poses", []) if result else []
        self.assertEqual(
            len(poses), 1,
            f"A person with exactly {_MIN} keypoints (the threshold) must be accepted.",
        )

    def test_person_below_threshold_is_rejected(self):
        """_MIN - 1 valid keypoints → discarded."""
        flat = _flat18(*range(_MIN - 1))
        payload = {
            "canvas_width": 512, "canvas_height": 512,
            "people": [{"pose_keypoints_2d": flat}],
        }
        result = _normalize_pose_json(payload)
        poses = result.get("poses", []) if result else []
        self.assertEqual(len(poses), 0, f"A person with {_MIN - 1} keypoints must be rejected.")

    # --- mixed valid + bogus ---

    def test_valid_person_retained_when_bogus_coexists(self):
        """One full person + one 2-keypoint fragment → only 1 pose kept."""
        payload = {
            "canvas_width": 512, "canvas_height": 512,
            "people": [
                {"pose_keypoints_2d": _full18()},
                {"pose_keypoints_2d": _flat18(3, 4)},
            ],
        }
        result = _normalize_pose_json(payload)
        poses = result.get("poses", []) if result else []
        self.assertEqual(len(poses), 1, "Only the valid person must survive.")

    def test_two_valid_persons_both_retained(self):
        """Two full persons, no bogus → both kept."""
        payload = {
            "canvas_width": 512, "canvas_height": 512,
            "people": [
                {"pose_keypoints_2d": _full18()},
                {"pose_keypoints_2d": _full18()},
            ],
        }
        result = _normalize_pose_json(payload)
        poses = result.get("poses", []) if result else []
        self.assertEqual(len(poses), 2, "Both valid persons must be kept.")


if __name__ == "__main__":
    unittest.main()
