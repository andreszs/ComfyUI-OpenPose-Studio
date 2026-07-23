import { t } from "./i18n.js";
import { toRgba, showToast, showConfirm, getPersistedSetting, setPersistedSetting } from "../utils.js";
import { getFormatForPose } from "../formats/index.js";
import { registerModule } from "./index.js";
import { UiIcons } from "../ui-icons.js";

const GALLERY_VIEW_MODE_KEY = "openpose_editor.gallery.viewMode";
const GALLERY_VIEW_MODES = new Set(["medium", "large", "tiles"]);

function normalizeGallerySearch(value) {
    return String(value || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\\/g, "/")
        .toLowerCase()
        .trim();
}

function matchesGallerySearch(values, query) {
    const normalizedQuery = normalizeGallerySearch(query);
    if (!normalizedQuery) {
        return true;
    }
    const haystack = normalizeGallerySearch(values.filter(Boolean).join(" "));
    return normalizedQuery.split(/\s+/).every((token) => haystack.includes(token));
}

function isValidGalleryViewMode(mode) {
    return GALLERY_VIEW_MODES.has(mode);
}

function loadGalleryViewMode() {
    const stored = getPersistedSetting(GALLERY_VIEW_MODE_KEY, null);
    if (isValidGalleryViewMode(stored)) {
        return stored;
    }
    return null;
}

function storeGalleryViewMode(mode) {
    if (!isValidGalleryViewMode(mode)) {
        return false;
    }
    return setPersistedSetting(GALLERY_VIEW_MODE_KEY, mode);
}

// Utility function to count keypoints in face/hand groups
function countExtraKeypoints(groups) {
    if (!Array.isArray(groups)) return 0;
    let count = 0;
    for (const group of groups) {
        if (Array.isArray(group)) {
            for (const kp of group) {
                if (Array.isArray(kp)) count++;
            }
        }
    }
    return count;
}

function formatCanvasMetaSize(width, height) {
    const canvasWidth = Number(width);
    const canvasHeight = Number(height);
    if (
        Number.isFinite(canvasWidth) && canvasWidth > 0 &&
        Number.isFinite(canvasHeight) && canvasHeight > 0
    ) {
        return `Canvas: ${Math.round(canvasWidth)}\u00D7${Math.round(canvasHeight)}`;
    }
    return "Canvas: (unknown)";
}

function isStandardOpenPosePoseObject(payload) {
    if (!payload || typeof payload !== "object") {
        return false;
    }
    const canvasWidth = Number(payload.canvas_width);
    const canvasHeight = Number(payload.canvas_height);
    if (!Number.isFinite(canvasWidth) || canvasWidth <= 0 || !Number.isFinite(canvasHeight) || canvasHeight <= 0) {
        return false;
    }
    if (!Array.isArray(payload.people) || payload.people.length === 0) {
        return false;
    }
    for (const person of payload.people) {
        if (!person || typeof person !== "object") {
            return false;
        }
        if (!Array.isArray(person.pose_keypoints_2d) || person.pose_keypoints_2d.length === 0) {
            return false;
        }
        if (person.pose_keypoints_2d.length % 3 !== 0) {
            return false;
        }
    }
    return true;
}

function isStandardOpenPoseCollectionPayload(payload) {
    if (!payload || typeof payload !== "object") {
        return false;
    }
    const keys = Object.keys(payload);
    if (keys.length <= 1) {
        return false;
    }
    for (const key of keys) {
        if (!isStandardOpenPosePoseObject(payload[key])) {
            return false;
        }
    }
    return true;
}

/**
 * GalleryManager handles all Gallery tab logic.
 * It receives a reference to the OpenPose instance for accessing shared data.
 */
class GalleryManager {
    constructor(container, openposeInstance) {
        this.container = container;
        this.openpose = openposeInstance;
        this.galleryContainer = container.querySelector(".openpose-gallery-content");
        const storedViewMode = loadGalleryViewMode();
        this.viewMode = storedViewMode || "medium";
        if (!storedViewMode) {
            storeGalleryViewMode(this.viewMode);
        }
        this.collectionFiles = new Set();
        this.emptyPoseFiles = [];
        this.searchQuery = "";
        this.setViewMode(this.viewMode);
    }

    setSearchQuery(value) {
        const nextQuery = String(value || "").trim();
        if (nextQuery === this.searchQuery) {
            return;
        }
        this.searchQuery = nextQuery;
        this.refresh();
    }

    matchesPresetSearch(preset) {
        return matchesGallerySearch([
            preset?.displayFilename,
            preset?.sourceFile,
            preset?.galleryGroupTitle,
            preset?.library,
            preset?.label
        ], this.searchQuery);
    }

    updateStatsBadge(visiblePresets, totalPresets) {
        const statsBadge = this.container.querySelector(".openpose-gallery-stats-badge");
        if (!statsBadge) {
            return;
        }
        const sourceFiles = new Set(visiblePresets.map((preset) => preset.sourceFile).filter(Boolean));
        const libraries = new Set(visiblePresets.map((preset) => preset.library).filter(Boolean));
        const visibleCount = visiblePresets.length;
        const totalCount = totalPresets.length;
        const poseText = totalCount === 1 ? "pose" : "poses";
        const fileText = sourceFiles.size === 1 ? "file" : "files";
        const libraryText = libraries.size === 1 ? "library" : "libraries";
        const countText = this.searchQuery
            ? `${visibleCount} of ${totalCount} ${poseText}`
            : `${visibleCount} ${visibleCount === 1 ? "pose" : "poses"}`;
        statsBadge.textContent = `${countText} from ${sourceFiles.size} ${fileText} in ${libraries.size} ${libraryText}`;
    }

    setViewMode(mode) {
        const next = mode === "large" || mode === "tiles" ? mode : "medium";
        this.viewMode = next;
        storeGalleryViewMode(next);
        if (!this.galleryContainer) {
            return;
        }
        this.galleryContainer.classList.remove(
            "gallery-view--medium",
            "gallery-view--large",
            "gallery-view--tiles"
        );
        this.galleryContainer.classList.add(`gallery-view--${next}`);
    }

