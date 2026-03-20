import { t } from "./i18n.js";
import { registerModule } from "./index.js";
import { applySidebarButtonStyles } from "../utils.js";
import { getFormat, DEFAULT_FORMAT_ID } from "../formats/index.js";
import { getPersistedJSON, setPersistedJSON } from "../utils.js";
import { UiIcons } from "../ui-icons.js";

const RENDER_STYLE_STORAGE_KEY = "render_style";
const RENDER_STYLE_VERSION = 1;

const RENDER_STYLE_KEYS = {
	version: "comfyui_openpose_editor.renderer.version",
	body: {
		lineWidth: "comfyui_openpose_editor.renderer.body.line_width",
		keypointColor: "comfyui_openpose_editor.renderer.body.keypoint_color",
		keypointRadius: "comfyui_openpose_editor.renderer.body.keypoint_radius"
	},
	hands: {
		lineWidth: "comfyui_openpose_editor.renderer.hands.line_width",
		keypointColor: "comfyui_openpose_editor.renderer.hands.keypoint_color",
		keypointRadius: "comfyui_openpose_editor.renderer.hands.keypoint_radius"
	},
	face: {
		lineWidth: "comfyui_openpose_editor.renderer.face.line_width",
		keypointColor: "comfyui_openpose_editor.renderer.face.keypoint_color",
		keypointRadius: "comfyui_openpose_editor.renderer.face.keypoint_radius"
	}
};

const LINE_WIDTH_RANGE = { min: 0, max: 12 };
const KEYPOINT_RADIUS_RANGE = { min: 0, max: 24 };

