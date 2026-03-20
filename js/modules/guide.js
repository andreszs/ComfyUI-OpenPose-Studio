import { t } from "./i18n.js";
import { registerModule } from "./index.js";
import { UiIcons } from "../ui-icons.js";

export function buildGuideOverlayHtml() {
  return `
    <div class="openpose-overlay openpose-guide-overlay" data-overlay="guide">
        <div class="openpose-overlay-card">
            <div class="openpose-overlay-content">
                <div class="openpose-guide-intro">${t("guide.intro")}</div>
                <div class="openpose-guide-list">
                    <div class="openpose-guide-row">
                        <div class="openpose-guide-title">\u{1F4C1} ${t("guide.section.where_put.title")}</div>
                        <p>${t("guide.section.where_put.body1")}</p>
                        <p>${t("guide.section.where_put.body2")}</p>
                    </div>
                    <div class="openpose-guide-row">
                        <div class="openpose-guide-title">\u{1F9FE} ${t("guide.section.collections.title")}</div>
                        <p>${t("guide.section.collections.body")}</p>
                        <p><a href="https://github.com/andreszs/comfyui-openpose-studio#pose-collection-json-formats" target="_blank" rel="noopener noreferrer">${t("guide.section.collections.link")}</a></p>
                    </div>
                    <div class="openpose-guide-row">
                        <div class="openpose-guide-title">\u{1F4BE} ${t("guide.section.import_export.title")}</div>
                        <p>${t("guide.section.import_export.body")}</p>
                    </div>
                </div>
                <div class="openpose-alert openpose-alert-info">
                    <div class="openpose-alert-icon">\u{2139}\u{FE0F}</div>
                    <div class="openpose-alert-body">${t("guide.info.auto_render_json")}</div>
                </div>
            </div>
        </div>
    </div>
`;
}

export function setupGuideOverlayStyles(container) {
    // Use same background as Pose Editor sidebars for consistency
    container.querySelectorAll(".openpose-guide-overlay .openpose-overlay-card").forEach((card) => {
        card.style.background = "var(--openpose-panel-bg-secondary)";
        card.style.border = "none";
        card.style.borderRadius = "var(--openpose-card-radius)";
        card.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.14)";
        card.style.padding = "16px";
    });

    // Note: Guide section title icons (folder, document, floppy) remain in full color

    container.querySelectorAll(".openpose-guide-list").forEach((list) => {
        list.style.display = "flex";
        list.style.flexDirection = "column";
        list.style.gap = "12px";
    });
    container.querySelectorAll(".openpose-guide-row").forEach((row) => {
        row.style.display = "flex";
        row.style.flexDirection = "column";
        row.style.gap = "6px";
        row.style.padding = "16px";
        row.style.border = "none";
        row.style.borderRadius = "var(--openpose-card-radius)";
        row.style.background = "linear-gradient(rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.035)), var(--openpose-panel-bg)";
        row.style.boxSizing = "border-box";
        row.style.boxShadow = "0 1px 2px rgba(0,0,0,0.2)";
    });

    container.querySelectorAll(".openpose-guide-row p").forEach((paragraph) => {
        paragraph.style.margin = "2px 0";
        paragraph.style.fontSize = "13px";
    });

    container.querySelectorAll(".openpose-guide-intro").forEach((note) => {
        note.style.fontSize = "12px";
        note.style.opacity = "0.85";
        note.style.color = "var(--openpose-text-muted)";
        note.style.marginBottom = "4px";
    });

    container.querySelectorAll(".openpose-guide-title").forEach((title) => {
        title.style.fontWeight = "600";
        title.style.fontSize = "15.5px";
        title.style.color = "var(--openpose-text)";
        title.style.marginTop = "0";
    });

    container.querySelectorAll(".openpose-guide-note").forEach((note) => {
        note.style.fontSize = "12px";
        note.style.opacity = "0.85";
        note.style.marginTop = "2px";
        note.style.color = "var(--openpose-text-muted)";
    });

    container.querySelectorAll(".openpose-guide-links").forEach((row) => {
        row.style.alignItems = "flex-start";
    });

    // Style the info alert
    container.querySelectorAll(".openpose-guide-overlay .openpose-alert").forEach((alert) => {
        alert.style.marginTop = "16px";
    });
}

export const guideOverlay = {
    id: "guide",
    buildUI: buildGuideOverlayHtml,
    applyStyles: setupGuideOverlayStyles,
    initUI: setupGuideOverlayStyles
};

registerModule({
    id: "guide",
    labelKey: "guide.summary.title",
    order: 30,
    slot: "overlay",
    buildUI: buildGuideOverlayHtml,
    initUI: (container) => guideOverlay.initUI(container),
    onActivate: ({ openpose }) => {
        if (!openpose) {
            return;
        }
        openpose.setCanvasAreaVisible(true);
        openpose.setSidebarsVisible(false);
        openpose.setOverlayPlaceholderWidths(false);
        openpose.setSidebarControlsDisabled(true);
        openpose.setBackgroundControlsEnabled(false);
    },
    summary: {
        icon: UiIcons.svg('book', { size: 14, className: 'openpose-sidebar-icon' }),
        titleKey: "guide.summary.title",
        descriptionKey: "guide.summary.description"
    }
});
