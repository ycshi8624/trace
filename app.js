(function () {
  function initTypedLanding() {
    const form = document.getElementById("searchForm");
    const keyboardEl = document.getElementById("searchKeyboard");
    const lineStack = document.getElementById("searchKeyboardStack");
    const lineSvg = document.getElementById("searchKeyboardLines");
    const overflowEl = document.getElementById("searchTypedOverflow");
    const input = document.getElementById("searchQuery");
    const stage = document.getElementById("homeCuriousZone");
    if (!form || !keyboardEl || !overflowEl || !input || !stage || !lineStack || !lineSvg) return;

    const SEARCH_GHOST = "search";
    const layout = {};
    "qwertyuiop".split("").forEach(function (k, i) {
      layout[k] = { col: i + 1, row: 1 };
    });
    "asdfghjkl".split("").forEach(function (k, i) {
      layout[k] = { col: i + 1, row: 2 };
    });
    "zxcvbnm".split("").forEach(function (k, i) {
      layout[k] = { col: i + 2, row: 3 };
    });

    const slotByLetter = {};
    const slotElByLetter = {};
    const order = "qwertyuiopasdfghjklzxcvbnm".split("");

    for (let i = 0; i < order.length; i++) {
      const letter = order[i];
      const pos = layout[letter];
      const slot = document.createElement("div");
      slot.className = "search-slot";
      if (SEARCH_GHOST.indexOf(letter) >= 0) {
        slot.classList.add("search-slot--search");
      }
      slot.style.gridColumn = String(pos.col);
      slot.style.gridRow = String(pos.row);
      slot.dataset.key = letter;

      if (SEARCH_GHOST.indexOf(letter) >= 0) {
        const ghost = document.createElement("span");
        ghost.className = "search-slot-ghost";
        ghost.textContent = letter;
        slot.appendChild(ghost);
      }

      const typedMount = document.createElement("div");
      typedMount.className = "search-slot-typed";
      slot.appendChild(typedMount);
      slotByLetter[letter] = typedMount;
      slotElByLetter[letter] = slot;
      keyboardEl.appendChild(slot);
    }

    /* US QWERTY: the ' / " key sits in row 2, column 10 (right of L); letters-only grid leaves this cell empty. */
    const quoteSlot = document.createElement("div");
    quoteSlot.className = "search-slot search-keyboard-quote-slot";
    quoteSlot.style.gridColumn = "10";
    quoteSlot.style.gridRow = "2";
    quoteSlot.setAttribute("aria-hidden", "true");
    keyboardEl.appendChild(quoteSlot);

    function letterCentersInStack(letters) {
      const wrap = lineStack;
      const wr = wrap.getBoundingClientRect();
      const pts = [];
      for (let i = 0; i < letters.length; i++) {
        const L = letters[i];
        const el = slotElByLetter[L];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        pts.push({
          x: r.left + r.width * 0.5 - wr.left,
          y: r.top + r.height * 0.5 - wr.top,
        });
      }
      return pts;
    }

    function collapseSameSlotConsecutive(letters) {
      const out = [];
      for (let i = 0; i < letters.length; i++) {
        if (out.length === 0 || letters[i] !== out[out.length - 1]) out.push(letters[i]);
      }
      return out;
    }

    function sequenceFromInput(raw) {
      const out = [];
      for (let i = 0; i < raw.length; i++) {
        const lo = raw.charAt(i).toLowerCase();
        if (/^[a-z]$/.test(lo) && slotByLetter[lo]) out.push(lo);
      }
      return out;
    }

    const NS = "http://www.w3.org/2000/svg";
    /** Clearance from each letter center so ink lines stay off the glyphs (px). */
    const LETTER_INK_GAP = 14;

    function fmt(n) {
      return Math.round(n * 10) / 10;
    }

    /**
     * Disjoint quadratic subpaths between letter centers, trimmed inward by `gapPx`
     * from each center along the chord so each glyph keeps a small circular margin.
     */
    function buildInkPathD(centers, gapPx) {
      if (centers.length < 2) return "";
      const gap = gapPx;
      let d = "";
      let bendIdx = 0;
      for (let i = 0; i < centers.length - 1; i++) {
        const A = centers[i];
        const B = centers[i + 1];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-6) continue;
        const ux = dx / len;
        const uy = dy / len;
        const trim = Math.min(gap, len * 0.5 - 0.25);
        if (trim < 0.5 || len <= 2 * trim + 0.1) continue;
        const a = { x: A.x + ux * trim, y: A.y + uy * trim };
        const b = { x: B.x - ux * trim, y: B.y - uy * trim };
        const mx = (a.x + b.x) * 0.5;
        const my = (a.y + b.y) * 0.5;
        const ddx = b.x - a.x;
        const ddy = b.y - a.y;
        const segLen = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        const px = -ddy / segLen;
        const py = ddx / segLen;
        const segIx = bendIdx++;
        const amp = Math.min(34, segLen * 0.46) * (segIx % 2 === 0 ? 1 : -1);
        let cx = mx + px * amp;
        let cy = my + py * amp;
        const wobble = 3.2;
        cx += Math.sin(segIx * 1.73 + a.x * 0.031 + b.y * 0.027) * wobble;
        cy += Math.cos(segIx * 1.29 + b.x * 0.028 + a.y * 0.024) * wobble;
        d += "M " + fmt(a.x) + " " + fmt(a.y) + " Q " + fmt(cx) + " " + fmt(cy) + " " + fmt(b.x) + " " + fmt(b.y);
      }
      return d;
    }

    function appendInkFilter(defs) {
      const filter = document.createElementNS(NS, "filter");
      filter.setAttribute("id", "searchKeyboardInkFilter");
      filter.setAttribute("x", "-32%");
      filter.setAttribute("y", "-32%");
      filter.setAttribute("width", "164%");
      filter.setAttribute("height", "164%");
      filter.setAttribute("color-interpolation-filters", "sRGB");
      const turb = document.createElementNS(NS, "feTurbulence");
      turb.setAttribute("type", "fractalNoise");
      turb.setAttribute("baseFrequency", "0.072");
      turb.setAttribute("numOctaves", "5");
      turb.setAttribute("seed", "21");
      turb.setAttribute("result", "inkNoise");
      const disp = document.createElementNS(NS, "feDisplacementMap");
      disp.setAttribute("in", "SourceGraphic");
      disp.setAttribute("in2", "inkNoise");
      disp.setAttribute("scale", "3.1");
      disp.setAttribute("xChannelSelector", "R");
      disp.setAttribute("yChannelSelector", "G");
      disp.setAttribute("result", "inkRoughen");
      const blur = document.createElementNS(NS, "feGaussianBlur");
      blur.setAttribute("in", "inkRoughen");
      blur.setAttribute("stdDeviation", "0.11");
      blur.setAttribute("result", "inkSoft");
      filter.appendChild(turb);
      filter.appendChild(disp);
      filter.appendChild(blur);
      defs.appendChild(filter);
    }

    function drawConnectLines() {
      const raw = input.value || "";
      const typing = raw.length > 0;
      const letters = typing
        ? collapseSameSlotConsecutive(sequenceFromInput(raw))
        : collapseSameSlotConsecutive(SEARCH_GHOST.split(""));
      const pts = letterCentersInStack(letters);
      const w = lineStack.clientWidth;
      const h = lineStack.clientHeight;
      lineSvg.setAttribute("viewBox", "0 0 " + Math.max(1, w) + " " + Math.max(1, h));
      lineSvg.setAttribute("width", String(Math.max(1, w)));
      lineSvg.setAttribute("height", String(Math.max(1, h)));
      while (lineSvg.firstChild) lineSvg.removeChild(lineSvg.firstChild);
      if (pts.length < 2) return;
      const d = buildInkPathD(pts, LETTER_INK_GAP);
      if (!d) return;

      const defs = document.createElementNS(NS, "defs");
      appendInkFilter(defs);
      lineSvg.appendChild(defs);

      const g = document.createElementNS(NS, "g");
      g.setAttribute(
        "class",
        typing
          ? "search-keyboard-ink-group search-keyboard-ink-group--typed"
          : "search-keyboard-ink-group search-keyboard-ink-group--ghost"
      );
      g.setAttribute("filter", "url(#searchKeyboardInkFilter)");

      const bleed = document.createElementNS(NS, "path");
      bleed.setAttribute("d", d);
      bleed.setAttribute("class", "search-keyboard-line-bleed");

      const main = document.createElementNS(NS, "path");
      main.setAttribute("d", d);
      main.setAttribute("class", "search-keyboard-line-main");

      g.appendChild(bleed);
      g.appendChild(main);
      lineSvg.appendChild(g);
    }

    function positionCaretAtQuoteSlot() {
      var q = document.querySelector(".search-keyboard-quote-slot");
      var caretWrap = document.getElementById("qwertyCaretSlot");
      if (!q || !caretWrap) return;
      var r = q.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      caretWrap.style.left = Math.round((r.left + r.width * 0.5) * 10) / 10 + "px";
      caretWrap.style.top = Math.round((r.top + r.height * 0.5) * 10) / 10 + "px";
      caretWrap.style.right = "auto";
    }

    function scheduleDrawLines() {
      requestAnimationFrame(function () {
        drawConnectLines();
        positionCaretAtQuoteSlot();
      });
    }

    if (typeof ResizeObserver !== "undefined") {
      try {
        const ro = new ResizeObserver(function () {
          scheduleDrawLines();
        });
        ro.observe(lineStack);
        ro.observe(keyboardEl);
      } catch (_) {}
    }
    window.addEventListener("resize", scheduleDrawLines);
    try {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          scheduleDrawLines();
        });
      }
    } catch (_) {}

    function syncTyped() {
      var raw = input.value || "";
      form.classList.toggle("is-typing", raw.length > 0);
      for (var k in slotByLetter) {
        if (Object.prototype.hasOwnProperty.call(slotByLetter, k)) {
          slotByLetter[k].innerHTML = "";
        }
      }
      overflowEl.innerHTML = "";

      var counts = {};
      var lastLo = null;
      var j = 0;
      for (j = raw.length - 1; j >= 0; j--) {
        var cj = raw.charAt(j).toLowerCase();
        if (/^[a-z]$/.test(cj)) {
          lastLo = cj;
          break;
        }
      }

      var delay = 0;
      for (var i = 0; i < raw.length; i++) {
        var ch = raw.charAt(i);
        var lo = ch.toLowerCase();
        var span = document.createElement("span");
        span.className = "search-typed-char";
        span.style.animationDelay = delay * 0.04 + "s";
        delay++;
        if (/^[a-z]$/.test(lo) && slotByLetter[lo]) {
          span.textContent = lo;
          slotByLetter[lo].appendChild(span);
          counts[lo] = (counts[lo] || 0) + 1;
        } else {
          if (ch === " ") {
            span.classList.add("search-typed-space");
            span.innerHTML = "\u00a0";
          } else {
            span.textContent = ch;
          }
          overflowEl.appendChild(span);
        }
      }

      for (var letter in slotElByLetter) {
        if (!Object.prototype.hasOwnProperty.call(slotElByLetter, letter)) continue;
        var el = slotElByLetter[letter];
        var n = counts[letter] || 0;
        el.classList.toggle("search-slot--touched", n > 0);
        el.classList.toggle("search-slot--last-stroke", lastLo != null && lastLo === letter && n > 0);
      }

      scheduleDrawLines();
    }

    input.addEventListener("input", syncTyped);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        input.value = "";
        syncTyped();
      }
    });

    stage.addEventListener("click", function () {
      input.focus({ preventScroll: true });
    });

    var dateEl = document.getElementById("scrollHintDate");
    if (dateEl) {
      try {
        var d = new Date();
        var opts = { weekday: "long", month: "long", day: "numeric", year: "numeric" };
        dateEl.textContent = "today – " + d.toLocaleDateString(undefined, opts).toLowerCase();
      } catch (_) {
        dateEl.textContent = "";
      }
    }

    (function initLandingCaretVisibility() {
      var main = document.getElementById("appMain");
      if (!main) return;
      var lastCaretShown = null;
      function syncLandingCaretVisibility() {
        var session = document.body.classList.contains("session-on");
        var mr = main.getBoundingClientRect();
        var qr = quoteSlot.getBoundingClientRect();
        var cx = qr.left + qr.width * 0.5;
        var cy = qr.top + qr.height * 0.5;
        var inset = 1;
        var anchorInView =
          qr.width >= 2 &&
          qr.height >= 2 &&
          cx >= mr.left + inset &&
          cx <= mr.right - inset &&
          cy >= mr.top + inset &&
          cy <= mr.bottom - inset;
        var show = !session && anchorInView;
        document.body.classList.toggle("landing-caret-hidden", !show);
        if (show) {
          positionCaretAtQuoteSlot();
          if (lastCaretShown === false) {
            scheduleDrawLines();
          }
        }
        lastCaretShown = show;
      }
      main.addEventListener("scroll", syncLandingCaretVisibility, { passive: true });
      window.addEventListener("resize", syncLandingCaretVisibility);
      try {
        var mo = new MutationObserver(syncLandingCaretVisibility);
        mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
      } catch (_) {}
      requestAnimationFrame(function () {
        requestAnimationFrame(syncLandingCaretVisibility);
      });
    })();

    syncTyped();
  }

  if (!window.SessionArt) return;
  SessionArt.mount({
    host: document.body,
    elements: {
      tabSearch: null,
      tabGallery: null,
      historyIconImg: null,
      historyIconFallback: null,
      viewSearch: document.getElementById("viewSearch"),
      viewGallery: document.getElementById("viewGallery"),
      galleryRoot: document.getElementById("galleryRoot"),
      stackDock: null,
      stackMiniPanel: null,
      stackMiniGrid: null,
      stackMiniClose: null,
      stackMiniOpenFull: null,
      galleryStackFab: null,
      drawingStackPile: null,
      searchForm: document.getElementById("searchForm"),
      searchQueryEl: document.getElementById("searchQuery"),
      endSessionBtn: document.getElementById("endSession"),
      trackShell: document.getElementById("trackShell"),
      trackStage: document.getElementById("trackStage"),
      wikiViewport: document.getElementById("wikiViewport"),
      wikiScroll: document.getElementById("wikiScroll"),
      wikiArticle: document.getElementById("wikiArticle"),
      wikiStatus: document.getElementById("wikiStatus"),
      wikiNavForm: document.getElementById("wikiNavForm"),
      wikiUrlInput: document.getElementById("wikiUrlInput"),
      wikiBtnBack: document.getElementById("wikiBtnBack"),
      wikiBtnFwd: document.getElementById("wikiBtnFwd"),
      wikiBtnRandom: document.getElementById("wikiBtnRandom"),
      residueCanvas: document.getElementById("residueCanvas"),
      faintBgCanvas: document.getElementById("faintBgCanvas"),
      polaroidOverlay: document.getElementById("polaroidOverlay"),
      polaroidImg: document.getElementById("polaroidImg"),
      polaroidCaption: document.getElementById("polaroidCaption"),
      polaroidDismiss: document.getElementById("polaroidDismiss"),
      polaroidSave: document.getElementById("polaroidSave"),
      archiveViewer: document.getElementById("archiveViewer"),
      archiveViewerStage: document.getElementById("archiveViewerStage"),
      archiveViewerImg: document.getElementById("archiveViewerImg"),
      archiveInspectLayer: document.getElementById("archiveInspectLayer"),
      archiveViewerTitle: document.getElementById("archiveViewerTitle"),
      archiveBtnSave: document.getElementById("archiveBtnSave"),
      archiveBtnInspect: document.getElementById("archiveBtnInspect"),
      archiveBtnClose: document.getElementById("archiveBtnClose"),
    },
    storage: SessionArt.storagePrintArchive(),
  });

  initTypedLanding();
})();