export function buildRenderStylePanelHtml() {
  return `
<div class="openpose-overlay openpose-render-style-overlay" data-overlay="render-style">
		<div class="openpose-overlay-card openpose-render-style-card">
			<div class="openpose-overlay-content openpose-render-style-content">
				<div class="openpose-render-style-header">
					<div class="openpose-render-style-intro">${t("render_style.intro")}</div>
					<div class="openpose-render-style-actions">
						<button class="openpose-btn openpose-render-style-reset" data-action="render-style-reset" disabled>\u{267B}\u{FE0F} ${t("render_style.btn.reset")}</button>
					</div>
				</div>
				<div class="openpose-render-style-controls-wrapper">
					<div class="openpose-render-style-sections">
						<div class="openpose-render-style-section" data-render-section="body">
							<div class="openpose-render-style-section-title">${t("render_style.section.body")}</div>
						<div class="openpose-render-style-grid">
							<label class="openpose-render-style-label">${t("render_style.field.line_width")}</label>
							<div class="openpose-render-style-input-row"><input class="openpose-input openpose-render-style-number" type="number" min="0" max="12" step="1" data-render-field="line_width" disabled /><span class="openpose-render-style-unit">${t("render_style.unit.px")}</span></div>
							<label class="openpose-render-style-label">${t("render_style.field.keypoint_radius")}</label>
							<div class="openpose-render-style-input-row"><input class="openpose-input openpose-render-style-number" type="number" min="0" max="24" step="1" data-render-field="keypoint_radius" /><span class="openpose-render-style-unit">${t("render_style.unit.px")}</span></div>
						</div>
					</div>
					<div class="openpose-render-style-section" data-render-section="hands">
						<div class="openpose-render-style-section-title">${t("render_style.section.hands")}</div>
						<div class="openpose-render-style-grid">
							<label class="openpose-render-style-label">${t("render_style.field.line_width")}</label>
							<div class="openpose-render-style-input-row"><input class="openpose-input openpose-render-style-number" type="number" min="0" max="12" step="1" data-render-field="line_width" disabled /><span class="openpose-render-style-unit">${t("render_style.unit.px")}</span></div>
							<label class="openpose-render-style-label">${t("render_style.field.keypoint_radius")}</label>
							<div class="openpose-render-style-input-row"><input class="openpose-input openpose-render-style-number" type="number" min="0" max="24" step="1" data-render-field="keypoint_radius" /><span class="openpose-render-style-unit">${t("render_style.unit.px")}</span></div>
							<label class="openpose-render-style-label">${t("render_style.field.keypoint_color")}</label>
							<div class="openpose-render-style-color-row">
								<input class="openpose-render-style-color" type="color" data-render-field="color_picker" disabled />
								<div class="openpose-render-style-channel">
									<span class="openpose-render-style-channel-label">R</span>
									<input class="openpose-input openpose-render-style-channel-input" type="number" min="0" max="255" step="1" data-render-channel="r" disabled />
								</div>
								<div class="openpose-render-style-channel">
									<span class="openpose-render-style-channel-label">G</span>
									<input class="openpose-input openpose-render-style-channel-input" type="number" min="0" max="255" step="1" data-render-channel="g" disabled />
								</div>
								<div class="openpose-render-style-channel">
									<span class="openpose-render-style-channel-label">B</span>
									<input class="openpose-input openpose-render-style-channel-input" type="number" min="0" max="255" step="1" data-render-channel="b" disabled />
								</div>
								<div class="openpose-render-style-channel">
									<span class="openpose-render-style-channel-label">A</span>
									<input class="openpose-input openpose-render-style-channel-input" type="number" min="0" max="255" step="1" data-render-channel="a" disabled />
								</div>
							</div>
						</div>
					</div>
					<div class="openpose-render-style-section" data-render-section="face">
						<div class="openpose-render-style-section-title">${t("render_style.section.face")}</div>
						<div class="openpose-render-style-grid">
							<label class="openpose-render-style-label">${t("render_style.field.line_width")}</label>
							<div class="openpose-render-style-input-row"><input class="openpose-input openpose-render-style-number" type="number" min="0" max="12" step="1" data-render-field="line_width" disabled /><span class="openpose-render-style-unit">${t("render_style.unit.px")}</span></div>
							<label class="openpose-render-style-label">${t("render_style.field.keypoint_radius")}</label>
							<div class="openpose-render-style-input-row"><input class="openpose-input openpose-render-style-number" type="number" min="0" max="24" step="1" data-render-field="keypoint_radius" /><span class="openpose-render-style-unit">${t("render_style.unit.px")}</span></div>
							<label class="openpose-render-style-label">${t("render_style.field.keypoint_color")}</label>
							<div class="openpose-render-style-color-row">
								<input class="openpose-render-style-color" type="color" data-render-field="color_picker" disabled />
								<div class="openpose-render-style-channel">
									<span class="openpose-render-style-channel-label">R</span>
									<input class="openpose-input openpose-render-style-channel-input" type="number" min="0" max="255" step="1" data-render-channel="r" disabled />
								</div>
								<div class="openpose-render-style-channel">
									<span class="openpose-render-style-channel-label">G</span>
									<input class="openpose-input openpose-render-style-channel-input" type="number" min="0" max="255" step="1" data-render-channel="g" disabled />
								</div>
								<div class="openpose-render-style-channel">
									<span class="openpose-render-style-channel-label">B</span>
									<input class="openpose-input openpose-render-style-channel-input" type="number" min="0" max="255" step="1" data-render-channel="b" disabled />
								</div>
								<div class="openpose-render-style-channel">
									<span class="openpose-render-style-channel-label">A</span>
									<input class="openpose-input openpose-render-style-channel-input" type="number" min="0" max="255" step="1" data-render-channel="a" disabled />
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
			<div class="openpose-alert openpose-alert-warning">
				<div class="openpose-alert-icon">⚠️</div>
				<div class="openpose-alert-body">
					<p>${t("feature.not_available_yet")}</p>
				</div>
			</div>
		</div>
	</div>
</div>
`;
}

function clampNumber(value, min, max, fallback) {
	const num = Number(value);
	if (!Number.isFinite(num)) {
		return fallback;
	}
	return Math.min(max, Math.max(min, num));
}

function normalizeColorArray(value, fallback) {
	const source = Array.isArray(value) ? value : [];
	const base = Array.isArray(fallback) ? fallback : [0, 0, 0, 255];
	const output = [];
	for (let i = 0; i < 4; i += 1) {
		const fallbackValue = Number.isFinite(base[i]) ? base[i] : (i === 3 ? 255 : 0);
		const candidate = Number.isFinite(Number(source[i])) ? Number(source[i]) : fallbackValue;
		output.push(clampNumber(candidate, 0, 255, fallbackValue));
	}
	return output;
}