    getPreviewSize() {
        if (this.viewMode === "large") {
            return 280;
        }
        if (this.viewMode === "tiles") {
            return 120;
        }
        return 140;
    }

    getGroupTitle(sourceId, presets = []) {
        const formatGalleryTitle = (rawTitle, icon) => {
            if (!rawTitle || typeof rawTitle !== "string") {
                return rawTitle;
            }
            const separator = "▸";
            const formattedPath = rawTitle.split("/").join(` ${separator} `);
            if (icon) {
                return `${icon} ${formattedPath}`;
            }
            return formattedPath;
        };

        const explicitTitle = presets.find((preset) => preset?.galleryGroupTitle)?.galleryGroupTitle;
        if (explicitTitle) {
            return formatGalleryTitle(explicitTitle, "\u{1F4C1}");
        }

        const sourceFiles = [];
        for (const preset of presets) {
            if (preset?.sourceFile && typeof preset.sourceFile === "string") {
                sourceFiles.push(preset.sourceFile);
                continue;
            }
            if (!preset?.id || typeof preset.id !== "string") {
                continue;
            }
            const splitIndex = preset.id.indexOf(":");
            if (splitIndex === -1) {
                continue;
            }
            const filename = preset.id.slice(0, splitIndex);
            if (filename) {
                sourceFiles.push(filename);
            }
        }
        const uniqueFiles = Array.from(new Set(sourceFiles));
        if (uniqueFiles.length === 1) {
            const isCollection = presets.length > 1;
            return formatGalleryTitle(`poses/${uniqueFiles[0]}`, isCollection ? "🧾" : "");
        }
        if (uniqueFiles.length > 1) {
            const firstSlashIndex = uniqueFiles[0].lastIndexOf("/");
            const baseDir = firstSlashIndex === -1 ? "" : uniqueFiles[0].slice(0, firstSlashIndex);
            const sameDir = uniqueFiles.every((file) => {
                const slashIndex = file.lastIndexOf("/");
                const dir = slashIndex === -1 ? "" : file.slice(0, slashIndex);
                return dir === baseDir;
            });
            if (sameDir) {
                return formatGalleryTitle(baseDir ? `poses/${baseDir}` : "poses", "📁");
            }
            return formatGalleryTitle("poses", "📁");
        }
        if (!sourceId) {
            return "Default";
        }
        if (sourceId.startsWith("group:")) {
            const title = sourceId.slice("group:".length).trim();
            return title || "Default";
        }
        const base = sourceId.replace(/\.json$/i, "").replace(/^.*[/\\]/, "");
        return formatGalleryTitle(base.replace(/[_-]/g, " ").trim() || "Default");
    }

    renderEmpty(message) {
        if (!this.galleryContainer) {
            return;
        }
        this.galleryContainer.innerHTML = "";
        const empty = document.createElement("div");
        empty.className = "openpose-gallery-empty";
        empty.textContent = message;
        this.galleryContainer.appendChild(empty);
        galleryOverlay.applyStyles(this.container);
    }

    updateLibraryWarning() {
        const warning = this.container.querySelector(".openpose-gallery-library-warning");
        const list = warning?.querySelector(".openpose-gallery-library-warning-list");
        if (!warning || !list) {
            return;
        }
        const unavailable = Array.isArray(this.openpose.unavailablePoseLibraries)
            ? this.openpose.unavailablePoseLibraries
            : [];
        list.replaceChildren();
        for (const library of unavailable) {
            if (!library?.path) {
                continue;
            }
            const item = document.createElement("li");
            item.textContent = library.reason
                ? `${library.path} — ${library.reason}`
                : library.path;
            list.appendChild(item);
        }
        warning.style.display = list.childElementCount > 0 ? "flex" : "none";
    }

