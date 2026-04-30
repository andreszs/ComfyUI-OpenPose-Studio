import { t } from "./i18n.js";
import { buildDonationFooterHtml, applyDonationFooterStyles, showToast, showConfirm, showPrompt, readFileToText, drawBoneWithOutline, drawKeypointWithOutline, extractKeypointsFromPoseKeypoints2d as importKeypointsFromPoseKeypoints2d } from "../utils.js";
import { getFormat, DEFAULT_FORMAT_ID, getFormatForPose, detectFormatFromMetadata, detectFormat, detectFormatFromFlat, listFormats, isFormatEditAllowed } from "../formats/index.js";
import { registerModule } from "./index.js";
import { UiIcons } from "../ui-icons.js";

export function buildPresetsMergerOverlayHtml() {
  return `
    <div class="openpose-merge-sidebar openpose-merge-panel" data-merge-panel="left">
        <div class="openpose-merge-sidebar-card">
            <label class="openpose-label">${t("pose_merger.preview.title")}</label>
            <div class="openpose-merge-preview-frame">
                <canvas class="openpose-merge-preview"></canvas>
            </div>
        </div>
    </div>
    <div class="openpose-merge-main openpose-merge-panel" data-merge-panel="center">
        <div class="openpose-merge-note">${t("pose_merger.description")}</div>
        <div class="openpose-guide-section openpose-merge-section-files">
            <div class="openpose-guide-title">${t("pose_merger.section.added_files")}</div>
            <div class="openpose-merge-table-wrap">
                <table class="openpose-merge-table">
                    <thead>
                        <tr>
                            <th>${t("pose_merger.table.file_name")}</th>
                            <th class="openpose-merge-index">${t("pose_merger.table.index")}</th>
                            <th>${t("pose_merger.table.format")}</th>
                            <th>${t("pose_merger.table.body")}</th>
                            <th>${t("pose_merger.table.face")}</th>
                            <th>${t("pose_merger.table.hands")}</th>
                            <th>${t("pose_merger.table.actions")}</th>
                        </tr>
                    </thead>
                    <tbody class="openpose-merge-tbody"></tbody>
                </table>
                <div class="openpose-merge-empty">${t("pose_merger.table.empty")}</div>
            </div>
        </div>
        
        <div class="openpose-alert openpose-alert-warning">
            <div class="openpose-alert-icon">⚠️</div>
            <div class="openpose-alert-body">
                <p>${t("pose_merger.warning.experimental_body", { issuesUrl: "https://github.com/andreszs/comfyui-openpose-studio/issues" })}</p>
            </div>
            <button class="openpose-alert-close" aria-label="${t("pose_merger.warning.dismiss")}" title="${t("pose_merger.warning.dismiss")}">×</button>
        </div>
        <input class="openpose-input openpose-merge-input" type="file" accept=".json" multiple />
    </div>
    <div class="openpose-merge-sidebar openpose-merge-sidebar-right openpose-merge-panel" data-merge-panel="right">
        <div class="openpose-merge-sidebar-card">
            <label class="openpose-label">Actions</label>
            <div class="openpose-merge-actions openpose-merge-actions-sidebar">
                <button class="openpose-btn openpose-merge-add" data-action="merge-add">${t("pose_merger.btn.add_file")}</button>
                <button class="openpose-btn openpose-merge-clear" data-action="merge-clear">${t("pose_merger.btn.clear_list")}</button>
                <div class="openpose-separator openpose-merge-separator"></div>
                <div class="openpose-merge-export-count">${t("pose_merger.footer.poses_to_export", { count: "0" })}</div>
                <button class="openpose-btn openpose-apply-btn openpose-merge-export" data-action="merge-export" title="Export a combined pose collection JSON file.">${t("pose_merger.btn.export_json")}</button>
            </div>
            <div class="openpose-spacer"></div>
            ${buildDonationFooterHtml()}
        </div>
    </div>
`;
}

