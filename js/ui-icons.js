// js/ui-icons.js
// Monochrome inline SVG icon set for OpenPose Studio UI (no external CSS file required).
// Usage: UiIcons.svg('plus', { size: 14, className: 'openpose-sidebar-icon' })

const ICON_PATHS = {
  // Generic
  chevronUp: `<path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  chevronDown: `<path d="M6 8l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  refresh: `<path d="M21 6V3h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 18v3h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 7a8.5 8.5 0 0 0-14.5-2.5L3 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17a8.5 8.5 0 0 0 14.5 2.5L21 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  resetCcw: `<path d="M3 2v6h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 8l2.2-2.2A9 9 0 1 1 4 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  x: `<path d="M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,

  // Editor row actions
  plus: `<path d="M12 5v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  minus: `<path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  pencil: `<path d="M12 20h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  undo: `<path d="M9 14l-4-4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10h8a6 6 0 1 1 0 12h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,

  // Section header icons (left sidebar)
  fileJson: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 2v6h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  canvas: `<rect x="4" y="4" width="16" height="16" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 9h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 20V4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  image: `<rect x="3" y="5" width="18" height="14" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 13l3-3 4 4 3-2 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 9.5h.01" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,

  // Visibility toggle (show / hide conditioning area overlays)
  eye: `<path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>`,

  // Right sidebar module icons
  // “Explore Gallery”
  grid: `<rect x="4" y="4" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13" y="4" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="4" y="13" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13" y="13" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>`,
  // “Pose Merger”
  layers: `<path d="M12 2l9 5-9 5-9-5 9-5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M3 12l9 5 9-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M3 17l9 5 9-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  // “Render”
  sliders: `<path d="M4 21v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 10V3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 21v-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 8V3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20 21v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20 12V3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M2 14h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 12h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 16h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  // “Guide”
  book: `<path d="M4 19a2 2 0 0 0 2 2h13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 17V5a2 2 0 0 1 2-2h11v16H8a2 2 0 0 0-2 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  // “About”
  info: `<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 16v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 8h.01" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
};

function escapeAttr(value) {
  return String(value).replace(/"/g, "&quot;");
}

function buildSvg(paths, opts) {
  const size = Number.isFinite(opts?.size) ? opts.size : 16;
  const className = opts?.className
    ? ` class="${escapeAttr(opts.className)}"`
    : "";
  const viewBox = opts?.viewBox || "0 0 24 24";
  // currentColor makes it theme-friendly; styling handled by injected CSS.
  return `<svg${className} xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}" aria-hidden="true" focusable="false">${paths}</svg>`;
}

export const UiIcons = {
  names: Object.keys(ICON_PATHS),
  svg(name, opts = {}) {
    const paths = ICON_PATHS[name];
    if (!paths) return "";
    return buildSvg(paths, opts);
  },
};