    refresh() {
        if (!this.galleryContainer) {
            return;
        }
        this.setViewMode(this.viewMode);
        this.updateLibraryWarning();

        const op = this.openpose;
        if (op.presetsLoading) {
            this.renderEmpty(t("gallery.state.loading"));
            return;
        }
        if (!op.presets || op.presets.length === 0) {
            this.renderEmpty(t("gallery.state.empty"));
            return;
        }
        const allGalleryPresets = op.presets.filter((preset) => op.getPresetSourceId(preset) !== "Default");
        const galleryPresets = allGalleryPresets.filter((preset) => this.matchesPresetSearch(preset));
        const filteredEmptyPoseFiles = (this.emptyPoseFiles || []).filter(({ filename }) => (
            matchesGallerySearch([filename], this.searchQuery)
        ));
        if (allGalleryPresets.length === 0 && this.emptyPoseFiles.length === 0) {
            this.renderEmpty("No presets available.");
            return;
        }
        if (galleryPresets.length === 0 && filteredEmptyPoseFiles.length === 0) {
            this.renderEmpty(`No poses match "${this.searchQuery}".`);
            this.updateStatsBadge([], allGalleryPresets);
            return;
        }
        this.galleryContainer.innerHTML = "";
        const groups = new Map();
        const order = [];
        const previewSize = this.getPreviewSize();

        for (const preset of galleryPresets) {
            const sourceId = preset.galleryGroupKey || op.getPresetSourceId(preset);
            if (!groups.has(sourceId)) {
                groups.set(sourceId, []);
                order.push(sourceId);
            }
            groups.get(sourceId).push(preset);
        }

        order.forEach((sourceId) => {
            const presets = groups.get(sourceId) || [];
            if (!presets.length) {
                return;
            }
            const section = document.createElement("div");
            section.className = "openpose-gallery-section";

            const title = document.createElement("div");
            title.className = "openpose-gallery-title";
            const titleText = document.createElement("span");
            titleText.className = "openpose-gallery-title-text";
            titleText.textContent = this.getGroupTitle(sourceId, presets);
            title.appendChild(titleText);
            const sourceFiles = new Set(presets.map((preset) => preset.sourceFile).filter(Boolean));
            const isSingleCollection = sourceFiles.size === 1
                && this.collectionFiles.has(Array.from(sourceFiles)[0]);
            if (isSingleCollection) {
                const badge = document.createElement("span");
                badge.className = "openpose-gallery-collection-pill";
                badge.textContent = t("gallery.badge.collection");
                title.appendChild(badge);
            }
            section.appendChild(title);

            const carousel = document.createElement("div");
            carousel.className = "openpose-gallery-carousel";

            presets.forEach((preset) => {
                const item = document.createElement("div");
                item.className = "openpose-gallery-item";
                item.title = preset.displayFilename || preset.sourceFile || "";
                if (preset.sourceFile) {
                    item.dataset.sourceFile = preset.sourceFile;
                }
                if (preset.library) {
                    item.dataset.library = preset.library;
                }
                const normalizedName = op.normalizePoseName(preset.label || preset.id || "Pose");
                const faceCount = countExtraKeypoints(preset.faceKeypoints);
                const leftHandCount = countExtraKeypoints(preset.handLeftKeypoints);
                const rightHandCount = countExtraKeypoints(preset.handRightKeypoints);

                // Calculate person count from keypoints
                let personCount = 1;
                if (Array.isArray(preset.keypoints) && preset.keypoints.length > 0) {
                    const detectedFormat = getFormatForPose(preset.keypoints);
                    const kpCount = detectedFormat && detectedFormat.keypoints ? detectedFormat.keypoints.length : 18;
                    personCount = Math.floor(preset.keypoints.length / kpCount);
                    if (personCount < 1) personCount = 1;
                }
                const personLabel = personCount === 1 ? "1 person" : `${personCount} persons`;

                const canvas = document.createElement("canvas");
                canvas.width = previewSize;
                canvas.height = previewSize;

                const label = document.createElement("div");
                label.className = "openpose-gallery-item-title";
                label.textContent = normalizedName;

                const meta = document.createElement("div");
                meta.className = "openpose-gallery-item-meta";
                const metaName = document.createElement("div");
                metaName.className = "openpose-gallery-item-meta-name";
                metaName.textContent = normalizedName;
                const metaSize = document.createElement("div");
                metaSize.className = "openpose-gallery-item-meta-size";
                metaSize.textContent = formatCanvasMetaSize(
                    preset.canvas_width ?? preset.width,
                    preset.canvas_height ?? preset.height
                );
                const metaPeople = document.createElement("div");
                metaPeople.className = "openpose-gallery-item-meta-people";
                metaPeople.textContent = personLabel;
                const metaKp = document.createElement("div");
                metaKp.className = "openpose-gallery-item-meta-kp";
                if (faceCount > 0 || leftHandCount > 0 || rightHandCount > 0) {
                    metaKp.classList.add("openpose-gallery-item-meta-kp-indicators");
                    const addIndicatorBadge = (icon, count, titleText) => {
                        const badge = document.createElement("div");
                        badge.className = "openpose-gallery-kp-badge openpose-gallery-kp-badge-counts";
                        badge.title = titleText;
                        const iconSpan = document.createElement("span");
                        iconSpan.className = "openpose-gallery-kp-icon";
                        iconSpan.textContent = icon;
                        const countSpan = document.createElement("span");
                        countSpan.className = "openpose-gallery-kp-count";
                        countSpan.textContent = String(count);
                        badge.appendChild(iconSpan);
                        badge.appendChild(countSpan);
                        metaKp.appendChild(badge);
                    };
                    if (faceCount > 0) {
                        addIndicatorBadge("\u{1F642}", faceCount, `Face: ${faceCount} keypoints`);
                    }
                    if (leftHandCount > 0) {
                        addIndicatorBadge("\u{1F91A}", leftHandCount, `Left hand: ${leftHandCount} keypoints`);
                    }
                    if (rightHandCount > 0) {
                        addIndicatorBadge("\u270B", rightHandCount, `Right hand: ${rightHandCount} keypoints`);
                    }
                } else {
                    metaKp.textContent = t("gallery.item.no_face_hands");
                }
                meta.appendChild(metaName);
                meta.appendChild(metaSize);
                meta.appendChild(metaPeople);
                meta.appendChild(metaKp);

                item.appendChild(canvas);
                item.appendChild(label);
                item.appendChild(meta);
                if (preset.galleryBadge === "nonstandard") {
                    const badge = document.createElement("div");
                    badge.className = "openpose-gallery-nonstandard";
                    badge.textContent = "!";
                    badge.title = "Non-Standard JSON File";
                    item.appendChild(badge);
                }

                op.renderPresetThumbnail(canvas, preset.keypoints, preset.canvas_width || preset.width, preset.canvas_height || preset.height);
                item.addEventListener("click", async () => {
                    const ok = await showConfirm("Confirm", "Add this pose to the canvas?");
                    if (!ok) {
                        return;
                    }
                    if (op.presetSelect) {
                        op.presetSelect.value = preset.id;
                        op.presetSelect.dispatchEvent(new Event("change", { bubbles: true }));
                    }
                    op.addPresetToCanvas(preset.id);
                    op.setActiveTab("editor");
                });

                carousel.appendChild(item);
            });

            section.appendChild(carousel);
            this.galleryContainer.appendChild(section);
        });

        // Render invalid files in a single "Invalid Files" category
        if (filteredEmptyPoseFiles.length > 0) {
            const section = document.createElement("div");
            section.className = "openpose-gallery-section";

            const title = document.createElement("div");
            title.className = "openpose-gallery-title";
            title.textContent = `\u{26A0}\u{FE0F} ${t("gallery.badge.invalid_files_strong")}`;
            section.appendChild(title);

            const carousel = document.createElement("div");
            carousel.className = "openpose-gallery-carousel";
            for (const { filename, reason } of filteredEmptyPoseFiles) {
                const item = document.createElement("div");
                item.className = "openpose-gallery-item";
                item.title = `${filename}: ${reason}`;

                const canvas = document.createElement("canvas");
                canvas.width = previewSize;
                canvas.height = previewSize;

                const label = document.createElement("div");
                label.className = "openpose-gallery-item-title";
                label.textContent = filename;

                const meta = document.createElement("div");
                meta.className = "openpose-gallery-item-meta";
                const metaName = document.createElement("div");
                metaName.className = "openpose-gallery-item-meta-name";
                metaName.textContent = filename;
                const metaSize = document.createElement("div");
                metaSize.className = "openpose-gallery-item-meta-size";
                metaSize.textContent = formatCanvasMetaSize(null, null);
                const metaInfo = document.createElement("div");
                metaInfo.className = "openpose-gallery-item-meta-kp";
                metaInfo.textContent = reason || "Invalid file";
                meta.appendChild(metaName);
                meta.appendChild(metaSize);
                meta.appendChild(metaInfo);

                item.appendChild(canvas);
                item.appendChild(label);
                item.appendChild(meta);

                // Render warning sign on canvas
                const ctx = canvas.getContext("2d");
                if (ctx) {
                    const previewSurface = op.getPreviewSurfaceFill();
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    if (previewSurface) {
                        ctx.fillStyle = previewSurface;
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                    }
                    ctx.fillStyle = "#FFD700";
                    ctx.font = "bold 80px Arial";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText("⚠️", canvas.width / 2, canvas.height / 2);
                }

                item.addEventListener("click", () => {
                    showToast("error", t("toast.invalid_pose_file_title"), `${filename}\n${reason}`);
                });

                carousel.appendChild(item);
            }

            section.appendChild(carousel);
            this.galleryContainer.appendChild(section);
        }

        galleryOverlay.applyStyles(this.container);
        this.updateStatsBadge(galleryPresets, allGalleryPresets);
    }