export function setupPresetsMergerStyles(container) {
  container
    .querySelectorAll(
      ".openpose-merge-panel .openpose-btn:not(.openpose-apply-btn):not(.openpose-cancel-btn):not(.openpose-support-btn)",
    )
    .forEach((btn) => {
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

  container
    .querySelectorAll(".openpose-merge-panel .openpose-btn-small")
    .forEach((btn) => {
      btn.style.padding = "4px 8px";
      btn.style.fontSize = "12px";
    });

  container
    .querySelectorAll(".openpose-merge-panel .openpose-apply-btn")
    .forEach((applyBtn) => {
      applyBtn.style.padding = "8px 12px";
      applyBtn.style.border = "1px solid var(--openpose-border)";
      applyBtn.style.borderRadius = "4px";
      applyBtn.style.background = "var(--openpose-primary-bg)";
      applyBtn.style.color = "var(--openpose-primary-text)";
      applyBtn.style.cursor = "pointer";
      applyBtn.style.fontFamily = "Arial, sans-serif";
      applyBtn.style.fontSize = "14px";
      applyBtn.style.fontWeight = "bold";
      applyBtn.style.display = "block";
      applyBtn.style.width = "100%";
      if (!applyBtn.dataset.hoverReady) {
        applyBtn.dataset.hoverReady = "1";
        applyBtn.addEventListener("mouseenter", () => {
          applyBtn.style.background = "var(--openpose-primary-hover-bg)";
        });
        applyBtn.addEventListener("mouseleave", () => {
          applyBtn.style.background = "var(--openpose-primary-bg)";
        });
      }
    });

  container
    .querySelectorAll(".openpose-merge-panel .openpose-label")
    .forEach((label) => {
      label.style.color = "var(--openpose-text-muted)";
      label.style.fontFamily = "Arial, sans-serif";
      label.style.fontSize = "12px";
      label.style.marginTop = "6px";
    });

  container
    .querySelectorAll(".openpose-merge-panel .openpose-input")
    .forEach((input) => {
      input.style.padding = "6px 8px";
      input.style.border = "1px solid var(--openpose-border)";
      input.style.borderRadius = "4px";
      input.style.background = "var(--openpose-input-bg)";
      input.style.color = "var(--openpose-input-text)";
      input.style.width = "100%";
      input.style.boxSizing = "border-box";
      input.style.fontFamily = "Arial, sans-serif";
    });

  container
    .querySelectorAll(".openpose-merge-panel .openpose-separator")
    .forEach((sep) => {
      sep.style.height = "1px";
      sep.style.background = "var(--openpose-border)";
      sep.style.margin = "6px 0";
      sep.style.width = "100%";
    });

  container.querySelectorAll(".openpose-merge-panel").forEach((panel) => {
    panel.style.display = "none";
    panel.style.minHeight = "0";
    panel.style.minWidth = "0";
  });

  container.querySelectorAll(".openpose-merge-sidebar").forEach((sidebar) => {
    sidebar.style.display = "flex";
    sidebar.style.flexDirection = "column";
    sidebar.style.padding = "10px 6px 10px 10px";
    sidebar.style.gap = "0";
    sidebar.style.minWidth = "220px";
    sidebar.style.width = "280px";
    sidebar.style.flexShrink = "0";
    sidebar.style.boxSizing = "border-box";
    sidebar.style.background = "transparent";
    sidebar.style.height = "100%";
    sidebar.style.overflow = "visible";
  });

  container
    .querySelectorAll(".openpose-merge-sidebar-right")
    .forEach((sidebar) => {
      sidebar.style.padding = "10px 10px 10px 6px";
      sidebar.style.cursor = "default";
      sidebar.style.userSelect = "none";
      sidebar.style.webkitUserSelect = "none";
    });

  container.querySelectorAll(".openpose-merge-sidebar-card").forEach((card) => {
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "8px";
    card.style.padding = "16px";
    card.style.border = "none";
    card.style.borderRadius = "var(--openpose-card-radius)";
    card.style.background = "var(--openpose-panel-bg-secondary)";
    card.style.boxSizing = "border-box";
    card.style.flex = "1 1 auto";
    card.style.minHeight = "0";
    card.style.height = "100%";
    card.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.14)";
  });

  container.querySelectorAll(".openpose-merge-main").forEach((main) => {
    main.style.display = "flex";
    main.style.flexDirection = "column";
    main.style.gap = "10px";
    main.style.padding = "16px";
    main.style.boxSizing = "border-box";
    main.style.flex = "1 1 auto";
    main.style.width = "auto";
    main.style.minWidth = "0";
    main.style.minHeight = "0";
  });

  container
    .querySelectorAll(".openpose-merge-section-files")
    .forEach((section) => {
      section.style.display = "flex";
      section.style.flexDirection = "column";
      section.style.gap = "6px";
      section.style.flex = "1 1 auto";
      section.style.minHeight = "0";
    });

  container
    .querySelectorAll(".openpose-merge-preview-frame")
    .forEach((frame) => {
      frame.style.width = "100%";
      frame.style.height = "220px";
      frame.style.maxHeight = "220px";
      frame.style.display = "flex";
      frame.style.alignItems = "center";
      frame.style.justifyContent = "center";
      frame.style.overflow = "hidden";
    });

  container.querySelectorAll(".openpose-merge-preview").forEach((canvas) => {
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.objectFit = "contain";
    canvas.style.display = "block";
    canvas.style.border = "1px solid var(--openpose-canvas-border)";
    canvas.style.borderRadius = "8px";
    canvas.style.background = "var(--openpose-canvas-bg)";
    canvas.style.boxShadow = "var(--openpose-canvas-shadow)";
  });

  container.querySelectorAll(".openpose-merge-index").forEach((cell) => {
    cell.style.textAlign = "center";
  });
  container.querySelectorAll(".openpose-merge-actions").forEach((row) => {
    row.style.display = "flex";
    row.style.flexWrap = "wrap";
    row.style.alignItems = "center";
    row.style.gap = "8px";
  });

  container
    .querySelectorAll(".openpose-merge-actions-sidebar")
    .forEach((row) => {
      row.style.flexDirection = "column";
      row.style.alignItems = "stretch";
    });

  container.querySelectorAll(".openpose-merge-note").forEach((note) => {
    note.style.fontSize = "12px";
    note.style.opacity = "0.85";
    note.style.color = "var(--openpose-text-muted)";
    note.style.marginBottom = "6px";
  });

  container
    .querySelectorAll(".openpose-merge-export-count")
    .forEach((label) => {
      label.style.fontSize = "12px";
      label.style.opacity = "0.82";
      label.style.color = "var(--openpose-text-muted)";
    });

  container
    .querySelectorAll(".openpose-merge-actions .openpose-btn")
    .forEach((btn) => {
      btn.style.flex = "1";
      btn.style.minWidth = "140px";
    });

  container.querySelectorAll(".openpose-merge-input").forEach((input) => {
    input.style.display = "none";
  });

  container.querySelectorAll(".openpose-merge-table-wrap").forEach((wrap) => {
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "6px";
    wrap.style.flex = "1 1 auto";
    wrap.style.minHeight = "0";
    wrap.style.overflowY = "auto";
  });

  container.querySelectorAll(".openpose-merge-table").forEach((table) => {
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.fontSize = "12px";
  });

  container.querySelectorAll(".openpose-merge-table thead").forEach((head) => {
    head.style.position = "sticky";
    head.style.top = "0";
    head.style.background = "var(--openpose-panel-bg-secondary)";
    head.style.zIndex = "1";
  });

  container.querySelectorAll(".openpose-merge-table th").forEach((cell) => {
    cell.style.textAlign = "left";
    cell.style.padding = "6px 8px";
    cell.style.borderBottom = "1px solid var(--openpose-border)";
    cell.style.color = "var(--openpose-text)";
    cell.style.fontWeight = "600";
  });

  container.querySelectorAll(".openpose-merge-table td").forEach((cell) => {
    cell.style.padding = "6px 8px";
    cell.style.borderBottom = "1px solid var(--openpose-border)";
    cell.style.color = "var(--openpose-text)";
  });

  container
    .querySelectorAll(".openpose-merge-table thead th")
    .forEach((cell, index) => {
      if (index === 1 || index > 2) {
        cell.style.textAlign = "center";
      }
    });

  container.querySelectorAll(".openpose-merge-empty").forEach((empty) => {
    empty.style.fontSize = "12px";
    empty.style.opacity = "0.75";
    empty.style.color = "var(--openpose-text-muted)";
  });

  container.querySelectorAll(".openpose-merge-intro").forEach((intro) => {
    intro.style.margin = "0";
    intro.style.fontSize = "12px";
    intro.style.opacity = "0.85";
    intro.style.color = "var(--openpose-text-muted)";
  });

  container.querySelectorAll(".openpose-merge-help-icon").forEach((icon) => {
    icon.style.display = "inline-block";
    icon.style.marginRight = "6px";
    icon.style.opacity = "0.85";
  });

  container.querySelectorAll(".openpose-merge-unavailable").forEach((icon) => {
    icon.style.display = "inline-block";
    icon.style.fontSize = "13px";
    icon.style.color = "var(--openpose-error)";
  });

  // Universal alert close button event listener (no styling needed - handled by global CSS)
  container.querySelectorAll(".openpose-alert-close").forEach((btn) => {
    if (!btn.dataset.dismissReady) {
      btn.dataset.dismissReady = "1";
      const banner = btn.closest(".openpose-alert");
      btn.addEventListener("click", () => {
        if (banner) {
          banner.style.display = "none";
        }
      });
    }
  });

  // Spacer pushes donation footer to bottom of the card
  container.querySelectorAll(".openpose-merge-sidebar-card .openpose-spacer").forEach((spacer) => {
    spacer.style.flex = "1";
  });

  // Donation footer (shared with pose editor sidebar)
  applyDonationFooterStyles(container);
}

export const poseMergerOverlay = {
  id: "merge",
  buildUI: buildPresetsMergerOverlayHtml,
  applyStyles: setupPresetsMergerStyles,
  initUI: setupPresetsMergerStyles,
};

const PREVIEW_CANVAS_SIZE = 180;

// Get COCO-18 format for preview rendering (default format)
function getPreviewFormat() {
  return getFormat(DEFAULT_FORMAT_ID);
}

function isValidPreviewKeypoint(point) {
  if (!Array.isArray(point) || point.length < 2) {
    return false;
  }
  const x = Number(point[0]);
  const y = Number(point[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return false;
  }
  return !(x === 0 && y === 0);
}

function extractPreviewKeypointsFromPoseKeypoints2d(
  poseKeypoints2d,
  canvasWidth,
  canvasHeight,
) {
  if (!Array.isArray(poseKeypoints2d) || poseKeypoints2d.length < 51) {
    return null;
  }

  return importKeypointsFromPoseKeypoints2d(
    poseKeypoints2d,
    canvasWidth,
    canvasHeight,
  );
}

function normalizePreviewKeypointsGroup(group, formatHint) {
  if (!Array.isArray(group) || group.length === 0) {
    return null;
  }

  let formatId = null;
  if (typeof formatHint === "string") {
    formatId = detectFormatFromMetadata(formatHint, group);
  }

  if (group.length === 17) {
    formatId = "coco17";
  } else if (group.length === 18 && !formatId) {
    formatId = detectFormat(group);
  }

  const format = getFormat(formatId) || getFormat(DEFAULT_FORMAT_ID);
  if (format && typeof format.normalizePose === "function") {
    const normalized = format.normalizePose(group);
    if (Array.isArray(normalized)) {
      return { keypoints: normalized, formatId: format.id };
    }
  }
  return { keypoints: group, formatId: format?.id || formatId || null };
}

function getPreviewPoseData(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const baseWidth = Number(payload.width || payload.canvas_width) || 512;
  const baseHeight = Number(payload.height || payload.canvas_height) || 512;

  if (Array.isArray(payload.keypoints)) {
    const keypoints = payload.keypoints;
    let flatKeypoints = [];
    let detectedFormatId = null;

    if (
      keypoints.length > 0 &&
      Array.isArray(keypoints[0]) &&
      (Array.isArray(keypoints[0][0]) || keypoints[0][0] === null)
    ) {
      for (const group of keypoints) {
        if (!Array.isArray(group)) {
          continue;
        }
        const normalized = normalizePreviewKeypointsGroup(
          group,
          payload.format,
        );
        if (normalized && Array.isArray(normalized.keypoints)) {
          detectedFormatId = detectedFormatId || normalized.formatId;
          flatKeypoints.push(...normalized.keypoints);
        }
      }
    } else {
      if (keypoints.length % 17 === 0 && keypoints.length % 18 !== 0) {
        for (let i = 0; i < keypoints.length; i += 17) {
          const group = keypoints.slice(i, i + 17);
          const normalized = normalizePreviewKeypointsGroup(
            group,
            payload.format,
          );
          if (normalized && Array.isArray(normalized.keypoints)) {
            detectedFormatId = detectedFormatId || normalized.formatId;
            flatKeypoints.push(...normalized.keypoints);
          }
        }
      } else {
        const normalized = normalizePreviewKeypointsGroup(
          keypoints,
          payload.format,
        );
        if (normalized && Array.isArray(normalized.keypoints)) {
          detectedFormatId = detectedFormatId || normalized.formatId;
          flatKeypoints = normalized.keypoints;
        } else {
          flatKeypoints = keypoints;
        }
      }
    }

    // Detect format and validate based on keypoint count
    const detectedFormat =
      (detectedFormatId && getFormat(detectedFormatId)) ||
      getFormatForPose(flatKeypoints);
    const kpCount = detectedFormat && detectedFormat.keypoints ? detectedFormat.keypoints.length : 18;
    
    if (flatKeypoints.length >= kpCount && flatKeypoints.length % kpCount === 0) {
      return {
        keypoints: flatKeypoints,
        width: baseWidth,
        height: baseHeight,
        format: detectedFormat?.id || payload.format,
      };
    }
  }

  if (Array.isArray(payload.people) && payload.people.length > 0) {
    const allKeypoints = [];
    let detectedFormatId = null;
    for (const person of payload.people) {
      if (person && Array.isArray(person.pose_keypoints_2d)) {
        if (!detectedFormatId) {
          detectedFormatId = detectFormatFromFlat(person.pose_keypoints_2d);
        }
        const kps = extractPreviewKeypointsFromPoseKeypoints2d(
          person.pose_keypoints_2d,
          baseWidth,
          baseHeight,
        );
        if (kps) {
          allKeypoints.push(...kps);
        }
      }
    }
    
    // Detect format and validate based on keypoint count
    const detectedFormat =
      (detectedFormatId && getFormat(detectedFormatId)) ||
      getFormatForPose(allKeypoints);
    const kpCount = detectedFormat && detectedFormat.keypoints ? detectedFormat.keypoints.length : 18;
    
    if (allKeypoints.length >= kpCount && allKeypoints.length % kpCount === 0) {
      return {
        keypoints: allKeypoints,
        width: baseWidth,
        height: baseHeight,
        format: detectedFormat?.id || payload.format,
      };
    }
  }

  if (Array.isArray(payload.pose_keypoints_2d)) {
    const detectedFormatId = detectFormatFromFlat(payload.pose_keypoints_2d);
    const keypoints = extractPreviewKeypointsFromPoseKeypoints2d(
      payload.pose_keypoints_2d,
      baseWidth,
      baseHeight,
    );
    if (keypoints) {
      return {
        keypoints,
        width: baseWidth,
        height: baseHeight,
        format: detectedFormatId || payload.format,
      };
    }
  }

  return null;
}

function renderPreviewPose(canvas, poseData, previewSurface) {
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const width = canvas.width || PREVIEW_CANVAS_SIZE;
  const height = canvas.height || PREVIEW_CANVAS_SIZE;

  ctx.clearRect(0, 0, width, height);
  if (previewSurface) {
    ctx.fillStyle = previewSurface;
    ctx.fillRect(0, 0, width, height);
  }

  if (!poseData || !Array.isArray(poseData.keypoints)) {
    return;
  }

  const baseWidth = Number(poseData.width) || 512;
  const baseHeight = Number(poseData.height) || 512;
  const padding = 8;
  const scale = Math.min(
    (width - padding * 2) / baseWidth,
    (height - padding * 2) / baseHeight,
  );
  const offsetX = (width - baseWidth * scale) / 2;
  const offsetY = (height - baseHeight * scale) / 2;
  const lineWidth = Math.max(1, 4 * scale);
  const radius = Math.max(2, 3 * scale);

  // Get format metadata for rendering (detect from keypoints if not provided)
  let format = poseData.format ? getFormat(poseData.format) : null;
  if (!format) {
    const detectedFormat = getFormatForPose(poseData.keypoints);
    format = detectedFormat || getFormat(DEFAULT_FORMAT_ID);
  }
  
  const kpCount = format && format.keypoints ? format.keypoints.length : 18;
  const skeletonEdges = format.skeletonEdges;
  const skeletonColors = format.skeletonColors;
  const keypointColors = format.keypoints;

  for (let i = 0; i < poseData.keypoints.length; i += kpCount) {
    const person = poseData.keypoints.slice(i, i + kpCount);
    if (person.length < kpCount) {
      continue;
    }
    for (let j = 0; j < skeletonEdges.length; j++) {
      const [a, b] = skeletonEdges[j];
      const pa = person[a];
      const pb = person[b];
      if (!isValidPreviewKeypoint(pa) || !isValidPreviewKeypoint(pb)) {
        continue;
      }
      const strokeColor = `rgba(${skeletonColors[j].join(", ")}, 0.7)`;
      drawBoneWithOutline(
        ctx,
        pa[0] * scale + offsetX,
        pa[1] * scale + offsetY,
        pb[0] * scale + offsetX,
        pb[1] * scale + offsetY,
        strokeColor,
        lineWidth,
      );
    }

    for (let j = 0; j < person.length; j++) {
      const point = person[j];
      if (!isValidPreviewKeypoint(point)) {
        continue;
      }
      const kpColor = keypointColors[j]?.rgb || [255, 255, 255];
      const fillColor = `rgb(${kpColor.join(", ")})`;
      drawKeypointWithOutline(
        ctx,
        point[0] * scale + offsetX,
        point[1] * scale + offsetY,
        fillColor,
        radius,
      );
    }
  }
}

function cloneJsonPayload(payload) {
  if (typeof structuredClone === "function") {
    return structuredClone(payload);
  }
  return JSON.parse(JSON.stringify(payload));
}

function detectComponentFlags(payload) {
  const flags = { body: false, face: false, hands: false };

  const checkPerson = (person) => {
    if (!person || typeof person !== "object") {
      return;
    }
    if (Array.isArray(person.pose_keypoints_2d)) {
      flags.body = true;
    }
    if (Array.isArray(person.face_keypoints_2d)) {
      flags.face = true;
    }
    if (
      Array.isArray(person.hand_left_keypoints_2d) ||
      Array.isArray(person.hand_right_keypoints_2d) ||
      Array.isArray(person.hand_keypoints_2d)
    ) {
      flags.hands = true;
    }
  };

  const checkPoseObject = (pose) => {
    if (!pose || typeof pose !== "object") {
      return;
    }
    if (Array.isArray(pose.keypoints)) {
      flags.body = true;
    }
    if (Array.isArray(pose.pose_keypoints_2d)) {
      flags.body = true;
    }
    if (Array.isArray(pose.face_keypoints_2d)) {
      flags.face = true;
    }
    if (
      Array.isArray(pose.hand_left_keypoints_2d) ||
      Array.isArray(pose.hand_right_keypoints_2d) ||
      Array.isArray(pose.hand_keypoints_2d)
    ) {
      flags.hands = true;
    }
    if (Array.isArray(pose.people)) {
      pose.people.forEach(checkPerson);
    }
  };

  if (!payload || typeof payload !== "object") {
    return flags;
  }

  if (Array.isArray(payload.people)) {
    payload.people.forEach(checkPerson);
  }
  if (Array.isArray(payload.keypoints)) {
    flags.body = true;
  }

  if (payload.people || payload.pose_keypoints_2d || payload.keypoints) {
    checkPoseObject(payload);
    return flags;
  }

  const keys = Object.keys(payload);
  keys.forEach((key) => checkPoseObject(payload[key]));
  return flags;
}

function isLegacyNodePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  if (Array.isArray(payload.people) || Array.isArray(payload.pose_keypoints_2d)) {
    return false;
  }
  if (!Array.isArray(payload.keypoints) || payload.keypoints.length === 0) {
    return false;
  }
  const firstPerson = payload.keypoints[0];
  if (!Array.isArray(firstPerson) || firstPerson.length === 0) {
    return false;
  }
  const firstPoint = firstPerson[0];
  if (firstPoint == null) {
    return true;
  }
  return Array.isArray(firstPoint) && firstPoint.length >= 2;
}

function getPoseFormatInfo(payload) {
  if (!payload || typeof payload !== "object") {
    return { id: null, label: "Unknown" };
  }

  // Try to detect format from payload or keypoints
  let keypoints = null;
  let formatField = null;

  // If it's a pose collection/dictionary, we'll be processing individual poses later,
  // so we don't detect format here. Collections don't have a single format.
  if (isDictionaryPayload(payload)) {
    return { id: null, label: "Unknown" };
  }

  // For single poses, try to detect the format
  // Check for explicit format metadata
  if (payload.format) {
    formatField = payload.format;
  }

  // Get keypoints from the payload if available
  if (Array.isArray(payload.people) && payload.people.length > 0) {
    // Multi-person pose
    const person = payload.people[0];
    if (person && Array.isArray(person.pose_keypoints_2d)) {
      keypoints = person.pose_keypoints_2d;
    }
  } else if (Array.isArray(payload.pose_keypoints_2d)) {
    // Single-person pose
    keypoints = payload.pose_keypoints_2d;
  } else if (Array.isArray(payload.keypoints)) {
    // Raw keypoints array
    keypoints = payload.keypoints;
  }

  const isLegacyNode = isLegacyNodePayload(payload);

  // Detect format from explicit metadata or from the keypoints shape.
  let formatId = null;
  if (typeof formatField === "string") {
    formatId = detectFormatFromMetadata(formatField, keypoints);
  } else if (Array.isArray(keypoints) && keypoints.length > 0) {
    const first = keypoints[0];
    if (typeof first === "number") {
      // Flat pose_keypoints_2d array (x,y,conf,...)
      formatId = detectFormatFromFlat(keypoints);
    } else if (Array.isArray(first)) {
      // Array of persons: each person may be a flat numeric array or an
      // internal 18-slot array of [x,y] pairs (or nulls). Inspect the
      // first person to determine which.
      const person = first;
      if (person.length > 0 && typeof person[0] === "number") {
        // Person represented as flat [x,y,conf,...]
        formatId = detectFormatFromFlat(person);
      } else {
        // Person represented as 18-slot internal array
        formatId = detectFormat(person);
      }
    } else {
      formatId = detectFormatFromMetadata(formatField, keypoints);
    }
  } else {
    formatId = detectFormatFromMetadata(formatField, keypoints);
  }

  const format = getFormat(formatId);

  if (format) {
    if (isLegacyNode && formatId === "coco18") {
      return { id: formatId, label: "COCO-18 (Legacy Node)", isLegacy: true };
    }
    return { id: formatId, label: format.displayName };
  }

  return { id: null, label: "Unknown" };
}


async function selectPosePayload(payload, filename) {
  if (!isDictionaryPayload(payload)) {
    return { posePayload: payload, poseIndex: 0, poseKey: null };
  }

  const keys = Object.keys(payload || {});
  if (!keys.length) {
    return null;
  }

  let selectedIndex = 0;
  if (keys.length > 1) {
    const poseCount = keys.length;
    const response = await showPrompt(
      "Select pose index",
      `Found ${poseCount} poses in this file. Enter the index of the pose you want to load (0–${poseCount - 1}).`,
      "0",
    );
    if (response === null) {
      return { canceled: true };
    }
    const parsed = Number.parseInt(response, 10);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed < keys.length) {
      selectedIndex = parsed;
    }
  }

  const poseKey = keys[selectedIndex];
  const posePayload = payload[poseKey];
  if (!posePayload || typeof posePayload !== "object") {
    return null;
  }

  return { posePayload, poseIndex: selectedIndex, poseKey };
}