function normalizeSectionSettings(payload, defaults, keyMap) {
	const rawLineWidth = payload[keyMap.lineWidth];
	const rawKeypointRadius = payload[keyMap.keypointRadius];
	return {
		lineWidth: Math.round(clampNumber(rawLineWidth, LINE_WIDTH_RANGE.min, LINE_WIDTH_RANGE.max, defaults.lineWidth)),
		keypointColor: normalizeColorArray(payload[keyMap.keypointColor], defaults.keypointColor),
		keypointRadius: Math.round(clampNumber(rawKeypointRadius, KEYPOINT_RADIUS_RANGE.min, KEYPOINT_RADIUS_RANGE.max, defaults.keypointRadius))
	};
}

function buildPayload(settings) {
	return {
		[RENDER_STYLE_KEYS.version]: settings.version,
		[RENDER_STYLE_KEYS.body.lineWidth]: settings.body.lineWidth,
		[RENDER_STYLE_KEYS.body.keypointColor]: settings.body.keypointColor.slice(),
		[RENDER_STYLE_KEYS.body.keypointRadius]: settings.body.keypointRadius,
		[RENDER_STYLE_KEYS.hands.lineWidth]: settings.hands.lineWidth,
		[RENDER_STYLE_KEYS.hands.keypointColor]: settings.hands.keypointColor.slice(),
		[RENDER_STYLE_KEYS.hands.keypointRadius]: settings.hands.keypointRadius,
		[RENDER_STYLE_KEYS.face.lineWidth]: settings.face.lineWidth,
		[RENDER_STYLE_KEYS.face.keypointColor]: settings.face.keypointColor.slice(),
		[RENDER_STYLE_KEYS.face.keypointRadius]: settings.face.keypointRadius
	};
}

function buildDefaultSettings(openpose) {
	const renderer = openpose?.renderer;
	const format = getFormat(renderer?.activeFormatId || DEFAULT_FORMAT_ID) || getFormat(DEFAULT_FORMAT_ID);
	const bodyColor = (format?.keypointColors && format.keypointColors[0]) || format?.keypoints?.[0]?.rgb || [255, 0, 0];
	return {
		version: RENDER_STYLE_VERSION,
		body: {
			lineWidth: Number.isFinite(renderer?.lineWidth) ? renderer.lineWidth : 10,
			keypointColor: normalizeColorArray(bodyColor, [255, 0, 0, 255]),
			keypointRadius: Number.isFinite(renderer?.keypointRadius) ? renderer.keypointRadius : 5
		},
		hands: {
			lineWidth: Number.isFinite(renderer?.handLineWidth) ? renderer.handLineWidth : 3,
			keypointColor: [0, 0, 255, 255],
			keypointRadius: Number.isFinite(renderer?.keypointRadius) ? renderer.keypointRadius : 5
		},
		face: {
			lineWidth: 1,
			keypointColor: [255, 255, 255, 255],
			keypointRadius: Number.isFinite(renderer?.faceKeypointRadius) ? renderer.faceKeypointRadius : 2
		}
	};
}

function buildSettingsFromPayload(payload, defaults) {
	const safePayload = payload && typeof payload === "object" ? payload : {};
	return {
		version: clampNumber(safePayload[RENDER_STYLE_KEYS.version], 1, 9999, defaults.version),
		body: normalizeSectionSettings(safePayload, defaults.body, RENDER_STYLE_KEYS.body),
		hands: normalizeSectionSettings(safePayload, defaults.hands, RENDER_STYLE_KEYS.hands),
		face: normalizeSectionSettings(safePayload, defaults.face, RENDER_STYLE_KEYS.face)
	};
}

function rgbToHex(color) {
	if (!Array.isArray(color) || color.length < 3) {
		return "#000000";
	}
	const toHex = (value) => clampNumber(value, 0, 255, 0).toString(16).padStart(2, "0");
	return `#${toHex(color[0])}${toHex(color[1])}${toHex(color[2])}`;
}

function hexToRgb(hex) {
	if (typeof hex !== "string") {
		return null;
	}
	const value = hex.trim().replace("#", "");
	if (value.length !== 6) {
		return null;
	}
	const r = parseInt(value.slice(0, 2), 16);
	const g = parseInt(value.slice(2, 4), 16);
	const b = parseInt(value.slice(4, 6), 16);
	if (![r, g, b].every((channel) => Number.isFinite(channel))) {
		return null;
	}
	return [r, g, b];
}

const renderStyleState = {
	panel: null,
	openpose: null,
	defaults: null,
	settings: null,
	payload: null,
	controls: null,
	isUpdating: false
};

