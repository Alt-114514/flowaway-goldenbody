"use strict";

(async function () {
  if (!window.protectedGlobals) return;

  const DESKTOP_DIR = "/desktop";
  const LAYER_ID = "desktop-shortcuts-layer";
  const MENU_ID = "desktop-shortcut-context-menu";

  const GRID_COLUMNS = 12;
  const GRID_ROWS = 6;
  const MAX_SHORTCUTS = GRID_COLUMNS * GRID_ROWS;

  // These are the actual rendered shortcut dimensions.
  const SHORTCUT_WIDTH = 84;
  const SHORTCUT_HEIGHT = 96;

  window.protectedGlobals.shortcuts = Array.isArray(window.protectedGlobals.shortcuts) ? window.protectedGlobals.shortcuts : [];

  function safeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeShortcutFilename(value) {
    const base =
      String(value || "shortcut")
        .trim()
        .replace(/\\/g, "/")
        .replace(/[^a-zA-Z0-9_.-]+/g, "_")
        .replace(/^_+|_+$/g, "") || "shortcut";

    return `${base}.json`;
  }

  function normalizeShortcutPath(value) {
    return String(value || "")
      .replace(/\\/g, "/")
      .trim();
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

  /*
   * Shortcut coordinates are stored as percentages relative to the desktop
   * layer, not the entire browser viewport.
   *
   * This is important when the taskbar is on the top or bottom.
   */
    function normalizeShortcutPosition(value) {
    const num = Number(value);

    if (!Number.isFinite(num)) return 0;

    return clamp(num, 0, 100);
    }


  function getShortcutGridSlots() {
    const slots = [];

    /*
     *
     * X/Y are still stored as percentages so existing shortcut files remain
     * compatible with the old format.
     */
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLUMNS; col++) {
        const x = ((col + 0.5) / GRID_COLUMNS) * 100;
        const y = ((row + 0.5) / GRID_ROWS) * 100;

        slots.push({
          x,
          y,
          row,
          col,
        });
      }
    }

    return slots;
  }

  function getGridSlotIndexForPoint(xPct, yPct) {
    const currentX = normalizeShortcutPosition(xPct, "x");
    const currentY = normalizeShortcutPosition(yPct, "y");

    const slots = getShortcutGridSlots();

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];

      const distance = Math.hypot(currentX - slot.x, currentY - slot.y);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  function getShortcutIdentityIds(shortcut) {
    if (!shortcut) return [];

    return [shortcut.id, shortcut.appId, shortcut.type === "app" ? `app-${shortcut.appId || shortcut.id}` : null].filter(Boolean);
  }

  function findExistingShortcutMatch(entry) {
    const candidate = normalizeShortcut(entry);

    if (!candidate) {
      return null;
    }

    const candidateIds = new Set(getShortcutIdentityIds(candidate));

    return (Array.isArray(window.protectedGlobals.shortcuts) ? window.protectedGlobals.shortcuts : []).find((existing) => {
      const normalized = normalizeShortcut(existing);

      if (!normalized) {
        return false;
      }

      return getShortcutIdentityIds(normalized).some((id) => candidateIds.has(id));
    });
  }

  function shortcutMatchesIdentity(shortcutA, shortcutB) {
    if (!shortcutA || !shortcutB) {
      return false;
    }

    const idsA = getShortcutIdentityIds(shortcutA);
    const idsB = getShortcutIdentityIds(shortcutB);

    return idsA.some((id) => idsB.includes(id));
  }

  function shortcutMatchesIgnoredIds(shortcut, ignoredIds) {
    const ignored = Array.isArray(ignoredIds) ? ignoredIds : [];
    const ids = getShortcutIdentityIds(shortcut);

    return ids.some((id) => ignored.includes(id));
  }

  function getNormalizedShortcutItems() {
    return (Array.isArray(window.protectedGlobals.shortcuts) ? window.protectedGlobals.shortcuts : []).map((shortcut) => normalizeShortcut(shortcut)).filter(Boolean);
  }

  function getOccupiedGridSlots(ignoredIds = []) {
    const occupied = new Set();

    for (const shortcut of getNormalizedShortcutItems()) {
      if (shortcutMatchesIgnoredIds(shortcut, ignoredIds)) continue;

      occupied.add(getGridSlotIndexForPoint(shortcut.x, shortcut.y));
    }

    return occupied;
  }

  function getNextShortcutPosition(existingItems = [], requestedIndex = 0) {
    const existing = Array.isArray(existingItems) ? existingItems : [];

    const occupied = new Set();

    for (const entry of existing) {
      if (!entry) continue;

      const slotIndex = getGridSlotIndexForPoint(entry.x, entry.y);

      occupied.add(slotIndex);
    }

    const slots = getShortcutGridSlots();

    const freePositions = [];

    for (let i = 0; i < slots.length; i++) {
      if (!occupied.has(i)) {
        freePositions.push(slots[i]);
      }
    }

    if (!freePositions.length) {
      return null;
    }

    const numericIndex = Number(requestedIndex);

    const targetIndex = Number.isFinite(numericIndex) ? Math.max(0, Math.min(Math.floor(numericIndex), freePositions.length - 1)) : 0;

    return freePositions[targetIndex] || freePositions[0];
  }

  window.protectedGlobals.getNextShortcutPosition = getNextShortcutPosition;

  window.protectedGlobals.getNextShortcutPos = getNextShortcutPosition;

  window.protectedGlobals.getnextshortcutpos = getNextShortcutPosition;

  function nextShortcutPosition() {
    return getNextShortcutPosition(Array.isArray(window.protectedGlobals.shortcuts) ? window.protectedGlobals.shortcuts : [], 0);
  }

  function normalizeShortcut(raw) {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const type = String(raw.type || "").toLowerCase();

    let finalType = type;

    if (!["app", "file", "folder"].includes(finalType)) {
      if (raw.appId || String(raw.path || "").indexOf("/systemfiles/runtime/apps/") === 0) {
        finalType = "app";
      } else if (String(raw.path || "").endsWith("/")) {
        finalType = "folder";
      } else {
        finalType = String(raw.path || "").includes(".") ? "file" : "folder";
      }
    }

    const label = String(raw.label || raw.appId).trim();

    const item = {
      id: String(raw.id || raw.appId || raw.path || label || `shortcut-${crypto.randomUUID()}`).trim() || `shortcut-${crypto.randomUUID()}`,

      type: finalType,

      label,

      path: normalizeShortcutPath(raw.path),

      appId: String(raw.appId || raw.id || "").trim(),

      name: String(raw.name || label).trim(),

      x: safeNumber(raw.x, 24),
      y: safeNumber(raw.y, 24),

      fileName: String(raw.fileName || "").trim(),
    };

    if (finalType !== "app") {
      item.appId = "";
    } else if (!item.appId) {
      item.appId = item.id;
    }

    if (!item.path && finalType !== "app") {
      return null;
    }

    item.x = clamp(normalizeShortcutPosition(item.x, "x"), 0, 100);

    item.y = clamp(normalizeShortcutPosition(item.y, "y"), 0, 100);

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

    Object.assign(iconWrap.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "42px",
      height: "42px",
      borderRadius: "12px",
      background: getShortcutThemePalette().iconBg,
      backdropFilter: "blur(8px)",
      border: `1px solid ${getShortcutThemePalette().iconBorder}`,
      boxShadow: `0 8px 18px ${getShortcutThemePalette().iconShadow}`,
      color: getShortcutThemePalette().text,
      fontWeight: "700",
      fontSize: "18px",
      userSelect: "none",
    });

    if (shortcut.type === "app") {
      const app = (window.protectedGlobals.apps || []).find((candidate) => {
        const appId = String((candidate && candidate.id) || "");

        return appId === shortcut.appId;
      });

      if (app && app.icon) {
        if (app.pngEnabled) {
          const img = document.createElement("img");

          img.src = `data:image/png;base64,${app.icon}`;

          img.alt = shortcut.label;
          img.draggable = false;

          img.addEventListener("dragstart", (ev) => ev.preventDefault());

          Object.assign(img.style, {
            width: "32px",
            height: "32px",
            objectFit: "contain",
            borderRadius: "8px",
            userSelect: "none",
            webkitUserDrag: "none",
            pointerEvents: "none",
          });

          iconWrap.appendChild(img);

          return iconWrap;
        }

        const rawIcon = app.icon;

        if (!rawIcon) {
          iconWrap.textContent = String(shortcut.label || "A")
            .trim()
            .slice(0, 3)
            .toUpperCase();

          return iconWrap;
        }

        const frag = document.createElement("div");

        frag.innerHTML = rawIcon;

        try {
          if (frag.querySelectorAll) {
            frag.querySelectorAll("img,svg").forEach((node) => {
              try {
                node.draggable = false;
              } catch (e) {}

              try {
                node.addEventListener("dragstart", (ev) => ev.preventDefault());
              } catch (e) {}

              try {
                node.style.pointerEvents = "none";
              } catch (e) {}

              try {
                node.setAttribute("aria-hidden", "true");
              } catch (e) {}
            });
          }
        } catch (e) {}

        Object.assign(frag.style, {
          width: "32px",
          height: "32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          userSelect: "none",
          pointerEvents: "none",
        });

        iconWrap.appendChild(frag);

        return iconWrap;
      }

      iconWrap.textContent = String(shortcut.label || "A")
        .trim()
        .slice(0, 3)
        .toUpperCase();

      return iconWrap;
    }

    if (shortcut.type === "folder") {
      const svg = (window.protectedGlobals.fileIconSet && window.protectedGlobals.fileIconSet.folder) || "";

      const frag = document.createElement("div");

      frag.style.color = getShortcutThemePalette().text;

      frag.innerHTML = svg;

      try {
        if (frag.querySelectorAll) {
          frag.querySelectorAll("img,svg").forEach((node) => {
            try {
              node.draggable = false;
            } catch (e) {}

            try {
              node.addEventListener("dragstart", (ev) => ev.preventDefault());
            } catch (e) {}

            try {
              node.style.pointerEvents = "none";
            } catch (e) {}

            try {
              node.setAttribute("aria-hidden", "true");
            } catch (e) {}
          });
        }
      } catch (e) {}

      Object.assign(frag.style, {
        width: "36px",
        height: "36px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      });

      iconWrap.appendChild(frag);

      return iconWrap;
    }

    const svgFile = (window.protectedGlobals.fileIconSet && window.protectedGlobals.fileIconSet.file) || "";

    const fragFile = document.createElement("div");

    fragFile.style.color = getShortcutThemePalette().text;

    fragFile.innerHTML = svgFile;

    Object.assign(fragFile.style, {
      width: "36px",
      height: "36px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
    });

    try {
      if (fragFile.querySelectorAll) {
        fragFile.querySelectorAll("img,svg").forEach((node) => {
          try {
            node.style.pointerEvents = "none";
          } catch (e) {}

          try {
            node.draggable = false;
          } catch (e) {}

          try {
            node.setAttribute("aria-hidden", "true");
          } catch (e) {}
        });
      }
    } catch (e) {}

    iconWrap.appendChild(fragFile);

    return iconWrap;
  }

  function getShortcutDeletePath(shortcut) {
    const fileName = String(shortcut.fileName || 'shortcut-' + crypto.randomUUID() + '.json').trim();

    return `${DESKTOP_DIR}/${fileName}`;
  }

  async function saveShortcutEntry(entry) {
    const shortcut = normalizeShortcut(entry);

    if (!shortcut) return null;

    const fileName = shortcut.fileName || 'shortcut-' + crypto.randomUUID() + '.json';

    shortcut.fileName = fileName;

    shortcut.id = shortcut.id || shortcut.appId || shortcut.label || shortcut.path || `shortcut-${crypto.randomUUID()}`;

    const occupiedSlotIndex = getGridSlotIndexForPoint(shortcut.x, shortcut.y);
    const collidingEntries = (window.protectedGlobals.shortcuts || []).filter((item) => {
      if (!item || shortcutMatchesIdentity(item, shortcut)) {
        return false;
      }

      const candidate = normalizeShortcut(item);

      if (!candidate) {
        return false;
      }

      return getGridSlotIndexForPoint(candidate.x, candidate.y) === occupiedSlotIndex;
    });

    if (collidingEntries.length) {
      const updatedPosition = findNearestOpenSlotForPosition(shortcut.x, shortcut.y, getShortcutIdentityIds(shortcut));

      if (updatedPosition) {
        shortcut.x = updatedPosition.x;
        shortcut.y = updatedPosition.y;
      }
    }

    const filePath = `${DESKTOP_DIR}/${fileName}`;

    const toWrite = {
      ...shortcut,
    };

    if (toWrite.type !== "app") {
      delete toWrite.appId;
    }

    await window.protectedGlobals.WriteFile(filePath, JSON.stringify(toWrite, null, 2), {
      text: true,
      replace: true,
    });

    const existingIndex = (window.protectedGlobals.shortcuts || []).findIndex((item) => shortcutMatchesIdentity(item, shortcut));

    if (existingIndex !== -1) {
      window.protectedGlobals.shortcuts[existingIndex] = shortcut;
    } else {
      window.protectedGlobals.shortcuts.push(shortcut);
    }

    updateShortcutLabelDom(shortcut);
    syncShortcutSelectionVisualState();
    renderDesktopShortcuts();
    return shortcut;
  }

  async function deleteShortcutById(shortcutId) {
    const target = (window.protectedGlobals.shortcuts || []).find((item) => {
      if (!item) return false;
      return shortcutMatchesIdentity({ id: shortcutId, appId: shortcutId }, item) || item.id === shortcutId || item.appId === shortcutId;
    });

    if (!target) return false;

    const filePath = getShortcutDeletePath(target);

    await window.protectedGlobals.DeleteFile(filePath).catch(() => {});

    window.protectedGlobals.shortcuts = (window.protectedGlobals.shortcuts || []).filter((item) => !shortcutMatchesIdentity(item, target));

    const existingNode = Array.from(document.querySelectorAll(".desktop-shortcut-item")).find((node) => {
      if (!node || !node.dataset || !node.dataset.shortcutId) {
        return false;
      }

      return node.dataset.shortcutId === shortcutId || node.dataset.shortcutId === (target.appId || "") || node.dataset.shortcutId === `app-${target.appId || target.id}`;
    });

    if (existingNode) {
      existingNode.remove();
    }

    syncShortcutSelectionVisualState();

    return true;
  }

  function getShortcutLabel(shortcut) {
    if (shortcut.type === "app") {
      const app = (window.protectedGlobals.apps || []).find((c) => c.id === shortcut.appId);

      const customLabel = String(shortcut.label || shortcut.name || "").trim();

      if (customLabel) {
        return customLabel;
      }

      return (app && app.label) || "App";
    }

    return shortcut.label || shortcut.name || "Shortcut";
  }

  function getShortcutDisplayLabel(shortcut, fallback = "Shortcut") {
    const fullLabel = String(getShortcutLabel(shortcut) || fallback).trim() || fallback;

    return fullLabel.length > 25 ? `${fullLabel.slice(0, 25)}...` : fullLabel;
  }

  function isProtectedSensitiveFilePath(filePath) {
    const normalized = String(filePath || "")
      .replace(/\\/g, "/")
      .trim();

    const safePath = normalized.startsWith("/") ? normalized : `/${normalized}`;

    if (safePath === "/systemfiles/userprofile/jsApiKey.txt") {
      return true;
    }

    return /^\/systemfiles\/runtime\/apps\/[^/]+\/jskey\.txt$/i.test(safePath);
  }

  function getOpenWithApps(filePath) {
    const fileName =
      String(filePath || "")
        .split("/")
        .pop() || "";

    const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase() : "";

    const apps = (window.protectedGlobals.apps || [])
      .filter(Boolean)
      .filter((app) => {
        const capability = Array.isArray(app.openfileCapability)
          ? app.openfileCapability
          : String(app.openfileCapability || "")
              .split(",")
              .map((part) => part.trim().toLowerCase())
              .filter(Boolean);

        if (!capability.length) {
          return false;
        }

        if (capability.includes("*")) {
          return true;
        }

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
      .filter((app) => app.functionName);

    return apps;
  }

  function beginShortcutRename(shortcut) {
    const itemNode = Array.from(document.querySelectorAll(".desktop-shortcut-item")).find((node) => node.dataset.shortcutId === shortcut.id || node.dataset.shortcutId === (shortcut.appId || "") || node.dataset.shortcutId === `app-${shortcut.appId || shortcut.id}`);

    if (!itemNode) return;

    const labelNode = itemNode.querySelector(".desktop-shortcut-label");

    if (!labelNode) return;

    const oldValue = String(getShortcutLabel(shortcut) || "").trim() || "Shortcut";

    const input = document.createElement("input");

    input.type = "text";
    input.value = oldValue;

    Object.assign(input.style, {
      width: "72px",
      fontSize: "11px",
      textAlign: "center",
      border: "1px solid rgba(15, 23, 42, 0.2)",
      borderRadius: "6px",
      padding: "2px 4px",
      lineHeight: "1.2",
      background: "rgba(255,255,255,0.9)",
      color: "#111827",
      outline: "none",
      boxSizing: "border-box",
    });

    let finished = false;

    const finishRename = () => {
      if (finished) return;

      finished = true;

      const nextValue = String(input.value || "").trim() || oldValue;

      const nextLabel = document.createElement("div");

      nextLabel.className = "desktop-shortcut-label";

      nextLabel.title = nextValue;
      nextLabel.textContent = getShortcutDisplayLabel({ ...shortcut, label: nextValue, name: nextValue });

      Object.assign(nextLabel.style, {
        fontSize: "11px",
        lineHeight: "1.2",
        textAlign: "center",
        width: "72px",
        minHeight: "26px",
        maxWidth: "72px",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
        color: getShortcutThemePalette().label,
      });

      shortcut.label = nextValue;
      shortcut.name = nextValue;

      const match = window.protectedGlobals.shortcuts.find((candidate) => candidate.id === shortcut.id || candidate.id === `app-${shortcut.appId || shortcut.id}` || candidate.id === shortcut.appId);

      if (match) {
        match.label = nextValue;
        match.name = nextValue;

        match.fileName = match.fileName || shortcut.fileName || 'shortcut-' + crypto.randomUUID() + '.json';
      }

      input.replaceWith(nextLabel);

      updateShortcutLabelDom(shortcut);

      saveShortcutEntry(shortcut).catch(() => {});
    };

    input.addEventListener("blur", finishRename, { once: true });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finishRename();
      }

      if (event.key === "Escape") {
        event.preventDefault();

        if (!finished) {
          finished = true;
          input.replaceWith(labelNode);
        }
      }
    });

    itemNode.replaceChild(input, labelNode);

    input.focus();
    input.select();
  }

  function getDesktopShortcutSelection() {
    return Array.isArray(window.protectedGlobals.desktopShortcutSelection) ? window.protectedGlobals.desktopShortcutSelection : [];
  }

  function setDesktopShortcutSelection(ids) {
    window.protectedGlobals.desktopShortcutSelection = Array.isArray(ids) ? ids.filter(Boolean) : [];
  }

  function toggleDesktopShortcutSelection(targetId) {
    if (!targetId) return;

    const selected = getDesktopShortcutSelection();

    const alreadySelected = selected.includes(targetId);

    const nextSelected = alreadySelected ? selected.filter((id) => id !== targetId) : [...selected, targetId];

    setDesktopShortcutSelection(nextSelected);
  }

  function getSelectedShortcutEntries() {
    const selectedIds = getDesktopShortcutSelection();

    if (!selectedIds.length) {
      return [];
    }

    return (Array.isArray(window.protectedGlobals.shortcuts) ? window.protectedGlobals.shortcuts : [])
      .map((shortcut) => normalizeShortcut(shortcut))
      .filter(Boolean)
      .filter((shortcut) => selectedIds.includes(shortcut.id) || selectedIds.includes(shortcut.appId));
  }

  function syncShortcutSelectionVisualState() {
    const selectedIds = new Set(getDesktopShortcutSelection());

    document.querySelectorAll(".desktop-shortcut-item").forEach((node) => {
      const selected = selectedIds.has(node.dataset.shortcutId);

      node.style.border = selected ? "1px solid rgba(59,130,246,0.75)" : "1px solid transparent";
      node.style.background = selected ? "rgba(96,165,250,0.14)" : "transparent";
    });
  }

  function updateShortcutLabelDom(shortcut) {
    const itemNode = Array.from(document.querySelectorAll(".desktop-shortcut-item")).find((node) => node.dataset.shortcutId === shortcut.id || node.dataset.shortcutId === (shortcut.appId || "") || node.dataset.shortcutId === `app-${shortcut.appId || shortcut.id}`);

    if (!itemNode) {
      return;
    }

    const labelNode = itemNode.querySelector(".desktop-shortcut-label");

    if (!labelNode) {
      return;
    }

    const nextLabel = String(getShortcutLabel(shortcut) || "Shortcut").trim() || "Shortcut";

    labelNode.title = nextLabel;
    labelNode.textContent = getShortcutDisplayLabel(shortcut);
  }

  function findNearestOpenSlotForPosition(targetX, targetY, ignoredIds = []) {
    const currentX = normalizeShortcutPosition(targetX, "x");

    const currentY = normalizeShortcutPosition(targetY, "y");

    const slots = getShortcutGridSlots();

    const occupied = getOccupiedGridSlots(ignoredIds);

    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < slots.length; i++) {
      if (occupied.has(i)) {
        continue;
      }

      const slot = slots[i];

      const slotDistance = Math.hypot(currentX - slot.x, currentY - slot.y);

      if (slotDistance < bestDistance) {
        bestDistance = slotDistance;

        best = slot;
      }
    }

    return best;
  }

  function createShortcutMenu(e, shortcut) {
    const existingMenu = document.getElementById(MENU_ID);

    if (existingMenu) {
      existingMenu.remove();
    }

    const selectedEntries = getSelectedShortcutEntries();

    const effectiveShortcut = selectedEntries.length > 1 ? selectedEntries[0] : shortcut;

    const selectedIds = selectedEntries.length > 1 ? selectedEntries.map((entry) => entry.id) : [shortcut.id];

    const menu = document.createElement("div");

    const closeMenu = () => {
      const activeMenu = document.getElementById(MENU_ID);

      if (activeMenu && activeMenu === menu) {
        menu.remove();
      }

      document.removeEventListener("pointerdown", pointerDownHandler);
    };

    const pointerDownHandler = (evt) => {
      if (!menu.contains(evt.target)) {
        closeMenu();
      }
    };

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

    const addItem = async (label, action) => {
      const row = document.createElement("div");

      row.textContent = label;

      Object.assign(row.style, {
        padding: "6px 8px",
        cursor: "pointer",
        borderRadius: "6px",
        userSelect: "none",
      });

      row.addEventListener("mouseenter", () => {
        row.style.background = window.protectedGlobals.data.dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";
      });

      row.addEventListener("mouseleave", () => {
        row.style.background = "transparent";
      });

      row.addEventListener("click", async () => {
        closeMenu();
        await action();
      });

      menu.appendChild(row);
    };

    // pointerdown listener will be added after the menu is appended below

    if (selectedEntries.length > 1) {
      addItem("Show in File Explorer", async () => {
        selectedEntries.forEach((entry, index) => {
          const targetPath = normalizeShortcutPath(entry.path) || "/";

          window.fileExplorer(targetPath);
        });
      });

      addItem("Remove Shortcuts", async () => {
        await Promise.all(selectedIds.map((id) => deleteShortcutById(id).catch(() => {})));
      });

      document.body.appendChild(menu);

      const menuRect = menu.getBoundingClientRect();

      const maxX = window.innerWidth - menuRect.width - 8;

      const maxY = window.innerHeight - menuRect.height - 8;

      menu.style.left = `${clamp(e.clientX, 8, maxX)}px`;

      menu.style.top = `${clamp(e.clientY, 8, maxY)}px`;

      return;
    }

    if (effectiveShortcut.type === "app") {
      addItem("Open", async () => {
        const appId = effectiveShortcut.appId || effectiveShortcut.id;

        try {
          await window.protectedGlobals.launchApp(appId);
        } catch (err) {
          console.warn("Failed to open desktop shortcut app", err);
        }
      });
    }

    addItem("Rename Shortcut", async () => {
      beginShortcutRename(effectiveShortcut);
    });

    if (effectiveShortcut.path) {
      addItem("Show In File Explorer", async () => {
        const targetPath = normalizeShortcutPath(effectiveShortcut.path) || "/";

        window.fileExplorer(targetPath);
      });

      addItem("Copy Path", async () => {
        const targetPath = normalizeShortcutPath(effectiveShortcut.path) || "/";

        try {
          navigator.clipboard.writeText(targetPath);

          return;
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

    if (effectiveShortcut.type === "file" && effectiveShortcut.path) {
      const openWithApps = getOpenWithApps(effectiveShortcut.path);

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

        const placeSubmenu = () => {
          const rowRect = openWithRow.getBoundingClientRect();

          const rightOverflow = rowRect.right + 180 > window.innerWidth - 12;

          submenu.style.left = rightOverflow ? "-176px" : "calc(100% + 6px)";
        };

        let submenuShowTimer = null;

        let submenuHideTimer = null;

        const clearSubmenuTimers = () => {
          if (submenuShowTimer) {
            clearTimeout(submenuShowTimer);
          }

          if (submenuHideTimer) {
            clearTimeout(submenuHideTimer);
          }

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
            closeMenu();

            const verify = await window.protectedGlobals.ReadFile("/systemfiles/userprofile/jsApiKey.txt", {
              text: true,
              direct: true,
            });

            window[app.functionName](effectiveShortcut.path, verify);
          });

          submenu.appendChild(appRow);
        }

        openWithRow.addEventListener("mouseenter", () => {
          placeSubmenu();
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
      await deleteShortcutById(effectiveShortcut.id).catch(() => {});
    });

    document.body.appendChild(menu);

    const menuRect = menu.getBoundingClientRect();

    const maxX = window.innerWidth - menuRect.width - 8;

    const maxY = window.innerHeight - menuRect.height - 8;

    menu.style.left = `${clamp(e.clientX, 8, maxX)}px`;

    menu.style.top = `${clamp(e.clientY, 8, maxY)}px`;

    document.addEventListener("pointerdown", pointerDownHandler);
  }


   function renderDesktopShortcuts() {
    if (!window.protectedGlobals.data) {
      return;
    }

    let layer = document.getElementById(LAYER_ID);

    if (!layer) {
      layer = document.createElement("div");

      layer.id = LAYER_ID;

      Object.assign(layer.style, {
        position: "fixed",
        left: "0",
        top: "0",
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: "0",
        overflow: "hidden",
      });

      document.body.appendChild(layer);
    }

    const bounds = getDesktopBounds();

    layer.style.top = `${bounds.top}px`;

    layer.style.bottom = `${bounds.bottom}px`;

    layer.style.left = "0";
    layer.style.right = "0";
    layer.style.width = "100vw";

    /*
     * Use the actual usable desktop height.
     */
    layer.style.height = `${bounds.height}px`;

    const items = window.protectedGlobals.shortcuts.slice(0, MAX_SHORTCUTS);
    while (layer.firstChild) {
      layer.removeChild(layer.firstChild);
    }

    for (const shortcut of items) {
      const normalized = normalizeShortcut(shortcut);

      if (!normalized) continue;

      const item = document.createElement("div");

      item.className = "desktop-shortcut-item";

      item.dataset.shortcutId = normalized.id;

      const xPct = normalizeShortcutPosition(normalized.x, "x");

      const yPct = normalizeShortcutPosition(normalized.y, "y");

      const selection = getDesktopShortcutSelection();

      const selected = selection.includes(normalized.id);

      Object.assign(item.style, {
        position: "absolute",
        left: `${xPct}%`,
        top: `${yPct}%`,
        width: `${SHORTCUT_WIDTH}px`,
        height: `${SHORTCUT_HEIGHT}px`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "4px",
        pointerEvents: "auto",
        cursor: "pointer",
        userSelect: "none",
        color: getShortcutThemePalette().label,
        textShadow: "0 1px 2px rgba(0,0,0,0.18)",
        transform: "translate(-50%, -50%)",
        padding: "6px 4px 4px",
        borderRadius: "10px",
        border: selected ? "1px solid rgba(59,130,246,0.75)" : "1px solid transparent",
        background: selected ? "rgba(96,165,250,0.14)" : "transparent",
        boxSizing: "border-box",
      });

      const iconNode = renderShortcutIcon(normalized);

      iconNode.style.marginTop = "0";

      item.appendChild(iconNode);

      const label = document.createElement("div");

      label.className = "desktop-shortcut-label";

      const fullLabel = String(getShortcutLabel(normalized) || "");

      label.title = fullLabel;
      label.textContent = getShortcutDisplayLabel(normalized);

      Object.assign(label.style, {
        fontSize: "11px",
        lineHeight: "1.2",
        textAlign: "center",
        width: "72px",
        minHeight: "26px",
        maxWidth: "72px",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
        color: getShortcutThemePalette().label,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      });

      item.appendChild(label);

      applyShortcutThemeToNode(item, label, iconNode);

      item.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const selected = getDesktopShortcutSelection();

        if (!selected.includes(normalized.id) && !selected.includes(normalized.appId)) {
          setDesktopShortcutSelection([normalized.id]);
          window.protectedGlobals.desktopShortcutSelectionAnchor = normalized.id;
          syncShortcutSelectionVisualState();
        }

        createShortcutMenu(e, normalized);
      });

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
          window.fileExplorer(normalized.type === "file" ? normalized.path.split("/").slice(0, -1).join("/") || "/" : normalized.path);
        }
      });

      item.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) {
          return;
        }

        /*
         * Ctrl/Cmd selection.
         */
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          toggleDesktopShortcutSelection(normalized.id);

          window.protectedGlobals.desktopShortcutSelectionAnchor = normalized.id;

          syncShortcutSelectionVisualState();

          return;
        }

        /*
         * Normal click starts a possible drag.
         */
        setDesktopShortcutSelection([normalized.id]);
        syncShortcutSelectionVisualState();
        window.protectedGlobals.desktopShortcutSelectionAnchor = normalized.id;

        const startX = e.clientX;

        const startY = e.clientY;

        let started = false;

        const threshold = 8;

        /*
         * Convert pointer coordinates to the same percentage space
         * used by the desktop layer.
         */
        const getPointerDesktopPercent = (clientX, clientY) => {
          const currentBounds = getDesktopBounds();

          const desktopX = clientX;

          const desktopY = clientY - currentBounds.top;

          const x = clamp((desktopX / Math.max(1, currentBounds.width)) * 100, 0, 100);

          const y = clamp((desktopY / Math.max(1, currentBounds.height)) * 100, 0, 100);

          return {
            x,
            y,
          };
        };

        const drag = (moveEvent) => {
          const dx = moveEvent.clientX - startX;

          const dy = moveEvent.clientY - startY;

          if (!started) {
            if (Math.hypot(dx, dy) < threshold) {
              return;
            }

            started = true;

            try {
              item.setPointerCapture && item.setPointerCapture(e.pointerId);
            } catch (err) {}
          }

          const pointer = getPointerDesktopPercent(moveEvent.clientX, moveEvent.clientY);

          const nextX = clamp(pointer.x, 0, 100);
          const nextY = clamp(pointer.y, 0, 100);

          item.style.left = `${nextX}%`;
          item.style.top = `${nextY}%`;

          normalized.x = nextX;
          normalized.y = nextY;
        };

        const cleanup = () => {
            document.removeEventListener("pointermove", drag);
            document.removeEventListener("pointerup", stop);
            document.removeEventListener("pointercancel", stop);
        };


        const stop = async () => {
          cleanup();

          try {
            item.releasePointerCapture && item.releasePointerCapture(e.pointerId);
          } catch (err) {}

          if (!started) {
            return;
          }

          const ignoredIds = getShortcutIdentityIds(normalized);
          const finalSlot = findNearestOpenSlotForPosition(normalized.x, normalized.y, ignoredIds);

          if (finalSlot) {
            normalized.x = finalSlot.x;
            normalized.y = finalSlot.y;

            item.style.left = `${finalSlot.x}%`;
            item.style.top = `${finalSlot.y}%`;
          }

          const match = (window.protectedGlobals.shortcuts || []).find((candidate) => shortcutMatchesIdentity(normalized, candidate));

          if (match) {
            match.x = normalized.x;
            match.y = normalized.y;
          }

          await saveShortcutEntry(normalized).catch(() => {});
        };

        document.addEventListener("pointermove", drag);
        document.addEventListener("pointercancel", stop, { once: true });
        document.addEventListener("pointerup", stop, { once: true });
      });

      layer.appendChild(item);
    }
  }

  async function loadDesktopShortcuts() {
    try {
      const entries = await window.protectedGlobals.ReadFolder(DESKTOP_DIR).catch(() => []);

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
            if (typeof e.name === "string") {
              names.push(e.name);
            } else if (typeof e.path === "string") {
              names.push(e.path.split("/").pop());
            }
          }
        }
      }

      const shortcutResults = await Promise.all(
        names.map(async (fileName) => {
          if (!fileName || !String(fileName).toLowerCase().endsWith(".json")) {
            return null;
          }

          const content = await window.protectedGlobals
            .ReadFile(`${DESKTOP_DIR}/${fileName}`, {
              text: true,
              direct: true,
            })
            .catch(() => null);

          if (!content) {
            return null;
          }

          try {
            const parsed = JSON.parse(content);

            const normalized = normalizeShortcut(parsed);

            if (!normalized) {
              return null;
            }

            normalized.fileName = fileName;

            return normalized;
          } catch (err) {
            console.warn("Failed to parse desktop shortcut JSON", fileName, err);

            return null;
          }
        }),
      );

      const validShortcuts = shortcutResults.filter(Boolean);
      const dedupedShortcuts = [];
      const occupiedSlots = new Set();

      for (const shortcut of validShortcuts) {
        const targetSlot = getGridSlotIndexForPoint(shortcut.x, shortcut.y);

        if (occupiedSlots.has(targetSlot)) {
          const fallbackPosition = findNearestOpenSlotForPosition(shortcut.x, shortcut.y, getShortcutIdentityIds(shortcut));

          if (fallbackPosition) {
            shortcut.x = fallbackPosition.x;
            shortcut.y = fallbackPosition.y;
          }
        }

        const finalSlot = getGridSlotIndexForPoint(shortcut.x, shortcut.y);

        occupiedSlots.add(finalSlot);
        dedupedShortcuts.push(shortcut);
      }

      window.protectedGlobals.shortcuts = dedupedShortcuts;
    } catch (err) {
      alert("Could not load desktop shortcuts");
      window.protectedGlobals.shortcuts = [];
    }
  }

  window.protectedGlobals.createDesktopShortcut = async function (entry) {
    const shortcut = normalizeShortcut(entry);

    if (!shortcut) {
      return null;
    }

    const existingShortcut = findExistingShortcutMatch(shortcut);

    if (existingShortcut) {
      alert("A shortcut for this item already exists on the desktop.");
      return existingShortcut;
    }

    const currentCount = Array.isArray(window.protectedGlobals.shortcuts) ? window.protectedGlobals.shortcuts.length : 0;

    if (currentCount >= MAX_SHORTCUTS) {
      alert(`Shortcut limit reached: ${MAX_SHORTCUTS} total slots in the 12x6 desktop grid.`);

      return null;
    }

    /*
     * Explicit coordinates are converted to the nearest grid slot.
     * If none were supplied, choose the first free slot.
     */
    const isExplicitCoordinate = (v) => {
      if (v === undefined || v === null) {
        return false;
      }

      const n = Number(v);

      return Number.isFinite(n);
    };

    const hasExplicitPos = entry && (isExplicitCoordinate(entry.x) || isExplicitCoordinate(entry.y));

    if (!hasExplicitPos) {
      const pos = nextShortcutPosition();

      if (!pos) {
        alert(`Shortcut limit reached: ${MAX_SHORTCUTS} total slots in the 12x6 desktop grid.`);

        return null;
      }

      shortcut.x = pos.x;

      shortcut.y = pos.y;
    } else {
      const requestedSlotIndex = getGridSlotIndexForPoint(shortcut.x, shortcut.y);

      const requestedSlot = getShortcutGridSlots()[requestedSlotIndex];

      const occupied = getOccupiedGridSlots();

      if (occupied.has(requestedSlotIndex)) {
        const freeSlot = findNearestOpenSlotForPosition(shortcut.x, shortcut.y);

        if (!freeSlot) {
          alert(`Shortcut limit reached: ${MAX_SHORTCUTS} total slots in the 12x6 desktop grid.`);

          return null;
        }

        shortcut.x = freeSlot.x;

        shortcut.y = freeSlot.y;
      } else if (requestedSlot) {
        shortcut.x = requestedSlot.x;

        shortcut.y = requestedSlot.y;
      }
    }

    shortcut.fileName = shortcut.fileName || `shortcut-${crypto.randomUUID()}.json`;

    const saved = await saveShortcutEntry(shortcut);

    return saved;
  };

  window.protectedGlobals.createDesktopShortcutForApp = async function (appMeta) {
    if (!appMeta || !appMeta.id) {
      return null;
    }

    const appId = appMeta.id;

    const existing = window.protectedGlobals.shortcuts.find((shortcut) => shortcut.type === "app" && shortcut.appId === appId);

    if (existing) {
      alert("A desktop shortcut for this app already exists.");
      return existing;
    }

    return window.protectedGlobals.createDesktopShortcut({
      id: `app-${appId}`,
      appId,
      type: "app",
      label: appMeta.label || appId,
      name: appMeta.label || appId,
      path: appMeta.path || `/systemfiles/runtime/apps/${appMeta.folderName || appId}`,
    });
  };

  window.protectedGlobals.removeShortcutsForApp = async function (appId) {
    const matches = (window.protectedGlobals.shortcuts || []).filter((shortcut) => shortcut.type === "app" && (shortcut.appId === appId));

    for (const match of matches) {
      await deleteShortcutById(match.id).catch(() => {});
    }

    return true;
  };

  window.protectedGlobals.updateDesktopShortcutLayerPosition = function updateDesktopShortcutLayerPosition() {
    const layer = document.getElementById(LAYER_ID);

    if (!layer) {
      return;
    }

    const { top, bottom, height } = getDesktopBounds();

    layer.style.top = `${top}px`;

    layer.style.bottom = `${bottom}px`;

    layer.style.height = `${height}px`;
  };

  // Keep desktop shortcut layer sized and positioned correctly on window resize
  window.addEventListener("resize", () => {
      window.protectedGlobals.updateDesktopShortcutLayerPosition();
  });

  document.addEventListener("pointerdown", (event) => {
    if (event.target && event.target.closest && event.target.closest(".desktop-shortcut-item")) {
      return;
    }

    const hasSelection = getDesktopShortcutSelection().length > 0;

    if (hasSelection) {
      setDesktopShortcutSelection([]);

      syncShortcutSelectionVisualState();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      async () => {
        await loadDesktopShortcuts();
        renderDesktopShortcuts();
      },
      { once: true },
    );
  } else {
    await loadDesktopShortcuts();
    renderDesktopShortcuts();
  }
})();