function stripPoseComponents(pose, selection) {
  if (!pose || typeof pose !== "object") {
    return;
  }
  if (!selection.body) {
    if ("pose_keypoints_2d" in pose) {
      delete pose.pose_keypoints_2d;
    }
    if ("keypoints" in pose) {
      delete pose.keypoints;
    }
  }
  if (!selection.face && "face_keypoints_2d" in pose) {
    delete pose.face_keypoints_2d;
  }
  if (!selection.hands) {
    if ("hand_left_keypoints_2d" in pose) {
      delete pose.hand_left_keypoints_2d;
    }
    if ("hand_right_keypoints_2d" in pose) {
      delete pose.hand_right_keypoints_2d;
    }
    if ("hand_keypoints_2d" in pose) {
      delete pose.hand_keypoints_2d;
    }
  }
  if (Array.isArray(pose.people)) {
    pose.people.forEach((person) => stripPoseComponents(person, selection));
  }
}

function isDictionaryPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  if (payload.people || payload.pose_keypoints_2d || payload.keypoints) {
    return false;
  }
  return Object.keys(payload).length > 0;
}

function filterPayloadComponents(payload, selection) {
  const clone = cloneJsonPayload(payload);

  if (!clone || typeof clone !== "object") {
    return clone;
  }

  if (isDictionaryPayload(clone)) {
    Object.keys(clone).forEach((key) => {
      stripPoseComponents(clone[key], selection);
    });
    return clone;
  }

  stripPoseComponents(clone, selection);
  return clone;
}

