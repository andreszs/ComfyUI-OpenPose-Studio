import { t } from "./i18n.js";
import { showToast, showConfirm, copyToClipboard } from "../utils.js";
import { registerModule } from "./index.js";
import { UiIcons } from "../ui-icons.js";

export const ABOUT_INFO = {
    name: "OpenPose Studio",
    author: "andreszs",
    repoUrl: "https://github.com/andreszs/comfyui-openpose-studio",
    githubProfileUrl: "https://github.com/andreszs",
    githubReposUrl: "https://github.com/andreszs?tab=repositories",
    kofiUrl: "https://ko-fi.com/D1D716OLPM",
    paypalUrl: "https://www.paypal.com/ncp/payment/GEEM324PDD9NC",
    paypalQrUrl: "/openpose/assets/qr-paypal.svg",
    usdcQrUrl: "/openpose/assets/qr-usdc.svg",
    usdcAddress: "0xe36a336fC6cc9Daae657b4A380dA492AB9601e73",
    pipelineControlUrl: "https://github.com/andreszs/comfyui-pipeline-control",
};

// Configuration: Update TOML URL
const UPDATE_TOML_URL = "https://raw.githubusercontent.com/andreszs/comfyui-openpose-studio/main/pyproject.toml";
const TOAST_API_MIN_VERSION = "1.2.27";
const README_GITHUB_URL = "https://github.com/andreszs/comfyui-openpose-studio/blob/main/docs/README.md";

// Build About overlay HTML with current language
export function buildAboutOverlayHtml() {
    return `
    <div class="openpose-overlay openpose-about-overlay" data-overlay="about">
        <div class="openpose-overlay-card">
            <div class="openpose-overlay-content">
                <div class="openpose-about-list">
                    <div class="openpose-about-row openpose-about-header-row">
                        <div class="openpose-about-header">
                            <div class="openpose-about-left">
                                <div class="openpose-about-title">${ABOUT_INFO.name}</div>
                                <span class="openpose-about-emoji">🤸</span>
                                <span class="openpose-about-version" title="${t("about.version.title")}"></span>
                                <a class="openpose-about-author" href="${ABOUT_INFO.githubProfileUrl}" target="_blank" rel="noopener noreferrer" title="${t("about.author.title")}">${t("about.author.by", { author: ABOUT_INFO.author })}</a>
                            </div>
                            <div class="openpose-about-right">
                                <button class="openpose-btn csp-small-btn openpose-check-updates-btn" title="${t("about.btn.check_updates.title")}">${t("about.btn.check_updates.label")}</button>
                                <a class="openpose-btn csp-small-btn openpose-readme-btn" href="${README_GITHUB_URL}" target="_blank" rel="noopener noreferrer" title="${t("about.btn.readme.title")}">README</a>
                            </div>
                        </div>
                    </div>
                    <div class="openpose-about-row openpose-issues-section openpose-about-card">
                        <div class="openpose-about-row-title">${t("about.issues.title")}</div>
                        <p>${t("about.issues.body")}</p>
                        <a class="openpose-btn csp-small-btn openpose-support-btn openpose-issues-btn" href="${ABOUT_INFO.repoUrl}/issues" target="_blank" rel="noopener noreferrer">${t("about.issues.btn.label")}</a>
                    </div>
                    <div class="openpose-about-row openpose-support-section openpose-about-card">
                        <div class="openpose-about-row-title openpose-support-titlebar">
                            <span>${t("about.support.title")}</span>
                            <div class="openpose-support-badges">
                                <a class="openpose-support-badge-link openpose-support-badge" href="${ABOUT_INFO.kofiUrl}" target="_blank" rel="noopener noreferrer" title="${t("donate.tooltip.kofi")}">
                                    <img class="openpose-support-badge-img" src="/openpose/assets/badge_kofi.svg" alt="${t("donate.tooltip.kofi")}" title="${t("donate.tooltip.kofi")}" />
                                </a>
                                <a class="openpose-support-badge-link openpose-support-badge" href="${ABOUT_INFO.paypalUrl}" target="_blank" rel="noopener noreferrer" title="${t("donate.tooltip.paypal")}">
                                    <img class="openpose-support-badge-img" src="/openpose/assets/badge_paypal.svg" alt="${t("donate.tooltip.paypal")}" title="${t("donate.tooltip.paypal")}" />
                                </a>
                                <a class="openpose-support-badge-link openpose-support-badge" href="#openpose-usdc" title="${t("donate.tooltip.usdc")}">
                                    <img class="openpose-support-badge-img" src="/openpose/assets/badge_usdc.svg" alt="${t("donate.tooltip.usdc")}" title="${t("donate.tooltip.usdc")}" />
                                </a>
                            </div>
                        </div>
                        <div class="openpose-support-actions">
                            <div class="openpose-support-qr">
                                <a class="openpose-support-qr-link" href="${ABOUT_INFO.paypalUrl}" target="_blank" rel="noopener noreferrer">
                                    <img src="${ABOUT_INFO.paypalQrUrl}" alt="${t("about.support.paypal.alt")}" title="${t("about.support.paypal.title")}" />
                                </a>
                            </div>
                            <div class="openpose-support-middle">
                            <div class="openpose-support-copy">
                                <div class="openpose-support-bullet">
                                    <span class="openpose-support-bullet-icon">🛠️</span>
                                    <p>${t("about.support.bullet1")}</p>
                                </div>
                                <div class="openpose-support-bullet">
                                    <span class="openpose-support-bullet-icon">ℹ️</span>
                                    <p>${t("about.support.bullet2")}</p>
                                </div>
                                <div class="openpose-support-bullet">
                                    <span class="openpose-support-bullet-icon">🚀</span>
                                    <p>${t("about.support.bullet3")}</p>
                                </div>
                            </div>
                            </div>
                            <div id="openpose-usdc" class="openpose-support-qr openpose-support-qr-usdc">
                                <img src="${ABOUT_INFO.usdcQrUrl}" alt="${t("about.support.usdc.alt")}" title="${t("about.support.usdc.title")}" />
                            </div>
                        </div>
                    </div>
                    <div class="openpose-about-row openpose-pipeline-section openpose-about-card">
                        <div class="openpose-about-row-title">${t("about.other_repos.title")}</div>
                        <p>${t("about.other_repos.body")}</p>
                        <a class="openpose-btn csp-small-btn openpose-support-btn openpose-other-repos-btn" href="${ABOUT_INFO.githubProfileUrl}" target="_blank" rel="noopener noreferrer" title="${t("about.other_repos.btn.title")}">${t("about.other_repos.btn.label")}</a>
                    </div>
                </div>
            </div>
        </div>
    </div>
`;
}