    refreshOnShow() {
        this.refresh();
    }
}

export function setupGalleryManager(container, openposeInstance) {
    return new GalleryManager(container, openposeInstance);
}

function setupGalleryControls(container, openposeInstance, galleryManager) {
    if (!container || !galleryManager) {
        return;
    }

    const searchInput = container.querySelector('[data-action="gallery-search"]');
    const clearSearch = container.querySelector('[data-action="gallery-search-clear"]');
    if (searchInput && clearSearch && !searchInput.dataset.gallerySearchReady) {
        searchInput.dataset.gallerySearchReady = "1";
        searchInput.value = galleryManager.searchQuery || "";
        let searchTimer = null;
        const updateClearButton = () => {
            clearSearch.hidden = searchInput.value.length === 0;
            clearSearch.style.display = clearSearch.hidden ? "none" : "inline-flex";
        };
        const applySearch = () => {
            searchTimer = null;
            galleryManager.setSearchQuery(searchInput.value);
        };
        searchInput.addEventListener("input", () => {
            updateClearButton();
            if (searchTimer !== null) {
                clearTimeout(searchTimer);
            }
            searchTimer = setTimeout(applySearch, 140);
        });
        searchInput.addEventListener("keydown", (event) => {
            if (event.key !== "Escape" || searchInput.value.length === 0) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (searchTimer !== null) {
                clearTimeout(searchTimer);
                searchTimer = null;
            }
            searchInput.value = "";
            updateClearButton();
            galleryManager.setSearchQuery("");
        });
        clearSearch.addEventListener("click", () => {
            if (searchTimer !== null) {
                clearTimeout(searchTimer);
                searchTimer = null;
            }
            searchInput.value = "";
            updateClearButton();
            galleryManager.setSearchQuery("");
            searchInput.focus();
        });
        updateClearButton();
    }

    const viewToggle = container.querySelector('[data-action="gallery-toggle-view-mode"]');
    if (viewToggle && !viewToggle.dataset.galleryViewReady) {
        viewToggle.dataset.galleryViewReady = "1";
        const viewOrder = ["medium", "large", "tiles"];
        const viewIcons = {
            medium: "\u{1F5BC}\u{FE0F}",
            large: "\u{1F5BC}\u{FE0F}",
            tiles: "\u{1FAAA}"
        };
        const viewLabels = {
            medium: t("gallery.overlay.view.medium"),
            large: t("gallery.view.large"),
            tiles: t("gallery.view.tiles")
        };
        const updateLabel = () => {
            const mode = galleryManager.viewMode || "medium";
            const icon = viewIcons[mode] || viewIcons.medium;
            viewToggle.textContent = `${icon} ${viewLabels[mode] || viewLabels.medium}`;
        };
        updateLabel();
        viewToggle.addEventListener("click", () => {
            const current = galleryManager.viewMode || "medium";
            const index = viewOrder.indexOf(current);
            const next = viewOrder[(index + 1) % viewOrder.length];
            galleryManager.setViewMode(next);
            updateLabel();
            if (openposeInstance?.activeTab === "gallery") {
                galleryManager.refresh();
            }
        });
    }
}

export const galleryOverlayHtml = `
    <div class="openpose-overlay openpose-gallery-overlay" data-overlay="gallery">
        <div class="openpose-overlay-card openpose-gallery-card">
            <div class="openpose-overlay-content openpose-gallery-wrapper">
                <div class="openpose-gallery-header">
                    <div class="openpose-gallery-note-row">
                        <div class="openpose-gallery-note">These poses are loaded from the configured pose libraries. Add JSON files to any configured library and reload to show them in the Gallery and Presets selector.</div>
                        <div class="openpose-gallery-actions">
                            <div class="openpose-gallery-search">
                                <input class="openpose-gallery-search-input openpose-gallery-header-ctrl" data-action="gallery-search" type="search" placeholder="Search filename or path…" aria-label="Search poses by filename or path" autocomplete="off" spellcheck="false" />
                                <button class="openpose-gallery-search-clear" data-action="gallery-search-clear" type="button" title="Clear search" aria-label="Clear gallery search" hidden>${UiIcons.svg('x', { size: 14, className: 'openpose-ui-icon' })}</button>
                            </div>
                            <span class="openpose-gallery-stats-badge openpose-gallery-header-ctrl">0 poses from 0 files in 0 libraries</span>
                            <button class="openpose-btn openpose-btn-small openpose-gallery-view-toggle openpose-gallery-header-ctrl" data-action="gallery-toggle-view-mode">View: Medium Icons</button>
                            <button class="openpose-btn openpose-btn-small openpose-refresh-btn openpose-gallery-header-ctrl" data-action="presets-reload" title="Reload presets">\u{1F504}</button>
                        </div>
                    </div>
                </div>
                <div class="openpose-alert openpose-alert-warning alert alert-warning openpose-gallery-library-warning" style="display: none;">
                    <span class="openpose-alert-icon">\u{26A0}\u{FE0F}</span>
                    <div class="openpose-alert-body">
                        <strong>${t("gallery.warning.unavailable_title")}</strong>
                        <p>${t("gallery.warning.unavailable_body")}</p>
                        <ul class="openpose-gallery-library-warning-list"></ul>
                    </div>
                </div>
                <div class="openpose-gallery-content"></div>
            </div>
        </div>
    </div>
`;