function setRenderStyleState(settings) {
	renderStyleState.settings = settings;
	renderStyleState.payload = buildPayload(settings);
	setPersistedJSON(RENDER_STYLE_STORAGE_KEY, renderStyleState.payload);
	if (renderStyleState.openpose) {
		renderStyleState.openpose.renderStyleSettings = settings;
		renderStyleState.openpose.renderStylePayload = renderStyleState.payload;
	}
}

function updateColorControls(section, color) {
	const controls = renderStyleState.controls?.[section];
	if (!controls) {
		return;
	}
	if (controls.colorInput) {
		controls.colorInput.value = rgbToHex(color);
	}
	if (controls.channelInputs) {
		if (controls.channelInputs.r) {
			controls.channelInputs.r.value = color[0];
		}
		if (controls.channelInputs.g) {
			controls.channelInputs.g.value = color[1];
		}
		if (controls.channelInputs.b) {
			controls.channelInputs.b.value = color[2];
		}
		if (controls.channelInputs.a) {
			controls.channelInputs.a.value = color[3];
		}
	}
}

function updateNumberInput(input, value) {
	if (!input) {
		return;
	}
	input.value = `${value}`;
}

function applySettingsToUI(settings) {
	const sections = ["body", "hands", "face"];
	sections.forEach((section) => {
		const controls = renderStyleState.controls?.[section];
		if (!controls) {
			return;
		}
		updateNumberInput(controls.lineWidthInput, settings[section].lineWidth);
		updateNumberInput(controls.keypointRadiusInput, settings[section].keypointRadius);
		updateColorControls(section, settings[section].keypointColor);
	});
}

function buildSectionControls(sectionEl) {
	if (!sectionEl) {
		return null;
	}
	const channelInputs = {
		r: sectionEl.querySelector('[data-render-channel="r"]'),
		g: sectionEl.querySelector('[data-render-channel="g"]'),
		b: sectionEl.querySelector('[data-render-channel="b"]'),
		a: sectionEl.querySelector('[data-render-channel="a"]')
	};
	return {
		lineWidthInput: sectionEl.querySelector('[data-render-field="line_width"]'),
		keypointRadiusInput: sectionEl.querySelector('[data-render-field="keypoint_radius"]'),
		colorInput: sectionEl.querySelector('[data-render-field="color_picker"]'),
		channelInputs
	};
}

function handleNumberChange(section, field, value, inputEl) {
	if (renderStyleState.isUpdating) {
		return;
	}
	const num = Number(value);
	if (!Number.isFinite(num)) {
		return;
	}
	const settings = renderStyleState.settings;
	if (!settings || !settings[section]) {
		return;
	}
	const range = field === "keypointRadius" ? KEYPOINT_RADIUS_RANGE : LINE_WIDTH_RANGE;
	const rounded = Math.round(num);
	const clamped = clampNumber(rounded, range.min, range.max, settings[section][field]);
	renderStyleState.isUpdating = true;
	settings[section][field] = clamped;
	updateNumberInput(inputEl, clamped);
	setRenderStyleState(settings);
	renderStyleState.isUpdating = false;
}

function handleColorChange(section, nextColor) {
	if (renderStyleState.isUpdating) {
		return;
	}
	const settings = renderStyleState.settings;
	if (!settings || !settings[section]) {
		return;
	}
	renderStyleState.isUpdating = true;
	settings[section].keypointColor = normalizeColorArray(nextColor, settings[section].keypointColor);
	updateColorControls(section, settings[section].keypointColor);
	setRenderStyleState(settings);
	renderStyleState.isUpdating = false;
}

function bindSectionHandlers(section, controls) {
	if (!controls) {
		return;
	}
	controls.lineWidthInput?.addEventListener("change", (event) => {
		handleNumberChange(section, "lineWidth", event.target.value, controls.lineWidthInput);
	});
	controls.keypointRadiusInput?.addEventListener("change", (event) => {
		handleNumberChange(section, "keypointRadius", event.target.value, controls.keypointRadiusInput);
	});
	controls.colorInput?.addEventListener("input", (event) => {
		const rgb = hexToRgb(event.target.value);
		if (!rgb) {
			return;
		}
		const current = renderStyleState.settings?.[section]?.keypointColor || [0, 0, 0, 255];
		handleColorChange(section, [rgb[0], rgb[1], rgb[2], current[3]]);
	});
	Object.entries(controls.channelInputs || {}).forEach(([channel, input]) => {
		input?.addEventListener("change", (event) => {
			const current = renderStyleState.settings?.[section]?.keypointColor || [0, 0, 0, 255];
			const next = current.slice();
			const indexMap = { r: 0, g: 1, b: 2, a: 3 };
			const channelIndex = indexMap[channel];
			const value = Number(event.target.value);
			if (!Number.isFinite(value)) {
				return;
			}
			next[channelIndex] = value;
			handleColorChange(section, next);
		});
	});
}

