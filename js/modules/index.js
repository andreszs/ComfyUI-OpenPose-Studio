import { initI18n, t, onLangChange } from "./i18n.js";

const registry = [];

function setupOverlays(container, canvasWrapperEl) {
    const overlays = Array.from(container.querySelectorAll(".openpose-overlay"));
    const overlayMap = new Map(overlays.map((el) => [el.dataset.overlay || "", el]));
    let active = null;

    // Ensure openpose-main is the positioning context for overlays
    const mainLayout = container.querySelector(".openpose-main");
    if (mainLayout && !mainLayout.style.position) {
        mainLayout.style.position = "relative";
    }

    overlays.forEach((overlay) => {
        overlay.style.position = "absolute";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.right = "0";
        overlay.style.bottom = "0";
        overlay.style.display = "none";
        overlay.style.alignItems = "stretch";
        overlay.style.justifyContent = "stretch";
        overlay.style.background = "var(--openpose-panel-bg)";
        overlay.style.zIndex = "1001";
        overlay.style.pointerEvents = "auto";
        overlay.style.boxSizing = "border-box";
        overlay.style.padding = "10px";
    });

    container.querySelectorAll(".openpose-overlay-card").forEach((card) => {
        card.style.background = "var(--openpose-panel-bg)";
        card.style.border = "1px solid var(--openpose-border)";
        card.style.borderRadius = "6px";
        card.style.padding = "16px";
        card.style.display = "flex";
        card.style.flexDirection = "column";
        card.style.gap = "12px";
        card.style.color = "var(--openpose-text)";
        card.style.fontFamily = "Arial, sans-serif";
        card.style.fontSize = "13px";
        card.style.overflow = "auto";
        card.style.width = "100%";
        card.style.maxWidth = "none";
        card.style.margin = "0";
        card.style.boxSizing = "border-box";
    });

    container.querySelectorAll(".openpose-overlay-content").forEach((content) => {
        content.style.display = "flex";
        content.style.flexDirection = "column";
        content.style.gap = "10px";
        content.style.lineHeight = "1.4";
    });

    container.querySelectorAll(".openpose-overlay-content code").forEach((code) => {
        code.style.background = "var(--openpose-input-bg)";
        code.style.border = "1px solid var(--openpose-border)";
        code.style.borderRadius = "4px";
        code.style.padding = "2px 4px";
        code.style.fontFamily = "Consolas, monospace";
    });

    container.querySelectorAll(".openpose-overlay-content a").forEach((link) => {
        link.style.color = "";
    });

    const setCanvasVisible = (visible) => {
        if (!canvasWrapperEl) {
            return;
        }
        canvasWrapperEl.style.visibility = visible ? "visible" : "hidden";
    };

    const hideAll = () => {
        overlays.forEach((overlay) => {
            overlay.style.display = "none";
        });
        active = null;
        setCanvasVisible(true);
    };

    const setVisible = (name, visible = true) => {
        const overlay = overlayMap.get(name);
        if (!overlay) {
            return;
        }
        if (!visible) {
            if (active === name) {
                hideAll();
            }
            return;
        }
        overlays.forEach((el) => {
            el.style.display = el === overlay ? "flex" : "none";
        });
        active = name;
        setCanvasVisible(false);
    };

    const toggle = (name) => {
        if (active === name) {
            hideAll();
        } else {
            setVisible(name, true);
        }
    };

    container.querySelectorAll('[data-action="overlay-close"]').forEach((btn) => {
        btn.addEventListener("click", () => {
            hideAll();
        });
    });

    return {
        setVisible,
        toggle,
        hideAll,
        isActive: (name) => active === name,
    };
}

export function registerModule(moduleDef) {
    if (!moduleDef || typeof moduleDef.id !== "string") {
        return;
    }
    const existing = registry.find((mod) => mod.id === moduleDef.id);
    if (existing) {
        Object.assign(existing, moduleDef);
        return;
    }
    registry.push(moduleDef);
}

export function getModules() {
    return registry.slice();
}

async function loadOptionalModules() {
    await initI18n();
    const modulePaths = [
        "./merger.js",
        "./render.js",
        "./gallery.js",
        "./guide.js",
        "./about.js"
    ];
    const results = await Promise.allSettled(
        modulePaths.map((path) => import(path))
    );
    return results;
}