export class PosePresetsMerger {
  constructor(container, openposeInstance = null) {
    this.container = container;
    this.openposeInstance = openposeInstance;
    this.panels = Array.from(container.querySelectorAll(".openpose-merge-panel"));
    this.fileInput = container.querySelector(".openpose-merge-input");
    if (!this.fileInput) {
      this.isReady = false;
      return;
    }
    this.tableBody = container.querySelector(".openpose-merge-tbody");
    this.emptyState = container.querySelector(".openpose-merge-empty");
    this.exportCountLabel = container.querySelector(
      ".openpose-merge-export-count",
    );
    this.exportButton = container.querySelector('[data-action="merge-export"]');
    this.addButton = container.querySelector('[data-action="merge-add"]');
    this.removeButton = container.querySelector('[data-action="merge-remove"]');
    this.clearButton = container.querySelector('[data-action="merge-clear"]');
    this.previewFrame = container.querySelector(
      ".openpose-merge-preview-frame",
    );
    this.previewCanvas = container.querySelector(".openpose-merge-preview");
    if (this.previewCanvas) {
      this.previewCanvas.width = PREVIEW_CANVAS_SIZE;
      this.previewCanvas.height = PREVIEW_CANVAS_SIZE;
    }
    this.entries = [];
    this.lockedPoseFormat = null;
    this.selectedIndex = -1;
    this.needsInitialReset = true;
    this.isReady = true;

    this.fileInput.addEventListener("change", (event) =>
      this.onFilesSelected(event),
    );
    if (this.addButton) {
      this.addButton.addEventListener("click", () => {
        this.fileInput.value = null;
        this.fileInput.click();
      });
    }
    if (this.removeButton) {
      this.removeButton.addEventListener("click", () =>
        this.removeSelectedFile(),
      );
    }
    if (this.clearButton) {
      this.clearButton.addEventListener("click", async () => this.clearAllFiles());
    }
    if (this.exportButton) {
      this.exportButton.addEventListener("click", () => this.exportPresets());
    }

    this.renderTable();
  }

  showMergerToast(message, tone = "info") {
    // Map tone to showToast severity level
    const severityMap = {
      info: "info",
      success: "success",
      warn: "warn",
      error: "error",
      neutral: "info"
    };
    const severity = severityMap[tone] || "info";
    // Only show meaningful toasts (not empty messages)
    if (message && message.trim().length > 0) {
      showToast(severity, t("toast.pose_merger_title"), message);
    }
  }

  getFormatLabel(formatId) {
    if (!formatId) {
      return "Unknown";
    }
    const format = getFormat(formatId);
    return format?.displayName || formatId;
  }

  getOtherFormatId(formatId) {
    if (formatId === "coco17") {
      return "coco18";
    }
    if (formatId === "coco18") {
      return "coco17";
    }
    return null;
  }

  showLockedFormatToast(lockedFormatId) {
    if (!lockedFormatId) {
      this.showMergerToast(t("toast.mixed_formats_not_supported"), "warn");
      return;
    }
    const lockedLabel = this.getFormatLabel(lockedFormatId);
    const otherId = this.getOtherFormatId(lockedFormatId);
    const otherLabel = otherId ? this.getFormatLabel(otherId) : "the other format";
    const message = t("toast.mixed_formats_locked", { lockedLabel, otherLabel });
    this.showMergerToast(message, "warn");
  }

  async onFilesSelected(event) {
    const files = Array.from(event?.target?.files || []);
    if (!files.length) {
      return;
    }
    await this.addFiles(files);
    this.fileInput.value = null;
  }