export function setupAboutOverlayStyles(container) {
    container.querySelectorAll(".openpose-about-overlay .openpose-overlay-card").forEach((card) => {
        card.style.background = "var(--openpose-panel-bg-secondary)";
        card.style.border = "none";
        card.style.borderRadius = "var(--openpose-card-radius)";
        card.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.14)";
        card.style.padding = "16px";
    });

    container.querySelectorAll(".openpose-about-list").forEach((list) => {
        list.style.display = "flex";
        list.style.flexDirection = "column";
        list.style.gap = "12px";
    });

    container.querySelectorAll(".openpose-about-row").forEach((row) => {
        row.style.display = "flex";
        row.style.flexDirection = "column";
        row.style.gap = "6px";
    });

    container.querySelectorAll(".openpose-about-header-row").forEach((row) => {
        row.style.padding = "0 0 10px 0";
        row.style.marginBottom = "2px";
        row.style.borderBottom = "1px solid var(--openpose-border)";
        row.style.borderRadius = "0";
        row.style.background = "transparent";
        row.style.boxShadow = "none";
    });

    container.querySelectorAll(".openpose-about-card").forEach((row) => {
        row.style.padding = "16px";
        row.style.border = "none";
        row.style.borderRadius = "var(--openpose-card-radius)";
        row.style.background = "linear-gradient(rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.035)), var(--openpose-panel-bg)";
        row.style.boxSizing = "border-box";
        row.style.boxShadow = "0 1px 2px rgba(0,0,0,0.2)";
    });

    container.querySelectorAll(".openpose-about-row p").forEach((p) => {
        p.style.margin = "2px 0";
        p.style.fontSize = "13px";
    });

    container.querySelectorAll(".openpose-about-row-title").forEach((title) => {
        title.style.fontWeight = "600";
        title.style.fontSize = "15.5px";
        title.style.color = "var(--openpose-text)";
        title.style.marginTop = "0";
    });

    container.querySelectorAll(".openpose-support-titlebar").forEach((titlebar) => {
        titlebar.style.display = "flex";
        titlebar.style.alignItems = "center";
        titlebar.style.justifyContent = "space-between";
        titlebar.style.gap = "10px";
    });

    container.querySelectorAll(".openpose-about-header").forEach((header) => {
        header.style.display = "flex";
        header.style.flexDirection = "row";
        header.style.alignItems = "center";
        header.style.justifyContent = "space-between";
        header.style.gap = "16px";
        header.style.flexWrap = "wrap";
    });

    container.querySelectorAll(".openpose-about-left").forEach((left) => {
        left.style.display = "flex";
        left.style.alignItems = "center";
        left.style.gap = "8px";
        left.style.flex = "1";
    });

    container.querySelectorAll(".openpose-about-emoji").forEach((emoji) => {
        emoji.style.display = "inline-flex";
        emoji.style.alignItems = "center";
        emoji.style.justifyContent = "center";
        emoji.style.fontSize = "1.3em";
        emoji.style.lineHeight = "1";
        emoji.style.verticalAlign = "middle";
    });

    container.querySelectorAll(".openpose-about-right").forEach((right) => {
        right.style.display = "flex";
        right.style.alignItems = "center";
        right.style.gap = "8px";
        right.style.flexWrap = "wrap";
    });

    container.querySelectorAll(".openpose-about-title").forEach((title) => {
        title.style.fontSize = "18px";
        title.style.fontWeight = "bold";
        title.style.color = "var(--openpose-text)";
        title.style.whiteSpace = "nowrap";
    });

    container.querySelectorAll(".openpose-about-version").forEach((version) => {
        version.style.fontSize = "14px";
        version.style.fontWeight = "600";
        version.style.color = "var(--openpose-text)";
        version.style.padding = "2px 6px";
        version.style.borderRadius = "4px";
        version.style.background = "var(--openpose-panel-bg)";
        version.style.border = "1px solid var(--openpose-border)";
        version.style.whiteSpace = "nowrap";
        version.style.cursor = "default";
    });

    container.querySelectorAll(".openpose-about-author").forEach((link) => {
        link.style.fontSize = "11px";
        link.style.color = "var(--openpose-text-muted)";
        link.style.textDecoration = "none";
        link.style.whiteSpace = "nowrap";
        link.style.cursor = "pointer";
        if (!link.dataset.hoverReady) {
            link.dataset.hoverReady = "1";
            link.addEventListener("mouseenter", () => {
                link.style.textDecoration = "underline";
                link.style.color = "var(--openpose-text)";
            });
            link.addEventListener("mouseleave", () => {
                link.style.textDecoration = "none";
                link.style.color = "var(--openpose-text-muted)";
            });
        }
    });

    const aboutButtons = container.querySelectorAll(".openpose-about-overlay .openpose-btn");
    aboutButtons.forEach((btn) => {
        btn.style.textDecoration = "none";
    });

    container.querySelectorAll(".openpose-issues-btn, .openpose-other-repos-btn").forEach((btn) => {
        btn.style.alignSelf = "flex-start";
    });

    container.querySelectorAll(".openpose-support-badges").forEach((badges) => {
        badges.style.display = "flex";
        badges.style.alignItems = "center";
        badges.style.gap = "8px";
        badges.style.marginLeft = "auto";
        badges.style.flex = "0 0 auto";
    });

    container.querySelectorAll(".openpose-support-badge-link").forEach((link) => {
        link.style.margin = "0px";
        link.style.background = "transparent";
        link.style.cursor = "pointer";
        link.style.textDecoration = "none";
        link.style.opacity = "1";
        link.style.filter = "brightness(1)";
        link.style.transition = "filter 0.15s, opacity 0.15s";
        link.style.display = "block";
        link.style.borderRadius = "4px";
        link.style.overflow = "hidden";
        link.style.border = "1px solid rgba(255, 255, 255, 0.15)";
        link.style.boxShadow = "rgba(0, 0, 0, 0.35) 0px 1px 2px";
        if (!link.dataset.hoverReady) {
            link.dataset.hoverReady = "1";
            link.addEventListener("mouseenter", () => {
                link.style.filter = "brightness(1.1)";
            });
            link.addEventListener("mouseleave", () => {
                link.style.filter = "brightness(1)";
            });
        }
    });

    container.querySelectorAll(".openpose-support-badge-img").forEach((img) => {
        img.style.display = "block";
        img.style.borderRadius = "4px";
    });

    container.querySelectorAll(".openpose-support-actions").forEach((row) => {
        row.style.display = "flex";
        row.style.alignItems = "stretch";
        row.style.justifyContent = "space-between";
        row.style.gap = "16px";
        row.style.marginTop = "6px";
    });

    container.querySelectorAll(".openpose-support-middle").forEach((middle) => {
        middle.style.display = "flex";
        middle.style.alignItems = "center";
        middle.style.justifyContent = "center";
        middle.style.flex = "1";
        middle.style.padding = "10px 14px";
        middle.style.borderRadius = "6px";
        middle.style.background = "linear-gradient(rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.025)), var(--openpose-panel-bg)";
        middle.style.border = "1px solid rgba(128, 128, 128, 0.2)";
        middle.style.border = "1px solid color-mix(in srgb, var(--openpose-border) 30%, transparent)";
        middle.style.boxShadow = "none";
        middle.style.boxSizing = "border-box";
    });

    container.querySelectorAll(".openpose-support-copy").forEach((copy) => {
        copy.style.display = "flex";
        copy.style.flexDirection = "column";
        copy.style.alignItems = "flex-start";
        copy.style.justifyContent = "center";
        copy.style.textAlign = "left";
        copy.style.width = "100%";
        copy.style.maxWidth = "100%";
        copy.style.gap = "8px";
    });

    container.querySelectorAll(".openpose-support-bullet").forEach((row) => {
        row.style.display = "flex";
        row.style.alignItems = "baseline";
        row.style.gap = "6px";
        row.style.width = "100%";
    });

    container.querySelectorAll(".openpose-support-bullet-icon").forEach((icon) => {
        icon.style.display = "inline-flex";
        icon.style.alignItems = "baseline";
        icon.style.justifyContent = "center";
        icon.style.flex = "0 0 20px";
        icon.style.width = "20px";
        icon.style.fontSize = "14px";
        icon.style.lineHeight = "1";
    });

    container.querySelectorAll(".openpose-support-bullet p").forEach((p) => {
        p.style.flex = "1";
    });

    container.querySelectorAll(".openpose-support-copy p").forEach((p) => {
        p.style.margin = "4px 0";
        p.style.fontSize = "13.5px";
        p.style.color = "var(--openpose-text-muted)";
        p.style.lineHeight = "1.4";
    });

    container.querySelectorAll(".openpose-support-qr").forEach((box) => {
        box.style.display = "flex";
        box.style.flexDirection = "column";
        box.style.flex = "0 0 auto";
        box.style.alignSelf = "stretch";
        box.style.justifyContent = "center";
        box.style.alignItems = "center";
        box.style.gap = "4px";
        box.style.padding = "0";
        box.style.borderRadius = "6px";
        box.style.border = "none";
        box.style.background = "transparent";
        box.style.cursor = "pointer";
        box.style.transition = "none";
        if (!box.dataset.hoverReady) {
            box.dataset.hoverReady = "1";
            box.addEventListener("mouseenter", () => {
                const image = box.querySelector("img");
                if (image) {
                    image.style.filter = "brightness(1.035)";
                }
            });
            box.addEventListener("mouseleave", () => {
                const image = box.querySelector("img");
                if (image) {
                    image.style.filter = "brightness(1)";
                }
            });
        }
    });

    container.querySelectorAll(".openpose-support-qr-link").forEach((link) => {
        link.style.display = "block";
        link.style.cursor = "pointer";
    });

    container.querySelectorAll(".openpose-support-qr img").forEach((img) => {
        img.style.maxWidth = "168px";
        img.style.width = "100%";
        img.style.height = "auto";
        img.style.borderRadius = "4px";
        img.style.background = "var(--openpose-input-bg)";
        img.style.cursor = "pointer";
        img.style.transition = "filter 0.15s ease";
        img.style.filter = "brightness(1)";
    });
}