function setupRenderStylePanel(container, openpose) {
	const panel = container.querySelector(".openpose-overlay.openpose-render-style-overlay");
	renderStyleState.panel = panel;
	renderStyleState.openpose = openpose || null;
	renderStyleState.defaults = buildDefaultSettings(openpose);
	const stored = getPersistedJSON(RENDER_STYLE_STORAGE_KEY, null);
	const settings = buildSettingsFromPayload(stored, renderStyleState.defaults);
	renderStyleState.controls = {
		body: buildSectionControls(panel?.querySelector('[data-render-section="body"]')),
		hands: buildSectionControls(panel?.querySelector('[data-render-section="hands"]')),
		face: buildSectionControls(panel?.querySelector('[data-render-section="face"]'))
	};
	setRenderStyleState(settings);
	renderStyleState.isUpdating = true;
	applySettingsToUI(settings);
	renderStyleState.isUpdating = false;
	Object.entries(renderStyleState.controls || {}).forEach(([section, controls]) => {
		bindSectionHandlers(section, controls);
	});

	const resetButton = panel?.querySelector('[data-action="render-style-reset"]');
	if (resetButton && !resetButton.dataset.renderStyleResetReady) {
		resetButton.dataset.renderStyleResetReady = "1";
		resetButton.addEventListener("click", () => {
			const defaults = buildDefaultSettings(openpose);
			renderStyleState.defaults = defaults;
			renderStyleState.isUpdating = true;
			applySettingsToUI(defaults);
			renderStyleState.isUpdating = false;
			setRenderStyleState(defaults);
		});
	}
}