  async addFiles(files) {
    let addedCount = 0;
    let addedFileCount = 0;
    let skippedCount = 0;
    let formatMismatchCount = 0;
    const existing = new Set(this.entries.map((entry) => entry.key));

    // Don't show a 'reading' toast - only show summary at end

    for (const file of files) {
      let addedForFile = 0;
      let fileSkipped = false;
      let formatMismatch = false;
      let fileFormatId = null;
      const pendingEntries = [];
      const formatsSeen = new Set();
      try {
        const text = await readFileToText(file);
        const payload = JSON.parse(text);

        if (isDictionaryPayload(payload)) {
          const keys = Object.keys(payload || {});
          if (!keys.length) {
            fileSkipped = true;
          } else {
            keys.forEach((poseKey, poseIndex) => {
              const posePayload = payload[poseKey];
              if (!posePayload || typeof posePayload !== "object") {
                return;
              }
              const key = this.getFileKey(file, poseKey, poseIndex);
              if (existing.has(key)) {
                return;
              }
              const components = detectComponentFlags(posePayload);
              // Detect format for individual pose within the collection
              const poseFormat = getPoseFormatInfo(posePayload);
              if (poseFormat?.id) {
                formatsSeen.add(poseFormat.id);
              }
              const entry = {
                file,
                key,
                name: file.name || "Unnamed file",
                baseName: this.getBaseName(file.name || "pose"),
                payload: posePayload,
                format: poseFormat,
                poseIndex,
                poseKey,
                available: components,
                selection: {
                  body: !!components.body,
                  face: !!components.face,
                  hands: !!components.hands,
                },
              };
              pendingEntries.push(entry);
            });
            if (!pendingEntries.length) {
              fileSkipped = true;
            }
          }
        } else {
          const selectionInfo = await selectPosePayload(payload, file.name || "pose");
          if (selectionInfo && selectionInfo.canceled) {
            fileSkipped = true;
          } else {
            const posePayload = selectionInfo?.posePayload || payload;
            if (!posePayload || typeof posePayload !== "object") {
              fileSkipped = true;
            } else {
              const components = detectComponentFlags(posePayload);
              // Detect format for the selected pose
              const poseFormat = getPoseFormatInfo(posePayload);
              if (poseFormat?.id) {
                formatsSeen.add(poseFormat.id);
              }
              const entry = {
                file,
                key: this.getFileKey(
                  file,
                  selectionInfo?.poseKey,
                  selectionInfo?.poseIndex,
                ),
                name: file.name || "Unnamed file",
                baseName: this.getBaseName(file.name || "pose"),
                payload: posePayload,
                format: poseFormat,
                poseIndex: Number.isFinite(selectionInfo?.poseIndex)
                  ? selectionInfo.poseIndex
                  : 0,
                poseKey: selectionInfo?.poseKey || null,
                available: components,
                selection: {
                  body: !!components.body,
                  face: !!components.face,
                  hands: !!components.hands,
                },
              };
              pendingEntries.push(entry);
            }
          }
        }
      } catch (error) {
        fileSkipped = true;
      }

      if (!fileSkipped && pendingEntries.length > 0) {
        if (formatsSeen.size === 1) {
          fileFormatId = Array.from(formatsSeen)[0];
        } else if (formatsSeen.size > 1) {
          formatMismatch = true;
        }

        const lockedFormatId = this.lockedPoseFormat;
        if (!formatMismatch && lockedFormatId) {
          if (!fileFormatId || lockedFormatId !== fileFormatId) {
            formatMismatch = true;
          }
        }

        if (formatMismatch) {
          formatMismatchCount += 1;
          this.showLockedFormatToast(lockedFormatId || fileFormatId);
          fileSkipped = true;
        } else {
          if (!this.lockedPoseFormat && fileFormatId) {
            this.lockedPoseFormat = fileFormatId;
          }
          pendingEntries.forEach((entry) => {
            this.entries.push(entry);
            existing.add(entry.key);
            addedCount += 1;
            addedForFile += 1;
          });
        }
      }

      if (addedForFile > 0) {
        addedFileCount += 1;
      } else if (fileSkipped) {
        skippedCount += 1;
      }
    }

    if (addedCount > 0) {
      this.selectedIndex = this.entries.length - 1;
    } else if (this.entries.length > 0 && this.selectedIndex === -1) {
      this.selectedIndex = 0;
    }

    this.renderTable();

    const poseLabel = addedCount === 1 ? "pose" : "poses";
    const fileCount = files.length;
    const fileLabel = fileCount === 1 ? "file" : "files";
    
    if (addedCount === 0 && files.length > 0 && formatMismatchCount === 0) {
      this.showMergerToast(
        `No valid poses found in ${fileCount} ${fileLabel}.`,
        "warn",
      );
    } else if (addedCount > 0) {
      this.showMergerToast(
        `Added ${addedCount} ${poseLabel} from ${fileCount} ${fileLabel}.`,
        "success",
      );
    }
  }

  getFileKey(file, poseKey, poseIndex) {
    if (!file) {
      return "";
    }
    const base = `${file.name || ""}:${file.size || 0}:${file.lastModified || 0}`;
    if (poseKey) {
      return `${base}:key:${poseKey}`;
    }
    if (Number.isFinite(poseIndex)) {
      return `${base}:index:${poseIndex}`;
    }
    return base;
  }

  getBaseName(filename) {
    const cleanName = (filename || "pose").replace(/\.json$/i, "");
    const base = cleanName.replace(/^.*[/\\]/, "").trim();
    return base || "pose";
  }

  renderTable() {
    if (!this.tableBody || !this.emptyState) {
      return;
    }
    this.tableBody.innerHTML = "";
    if (this.entries.length === 0) {
      this.emptyState.style.display = "block";
      this.selectedIndex = -1;
    } else {
      this.emptyState.style.display = "none";
    }

    const applyRowStyles = (row, selected) => {
      row.style.background = selected
        ? "var(--openpose-hover-bg)"
        : "transparent";
      row.style.cursor = "pointer";
    };

    this.entries.forEach((entry, index) => {
      const row = document.createElement("tr");
      const selected = index === this.selectedIndex;
      applyRowStyles(row, selected);

      const nameCell = document.createElement("td");
      nameCell.textContent = entry.name || "Unnamed file";
      nameCell.style.whiteSpace = "nowrap";
      nameCell.style.overflow = "hidden";
      nameCell.style.textOverflow = "ellipsis";
      nameCell.style.padding = "6px 8px";
      nameCell.style.borderBottom = "1px solid var(--openpose-border)";
      nameCell.style.color = "var(--openpose-text)";

      const indexCell = document.createElement("td");
      const poseIndex = Number.isFinite(entry.poseIndex) ? entry.poseIndex : 0;
      indexCell.textContent = poseIndex;
      indexCell.style.textAlign = "center";
      indexCell.style.padding = "6px 8px";
      indexCell.style.borderBottom = "1px solid var(--openpose-border)";
      indexCell.style.color = "var(--openpose-text-muted)";

      const formatCell = document.createElement("td");
      const formatLabel = entry.format?.label || "Unknown";
      formatCell.textContent = formatLabel;
      if (entry.format?.isLegacy) {
        formatCell.textContent += " ⚠️";
      } else if (!entry.format?.id) {
        formatCell.textContent += " ⚠️";
      }
      formatCell.style.whiteSpace = "nowrap";
      formatCell.style.padding = "6px 8px";
      formatCell.style.borderBottom = "1px solid var(--openpose-border)";
      formatCell.style.color = "var(--openpose-text-muted)";

      const bodyCell = this.createCheckboxCell(entry, "body");
      const faceCell = this.createCheckboxCell(entry, "face");
      const handsCell = this.createCheckboxCell(entry, "hands");
      const actionCell = this.createActionsCell(entry, index);

      row.appendChild(nameCell);
      row.appendChild(indexCell);
      row.appendChild(formatCell);
      row.appendChild(bodyCell);
      row.appendChild(faceCell);
      row.appendChild(handsCell);
      row.appendChild(actionCell);

      row.addEventListener("click", (event) => {
        if ((event.target?.tagName || "").toLowerCase() === "input") {
          return;
        }
        this.selectedIndex = index;
        this.renderTable();
      });

      this.tableBody.appendChild(row);
    });

    this.updateExportCount();
    this.updateActionStates();
    this.updatePreview();
  }

  applyRemovalState() {
    this.renderTable();
  }

  refreshOnShow() {
    if (!this.needsInitialReset) {
      return;
    }
    this.needsInitialReset = false;
    this.applyRemovalState();
  }

  handleKeyDown(event) {
    const key = event?.key;
    if (!key || !this.entries || this.entries.length === 0) {
      return false;
    }
    if (key === "Delete" || key === "Backspace") {
      if (this.selectedIndex >= 0 && this.selectedIndex < this.entries.length) {
        this.removeSelectedFile();
        return true;
      }
      return false;
    }
    if (key !== "ArrowUp" && key !== "ArrowDown") {
      return false;
    }
    let nextIndex = this.selectedIndex;
    if (nextIndex === -1) {
      nextIndex = key === "ArrowDown" ? 0 : this.entries.length - 1;
    } else {
      nextIndex += key === "ArrowDown" ? 1 : -1;
    }
    nextIndex = Math.max(0, Math.min(this.entries.length - 1, nextIndex));
    if (nextIndex === this.selectedIndex) {
      return false;
    }
    this.selectedIndex = nextIndex;
    this.renderTable();
    return true;
  }