export const aboutOverlay = {
  id: "about",
  buildUI: buildAboutOverlayHtml,
  applyStyles: setupAboutOverlayStyles,
  initUI: initAboutOverlay,
};


// -----------------------------------------------------------------------------
// OpenPose Studio - Version helper (reads version from backend endpoint)
// Source of truth: pyproject.toml in plugin root
// -----------------------------------------------------------------------------

// Helper function to parse semantic version string
function parseVersion(versionString) {
    const parts = versionString.replace(/^v/, "").split(".");
    return {
        major: parseInt(parts[0]) || 0,
        minor: parseInt(parts[1]) || 0,
        patch: parseInt(parts[2]) || 0
    };
}

// Compare two version objects: returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
function compareVersions(v1, v2) {
    if (v1.major !== v2.major) return v1.major > v2.major ? 1 : -1;
    if (v1.minor !== v2.minor) return v1.minor > v2.minor ? 1 : -1;
    if (v1.patch !== v2.patch) return v1.patch > v2.patch ? 1 : -1;
    return 0;
}

// Extract version from pyproject.toml content
function extractVersionFromToml(tomlContent) {
    const match = tomlContent.match(/version\s*=\s*["']([^"']+)["']/);
    return match ? match[1] : null;
}

// Check for updates by fetching remote pyproject.toml
// Returns: { success: boolean }
async function checkForUpdates(localVersion) {
    try {
        const response = await fetch(UPDATE_TOML_URL, {
            method: "GET",
            cache: "no-store"
        });

        if (!response || !response.ok) {
            throw new Error(`HTTP error: ${response?.status || "no response"}`);
        }

        const tomlContent = await response.text();
        const remoteVersionStr = extractVersionFromToml(tomlContent);

        if (!remoteVersionStr) {
            throw new Error(t("about.update.failed.extract"));
        }

        const localVer = parseVersion(localVersion);
        const remoteVer = parseVersion(remoteVersionStr);
        const comparison = compareVersions(remoteVer, localVer);

        if (comparison > 0) {
            // Remote version is newer
            return { success: true, hasUpdate: true, remoteVersion: remoteVersionStr };
        } else {
            // Local version is up to date or newer
            return { success: true, hasUpdate: false };
        }
    } catch (err) {
        console.error(t("about.update.failed.console_prefix"), err);
        const errorMsg = err.message || "Unknown error";
        const statusMatch = errorMsg.match(/HTTP error: (\d+)/);
        const statusCode = statusMatch ? statusMatch[1] : "unknown";
        showToast("warn", t("about.update.failed.toast_title"), t("about.update.failed.toast_body", { statusCode }));
        return { success: false };
    }
}