export function setupRenderStyleStyles(container) {
	const overlay = container.querySelector(".openpose-overlay.openpose-render-style-overlay");
	// Use the same overlay/card structure and rely on shared overlay styles
	// (no custom max-width/margin/padding here so it matches Guide/About)

	// Use same background as Pose Editor sidebars for consistency (like Guide/About tabs)
	container.querySelectorAll(".openpose-render-style-overlay .openpose-overlay-card").forEach((card) => {
		card.style.background = "var(--openpose-panel-bg-secondary)";
		card.style.border = "none";
		card.style.borderRadius = "var(--openpose-card-radius)";
		card.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.14)";
		card.style.padding = "16px";
	});

	const content = container.querySelector(".openpose-render-style-content");
	if (content) {
		content.style.display = "flex";
		content.style.flexDirection = "column";
		content.style.gap = "12px";
	}

	const header = container.querySelector(".openpose-render-style-header");
	if (header) {
		header.style.display = "flex";
		header.style.alignItems = "center";
		header.style.justifyContent = "space-between";
		header.style.gap = "8px";
		header.style.flexWrap = "wrap";
	}

	const wrapper = container.querySelector(".openpose-render-style-controls-wrapper");
	if (wrapper) {
		wrapper.style.display = "flex";
		wrapper.style.flexDirection = "column";
		wrapper.style.gap = "12px";
	}

	const actions = container.querySelector(".openpose-render-style-actions");
	if (actions) {
		actions.style.display = "flex";
		actions.style.gap = "6px";
		actions.style.flexWrap = "wrap";
		actions.style.justifyContent = "flex-end";
		actions.style.marginLeft = "auto";
	}

	const intro = container.querySelector(".openpose-render-style-intro");
	if (intro) {
		intro.style.fontSize = "12px";
		intro.style.opacity = "0.85";
		intro.style.color = "var(--openpose-text-muted)";
		intro.style.flex = "1 1 auto";
	}

	container.querySelectorAll(".openpose-render-style-sections").forEach((section) => {
		section.style.display = "flex";
		section.style.flexDirection = "column";
		section.style.gap = "12px";
	});

	container.querySelectorAll(".openpose-render-style-section").forEach((section) => {
		section.style.display = "flex";
		section.style.flexDirection = "column";
		section.style.gap = "8px";
		section.style.padding = "16px";
		section.style.border = "none";
		section.style.borderRadius = "8px";
		section.style.background = "linear-gradient(rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.035)), var(--openpose-panel-bg)";
		section.style.boxSizing = "border-box";
		section.style.boxShadow = "0 1px 2px rgba(0,0,0,0.2)";
	});

	container.querySelectorAll(".openpose-render-style-section-title").forEach((label) => {
		label.style.fontWeight = "600";
		label.style.fontSize = "13px";
		label.style.color = "var(--openpose-text)";
	});

	container.querySelectorAll(".openpose-render-style-grid").forEach((grid) => {
		grid.style.display = "grid";
		grid.style.gridTemplateColumns = "140px minmax(0, 1fr)";
		grid.style.gap = "8px 12px";
		grid.style.alignItems = "center";
	});

	container.querySelectorAll(".openpose-render-style-label").forEach((label) => {
		label.style.color = "var(--openpose-text-muted)";
		label.style.fontFamily = "Arial, sans-serif";
		label.style.fontSize = "12px";
	});

	container.querySelectorAll(".openpose-render-style-color-row").forEach((row) => {
		row.style.display = "flex";
		row.style.flexWrap = "wrap";
		row.style.alignItems = "center";
		row.style.gap = "6px";
	});

	container.querySelectorAll(".openpose-render-style-channel").forEach((channel) => {
		channel.style.display = "flex";
		channel.style.alignItems = "center";
		channel.style.gap = "4px";
	});

	container.querySelectorAll(".openpose-render-style-channel-label").forEach((label) => {
		label.style.fontSize = "11px";
		label.style.color = "var(--openpose-text-muted)";
	});

	container.querySelectorAll(".openpose-render-style-color").forEach((input) => {
		input.style.width = "40px";
		input.style.minWidth = "40px";
		input.style.height = "28px";
		input.style.padding = "0";
		input.style.border = "1px solid var(--openpose-border)";
		input.style.borderRadius = "4px";
		input.style.background = "var(--openpose-input-bg)";
	});

	container.querySelectorAll(".openpose-render-style-card .openpose-input").forEach((input) => {
		input.style.padding = "6px 8px";
		input.style.border = "1px solid var(--openpose-border)";
		input.style.borderRadius = "4px";
		input.style.background = "var(--openpose-input-bg)";
		input.style.color = "var(--openpose-input-text)";
		input.style.boxSizing = "border-box";
		input.style.fontFamily = "Arial, sans-serif";
	});

	container.querySelectorAll(".openpose-render-style-number").forEach((input) => {
		input.style.maxWidth = "100px";
	});

	container.querySelectorAll(".openpose-render-style-input-row").forEach((row) => {
		row.style.display = "flex";
		row.style.alignItems = "center";
		row.style.gap = "6px";
	});

	container.querySelectorAll(".openpose-render-style-unit").forEach((unit) => {
		unit.style.fontSize = "11px";
		unit.style.color = "var(--openpose-text-muted)";
		unit.style.fontWeight = "500";
		unit.style.textTransform = "uppercase";
		unit.style.letterSpacing = "0.5px";
	});

	container.querySelectorAll(".openpose-render-style-channel-input").forEach((input) => {
		input.style.width = "64px";
	});

	// Warning styling now handled by global openpose-alert CSS

	applySidebarButtonStyles(container.querySelectorAll(".openpose-render-style-card .openpose-btn"));
}

registerModule({
	id: "render-style",
	labelKey: "render_style.summary.title",
	order: 25,
	slot: "overlay",
	buildUI: buildRenderStylePanelHtml,
	initUI: (container, openpose) => {
		setupRenderStyleStyles(container);
		setupRenderStylePanel(container, openpose);
	},
	onActivate: ({ openpose }) => {
		if (!openpose) {
			return;
		}
		if (!renderStyleState.panel && openpose.container) {
			renderStyleState.panel = openpose.container.querySelector(".openpose-overlay.openpose-render-style-overlay");
		}
		openpose.setCanvasAreaVisible(true);
		openpose.setSidebarsVisible(false);
		openpose.setOverlayPlaceholderWidths(false);
		openpose.setSidebarControlsDisabled(true);
		openpose.setBackgroundControlsEnabled(false);
	},
	summary: {
		icon: UiIcons.svg('sliders', { size: 14, className: 'openpose-sidebar-icon' }),
		titleKey: "render_style.summary.title",
		descriptionKey: "render_style.summary.description"
	}
});