export function createModuleManager(container, openpose) {
    const state = {
        modules: [],
        moduleMap: new Map(),
        activeId: null,
        overlayController: null,
        mountedSlots: new Set()
    };

    const context = {
        container,
        openpose,
        manager: null
    };

    const manager = {
        init,
        activate,
        deactivateActive,
        handleKeyDown,
        notifyPresetsLoadStart,
        notifyPresetFileError,
        notifyPresetFileLoaded,
        decoratePreset,
        notifyPresetsLoaded,
        getTabSummaries,
        getEmptyActions,
        getModule: (id) => state.moduleMap.get(id),
        isActive: (id) => state.activeId === id,
        setOverlayVisible
    };

    context.manager = manager;

    async function init() {
        await loadOptionalModules();
        state.modules = getModules()
            .slice()
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        state.moduleMap = new Map(state.modules.map((mod) => [mod.id, mod]));
        mountModules();
        renderTabs();
        onLangChange(() => {
            renderTabs();
            const editorTab = container.querySelector('.openpose-tab[data-tab="editor"]');
            if (editorTab) editorTab.textContent = t("pose_editor.tab.editor");
        });
        state.overlayController = setupOverlays(container, openpose?.canvasElem);
        state.modules.forEach((mod) => {
            if (typeof mod.initUI === "function") {
                mod.initUI(container, openpose, manager);
            }
        });
        state.activeId = null;
        state.overlayController?.hideAll();
        state.modules.forEach((mod) => {
            if (state.activeId && mod.id === state.activeId) {
                return;
            }
            if (typeof mod.onDeactivate === "function") {
                mod.onDeactivate(context);
            }
        });
        return state.modules;
    }

    function mountModules() {
        state.modules.forEach((mod) => {
            if (!mod.slot || typeof mod.buildUI !== "function") {
                return;
            }
            const slot = container.querySelector(`[data-module-slot="${mod.slot}"]`);
            if (!slot) {
                return;
            }
            const slotKey = `${mod.slot}:${mod.id}`;
            if (state.mountedSlots.has(slotKey)) {
                return;
            }
            slot.insertAdjacentHTML("beforeend", mod.buildUI());
            state.mountedSlots.add(slotKey);
        });
    }

    function renderTabs() {
        const tabHost = container.querySelector(".openpose-tab-modules");
        if (!tabHost) {
            return;
        }
        tabHost.innerHTML = "";
        state.modules.forEach((mod) => {
            if (!mod.labelKey) {
                return;
            }
            const button = document.createElement("button");
            button.className = "openpose-tab";
            button.dataset.tab = mod.id;
            button.textContent = t(mod.labelKey);
            if (mod.title) {
                button.title = mod.title;
            }
            tabHost.appendChild(button);
        });
    }

    function activate(id) {
        if (!id) {
            return false;
        }
        if (state.activeId === id) {
            return true;
        }
        const next = state.moduleMap.get(id);
        if (!next) {
            state.overlayController?.hideAll();
            return false;
        }
        const prev = state.moduleMap.get(state.activeId);
        if (prev && typeof prev.onDeactivate === "function") {
            prev.onDeactivate(context);
        }
        state.activeId = id;
        if (next.slot === "overlay") {
            setOverlayVisible(id, true);
        } else {
            state.overlayController?.hideAll();
        }
        if (typeof next.onActivate === "function") {
            next.onActivate(context);
        }
        return true;
    }

    function deactivateActive() {
        const prev = state.moduleMap.get(state.activeId);
        if (prev && typeof prev.onDeactivate === "function") {
            prev.onDeactivate(context);
        }
        state.activeId = null;
        state.overlayController?.hideAll();
    }

    function setOverlayVisible(id, visible = true) {
        if (!state.overlayController) {
            return;
        }
        state.overlayController.setVisible(id, visible);
    }

    function handleKeyDown(event) {
        const mod = state.moduleMap.get(state.activeId);
        if (!mod || typeof mod.handleKeyDown !== "function") {
            return false;
        }
        return !!mod.handleKeyDown(event, context);
    }

    function notifyPresetsLoadStart() {
        state.modules.forEach((mod) => {
            if (typeof mod.onPresetsLoadStart === "function") {
                mod.onPresetsLoadStart(context);
            }
        });
    }

    function notifyPresetFileError(info) {
        state.modules.forEach((mod) => {
            if (typeof mod.onPresetFileError === "function") {
                mod.onPresetFileError(info, context);
            }
        });
    }

    function notifyPresetFileLoaded(info) {
        state.modules.forEach((mod) => {
            if (typeof mod.onPresetFileLoaded === "function") {
                mod.onPresetFileLoaded(info, context);
            }
        });
    }

    function decoratePreset(preset, info) {
        state.modules.forEach((mod) => {
            if (typeof mod.decoratePreset === "function") {
                mod.decoratePreset(preset, info, context);
            }
        });
    }

    function notifyPresetsLoaded(info) {
        state.modules.forEach((mod) => {
            if (typeof mod.onPresetsLoaded === "function") {
                mod.onPresetsLoaded(info, context);
            }
        });
    }

    function getTabSummaries() {
        return state.modules
            .filter((mod) => mod.summary)
            .map((mod) => ({
                id: mod.id,
                icon: mod.summary.icon,
                title: t(mod.summary.titleKey),
                description: t(mod.summary.descriptionKey)
            }));
    }

    function getEmptyActions() {
        return state.modules
            .filter((mod) => mod.emptyAction)
            .map((mod) => ({
                id: mod.id,
                icon: mod.emptyAction.icon,
                text: t(mod.emptyAction.textKey)
            }));
    }

    return manager;
}
