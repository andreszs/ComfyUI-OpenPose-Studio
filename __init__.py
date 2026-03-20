"""comfyui-openpose-studio – custom node registration and API routes."""

# ---------------------------------------------------------------------------
# Standard library
# ---------------------------------------------------------------------------
import json
import os

try:
    import tomllib                      # Python 3.11+
except ImportError:
    tomllib = None                      # Python 3.10 fallback path

# ---------------------------------------------------------------------------
# Third-party / ComfyUI
# ---------------------------------------------------------------------------
from aiohttp import web
from server import PromptServer

# ---------------------------------------------------------------------------
# Local
# ---------------------------------------------------------------------------
from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
WEB_DIRECTORY = "./js"

_PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))

POSES_DIR = os.path.join(_PLUGIN_DIR, "poses")
ASSETS_DIR = os.path.join(_PLUGIN_DIR, "assets")
LOCALES_DIR = os.path.join(_PLUGIN_DIR, "locales")
PAYPAL_QR_CODE_PATH = os.path.join(ASSETS_DIR, "qr-paypal.svg")
USDC_QR_CODE_PATH = os.path.join(ASSETS_DIR, "qr-usdc.svg")
BADGE_KOFI_PATH = os.path.join(ASSETS_DIR, "badge_kofi.svg")
BADGE_PAYPAL_PATH = os.path.join(ASSETS_DIR, "badge_paypal.svg")
BADGE_USDC_PATH = os.path.join(ASSETS_DIR, "badge_usdc.svg")
OPENPOSE_EDITOR_CSS_PATH = os.path.join(ASSETS_DIR, "openpose_editor.css")

_TOML_PATH = os.path.join(_PLUGIN_DIR, "pyproject.toml")
_FALLBACK_NAME = "comfyui-openpose-studio"
_FALLBACK_VERSION = "unknown"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _parse_toml_project(text):
    """Extract name and version from the [project] table via text parsing.

    Minimal fallback for environments where *tomllib* is not available
    (Python < 3.11).  Only handles simple ``key = "value"`` pairs.
    """
    name = None
    version = None
    in_project = False

    for line in text.splitlines():
        stripped = line.strip()

        if stripped.startswith("["):
            in_project = (stripped == "[project]")
            continue

        if not in_project or "=" not in stripped:
            continue

        key, _, value = stripped.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key == "name":
            name = value
        elif key == "version":
            version = value

        if name is not None and version is not None:
            break

    return name, version


def _read_project_metadata():
    """Read project name and version from *pyproject.toml*.

    Returns a ``(name, version)`` tuple.  Every code-path guarantees safe
    string defaults – this function never raises.
    """
    try:
        if not os.path.isfile(_TOML_PATH):
            return _FALLBACK_NAME, _FALLBACK_VERSION

        # Strategy 1: tomllib (Python 3.11+)
        if tomllib is not None:
            try:
                with open(_TOML_PATH, "rb") as fh:
                    data = tomllib.load(fh)
                project = data.get("project", {})
                return (
                    project.get("name", _FALLBACK_NAME),
                    project.get("version", _FALLBACK_VERSION),
                )
            except Exception:
                pass

        # Strategy 2: lightweight text parser (Python 3.10)
        try:
            with open(_TOML_PATH, "r", encoding="utf-8") as fh:
                text = fh.read()
            name, version = _parse_toml_project(text)
            return (
                name if name else _FALLBACK_NAME,
                version if version else _FALLBACK_VERSION,
            )
        except Exception:
            pass

    except Exception:
        pass

    return _FALLBACK_NAME, _FALLBACK_VERSION


def get_pose_files():
    """Get list of JSON files in the poses directory, including subdirectories."""
    if not os.path.isdir(POSES_DIR):
        return []

    files = []
    for root, _dirs, filenames in os.walk(POSES_DIR):
        rel_root = os.path.relpath(root, POSES_DIR)

        for filename in filenames:
            if filename.endswith(".json"):
                if rel_root == ".":
                    files.append(filename)
                else:
                    # Use forward slashes for URL compatibility
                    files.append(f"{rel_root}/{filename}".replace("\\", "/"))

    def sort_key(path):
        has_subdir = "/" in path
        return (has_subdir, path.lower())

    return sorted(files, key=sort_key)


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------
@PromptServer.instance.routes.get("/openpose/poses")
async def list_poses(request):
    """List available pose files."""
    files = get_pose_files()
    return web.json_response({"files": files})


