(function (global) {
  "use strict";

  const LS_PRINTS = "sessionTracePrints_v4_meta";
  const IDB_PRINTS = "sessionTracePrints_v4_idb";
  const LEGACY_LS_PRINTS = "sessionTracePrints_v3";
  // Unlimited history (no slicing cap)
  const MAX_PRINTS = Infinity;
  const API = "https://en.wikipedia.org/w/api.php";
  const GLYPH_POOL = "ol|pb—·░c░i░";
  const MAX_GLYPHS = 2800;
  const GLYPH_LIFETIME_MS = 128000;
  const FALLBACK_WORDS = [
    "the",
    "and",
    "line",
    "read",
    "word",
    "page",
    "text",
    "field",
    "trace",
    "still",
  ];

  function storageLocalStorage(key, max) {
    return {
      load() {
        try {
          const raw = localStorage.getItem(key);
          return Promise.resolve(raw ? JSON.parse(raw) : []);
        } catch (_) {
          return Promise.resolve([]);
        }
      },
      save(list) {
        try {
          const m = typeof max === "number" && isFinite(max) ? max : Infinity;
          const next = m === Infinity ? list : list.slice(0, Math.max(0, m | 0));
          localStorage.setItem(key, JSON.stringify(next));
          return Promise.resolve(true);
        } catch (_) {
          return Promise.resolve(false);
        }
      },
    };
  }

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (!("indexedDB" in global)) {
        reject(new Error("indexeddb unavailable"));
        return;
      }
      const req = global.indexedDB.open(IDB_PRINTS, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains("prints")) {
          db.createObjectStore("prints", { keyPath: "t" });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error || new Error("indexeddb open failed"));
      };
    });
  }

  async function idbPutAll(list) {
    const db = await idbOpen();
    return await new Promise(function (resolve, reject) {
      const tx = db.transaction("prints", "readwrite");
      const store = tx.objectStore("prints");
      store.clear();
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (!it || typeof it.t !== "number" || !isFinite(it.t)) continue;
        store.put(it);
      }
      tx.oncomplete = function () {
        db.close();
        resolve(true);
      };
      tx.onerror = function () {
        db.close();
        reject(tx.error || new Error("indexeddb write failed"));
      };
    });
  }

  async function idbLoadAll() {
    const db = await idbOpen();
    return await new Promise(function (resolve, reject) {
      const tx = db.transaction("prints", "readonly");
      const store = tx.objectStore("prints");
      const req = store.getAll();
      req.onsuccess = function () {
        db.close();
        const rows = Array.isArray(req.result) ? req.result : [];
        resolve(rows);
      };
      req.onerror = function () {
        db.close();
        reject(req.error || new Error("indexeddb read failed"));
      };
    });
  }

  function dedupePrints(list) {
    const seen = new Set();
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (!it || typeof it.t !== "number" || !isFinite(it.t)) continue;
      const du = it.dataUrl != null ? String(it.dataUrl) : "";
      if (!du) continue;
      const k = String(it.t) + "|" + String(du.length) + "|" + du.slice(0, 48);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }
    out.sort(function (a, b) {
      return (b.t || 0) - (a.t || 0);
    });
    return out;
  }

  async function loadLegacyLocalPrints() {
    try {
      const raw = localStorage.getItem(LEGACY_LS_PRINTS);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function storagePrintArchive() {
    return {
      async load() {
        const idbList = await idbLoadAll().catch(function () {
          return [];
        });
        const metaList = await storageLocalStorage(LS_PRINTS, MAX_PRINTS).load();
        const legacy = await loadLegacyLocalPrints();
        return dedupePrints(idbList.concat(metaList).concat(legacy));
      },
      async save(list) {
        const next = dedupePrints(Array.isArray(list) ? list : []);
        let idbOk = false;
        try {
          await idbPutAll(next);
          idbOk = true;
        } catch (_) {
          idbOk = false;
        }

        const okMeta = await storageLocalStorage(LS_PRINTS, MAX_PRINTS).save(next);
        if (!okMeta) {
          try {
            localStorage.removeItem(LS_PRINTS);
          } catch (_) {}
        }

        if (!idbOk && !okMeta) {
          throw new Error("could not save history (storage full or unavailable).");
        }
        return true;
      },
    };
  }

  function fract(n) {
    return n - Math.floor(n);
  }

  function hash11(n) {
    return fract(Math.sin(n) * 43758.5453123);
  }

  function mount(cfg) {
    try {
      localStorage.removeItem("sessionTracePrints_v1");
      localStorage.removeItem("sessionTracePrints_v2");
    } catch (_) {}
    const host = cfg.host;
    const storage = cfg.storage;
    const els = cfg.elements;

    const tabSearch = els.tabSearch;
    const tabGallery = els.tabGallery;
    const viewSearch = els.viewSearch;
    const viewGallery = els.viewGallery;
    const galleryRoot = els.galleryRoot;
    const galleryStackFab = els.galleryStackFab;
    const searchForm = els.searchForm;
    const searchQueryEl = els.searchQueryEl;
    const endSessionBtn = els.endSessionBtn;
    const archiveViewer = els.archiveViewer;
    const archiveViewerStage = els.archiveViewerStage;
    const archiveViewerImg = els.archiveViewerImg;
    const archiveInspectLayer = els.archiveInspectLayer;
    const archiveViewerTitle = els.archiveViewerTitle;
    const archiveBtnSave = els.archiveBtnSave;
    const archiveBtnInspect = els.archiveBtnInspect;
    const archiveBtnClose = els.archiveBtnClose;
    const historyIconImg = els.historyIconImg;
    const historyIconFallback = els.historyIconFallback;
    const drawingStackPile = els.drawingStackPile;
    const stackDock = els.stackDock;
    const stackMiniPanel = els.stackMiniPanel;
    const stackMiniGrid = els.stackMiniGrid;
    const stackMiniClose = els.stackMiniClose;
    const stackMiniOpenFull = els.stackMiniOpenFull;
    const trackShell = els.trackShell;
    const trackStage = els.trackStage;
    const wikiViewport = els.wikiViewport;
    const wikiScroll = els.wikiScroll;
    const wikiArticle = els.wikiArticle;
    const wikiStatus = els.wikiStatus;
    const wikiNavForm = els.wikiNavForm;
    const wikiUrlInput = els.wikiUrlInput;
    const wikiBtnBack = els.wikiBtnBack;
    const wikiBtnFwd = els.wikiBtnFwd;
    const wikiBtnRandom = els.wikiBtnRandom;
    const residueCanvas = els.residueCanvas;
    const faintBgCanvas = els.faintBgCanvas;

    const ctx = residueCanvas.getContext("2d", { alpha: true });
    const bgCtx = faintBgCanvas.getContext("2d", { alpha: true });

    let sessionActive = false;
    let sessionQuery = "";
    let stackMiniOpen = false;

    let archiveOpenItem = null;
    let archiveInspectOn = false;
    const inspectRevealTimers = [];

    const wikiHistory = [];
    let wikiHistPos = -1;

    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    let trackResizeObserver = null;

    const glyphMarks = [];
    let articleWords = FALLBACK_WORDS.slice();
    const pointers = new Map();
    let lastPointerX = 0;
    let lastPointerY = 0;

    let wordHoverTs = 0;
    let wordHoverLastWord = null;
    const wordHoverTotals = new Map();
    const wordHoverOrder = [];
    const wordHoverFirstMs = new Map();
    const wordHoverFirstNorm = new Map();

    function resetWordHoverTrail() {
      wordHoverTs = 0;
      wordHoverLastWord = null;
      wordHoverTotals.clear();
      wordHoverOrder.length = 0;
      wordHoverFirstMs.clear();
      wordHoverFirstNorm.clear();
    }

    function wordFromTextNode(textNode, offset) {
      const text = textNode.textContent || "";
      const o = Math.max(0, Math.min(offset | 0, text.length));
      let start = o;
      let end = o;
      while (start > 0 && /[\w'\-]/.test(text.charAt(start - 1))) start--;
      while (end < text.length && /[\w'\-]/.test(text.charAt(end))) end++;
      const raw = text.slice(start, end).replace(/^[^\w]+|[^\w]+$/g, "");
      if (raw.length < 2) return null;
      return raw.toLowerCase();
    }

    function wordAtClientPoint(clientX, clientY) {
      if (!wikiArticle || !wikiArticle.isConnected) return null;
      let node = null;
      let offset = 0;
      if (typeof document.caretRangeFromPoint === "function") {
        const r = document.caretRangeFromPoint(clientX, clientY);
        if (!r) return null;
        node = r.startContainer;
        offset = r.startOffset;
      } else if (typeof document.caretPositionFromPoint === "function") {
        const pos = document.caretPositionFromPoint(clientX, clientY);
        if (!pos || !pos.offsetNode) return null;
        node = pos.offsetNode;
        offset = pos.offset;
      } else {
        return null;
      }
      if (!wikiScroll || !wikiScroll.contains(node)) return null;
      if (node.nodeType !== Node.TEXT_NODE) {
        const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        if (!el) return null;
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        const first = tw.nextNode();
        if (!first || !wikiArticle.contains(first)) return null;
        node = first;
        offset = 0;
      }
      return wordFromTextNode(node, offset);
    }

    function trackWordHover(ts, clientX, clientY) {
      if (!sessionActive || !wikiArticle) return;
      const t = typeof ts === "number" ? ts : performance.now();
      const dt = wordHoverTs ? Math.min(120, Math.max(0, t - wordHoverTs)) : 0;
      wordHoverTs = t;
      const w = isOverWikiViewport(clientX, clientY) ? wordAtClientPoint(clientX, clientY) : null;
      if (wordHoverLastWord && dt > 0 && w === wordHoverLastWord) {
        wordHoverTotals.set(
          wordHoverLastWord,
          (wordHoverTotals.get(wordHoverLastWord) || 0) + dt
        );
      }
      if (w !== wordHoverLastWord) {
        wordHoverLastWord = w;
        if (w && !wordHoverTotals.has(w)) {
          wordHoverTotals.set(w, 0);
          wordHoverOrder.push(w);
          wordHoverFirstMs.set(w, Date.now());
          if (wikiScroll) {
            const r = wikiScroll.getBoundingClientRect();
            const rw = Math.max(1, r.width);
            const rh = Math.max(1, r.height);
            wordHoverFirstNorm.set(w, {
              x: (clientX - r.left) / rw,
              y: (clientY - r.top) / rh,
            });
          }
        }
      }
    }

    const POS_T_SLOW = 0.095;
    const POS_T_FAST = 0.42;
    const POS_SPEED_REF = 0.88;
    const usePointerRaw =
      typeof PointerEvent !== "undefined" && "onpointerrawupdate" in window;

    let rafOn = false;
    let lastFrame = performance.now();

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    function clamp01(t) {
      return t < 0 ? 0 : t > 1 ? 1 : t;
    }

    function setWikiStatus(msg, isErr) {
      if (!wikiStatus) return;
      wikiStatus.textContent = msg || "";
      wikiStatus.classList.toggle("wiki-error", !!isErr);
    }

    async function wikiFetch(params) {
      const u = new URL(API);
      u.searchParams.set("format", "json");
      u.searchParams.set("origin", "*");
      for (const k of Object.keys(params)) {
        u.searchParams.set(k, String(params[k]));
      }
      const res = await fetch(u.toString(), { mode: "cors" });
      if (!res.ok) throw new Error("could not reach wikipedia.");
      return res.json();
    }

    async function resolveCanonicalTitle(q) {
      const trimmed = (q || "").trim();
      if (!trimmed) throw new Error("enter a title or phrase.");
      const direct = await wikiFetch({
        action: "query",
        titles: trimmed,
        redirects: "1",
      });
      const pages = direct.query.pages;
      const id = Object.keys(pages)[0];
      if (id !== "-1" && !pages[id].missing) {
        return pages[id].title;
      }
      const search = await wikiFetch({
        action: "query",
        list: "search",
        srsearch: trimmed,
        srlimit: "1",
        srnamespace: "0",
      });
      const hits = search.query.search;
      if (!hits || !hits.length) throw new Error("no article matched that search.");
      return hits[0].title;
    }

    async function loadRandomWikiTitle() {
      const data = await wikiFetch({
        action: "query",
        generator: "random",
        grnnamespace: "0",
        grnlimit: "1",
        prop: "info",
      });
      const pages = data.query.pages;
      const id = Object.keys(pages)[0];
      const p = pages[id];
      if (!p || p.missing) throw new Error("Random draw failed.");
      return p.title;
    }

    async function fetchParseHtml(pageTitle) {
      const data = await wikiFetch({
        action: "parse",
        page: pageTitle,
        prop: "text",
        formatversion: "2",
        redirects: "1",
        disableeditsection: "1",
      });
      if (data.error) {
        throw new Error(
          String(data.error.info || data.error.code || "could not load article html.").toLowerCase()
        );
      }
      const p = data.parse;
      if (!p) throw new Error("No parse result.");
      const raw =
        typeof p.text === "string" ? p.text : p.text && p.text["*"] != null ? String(p.text["*"]) : "";
      if (!raw.trim()) throw new Error("article body was empty.");
      return { title: p.title, html: raw };
    }

    function titleFromWikiPath(pathOnly) {
      const path = (pathOnly || "").split("#")[0];
      if (!path) return null;
      if (path.startsWith("/wiki/")) {
        let t = path.slice(6);
        t = decodeURIComponent(t.replace(/\+/g, " "));
        return t.replace(/_/g, " ");
      }
      return null;
    }

    function titleFromIndexPhp(href) {
      try {
        const u = new URL(href, "https:/fr.wikipedia.org");
        if (!u.pathname.endsWith("/index.php") && u.pathname !== "/w/index.php") return null;
        const t = u.searchParams.get("title");
        if (!t) return null;
        return decodeURIComponent(t.replace(/\+/g, " "));
      } catch (_) {
        return null;
      }
    }

    function shouldOpenWikiExternally(title) {
      return /^(Special:|MediaWiki:)/i.test((title || "").trim());
    }

    function rewriteWikiFragmentForApp(container) {
      container.querySelectorAll("script").forEach(function (el) {
        el.remove();
      });
      container.querySelectorAll("style").forEach(function (el) {
        el.remove();
      });
      container.querySelectorAll("link[rel]").forEach(function (el) {
        el.remove();
      });

      container.querySelectorAll("img[src]").forEach(function (img) {
        const s = img.getAttribute("src") || "";
        if (s.startsWith("//")) img.setAttribute("src", "https:" + s);
        else if (s.startsWith("/")) img.setAttribute("src", "https://en.wikipedia.org" + s);
      });

      container.querySelectorAll("a[href]").forEach(function (a) {
        const href = a.getAttribute("href") || "";
        if (href.startsWith("#")) return;

        if (/^https?:\/\//i.test(href)) {
          try {
            const u = new URL(href);
            const host = u.hostname || "";
            if (/wikipedia\.org$/i.test(host) && u.pathname.startsWith("/wiki/")) {
              a.setAttribute("data-wiki-href", u.pathname + u.search);
              a.setAttribute("href", "#");
              a.classList.add("wiki-internal");
              return;
            }
          } catch (_) {}
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener noreferrer");
          return;
        }

        if (href.startsWith("//")) {
          a.setAttribute("href", "https:" + href);
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener noreferrer");
          return;
        }

        if (href.startsWith("/wiki/")) {
          a.setAttribute("data-wiki-href", href.split("#")[0]);
          a.setAttribute("href", "#");
          a.classList.add("wiki-internal");
          return;
        }

        if (href.startsWith("/w/index.php") || href.startsWith("/index.php")) {
          const full = "https://en.wikipedia.org" + (href.startsWith("/w/") ? href : "/w" + href);
          const t = titleFromIndexPhp(full);
          if (t) {
            a.setAttribute("data-wiki-title", t);
            a.setAttribute("href", "#");
            a.classList.add("wiki-internal");
            return;
          }
        }
      });
    }

    function installParsedWikiHtml(resolvedTitle, htmlString) {
      if (!wikiArticle) return;
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, "text/html");
      let root = doc.querySelector(".mw-parser-output");
      if (!root) root = doc.body;

      rewriteWikiFragmentForApp(root);

      wikiArticle.innerHTML = "";
      wikiArticle.className = "wiki-article mw-parser-output";
      while (root.firstChild) {
        wikiArticle.appendChild(root.firstChild);
      }

      if (wikiScroll) wikiScroll.scrollTop = 0;
      if (wikiUrlInput) wikiUrlInput.value = resolvedTitle;
      articleWords = tokenizeWordsForTrail(wikiArticle.innerText || "");
    }

    function tokenizeWordsForTrail(text) {
      const raw = (text || "").split(/\s+/);
      const seen = new Set();
      const out = [];
      for (let i = 0; i < raw.length; i++) {
        let w = raw[i]
          .replace(/^[\s"'“‘(\[{«]+|[\s"'”’)\]},.;:!?]+$/g, "")
          .toLowerCase();
        if (w.length < 3 || w.length > 22 || seen.has(w)) continue;
        if (!/[a-zA-Z\u00C0-\u024F]/.test(w)) continue;
        seen.add(w);
        out.push(w);
        if (out.length >= 400) break;
      }
      return out.length ? out : FALLBACK_WORDS.slice();
    }

    function pushWikiHistory(title) {
      wikiHistory.splice(wikiHistPos + 1);
      wikiHistory.push(title);
      wikiHistPos = wikiHistory.length - 1;
      updateWikiNavButtons();
    }

    function updateWikiNavButtons() {
      if (wikiBtnBack) wikiBtnBack.disabled = wikiHistPos <= 0;
      if (wikiBtnFwd) wikiBtnFwd.disabled = wikiHistPos >= wikiHistory.length - 1;
    }

    async function openWikiPage(title, pushHist, navOpts) {
      const skipResolve = navOpts && navOpts.resolve === false;
      setWikiStatus("fetching…");
      try {
        const canonical = skipResolve ? String(title || "").trim() : await resolveCanonicalTitle(title);
        if (!canonical) 
          throw new Error("enter a title or phrase.");
        const { title: t, html } = await fetchParseHtml(canonical);
        installParsedWikiHtml(t, html);
        sessionQuery = t;
        if (pushHist) pushWikiHistory(t);
        setWikiStatus((t + " — linked navigation stays in this session.").toLowerCase());
      } catch (e) {
        setWikiStatus(String(e.message || e).toLowerCase(), true);
      }
    }

    async function openRandomWiki(pushHist) {
      setWikiStatus("drawing a random article…");
      try {
        const title = await loadRandomWikiTitle();
        const { title: t, html } = await fetchParseHtml(title);
        installParsedWikiHtml(t, html);
        sessionQuery = t;
        if (pushHist) pushWikiHistory(t);
        setWikiStatus((t + " — linked navigation stays in this session.").toLowerCase());
      } catch (e) {
        setWikiStatus(String(e.message || e).toLowerCase(), true);
      }
    }

    function onWikiContentClick(e) {
      if (!sessionActive || !wikiArticle) return;
      const a = e.target.closest("a");
      if (!a || !wikiArticle.contains(a)) return;

      const href = a.getAttribute("href") || "";
      const dataPath = a.getAttribute("data-wiki-href");
      const dataTitle = a.getAttribute("data-wiki-title");
      let nextTitle = dataTitle;
      if (!nextTitle && dataPath) nextTitle = titleFromWikiPath(dataPath);
      if (nextTitle) {
        e.preventDefault();
        if (shouldOpenWikiExternally(nextTitle)) {
          const path = dataPath || "/wiki/" + encodeURIComponent(nextTitle.replace(/ /g, "_"));
          window.open("https://en.wikipedia.org" + path, "_blank", "noopener,noreferrer");
          return;
        }
        void openWikiPage(nextTitle, true, { resolve: false });
        return;
      }

      if (href.startsWith("#")) {
        e.preventDefault();
        const raw = href.slice(1);
        if (!raw) return;
        const id = decodeURIComponent(raw).replace(/\s/g, "_");
        let target = null;
        try {
          target = wikiArticle.querySelector("[id=\"" + id.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + "\"]");
        } catch (_) {}
        if (!target && typeof CSS !== "undefined" && CSS.escape) {
          try {
            target = wikiArticle.querySelector("[id=\"" + CSS.escape(id) + "\"]");
          } catch (_) {}
        }
        if (!target) target = document.getElementById(id);
        if (target && wikiArticle.contains(target)) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }

    function readViewport() {
      if (sessionActive && wikiScroll) {
        const r = wikiScroll.getBoundingClientRect();
        const w = Math.floor(r.width);
        const h = Math.floor(r.height);
        if (w >= 2 && h >= 2) return { w, h };
      }
      return { w: window.innerWidth, h: window.innerHeight };
    }

    function resizeCanvases() {
      const vp = readViewport();
      cssW = Math.max(1, vp.w);
      cssH = Math.max(1, vp.h);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rw = Math.max(1, Math.floor(cssW * dpr));
      const rh = Math.max(1, Math.floor(cssH * dpr));

      residueCanvas.width = rw;
      residueCanvas.height = rh;
      residueCanvas.style.width = cssW + "px";
      residueCanvas.style.height = cssH + "px";
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      faintBgCanvas.width = rw;
      faintBgCanvas.height = rh;
      faintBgCanvas.style.width = cssW + "px";
      faintBgCanvas.style.height = cssH + "px";
      bgCtx.setTransform(1, 0, 0, 1, 0, 0);
      bgCtx.scale(dpr, dpr);

      drawFaintBackground();
    }

    function drawFaintBackground() {
      bgCtx.clearRect(0, 0, cssW, cssH);
      bgCtx.fillStyle = "rgba(0, 0, 0, 0.028)";
      bgCtx.font = '15px "Courier Prime", "Courier New", monospace';
      const snippets = [
        "the margin of the page returns what was forgotten",
        "reading is a slow weather across the line",
        "attention pools then drains along the gutter",
        "the text continues beneath what you see",
      ];
      let y = 22;
      let lineIdx = 0;
      while (y < cssH + 40) {
        const line = snippets[lineIdx % snippets.length];
        lineIdx++;
        const off = (hash11(y * 0.31) - 0.5) * 4;
        bgCtx.fillText(line.slice(0, Math.min(line.length, 72)), 8 + off, y);
        y += 17 + ((hash11(y * 1.7) * 8) | 0);
      }
      for (let i = 0; i < 400; i++) {
        bgCtx.fillStyle = "rgba(0, 0, 0, " + (0.012 + hash11(i * 9.2) * 0.025) + ")";
        bgCtx.fillRect(hash11(i) * cssW, hash11(i + 1) * cssH, 1, 1);
      }
    }

    function disconnectTrackObserver() {
      if (trackResizeObserver) {
        trackResizeObserver.disconnect();
        trackResizeObserver = null;
      }
    }

    function bindTrackResize() {
      disconnectTrackObserver();
      const roTarget = wikiScroll || wikiViewport;
      if (roTarget && typeof ResizeObserver !== "undefined") {
        trackResizeObserver = new ResizeObserver(function () {
          resizeCanvases();
        });
        trackResizeObserver.observe(roTarget);
      }
    }

    function qPoint(ax, ay, cx, cy, ex, ey, t) {
      const u = 1 - t;
      return {
        x: u * u * ax + 2 * u * t * cx + t * t * ex,
        y: u * u * ay + 2 * u * t * cy + t * t * ey,
      };
    }

    function qTan(ax, ay, cx, cy, ex, ey, t) {
      const u = 1 - t;
      const dx = 2 * u * (cx - ax) + 2 * t * (ex - cx);
      const dy = 2 * u * (cy - ay) + 2 * t * (ey - cy);
      const L = Math.hypot(dx, dy) || 1;
      return { tx: dx / L, ty: dy / L, nx: -dy / L, ny: dx / L };
    }

    function pushGlyphsAlongQuad(sx, sy, cpx, cpy, ex, ey, speedPx) {
      const rough =
        Math.hypot(cpx - sx, cpy - sy) + Math.hypot(ex - cpx, ey - cpy);
      const chord = Math.hypot(ex - sx, ey - sy);
      const estArc = (rough + chord) * 0.48;
      if (estArc < 0.35) return;

      const speedN = clamp01(speedPx / POS_SPEED_REF);
      const density = lerp(1.15, 0.22, speedN);
      const steps = Math.max(4, Math.ceil(estArc * density));
      const wave = performance.now() * 0.001;

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = qPoint(sx, sy, cpx, cpy, ex, ey, t);
        const tan = qTan(sx, sy, cpx, cpy, ex, ey, t);
        const wobble = Math.sin(t * 6.2 + wave + i * 0.2) * (3.2 + speedN * 2);
        const count = speedN < 0.45 ? 4 : speedN < 0.72 ? 2 : 1;
        for (let r = 0; r < count; r++) {
          const seed = i * 19.7 + r * 41.3;
          const jn = (hash11(seed) - 0.5) * (5 + r * 2.5);
          const jt = (hash11(seed + 2) - 0.5) * 1.8;
          const x = p.x + tan.nx * (wobble + jn) + tan.tx * jt;
          const y = p.y + tan.ny * (wobble + jn) + tan.ty * jt;
          const rot = (hash11(seed + 6) - 0.5) * 0.45;
          let text;
          if (articleWords.length && hash11(seed + 4) > 0.12) {
            const wi = Math.floor(hash11(seed + 5) * articleWords.length);
            text = articleWords[Math.max(0, Math.min(articleWords.length - 1, wi))];
          } else {
            const pi = Math.floor(hash11(seed + 4) * GLYPH_POOL.length);
            text = GLYPH_POOL.charAt(Math.max(0, Math.min(GLYPH_POOL.length - 1, pi)));
          }
          glyphMarks.push({ x, y, rot, text, age: 0 });
        }
      }
      while (glyphMarks.length > MAX_GLYPHS) glyphMarks.shift();
    }

    function isOverWikiViewport(clientX, clientY) {
      const el = wikiScroll || wikiViewport;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return (
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      );
    }

    function toViewportXY(clientX, clientY) {
      const el = wikiScroll || wikiViewport;
      const r = el.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    }

    function ensurePointerState(id, x, y) {
      let st = pointers.get(id);
      if (st) return st;
      st = {
        speedPxPerMs: 0.15,
        lx: x,
        ly: y,
        plx: x,
        ply: y,
        prevDrawX: x,
        prevDrawY: y,
        ready: false,
        lastTs: null,
        rawPx: x,
        rawPy: y,
      };
      pointers.set(id, st);
      return st;
    }

    function processPointerSample(sample) {
      if (!sessionActive) return;
      const x = sample.clientX;
      const y = sample.clientY;
      lastPointerX = x;
      lastPointerY = y;
      const over = isOverWikiViewport(x, y);
      const st = ensurePointerState(sample.pointerId, x, y);
      const ts =
        typeof sample.timeStamp === "number" ? sample.timeStamp : performance.now();
      if (st.lastTs == null) {
        st.lastTs = ts;
        st.rawPx = x;
        st.rawPy = y;
      } else {
        const dt = Math.max(5, ts - st.lastTs);
        st.lastTs = ts;
        const rdx = x - st.rawPx;
        const rdy = y - st.rawPy;
        st.rawPx = x;
        st.rawPy = y;
        const rawLen = Math.hypot(rdx, rdy);
        st.speedPxPerMs = lerp(st.speedPxPerMs, rawLen / dt, 0.35);
      }
      const speedN = clamp01(st.speedPxPerMs / POS_SPEED_REF);
      const posT = lerp(POS_T_SLOW, POS_T_FAST, speedN);
      st.lx = lerp(st.lx, x, posT);
      st.ly = lerp(st.ly, y, posT);
      if (!st.ready) {
        st.plx = st.lx;
        st.ply = st.ly;
        st.prevDrawX = st.lx;
        st.prevDrawY = st.ly;
        st.ready = true;
        trackWordHover(ts, x, y);
        return;
      }
      const mx = (st.plx + st.lx) * 0.5;
      const my = (st.ply + st.ly) * 0.5;
      if (over) {
        const v0 = toViewportXY(st.prevDrawX, st.prevDrawY);
        const vc = toViewportXY(st.plx, st.ply);
        const ve = toViewportXY(mx, my);
        pushGlyphsAlongQuad(v0.x, v0.y, vc.x, vc.y, ve.x, ve.y, st.speedPxPerMs);
      }
      st.prevDrawX = mx;
      st.prevDrawY = my;
      st.plx = st.lx;
      st.ply = st.ly;
      trackWordHover(sample.timeStamp, x, y);
    }

    function onPointerMoveDoc(e) {
      if (!sessionActive) return;
      const batch =
        !usePointerRaw && typeof e.getCoalescedEvents === "function"
          ? e.getCoalescedEvents()
          : [e];
      for (let i = 0; i < batch.length; i++) {
        processPointerSample(batch[i]);
      }
      if (!rafOn) {
        rafOn = true;
        lastFrame = performance.now();
        requestAnimationFrame(tick);
      }
    }

    function drawGlyphFrame(dt) {
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.textBaseline = "middle";

      for (let i = glyphMarks.length - 1; i >= 0; i--) {
        const g = glyphMarks[i];
        g.age += dt;
        if (g.age > GLYPH_LIFETIME_MS) {
          glyphMarks.splice(i, 1);
          continue;
        }
        const fade = Math.max(0, 1 - g.age / GLYPH_LIFETIME_MS);
        const a = fade * (0.42 + hash11(g.age * 0.01 + i) * 0.28);
        const label = g.text != null ? String(g.text) : String(g.ch || "");
        const fs = label.length <= 1 ? 12 : label.length <= 5 ? 11 : 10;
        ctx.font =
          fs +
          'px "Courier Prime", "Courier New", "Liberation Mono", monospace';
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.rot);
        ctx.fillStyle = "rgba(255, 255, 255, " + (a * 0.12) + ")";
        ctx.fillText(label, -0.35, -0.35);
        ctx.fillStyle = "rgba(12, 12, 12, " + a + ")";
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    }

    function tick(t) {
      const dt = Math.min(48, t - lastFrame);
      lastFrame = t;
      drawGlyphFrame(dt);
      if (glyphMarks.length) {
        requestAnimationFrame(tick);
      } else {
        rafOn = false;
      }
    }

    function compositeSessionPrint() {
      const rw = Math.max(1, residueCanvas.width | 0);
      const rh = Math.max(1, residueCanvas.height | 0);
      const oc = document.createElement("canvas");
      oc.width = rw;
      oc.height = rh;
      const o = oc.getContext("2d");
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.fillStyle = "#ffffff";
      o.fillRect(0, 0, rw, rh);
      try {
        o.drawImage(residueCanvas, 0, 0);
      } catch (_) {}
      return oc.toDataURL("image/png");
    }

    function setMainView(mode) {
      host.classList.remove("view-mode-search", "view-mode-gallery", "view-mode-track", "view-mode-scroll");
      host.classList.add("view-mode-" + mode);
      if (trackShell) {
        const showTrack = mode === "track";
        trackShell.classList.toggle("hidden", !showTrack);
        trackShell.setAttribute("aria-hidden", showTrack ? "false" : "true");
      }
    }

    function setStackMiniOpen(open) {
      stackMiniOpen = !!open;
      if (!stackMiniPanel || !galleryStackFab) return;
      stackMiniPanel.classList.toggle("is-open", stackMiniOpen);
      if (stackMiniOpen) {
        stackMiniPanel.removeAttribute("hidden");
        stackMiniPanel.setAttribute("aria-hidden", "false");
      } else {
        stackMiniPanel.setAttribute("hidden", "");
        stackMiniPanel.setAttribute("aria-hidden", "true");
      }
      galleryStackFab.setAttribute("aria-expanded", stackMiniOpen ? "true" : "false");
    }

    function renderStackMiniGrid(list) {
      if (!stackMiniGrid) return;
      stackMiniGrid.innerHTML = "";
      if (!list || list.length === 0) {
        const p = document.createElement("p");
        p.className = "stack-mini-empty";
        p.textContent = "no prints yet.";
        stackMiniGrid.appendChild(p);
        return;
      }
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item.dataUrl) continue;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "stack-mini-cell";
        const img = document.createElement("img");
        img.src = item.dataUrl;
        img.alt = item.query != null ? String(item.query) : "";
        btn.appendChild(img);
        btn.addEventListener("click", function () {
          setStackMiniOpen(false);
          openArchiveViewer(item);
        });
        stackMiniGrid.appendChild(btn);
      }
    }

    async function loadPrints() {
      return await storage.load();
    }

    async function refreshPrintsChrome() {
      const list = await loadPrints();
      if (historyIconImg && historyIconFallback) {
        if (list.length > 0 && list[0].dataUrl) {
          historyIconImg.src = list[0].dataUrl;
          historyIconImg.classList.remove("hidden");
          historyIconFallback.classList.add("hidden");
        } else {
          historyIconImg.removeAttribute("src");
          historyIconImg.classList.add("hidden");
          historyIconFallback.classList.remove("hidden");
        }
      }
      if (drawingStackPile) {
        drawingStackPile.innerHTML = "";
        drawingStackPile.classList.toggle("drawing-stack-pile--empty", list.length === 0);
        const top = list.slice(0, 4);
        const rot = [-13, 5, -7, 9];
        const tx = [0, 5, -3, 7];
        const ty = [0, 2, 4, 1];
        for (let i = 0; i < top.length; i++) {
          const item = top[i];
          if (!item.dataUrl) continue;
          const sheet = document.createElement("div");
          sheet.className = "drawing-stack-sheet";
          sheet.style.transform =
            "translate(" + tx[i] + "px," + ty[i] + "px) rotate(" + rot[i] + "deg)";
          sheet.style.zIndex = String(10 - i);
          const img = document.createElement("img");
          img.src = item.dataUrl;
          img.alt = "";
          sheet.appendChild(img);
          drawingStackPile.appendChild(sheet);
        }
      }
      renderStackMiniGrid(list);
    }

    async function savePrints(list) {
      await storage.save(list);
    }

    async function ensurePrintSavedIfMissing(dataUrl, ts, query) {
      const du = dataUrl || "";
      const t = typeof ts === "number" && isFinite(ts) && ts > 0 ? ts : 0;
      if (!du || !t) return;
      const q = (query || "").trim();
      const list = await loadPrints();
      const exists = list.some(function (it) {
        return it && it.t === t && it.dataUrl === du;
      });
      if (exists) return;
      list.unshift({ query: q, dataUrl: du, t: t, hoverTrail: [] });
      await savePrints(list);
      await renderGallery();
      await refreshPrintsChrome();
    }

    function startOfDayMs(ts) {
      const d = new Date(ts);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }

    function formatDayHeading(ts) {
      const d = new Date(ts);
      const now = new Date();
      const tToday = startOfDayMs(now.getTime());
      const tDay = startOfDayMs(ts);
      const diffDays = Math.round((tToday - tDay) / 86400000);
      const opts = { weekday: "long", month: "long", day: "numeric", year: "numeric" };
      if (diffDays === 0) {
        return ("today – " + d.toLocaleDateString(undefined, opts)).toLowerCase();
      }
      if (diffDays === 1) {
        return ("yesterday – " + d.toLocaleDateString(undefined, opts)).toLowerCase();
      }
      return d.toLocaleDateString(undefined, opts).toLowerCase();
    }

    function formatItemTime(ts) {
      if (typeof ts !== "number" || !isFinite(ts) || ts <= 0) return "—";
      const d = new Date(ts);
      return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).toLowerCase();
    }

    async function renderGallery() {
      if (!galleryRoot) {
        void refreshPrintsChrome();
        return;
      }
      const list = await loadPrints();
      const byDay = new Map();
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const key = startOfDayMs(item.t || Date.now());
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push(item);
      }
      const keys = Array.from(byDay.keys()).sort(function (a, b) {
        return b - a;
      });
      galleryRoot.innerHTML = "";
      if (keys.length === 0) {
        const empty = document.createElement("p");
        empty.className = "gallery-empty";
        empty.textContent = "no prints yet. run a reading session first.";
        galleryRoot.appendChild(empty);
        void refreshPrintsChrome();
        return;
      }
      keys.forEach(function (dayKey) {
        const items = byDay.get(dayKey).slice().sort(function (a, b) {
          return (b.t || 0) - (a.t || 0);
        });
        const h = document.createElement("h2");
        h.className = "gallery-section-title";
        h.textContent = formatDayHeading(items[0].t || Date.now());
        galleryRoot.appendChild(h);
        const row = document.createElement("div");
        row.className = "gallery-day-grid";
        items.forEach(function (item) {
          const cell = document.createElement("button");
          cell.type = "button";
          cell.className = "gallery-cell";
          const thumb = document.createElement("div");
          thumb.className = "gallery-polaroid-thumb";
          const img = document.createElement("img");
          img.src = item.dataUrl;
          img.alt = "";
          const hoverWords = document.createElement("div");
          hoverWords.className = "gallery-hover-words";
          thumb.appendChild(img);
          thumb.appendChild(hoverWords);
          const trail = Array.isArray(item.hoverTrail) ? item.hoverTrail : [];
          cell._hoverTrail = trail;
          cell._hoverLayer = hoverWords;
          cell._hoverSeqTimer = null;

          function clearHoverSeq() {
            if (cell._hoverSeqTimer) {
              clearTimeout(cell._hoverSeqTimer);
              cell._hoverSeqTimer = null;
            }
            hoverWords.textContent = "";
          }

          function runHoverSeq() {
            clearHoverSeq();
            if (!trail.length) return;
            let i = 0;
            function step() {
              if (i >= trail.length) {
                cell._hoverSeqTimer = null;
                hoverWords.textContent = "";
                return;
              }
              const seg = trail[i];
              hoverWords.textContent = seg.word != null ? String(seg.word) : "";
              const ms = seg.ms != null ? Number(seg.ms) : 400;
              const dur = Math.max(180, Math.min(9000, isFinite(ms) ? ms : 400));
              i++;
              cell._hoverSeqTimer = setTimeout(step, dur);
            }
            step();
          }

          cell.addEventListener("mouseenter", function () {
            runHoverSeq();
          });
          cell.addEventListener("mouseleave", function () {
            clearHoverSeq();
          });
          cell.addEventListener("focus", function () {
            runHoverSeq();
          });
          cell.addEventListener("blur", function () {
            clearHoverSeq();
          });

          const cap = document.createElement("div");
          cap.className = "gallery-cell-caption";
          const q = item.query != null ? String(item.query) : "";
          cap.textContent = (q || "").trim().toLowerCase();
          const timeEl = document.createElement("div");
          timeEl.className = "gallery-cell-time";
          timeEl.textContent = formatItemTime(
            typeof item.t === "number" && isFinite(item.t) ? item.t : 0
          );
          cell.appendChild(thumb);
          cell.appendChild(cap);
          cell.appendChild(timeEl);
          cell.addEventListener("click", function () {
            openArchiveViewer(item);
          });
          row.appendChild(cell);
        });
        galleryRoot.appendChild(row);
      });
      void refreshPrintsChrome();
    }

    function wikiWordHref(word) {
      const w = String(word || "")
        .trim()
        .toLowerCase();
      if (!w) return "#";
      return "https://en.wikipedia.org/wiki/" + encodeURIComponent(w.replace(/ /g, "_"));
    }

    function formatInspectClock(ms) {
      const d = new Date(typeof ms === "number" && isFinite(ms) ? ms : Date.now());
      try {
        return d
          .toLocaleTimeString(undefined, {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
          .toLowerCase();
      } catch (_) {
        return "";
      }
    }

    function fallbackNormXY(word, idx) {
      const s = String(word || "x");
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
      const x = 0.1 + (h % 75) / 100;
      const y = 0.12 + (((h / 7) >>> 0) % 72) / 100;
      return {
        x: Math.min(0.9, Math.max(0.1, x)),
        y: Math.min(0.88, Math.max(0.12, y + (idx % 7) * 0.02)),
      };
    }

    function trailFirstHits(trail, itemT) {
      const out = [];
      const seen = new Set();
      const arr = Array.isArray(trail) ? trail : [];
      const baseT =
        typeof itemT === "number" && isFinite(itemT) && itemT > 0 ? itemT : Date.now();
      for (let i = 0; i < arr.length; i++) {
        const seg = arr[i];
        const word = seg && seg.word != null ? String(seg.word).trim().toLowerCase() : "";
        if (!word || seen.has(word)) continue;
        seen.add(word);
        let firstT = null;
        if (typeof seg.firstT === "number" && isFinite(seg.firstT)) firstT = seg.firstT;
        else if (typeof seg.t === "number" && isFinite(seg.t)) firstT = seg.t;
        else firstT = baseT + out.length * 1000;
        let x = typeof seg.x === "number" && isFinite(seg.x) ? seg.x : null;
        let y = typeof seg.y === "number" && isFinite(seg.y) ? seg.y : null;
        if (x == null || y == null) {
          const fb = fallbackNormXY(word, out.length);
          x = fb.x;
          y = fb.y;
        }
        x = Math.min(0.92, Math.max(0.08, x));
        y = Math.min(0.9, Math.max(0.08, y));
        out.push({ word: word, firstT: firstT, x: x, y: y });
      }
      return out;
    }

    function clearInspectRevealTimers() {
      for (let i = 0; i < inspectRevealTimers.length; i++) {
        clearTimeout(inspectRevealTimers[i]);
      }
      inspectRevealTimers.length = 0;
    }

    function resetArchiveInspectUi() {
      archiveInspectOn = false;
      clearInspectRevealTimers();
      if (archiveViewer) archiveViewer.classList.remove("archive-viewer--inspect");
      if (archiveInspectLayer) {
        archiveInspectLayer.innerHTML = "";
        archiveInspectLayer.classList.add("hidden");
        archiveInspectLayer.setAttribute("aria-hidden", "true");
      }
      if (archiveViewerImg) {
        archiveViewerImg.style.opacity = "1";
        archiveViewerImg.style.visibility = "visible";
      }
    }

    function rectsOverlapInspect(a, b, pad) {
      const m = typeof pad === "number" ? pad : 0;
      return !(
        a.right + m < b.left ||
        a.left - m > b.right ||
        a.bottom + m < b.top ||
        a.top - m > b.bottom
      );
    }

    function getInspectDy(el) {
      const v = el.dataset.inspectDy;
      const n = v ? parseInt(v, 10) : 0;
      return isFinite(n) ? n : 0;
    }

    function setInspectDy(el, dy) {
      el.dataset.inspectDy = String(dy);
      el.style.transform = "translate(-50%, calc(-50% + " + dy + "px))";
    }

    function resolveInspectHitOverlaps(nodes) {
      if (!nodes || nodes.length < 2) return;
      const margin = 12;
      const step = 12;
      nodes.forEach(function (n) {
        setInspectDy(n, 0);
      });
      nodes.sort(function (a, b) {
        const ta = parseFloat(a.style.top) || 0;
        const tb = parseFloat(b.style.top) || 0;
        if (ta !== tb) return ta - tb;
        return (parseFloat(a.style.left) || 0) - (parseFloat(b.style.left) || 0);
      });
      const placedRects = [];
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        let dy = 0;
        for (let guard = 0; guard < 140; guard++) {
          setInspectDy(n, dy);
          const r = n.getBoundingClientRect();
          let overlaps = false;
          for (let j = 0; j < placedRects.length; j++) {
            if (rectsOverlapInspect(r, placedRects[j], margin)) {
              overlaps = true;
              break;
            }
          }
          if (!overlaps) {
            placedRects.push(r);
            break;
          }
          dy += step;
        }
      }
    }

    function buildInspectMarkers(item) {
      if (!archiveInspectLayer || !item) return;
      archiveInspectLayer.innerHTML = "";
      const hits = trailFirstHits(item.hoverTrail, item.t);
      const nodes = [];
      for (let i = 0; i < hits.length; i++) {
        const h0 = hits[i];
        const a = document.createElement("a");
        a.className = "archive-inspect-hit";
        a.href = wikiWordHref(h0.word);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = h0.word + " - " + formatInspectClock(h0.firstT);
        a.style.left = h0.x * 100 + "%";
        a.style.top = h0.y * 100 + "%";
        archiveInspectLayer.appendChild(a);
        nodes.push(a);
      }
      if (nodes.length === 0) return;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          resolveInspectHitOverlaps(nodes);
          for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            const tmr = setTimeout(function () {
              el.classList.add("archive-inspect-hit--visible");
            }, i * 420);
            inspectRevealTimers.push(tmr);
          }
        });
      });
    }

    function setArchiveInspect(on) {
      if (!archiveViewer || !archiveInspectLayer) return;
      if (on) {
        clearInspectRevealTimers();
        archiveInspectOn = true;
        archiveViewer.classList.add("archive-viewer--inspect");
        archiveInspectLayer.innerHTML = "";
        archiveInspectLayer.classList.remove("hidden");
        archiveInspectLayer.setAttribute("aria-hidden", "false");
        if (archiveViewerImg) {
          archiveViewerImg.style.opacity = "0";
          archiveViewerImg.style.visibility = "hidden";
        }
        buildInspectMarkers(archiveOpenItem);
      } else {
        resetArchiveInspectUi();
      }
    }

    function openArchiveViewer(item) {
      if (!archiveViewer || !archiveViewerImg) return;
      archiveOpenItem = item;
      resetArchiveInspectUi();
      archiveViewerImg.src = item && item.dataUrl ? String(item.dataUrl) : "";
      archiveViewerImg.alt =
        item && item.query != null ? ("print: " + String(item.query)).toLowerCase() : "print";
      if (archiveViewerTitle) {
        archiveViewerTitle.textContent =
          item && item.query != null ? String(item.query).trim().toLowerCase() : "";
      }
      archiveViewer.classList.remove("hidden");
      archiveViewer.setAttribute("aria-hidden", "false");
    }

    async function closeArchiveViewer() {
      const du =
        archiveOpenItem && archiveOpenItem.dataUrl ? String(archiveOpenItem.dataUrl) : "";
      const ts =
        archiveOpenItem && typeof archiveOpenItem.t === "number" && isFinite(archiveOpenItem.t)
          ? archiveOpenItem.t
          : 0;
      const q = archiveOpenItem && archiveOpenItem.query != null ? String(archiveOpenItem.query) : "";
      resetArchiveInspectUi();
      if (archiveViewer) {
        archiveViewer.classList.add("hidden");
        archiveViewer.setAttribute("aria-hidden", "true");
      }
      archiveOpenItem = null;
      try {
        await ensurePrintSavedIfMissing(du, ts, q);
      } catch (_) {}
    }

    function selectTab(which) {
      setStackMiniOpen(false);
      if (tabSearch) {
        tabSearch.classList.toggle("nav-btn-active", which === "search");
      }
      if (tabGallery) {
        tabGallery.classList.toggle("nav-btn-active", which === "gallery");
      }
      if (which === "gallery") {
        setMainView("gallery");
        void renderGallery();
        if (viewGallery) {
          viewGallery.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } else {
        setMainView("scroll");
        const land = document.getElementById("viewSearch");
        if (land) land.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    function flushLayout() {
      if (wikiScroll) void wikiScroll.offsetHeight;
      if (wikiViewport) void wikiViewport.offsetHeight;
      if (residueCanvas) void residueCanvas.offsetHeight;
    }

    function rafTwice() {
      return new Promise(function (resolve) {
        requestAnimationFrame(function () {
          requestAnimationFrame(resolve);
        });
      });
    }

    async function endSession() {
      if (!sessionActive) return;
      drawGlyphFrame(0);
      let dataUrl = "";
      try {
        flushLayout();
        await rafTwice();
        if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }
        drawGlyphFrame(0);
        dataUrl = compositeSessionPrint();
      } catch (_) {
        dataUrl = "";
      }

      sessionActive = false;
      host.classList.remove("session-on");
      disconnectTrackObserver();
      pointers.clear();
      glyphMarks.length = 0;
      rafOn = false;
      ctx.clearRect(0, 0, cssW, cssH);
      try {
        bgCtx.clearRect(0, 0, cssW, cssH);
      } catch (_) {}

      const entry = {
        query: sessionQuery,
        dataUrl: dataUrl,
        t: Date.now(),
        hoverTrail: wordHoverOrder
          .map(function (w) {
            const pos = wordHoverFirstNorm.get(w);
            return {
              word: w,
              ms: Math.round(wordHoverTotals.get(w) || 0),
              firstT: wordHoverFirstMs.get(w) || Date.now(),
              x: pos && typeof pos.x === "number" ? pos.x : undefined,
              y: pos && typeof pos.y === "number" ? pos.y : undefined,
            };
          })
          .filter(function (x) {
            return x.ms >= 60;
          }),
      };
      resetWordHoverTrail();
      const list = await loadPrints();
      list.unshift(entry);
      try {
        await savePrints(list);
      } catch (e) {
        setWikiStatus(String(e && e.message ? e.message : e).toLowerCase(), true);
      }
      await renderGallery();

      setMainView("scroll");
      selectTab("search");
      wikiHistory.length = 0;
      wikiHistPos = -1;
      if (wikiArticle) wikiArticle.innerHTML = "";
      setWikiStatus("");

      if (searchQueryEl) {
        searchQueryEl.value = "";
        searchQueryEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (wikiUrlInput) wikiUrlInput.value = "";

      openArchiveViewer(entry);
    }

    function startSearchSession() {
      if (sessionActive) return;
      const q = (searchQueryEl.value || "").trim() || "Wikipedia";
      sessionQuery = q;
      resetWordHoverTrail();
      setMainView("track");
      host.classList.add("session-on");
      sessionActive = true;
      wikiHistory.length = 0;
      wikiHistPos = -1;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          bindTrackResize();
          resizeCanvases();
          openWikiPage(q, true);
          pointers.clear();
          lastPointerX = window.innerWidth * 0.5;
          lastPointerY = window.innerHeight * 0.5;
          if (trackShell) {
            trackShell.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
      });
    }

    window.addEventListener("resize", function () {
      if (sessionActive) resizeCanvases();
    });

    if (usePointerRaw) {
      window.addEventListener("pointerrawupdate", onPointerMoveDoc, {
        capture: true,
        passive: true,
      });
    }
    window.addEventListener(
      "pointermove",
      function (e) {
        if (usePointerRaw) return;
        onPointerMoveDoc(e);
      },
      { capture: true, passive: true }
    );

    if (searchForm) {
      searchForm.addEventListener("submit", function (e) {
        e.preventDefault();
        startSearchSession();
      });
    }

    if (wikiScroll) {
      wikiScroll.addEventListener("click", onWikiContentClick);
    }

    if (wikiNavForm) {
      wikiNavForm.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!sessionActive) return;
        openWikiPage(wikiUrlInput.value, true);
      });
    }
    if (wikiBtnBack) {
      wikiBtnBack.addEventListener("click", function () {
        if (!sessionActive || wikiHistPos <= 0) return;
        wikiHistPos--;
        updateWikiNavButtons();
        openWikiPage(wikiHistory[wikiHistPos], false, { resolve: false });
      });
    }
    if (wikiBtnFwd) {
      wikiBtnFwd.addEventListener("click", function () {
        if (!sessionActive || wikiHistPos >= wikiHistory.length - 1) return;
        wikiHistPos++;
        updateWikiNavButtons();
        openWikiPage(wikiHistory[wikiHistPos], false, { resolve: false });
      });
    }
    if (wikiBtnRandom) {
      wikiBtnRandom.addEventListener("click", function () {
        if (!sessionActive) return;
        openRandomWiki(true);
      });
    }

    if (tabSearch) {
      tabSearch.addEventListener("click", function () {
        selectTab("search");
      });
    }
    if (tabGallery) {
      tabGallery.addEventListener("click", function () {
        if (sessionActive) return;
        selectTab("gallery");
      });
    }
    if (galleryStackFab) {
      galleryStackFab.addEventListener("click", function (e) {
        if (sessionActive) return;
        e.stopPropagation();
        setStackMiniOpen(!stackMiniOpen);
      });
    }
    if (stackMiniClose) {
      stackMiniClose.addEventListener("click", function (e) {
        e.stopPropagation();
        setStackMiniOpen(false);
      });
    }
    if (stackMiniOpenFull) {
      stackMiniOpenFull.addEventListener("click", function (e) {
        e.stopPropagation();
        setStackMiniOpen(false);
        selectTab("gallery");
      });
    }
    document.addEventListener(
      "click",
      function (e) {
        if (!stackMiniOpen || !stackDock) return;
        if (stackDock.contains(e.target)) return;
        setStackMiniOpen(false);
      },
      true
    );

    if (endSessionBtn) {
      endSessionBtn.addEventListener("click", endSession);
    }
    if (archiveBtnClose) {
      archiveBtnClose.addEventListener("click", function () {
        void closeArchiveViewer();
      });
    }
    if (archiveBtnSave) {
      archiveBtnSave.addEventListener("click", function () {
        const it = archiveOpenItem;
        if (!it || !it.dataUrl) return;
        const safe =
          (it.query || "print").replace(/[^\w\-]+/g, "-").replace(/^-|-$/g, "") || "print";
        const a = document.createElement("a");
        a.href = it.dataUrl;
        a.download = "reader-residue-" + safe + ".png";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    }
    if (archiveBtnInspect) {
      archiveBtnInspect.addEventListener("click", function () {
        if (!archiveOpenItem) return;
        if (archiveInspectOn) setArchiveInspect(false);
        else setArchiveInspect(true);
      });
    }

    setMainView("scroll");
    void renderGallery();
  }

  global.SessionArt = {
    mount: mount,
    storageLocalStorage: storageLocalStorage,
    storagePrintArchive: storagePrintArchive,
    LS_PRINTS: LS_PRINTS,
    MAX_PRINTS: MAX_PRINTS,
  };
})(typeof self !== "undefined" ? self : this);
