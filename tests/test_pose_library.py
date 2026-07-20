"""Regression tests for configured OpenPose pose library roots."""

import asyncio
import importlib.util
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACKAGE_NAME = "openpose_studio_pose_library_test"


class _Routes:
    def get(self, _path):
        return lambda function: function

    def post(self, _path):
        return lambda function: function


folder_paths_mock = types.ModuleType("folder_paths")
folder_paths_mock.paths = []


def _add_model_folder_path(_folder_name, full_folder_path, is_default=False):
    paths = folder_paths_mock.paths
    if full_folder_path in paths:
        return
    if is_default:
        paths.insert(0, full_folder_path)
    else:
        paths.append(full_folder_path)


def _get_folder_paths(_folder_name):
    return folder_paths_mock.paths[:]


def _is_within_directory(directory, target):
    try:
        directory = os.path.realpath(directory)
        target = os.path.realpath(target)
        return os.path.commonpath((directory, target)) == directory
    except ValueError:
        return False


folder_paths_mock.add_model_folder_path = _add_model_folder_path
folder_paths_mock.get_folder_paths = _get_folder_paths
folder_paths_mock.is_within_directory = _is_within_directory

server_mock = types.ModuleType("server")
server_mock.PromptServer = types.SimpleNamespace(
    instance=types.SimpleNamespace(routes=_Routes())
)

nodes_mock = types.ModuleType(f"{PACKAGE_NAME}.nodes")
nodes_mock.NODE_CLASS_MAPPINGS = {}
nodes_mock.NODE_DISPLAY_NAME_MAPPINGS = {}
nodes_mock.set_runtime_render_style = lambda _payload: True

sys.modules["folder_paths"] = folder_paths_mock
sys.modules["server"] = server_mock
sys.modules[f"{PACKAGE_NAME}.nodes"] = nodes_mock

spec = importlib.util.spec_from_file_location(
    PACKAGE_NAME,
    ROOT / "__init__.py",
    submodule_search_locations=[str(ROOT)],
)
pose_library = importlib.util.module_from_spec(spec)
sys.modules[PACKAGE_NAME] = pose_library
spec.loader.exec_module(pose_library)


class PoseLibraryTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.temp_dir.name)
        self.builtin_dir = self.base_dir / "poses"
        self.external_dir = self.base_dir / "External Library"
        self.builtin_dir.mkdir()
        self.external_dir.mkdir()
        pose_library.POSES_DIR = str(self.builtin_dir)
        folder_paths_mock.paths = [str(self.builtin_dir), str(self.external_dir)]

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_json(self, path, payload=None):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload or {"people": []}), encoding="utf-8")

    def test_discovers_and_groups_nested_json_files_across_roots(self):
        self.write_json(self.builtin_dir / "root.json")
        self.write_json(self.builtin_dir / "misc" / "sitting.json")
        self.write_json(self.external_dir / "anime" / "female" / "Standing.JSON")
        (self.external_dir / "anime" / "female" / "notes.txt").write_text(
            "ignored",
            encoding="utf-8",
        )

        entries = pose_library.get_pose_files()

        self.assertEqual(
            entries,
            [
                {
                    "source": 0,
                    "library": "poses",
                    "path": "root.json",
                    "directory": "",
                    "filename": "root.json",
                },
                {
                    "source": 0,
                    "library": "poses",
                    "path": "misc/sitting.json",
                    "directory": "misc",
                    "filename": "sitting.json",
                },
                {
                    "source": 1,
                    "library": "External Library",
                    "path": "anime/female/Standing.JSON",
                    "directory": "anime/female",
                    "filename": "Standing.JSON",
                },
            ],
        )

    def test_duplicate_root_names_receive_distinct_library_labels(self):
        first = self.base_dir / "one" / "library"
        second = self.base_dir / "two" / "library"
        first.mkdir(parents=True)
        second.mkdir(parents=True)
        folder_paths_mock.paths = [str(self.builtin_dir), str(first), str(second)]

        roots = pose_library.get_pose_roots()

        self.assertEqual([root["name"] for root in roots], ["poses", "library", "library (2)"])

    def test_list_response_keeps_legacy_builtin_files_and_adds_entries(self):
        self.write_json(self.builtin_dir / "builtin.json")
        self.write_json(self.external_dir / "custom.json")

        response = asyncio.run(pose_library.list_poses(None))
        payload = json.loads(response.body)

        self.assertEqual(payload["files"], ["builtin.json"])
        self.assertEqual(len(payload["entries"]), 2)
        self.assertEqual(payload["entries"][1]["library"], "External Library")

    def test_file_endpoint_selects_source_and_blocks_traversal(self):
        target = self.external_dir / "nested" / "pose.json"
        self.write_json(target, {"canvas_width": 512, "people": []})
        outside = self.base_dir / "outside.json"
        self.write_json(outside)

        request = types.SimpleNamespace(
            match_info={"filepath": "nested/pose.json"},
            rel_url=types.SimpleNamespace(query={"source": "1"}),
        )
        response = asyncio.run(pose_library.get_pose_file(request))

        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(response.body)["canvas_width"], 512)

        traversal_request = types.SimpleNamespace(
            match_info={"filepath": "../outside.json"},
            rel_url=types.SimpleNamespace(query={"source": "1"}),
        )
        traversal_response = asyncio.run(pose_library.get_pose_file(traversal_request))

        self.assertEqual(traversal_response.status, 400)


if __name__ == "__main__":
    unittest.main()