@PromptServer.instance.routes.get("/openpose/poses/{filepath:.*}")
async def get_pose_file(request):
    """Return the contents of a specific pose file."""
    filepath = request.match_info.get("filepath", "")

    # Security: prevent directory traversal
    if ".." in filepath:
        return web.json_response({"error": "Invalid path"}, status=400)

    if not filepath.endswith(".json"):
        return web.json_response({"error": "Invalid file type"}, status=400)

    normalized_path = filepath.replace("/", os.sep)
    full_path = os.path.join(POSES_DIR, normalized_path)

    # Verify the resolved path is still within POSES_DIR
    real_poses_dir = os.path.realpath(POSES_DIR)
    real_file_path = os.path.realpath(full_path)
    if not real_file_path.startswith(real_poses_dir):
        return web.json_response({"error": "Invalid path"}, status=400)

    if not os.path.isfile(full_path):
        return web.json_response({"error": "File not found"}, status=404)

    try:
        with open(full_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return web.json_response(data)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.get("/openpose/locales/{lang}/ui.json")
async def get_ui_locale_file(request):
    """Serve UI locale dictionaries from locales/<lang>/ui.json."""
    lang = request.match_info.get("lang", "")

    # Security: language must be a single path segment (e.g. en, es, zh-TW)
    if not lang or ".." in lang or "/" in lang or "\\" in lang:
        return web.json_response({"error": "Invalid language"}, status=400)

    full_path = os.path.join(LOCALES_DIR, lang, "ui.json")

    # Verify the resolved path is still within LOCALES_DIR
    real_locales_dir = os.path.realpath(LOCALES_DIR)
    real_file_path = os.path.realpath(full_path)
    if not real_file_path.startswith(real_locales_dir):
        return web.json_response({"error": "Invalid path"}, status=400)

    if not os.path.isfile(full_path):
        return web.json_response({"error": "File not found"}, status=404)

    return web.FileResponse(full_path, headers={"Content-Type": "application/json; charset=utf-8"})


@PromptServer.instance.routes.get("/openpose/assets/qr-paypal.svg")
async def get_paypal_qr_code(request):
    """Serve the PayPal QR code SVG."""
    if not os.path.isfile(PAYPAL_QR_CODE_PATH):
        return web.json_response({"error": "QR code not found"}, status=404)
    return web.FileResponse(PAYPAL_QR_CODE_PATH, headers={"Content-Type": "image/svg+xml"})


@PromptServer.instance.routes.get("/openpose/assets/qr-usdc.svg")
async def get_usdc_qr_code(request):
    """Serve the USDC QR code SVG."""
    if not os.path.isfile(USDC_QR_CODE_PATH):
        return web.json_response({"error": "QR code not found"}, status=404)
    return web.FileResponse(USDC_QR_CODE_PATH, headers={"Content-Type": "image/svg+xml"})


@PromptServer.instance.routes.get("/openpose/assets/badge_kofi.svg")
async def get_badge_kofi(request):
    """Serve the Ko-fi donation badge SVG."""
    if not os.path.isfile(BADGE_KOFI_PATH):
        return web.json_response({"error": "Badge not found"}, status=404)
    return web.FileResponse(BADGE_KOFI_PATH, headers={"Content-Type": "image/svg+xml"})


@PromptServer.instance.routes.get("/openpose/assets/badge_paypal.svg")
async def get_badge_paypal(request):
    """Serve the PayPal donation badge SVG."""
    if not os.path.isfile(BADGE_PAYPAL_PATH):
        return web.json_response({"error": "Badge not found"}, status=404)
    return web.FileResponse(BADGE_PAYPAL_PATH, headers={"Content-Type": "image/svg+xml"})


@PromptServer.instance.routes.get("/openpose/assets/badge_usdc.svg")
async def get_badge_usdc(request):
    """Serve the USDC donation badge SVG."""
    if not os.path.isfile(BADGE_USDC_PATH):
        return web.json_response({"error": "Badge not found"}, status=404)
    return web.FileResponse(BADGE_USDC_PATH, headers={"Content-Type": "image/svg+xml"})


@PromptServer.instance.routes.get("/extensions/comfyui-openpose-studio/assets/openpose_editor.css")
async def get_openpose_editor_css(request):
    """Serve OpenPose Studio stylesheet from extension assets path."""
    if not os.path.isfile(OPENPOSE_EDITOR_CSS_PATH):
        return web.json_response({"error": "Stylesheet not found"}, status=404)
    return web.FileResponse(OPENPOSE_EDITOR_CSS_PATH, headers={"Content-Type": "text/css; charset=utf-8"})


@PromptServer.instance.routes.get("/openpose_editor/version")
async def openpose_editor_version(request):
    """Return the plugin name and version.

    Startup-safe: always returns a valid JSON response, never raises.
    """
    try:
        name, version = _read_project_metadata()
        return web.json_response({"name": name, "version": version})
    except Exception:
        return web.json_response({
            "name": _FALLBACK_NAME,
            "version": _FALLBACK_VERSION,
        })


# ---------------------------------------------------------------------------
# Plugin initialization message
# ---------------------------------------------------------------------------
_pose_files = get_pose_files()
_pose_count = len(_pose_files)
print(f"\033[92m[comfyui-openpose-studio] Loaded {_pose_count} JSON pose files successfully.\033[0m")
