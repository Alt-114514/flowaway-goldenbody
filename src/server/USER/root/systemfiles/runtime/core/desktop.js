"use strict";

(function () {
  if (!window.protectedGlobals) return;

  const DESKTOP_DIR = "/desktop";
  const LAYER_ID = "desktop-shortcuts-layer";
  const MENU_ID = "desktop-shortcut-context-menu";

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

  function nextShortcutPosition() {
    return findClosestFreeSpot();
  }

  function findClosestFreeSpot() {
    const bounds = getDesktopBounds();
    const padding = 24;
    const cellW = 90;
    const cellH = 90;
    const maxCols = Math.max(1, Math.floor((bounds.width - padding * 2) / cellW));
    const existing = (Array.isArray(window.protectedGlobals.shortcuts) ? window.protectedGlobals.shortcuts : []).map((s) => ({ x: Number(s.x) || 0, y: Number(s.y) || 0 }));

    for (let row = 0; row < 200; row++) {
      for (let col = 0; col < maxCols; col++) {
        const x = padding + col * cellW;
        const y = padding + row * cellH;
        // ensure inside usable area
        const clampedX = clamp(x, 12, Math.max(12, window.innerWidth - 96));
        const clampedY = clamp(y, 12, Math.max(12, window.innerHeight - 140));
        let collides = false;
        for (const ex of existing) {
          if (Math.abs(ex.x - clampedX) < cellW - 18 && Math.abs(ex.y - clampedY) < cellH - 18) {
            collides = true;
            break;
          }
        }
        if (!collides) return { x: clampedX, y: clampedY };
      }
    }
    // fallback to simple cascade if grid exhausted
    const fallbackX = padding;
    const fallbackY = padding;
    return { x: fallbackX, y: fallbackY };
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
    item.x = clamp(item.x, 12, Math.max(12, window.innerWidth - 96));
    item.y = clamp(item.y, 12, Math.max(12, window.innerHeight - 140));
    return item;
  }

  async function ensureDesktopFolder() {
    try {
      await window.protectedGlobals.ReadFolder(DESKTOP_DIR);
      return true;
    } catch (e) {
      try {
        await window.protectedGlobals.WriteFolder(DESKTOP_DIR);
        return true;
      } catch (writeErr) {
        try {
          await window.protectedGlobals.WriteFile(`${DESKTOP_DIR}/.keep`, "", { text: true, replace: true });
          return true;
        } catch (err) {
          console.warn("Could not initialize desktop directory", err);
          return false;
        }
      }
    }
  }

  function renderShortcutIcon(shortcut) {
    const iconWrap = document.createElement("div");
    iconWrap.style.display = "flex";
    iconWrap.style.alignItems = "center";
    iconWrap.style.justifyContent = "center";
    iconWrap.style.width = "42px";
    iconWrap.style.height = "42px";
    iconWrap.style.borderRadius = "12px";
    iconWrap.style.background = "rgba(15, 23, 42, 0.38)";
    iconWrap.style.backdropFilter = "blur(8px)";
    iconWrap.style.border = "1px solid rgba(255,255,255,0.18)";
    iconWrap.style.boxShadow = "0 8px 18px rgba(0,0,0,0.18)";
    iconWrap.style.color = "#fff";
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

  async function saveShortcutEntry(entry) {
    const shortcut = normalizeShortcut(entry);
    if (!shortcut) return null;
    await ensureDesktopFolder();
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
    renderDesktopShortcuts();
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

    addItem("Remove Shortcut", async () => {
      await deleteShortcutById(shortcut.id).catch(() => {});
    });

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
    }

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

  function renderDesktopShortcuts() {
    if (!window.protectedGlobals.data) return;

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

      const item = document.createElement("div");
      item.className = "desktop-shortcut-item";
      Object.assign(item.style, {
        position: "absolute",
        left: `${clamp(Number(normalized.x) || 16, 12, Math.max(12, window.innerWidth - 96))}px`,
        top: `${clamp(Number(normalized.y) || 16, 12, Math.max(12, window.innerHeight - 140))}px`,
        width: "72px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
        pointerEvents: "auto",
        cursor: "pointer",
        userSelect: "none",
        color: window.protectedGlobals.data.dark ? "#f5f7ff" : "#111827",
        textShadow: "0 1px 2px rgba(0,0,0,0.38)",
      });

      const iconNode = renderShortcutIcon(normalized);
      item.appendChild(iconNode);

      const label = document.createElement("div");
      const fullLabel = String(getShortcutLabel(normalized) || "");
      label.title = fullLabel;
      let labelText = fullLabel;
      if (labelText.length > 25) labelText = labelText.slice(0, 25) + "...";
      label.textContent = labelText;
      label.style.fontSize = "11px";
      label.style.lineHeight = "1.2";
      label.style.textAlign = "center";
      label.style.maxWidth = "72px";
      label.style.wordBreak = "break-word";
      label.style.overflowWrap = "anywhere";
      item.appendChild(label);

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
        const origin = { x: normalized.x, y: normalized.y };
        const startX = e.clientX;
        const startY = e.clientY;
        let started = false;
        const threshold = 6; // pixels before a drag is considered started
        const drag = (moveEvent) => {
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;
          if (!started) {
            if (Math.hypot(dx, dy) < threshold) return; // don't start moving yet
            started = true;
            try { item.setPointerCapture && item.setPointerCapture(e.pointerId); } catch (err) {}
          }
          const nextX = clamp(origin.x + dx, 12, Math.max(12, window.innerWidth - 96));
          const nextY = clamp(origin.y + dy, 12, Math.max(12, window.innerHeight - 140));
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
          if (started) await saveShortcutEntry(normalized).catch(() => {});
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
      await ensureDesktopFolder();
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

      const shortcuts = [];
      for (const fileName of names) {
        if (!fileName || String(fileName).toLowerCase().endsWith(".json") === false) continue;
        const content = await window.protectedGlobals.ReadFile(`${DESKTOP_DIR}/${fileName}`, { text: true, direct: true }).catch(() => null);
        if (!content) continue;
        try {
          const parsed = JSON.parse(content);
          const normalized = normalizeShortcut(parsed);
          if (normalized) {
            normalized.fileName = fileName;
            shortcuts.push(normalized);
          }
        } catch (err) {
          console.warn("Failed to parse desktop shortcut JSON", fileName, err);
        }
      }
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
      // treat the runtime default 24 as a non-explicit placeholder coming from other codepaths
      if (n === 24) return false;
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
    const pos = nextShortcutPosition();
    return window.protectedGlobals.createDesktopShortcut({
      id: `app-${appId}`,
      appId,
      type: "app",
      label: appMeta.label || appId,
      name: appMeta.label || appId,
      path: appMeta.path || `/systemfiles/runtime/apps/${appMeta.folderName || appId}`,
      x: pos.x,
      y: pos.y,
    });
  };

  window.protectedGlobals.removeShortcutsForApp = async function removeShortcutsForApp(appId) {
    const matches = (window.protectedGlobals.shortcuts || []).filter((shortcut) => shortcut.type === "app" && (shortcut.appId === appId || shortcut.id === appId));
    for (const match of matches) {
      await deleteShortcutById(match.id).catch(() => {});
    }
    return true;
  };

  window.protectedGlobals.refreshDesktopShortcuts = refreshDesktopShortcuts;
  window.protectedGlobals.saveDesktopShortcuts = async function saveDesktopShortcuts() {
    const items = Array.isArray(window.protectedGlobals.shortcuts) ? window.protectedGlobals.shortcuts : [];
    for (const item of items) {
      if (item && typeof item === "object") {
        await saveShortcutEntry(item).catch(() => {});
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