function fetchOpenPoseEditorVersion() {
    return (async () => {
        try {
            let fetchFn = null;

            // Prefer ComfyUI fetchApi if available (classic frontend)
            if (window.api && typeof window.api.fetchApi === "function") {
                fetchFn = window.api.fetchApi.bind(window.api);
            } else {
                // Fallback to native fetch (robust across frontends/forks)
                fetchFn = fetch;
            }

            const response = await fetchFn("/openpose_editor/version", {
                method: "GET",
                cache: "no-store"
            });

            if (!response || !response.ok) {
                throw new Error(`HTTP error: ${response?.status || "no response"}`);
            }

            return await response.json();
        } catch (err) {
            return {
                version: "unknown",
                error: err?.message || t("about.update.failed.fetch")
            };
        }
    })();
}

function initAboutOverlay(container) {
  setupAboutOverlayStyles(container);

  const aboutContent = container.querySelector(".openpose-overlay-content");
  const titleEl = container.querySelector(".openpose-about-title");
  const versionEl = container.querySelector(".openpose-about-version");
  const checkUpdatesBtn = container.querySelector(
    ".openpose-check-updates-btn",
  );
  const usdcQrImg = container.querySelector(".openpose-support-qr-usdc img");
  const usdcBadgeLink = container.querySelector(
    '.openpose-support-badge-link[href="#openpose-usdc"]',
  );
  const toastApi = window?.app?.extensionManager?.toast;
  const hasToastApi =
    (toastApi && typeof toastApi.add === "function") ||
    (window?.app?.ui && typeof window.app.ui.showToast === "function");

  if (usdcBadgeLink && usdcQrImg && !usdcBadgeLink.dataset.clickReady) {
    usdcBadgeLink.dataset.clickReady = "1";
    usdcBadgeLink.addEventListener("click", (event) => {
      event.preventDefault();
      usdcQrImg.click();
    });
  }

  // 1) Immediate placeholders (first paint)
  if (titleEl) titleEl.textContent = ABOUT_INFO?.name || "OpenPose Studio";
  if (versionEl) {
    versionEl.textContent = "v…";
    versionEl.title = t("about.version.loading");
  }

  // 2) Async update from backend endpoint
  fetchOpenPoseEditorVersion().then((info) => {
    const name = info?.name || "unknown";
    const version = info?.version || "unknown";

    if (titleEl) titleEl.textContent = name;
    if (versionEl) {
      versionEl.textContent = `v${version}`;
      versionEl.title = info?.error
        ? t("about.version.unavailable")
        : t("about.version.loaded");
    }

    // Setup check for updates button click handler
    if (checkUpdatesBtn && version !== "unknown") {
      let isDownloadMode = false;

      checkUpdatesBtn.addEventListener("click", () => {
        if (isDownloadMode) {
          // In download mode: open README.md for update instructions
          window.open(README_GITHUB_URL, "_blank");
          return;
        }

        // Check for updates mode
        checkUpdatesBtn.disabled = true;
        checkUpdatesBtn.style.opacity = "0.5";
        checkUpdatesBtn.textContent = t("about.update.checking");
        checkForUpdates(version).then((result) => {
          if (result.success && result.hasUpdate) {
            // New version available: switch to download mode
            isDownloadMode = true;
            checkUpdatesBtn.textContent = t("about.btn.how_to_update.label");
            checkUpdatesBtn.title = t("about.update.available.btn_title", {
              current: version,
              latest: result.remoteVersion,
            });
            showToast(
              "info",
              t("about.update.available.toast_title"),
              t("about.update.available.toast_body", {
                current: version,
                latest: result.remoteVersion,
              }),
            );
          } else if (result.success) {
            // Up to date
            checkUpdatesBtn.textContent = t("about.btn.check_updates.label");
            showToast(
              "success",
              t("about.update.uptodate.toast_title"),
              t("about.update.uptodate.toast_body"),
            );
          } else {
            // Failed
            checkUpdatesBtn.textContent = t("about.btn.retry.label");
            checkUpdatesBtn.title = t("about.btn.retry.title");
          }
          checkUpdatesBtn.disabled = false;
          checkUpdatesBtn.style.opacity = "0.85";
        });
      });
    }
  });

  if (
    !hasToastApi &&
    aboutContent &&
    !aboutContent.querySelector(".openpose-about-warning")
  ) {
    const warning = document.createElement("div");
    warning.className =
      "openpose-info-card openpose-warning-card alert alert-warning openpose-about-warning";
    warning.innerHTML = `
        <div class="openpose-warning-title">${t("about.warning.outdated.title")}</div>
        <div class="openpose-warning-text">
            ${t("about.warning.outdated.body", { minVersion: TOAST_API_MIN_VERSION })}
        </div>
    `;
    const header = aboutContent.querySelector(".openpose-about-header");
    if (header && header.parentNode) {
      header.insertAdjacentElement("afterend", warning);
    } else {
      aboutContent.insertBefore(warning, aboutContent.firstChild);
    }
  }

  if (usdcQrImg) {
    usdcQrImg.style.cursor = "pointer";
    usdcQrImg.addEventListener("click", async () => {
      const confirmed = await showConfirm(
        t("about.usdc.confirm.title"),
        t("about.usdc.confirm.message"),
      );
      if (!confirmed) {
        return;
      }
      const address = ABOUT_INFO.usdcAddress;
      if (!address) {
        showToast(
          "warn",
          t("about.usdc.toast_title"),
          t("about.usdc.not_found"),
        );
        return;
      }
      const ok = await copyToClipboard(address);
      if (ok) {
        showToast("info", t("about.usdc.copied.title"), t("about.usdc.copied.body"));
      } else {
        showToast("error", t("about.usdc.toast_title"), t("about.usdc.copy_failed"));
      }
    });
  }
}

registerModule({
    id: "about",
    labelKey: "about.summary.title",
    order: 40,
    slot: "overlay",
    buildUI: buildAboutOverlayHtml,
    initUI: (container) => aboutOverlay.initUI(container),
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
        icon: UiIcons.svg('info', { size: 14, className: 'openpose-sidebar-icon' }),
        titleKey: "about.summary.title",
        descriptionKey: "about.summary.description"
    }
});