export function setupGalleryOverlayStyles(container) {
    const resolveTheme = () => {
        if (typeof window === "undefined") {
            return null;
        }
        if (typeof window.getComfyTheme === "function") {
            return window.getComfyTheme();
        }
        if (window.ComfyTheme && typeof window.ComfyTheme.getTheme === "function") {
            return window.ComfyTheme.getTheme();
        }
        return null;
    };

    const theme = resolveTheme();
    const themeColor = (key, cssVar) => (theme && theme[key] ? theme[key] : cssVar);
    const borderColor = "rgba(255,255,255,0.3)";

    const backgroundColor = themeColor("background", "var(--bg-color)");
    const headerText = themeColor("text", "var(--fg-color)");
    const overlayBg = toRgba(backgroundColor, 0.6) || backgroundColor;
    const tileHoverRing = toRgba(headerText, 0.2) || headerText;
    const captionText = borderColor;
    const captionHoverText = themeColor("text", "var(--fg-color)");
    const previewShadow = "0 1px 1px rgba(0,0,0,0.75)";

    // Gallery card: use same background as Pose Editor sidebars for consistency
    container.querySelectorAll(".openpose-gallery-card").forEach((card) => {
        card.style.overflow = "hidden";
        card.style.background = "var(--openpose-panel-bg-secondary)";
        card.style.border = "none";
        card.style.borderRadius = "var(--openpose-card-radius)";
        card.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.14)";
        card.style.padding = "16px";
    });

    // Gallery wrapper: flex column layout to separate header from content
    container.querySelectorAll(".openpose-gallery-wrapper").forEach((wrapper) => {
        wrapper.style.display = "flex";
        wrapper.style.flexDirection = "column";
        wrapper.style.height = "100%";
        wrapper.style.overflow = "hidden";
        wrapper.style.gap = "0";
    });

    // Gallery header: fixed at top, doesn't scroll
    container.querySelectorAll(".openpose-gallery-header").forEach((header) => {
        header.style.flex = "0 0 auto";
        header.style.paddingBottom = "10px";
    });

    container.querySelectorAll(".openpose-gallery-library-warning").forEach((warning) => {
        warning.style.alignItems = "flex-start";
        warning.style.marginBottom = "10px";
    });

    container.querySelectorAll(".openpose-gallery-library-warning-list").forEach((list) => {
        list.style.margin = "6px 0 0";
        list.style.paddingLeft = "20px";
    });

    // Unified sizing for all header controls (stats badge, view button, refresh button)
    container.querySelectorAll(".openpose-gallery-header-ctrl").forEach((ctrl) => {
        ctrl.style.display = "inline-flex";
        ctrl.style.alignItems = "center";
        ctrl.style.justifyContent = "center";
        ctrl.style.height = "26px";
        ctrl.style.minHeight = "26px";
        ctrl.style.maxHeight = "26px";
        ctrl.style.lineHeight = "1";
        ctrl.style.boxSizing = "border-box";
        ctrl.style.verticalAlign = "middle";
    });

    container.querySelectorAll(".openpose-gallery-overlay .openpose-btn").forEach((btn) => {
        btn.style.padding = "6px 12px";
        btn.style.border = "1px solid var(--openpose-border)";
        btn.style.borderRadius = "4px";
        btn.style.background = "var(--openpose-btn-bg)";
        btn.style.color = "var(--openpose-text)";
        btn.style.cursor = "pointer";
        btn.style.fontFamily = "Arial, sans-serif";
        btn.style.fontSize = "13px";
        if (!btn.dataset.hoverReady) {
            btn.dataset.hoverReady = "1";
            btn.addEventListener("mouseenter", () => {
                if (btn.disabled) {
                    return;
                }
                btn.style.background = "var(--openpose-btn-hover-bg)";
            });
            btn.addEventListener("mouseleave", () => {
                if (btn.disabled) {
                    return;
                }
                btn.style.background = "var(--openpose-btn-bg)";
            });
        }
    });

    container.querySelectorAll(".openpose-gallery-overlay .openpose-btn-small").forEach((btn) => {
        btn.style.padding = "0 10px";
        btn.style.fontSize = "12px";
        // height controlled by .openpose-gallery-header-ctrl when both classes present
    });

    container.querySelectorAll(".openpose-gallery-overlay .openpose-refresh-btn").forEach((btn) => {
        btn.style.padding = "0 8px";
        btn.style.minWidth = "26px";
        // height is controlled by .openpose-gallery-header-ctrl
    });

    container.querySelectorAll(".openpose-gallery-stats-badge").forEach((badge) => {
        // display, alignItems, height controlled by .openpose-gallery-header-ctrl
        badge.style.padding = "0 8px";
        badge.style.fontSize = "11px";
        badge.style.fontFamily = "Arial, sans-serif";
        badge.style.color = "var(--openpose-text-muted)";
        badge.style.background = "var(--openpose-input-bg)";
        badge.style.border = "1px solid var(--openpose-border)";
        badge.style.borderRadius = "4px";
        badge.style.whiteSpace = "nowrap";
    });

    container.querySelectorAll(".openpose-gallery-content").forEach((content) => {
        content.style.display = "flex";
        content.style.flexDirection = "column";
        content.style.gap = "0";
        // Make this the scrollable container
        content.style.flex = "1 1 auto";
        content.style.overflowY = "auto";
        content.style.minHeight = "0";
    });

    container.querySelectorAll(".openpose-gallery-note-row").forEach((row) => {
        row.style.display = "flex";
        row.style.alignItems = "flex-start";
        row.style.gap = "6px";
        row.style.marginBottom = "6px";
    });

    container.querySelectorAll(".openpose-gallery-actions").forEach((actions) => {
        actions.style.display = "flex";
        actions.style.alignItems = "center";
        actions.style.gap = "6px";
        actions.style.marginLeft = "auto";
        actions.style.flexShrink = "0";
    });

    container.querySelectorAll(".openpose-gallery-search").forEach((search) => {
        search.style.position = "relative";
        search.style.display = "flex";
        search.style.alignItems = "center";
        search.style.width = "240px";
        search.style.minWidth = "150px";
    });

    container.querySelectorAll(".openpose-gallery-search-input").forEach((input) => {
        input.style.width = "100%";
        input.style.padding = "0 30px 0 9px";
        input.style.border = "1px solid var(--openpose-border)";
        input.style.borderRadius = "4px";
        input.style.background = "var(--openpose-input-bg)";
        input.style.color = "var(--openpose-input-text)";
        input.style.fontFamily = "Arial, sans-serif";
        input.style.fontSize = "12px";
        input.style.outline = "none";
    });

    container.querySelectorAll(".openpose-gallery-search-clear").forEach((button) => {
        button.style.position = "absolute";
        button.style.right = "5px";
        button.style.top = "50%";
        button.style.width = "20px";
        button.style.height = "20px";
        button.style.padding = "3px";
        button.style.alignItems = "center";
        button.style.justifyContent = "center";
        button.style.transform = "translateY(-50%)";
        button.style.border = "0";
        button.style.borderRadius = "3px";
        button.style.background = "transparent";
        button.style.color = "var(--openpose-text-muted)";
        button.style.cursor = "pointer";
    });

    container.querySelectorAll(".openpose-gallery-note").forEach((note) => {
        note.style.fontSize = "12px";
        note.style.opacity = "0.85";
        note.style.color = "var(--openpose-text-muted)";
        note.style.flex = "1";
        note.style.marginBottom = "0";
    });

    container.querySelectorAll(".openpose-gallery-section").forEach((section) => {
        section.style.display = "flex";
        section.style.flexDirection = "column";
        section.style.gap = "8px";
        section.style.padding = "0";
        section.style.marginBottom = "20px";
        section.style.border = "none";
        section.style.borderRadius = "0";
        section.style.background = "transparent";
        section.style.boxShadow = "none";
        section.style.overflow = "visible";
    });

    container.querySelectorAll(".openpose-gallery-title").forEach((title) => {
        title.style.fontWeight = "600";
        title.style.fontSize = "13px";
        title.style.color = headerText;
        title.style.padding = "0 0 6px 0";
        title.style.display = "flex";
        title.style.alignItems = "center";
        title.style.gap = "8px";
        title.style.margin = "0";
        title.style.background = "transparent";
        title.style.width = "100%";
        title.style.boxSizing = "border-box";
        title.style.border = "none";
    });

    container.querySelectorAll(".openpose-gallery-title-text").forEach((text) => {
        text.style.flex = "1";
        text.style.minWidth = "0";
    });

    container.querySelectorAll(".openpose-gallery-collection-pill").forEach((badge) => {
        badge.style.marginLeft = "auto";
        badge.style.fontSize = "10px";
        badge.style.fontWeight = "600";
        badge.style.letterSpacing = "0.5px";
        badge.style.textTransform = "uppercase";
        badge.style.padding = "3px 8px";
        badge.style.borderRadius = "3px";
        badge.style.background = "var(--openpose-primary-bg)";
        badge.style.color = "var(--openpose-primary-text)";
        badge.style.pointerEvents = "none";
        badge.style.lineHeight = "1.2";
        badge.style.opacity = "0.8";
    });

    container.querySelectorAll(".openpose-gallery-carousel").forEach((carousel) => {
        // Base layout: grid for pose tiles
        carousel.style.display = "grid";
        carousel.style.gridTemplateColumns = "repeat(auto-fill, minmax(120px, 1fr))";
        carousel.style.gap = "10px";
        carousel.style.overflowX = "visible";
        // Apply exact Render-style card styling from .openpose-render-style-section
        carousel.style.padding = "16px";
        carousel.style.border = "none";
        carousel.style.borderRadius = "var(--openpose-card-radius)";
        carousel.style.background = "linear-gradient(rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.035)), var(--openpose-panel-bg)";
        carousel.style.boxSizing = "border-box";
        carousel.style.boxShadow = "0 1px 2px rgba(0,0,0,0.2)";
    });

    container.querySelectorAll(".openpose-gallery-item").forEach((item) => {
        item.style.display = "flex";
        item.style.flexDirection = "column";
        item.style.alignItems = "center";
        item.style.gap = "0";
        item.style.padding = "0";
        item.style.borderRadius = "8px";
        item.style.border = "none";
        item.style.background = "transparent";
        item.style.position = "relative";
        item.style.aspectRatio = "1 / 1";
        item.style.cursor = "pointer";
        item.style.minWidth = "0";
        item.style.width = "100%";
        item.style.boxSizing = "border-box";
        item.style.boxShadow = "none";
        item.style.transition = "box-shadow 0.15s ease, background 0.15s ease";
        if (!item.dataset.hoverReady) {
            item.dataset.hoverReady = "1";
            item.addEventListener("mouseenter", () => {
                item.style.background = "rgba(0,0,0,0.15)";
                item.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.14)";
                item.querySelectorAll(".openpose-gallery-nonstandard, .openpose-gallery-collection").forEach((b) => {
                    b.style.opacity = "1";
                });
            });
            item.addEventListener("mouseleave", () => {
                item.style.background = "transparent";
                item.style.boxShadow = "none";
                item.querySelectorAll(".openpose-gallery-nonstandard, .openpose-gallery-collection").forEach((b) => {
                    b.style.opacity = "0.45";
                });
            });
        }
    });

    container.querySelectorAll(".openpose-gallery-nonstandard").forEach((badge) => {
        badge.style.position = "absolute";
        badge.style.top = "6px";
        badge.style.right = "6px";
        badge.style.width = "18px";
        badge.style.height = "18px";
        badge.style.borderRadius = "999px";
        badge.style.display = "flex";
        badge.style.alignItems = "center";
        badge.style.justifyContent = "center";
        badge.style.background = "var(--openpose-error, #E74C3C)";
        badge.style.color = "#fff";
        badge.style.fontSize = "12px";
        badge.style.fontWeight = "700";
        badge.style.lineHeight = "1";
        badge.style.boxShadow = "0 1px 2px rgba(0,0,0,0.35)";
        badge.style.cursor = "pointer";
        badge.style.pointerEvents = "auto";
        badge.style.zIndex = "3";
        badge.style.opacity = "0.45";
        badge.style.transition = "opacity 0.15s ease";
    });

    container.querySelectorAll(".openpose-gallery-collection").forEach((badge) => {
        badge.style.position = "absolute";
        badge.style.top = "6px";
        badge.style.right = "6px";
        badge.style.width = "18px";
        badge.style.height = "18px";
        badge.style.borderRadius = "999px";
        badge.style.display = "flex";
        badge.style.alignItems = "center";
        badge.style.justifyContent = "center";
        badge.style.background = "var(--openpose-primary-bg, #2D8CFF)";
        badge.style.color = "var(--openpose-primary-text, #fff)";
        badge.style.fontSize = "11px";
        badge.style.fontWeight = "700";
        badge.style.lineHeight = "1";
        badge.style.boxShadow = "0 1px 2px rgba(0,0,0,0.35)";
        badge.style.cursor = "pointer";
        badge.style.pointerEvents = "auto";
        badge.style.zIndex = "3";
        badge.style.opacity = "0.45";
        badge.style.transition = "opacity 0.15s ease";
    });

    container.querySelectorAll(".openpose-gallery-kp-badge").forEach((badge) => {
        badge.style.position = "static";
        badge.style.width = "18px";
        badge.style.height = "18px";
        badge.style.borderRadius = "999px";
        badge.style.display = "flex";
        badge.style.alignItems = "center";
        badge.style.justifyContent = "center";
        badge.style.background = "var(--openpose-primary-bg, #2D8CFF)";
        badge.style.color = "var(--openpose-primary-text, #fff)";
        badge.style.fontSize = "11px";
        badge.style.fontWeight = "700";
        badge.style.lineHeight = "1";
        badge.style.boxShadow = "0 1px 2px rgba(0,0,0,0.35)";
        badge.style.cursor = "pointer";
        badge.style.pointerEvents = "auto";
        badge.style.zIndex = "3";
        badge.style.opacity = "1";
        badge.style.transition = "opacity 0.15s ease";
        if (badge.classList.contains("openpose-gallery-kp-badge-counts")) {
            badge.style.width = "auto";
            badge.style.minWidth = "18px";
            badge.style.padding = "0 5px";
            badge.style.gap = "3px";
        } else {
            badge.style.width = "18px";
            badge.style.padding = "0";
            badge.style.gap = "0";
        }
    });

    container.querySelectorAll(".openpose-gallery-item-meta-kp-indicators").forEach((row) => {
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.flexWrap = "wrap";
        row.style.gap = "4px";
        row.style.overflow = "visible";
        row.style.whiteSpace = "normal";
    });

    container.querySelectorAll(".openpose-gallery-kp-count").forEach((count) => {
        count.style.fontSize = "10px";
        count.style.fontWeight = "600";
        count.style.lineHeight = "1";
        count.style.display = "inline-flex";
        count.style.alignItems = "center";
    });

    container.querySelectorAll(".openpose-gallery-item-title").forEach((title) => {
        title.style.fontSize = "11px";
        title.style.color = captionText;
        title.style.textAlign = "center";
        title.style.maxWidth = "100%";
        title.style.whiteSpace = "nowrap";
        title.style.overflow = "hidden";
        title.style.textOverflow = "ellipsis";
        title.style.position = "absolute";
        title.style.left = "0";
        title.style.right = "0";
        title.style.bottom = "0";
        title.style.padding = "4px 6px";
        title.style.background = "transparent";
        title.style.boxSizing = "border-box";
        title.style.borderBottomLeftRadius = "8px";
        title.style.borderBottomRightRadius = "8px";
        if (!title.title) {
            title.title = title.textContent || "";
        }
    });

    container.querySelectorAll(".openpose-gallery-item").forEach((item) => {
        const title = item.querySelector(".openpose-gallery-item-title");
        if (!title) {
            return;
        }
        if (!item.dataset.captionHoverReady) {
            item.dataset.captionHoverReady = "1";
            item.addEventListener("mouseenter", () => {
                title.style.color = captionHoverText;
            });
            item.addEventListener("mouseleave", () => {
                title.style.color = captionText;
            });
        } else {
            title.style.color = captionText;
        }
    });

    container.querySelectorAll(".openpose-gallery-empty").forEach((empty) => {
        empty.style.fontSize = "12px";
        empty.style.opacity = "0.75";
        empty.style.color = "var(--openpose-text-muted)";
    });

    container.querySelectorAll(".openpose-gallery-item canvas").forEach((canvas) => {
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.borderRadius = "6px";
        canvas.style.background = "var(--openpose-canvas-bg)";
        canvas.style.border = "1px solid var(--openpose-canvas-border)";
        canvas.style.boxShadow = previewShadow;
        canvas.style.display = "block";
    });

    container.querySelectorAll(".openpose-gallery-warning").forEach((warning) => {
        warning.style.display = "flex";
        warning.style.flexDirection = "column";
        warning.style.alignItems = "center";
        warning.style.justifyContent = "center";
        warning.style.gap = "6px";
        warning.style.padding = "20px 16px";
        warning.style.fontSize = "13px";
        warning.style.color = "var(--openpose-text-muted)";
        warning.style.opacity = "0.85";
        warning.style.textAlign = "center";
    });

    container.querySelectorAll(".openpose-gallery-warning-reason").forEach((reason) => {
        reason.style.fontSize = "11px";
        reason.style.opacity = "0.7";
        reason.style.fontStyle = "italic";
    });

    if (!container.querySelector('style[data-openpose-gallery-view="1"]')) {
        const style = document.createElement("style");
        style.dataset.openposeGalleryView = "1";
        style.textContent = `
.openpose-gallery-content.gallery-view--large .openpose-gallery-carousel {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)) !important;
    gap: 12px !important;
}
.openpose-gallery-content.gallery-view--tiles .openpose-gallery-carousel {
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) !important;
    gap: 8px !important;
}
.openpose-gallery-content.gallery-view--tiles .openpose-gallery-item {
    aspect-ratio: auto !important;
    height: auto !important;
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 6px 8px !important;
}
.openpose-gallery-content.gallery-view--tiles .openpose-gallery-item-title {
    display: none !important;
}
.openpose-gallery-content.gallery-view--tiles .openpose-gallery-item canvas {
    width: 80px !important;
    height: 80px !important;
    flex: 0 0 auto !important;
}
.openpose-gallery-item-meta {
    display: none;
}
.openpose-gallery-content.gallery-view--tiles .openpose-gallery-item-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1 1 auto;
    justify-content: center;
}
.openpose-gallery-item-meta-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--openpose-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.openpose-gallery-item-meta-size,
.openpose-gallery-item-meta-people,
.openpose-gallery-item-meta-kp {
    font-size: 11px;
    color: var(--openpose-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.openpose-gallery-search-input::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
}
.openpose-gallery-search-input:focus {
    border-color: var(--openpose-primary-bg) !important;
    box-shadow: 0 0 0 1px var(--openpose-primary-bg);
}
.openpose-gallery-search-clear:hover,
.openpose-gallery-search-clear:focus-visible {
    background: var(--openpose-btn-hover-bg) !important;
    color: var(--openpose-text) !important;
    outline: none;
}
`;
        container.appendChild(style);
    }

    // Update gallery stats badge and collection badges
    updateGalleryBadges(container);
}