  createCheckboxCell(entry, key) {
    const cell = document.createElement("td");
    if (!entry.available[key]) {
      const icon = document.createElement("span");
      icon.className = "openpose-merge-unavailable";
      icon.textContent = "❌";
      cell.appendChild(icon);
    } else {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!entry.selection[key];
      checkbox.addEventListener("change", () => {
        entry.selection[key] = checkbox.checked;
        this.updateActionStates();
      });
      cell.appendChild(checkbox);
    }
    cell.style.textAlign = "center";
    cell.style.padding = "6px 8px";
    cell.style.borderBottom = "1px solid var(--openpose-border)";
    return cell;
  }

  createActionsCell(entry, index) {
    const cell = document.createElement("td");
    const actions = document.createElement("div");
    actions.style.display = "inline-flex";
    actions.style.alignItems = "center";
    actions.style.gap = "4px";

    const insertButton = document.createElement("button");
    insertButton.type = "button";
    insertButton.textContent = "\u{1F4C2}";
    insertButton.className = "openpose-btn openpose-merge-insert";
    insertButton.title = "Insert this pose to canvas.";
    insertButton.style.padding = "4px 6px";
    insertButton.style.border = "1px solid var(--openpose-border)";
    insertButton.style.borderRadius = "4px";
    insertButton.style.background = "var(--openpose-btn-bg)";
    insertButton.style.color = "var(--openpose-text)";
    insertButton.style.cursor = "pointer";
    insertButton.style.fontSize = "12px";
    insertButton.style.fontFamily = "Arial, sans-serif";
    insertButton.style.lineHeight = "1";
    insertButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.insertPoseToCanvas(entry);
    });

    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.textContent = "\u{1F4BE}";
    exportButton.className = "openpose-btn openpose-merge-single-export";
    exportButton.title =
      "Export only this file's selected components as a single JSON.";
    exportButton.style.padding = "4px 6px";
    exportButton.style.border = "1px solid var(--openpose-border)";
    exportButton.style.borderRadius = "4px";
    exportButton.style.background = "var(--openpose-btn-bg)";
    exportButton.style.color = "var(--openpose-text)";
    exportButton.style.cursor = "pointer";
    exportButton.style.fontSize = "12px";
    exportButton.style.fontFamily = "Arial, sans-serif";
    exportButton.style.lineHeight = "1";
    exportButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.exportSingle(entry);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "\u{1F5D1}\u{FE0F}";
    deleteButton.className = "openpose-btn openpose-merge-delete";
    deleteButton.title = "Remove this file from the list.";
    deleteButton.style.padding = "4px 6px";
    deleteButton.style.border = "1px solid var(--openpose-border)";
    deleteButton.style.borderRadius = "4px";
    deleteButton.style.background = "var(--openpose-btn-bg)";
    deleteButton.style.color = "var(--openpose-text)";
    deleteButton.style.cursor = "pointer";
    deleteButton.style.fontSize = "12px";
    deleteButton.style.fontFamily = "Arial, sans-serif";
    deleteButton.style.lineHeight = "1";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.selectedIndex = index;
      this.removeSelectedFile();
    });

    cell.style.textAlign = "center";
    cell.style.padding = "6px 8px";
    cell.style.borderBottom = "1px solid var(--openpose-border)";
    actions.appendChild(insertButton);
    actions.appendChild(exportButton);
    actions.appendChild(deleteButton);
    cell.appendChild(actions);
    entry.singleExportButton = exportButton;
    this.updateSingleExportButton(entry);
    return cell;
  }

  updateActionStates() {
    // Add File button should always be enabled
    if (this.addButton) {
      this.addButton.disabled = false;
      this.addButton.style.opacity = "1";
      this.addButton.style.cursor = "pointer";
    }
    if (this.removeButton) {
      const hasSelection = this.selectedIndex >= 0;
      this.removeButton.disabled = !hasSelection;
      this.removeButton.style.opacity = hasSelection ? "1" : "0.6";
      this.removeButton.style.cursor = hasSelection ? "pointer" : "not-allowed";
    }
    if (this.clearButton) {
      const hasEntries = this.entries.length > 0;
      this.clearButton.disabled = !hasEntries;
      this.clearButton.style.opacity = hasEntries ? "1" : "0.6";
      this.clearButton.style.cursor = hasEntries ? "pointer" : "not-allowed";
    }
    if (this.exportButton) {
      const hasSelections = this.entries.some(
        (entry) =>
          entry.selection.body || entry.selection.face || entry.selection.hands,
      );
      this.exportButton.disabled = !hasSelections;
      this.exportButton.style.opacity = hasSelections ? "1" : "0.6";
      this.exportButton.style.cursor = hasSelections
        ? "pointer"
        : "not-allowed";
    }
    this.entries.forEach((entry) => this.updateSingleExportButton(entry));
  }
  updateSingleExportButton(entry) {
    if (!entry?.singleExportButton) {
      return;
    }
    const enabled = !!(
      entry.selection.body ||
      entry.selection.face ||
      entry.selection.hands
    );
    entry.singleExportButton.disabled = !enabled;
    entry.singleExportButton.style.opacity = enabled ? "1" : "0.6";
    entry.singleExportButton.style.cursor = enabled ? "pointer" : "not-allowed";
  }

  getExportPoseCount(entries) {
    const source = Array.isArray(entries) ? entries : this.entries;
    return source.reduce((total, entry) => {
      if (!entry || !entry.payload || typeof entry.payload !== "object") {
        return total;
      }
      if (isDictionaryPayload(entry.payload)) {
        return total + Object.keys(entry.payload || {}).length;
      }
      return total + 1;
    }, 0);
  }

  updateExportCount() {
    if (!this.exportCountLabel) {
      return;
    }
    const count = this.getExportPoseCount();
    this.exportCountLabel.textContent = `Poses to export: ${count}`;
  }

  updatePreviewSize(poseData) {
    if (!this.previewCanvas) {
      return;
    }
    const cssWidth = Math.max(
      120,
      Math.round(
        this.previewFrame?.clientWidth ||
          this.previewCanvas.clientWidth ||
          PREVIEW_CANVAS_SIZE,
      ),
    );
    let cssHeight = Math.round(this.previewFrame?.clientHeight || 0);
    if (!cssHeight) {
      const baseWidth = Number(poseData?.width) || 512;
      const baseHeight = Number(poseData?.height) || 512;
      const ratio = baseWidth > 0 ? baseHeight / baseWidth : 1;
      cssHeight = Math.max(60, Math.round(cssWidth * ratio));
    }

    if (
      this.previewCanvas.width !== cssWidth ||
      this.previewCanvas.height !== cssHeight
    ) {
      this.previewCanvas.width = cssWidth;
      this.previewCanvas.height = cssHeight;
    }
    if (!this.previewFrame) {
      this.previewCanvas.style.height = `${cssHeight}px`;
    }
  }

  renderPreviewMessage(message) {
    if (!this.previewCanvas) {
      return;
    }
    const ctx = this.previewCanvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const cssWidth = Math.max(
      120,
      Math.round(
        this.previewFrame?.clientWidth ||
          this.previewCanvas.clientWidth ||
          PREVIEW_CANVAS_SIZE,
      ),
    );
    const fontSize = 12;
    const paddingY = fontSize;
    let cssHeight = Math.round(this.previewFrame?.clientHeight || 0);
    if (!cssHeight) {
      cssHeight = Math.max(32, Math.round(fontSize + paddingY * 2));
    }

    if (
      this.previewCanvas.width !== cssWidth ||
      this.previewCanvas.height !== cssHeight
    ) {
      this.previewCanvas.width = cssWidth;
      this.previewCanvas.height = cssHeight;
    }
    if (!this.previewFrame) {
      this.previewCanvas.style.height = `${cssHeight}px`;
    }

    const width = this.previewCanvas.width;
    const height = this.previewCanvas.height;
    const previewSurface = this.getPreviewSurfaceFill();

    ctx.clearRect(0, 0, width, height);
    if (previewSurface) {
      ctx.fillStyle = previewSurface;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.fillStyle = "#777";
    ctx.font = `${fontSize}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(message, width / 2, height / 2);
  }

  renderPreviewUnavailable() {
    if (!this.previewCanvas) {
      return;
    }
    const ctx = this.previewCanvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const cssWidth = Math.max(
      120,
      Math.round(
        this.previewFrame?.clientWidth ||
          this.previewCanvas.clientWidth ||
          PREVIEW_CANVAS_SIZE,
      ),
    );
    let cssHeight = Math.round(this.previewFrame?.clientHeight || 0);
    if (!cssHeight) {
      cssHeight = cssWidth;
    }

    if (
      this.previewCanvas.width !== cssWidth ||
      this.previewCanvas.height !== cssHeight
    ) {
      this.previewCanvas.width = cssWidth;
      this.previewCanvas.height = cssHeight;
    }
    if (!this.previewFrame) {
      this.previewCanvas.style.height = `${cssHeight}px`;
    }

    const width = this.previewCanvas.width;
    const height = this.previewCanvas.height;
    const previewSurface = this.getPreviewSurfaceFill();

    ctx.clearRect(0, 0, width, height);
    if (previewSurface) {
      ctx.fillStyle = previewSurface;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 80px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u26A0\uFE0F", width / 2, height / 2);
  }

  getPreviewSurfaceFill() {
    if (this.openposeInstance && typeof this.openposeInstance.getPreviewSurfaceFill === "function") {
      return this.openposeInstance.getPreviewSurfaceFill();
    }
    return "transparent";
  }

  updatePreview() {
    if (!this.previewCanvas) {
      return;
    }
    const entry = this.entries[this.selectedIndex];
    if (!entry) {
      this.renderPreviewMessage("No pose selected");
      return;
    }
    const poseData = getPreviewPoseData(entry.payload);
    if (!poseData) {
      this.renderPreviewUnavailable();
      return;
    }
    this.updatePreviewSize(poseData);
    renderPreviewPose(this.previewCanvas, poseData, this.getPreviewSurfaceFill());
  }
  removeSelectedFile() {
    if (this.selectedIndex < 0 || this.selectedIndex >= this.entries.length) {
      this.showMergerToast("Select a file to remove.", "warn");
      return;
    }
    this.entries.splice(this.selectedIndex, 1);
    if (this.entries.length === 0) {
      this.selectedIndex = -1;
      this.lockedPoseFormat = null;
    } else if (this.selectedIndex >= this.entries.length) {
      this.selectedIndex = this.entries.length - 1;
    }
    this.applyRemovalState();
  }

  async clearAllFiles() {
    if (this.entries.length === 0) {
      return;
    }
    const ok = await showConfirm("Clear list?", "Clear all added files?");
    if (!ok) {
      return;
    }
    this.entries = [];
    this.selectedIndex = -1;
    this.lockedPoseFormat = null;
    this.applyRemovalState();
  }

  getUniqueKey(base, usedKeys) {
    let key = (base || "pose").trim();
    if (!key) {
      key = "pose";
    }
    let candidate = key;
    let index = 2;
    while (usedKeys.has(candidate)) {
      candidate = `${key}_${index}`;
      index += 1;
    }
    usedKeys.add(candidate);
    return candidate;
  }

  mergeEntries(entries) {
    const payload = {};
    const usedKeys = new Set();
    let mergedCount = 0;
    let skippedCount = 0;

    for (const entry of entries) {
      if (!entry || !entry.payload) {
        skippedCount += 1;
        continue;
      }
      const selection = entry.selection || {
        body: true,
        face: true,
        hands: true,
      };
      if (!selection.body && !selection.face && !selection.hands) {
        skippedCount += 1;
        continue;
      }
      const filtered = filterPayloadComponents(entry.payload, selection);
      if (isDictionaryPayload(entry.payload)) {
        const keys = Object.keys(filtered || {});
        for (const key of keys) {
          const pose = filtered[key];
          if (!pose || typeof pose !== "object") {
            continue;
          }
          const remaining = detectComponentFlags(pose);
          if (!remaining.body && !remaining.face && !remaining.hands) {
            skippedCount += 1;
            continue;
          }
          const uniqueKey = this.getUniqueKey(key, usedKeys);
          payload[uniqueKey] = pose;
          mergedCount += 1;
        }
      } else {
        const remaining = detectComponentFlags(filtered);
        if (!remaining.body && !remaining.face && !remaining.hands) {
          skippedCount += 1;
          continue;
        }
        const uniqueKey = this.getUniqueKey(
          entry.poseKey || entry.baseName || "pose",
          usedKeys,
        );
        payload[uniqueKey] = filtered;
        mergedCount += 1;
      }
    }

    return { payload, mergedCount, skippedCount };
  }

  exportPresets() {
    const entries = Array.from(this.entries || []);
    const exportCount = this.getExportPoseCount(entries);
    if (exportCount <= 1) {
      this.showMergerToast(
        "Collection needs at least 2 poses. Use single-pose export for one pose.",
        "warn",
      );
      return;
    }
    if (entries.length === 0) {
      this.showMergerToast("Add at least one JSON file.", "warn");
      return;
    }
    const hasSelections = entries.some(
      (entry) =>
        entry.selection?.body ||
        entry.selection?.face ||
        entry.selection?.hands,
    );
    if (!hasSelections) {
      this.showMergerToast("Select at least one component to export.", "warn");
      return;
    }
    if (this.exportButton) {
      this.exportButton.disabled = true;
    }
    try {
      const filename = "pose-collection.json";
      // Don't show processing toast - only show result
      const { payload, mergedCount, skippedCount } = this.mergeEntries(entries);
      if (!mergedCount) {
        this.showMergerToast("No valid poses were generated.", "error");
        return;
      }
      const json = JSON.stringify(payload, null, 4);
      const blob = new Blob([json], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename || "pose-collection.json";
      link.click();
      URL.revokeObjectURL(link.href);

      const extra = skippedCount ? ` (${skippedCount} skipped)` : "";
      this.showMergerToast(`Exported ${mergedCount} pose(s)${extra}.`, "success");
    } catch (error) {
      this.showMergerToast("Error exporting poses collection.", "error");
    } finally {
      if (this.exportButton) {
        this.exportButton.disabled = false;
      }
    }
  }

  exportSingle(entry) {
    if (!entry || !entry.payload) {
      this.showMergerToast("Select a valid file to export.", "warn");
      return;
    }
    const selection = entry.selection || {
      body: true,
      face: true,
      hands: true,
    };
    if (!selection.body && !selection.face && !selection.hands) {
      this.showMergerToast("Select at least one component to export.", "warn");
      return;
    }
    // Don't show exporting toast - only show result
    try {
      const filtered = filterPayloadComponents(entry.payload, selection);
      const remaining = detectComponentFlags(filtered);
      if (!remaining.body && !remaining.face && !remaining.hands) {
        this.showMergerToast("No valid components remain after filtering.", "error");
        return;
      }
      let filename = `${entry.baseName || "pose"}-cleaned.json`;
      const json = JSON.stringify(filtered, null, 4);
      const blob = new Blob([json], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
      this.showMergerToast("Pose exported.", "success");
    } catch (error) {
      this.showMergerToast("Error exporting pose.", "error");
    }
  }

  /**
   * Preflight step: Parse, normalize, validate, and prepare pose for insertion
   * without any side effects. Returns { success, keypoints, format, bounds } or
   * { success: false, reason } on failure.
   */
  preflightInsertionCheck(entry) {
    // Step 1: Validate entry has payload
    if (!entry || !entry.payload) {
      return { success: false, reason: "No valid pose data in entry." };
    }

    // Step 2: Extract and parse pose data
    let poseData;
    try {
      poseData = getPreviewPoseData(entry.payload);
    } catch (e) {
      return { success: false, reason: `Failed to parse pose JSON: ${e.message}` };
    }

    if (!poseData || !poseData.keypoints || poseData.keypoints.length === 0) {
      return { success: false, reason: "Pose format not supported or no valid keypoints found." };
    }

    const keypoints = poseData.keypoints;
    const baseWidth = poseData.width || 512;
    const baseHeight = poseData.height || 512;

    // Step 3: Detect format and validate keypoint count
    let detectedFormat;
    try {
      detectedFormat = getFormatForPose(keypoints);
    } catch (e) {
      return { success: false, reason: `Failed to detect pose format: ${e.message}` };
    }

    if (!detectedFormat) {
      return { success: false, reason: "Could not automatically detect pose format from keypoint count." };
    }

    const kpCount = detectedFormat.keypoints ? detectedFormat.keypoints.length : 18;

    // Validate keypoint count
    if (keypoints.length < kpCount) {
      return {
        success: false,
        reason: `Invalid keypoint count: expected at least ${kpCount}, got ${keypoints.length}.`
      };
    }

    // Check that poses are chunked correctly
    const totalPerson = Math.floor(keypoints.length / kpCount);
    const remainder = keypoints.length % kpCount;
    if (remainder !== 0) {
      return {
        success: false,
        reason: `Keypoint array is not a multiple of ${kpCount}. Found ${remainder} extra keypoints.`
      };
    }

    if (totalPerson === 0) {
      return { success: false, reason: "No complete pose persons found in keypoint data." };
    }

    if (detectedFormat && !isFormatEditAllowed(detectedFormat.id)) {
      return { success: false, reason: t(`toast.${detectedFormat.id}_edit_disabled`) };
    }

    // Step 4: Format compatibility check (check against canvas, not keypoints directly)
    // We pass the first person to check compatibility
    const firstPersonKeypoints = keypoints.slice(0, kpCount);
    if (!this.openposeInstance.checkFormatCompatibility(firstPersonKeypoints)) {
      // checkFormatCompatibility already shows a toast, so don't show another
      return { success: false, reason: "", skipToast: true };
    }

    // Step 5: Compute pose bounds (min/max X/Y) to determine if resize is needed
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hasValidKeypoint = false;

    for (let i = 0; i < keypoints.length; i++) {
      const point = keypoints[i];
      if (!Array.isArray(point) || point.length < 2) {
        continue;
      }
      const x = Number(point[0]);
      const y = Number(point[1]);
      // Check if it's a valid keypoint (not [0, 0])
      if (Number.isFinite(x) && Number.isFinite(y) && !(x === 0 && y === 0)) {
        hasValidKeypoint = true;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (!hasValidKeypoint) {
      return { success: false, reason: "No valid keypoints found in pose data." };
    }

    const bounds = { minX, minY, maxX, maxY };

    // Preflight passed - return prepared data (ready for commit phase)
    return {
      success: true,
      keypoints,
      detectedFormat,
      kpCount,
      baseWidth,
      baseHeight,
      totalPerson,
      bounds
    };
  }

  insertPoseToCanvas(entry) {
    if (!this.openposeInstance) {
      this.showMergerToast("Cannot insert pose: OpenPose instance not available.", "error");
      return;
    }

    // Guard: Enforce Body-only insertion (current limitation)
    // Body must be selected; Face/Hands are not yet supported
    if (!entry.selection || !entry.selection.body) {
      showToast(
        "warn",
        t("toast.pose_merger_title"),
        t("toast.body_only_required"),
        8000  // Show for 8 seconds
      );
      return; // Abort with zero side effects
    }

    // ============ PREFLIGHT PHASE ============
    // Validate everything before any side effects (resize, mutation)
    const preflightResult = this.preflightInsertionCheck(entry);
    if (!preflightResult.success) {
      // Only show toast if we haven't already shown one (e.g., from checkFormatCompatibility)
      if (preflightResult.reason && !preflightResult.skipToast) {
        this.showMergerToast(preflightResult.reason, "error");
      }
      return; // Abort with zero side effects
    }

    const {
      keypoints,
      kpCount,
      baseWidth,
      baseHeight,
      bounds
    } = preflightResult;

    // ============ COMMIT PHASE ============
    // At this point, preflight passed, so we can safely proceed with side effects

    const oldWidth = this.openposeInstance.canvasWidth;
    const oldHeight = this.openposeInstance.canvasHeight;
    const newWidth = Math.max(oldWidth, baseWidth);
    const newHeight = Math.max(oldHeight, baseHeight);
    const resizeNeeded = newWidth > oldWidth || newHeight > oldHeight;

    try {
      // Resize canvas if needed (now guaranteed to succeed since preflight passed)
      if (resizeNeeded) {
        this.openposeInstance.resizeCanvas(newWidth, newHeight);
        showToast(
          "info",
          "OpenPose Studio",
          t("toast.canvas_auto_resized", { oldWidth, oldHeight, newWidth, newHeight }),
          4500
        );
      }

      // Add the pose(s) to canvas (handle multi-person poses by chunking every kpCount keypoints)
      // Pass the file-level detectedFormat.id so every person from this file uses the same
      // format, preventing a sparse person (e.g. missing neck) being mis-detected as COCO-17.
      const insertFormatId = preflightResult.detectedFormat?.id || null;
      for (let i = 0; i < keypoints.length; i += kpCount) {
        const personKeypoints = keypoints.slice(i, i + kpCount);
        const addResult = this.openposeInstance.addPose(personKeypoints, null, null, null, insertFormatId);
        if (addResult === false) {
          // addPose returned false; this should not happen if preflight passed
          // but wrap in try/catch for safety
          throw new Error("Failed to add pose (format compatibility check failed unexpectedly).");
        }
      }

      // Commit: record history and save state
      this.openposeInstance.recordHistory();
      this.openposeInstance.saveToNode();

      // Switch to Pose Editor tab to immediately show the inserted pose
      this.openposeInstance.setActiveTab("editor");

      // Show success toast with component awareness (no counts)
      const fmtName = preflightResult && preflightResult.detectedFormat && preflightResult.detectedFormat.displayName ? preflightResult.detectedFormat.displayName : "Pose";
      const baseMessage = `${fmtName} pose added to canvas.`;
      
      // Check if Face or Hands were also selected (but not inserted)
      const faceMentioned = entry.selection && entry.selection.face;
      const handsMentioned = entry.selection && entry.selection.hands;
      
      if (faceMentioned || handsMentioned) {
        const ignoredComponents = [];
        if (faceMentioned) ignoredComponents.push("Face");
        if (handsMentioned) ignoredComponents.push("Hands");
        const ignoredList = ignoredComponents.join(" and ");
        const fullMessage = `${baseMessage} ${ignoredList} keypoints not supported yet and were ignored.`;
        this.showMergerToast(fullMessage, "success");
      } else {
        this.showMergerToast(baseMessage, "success");
      }

    } catch (error) {
      // Commit phase failed: roll back canvas size
      if (resizeNeeded) {
        this.openposeInstance.resizeCanvas(oldWidth, oldHeight);
      }
      this.showMergerToast(`Error inserting pose: ${error.message}`, "error");
    }
  }

  setPanelsVisible(visible) {
    const panels = Array.from(this.panels || []);
    panels.forEach((panel) => {
      if (!panel) {
        return;
      }
      panel.hidden = !visible;
      panel.setAttribute("aria-hidden", visible ? "false" : "true");
      if (visible) {
        const prev = panel.dataset.mergePrevDisplay || "flex";
        panel.style.display = prev;
        delete panel.dataset.mergePrevDisplay;
      } else {
        if (!panel.dataset.mergePrevDisplay) {
          const current = panel.style.display;
          panel.dataset.mergePrevDisplay = current && current !== "none" ? current : "flex";
        }
        panel.style.display = "none";
      }
    });
  }
}

export function setupPosePresetsMerger(container, openposeInstance = null) {
  return new PosePresetsMerger(container, openposeInstance);
}

const poseMergerState = {
  presetsMerger: null
};

registerModule({
  id: "merge",
  labelKey: "pose_merger.summary.title",
  order: 20,
  slot: "module-panels",
  buildUI: buildPresetsMergerOverlayHtml,
  initUI: (container, openpose) => {
    poseMergerOverlay.initUI(container);
    poseMergerState.presetsMerger = setupPosePresetsMerger(container, openpose);
  },
  onActivate: ({ openpose }) => {
    if (!openpose) {
      return;
    }
    openpose.setSidebarsVisible(false);
    openpose.setOverlayPlaceholderWidths(true);
    openpose.setCanvasAreaVisible(false);
    openpose.setSidebarControlsDisabled(true);
    openpose.setBackgroundControlsEnabled(false);
    if (poseMergerState.presetsMerger) {
      poseMergerState.presetsMerger.setPanelsVisible(true);
      poseMergerState.presetsMerger.refreshOnShow();
    }
  },
  onDeactivate: () => {
    poseMergerState.presetsMerger?.setPanelsVisible(false);
  },
  handleKeyDown: (event) => poseMergerState.presetsMerger?.handleKeyDown(event),
  summary: {
    icon: UiIcons.svg('layers', { size: 14, className: 'openpose-sidebar-icon' }),
    titleKey: "pose_merger.summary.title",
    descriptionKey: "pose_merger.summary.description"
  }
});
