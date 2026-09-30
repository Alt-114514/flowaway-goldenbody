"use strict";

(function () {
  if (!window.protectedGlobals) return;

  const DESKTOP_DIR = "/desktop";
  const LAYER_ID = "desktop-shortcuts-layer";
  const MENU_ID = "desktop-shortcut-context-menu";
  const SHORTCUT_BUBBLE = {
    width: 92,
    height: 92,
    gapX: 10,
    gapY: 26,
    paddingX: 20,
    paddingY: 18,
  };

  window.protectedGlobals.shortcuts = Array.isArray(window.protectedGlobals.shortcuts)
    ? window.protectedGlobals.shortcuts
    : [];

  function safeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeShortcutFilename(value) {
    const base = String(value || "shortcut")
      .trim()
      .replace(/\\/g, "/")
      .replace(/[^a-zA-Z0-9_.-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "shortcut";
    return `${base}.json`;
  }

  function normalizeShortcutPath(value) {
    return String(value || "").replace(/\\/g, "/").trim();
  }

  function getDesktopBounds() {
    const taskbarHeight = Number(window.protectedGlobals.currentTaskbarHeight || window.protectedGlobals.taskbar?.offsetHeight || 60);
    const taskbarOnTop = !!(window.protectedGlobals.data && window.protectedGlobals.data.taskbarOnTop);
    return {
      taskbarHeight,
      top: taskbarOnTop ? taskbarHeight : 0,
      bottom: taskbarOnTop ? 0 : taskbarHeight,
      width: window.innerWidth,
      height: Math.max(200, window.innerHeight - taskbarHeight),
    };
  }

  function getShortcutPositionBounds() {
    return {
      minX: 12,
      maxX: Math.max(12, window.innerWidth - SHORTCUT_BUBBLE.width - 16),
      minY: 12,
      maxY: Math.max(12, window.innerHeight - SHORTCUT_BUBBLE.height - 26),
    };
  }

  function getShortcutBubbleRect(x, y) {
    return {
      left: Number(x) || 0,
      top: Number(y) || 0,
      right: (Number(x) || 0) + SHORTCUT_BUBBLE.width,
      bottom: (Number(y) || 0) + SHORTCUT_BUBBLE.height,
    };
  }

  function shortcutRectsOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function getShortcutGrid() {
    const bounds = getDesktopBounds();
    const itemWidth = SHORTCUT_BUBBLE.width;
    const itemHeight = SHORTCUT_BUBBLE.height;
    const cellW = itemWidth + SHORTCUT_BUBBLE.gapX;
    const cellH = itemHeight + SHORTCUT_BUBBLE.gapY;
    return {
      bounds,
      paddingX: SHORTCUT_BUBBLE.paddingX,
      paddingY: SHORTCUT_BUBBLE.paddingY,
      itemWidth,
      itemHeight,
      cellW,
      cellH,
      maxCols: Math.max(1, Math.floor((bounds.width - SHORTCUT_BUBBLE.paddingX * 2) / cellW)),
    };
  }

  function getNextShortcutPosition(existingItems = [], requestedIndex = 0) {
    const { paddingX, paddingY, cellW, cellH, maxCols } = getShortcutGrid();
    const bounds = getShortcutPositionBounds();
    const existing = Array.isArray(existingItems) ? existingItems : [];
    const freePositions = [];

    for (let row = 0; row < 200; row++) {
      for (let col = 0; col < maxCols; col++) {
        const x = paddingX + col * cellW;
        const y = paddingY + row * cellH;
        const clampedX = clamp(x, bounds.minX, bounds.maxX);
        const clampedY = clamp(y, bounds.minY, bounds.maxY);
        const slotRect = getShortcutBubbleRect(clampedX, clampedY);
        const collides = existing.some((entry) => {
          const entryRect = getShortcutBubbleRect(Number(entry.x) || 0, Number(entry.y) || 0);
          return shortcutRectsOverlap(slotRect, entryRect);
        });
        if (!collides) {
          freePositions.push({ x: clampedX, y: clampedY });
        }
      }
    }

    const targetIndex = Math.max(0, Math.min(Number(requestedIndex) || 0, freePositions.length - 1));
    if (!freePositions.length) {
      return { x: paddingX, y: paddingY };
    }
    return freePositions[targetIndex] || freePositions[0];
  }

  function getAllShortcutGridSlots() {
    const { paddingX, paddingY, cellW, cellH, maxCols } = getShortcutGrid();
    const bounds = getShortcutPositionBounds();
    const slots = [];
    for (let row = 0; row < 200; row++) {
      for (let col = 0; col < maxCols; col++) {
        const x = clamp(paddingX + col * cellW, bounds.minX, bounds.maxX);
        const y = clamp(paddingY + row * cellH, bounds.minY, bounds.maxY);
        slots.push({ x, y });
      }
    }
    return slots;
  }

  function getClosestAvailableShortcutSlot(shortcut, occupiedSlots = []) {
    const currentX = Number(shortcut.x) || 0;
    const currentY = Number(shortcut.y) || 0;
    const { paddingX, paddingY, cellW, cellH } = getShortcutGrid();
    const slots = getAllShortcutGridSlots();
    const occupiedRects = (Array.isArray(occupiedSlots) ? occupiedSlots : []).map((slot) => getShortcutBubbleRect(Number(slot.x) || 0, Number(slot.y) || 0));

    const currentCellX = Math.round((currentX - paddingX) / cellW);
    const currentCellY = Math.round((currentY - paddingY) / cellH);

    let best = null;
    for (const slot of slots) {
      const slotRect = getShortcutBubbleRect(slot.x, slot.y);
      const overlapsExisting = occupiedRects.some((rect) => shortcutRectsOverlap(slotRect, rect));
      if (overlapsExisting) continue;

      const slotCellX = Math.round((slot.x - paddingX) / cellW);
      const slotCellY = Math.round((slot.y - paddingY) / cellH);
      const cellDelta = Math.abs(slotCellX - currentCellX) + Math.abs(slotCellY - currentCellY);
      const distance = Math.hypot(slot.x - currentX, slot.y - currentY);
      const score = cellDelta * 1000 + distance;
      if (!best || score < best.score || (score === best.score && (slot.y < best.slot.y || (slot.y === best.slot.y && slot.x < best.slot.x)))) {
        best = { slot, score };
      }
    }

    return best ? best.slot : { x: currentX, y: currentY };
  }

  function findClosestFreeSpot() {
    return getNextShortcutPosition(
      (Array.isArray(window.protectedGlobals.shortcuts) ? window.protectedGlobals.shortcuts : []).map((s) => ({ x: Number(s.x) || 0, y: Number(s.y) || 0 })),
      0,
    );
  }

  function nextShortcutPosition() {
    return getNextShortcutPosition(
      Array.isArray(window.protectedGlobals.shortcuts) ? window.protectedGlobals.shortcuts : [],
      (Array.isArray(window.protectedGlobals.shortcuts) ? window.protectedGlobals.shortcuts.length : 0),
    );
  }

  function normalizeShortcut(raw) {
    if (!raw || typeof raw !== "object") return null;
    const type = String(raw.type || "").toLowerCase();
    let finalType = type;
    if (!["app", "file", "folder"].includes(finalType)) {
      // infer type when missing
      if (raw.appId || String(raw.path || "").indexOf("/systemfiles/runtime/apps/") === 0) finalType = "app";
      else if (String(raw.path || "").endsWith("/")) finalType = "folder";
      else finalType = String(raw.path || "").includes(".") ? "file" : "folder";
    }

    const label = String(raw.label || raw.name || raw.appId || raw.id || "Shortcut").trim() || "Shortcut";
    const item = {
      id: String(raw.id || raw.appId || raw.path || label || `shortcut-${Date.now()}`).trim() || `shortcut-${Date.now()}`,
      type: finalType,
      label,
      path: normalizeShortcutPath(raw.path),
      appId: String(raw.appId || raw.id || "").trim(),
      name: String(raw.name || label).trim(),
      x: safeNumber(raw.x, 24),
      y: safeNumber(raw.y, 24),
      fileName: String(raw.fileName || "").trim(),
    };

    // ensure apps carry appId; non-app entries must not have appId
    if (finalType !== "app") {
      item.appId = "";
    } else if (!item.appId) {
      item.appId = item.id;
    }
    if (!item.path && finalType !== "app") return null;
    const bounds = getShortcutPositionBounds();
    item.x = clamp(item.x, bounds.minX, bounds.maxX);
    item.y = clamp(item.y, bounds.minY, bounds.maxY);
    return item;
  }

  function getShortcutThemePalette() {
    return {
      text: "#f8fafc",
      label: "rgba(15, 23, 42, 0.82)",
      iconBg: "rgba(15, 23, 42, 0.46)",
      iconBorder: "rgba(255,255,255,0.12)",
      iconShadow: "rgba(0,0,0,0.18)",
    };
  }

  function applyShortcutThemeToNode(itemNode, labelNode, iconNode) {
    const palette = getShortcutThemePalette();
    if (itemNode) {
      itemNode.style.color = palette.label;
      itemNode.style.textShadow = "0 1px 2px rgba(0,0,0,0.16)";
    }
    if (labelNode) {
      labelNode.style.color = palette.label;
    }
    if (iconNode) {
      iconNode.style.color = palette.text;
      iconNode.style.background = palette.iconBg;
      iconNode.style.border = `1px solid ${palette.iconBorder}`;
      iconNode.style.boxShadow = `0 8px 18px ${palette.iconShadow}`;
    }
  }

  function renderShortcutIcon(shortcut) {
    const iconWrap = document.createElement("div");
    iconWrap.className = "desktop-shortcut-icon";
    iconWrap.style.display = "flex";
    iconWrap.style.alignItems = "center";
    iconWrap.style.justifyContent = "center";
    iconWrap.style.width = "42px";
    iconWrap.style.height = "42px";
    iconWrap.style.minWidth = "42px";
    iconWrap.style.minHeight = "42px";
    iconWrap.style.flexShrink = "0";
    iconWrap.style.borderRadius = "12px";
    iconWrap.style.background = getShortcutThemePalette().iconBg;
    iconWrap.style.backdropFilter = "blur(8px)";
    iconWrap.style.border = `1px solid ${getShortcutThemePalette().iconBorder}`;
    iconWrap.style.boxShadow = `0 8px 18px ${getShortcutThemePalette().iconShadow}`;
    iconWrap.style.color = getShortcutThemePalette().text;
    iconWrap.style.fontWeight = "700";
    iconWrap.style.fontSize = "18px";
    iconWrap.style.userSelect = "none";
    // Apps: prefer defined icon (png or svg/text). fall back to first letter
    if (shortcut.type === "app") {
      const app = (window.protectedGlobals.apps || []).find((candidate) => {
        const appId = String((candidate && candidate.id) || "");
        return appId === shortcut.appId || appId === shortcut.id || (candidate && candidate.folderName === shortcut.appId);
      });
      if (app && app.icon) {
        if (app.pngEnabled) {
          const img = document.createElement("img");
          img.src = `data:image/png;base64,${app.icon}`;
          img.alt = shortcut.label;
          img.draggable = false;
          img.addEventListener("dragstart", (ev) => ev.preventDefault());
          img.style.width = "32px";
          img.style.height = "32px";
          img.style.objectFit = "contain";
          img.style.borderRadius = "8px";
          img.style.userSelect = "none";
          img.style.webkitUserDrag = "none";
          iconWrap.appendChild(img);
          return iconWrap;
        }
        // non-png icon: could be SVG/HTML or plain text. If plain text, render up to 3 chars.
        const rawIcon = String(app.icon || "").trim();
        const looksLikeHtml = /<[^>]+>/.test(rawIcon);
        if (!rawIcon) {
          const txt = String(shortcut.label || "A").trim().slice(0, 3).toUpperCase();
          iconWrap.textContent = txt;
          return iconWrap;
        }
        if (!looksLikeHtml) {
          const txt = rawIcon.slice(0, 3).toUpperCase();
          const span = document.createElement("div");
          span.textContent = txt;
          span.style.fontSize = "16px";
          span.style.fontWeight = "700";
          span.style.letterSpacing = "0.2px";
          span.style.userSelect = "none";
          span.style.lineHeight = "1";
          iconWrap.appendChild(span);
          return iconWrap;
        }
        const frag = document.createElement("div");
        frag.innerHTML = rawIcon;
        // prevent internal images/svg from being dragged separately
        try {
          frag.querySelectorAll && frag.querySelectorAll("img,svg").forEach((n) => {
            try { n.draggable = false; } catch (e) {}
            try { n.addEventListener && n.addEventListener("dragstart", (ev) => ev.preventDefault()); } catch (e) {}
            try { n.style.pointerEvents = "none"; } catch (e) {}
            try { n.setAttribute && n.setAttribute("aria-hidden", "true"); } catch (e) {}
          });
        } catch (e) {}
        frag.style.width = "32px";
        frag.style.height = "32px";
        frag.style.display = "flex";
        frag.style.alignItems = "center";
        frag.style.justifyContent = "center";
        frag.style.userSelect = "none";
        iconWrap.appendChild(frag);
        return iconWrap;
      }
      const labIcon = String(shortcut.label || "A").trim().slice(0, 3).toUpperCase();
      iconWrap.textContent = labIcon;
      return iconWrap;
    }

    // Folders and files: use svgs from global icon set
    if (shortcut.type === "folder") {
      const svg = (window.protectedGlobals.fileIconSet && window.protectedGlobals.fileIconSet.folder) || "";
      const frag = document.createElement("div");
      frag.style.color = getShortcutThemePalette().text;
      frag.innerHTML = svg;
      try {
        frag.querySelectorAll && frag.querySelectorAll("img,svg").forEach((n) => {
          try { n.draggable = false; } catch (e) {}
          try { n.addEventListener && n.addEventListener("dragstart", (ev) => ev.preventDefault()); } catch (e) {}
          try { n.style.pointerEvents = "none"; } catch (e) {}
          try { n.setAttribute && n.setAttribute("aria-hidden", "true"); } catch (e) {}
        });
      } catch (e) {}
      frag.style.width = "36px";
      frag.style.height = "36px";
      frag.style.display = "flex";
      frag.style.alignItems = "center";
      frag.style.justifyContent = "center";
      iconWrap.appendChild(frag);
      return iconWrap;
    }

    const svgFile = (window.protectedGlobals.fileIconSet && window.protectedGlobals.fileIconSet.file) || "";
    const fragFile = document.createElement("div");
    fragFile.style.color = getShortcutThemePalette().text;
    fragFile.innerHTML = svgFile;
    try {
      fragFile.querySelectorAll && fragFile.querySelectorAll("img,svg").forEach((n) => {
        try { n.draggable = false; } catch (e) {}
        try { n.addEventListener && n.addEventListener("dragstart", (ev) => ev.preventDefault()); } catch (e) {}
      });
    } catch (e) {}
    fragFile.style.width = "36px";
    fragFile.style.height = "36px";
    fragFile.style.display = "flex";
    fragFile.style.alignItems = "center";
    fragFile.style.justifyContent = "center";
    try {
      fragFile.querySelectorAll && fragFile.querySelectorAll("img,svg").forEach((n) => {
        try { n.style.pointerEvents = "none"; } catch (e) {}
        try { n.draggable = false; } catch (e) {}
        try { n.setAttribute && n.setAttribute("aria-hidden", "true"); } catch (e) {}
      });
    } catch (e) {}
    iconWrap.appendChild(fragFile);
    return iconWrap;
  }

  function getShortcutDeletePath(shortcut) {
    const fileName = String(shortcut.fileName || normalizeShortcutFilename(shortcut.id || shortcut.appId || shortcut.label || shortcut.path || "shortcut")).trim();
    return `${DESKTOP_DIR}/${fileName}`;
  }

  async function saveShortcutEntry(entry, options = {}) {
    const renderAfterSave = options.renderAfterSave !== false;
    const shortcut = normalizeShortcut(entry);
    if (!shortcut) return null;
    const fileName = shortcut.fileName || normalizeShortcutFilename(shortcut.id || shortcut.appId || shortcut.label || shortcut.path || "shortcut");
    shortcut.fileName = fileName;
    shortcut.id = shortcut.id || shortcut.appId || shortcut.label || shortcut.path || `shortcut-${Date.now()}`;
    const filePath = `${DESKTOP_DIR}/${fileName}`;
    // Do not store appId on non-app shortcuts
    const toWrite = { ...shortcut };
    if (toWrite.type !== "app") delete toWrite.appId;
    await window.protectedGlobals.WriteFile(filePath, JSON.stringify(toWrite, null, 2), { text: true, replace: true });

    const existingIndex = window.protectedGlobals.shortcuts.findIndex((item) => item.id === shortcut.id);
    if (existingIndex !== -1) {
      window.protectedGlobals.shortcuts[existingIndex] = shortcut;
    } else {
      window.protectedGlobals.shortcuts.push(shortcut);
    }
    if (renderAfterSave) {
      renderDesktopShortcuts();
    }
    return shortcut;
  }

  async function deleteShortcutById(shortcutId) {
    const target = window.protectedGlobals.shortcuts.find((item) => item.id === shortcutId || item.appId === shortcutId);
    if (!target) return false;
    const filePath = getShortcutDeletePath(target);
    await window.protectedGlobals.DeleteFile(filePath).catch(() => {});
    window.protectedGlobals.shortcuts = window.protectedGlobals.shortcuts.filter((item) => item.id !== shortcutId && item.appId !== shortcutId);
    renderDesktopShortcuts();
    return true;
  }

  function getShortcutLabel(shortcut) {
    if (shortcut.type === "app") {
      const app = (window.protectedGlobals.apps || []).find((candidate) => candidate && (candidate.id === shortcut.appId || candidate.folderName === shortcut.appId || candidate.id === shortcut.id));
      return (app && app.label) || shortcut.label || shortcut.name || "App";
    }
    return shortcut.label || shortcut.name || "Shortcut";
  }

  function isProtectedSensitiveFilePath(filePath) {
    const normalized = String(filePath || "").replace(/\\/g, "/").trim();
    const safePath = normalized.startsWith("/") ? normalized : `/${normalized}`;
    const lower = safePath.toLowerCase();
    if (lower === "/systemfiles/userprofile/jsapikey.txt") return true;
    return /^\/systemfiles\/runtime\/apps\/[^/]+\/jskey\.txt$/i.test(lower);
  }

  function getOpenWithApps(filePath) {
    const fileName = String(filePath || "").split("/").pop() || "";
    const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase() : "";
    const apps = (window.protectedGlobals.apps || [])
      .filter(Boolean)
      .filter((app) => {
        const capability = Array.isArray(app.openfileCapability)
          ? app.openfileCapability
          : String(app.openfileCapability || "").split(",").map((part) => part.trim().toLowerCase()).filter(Boolean);
        if (!capability.length) return false;
        if (capability.includes("*")) return true;
        if (!ext) return false;
        return capability.includes(ext);
      })
      .filter((app) => {
        if (isProtectedSensitiveFilePath(filePath)) {
          return app.requestAdminPerm === true;
        }
        return true;
      })
      .map((app) => ({
        id: app.id || app.functionName || app.label,
        label: app.label || app.functionName || app.id || "App",
        functionName: app.functionName || app.id,
      }))
      .filter((app) => app.functionName && typeof window[app.functionName] === "function");
    return apps;
  }

  function createShortcutMenu(e, shortcut) {
    const existingMenu = document.getElementById(MENU_ID);
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement("div");
    menu.id = MENU_ID;
    Object.assign(menu.style, {
      position: "fixed",
      left: `${e.clientX}px`,
      top: `${e.clientY}px`,
      zIndex: 100003,
      minWidth: "180px",
      padding: "6px",
      borderRadius: "8px",
      background: window.protectedGlobals.data.dark ? "#1a1a1a" : "#ffffff",
      color: window.protectedGlobals.data.dark ? "#ffffff" : "#111111",
      border: window.protectedGlobals.data.dark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.12)",
      boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: "13px",
    });

    const addItem = (label, action) => {
      const row = document.createElement("div");
      row.textContent = label;
      row.style.padding = "6px 8px";
      row.style.cursor = "pointer";
      row.style.borderRadius = "6px";
      row.style.userSelect = "none";
      row.addEventListener("mouseenter", () => {
        row.style.background = window.protectedGlobals.data.dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";
      });
      row.addEventListener("mouseleave", () => {
        row.style.background = "transparent";
      });
      row.addEventListener("click", async () => {
        menu.remove();
        await action();
      });
      menu.appendChild(row);
    };

    if (shortcut.type === "app") {
      addItem("Open", async () => {
        const appId = shortcut.appId || shortcut.id;
        try {
          await window.protectedGlobals.launchApp(appId);
        } catch (err) {
          console.warn("Failed to open desktop shortcut app", err);
        }
      });
    }

    // Always offer show-in-file-explorer when we have a path
    if (shortcut.path) {
      addItem("Show In File Explorer", async () => {
        const targetPath = normalizeShortcutPath(shortcut.path) || "/";
        window.fileExplorer(targetPath, 50, 50);
      });
      addItem("Copy Path", async () => {
        const targetPath = normalizeShortcutPath(shortcut.path) || "/";
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(targetPath);
            return;
          }
        } catch (err) {}
        try {
          const temp = document.createElement("textarea");
          temp.value = targetPath;
          temp.setAttribute("readonly", "");
          temp.style.position = "fixed";
          temp.style.opacity = "0";
          document.body.appendChild(temp);
          temp.select();
          document.execCommand("copy");
          temp.remove();
        } catch (err) {
          console.warn("Failed to copy shortcut path", err);
        }
      });
    }

    if (shortcut.type === "file" && shortcut.path) {
      const openWithApps = getOpenWithApps(shortcut.path);
      if (openWithApps.length) {
        const openWithRow = document.createElement("div");
        openWithRow.textContent = "Open with";
        Object.assign(openWithRow.style, {
          padding: "6px 8px",
          borderRadius: "6px",
          cursor: "pointer",
          userSelect: "none",
          position: "relative",
        });
        openWithRow.addEventListener("mouseenter", () => {
          openWithRow.style.background = window.protectedGlobals.data.dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";
        });
        openWithRow.addEventListener("mouseleave", () => {
          openWithRow.style.background = "transparent";
        });

        const submenu = document.createElement("div");
        Object.assign(submenu.style, {
          position: "absolute",
          left: "calc(100% + 6px)",
          top: "0",
          minWidth: "170px",
          padding: "6px",
          borderRadius: "8px",
          background: window.protectedGlobals.data.dark ? "#1a1a1a" : "#ffffff",
          color: window.protectedGlobals.data.dark ? "#ffffff" : "#111111",
          border: window.protectedGlobals.data.dark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.12)",
          boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
          display: "none",
          zIndex: 100004,
        });

        let submenuShowTimer = null;
        let submenuHideTimer = null;
        const clearSubmenuTimers = () => {
          if (submenuShowTimer) clearTimeout(submenuShowTimer);
          if (submenuHideTimer) clearTimeout(submenuHideTimer);
          submenuShowTimer = null;
          submenuHideTimer = null;
        };
        const showSubmenu = () => {
          clearSubmenuTimers();
          submenuShowTimer = setTimeout(() => {
            submenu.style.display = "block";
          }, 120);
        };
        const hideSubmenu = () => {
          clearSubmenuTimers();
          submenuHideTimer = setTimeout(() => {
            submenu.style.display = "none";
          }, 180);
        };

        for (const app of openWithApps) {
          const appRow = document.createElement("div");
          appRow.textContent = app.label;
          Object.assign(appRow.style, {
            padding: "6px 8px",
            borderRadius: "6px",
            cursor: "pointer",
            userSelect: "none",
          });
          appRow.addEventListener("mouseenter", () => {
            appRow.style.background = window.protectedGlobals.data.dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";
          });
          appRow.addEventListener("mouseleave", () => {
            appRow.style.background = "transparent";
          });
          appRow.addEventListener("click", async () => {
            menu.remove();
            try {
              if (typeof window[app.functionName] === "function") {
                window[app.functionName](shortcut.path);
              }
            } catch (err) {
              console.warn("Failed to open file with app", app.label, err);
            }
          });
          submenu.appendChild(appRow);
        }

        openWithRow.addEventListener("mouseenter", () => {
          showSubmenu();
        });
        openWithRow.addEventListener("mouseleave", () => {
          hideSubmenu();
        });
        submenu.addEventListener("mouseenter", () => {
          clearSubmenuTimers();
          submenu.style.display = "block";
        });
        submenu.addEventListener("mouseleave", () => {
          hideSubmenu();
        });
        openWithRow.appendChild(submenu);
        menu.appendChild(openWithRow);
      }
    }

    addItem("Remove Shortcut", async () => {
      await deleteShortcutById(shortcut.id).catch(() => {});
    });

    document.body.appendChild(menu);
    const menuRect = menu.getBoundingClientRect();
    const maxX = window.innerWidth - menuRect.width - 8;
    const maxY = window.innerHeight - menuRect.height - 8;
    menu.style.left = `${clamp(e.clientX, 8, maxX)}px`;
    menu.style.top = `${clamp(e.clientY, 8, maxY)}px`;

    document.addEventListener("pointerdown", function onPointerDown(evt) {
      if (!menu.contains(evt.target)) {
        menu.remove();
        document.removeEventListener("pointerdown", onPointerDown);
      }
    }, { once: true });
  }

  function wrapShortcutLabel(labelText, charsPerLine = 14) {
    const text = String(labelText || "").trim();
    if (!text) return "";

    const words = text.replace(/\s+/g, " ").split(" ").filter(Boolean);
    if (!words.length) return "";

    const lines = [];
    let currentLine = "";

    for (const word of words) {
      if (!word) continue;
      if (word.length > charsPerLine) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = "";
        }
        const chunked = word.match(new RegExp(`.{1,${charsPerLine}}`, "g")) || [word];
        for (const chunk of chunked) {
          if (chunk) lines.push(chunk);
        }
        continue;
      }

      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      if (nextLine.length <= charsPerLine || !currentLine) {
        currentLine = nextLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines.join("\n");
  }

  function updateShortcutSelectionState(item, shortcutId) {
    const isSelected = window.protectedGlobals.selectedDesktopShortcutId === shortcutId;
    item.style.boxShadow = isSelected
      ? "0 0 0 2px rgba(96, 165, 250, 0.42), 0 0 0 6px rgba(96, 165, 250, 0.14)"
      : "none";
    item.style.outline = isSelected ? "1px solid rgba(59, 130, 246, 0.78)" : "none";
    item.style.background = isSelected ? "rgba(59, 130, 246, 0.08)" : "transparent";
    item.style.borderRadius = "10px";
  }

  function syncDesktopShortcutSelectionVisuals() {
    document.querySelectorAll(".desktop-shortcut-item").forEach((node) => {
      const id = node.dataset.shortcutId;
      updateShortcutSelectionState(node, id);
    });
  }

  function renderDesktopShortcuts() {
    if (!window.protectedGlobals.data) return;

    const isDark = !!(window.protectedGlobals.data && window.protectedGlobals.data.dark);

    let layer = document.getElementById(LAYER_ID);
    if (!layer) {
      layer = document.createElement("div");
      layer.id = LAYER_ID;
      layer.style.position = "fixed";
      layer.style.left = "0";
      layer.style.top = "0";
      layer.style.width = "100vw";
      layer.style.height = "100vh";
      layer.style.pointerEvents = "none";
      layer.style.zIndex = "0";
      layer.style.overflow = "hidden";
      document.body.appendChild(layer);
    }

    const bounds = getDesktopBounds();
    layer.style.top = `${bounds.top}px`;
    layer.style.bottom = `${bounds.bottom}px`;
    layer.style.left = "0";
    layer.style.right = "0";
    layer.style.width = "100vw";
    layer.style.height = `calc(100vh - ${bounds.taskbarHeight}px)`;

    const items = Array.isArray(window.protectedGlobals.shortcuts) ? window.protectedGlobals.shortcuts : [];
    while (layer.firstChild) layer.removeChild(layer.firstChild);

    items.forEach((shortcut, index) => {
      const normalized = normalizeShortcut(shortcut);
      if (!normalized) return;

      const itemWidth = SHORTCUT_BUBBLE.width;
      const itemHeight = SHORTCUT_BUBBLE.height;
      const item = document.createElement("div");
      item.className = "desktop-shortcut-item";
      item.dataset.shortcutId = normalized.id;
      Object.assign(item.style, {
        position: "absolute",
        left: `${clamp(Number(normalized.x) || 16, 12, Math.max(12, window.innerWidth - SHORTCUT_BUBBLE.width - 16))}px`,
        top: `${clamp(Number(normalized.y) || 16, 12, Math.max(12, window.innerHeight - SHORTCUT_BUBBLE.height - 26))}px`,
        width: `${itemWidth}px`,
        height: `${itemHeight}px`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
        padding: "8px 8px 6px",
        pointerEvents: "auto",
        cursor: "pointer",
        userSelect: "none",
        color: getShortcutThemePalette().label,
        textShadow: "0 1px 2px rgba(0,0,0,0.18)",
        borderRadius: "10px",
        boxSizing: "border-box",
      });

      const iconNode = renderShortcutIcon(normalized);
      item.appendChild(iconNode);

      const label = document.createElement("div");
      label.className = "desktop-shortcut-label";
      const fullLabel = String(getShortcutLabel(normalized) || "");
      label.title = fullLabel;
      let labelText = fullLabel;
      if (labelText.length > 40) labelText = labelText.slice(0, 40) + "...";
      label.textContent = wrapShortcutLabel(labelText, 18);
      label.style.fontSize = "11px";
      label.style.lineHeight = "1.2";
      label.style.textAlign = "center";
      label.style.display = "-webkit-box";
      label.style.webkitBoxOrient = "vertical";
      label.style.webkitLineClamp = "2";
      label.style.lineClamp = "2";
      label.style.width = `${itemWidth}px`;
      label.style.maxWidth = `${itemWidth}px`;
      label.style.whiteSpace = "normal";
      label.style.wordBreak = "break-word";
      label.style.overflowWrap = "anywhere";
      label.style.overflow = "hidden";
      label.style.textOverflow = "ellipsis";
      label.style.color = getShortcutThemePalette().label;
      item.appendChild(label);
      applyShortcutThemeToNode(item, label, iconNode);

      updateShortcutSelectionState(item, normalized.id);

      item.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        window.protectedGlobals.selectedDesktopShortcutId = normalized.id;
        syncDesktopShortcutSelectionVisuals();
      });

      item.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        createShortcutMenu(e, normalized);
      });

      // open on double-click
      item.addEventListener("dblclick", async () => {
        if (normalized.type === "app") {
          try {
            await window.protectedGlobals.launchApp(normalized.appId || normalized.id);
          } catch (err) {
            console.warn("Failed to launch app shortcut", err);
          }
          return;
        }

        if ((normalized.type === "folder" || normalized.type === "file") && normalized.path) {
          window.fileExplorer(normalized.type === "file" ? (normalized.path.split("/").slice(0, -1).join("/") || "/") : normalized.path, 50, 50);
        }
      });

      item.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        window.protectedGlobals.selectedDesktopShortcutId = normalized.id;
        syncDesktopShortcutSelectionVisuals();

        const origin = { x: normalized.x, y: normalized.y };
        const startX = e.clientX;
        const startY = e.clientY;
        let started = false;
        const threshold = 12; // pixels before a drag is considered started
        const drag = (moveEvent) => {
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;
          if (!started) {
            if (Math.hypot(dx, dy) < threshold) return; // don't start moving yet
            started = true;
            try { item.setPointerCapture && item.setPointerCapture(e.pointerId); } catch (err) {}
          }
          const bounds = getShortcutPositionBounds();
          const nextX = clamp(origin.x + dx, bounds.minX, bounds.maxX);
          const nextY = clamp(origin.y + dy, bounds.minY, bounds.maxY);
          item.style.left = `${nextX}px`;
          item.style.top = `${nextY}px`;
          normalized.x = nextX;
          normalized.y = nextY;
          const match = window.protectedGlobals.shortcuts.find((candidate) => candidate.id === normalized.id);
          if (match) {
            match.x = nextX;
            match.y = nextY;
          }
        };
        const stop = async (upEvent) => {
          document.removeEventListener("pointermove", drag);
          document.removeEventListener("pointerup", stop);
          try { item.releasePointerCapture && item.releasePointerCapture(e.pointerId); } catch (err) {}
          // only save when an actual drag occurred
          if (started) {
            const occupiedSlots = (window.protectedGlobals.shortcuts || [])
              .filter((candidate) => candidate && candidate.id !== normalized.id)
              .map((candidate) => ({ x: Number(candidate.x) || 0, y: Number(candidate.y) || 0 }));
            const snapped = getClosestAvailableShortcutSlot(normalized, occupiedSlots);
            normalized.x = snapped.x;
            normalized.y = snapped.y;
            const bounds = getShortcutPositionBounds();
            item.style.left = `${clamp(normalized.x, bounds.minX, bounds.maxX)}px`;
            item.style.top = `${clamp(normalized.y, bounds.minY, bounds.maxY)}px`;
            const match = window.protectedGlobals.shortcuts.find((candidate) => candidate.id === normalized.id);
            if (match) {
              match.x = normalized.x;
              match.y = normalized.y;
            }
            await saveShortcutEntry(normalized).catch(() => {});
          }
        };
        document.addEventListener("pointermove", drag);
        document.addEventListener("pointerup", stop, { once: true });
      });

      layer.appendChild(item);
    });

    // If some app shortcuts couldn't resolve icons yet (apps list may load later),
    // schedule a couple of retries to re-render so PNGs/svg can appear when apps populate.
    try {
      const needsRetry = items.some((s) => s && s.type === "app" && !((window.protectedGlobals.apps || []).find((a) => a && (a.id === s.appId || a.folderName === s.appId))));
      if (needsRetry) {
        window.protectedGlobals._desktopRerenderAttempts = (window.protectedGlobals._desktopRerenderAttempts || 0) + 1;
        if (window.protectedGlobals._desktopRerenderAttempts <= 3) {
          setTimeout(() => {
            renderDesktopShortcuts();
          }, window.protectedGlobals._desktopRerenderAttempts === 1 ? 400 : 1200);
        }
      } else {
        // reset attempts counter when all resolved
        window.protectedGlobals._desktopRerenderAttempts = 0;
      }
    } catch (e) {}
  }

  async function loadDesktopShortcuts() {
    try {
      const entries = await window.protectedGlobals.ReadFolder(DESKTOP_DIR).catch(() => []);

      // Normalize different ReadFolder return shapes: string names, [name,...], or { name/path }
      const names = [];
      if (Array.isArray(entries)) {
        for (const e of entries) {
          if (!e) continue;
          if (typeof e === "string") {
            names.push(e);
            continue;
          }
          if (Array.isArray(e) && typeof e[0] === "string") {
            names.push(e[0]);
            continue;
          }
          if (typeof e === "object") {
            if (typeof e.name === "string") names.push(e.name);
            else if (typeof e.path === "string") names.push(e.path.split("/").pop());
          }
        }
      }

      const shortcutReads = names
        .filter((fileName) => fileName && String(fileName).toLowerCase().endsWith(".json"))
        .map(async (fileName) => {
          const content = await window.protectedGlobals.ReadFile(`${DESKTOP_DIR}/${fileName}`, { text: true, direct: true }).catch(() => null);
          if (!content) return null;
          try {
            const parsed = JSON.parse(content);
            const normalized = normalizeShortcut(parsed);
            if (!normalized) return null;
            normalized.fileName = fileName;
            return normalized;
          } catch (err) {
            console.warn("Failed to parse desktop shortcut JSON", fileName, err);
            return null;
          }
        });

      const shortcuts = (await Promise.all(shortcutReads)).filter(Boolean);
      window.protectedGlobals.shortcuts = shortcuts;
      renderDesktopShortcuts();
    } catch (err) {
      console.warn("Could not load desktop shortcuts", err);
      window.protectedGlobals.shortcuts = [];
      renderDesktopShortcuts();
    }
  }

  function refreshDesktopShortcuts() {
    renderDesktopShortcuts();
  }

  window.protectedGlobals.createDesktopShortcut = async function createDesktopShortcut(entry) {
    const shortcut = normalizeShortcut(entry);
    if (!shortcut) return null;
    // If the caller provided explicit x/y values (and they are not the default placeholder), keep them.
    const isExplicitCoordinate = (v) => {
      if (v === undefined || v === null) return false;
      const n = Number(v);
      if (!Number.isFinite(n)) return false;
      return true;
    };
    const hasExplicitPos = entry && (isExplicitCoordinate(entry.x) || isExplicitCoordinate(entry.y));
    if (!hasExplicitPos) {
      const pos = nextShortcutPosition();
      shortcut.x = pos.x;
      shortcut.y = pos.y;
    }
    shortcut.fileName = shortcut.fileName || normalizeShortcutFilename(shortcut.id || shortcut.appId || shortcut.label || shortcut.path || "shortcut");
    const saved = await saveShortcutEntry(shortcut);
    return saved;
  };

  window.protectedGlobals.createDesktopShortcutForApp = async function createDesktopShortcutForApp(appMeta) {
    if (!appMeta || !appMeta.id) return null;
    const appId = appMeta.id;
    const existing = window.protectedGlobals.shortcuts.find((shortcut) => shortcut.type === "app" && shortcut.appId === appId);
    if (existing) return existing;
    return window.protectedGlobals.createDesktopShortcut({
      id: `app-${appId}`,
      appId,
      type: "app",
      label: appMeta.label || appId,
      name: appMeta.label || appId,
      path: appMeta.path || `/systemfiles/runtime/apps/${appMeta.folderName || appId}`
    });
  };

  window.protectedGlobals.removeShortcutsForApp = async function removeShortcutsForApp(appId) {
    const matches = (window.protectedGlobals.shortcuts || []).filter((shortcut) => shortcut.type === "app" && (shortcut.appId === appId || shortcut.id === appId));
    for (const match of matches) {
      await deleteShortcutById(match.id).catch(() => {});
    }
    return true;
  };

  document.addEventListener("pointerdown", (evt) => {
    if (evt.target && evt.target.closest && evt.target.closest(".desktop-shortcut-item")) return;
    window.protectedGlobals.selectedDesktopShortcutId = null;
    syncDesktopShortcutSelectionVisuals();
  });

  window.protectedGlobals.refreshDesktopShortcuts = refreshDesktopShortcuts;
  window.protectedGlobals.saveDesktopShortcuts = async function saveDesktopShortcuts(options = {}) {
    const skipRender = !!options.skipRender;
    const items = Array.isArray(window.protectedGlobals.shortcuts) ? window.protectedGlobals.shortcuts : [];
    for (const item of items) {
      if (item && typeof item === "object") {
        await saveShortcutEntry(item, { renderAfterSave: !skipRender }).catch(() => {});
      }
    }
  };

  window.addEventListener("resize", () => {
    renderDesktopShortcuts();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      loadDesktopShortcuts();
    }, { once: true });
  } else {
    loadDesktopShortcuts();
  }
})();