function updateGalleryBadges(container) {
    // Update stats badge with pose and file counts
    const statsBadge = container.querySelector(".openpose-gallery-stats-badge");
    if (statsBadge) {
        const items = container.querySelectorAll(".openpose-gallery-item[data-source-file]");
        const sourceFiles = new Set(Array.from(items, (item) => item.dataset.sourceFile).filter(Boolean));
        const libraries = new Set(Array.from(items, (item) => item.dataset.library).filter(Boolean));
        const poseCount = items.length;
        const fileCount = sourceFiles.size;
        const libraryCount = libraries.size;
        const libraryText = libraryCount === 1 ? "library" : "libraries";
        statsBadge.textContent = `${poseCount} poses from ${fileCount} files in ${libraryCount} ${libraryText}`;
    }

    // Update collection badges with pose counts
    container.querySelectorAll(".openpose-gallery-collection-pill").forEach((badge) => {
        const section = badge.closest(".openpose-gallery-section");
        if (section) {
            const itemCount = section.querySelectorAll(".openpose-gallery-item").length;
            badge.textContent = `COLLECTION \u00B7 ${itemCount} poses`;
        }
    });
}

export const galleryOverlay = {
    id: "gallery",
    buildUI: () => galleryOverlayHtml,
    applyStyles: setupGalleryOverlayStyles,
    initUI: setupGalleryOverlayStyles
};

const galleryState = {
    manager: null,
    fileMeta: new Map()
};

registerModule({
    id: "gallery",
    labelKey: "gallery.label",
    order: 10,
    slot: "overlay",
    buildUI: () => galleryOverlayHtml,
    initUI: (container, openpose) => {
        galleryState.manager = setupGalleryManager(container, openpose);
        galleryOverlay.initUI(container);
        setupGalleryControls(container, openpose, galleryState.manager);
    },
    onActivate: ({ openpose }) => {
        if (!openpose) {
            return;
        }
        openpose.setSidebarsVisible(false);
        openpose.setOverlayPlaceholderWidths(true);
        openpose.setCanvasAreaVisible(true);
        openpose.setSidebarControlsDisabled(true);
        openpose.setBackgroundControlsEnabled(false);
        galleryState.manager?.refresh();
    },
    onPresetsLoadStart: () => {
        galleryState.fileMeta.clear();
        if (galleryState.manager) {
            galleryState.manager.collectionFiles.clear();
            galleryState.manager.emptyPoseFiles = [];
        }
    },
    onPresetFileError: (info) => {
        if (galleryState.manager && info?.filename) {
            galleryState.manager.emptyPoseFiles.push({
                filename: info.displayFilename || info.filename,
                reason: info.reason || "Invalid file"
            });
        }
    },
    onPresetFileLoaded: (info) => {
        if (!info || !info.filename) {
            return;
        }
        const payload = info.payload;
        const isStandard = isStandardOpenPosePoseObject(payload);
        const isCollection = !isStandard && isStandardOpenPoseCollectionPayload(payload);
        const sourceFile = info.sourceFile || info.filename;
        if (galleryState.manager && isCollection) {
            galleryState.manager.collectionFiles.add(sourceFile);
        }
        const badge = isStandard ? null : (isCollection ? "collection" : "nonstandard");
        galleryState.fileMeta.set(sourceFile, { badge });
    },
    decoratePreset: (preset, info) => {
        if (!preset || !info?.filename) {
            return;
        }
        const sourceFile = info.sourceFile || info.filename;
        let meta = galleryState.fileMeta.get(sourceFile);
        if (!meta && info.payload) {
            const isStandard = isStandardOpenPosePoseObject(info.payload);
            const isCollection = !isStandard && isStandardOpenPoseCollectionPayload(info.payload);
            const badge = isStandard ? null : (isCollection ? "collection" : "nonstandard");
            meta = { badge };
            galleryState.fileMeta.set(sourceFile, meta);
            if (galleryState.manager && isCollection) {
                galleryState.manager.collectionFiles.add(sourceFile);
            }
        }
        if (meta && meta.badge) {
            preset.galleryBadge = meta.badge;
        }
    },
    onPresetsLoaded: (info, context) => {
        if (context?.manager?.isActive("gallery")) {
            galleryState.manager?.refresh();
        }
    },
    summary: {
        icon: UiIcons.svg('grid', { size: 14, className: 'openpose-sidebar-icon' }),
        titleKey: "gallery.label",
        descriptionKey: "gallery.summary.description"
    },
    emptyAction: {
        icon: UiIcons.svg('grid', { size: 14, className: 'openpose-sidebar-icon' }),
        textKey: "gallery.empty_action.text"
    }
});
