/**
 * app.js (v2)
 * Pissarra Matemàtica de Batxillerat:
 * - Sistema jeràrquic de Llibretes i Pàgines amb persistència automàtica.
 * - Exportació i importació en fitxer (.json) de tot l'espai, d'una llibreta o d'una pàgina individual + còpia LaTeX + PDF.
 * - Estructura d'APARTATS multilínia que combinen múltiples línies d'equacions (<math-field>) i blocs de text amb salt de línia automàtic.
 * - Scoreboard de Variables i Funcions amb 3 àmbits (Apartat actual / Exercici / Tota la pàgina).
 * - Gràfica cartesiana interactiva (zoom/pan i múltiples funcions), Punter Làser efímer, Llapis lliure i Temporitzador de classe.
 */
(function () {
  'use strict';

  const STORAGE_KEY_V2 = 'pissarra_mat_batx_v2';
  const ZOOM_MATH_SIZES = [17, 19, 22, 26, 30, 35];
  const ZOOM_TEXT_SIZES = [13.5, 14.5, 15.5, 17.5, 19.5, 22];
  const DEFAULT_ZOOM_INDEX = 2;
  const NOTEBOOK_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2'];
  const GRAPH_COLORS = ['#2563eb', '#059669', '#dc2626', '#7c3aed', '#d97706'];

  const state = {
    notebooks: [],
    activeNotebookId: null,
    activePageId: null,
    activeBlockId: null,
    activeItemId: null,
    expandedNotebookIds: new Set(),

    activeKeypadTab: 'principal',
    angleMode: 'RAD', // 'RAD' | 'DEG'
    scoreboardScope: 'section', // 'apartat' | 'section' | 'page'
    notebooksSidebarOpen: true,
    scoreboardCollapsed: false,
    keypadCollapsed: false,
    darkMode: false,
    zoomIndex: DEFAULT_ZOOM_INDEX,

    funcQuickInputs: {},

    // Eines en viu: Llapis i Punter Làser
    inkActive: false,
    inkColor: '#ef4444',
    laserActive: false,
    laserTrail: [], // [{ x, y, t }]

    // Gràfica interactiva
    graphOpen: false,
    graphView: { cx: 0, cy: 0, scale: 42 }, // píxels per unitat
    graphHiddenKeys: new Set(),
    graphHoverPt: null,

    // Temporitzador de classe
    timerSeconds: 180,
    timerRunning: false,
    timerMode: 'countdown', // 'countdown' | 'stopwatch'
    timerInterval: null
  };

  // Referències vives als elements d'edició per no destruir el DOM mentre s'escriu
  const mathfieldMap = new Map(); // itemId -> MathfieldElement
  const textareaMap = new Map();  // itemId -> HTMLTextAreaElement
  let analysisTimer = null;
  let lastAnalysis = { variables: [], functions: [], lineQuickResults: {} };
  let laserAnimFrame = null;

  function uid(prefix = 'id') {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // ============================================================================
  // 1. Construcció de Blocs, Pàgines, Llibretes i Persistència
  // ============================================================================
  function createEmptyApartat(initialTextOrMath = 'math') {
    const item = initialTextOrMath === 'text'
      ? { id: uid('it'), kind: 'text', text: '' }
      : { id: uid('it'), kind: 'math', latex: '' };
    return {
      id: uid('blk'),
      type: 'apartat',
      label: '',
      accent: 'none',
      items: [item]
    };
  }

  function hydrateShowcaseBlocks() {
    return window.KeypadConfig.FULL_SHOWCASE_BLOCKS.map(b => {
      if (b.type === 'section') {
        return {
          id: uid('blk'),
          type: 'section',
          title: b.title || ''
        };
      }
      return {
        id: uid('blk'),
        type: 'apartat',
        label: b.label || '',
        accent: b.accent || 'none',
        items: (b.items || []).map(it => ({
          id: uid('it'),
          kind: it.kind || 'math',
          latex: it.latex || '',
          text: it.text || ''
        }))
      };
    });
  }

  function createShowcaseNotebook() {
    const showcasePage = {
      id: uid('page'),
      title: '🌟 Tour Complet (Totes les funcions)',
      updatedAt: Date.now(),
      overrides: {},
      inkStrokes: [],
      blocks: hydrateShowcaseBlocks()
    };
    const practicePage = {
      id: uid('page'),
      title: '📝 Pàgina de proves en blanc',
      updatedAt: Date.now(),
      overrides: {},
      inkStrokes: [],
      blocks: [createEmptyApartat('math')]
    };
    return {
      id: uid('nb'),
      title: '🎓 Guia Completa i Exemples',
      color: '#2563eb',
      pages: [showcasePage, practicePage]
    };
  }

  function createStarterClassesNotebook() {
    return {
      id: uid('nb'),
      title: '📘 Classes 1r Batxillerat',
      color: '#059669',
      pages: [
        {
          id: uid('page'),
          title: 'Classe 1 — Pissarra nova',
          updatedAt: Date.now(),
          overrides: {},
          inkStrokes: [],
          blocks: [createEmptyApartat('math')]
        }
      ]
    };
  }

  function createStarter2nBatxNotebook() {
    return {
      id: uid('nb'),
      title: '📗 Classes 2n Batxillerat (PAU)',
      color: '#7c3aed',
      pages: [
        {
          id: uid('page'),
          title: 'Àlgebra i Anàlisi',
          updatedAt: Date.now(),
          overrides: {},
          inkStrokes: [],
          blocks: [createEmptyApartat('math')]
        }
      ]
    };
  }

  const TOUR_VERSION = 3;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_V2);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.notebooks) && parsed.notebooks.length > 0) {
          state.notebooks = parsed.notebooks;
          state.activeNotebookId = parsed.activeNotebookId || parsed.notebooks[0].id;
          const nb = getNotebookById(state.activeNotebookId) || state.notebooks[0];
          state.activeNotebookId = nb.id;
          state.activePageId = parsed.activePageId || nb.pages[0]?.id;
          if (!nb.pages.some(p => p.id === state.activePageId)) {
            state.activePageId = nb.pages[0]?.id;
          }
          const s = parsed.settings || {};
          state.angleMode = s.angleMode || 'RAD';
          state.scoreboardScope = s.scoreboardScope || 'section';
          state.darkMode = Boolean(s.darkMode);
          state.zoomIndex = typeof s.zoomIndex === 'number' ? s.zoomIndex : DEFAULT_ZOOM_INDEX;
          state.notebooksSidebarOpen = s.notebooksSidebarOpen !== undefined ? Boolean(s.notebooksSidebarOpen) : true;
          state.scoreboardCollapsed = Boolean(s.scoreboardCollapsed);
          state.keypadCollapsed = Boolean(s.keypadCollapsed);
          state.notebooks.forEach(n => state.expandedNotebookIds.add(n.id));

          // Actualitza automàticament la pàgina del Tour Complet amb les noves funcionalitats (ex: Funcions a Trossos) sense tocar cap pàgina de l'usuari!
          if (parsed.tourVersion !== TOUR_VERSION) {
            let updatedTour = false;
            for (const n of state.notebooks) {
              for (const p of n.pages || []) {
                if (p.title === '🌟 Tour Complet (Totes les funcions)') {
                  p.blocks = hydrateShowcaseBlocks();
                  updatedTour = true;
                }
              }
            }
            if (updatedTour) saveState({ isInitialSeed: true, contentChanged: false });
          }
          return;
        }
      }
    } catch (_e) { /* ignora errors */ }

    // Primera càrrega v2: creem el sistema de Llibretes amb la Guia Completa com a portada!
    const nbGuide = createShowcaseNotebook();
    const nb1r = createStarterClassesNotebook();
    const nb2n = createStarter2nBatxNotebook();
    state.notebooks = [nbGuide, nb1r, nb2n];
    state.activeNotebookId = nbGuide.id;
    state.activePageId = nbGuide.pages[0].id;
    state.notebooks.forEach(n => state.expandedNotebookIds.add(n.id));
    saveState({ isInitialSeed: true, contentChanged: false });
  }

  const localSaveListeners = [];

  function buildWorkspacePayload() {
    return {
      kind: 'pissarra_workspace',
      version: 2,
      tourVersion: TOUR_VERSION,
      savedAt: new Date().toISOString(),
      activeNotebookId: state.activeNotebookId,
      activePageId: state.activePageId,
      settings: {
        angleMode: state.angleMode,
        scoreboardScope: state.scoreboardScope,
        darkMode: state.darkMode,
        zoomIndex: state.zoomIndex,
        notebooksSidebarOpen: state.notebooksSidebarOpen,
        scoreboardCollapsed: state.scoreboardCollapsed,
        keypadCollapsed: state.keypadCollapsed
      },
      notebooks: state.notebooks
    };
  }

  function saveState(opts = {}) {
    try {
      const contentChanged = opts.contentChanged !== false;
      const page = getActivePage();
      if (page && contentChanged && !opts.fromCloud && !opts.isInitialSeed) {
        page.updatedAt = Date.now();
      }
      const payload = buildWorkspacePayload();
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(payload));
      if (!opts.silentPill) {
        flashAutosaveIndicator(opts.pillMessage);
      }
      if (!opts.fromCloud && !opts.isInitialSeed) {
        localSaveListeners.forEach((fn) => {
          try { fn({ contentChanged }); } catch (_err) { /* seguretat */ }
        });
      }
    } catch (_e) { /* ignora quota */ }
  }

  let autosaveTimeout = null;
  function flashAutosaveIndicator(customText, durationMs = 1800) {
    const el = document.getElementById('autosavePill');
    if (!el) return;
    el.textContent = customText || 'Desat ✓';
    clearTimeout(autosaveTimeout);
    autosaveTimeout = setTimeout(() => {
      el.textContent = window.PissarraCloud?.isConnected?.() ? 'Sincronització activa ☁️' : 'Desat automàtic';
    }, durationMs);
  }

  function getNotebookById(id) {
    return state.notebooks.find(n => n.id === id) || null;
  }

  function getActiveNotebook() {
    return getNotebookById(state.activeNotebookId) || state.notebooks[0];
  }

  function getActivePage() {
    const nb = getActiveNotebook();
    if (!nb) return null;
    return nb.pages.find(p => p.id === state.activePageId) || nb.pages[0] || null;
  }

  // ============================================================================
  // 2. Utilitats LaTeX Estàtic i Auto-alçada de Blocs de Text
  // ============================================================================
  function renderLatexStatic(latex) {
    try {
      if (window.MathLive && typeof window.MathLive.convertLatexToMarkup === 'function') {
        return window.MathLive.convertLatexToMarkup(latex, { defaultMode: 'math' });
      }
    } catch (_e) { /* fallback */ }
    return `<span>${escapeHtml(latex)}</span>`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function autoResizeTextarea(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(26, ta.scrollHeight)}px`;
  }

  function autoResizeAllTextareas() {
    textareaMap.forEach(ta => autoResizeTextarea(ta));
  }

  // ============================================================================
  // 3. Renderitzat de Llibretes i Pàgines (Panell Esquerre + Breadcrumb)
  // ============================================================================
  function renderNotebooksSidebar() {
    const listEl = document.getElementById('notebooksList');
    const bcNb = document.getElementById('breadcrumbNb');
    const bcPage = document.getElementById('breadcrumbPage');
    const activeNb = getActiveNotebook();
    const activePg = getActivePage();

    const bcBar = document.getElementById('breadcrumbBar');
    if (bcNb && activeNb) bcNb.textContent = activeNb.title;
    if (bcPage && activePg) bcPage.textContent = activePg.title;
    if (bcBar && activeNb && activePg) {
      bcBar.title = `${activeNb.title} › ${activePg.title}`;
    }

    if (!listEl) return;
    listEl.innerHTML = '';

    state.notebooks.forEach((nb) => {
      const isExpanded = state.expandedNotebookIds.has(nb.id);
      const group = document.createElement('div');
      group.className = `nb-group ${nb.id === state.activeNotebookId ? 'active-nb' : ''}`;

      const header = document.createElement('div');
      header.className = 'nb-header-row';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'nb-title-wrap';
      const chevron = document.createElement('span');
      chevron.style.fontSize = '10px';
      chevron.style.color = 'var(--text-muted)';
      chevron.textContent = isExpanded ? '▾' : '▸';

      const dot = document.createElement('span');
      dot.className = 'nb-color-dot';
      dot.style.background = nb.color || '#2563eb';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'nb-name-text';
      nameSpan.textContent = nb.title;

      titleWrap.appendChild(chevron);
      titleWrap.appendChild(dot);
      titleWrap.appendChild(nameSpan);
      header.appendChild(titleWrap);

      const actions = document.createElement('div');
      actions.className = 'nb-mini-actions';

      const addPgBtn = document.createElement('button');
      addPgBtn.className = 'nb-icon-btn';
      addPgBtn.title = 'Nova pàgina en aquesta llibreta';
      addPgBtn.textContent = '＋';
      addPgBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        addNewPageToNotebook(nb.id);
      });

      const renNbBtn = document.createElement('button');
      renNbBtn.className = 'nb-icon-btn';
      renNbBtn.title = 'Canviar nom de la llibreta';
      renNbBtn.textContent = '✎';
      renNbBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const name = prompt('Nou nom per a la llibreta:', nb.title);
        if (name && name.trim()) {
          nb.title = name.trim();
          saveState();
          renderNotebooksSidebar();
        }
      });

      const saveNbBtn = document.createElement('button');
      saveNbBtn.className = 'nb-icon-btn';
      saveNbBtn.title = 'Desar aquesta llibreta en un fitxer';
      saveNbBtn.textContent = '💾';
      saveNbBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        exportNotebookFile(nb);
      });

      actions.appendChild(addPgBtn);
      actions.appendChild(renNbBtn);
      actions.appendChild(saveNbBtn);

      if (state.notebooks.length > 1) {
        const delNbBtn = document.createElement('button');
        delNbBtn.className = 'nb-icon-btn';
        delNbBtn.title = 'Eliminar llibreta';
        delNbBtn.textContent = '✕';
        delNbBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (confirm(`Segur que vols eliminar la llibreta "${nb.title}" i totes les seves pàgines?`)) {
            const idx = state.notebooks.findIndex(x => x.id === nb.id);
            state.notebooks.splice(idx, 1);
            if (state.activeNotebookId === nb.id) {
              const fallback = state.notebooks[Math.max(0, idx - 1)];
              switchNotebookAndPage(fallback.id, fallback.pages[0].id);
            } else {
              saveState();
              renderNotebooksSidebar();
            }
          }
        });
        actions.appendChild(delNbBtn);
      }

      header.appendChild(actions);

      header.addEventListener('click', () => {
        if (state.expandedNotebookIds.has(nb.id)) {
          state.expandedNotebookIds.delete(nb.id);
        } else {
          state.expandedNotebookIds.add(nb.id);
        }
        renderNotebooksSidebar();
      });

      group.appendChild(header);

      if (isExpanded) {
        const pagesWrap = document.createElement('div');
        pagesWrap.className = 'nb-pages-list';

        nb.pages.forEach((pg) => {
          const pgEl = document.createElement('div');
          const isActivePage = nb.id === state.activeNotebookId && pg.id === state.activePageId;
          pgEl.className = `nb-page-item ${isActivePage ? 'active-page' : ''}`;

          const pTitle = document.createElement('span');
          pTitle.className = 'nb-page-title';
          pTitle.textContent = pg.title;
          pgEl.appendChild(pTitle);

          const pActs = document.createElement('div');
          pActs.className = 'nb-mini-actions';

          const renPg = document.createElement('button');
          renPg.className = 'nb-icon-btn';
          renPg.title = 'Canviar nom de la pàgina';
          renPg.textContent = '✎';
          renPg.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const n = prompt('Nom de la pàgina:', pg.title);
            if (n && n.trim()) {
              pg.title = n.trim();
              saveState();
              renderNotebooksSidebar();
            }
          });

          const dupPg = document.createElement('button');
          dupPg.className = 'nb-icon-btn';
          dupPg.title = 'Duplicar pàgina';
          dupPg.textContent = '⧉';
          dupPg.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const cloned = deepClone(pg);
            cloned.id = uid('page');
            cloned.title = `${pg.title} (còpia)`;
            reassignBlockAndItemIds(cloned);
            nb.pages.push(cloned);
            saveState();
            switchNotebookAndPage(nb.id, cloned.id);
          });

          const savePg = document.createElement('button');
          savePg.className = 'nb-icon-btn';
          savePg.title = 'Desar aquesta pàgina com a fitxer individual';
          savePg.textContent = '💾';
          savePg.addEventListener('click', (ev) => {
            ev.stopPropagation();
            exportPageFile(pg, nb.title);
          });

          pActs.appendChild(renPg);
          pActs.appendChild(dupPg);
          pActs.appendChild(savePg);

          if (nb.pages.length > 1) {
            const delPg = document.createElement('button');
            delPg.className = 'nb-icon-btn';
            delPg.title = 'Eliminar pàgina';
            delPg.textContent = '✕';
            delPg.addEventListener('click', (ev) => {
              ev.stopPropagation();
              if (confirm(`Vols eliminar la pàgina "${pg.title}"?`)) {
                const pIdx = nb.pages.findIndex(x => x.id === pg.id);
                nb.pages.splice(pIdx, 1);
                if (state.activePageId === pg.id) {
                  switchNotebookAndPage(nb.id, nb.pages[Math.max(0, pIdx - 1)].id);
                } else {
                  saveState();
                  renderNotebooksSidebar();
                }
              }
            });
            pActs.appendChild(delPg);
          }

          pgEl.appendChild(pActs);
          pgEl.addEventListener('click', () => {
            if (!isActivePage) {
              switchNotebookAndPage(nb.id, pg.id);
            }
          });

          pagesWrap.appendChild(pgEl);
        });

        const addInline = document.createElement('button');
        addInline.className = 'nb-add-page-inline';
        addInline.textContent = '+ Nova pàgina';
        addInline.addEventListener('click', () => addNewPageToNotebook(nb.id));
        pagesWrap.appendChild(addInline);

        group.appendChild(pagesWrap);
      }

      listEl.appendChild(group);
    });
  }

  function reassignBlockAndItemIds(page) {
    (page.blocks || []).forEach(b => {
      b.id = uid('blk');
      if (Array.isArray(b.items)) {
        b.items.forEach(it => { it.id = uid('it'); });
      }
    });
  }

  function createNewNotebook() {
    const name = prompt('Nom de la nova llibreta (ex: 2n Batxillerat B, Classes Júlia...):', `Llibreta ${state.notebooks.length + 1}`);
    if (!name || !name.trim()) return;
    const color = NOTEBOOK_COLORS[state.notebooks.length % NOTEBOOK_COLORS.length];
    const newPage = {
      id: uid('page'),
      title: 'Pàgina 1',
      updatedAt: Date.now(),
      overrides: {},
      inkStrokes: [],
      blocks: [createEmptyApartat('math')]
    };
    const newNb = {
      id: uid('nb'),
      title: name.trim(),
      color,
      pages: [newPage]
    };
    state.notebooks.push(newNb);
    state.expandedNotebookIds.add(newNb.id);
    saveState();
    switchNotebookAndPage(newNb.id, newPage.id);
  }

  function addNewPageToNotebook(notebookId) {
    const nb = getNotebookById(notebookId);
    if (!nb) return;
    const newPage = {
      id: uid('page'),
      title: `Pàgina ${nb.pages.length + 1}`,
      updatedAt: Date.now(),
      overrides: {},
      inkStrokes: [],
      blocks: [createEmptyApartat('math')]
    };
    nb.pages.push(newPage);
    state.expandedNotebookIds.add(nb.id);
    saveState();
    switchNotebookAndPage(nb.id, newPage.id);
  }

  function switchNotebookAndPage(notebookId, pageId) {
    state.activeNotebookId = notebookId;
    state.activePageId = pageId;
    state.expandedNotebookIds.add(notebookId);
    const page = getActivePage();
    selectDefaultActiveItem(page);
    saveState({ contentChanged: false, silentPill: true });
    renderNotebooksSidebar();
    renderBoardBlocks();
    redrawAnnotations();
    requestAnimationFrame(() => {
      if (state.activeItemId) focusItemById(state.activeItemId, 'end');
    });
  }

  function selectDefaultActiveItem(page) {
    if (!page || !page.blocks || page.blocks.length === 0) {
      state.activeBlockId = null;
      state.activeItemId = null;
      return;
    }
    const firstAp = page.blocks.find(b => b.type === 'apartat') || page.blocks[0];
    state.activeBlockId = firstAp.id;
    state.activeItemId = firstAp.items && firstAp.items[0] ? firstAp.items[0].id : null;
  }

  // ============================================================================
  // 4. Renderitzat de la Pissarra: Seccions (§) i Apartats Multilínia
  // ============================================================================
  function configureMathfield(mf, block, item) {
    mf.className = 'equation-field';
    mf.mathVirtualKeyboardPolicy = 'manual';
    mf.smartFence = true;
    mf.smartSuperscript = false;
    mf.smartMode = false;
    mf.letterShapeStyle = 'tex';
    mf.removeExtraneousParentheses = false;
    mf.mathModeSpace = '\\;';

    const applyShortcutsAndTab = () => {
      try {
        mf.mathModeSpace = '\\;';
        mf.inlineShortcuts = {
          ...mf.inlineShortcuts,
          '*': '\\cdot',
          'tab': '\\qquad',
          ...window.KeypadConfig.CUSTOM_INLINE_SHORTCUTS
        };
        if (Array.isArray(mf.keybindings)) {
          mf.keybindings = [
            { key: '[Tab]', ifMode: 'math', command: ['insert', '\\qquad'] },
            { key: 'shift+[Tab]', ifMode: 'math', command: ['insert', '\\quad'] },
            ...mf.keybindings.filter(kb => kb.key !== '[Tab]' && kb.key !== 'shift+[Tab]')
          ];
        }
      } catch (_e) { /* seguretat */ }
    };

    applyShortcutsAndTab();
    mf.addEventListener('mount', applyShortcutsAndTab);

    mf.value = item.latex || '';

    mf.addEventListener('focus', () => {
      setActiveBlockAndItem(block.id, item.id, false);
    });

    mf.addEventListener('input', () => {
      item.latex = mf.value;
      saveState();
      scheduleAnalysis();
      requestAnimationFrame(resizeOverlayCanvases);
    });

    mf.addEventListener('move-out', (ev) => {
      ev.preventDefault();
      const dir = ev.detail && ev.detail.direction;
      if (dir === 'upward') {
        focusNeighborItem(item.id, -1);
      } else if (dir === 'downward') {
        focusNeighborItem(item.id, 1);
      }
    });

    mf.addEventListener('keydown', (ev) => {
      // Tecla Tab: insereix una tabulació matemàtica (\qquad) per separar variables en una mateixa línia!
      if (ev.key === 'Tab') {
        ev.preventDefault();
        ev.stopPropagation();
        mf.insert(ev.shiftKey ? '\\quad ' : '\\qquad ');
        return;
      }

      // '"' obre/tanca text curt català dins de la mateixa equació
      if (ev.key === '"' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault();
        toggleInlineTextMode(mf);
        return;
      }

      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 't') {
        ev.preventDefault();
        toggleInlineTextMode(mf);
        return;
      }

      // Alt + T: insereix un BLOC DE PARÀGRAF (amb salt de línia automàtic) dins el mateix apartat!
      if (ev.altKey && ev.key.toLowerCase() === 't') {
        ev.preventDefault();
        insertItemInApartat(block.id, item.id, 'text');
        return;
      }

      // Cmd/Ctrl + Enter: crea un NOU APARTAT a sota!
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        insertNewApartatAfter(block.id, 'math');
        return;
      }

      // Shift + Enter: afegeix fila dins d'una matriu o sistema \begin{cases}
      if (ev.key === 'Enter' && ev.shiftKey) {
        ev.preventDefault();
        mf.executeCommand('addRowAfter');
        return;
      }

      // Enter: afegeix una nova línia d'equació DINS del mateix apartat!
      // (I si la línia actual ja era buida i l'apartat té contingut a dalt -> doble Enter crea un nou apartat a sota!)
      if (ev.key === 'Enter') {
        ev.preventDefault();
        const isEmpty = !mf.value || mf.value.trim() === '';
        if (isEmpty && block.items.length > 1) {
          deleteSubItem(block.id, item.id, false);
          insertNewApartatAfter(block.id, 'math');
        } else {
          insertItemInApartat(block.id, item.id, 'math');
        }
        return;
      }

      // Backspace quan l'equació és buida: esborra aquesta sub-línia (o l'apartat si era l'única)
      if (ev.key === 'Backspace' && (!mf.value || mf.value.trim() === '')) {
        ev.preventDefault();
        deleteSubItem(block.id, item.id, true);
      }
    }, true);
  }

  function configureTextarea(ta, block, item) {
    ta.className = 'apartat-textarea';
    ta.rows = 1;
    ta.placeholder = 'Escriu l\'enunciat, explicació o conclusió aquí (fa salt de línia automàtic sense sortir pel costat; Shift+Enter per passar a equació)...';
    ta.value = item.text || '';

    ta.addEventListener('focus', () => {
      setActiveBlockAndItem(block.id, item.id, false);
    });

    ta.addEventListener('input', () => {
      item.text = ta.value;
      autoResizeTextarea(ta);
      saveState();
      requestAnimationFrame(resizeOverlayCanvases);
    });

    ta.addEventListener('keydown', (ev) => {
      // Tecla Tab dins d'un bloc de text insereix 4 espais de tabulació sense perdre el focus
      if (ev.key === 'Tab') {
        ev.preventDefault();
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        ta.value = ta.value.slice(0, start) + '    ' + ta.value.slice(end);
        ta.selectionStart = ta.selectionEnd = start + 4;
        item.text = ta.value;
        autoResizeTextarea(ta);
        saveState();
        return;
      }

      // Shift + Enter des d'un bloc de text passa immediatament a una nova línia d'equació dins el mateix apartat!
      if (ev.key === 'Enter' && ev.shiftKey) {
        ev.preventDefault();
        insertItemInApartat(block.id, item.id, 'math');
        return;
      }

      // Cmd/Ctrl + Enter crea un nou apartat a sota
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        insertNewApartatAfter(block.id, 'math');
        return;
      }

      // Fletxa amunt a l'inici o avall al final per navegar entre sub-ítems
      if (ev.key === 'ArrowUp' && ta.selectionStart === 0 && ta.selectionEnd === 0) {
        ev.preventDefault();
        focusNeighborItem(item.id, -1);
        return;
      }
      if (ev.key === 'ArrowDown' && ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length) {
        ev.preventDefault();
        focusNeighborItem(item.id, 1);
        return;
      }

      // Backspace si està buit elimina el bloc de text
      if (ev.key === 'Backspace' && ta.value === '') {
        ev.preventDefault();
        deleteSubItem(block.id, item.id, true);
      }
    });
  }

  function toggleInlineTextMode(mf) {
    if (!mf) return;
    mf.focus();
    if (mf.mode === 'text') {
      mf.executeCommand('switchMode', 'math');
      mf.executeCommand('moveToNextChar');
    } else {
      mf.insert('\\text{#0}', { focus: true });
      mf.executeCommand('switchMode', 'text');
    }
  }

  function renderBoardBlocks() {
    const container = document.getElementById('blocksList');
    const page = getActivePage();
    if (!container || !page) return;

    mathfieldMap.clear();
    textareaMap.clear();
    container.innerHTML = '';

    if (!Array.isArray(page.blocks) || page.blocks.length === 0) {
      page.blocks = [createEmptyApartat('math')];
    }

    let apartatNumber = 0;

    page.blocks.forEach((block) => {
      if (block.type === 'section') {
        const secEl = document.createElement('div');
        secEl.className = 'section-block';
        secEl.dataset.blockId = block.id;

        const gutter = document.createElement('div');
        gutter.className = 'section-gutter';
        gutter.textContent = '§';
        secEl.appendChild(gutter);

        const body = document.createElement('div');
        body.className = 'section-body';

        const badge = document.createElement('span');
        badge.className = 'section-badge';
        badge.textContent = 'Secció / Exercici';

        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'section-title-input';
        inp.placeholder = 'Títol del tema o exercici (ex: Problema 2 — Optimització)...';
        inp.value = block.title || '';
        inp.addEventListener('focus', () => setActiveBlockAndItem(block.id, null, false));
        inp.addEventListener('input', () => {
          block.title = inp.value;
          saveState();
        });
        inp.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            insertNewApartatAfter(block.id, 'math');
          }
        });

        const tb = document.createElement('div');
        tb.className = 'apartat-toolbar';

        const addApBtn = document.createElement('button');
        addApBtn.className = 'ap-pill-btn';
        addApBtn.textContent = '+ Apartat a sota';
        addApBtn.addEventListener('click', () => insertNewApartatAfter(block.id, 'math'));

        const delSecBtn = document.createElement('button');
        delSecBtn.className = 'row-icon-btn delete-btn';
        delSecBtn.title = 'Eliminar títol de secció';
        delSecBtn.textContent = '✕';
        delSecBtn.addEventListener('click', () => deleteBlock(block.id));

        tb.appendChild(addApBtn);
        tb.appendChild(delSecBtn);

        body.appendChild(badge);
        body.appendChild(inp);
        body.appendChild(tb);
        secEl.appendChild(body);
        container.appendChild(secEl);
        return;
      }

      // Renderitza APARTAT
      apartatNumber++;
      const apEl = document.createElement('div');
      apEl.className = `apartat-block ${block.id === state.activeBlockId ? 'focused' : ''}`;
      apEl.dataset.blockId = block.id;
      apEl.dataset.accent = block.accent || 'none';

      const gutter = document.createElement('div');
      gutter.className = 'apartat-gutter';
      gutter.textContent = String(apartatNumber);
      apEl.appendChild(gutter);

      const main = document.createElement('div');
      main.className = 'apartat-main';

      // Capçalera d'apartat (subtítol opcional + accions d'afegir equació/text/color/duplicar)
      const header = document.createElement('div');
      header.className = `apartat-header ${!block.label ? 'empty-label' : ''}`;

      const labelInp = document.createElement('input');
      labelInp.type = 'text';
      labelInp.className = 'apartat-label-input';
      labelInp.placeholder = 'Títol opcional de l\'apartat (ex: Apartat a) Domini)...';
      labelInp.value = block.label || '';
      labelInp.addEventListener('focus', () => setActiveBlockAndItem(block.id, null, false));
      labelInp.addEventListener('input', () => {
        block.label = labelInp.value;
        header.classList.toggle('empty-label', !block.label);
        saveState();
      });
      labelInp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          const firstIt = block.items[0];
          if (firstIt) focusItemById(firstIt.id, 'end');
        }
      });

      const tb = document.createElement('div');
      tb.className = 'apartat-toolbar';

      const btnAddMath = document.createElement('button');
      btnAddMath.className = 'ap-pill-btn';
      btnAddMath.title = 'Afegir una línia d\'equació dins d\'aquest mateix apartat (Enter)';
      btnAddMath.textContent = '+ Equació';
      btnAddMath.addEventListener('click', () => {
        const lastId = block.items[block.items.length - 1]?.id;
        insertItemInApartat(block.id, lastId, 'math');
      });

      const btnAddText = document.createElement('button');
      btnAddText.className = 'ap-pill-btn';
      btnAddText.title = 'Afegir un bloc de text amb salt de línia automàtic dins d\'aquest apartat (Alt+T)';
      btnAddText.textContent = '+ Text';
      btnAddText.addEventListener('click', () => {
        const lastId = block.items[block.items.length - 1]?.id;
        insertItemInApartat(block.id, lastId, 'text');
      });

      const btnColor = document.createElement('button');
      btnColor.className = 'row-icon-btn';
      btnColor.title = 'Ressaltar apartat (Verd / Blau / Àmbar / Cap)';
      btnColor.textContent = '🎨';
      btnColor.addEventListener('click', () => cycleApartatAccent(block.id));

      const btnDupAp = document.createElement('button');
      btnDupAp.className = 'row-icon-btn';
      btnDupAp.title = 'Duplicar apartat sencer a sota';
      btnDupAp.textContent = '⧉';
      btnDupAp.addEventListener('click', () => duplicateBlock(block.id));

      const btnNewAp = document.createElement('button');
      btnNewAp.className = 'ap-pill-btn';
      btnNewAp.title = 'Crear un apartat nou a sota (Cmd/Ctrl + Enter)';
      btnNewAp.textContent = '⊞ Nou apartat';
      btnNewAp.addEventListener('click', () => insertNewApartatAfter(block.id, 'math'));

      const btnDelAp = document.createElement('button');
      btnDelAp.className = 'row-icon-btn delete-btn';
      btnDelAp.title = 'Eliminar tot l\'apartat';
      btnDelAp.textContent = '✕';
      btnDelAp.addEventListener('click', () => deleteBlock(block.id));

      tb.appendChild(btnAddMath);
      tb.appendChild(btnAddText);
      tb.appendChild(btnNewAp);
      tb.appendChild(btnColor);
      tb.appendChild(btnDupAp);
      tb.appendChild(btnDelAp);

      header.appendChild(labelInp);
      header.appendChild(tb);
      main.appendChild(header);

      // Llista d'ítems dins l'apartat (múltiples equacions i/o blocs de text)
      const itemsWrap = document.createElement('div');
      itemsWrap.className = 'apartat-items';

      if (!Array.isArray(block.items) || block.items.length === 0) {
        block.items = [{ id: uid('it'), kind: 'math', latex: '' }];
      }

      block.items.forEach((item) => {
        if (item.kind === 'text') {
          const tWrap = document.createElement('div');
          tWrap.className = `apartat-text-item ${item.id === state.activeItemId ? 'active-subitem' : ''}`;
          tWrap.dataset.itemId = item.id;

          const ta = document.createElement('textarea');
          configureTextarea(ta, block, item);
          textareaMap.set(item.id, ta);

          const subActs = document.createElement('div');
          subActs.className = 'subitem-actions';

          const toMathBtn = document.createElement('button');
          toMathBtn.className = 'row-icon-btn';
          toMathBtn.title = 'Afegir equació just a sota d\'aquest text (Shift+Enter)';
          toMathBtn.textContent = '∑';
          toMathBtn.addEventListener('click', () => insertItemInApartat(block.id, item.id, 'math'));

          const delItBtn = document.createElement('button');
          delItBtn.className = 'row-icon-btn delete-btn';
          delItBtn.title = 'Eliminar aquest bloc de text';
          delItBtn.textContent = '✕';
          delItBtn.addEventListener('click', () => deleteSubItem(block.id, item.id, false));

          subActs.appendChild(toMathBtn);
          subActs.appendChild(delItBtn);

          tWrap.appendChild(ta);
          tWrap.appendChild(subActs);
          itemsWrap.appendChild(tWrap);
        } else {
          const mWrap = document.createElement('div');
          mWrap.className = `apartat-math-item ${item.id === state.activeItemId ? 'active-subitem' : ''}`;
          mWrap.dataset.itemId = item.id;

          const mf = new window.MathLive.MathfieldElement();
          configureMathfield(mf, block, item);
          mathfieldMap.set(item.id, mf);

          const subActs = document.createElement('div');
          subActs.className = 'subitem-actions';

          const quickSlot = document.createElement('span');
          quickSlot.className = 'quick-calc-slot';
          quickSlot.dataset.quickFor = item.id;

          const dupLineBtn = document.createElement('button');
          dupLineBtn.className = 'row-icon-btn';
          dupLineBtn.title = 'Duplicar aquesta equació just a sota (dins el mateix apartat)';
          dupLineBtn.textContent = '⧉';
          dupLineBtn.addEventListener('click', () => insertItemInApartat(block.id, item.id, 'math', item.latex));

          const delItBtn = document.createElement('button');
          delItBtn.className = 'row-icon-btn delete-btn';
          delItBtn.title = 'Eliminar aquesta línia d\'equació';
          delItBtn.textContent = '✕';
          delItBtn.addEventListener('click', () => deleteSubItem(block.id, item.id, false));

          subActs.appendChild(quickSlot);
          subActs.appendChild(dupLineBtn);
          subActs.appendChild(delItBtn);

          mWrap.appendChild(mf);
          mWrap.appendChild(subActs);
          itemsWrap.appendChild(mWrap);
        }
      });

      main.appendChild(itemsWrap);
      apEl.appendChild(main);
      container.appendChild(apEl);
    });

    requestAnimationFrame(() => {
      autoResizeAllTextareas();
      resizeOverlayCanvases();
    });
    runAnalysisNow();
  }

  function setActiveBlockAndItem(blockId, itemId, shouldFocus = false) {
    const prevBlock = state.activeBlockId;
    state.activeBlockId = blockId;
    if (itemId !== undefined) state.activeItemId = itemId;

    document.querySelectorAll('.apartat-block').forEach(el => {
      el.classList.toggle('focused', el.dataset.blockId === blockId);
    });
    document.querySelectorAll('.apartat-math-item, .apartat-text-item').forEach(el => {
      el.classList.toggle('active-subitem', el.dataset.itemId === state.activeItemId);
    });

    if (shouldFocus && state.activeItemId) {
      focusItemById(state.activeItemId, 'end');
    }

    if (prevBlock !== blockId && (state.scoreboardScope === 'apartat' || state.scoreboardScope === 'section')) {
      runAnalysisNow();
    }
  }

  function focusItemById(itemId, pos = 'end') {
    if (mathfieldMap.has(itemId)) {
      const mf = mathfieldMap.get(itemId);
      mf.focus();
      mf.executeCommand(pos === 'start' ? 'moveToMathfieldStart' : 'moveToMathfieldEnd');
    } else if (textareaMap.has(itemId)) {
      const ta = textareaMap.get(itemId);
      ta.focus();
      const idx = pos === 'start' ? 0 : ta.value.length;
      ta.setSelectionRange(idx, idx);
    }
  }

  function getFlatItemsList(page) {
    const out = [];
    (page.blocks || []).forEach(b => {
      if (b.type === 'apartat' && Array.isArray(b.items)) {
        b.items.forEach(it => out.push({ block: b, item: it }));
      }
    });
    return out;
  }

  function focusNeighborItem(currentItemId, delta) {
    const page = getActivePage();
    const flat = getFlatItemsList(page);
    const idx = flat.findIndex(x => x.item.id === currentItemId);
    if (idx === -1) return;
    const target = flat[idx + delta];
    if (target) {
      setActiveBlockAndItem(target.block.id, target.item.id, false);
      focusItemById(target.item.id, delta < 0 ? 'end' : 'start');
    }
  }

  function insertItemInApartat(blockId, afterItemId, kind = 'math', initialContent = '') {
    const page = getActivePage();
    const block = page.blocks.find(b => b.id === blockId && b.type === 'apartat');
    if (!block) {
      insertNewApartatAfter(blockId, kind);
      return;
    }
    const newItem = kind === 'text'
      ? { id: uid('it'), kind: 'text', text: initialContent }
      : { id: uid('it'), kind: 'math', latex: initialContent };

    const idx = block.items.findIndex(it => it.id === afterItemId);
    if (idx === -1) block.items.push(newItem);
    else block.items.splice(idx + 1, 0, newItem);

    state.activeBlockId = block.id;
    state.activeItemId = newItem.id;
    saveState();
    renderBoardBlocks();
    requestAnimationFrame(() => focusItemById(newItem.id, 'end'));
  }

  function insertNewApartatAfter(afterBlockId, firstItemKind = 'math') {
    const page = getActivePage();
    const newAp = createEmptyApartat(firstItemKind);
    const idx = page.blocks.findIndex(b => b.id === afterBlockId);
    if (idx === -1) page.blocks.push(newAp);
    else page.blocks.splice(idx + 1, 0, newAp);

    state.activeBlockId = newAp.id;
    state.activeItemId = newAp.items[0].id;
    saveState();
    renderBoardBlocks();
    requestAnimationFrame(() => {
      focusItemById(newAp.items[0].id, 'start');
      const el = document.querySelector(`.apartat-block[data-block-id="${newAp.id}"]`);
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  function insertSectionAfter(afterBlockId) {
    const page = getActivePage();
    const sec = { id: uid('blk'), type: 'section', title: '' };
    const idx = page.blocks.findIndex(b => b.id === afterBlockId);
    if (idx === -1) page.blocks.push(sec);
    else page.blocks.splice(idx + 1, 0, sec);

    state.activeBlockId = sec.id;
    saveState();
    renderBoardBlocks();
    requestAnimationFrame(() => {
      const inp = document.querySelector(`.section-block[data-block-id="${sec.id}"] .section-title-input`);
      if (inp) inp.focus();
    });
  }

  function duplicateBlock(blockId) {
    const page = getActivePage();
    const idx = page.blocks.findIndex(b => b.id === blockId);
    if (idx === -1) return;
    const cloned = deepClone(page.blocks[idx]);
    cloned.id = uid('blk');
    if (Array.isArray(cloned.items)) {
      cloned.items.forEach(it => { it.id = uid('it'); });
    }
    page.blocks.splice(idx + 1, 0, cloned);
    state.activeBlockId = cloned.id;
    state.activeItemId = cloned.items?.[0]?.id || null;
    saveState();
    renderBoardBlocks();
    if (state.activeItemId) {
      requestAnimationFrame(() => focusItemById(state.activeItemId, 'end'));
    }
  }

  function cycleApartatAccent(blockId) {
    const page = getActivePage();
    const block = page.blocks.find(b => b.id === blockId);
    if (!block) return;
    const order = ['none', 'green', 'blue', 'amber'];
    block.accent = order[(order.indexOf(block.accent || 'none') + 1) % order.length];
    const el = document.querySelector(`.apartat-block[data-block-id="${blockId}"]`);
    if (el) el.dataset.accent = block.accent;
    saveState();
  }

  function deleteSubItem(blockId, itemId, focusPrev = false) {
    const page = getActivePage();
    const block = page.blocks.find(b => b.id === blockId && b.type === 'apartat');
    if (!block) return;

    const flatBefore = getFlatItemsList(page);
    const flatIdx = flatBefore.findIndex(x => x.item.id === itemId);

    if (block.items.length > 1) {
      const iIdx = block.items.findIndex(it => it.id === itemId);
      block.items.splice(iIdx, 1);
      const nextTarget = block.items[Math.max(0, iIdx - 1)];
      state.activeBlockId = block.id;
      state.activeItemId = nextTarget.id;
      saveState();
      renderBoardBlocks();
      if (focusPrev) requestAnimationFrame(() => focusItemById(nextTarget.id, 'end'));
    } else {
      // Era l'últim ítem de l'apartat: si hi ha més apartats a la pàgina, eliminem l'apartat; sinó, el netegem
      const apartatsCount = page.blocks.filter(b => b.type === 'apartat').length;
      if (apartatsCount <= 1) {
        block.items = [{ id: uid('it'), kind: 'math', latex: '' }];
        block.label = '';
        block.accent = 'none';
        state.activeItemId = block.items[0].id;
        saveState();
        renderBoardBlocks();
        requestAnimationFrame(() => focusItemById(state.activeItemId, 'start'));
      } else {
        const bIdx = page.blocks.findIndex(b => b.id === blockId);
        page.blocks.splice(bIdx, 1);
        const prevEntry = flatBefore[Math.max(0, flatIdx - 1)];
        if (prevEntry && prevEntry.block.id !== blockId) {
          state.activeBlockId = prevEntry.block.id;
          state.activeItemId = prevEntry.item.id;
        } else {
          selectDefaultActiveItem(page);
        }
        saveState();
        renderBoardBlocks();
        if (focusPrev && state.activeItemId) {
          requestAnimationFrame(() => focusItemById(state.activeItemId, 'end'));
        }
      }
    }
  }

  function deleteBlock(blockId) {
    const page = getActivePage();
    const idx = page.blocks.findIndex(b => b.id === blockId);
    if (idx === -1) return;

    if (page.blocks.length === 1) {
      page.blocks = [createEmptyApartat('math')];
    } else {
      page.blocks.splice(idx, 1);
      if (!page.blocks.some(b => b.type === 'apartat')) {
        page.blocks.push(createEmptyApartat('math'));
      }
    }
    selectDefaultActiveItem(page);
    saveState();
    renderBoardBlocks();
  }

  function getTargetMathfieldForKeypad() {
    if (state.activeItemId && mathfieldMap.has(state.activeItemId)) {
      return mathfieldMap.get(state.activeItemId);
    }
    // Si teníem el cursor en un bloc de text i l'usuari prem un símbol matemàtic del teclat, creem una línia d'equació just a sota!
    if (state.activeBlockId) {
      const page = getActivePage();
      const blk = page.blocks.find(b => b.id === state.activeBlockId && b.type === 'apartat');
      if (blk) {
        const mathItem = blk.items.find(it => it.kind === 'math');
        if (mathItem && mathfieldMap.has(mathItem.id)) {
          state.activeItemId = mathItem.id;
          return mathfieldMap.get(mathItem.id);
        }
        insertItemInApartat(blk.id, state.activeItemId, 'math');
        return mathfieldMap.get(state.activeItemId);
      }
    }
    const firstMf = mathfieldMap.values().next().value;
    return firstMf || null;
  }

  // ============================================================================
  // 5. Scoreboard de Variables i Funcions (Àmbits: Apartat | Exercici | Pàgina)
  // ============================================================================
  function scheduleAnalysis() {
    if (analysisTimer) clearTimeout(analysisTimer);
    analysisTimer = setTimeout(runAnalysisNow, 90);
  }

  function getScopedBlocks(page) {
    if (state.scoreboardScope === 'page') {
      return page.blocks;
    }
    if (state.scoreboardScope === 'apartat') {
      const activeAp = page.blocks.find(b => b.id === state.activeBlockId && b.type === 'apartat')
        || page.blocks.find(b => b.type === 'apartat');
      return activeAp ? [activeAp] : page.blocks;
    }
    // 'section': tots els apartats entre el separador § anterior i el següent!
    let idx = page.blocks.findIndex(b => b.id === state.activeBlockId);
    if (idx === -1) idx = 0;
    let start = 0;
    for (let i = idx; i >= 0; i--) {
      if (page.blocks[i].type === 'section') { start = i; break; }
    }
    let end = page.blocks.length;
    for (let i = idx + 1; i < page.blocks.length; i++) {
      if (page.blocks[i].type === 'section') { end = i; break; }
    }
    return page.blocks.slice(start, end);
  }

  function runAnalysisNow() {
    const page = getActivePage();
    if (!page) return;

    // Numera tots els apartats de la pàgina per mostrar referències clares ("Apartat 3")
    const apartatNumMap = new Map();
    let apCounter = 0;
    page.blocks.forEach(b => {
      if (b.type === 'apartat') {
        apCounter++;
        apartatNumMap.set(b.id, apCounter);
      }
    });

    const scopedBlocks = getScopedBlocks(page);
    const flatMathRows = [];
    scopedBlocks.forEach(b => {
      if (b.type === 'apartat' && Array.isArray(b.items)) {
        const apNum = apartatNumMap.get(b.id) || 1;
        b.items.forEach(it => {
          if (it.kind === 'math') {
            flatMathRows.push({
              id: it.id,
              blockId: b.id,
              apartatNum: apNum,
              type: 'math',
              latex: it.latex || ''
            });
          }
        });
      }
    });

    const result = window.MathEngine.analyzeRows(flatMathRows, {
      angleMode: state.angleMode,
      overrides: page.overrides || {}
    });

    // Mapeja referències d'apartats i sub-ítems per ressaltar-los en passar el ratolí
    result.variables.forEach(v => {
      const apSet = new Set();
      const itemIds = [];
      const blockIds = [];
      v.lines.forEach(idx1Based => {
        const rowObj = flatMathRows[idx1Based - 1];
        if (rowObj) {
          apSet.add(rowObj.apartatNum);
          itemIds.push(rowObj.id);
          blockIds.push(rowObj.blockId);
        }
      });
      v.apartatNums = [...apSet].sort((a, b) => a - b);
      v.itemIds = itemIds;
      v.blockIds = [...new Set(blockIds)];
    });

    result.functions.forEach(fn => {
      const rowObj = flatMathRows[fn.lineNumber - 1];
      if (rowObj) {
        fn.apartatNum = rowObj.apartatNum;
        fn.itemId = rowObj.id;
        fn.blockId = rowObj.blockId;
      }
    });

    lastAnalysis = result;
    renderScoreboard(result, page);
    renderQuickRowCalcPills(result.lineQuickResults);
    if (state.graphOpen) drawGraphCanvas();
  }

  function renderQuickRowCalcPills(lineQuickResults) {
    document.querySelectorAll('.quick-calc-slot').forEach(slot => {
      const itemId = slot.dataset.quickFor;
      slot.innerHTML = '';
      const info = lineQuickResults[itemId];
      if (!info || !info.formatted) return;

      const btn = document.createElement('button');
      btn.className = 'quick-calc-pill';
      btn.title = 'Clica si vols afegir el resultat calculat a aquesta equació';
      btn.textContent = `= ${info.formatted.text.split('≈')[0].trim()}`;
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const mf = mathfieldMap.get(itemId);
        if (!mf) return;
        const prefix = info.endsWithEquals ? ' ' : ' = ';
        mf.focus();
        mf.executeCommand('moveToMathfieldEnd');
        mf.insert(`${prefix}${info.formatted.latex}`);
      });
      slot.appendChild(btn);
    });
  }

  function renderScoreboard(result, page) {
    const body = document.getElementById('scoreboardBody');
    const countBadge = document.getElementById('varCountBadge');
    const openGraphHeaderBtn = document.getElementById('btnOpenGraphHeader');
    if (!body || !countBadge) return;

    countBadge.textContent = String(result.variables.length);
    const has1DFuncs = result.functions.some(f => f.params.length === 1);
    if (openGraphHeaderBtn) {
      openGraphHeaderBtn.style.display = has1DFuncs ? 'inline-flex' : 'none';
    }

    body.innerHTML = '';

    if (result.variables.length === 0 && result.functions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sb-empty';
      empty.innerHTML = `
        <div style="font-size:24px;margin-bottom:8px;">📐</div>
        <strong>Cap variable en aquest àmbit</strong><br/>
        Escriu equacions com <code>a = 3</code>, <code>2x + y = 7</code> o <code>f(x) = x^2 - 1</code> (o canvia l'àmbit a dalt entre <em>Apartat / Exercici / Pàgina</em>).
      `;
      body.appendChild(empty);
      return;
    }

    const solvedList = result.variables.filter(v =>
      v.status === 'computed' || v.status === 'solved' || v.status === 'multi' || v.status === 'override'
    );
    const pendingList = result.variables.filter(v => !solvedList.includes(v));

    if (solvedList.length > 0) {
      const sec = document.createElement('div');
      sec.innerHTML = `<div class="sb-section-label"><span>Variables calculades (${solvedList.length})</span><span>${state.angleMode}</span></div>`;
      const cards = document.createElement('div');
      cards.className = 'sb-cards';
      solvedList.forEach(v => cards.appendChild(buildVariableCard(v, page)));
      sec.appendChild(cards);
      body.appendChild(sec);
    }

    if (pendingList.length > 0) {
      const sec = document.createElement('div');
      sec.innerHTML = `<div class="sb-section-label"><span>Incògnites / Sense valor (${pendingList.length})</span></div>`;
      const cards = document.createElement('div');
      cards.className = 'sb-cards';
      pendingList.forEach(v => cards.appendChild(buildVariableCard(v, page)));
      sec.appendChild(cards);
      body.appendChild(sec);
    }

    if (result.functions.length > 0) {
      const sec = document.createElement('div');
      sec.innerHTML = `<div class="sb-section-label"><span>Funcions declarades (${result.functions.length})</span></div>`;
      const cards = document.createElement('div');
      cards.className = 'sb-cards';
      result.functions.forEach(fn => cards.appendChild(buildFunctionCard(fn)));
      sec.appendChild(cards);
      body.appendChild(sec);
    }
  }

  function buildVariableCard(v, page) {
    const card = document.createElement('div');
    card.className = `var-card status-${v.status}`;

    card.addEventListener('mouseenter', () => highlightBoardItems(v.blockIds, v.itemIds, true));
    card.addEventListener('mouseleave', () => highlightBoardItems(v.blockIds, v.itemIds, false));
    card.addEventListener('click', (ev) => {
      if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'BUTTON') return;
      if (v.itemIds && v.itemIds.length > 0) {
        const bId = v.blockIds[0];
        const iId = v.itemIds[0];
        setActiveBlockAndItem(bId, iId, true);
        const el = document.querySelector(`[data-item-id="${iId}"]`);
        if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });

    const main = document.createElement('div');
    main.className = 'var-card-main';

    const sym = document.createElement('div');
    sym.className = 'var-symbol';
    sym.innerHTML = renderLatexStatic(v.latex);

    const valBox = document.createElement('div');
    valBox.className = 'var-value-box';

    if (v.status === 'computed' || v.status === 'solved' || v.status === 'override') {
      const exactEl = document.createElement('div');
      exactEl.className = 'var-value-exact';
      exactEl.innerHTML = renderLatexStatic(v.formatted.latex);
      valBox.appendChild(exactEl);

      if (v.formatted.approxLatex) {
        const approxEl = document.createElement('div');
        approxEl.className = 'var-value-approx';
        approxEl.textContent = `≈ ${v.formatted.approxLatex}`;
        valBox.appendChild(approxEl);
      }
    } else if (v.status === 'multi' && v.multiValues) {
      const exactEl = document.createElement('div');
      exactEl.className = 'var-value-exact';
      const joinedLatex = v.multiValues.map(m => m.latex).join(',\\; ');
      exactEl.innerHTML = renderLatexStatic(`\\left\\{ ${joinedLatex} \\right\\}`);
      valBox.appendChild(exactEl);
    } else if (v.status === 'no_real') {
      const msg = document.createElement('div');
      msg.style.color = 'var(--accent-red)';
      msg.style.fontSize = '12px';
      msg.style.fontWeight = '600';
      if (v.complex) {
        const re = window.MathEngine.formatNumberCatalan(v.complex.re, true);
        const im = window.MathEngine.formatNumberCatalan(v.complex.im, true);
        msg.textContent = v.complex.re === 0 ? `∉ ℝ (±${im}i)` : `∉ ℝ (${re} ± ${im}i)`;
      } else {
        msg.textContent = 'Sense sol. real';
      }
      valBox.appendChild(msg);
    } else if (v.status === 'incompatible') {
      const msg = document.createElement('div');
      msg.style.color = 'var(--accent-red)';
      msg.style.fontSize = '12px';
      msg.style.fontWeight = '600';
      msg.textContent = 'Sistema Incompatible';
      valBox.appendChild(msg);
    } else if (v.status === 'indeterminate') {
      const msg = document.createElement('div');
      msg.style.color = 'var(--accent-amber)';
      msg.style.fontSize = '12px';
      msg.style.fontWeight = '600';
      msg.textContent = 'Indeterminat (∞ sol.)';
      valBox.appendChild(msg);
    } else {
      const msg = document.createElement('div');
      msg.style.color = 'var(--text-muted)';
      msg.style.fontSize = '12px';
      msg.textContent = v.dependsOn && v.dependsOn.length > 0
        ? `Depèn de ${v.dependsOn.join(', ')}`
        : 'Sense valor assignat';
      valBox.appendChild(msg);
    }

    main.appendChild(sym);
    main.appendChild(valBox);
    card.appendChild(main);

    const meta = document.createElement('div');
    meta.className = 'var-card-meta';

    const apLabel = v.apartatNums && v.apartatNums.length > 0
      ? `Apartat ${v.apartatNums.join(', ')}`
      : '';
    let srcClean = '';
    if (v.source) {
      srcClean = v.source.startsWith('Línia ') ? 'Assignada' : v.source.replace(/\(línia \d+\)/, '').trim();
    }
    const leftMeta = document.createElement('span');
    leftMeta.textContent = [apLabel, srcClean].filter(Boolean).join(' · ');
    meta.appendChild(leftMeta);

    if (v.status === 'override') {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'var-mini-btn';
      clearBtn.textContent = '✕ Treure prova';
      clearBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        delete page.overrides[v.key];
        saveState();
        runAnalysisNow();
      });
      meta.appendChild(clearBtn);
    } else if (v.status === 'unknown' || v.status === 'pending' || v.status === 'indeterminate') {
      const testBtn = document.createElement('button');
      testBtn.className = 'var-mini-btn';
      testBtn.textContent = 'Provar valor';
      testBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        let testWrap = card.querySelector('.var-test-row');
        if (testWrap) { testWrap.remove(); return; }
        testWrap = document.createElement('div');
        testWrap.className = 'var-test-row';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = 'Ex: 5';
        inp.className = 'var-test-input';
        const okBtn = document.createElement('button');
        okBtn.className = 'var-mini-btn';
        okBtn.textContent = 'Aplicar';
        const applyVal = () => {
          const parsed = parseFloat(inp.value.replace(',', '.'));
          if (Number.isFinite(parsed)) {
            page.overrides = page.overrides || {};
            page.overrides[v.key] = parsed;
            saveState();
            runAnalysisNow();
          }
        };
        okBtn.addEventListener('click', applyVal);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyVal(); });
        testWrap.appendChild(inp);
        testWrap.appendChild(okBtn);
        card.appendChild(testWrap);
        inp.focus();
      });
      meta.appendChild(testBtn);
    }

    card.appendChild(meta);
    return card;
  }

  function buildFunctionCard(fn) {
    const card = document.createElement('div');
    card.className = 'func-card';

    card.addEventListener('mouseenter', () => {
      if (fn.blockId) highlightBoardItems([fn.blockId], [fn.itemId], true);
    });
    card.addEventListener('mouseleave', () => {
      if (fn.blockId) highlightBoardItems([fn.blockId], [fn.itemId], false);
    });
    card.addEventListener('click', (ev) => {
      if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'BUTTON') return;
      if (fn.blockId && fn.itemId) {
        setActiveBlockAndItem(fn.blockId, fn.itemId, true);
        const el = document.querySelector(`[data-item-id="${fn.itemId}"]`);
        if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });

    const topRow = document.createElement('div');
    topRow.className = 'func-card-top';

    const formulaDiv = document.createElement('div');
    formulaDiv.className = `func-card-formula ${fn.isPiecewise ? 'is-piecewise' : ''}`;
    formulaDiv.innerHTML = renderLatexStatic(`${fn.signatureLatex} = ${fn.bodyLatex}`);
    topRow.appendChild(formulaDiv);

    if (fn.params.length === 1) {
      const plotBtn = document.createElement('button');
      plotBtn.className = 'var-mini-btn';
      plotBtn.style.flexShrink = '0';
      plotBtn.textContent = '📈 Gràfica';
      plotBtn.title = 'Obrir gràfica cartesiana interactiva';
      plotBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openGraphModal();
      });
      topRow.appendChild(plotBtn);
    }

    card.appendChild(topRow);

    // Si és una funció definida a trossos, mostra l'estudi automàtic de continuïtat i salts en cada punt frontera!
    if (fn.isPiecewise && fn.piecewiseInfo && fn.piecewiseInfo.breakpoints.length > 0) {
      const bpBox = document.createElement('div');
      bpBox.className = 'pw-breakpoints-box';
      const paramName = fn.params[0] || 'x';

      fn.piecewiseInfo.breakpoints.forEach(bp => {
        const badge = document.createElement('div');
        const xStr = bp.xFormatted ? bp.xFormatted.text : window.MathEngine.formatNumberCatalan(bp.x, true);
        const lStr = bp.leftFormatted ? bp.leftFormatted.text : '∄';
        const rStr = bp.rightFormatted ? bp.rightFormatted.text : '∄';
        const vStr = bp.valueFormatted ? bp.valueFormatted.text : '∄';

        if (bp.status === 'continuous') {
          badge.className = 'pw-bp-badge bp-continuous';
          badge.innerHTML = `<span>${paramName} = ${xStr}</span><span>${bp.isDifferentiable ? 'Contínua i derivable ✓' : 'Contínua ✓ (punt angulós)'}</span>`;
        } else if (bp.status === 'jump') {
          badge.className = 'pw-bp-badge bp-jump';
          badge.innerHTML = `<span>${paramName} = ${xStr}: Salt finit</span><span>L⁻ = ${lStr} · L⁺ = ${rStr}</span>`;
        } else if (bp.status === 'removable') {
          badge.className = 'pw-bp-badge bp-removable';
          badge.innerHTML = `<span>${paramName} = ${xStr}: Evitable</span><span>L = ${lStr} · ${fn.nameLatex.replace(/^\\/, '')}(${xStr}) = ${vStr}</span>`;
        } else if (bp.status === 'asymptotic') {
          badge.className = 'pw-bp-badge bp-asymptotic';
          badge.innerHTML = `<span>${paramName} = ${xStr}</span><span>Salt infinit (asímptota)</span>`;
        } else {
          badge.className = 'pw-bp-badge bp-boundary';
          badge.innerHTML = `<span>${paramName} = ${xStr}</span><span>Extrem de domini</span>`;
        }
        bpBox.appendChild(badge);
      });

      card.appendChild(bpBox);
    }

    if (fn.params.length === 1) {
      const evalBar = document.createElement('div');
      evalBar.className = 'func-eval-bar';

      const prefix = document.createElement('span');
      prefix.innerHTML = renderLatexStatic(`${fn.nameLatex}(`);

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'func-eval-input';
      input.placeholder = fn.params[0];
      input.value = state.funcQuickInputs[fn.key] !== undefined ? state.funcQuickInputs[fn.key] : '';

      const suffix = document.createElement('span');
      suffix.innerHTML = renderLatexStatic(') =');

      const outSpan = document.createElement('span');
      outSpan.className = 'func-eval-result';

      const computeQuickFn = () => {
        const raw = input.value.trim().replace(',', '.');
        state.funcQuickInputs[fn.key] = input.value;
        if (!raw || !Number.isFinite(Number(raw))) {
          outSpan.textContent = '…';
          return;
        }
        const yVal = fn.evalAt(Number(raw));
        const fmt = window.MathEngine.formatValueRich(yVal);
        outSpan.innerHTML = fmt ? renderLatexStatic(fmt.latex) : '∄ (fora domini)';
      };

      input.addEventListener('input', computeQuickFn);
      computeQuickFn();

      evalBar.appendChild(prefix);
      evalBar.appendChild(input);
      evalBar.appendChild(suffix);
      evalBar.appendChild(outSpan);
      card.appendChild(evalBar);
    }

    return card;
  }

  function highlightBoardItems(blockIds, itemIds, active) {
    (blockIds || []).forEach(bId => {
      const el = document.querySelector(`.apartat-block[data-block-id="${bId}"]`);
      if (el) el.classList.toggle('var-linked-highlight', active);
    });
    (itemIds || []).forEach(iId => {
      const el = document.querySelector(`[data-item-id="${iId}"]`);
      if (el) el.classList.toggle('item-linked-highlight', active);
    });
  }

  // ============================================================================
  // 6. Gràfica Cartesiana Interactiva (amb suport complet de Funcions a Trossos!)
  // ============================================================================
  function openGraphModal() {
    state.graphOpen = true;
    state.graphHiddenKeys.clear();
    document.getElementById('graphModal')?.classList.add('open');
    renderGraphLegend();
    requestAnimationFrame(drawGraphCanvas);
  }

  function renderGraphLegend() {
    const chipsWrap = document.getElementById('graphFnChips');
    if (!chipsWrap) return;
    chipsWrap.innerHTML = '';
    const fns = (lastAnalysis.functions || []).filter(f => f.params.length === 1);
    fns.forEach((fn, idx) => {
      const color = GRAPH_COLORS[idx % GRAPH_COLORS.length];
      const chip = document.createElement('button');
      chip.className = 'graph-fn-chip';
      const hidden = state.graphHiddenKeys.has(fn.key);
      chip.style.opacity = hidden ? '0.45' : '1';
      const labelHtml = fn.isPiecewise
        ? `${renderLatexStatic(fn.signatureLatex)} <span style="font-size:11.5px;color:var(--text-secondary);">(${fn.piecewiseInfo?.branchCount || 2} trossos)</span>`
        : renderLatexStatic(`${fn.signatureLatex} = ${fn.bodyLatex}`);
      chip.innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span> ${labelHtml}`;
      chip.addEventListener('click', () => {
        if (state.graphHiddenKeys.has(fn.key)) state.graphHiddenKeys.delete(fn.key);
        else state.graphHiddenKeys.add(fn.key);
        renderGraphLegend();
        drawGraphCanvas();
      });
      chipsWrap.appendChild(chip);
    });
  }

  function initGraphInteractions() {
    const canvas = document.getElementById('graphCanvas');
    if (!canvas) return;
    let dragging = false;
    let lastX = 0, lastY = 0;

    canvas.addEventListener('mousedown', (ev) => {
      dragging = true;
      lastX = ev.clientX;
      lastY = ev.clientY;
    });
    window.addEventListener('mousemove', (ev) => {
      if (!state.graphOpen) return;
      const rect = canvas.getBoundingClientRect();
      if (dragging) {
        const dx = ev.clientX - lastX;
        const dy = ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        state.graphView.cx -= dx / state.graphView.scale;
        state.graphView.cy += dy / state.graphView.scale;
        drawGraphCanvas();
      } else if (
        ev.clientX >= rect.left && ev.clientX <= rect.right &&
        ev.clientY >= rect.top && ev.clientY <= rect.bottom
      ) {
        state.graphHoverPt = { px: ev.clientX - rect.left, py: ev.clientY - rect.top };
        drawGraphCanvas();
      }
    });
    window.addEventListener('mouseup', () => { dragging = false; });

    canvas.addEventListener('mouseleave', () => {
      state.graphHoverPt = null;
      if (state.graphOpen) drawGraphCanvas();
    });

    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
      state.graphView.scale = Math.max(4, Math.min(800, state.graphView.scale * factor));
      drawGraphCanvas();
    }, { passive: false });

    document.getElementById('btnResetGraphView')?.addEventListener('click', () => {
      state.graphView = { cx: 0, cy: 0, scale: 42 };
      drawGraphCanvas();
    });
  }

  function drawGraphCanvas() {
    const canvas = document.getElementById('graphCanvas');
    const coordsBadge = document.getElementById('graphCoordsBadge');
    if (!canvas || !state.graphOpen) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;
    const { cx, cy, scale } = state.graphView;

    const toScreenX = x => W / 2 + (x - cx) * scale;
    const toScreenY = y => H / 2 - (y - cy) * scale;
    const toMathX = px => cx + (px - W / 2) / scale;
    const toMathY = py => cy - (py - H / 2) / scale;

    ctx.clearRect(0, 0, W, H);

    // Determina pas de quadrícula agradable (1, 2, 5 * 10^k)
    const rawStep = 65 / scale;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    const gridStep = (norm < 1.8 ? 1 : norm < 3.8 ? 2 : 5) * mag;

    const xMin = toMathX(0), xMax = toMathX(W);
    const yMin = toMathY(H), yMax = toMathY(0);

    const isDark = state.darkMode;
    ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.07)';
    ctx.lineWidth = 1;
    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.font = '11px -apple-system, sans-serif';

    for (let gx = Math.ceil(xMin / gridStep) * gridStep; gx <= xMax; gx += gridStep) {
      const sx = toScreenX(gx);
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, H);
      ctx.stroke();
      if (Math.abs(gx) > 1e-9) {
        const ay = Math.min(H - 14, Math.max(14, toScreenY(0) + 14));
        ctx.fillText(window.MathEngine.formatNumberCatalan(gx, true), sx + 3, ay);
      }
    }
    for (let gy = Math.ceil(yMin / gridStep) * gridStep; gy <= yMax; gy += gridStep) {
      const sy = toScreenY(gy);
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(W, sy);
      ctx.stroke();
      if (Math.abs(gy) > 1e-9) {
        const ax = Math.min(W - 36, Math.max(6, toScreenX(0) + 6));
        ctx.fillText(window.MathEngine.formatNumberCatalan(gy, true), ax, sy - 3);
      }
    }

    // Eixos X i Y
    ctx.strokeStyle = isDark ? '#94a3b8' : '#334155';
    ctx.lineWidth = 1.6;
    const y0 = toScreenY(0);
    if (y0 >= 0 && y0 <= H) {
      ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();
    }
    const x0 = toScreenX(0);
    if (x0 >= 0 && x0 <= W) {
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, H); ctx.stroke();
    }

    // Dibuixa cada funció 1D activa (amb tall net als punts de ruptura de funcions a trossos!)
    const fns = (lastAnalysis.functions || []).filter(f => f.params.length === 1);
    fns.forEach((fn, idx) => {
      if (state.graphHiddenKeys.has(fn.key)) return;
      const color = GRAPH_COLORS[idx % GRAPH_COLORS.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();

      const bps = fn.isPiecewise && fn.piecewiseInfo ? fn.piecewiseInfo.breakpoints : [];
      let penDown = false;
      let prevSy = 0;
      let prevMx = toMathX(0);
      let prevBranchIdx = -2;

      for (let px = 0; px <= W; px += 1.25) {
        const mx = toMathX(px);
        const crossedBp = px > 0 ? bps.find(b => b.x > prevMx && b.x <= mx) : null;

        const sample = fn.evalWithBranch ? fn.evalWithBranch(mx) : { y: fn.evalAt(mx), branchIndex: 0, isIsolatedPoint: false };
        const my = sample.y;

        if (sample.isIsolatedPoint || !Number.isFinite(my) || sample.branchIndex < 0) {
          if (penDown && crossedBp && Number.isFinite(crossedBp.leftLimit)) {
            const bpSx = toScreenX(crossedBp.x);
            const bpSy = toScreenY(crossedBp.leftLimit);
            if (Math.abs(bpSy - prevSy) < H * 1.5) ctx.lineTo(bpSx, bpSy);
          }
          penDown = false;
          prevBranchIdx = -1;
          prevMx = mx;
          continue;
        }

        const sy = toScreenY(my);

        if (crossedBp) {
          if (penDown && Number.isFinite(crossedBp.leftLimit)) {
            const bpSx = toScreenX(crossedBp.x);
            const bpSyL = toScreenY(crossedBp.leftLimit);
            if (Math.abs(bpSyL - prevSy) < H * 1.5) ctx.lineTo(bpSx, bpSyL);
          }
          if (Number.isFinite(crossedBp.rightLimit)) {
            const bpSx = toScreenX(crossedBp.x);
            const bpSyR = toScreenY(crossedBp.rightLimit);
            ctx.moveTo(bpSx, bpSyR);
            if (Math.abs(sy - bpSyR) < H * 1.5) ctx.lineTo(px, sy);
            else ctx.moveTo(px, sy);
          } else {
            ctx.moveTo(px, sy);
          }
          penDown = true;
        } else if (!penDown || sample.branchIndex !== prevBranchIdx) {
          ctx.moveTo(px, sy);
          penDown = true;
        } else if (Math.abs(sy - prevSy) < H * 1.5) {
          ctx.lineTo(px, sy);
        } else {
          ctx.moveTo(px, sy);
        }

        prevSy = sy;
        prevMx = mx;
        prevBranchIdx = sample.branchIndex;
      }
      ctx.stroke();

      // Dibuixa els punts extrems ○ (oberts) i ● (plens) als punts frontera de les funcions a trossos!
      if (bps.length > 0) {
        const boardBg = isDark ? '#111a2e' : '#ffffff';
        const allDots = bps.flatMap(b => b.dots || []);
        // Primer els punts buits ○, després els plens ● a sobre per claredat
        allDots.filter(d => !d.filled).forEach(dot => {
          const sx = toScreenX(dot.x);
          const sy = toScreenY(dot.y);
          if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) return;
          ctx.beginPath();
          ctx.arc(sx, sy, 5, 0, Math.PI * 2);
          ctx.fillStyle = boardBg;
          ctx.fill();
          ctx.lineWidth = 2.2;
          ctx.strokeStyle = color;
          ctx.stroke();
        });
        allDots.filter(d => d.filled).forEach(dot => {
          const sx = toScreenX(dot.x);
          const sy = toScreenY(dot.y);
          if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) return;
          ctx.beginPath();
          ctx.arc(sx, sy, 5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = boardBg;
          ctx.stroke();
        });
      }
    });

    // Cursor de coordenades i punts sobre les corbes
    if (state.graphHoverPt && coordsBadge) {
      const mx = toMathX(state.graphHoverPt.px);
      const my = toMathY(state.graphHoverPt.py);
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(state.graphHoverPt.px, 0);
      ctx.lineTo(state.graphHoverPt.px, H);
      ctx.stroke();
      ctx.setLineDash([]);

      const parts = [`x = ${window.MathEngine.formatNumberCatalan(mx, true)}`];
      fns.forEach((fn, idx) => {
        if (state.graphHiddenKeys.has(fn.key)) return;
        const fy = fn.evalAt(mx);
        if (Number.isFinite(fy)) {
          const sy = toScreenY(fy);
          if (sy >= 0 && sy <= H) {
            ctx.fillStyle = GRAPH_COLORS[idx % GRAPH_COLORS.length];
            ctx.beginPath();
            ctx.arc(state.graphHoverPt.px, sy, 4.5, 0, Math.PI * 2);
            ctx.fill();
          }
          parts.push(`${fn.nameLatex.replace(/^\\/, '')}(x) = ${window.MathEngine.formatNumberCatalan(fy, true)}`);
        }
      });
      if (parts.length === 1) {
        parts.push(`y = ${window.MathEngine.formatNumberCatalan(my, true)}`);
      }
      coordsBadge.textContent = parts.join('   ·   ');
    } else if (coordsBadge) {
      coordsBadge.textContent = 'Roda del ratolí: zoom · Arrossega: moure';
    }
  }

  // ============================================================================
  // 7. Sistema de Desar i Importar (Tot l'espai, Llibreta o Pàgina individual)
  // ============================================================================
  function slugify(str) {
    return String(str || 'apunts')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'pissarra';
  }

  function downloadJsonFile(filename, dataObj) {
    const json = JSON.stringify(dataObj, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportFullWorkspaceFile() {
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadJsonFile(`aritmetic-espai-complet-${dateStr}.aritmetic.json`, {
      kind: 'pissarra_workspace',
      version: 2,
      exportedAt: new Date().toISOString(),
      settings: {
        angleMode: state.angleMode,
        scoreboardScope: state.scoreboardScope
      },
      notebooks: state.notebooks
    });
  }

  function exportNotebookFile(notebook) {
    const nb = notebook || getActiveNotebook();
    if (!nb) return;
    downloadJsonFile(`llibreta-${slugify(nb.title)}.aritmetic.json`, {
      kind: 'pissarra_notebook',
      version: 2,
      exportedAt: new Date().toISOString(),
      notebook: nb
    });
  }

  function exportPageFile(page, notebookTitle) {
    const pg = page || getActivePage();
    if (!pg) return;
    downloadJsonFile(`pagina-${slugify(pg.title)}.aritmetic.json`, {
      kind: 'pissarra_page',
      version: 2,
      exportedAt: new Date().toISOString(),
      fromNotebook: notebookTitle || getActiveNotebook()?.title || '',
      page: pg
    });
  }

  function copyActivePageLatex() {
    const pg = getActivePage();
    if (!pg) return;
    const lines = [`% ${pg.title}`];
    (pg.blocks || []).forEach((b) => {
      if (b.type === 'section') {
        lines.push(`\n% === ${b.title || 'Secció'} ===`);
      } else if (b.type === 'apartat') {
        if (b.label) lines.push(`\n% ${b.label}`);
        (b.items || []).forEach(it => {
          if (it.kind === 'text' && it.text.trim()) {
            lines.push(`% ${it.text.replace(/\n/g, '\n% ')}`);
          } else if (it.kind === 'math' && it.latex.trim()) {
            lines.push(`\\[ ${it.latex} \\]`);
          }
        });
      }
    });
    navigator.clipboard?.writeText(lines.join('\n')).then(() => {
      alert('Codi LaTeX de la pàgina copiat al porta-retalls!');
    }).catch(() => {
      prompt('Copia el codi LaTeX de la pàgina:', lines.join('\n'));
    });
  }

  function preparePrintDocument() {
    const printEl = document.getElementById('printDocument');
    const nb = getActiveNotebook();
    const pg = getActivePage();
    if (!printEl || !pg) return;

    const dateFormatted = new Date().toLocaleDateString('ca-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const parts = [];
    parts.push(`
      <header class="print-doc-header">
        <div style="min-width:0;">
          <div class="print-doc-kicker">📚 ${escapeHtml(nb ? nb.title : 'Aritmètic · Batxillerat')}</div>
          <h1 class="print-doc-title">${escapeHtml(pg.title || 'Apunts de Matemàtiques')}</h1>
        </div>
        <div class="print-doc-meta">
          <div>${escapeHtml(dateFormatted)}</div>
          <div>Mode angular: <strong>${escapeHtml(state.angleMode)}</strong></div>
        </div>
      </header>
    `);

    let apartatNum = 0;
    (pg.blocks || []).forEach((block) => {
      if (block.type === 'section') {
        const titleTxt = (block.title || '').trim() || 'Secció';
        parts.push(`<h2 class="print-section-heading">§ ${escapeHtml(titleTxt)}</h2>`);
        return;
      }

      if (block.type === 'apartat') {
        apartatNum++;
        const nonEmptyItems = (block.items || []).filter(it =>
          (it.kind === 'text' && (it.text || '').trim() !== '') ||
          (it.kind === 'math' && (it.latex || '').trim() !== '')
        );
        if (nonEmptyItems.length === 0 && !(block.label || '').trim()) {
          return;
        }

        const isCompact = nonEmptyItems.length <= 5;
        const accent = block.accent || 'none';
        const labelHtml = (block.label || '').trim()
          ? `<div class="print-apartat-label">${escapeHtml(block.label.trim())}</div>`
          : '';

        const itemsHtml = nonEmptyItems.map(it => {
          if (it.kind === 'text') {
            return `<div class="print-text-block">${escapeHtml(it.text)}</div>`;
          }
          return `<div class="print-math-row"><div class="print-math-inner">${renderLatexStatic(it.latex)}</div></div>`;
        }).join('');

        parts.push(`
          <article class="print-apartat ${isCompact ? 'compact-apartat' : ''}" data-accent="${escapeHtml(accent)}">
            <div class="print-apartat-gutter">${apartatNum}</div>
            <div class="print-apartat-body">
              ${labelHtml}
              ${itemsHtml}
            </div>
          </article>
        `);
      }
    });

    printEl.innerHTML = parts.join('\n');

    // Mesura fora de pantalla a 680px (amplada útil d'un full A4 amb marges) per ajustar proporcionalment equacions molt llargues
    printEl.classList.add('print-measuring');
    printEl.querySelectorAll('.print-math-row').forEach(row => {
      const inner = row.querySelector('.print-math-inner');
      if (!inner) return;
      row.style.fontSize = '15.5px';
      inner.style.transform = 'none';
      const availW = row.clientWidth - 6;
      if (availW <= 0) return;
      const rect = inner.getBoundingClientRect();
      const natW = Math.max(inner.scrollWidth, inner.offsetWidth, rect.width);
      if (natW > availW) {
        const fittedPx = Math.max(9.0, 15.5 * (availW / natW) * 0.96);
        row.style.fontSize = `${fittedPx.toFixed(2)}px`;
        // Si fins i tot a 9px fos una cadena extraordinàriament llarga, aplica una lleugera escala extra per evitar cap tall
        const afterW = Math.max(inner.scrollWidth, inner.offsetWidth, inner.getBoundingClientRect().width);
        if (afterW > availW) {
          const extraScale = Math.max(0.55, (availW / afterW) * 0.97);
          inner.style.transform = `scale(${extraScale.toFixed(3)})`;
        }
      }
    });
    printEl.classList.remove('print-measuring');
  }

  function triggerPrintPdf() {
    preparePrintDocument();
    requestAnimationFrame(() => {
      window.print();
    });
  }

  function importFromJsonObject(data, mode = 'merge') {
    if (!data || typeof data !== 'object') {
      alert('El fitxer no té un format JSON vàlid.');
      return;
    }

    // 1. És un espai de treball complet
    if (data.kind === 'pissarra_workspace' || Array.isArray(data.notebooks)) {
      const incoming = deepClone(data.notebooks || []);
      if (incoming.length === 0) return;
      incoming.forEach(nb => {
        nb.id = uid('nb');
        (nb.pages || []).forEach(pg => {
          pg.id = uid('page');
          reassignBlockAndItemIds(pg);
        });
      });

      if (mode === 'replace') {
        state.notebooks = incoming;
      } else {
        state.notebooks.push(...incoming);
      }
      incoming.forEach(n => state.expandedNotebookIds.add(n.id));
      const targetNb = incoming[0];
      saveState();
      switchNotebookAndPage(targetNb.id, targetNb.pages[0].id);
      document.getElementById('saveModal')?.classList.remove('open');
      return;
    }

    // 2. És una llibreta individual
    if (data.kind === 'pissarra_notebook' && data.notebook) {
      const nb = deepClone(data.notebook);
      nb.id = uid('nb');
      (nb.pages || []).forEach(pg => {
        pg.id = uid('page');
        reassignBlockAndItemIds(pg);
      });
      state.notebooks.push(nb);
      state.expandedNotebookIds.add(nb.id);
      saveState();
      switchNotebookAndPage(nb.id, nb.pages[0].id);
      document.getElementById('saveModal')?.classList.remove('open');
      return;
    }

    // 3. És una pàgina individual
    if (data.kind === 'pissarra_page' && data.page) {
      const pg = deepClone(data.page);
      pg.id = uid('page');
      reassignBlockAndItemIds(pg);
      const activeNb = getActiveNotebook();
      activeNb.pages.push(pg);
      saveState();
      switchNotebookAndPage(activeNb.id, pg.id);
      document.getElementById('saveModal')?.classList.remove('open');
      return;
    }

    alert('No s\'ha reconegut l\'estructura d\'aquest fitxer.');
  }

  // ============================================================================
  // 8. Teclat Matemàtic Inferior
  // ============================================================================
  function renderKeypadTabs() {
    const tabsWrap = document.getElementById('keypadTabs');
    if (!tabsWrap) return;
    tabsWrap.innerHTML = '';

    window.KeypadConfig.KEYPAD_TABS.forEach(tab => {
      const btn = document.createElement('button');
      btn.className = `kp-tab ${tab.id === state.activeKeypadTab ? 'active' : ''}`;
      btn.textContent = tab.label;
      btn.addEventListener('mousedown', ev => ev.preventDefault());
      btn.addEventListener('click', () => {
        state.activeKeypadTab = tab.id;
        if (state.keypadCollapsed) {
          state.keypadCollapsed = false;
          updatePanelsVisibility();
        }
        renderKeypadTabs();
        renderKeypadBody();
      });
      tabsWrap.appendChild(btn);
    });
  }

  function createKeyButton(item) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `key-btn ${item.className || ''}`;
    if (item.title) btn.title = item.title;
    if (item.span) btn.style.gridColumn = `span ${item.span}`;

    const inner = document.createElement('span');
    inner.className = 'key-latex-inner';
    if (item.labelLatex) {
      inner.innerHTML = renderLatexStatic(item.labelLatex);
    } else {
      inner.textContent = item.labelText || '';
    }
    btn.appendChild(inner);

    btn.addEventListener('mousedown', ev => ev.preventDefault());
    btn.addEventListener('click', () => handleKeyButtonPress(item));
    return btn;
  }

  function fitKeypadButtonLabels() {
    const content = document.getElementById('keypadContent');
    if (!content || state.keypadCollapsed) return;
    content.querySelectorAll('.key-btn').forEach(btn => {
      const inner = btn.querySelector('.key-latex-inner');
      if (!inner) return;
      inner.style.transform = 'none';
      const availW = btn.clientWidth - 10;
      const availH = btn.clientHeight - 6;
      if (availW <= 0 || availH <= 0) return;
      const rect = inner.getBoundingClientRect();
      const natW = Math.max(inner.scrollWidth, inner.offsetWidth, rect.width);
      const natH = Math.max(inner.scrollHeight, inner.offsetHeight, rect.height);
      if (natW > availW || natH > availH) {
        const scale = Math.max(0.44, Math.min(availW / natW, availH / natH) * 0.92);
        inner.style.transform = `scale(${scale.toFixed(3)})`;
      }
    });
  }

  function handleKeyButtonPress(item) {
    if (item.action === 'newApartatBelow') {
      const page = getActivePage();
      const blkId = state.activeBlockId || page.blocks[page.blocks.length - 1]?.id;
      insertNewApartatAfter(blkId, 'math');
      return;
    }

    if (item.action === 'newMathLineInApartat') {
      const page = getActivePage();
      const blkId = state.activeBlockId || page.blocks[page.blocks.length - 1]?.id;
      insertItemInApartat(blkId, state.activeItemId, 'math');
      return;
    }

    if (item.action === 'addTextBlockInApartat') {
      const page = getActivePage();
      const blkId = state.activeBlockId || page.blocks[page.blocks.length - 1]?.id;
      insertItemInApartat(blkId, state.activeItemId, 'text');
      return;
    }

    const mf = getTargetMathfieldForKeypad();
    if (!mf) return;
    mf.focus();

    if (item.action === 'insertInlineText') {
      toggleInlineTextMode(mf);
      return;
    }

    if (item.cmd) {
      mf.executeCommand(item.cmd);
      return;
    }

    if (item.insert) {
      if (mf.mode === 'text' && item.insert.includes('\\')) {
        mf.executeCommand('switchMode', 'math');
        mf.executeCommand('moveToNextChar');
      }
      mf.insert(item.insert, { focus: true, selectionMode: 'placeholder' });
    }
  }

  function renderKeypadBody() {
    const content = document.getElementById('keypadContent');
    if (!content) return;
    content.innerHTML = '';

    const tab = window.KeypadConfig.KEYPAD_TABS.find(t => t.id === state.activeKeypadTab)
      || window.KeypadConfig.KEYPAD_TABS[0];

    if (tab.layout === 'desmos-split') {
      const wrap = document.createElement('div');
      wrap.className = 'kp-desmos-layout';

      const left = document.createElement('div');
      left.className = 'kp-grid-4';
      tab.leftGrid.forEach(item => left.appendChild(createKeyButton(item)));

      const mid = document.createElement('div');
      mid.className = 'kp-grid-4';
      tab.numpadGrid.forEach(item => mid.appendChild(createKeyButton(item)));

      const right = document.createElement('div');
      right.className = 'kp-grid-4';
      tab.rightGrid.forEach(item => right.appendChild(createKeyButton(item)));

      wrap.appendChild(left);
      wrap.appendChild(mid);
      wrap.appendChild(right);
      content.appendChild(wrap);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'kp-categorized-layout';
      tab.groups.forEach(group => {
        const gEl = document.createElement('div');
        gEl.className = 'kp-group';
        const title = document.createElement('div');
        title.className = 'kp-group-title';
        title.textContent = group.title;
        const grid = document.createElement('div');
        grid.className = 'kp-group-grid';
        grid.style.gridTemplateColumns = `repeat(${group.cols || 4}, 1fr)`;
        group.items.forEach(item => grid.appendChild(createKeyButton(item)));
        gEl.appendChild(title);
        gEl.appendChild(grid);
        wrap.appendChild(gEl);
      });
      content.appendChild(wrap);
    }
    requestAnimationFrame(fitKeypadButtonLabels);
  }

  // ============================================================================
  // 9. Llapis Lliure (persistent a cada pàgina!) + Punter Làser Efímer + Timer
  // ============================================================================
  function initOverlaysAndLaser() {
    const inkCanvas = document.getElementById('annotationCanvas');
    const laserCanvas = document.getElementById('laserCanvas');
    if (!inkCanvas || !laserCanvas) return;

    let drawingInk = false;
    let currentStroke = null;

    const getCoords = (ev, canvas) => {
      const rect = canvas.getBoundingClientRect();
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      return { x: cx - rect.left, y: cy - rect.top };
    };

    // Llapis persistent dins la pàgina actual
    const startInk = (ev) => {
      if (!state.inkActive) return;
      ev.preventDefault();
      const page = getActivePage();
      if (!page) return;
      drawingInk = true;
      const pt = getCoords(ev, inkCanvas);
      currentStroke = { color: state.inkColor, width: 2.8, points: [pt] };
      page.inkStrokes = page.inkStrokes || [];
      page.inkStrokes.push(currentStroke);
      redrawAnnotations();
    };
    const moveInk = (ev) => {
      if (!drawingInk || !currentStroke) return;
      ev.preventDefault();
      currentStroke.points.push(getCoords(ev, inkCanvas));
      redrawAnnotations();
    };
    const endInk = () => {
      if (drawingInk) {
        drawingInk = false;
        currentStroke = null;
        saveState();
      }
    };

    inkCanvas.addEventListener('mousedown', startInk);
    window.addEventListener('mousemove', moveInk);
    window.addEventListener('mouseup', endInk);
    inkCanvas.addEventListener('touchstart', startInk, { passive: false });
    inkCanvas.addEventListener('touchmove', moveInk, { passive: false });
    window.addEventListener('touchend', endInk);

    // Punter Làser vermell que s'esvaeix suaument (ideal per assenyalar explicant!)
    const pushLaserPt = (ev) => {
      if (!state.laserActive) return;
      const pt = getCoords(ev, laserCanvas);
      state.laserTrail.push({ x: pt.x, y: pt.y, t: performance.now() });
      if (!laserAnimFrame) {
        laserAnimFrame = requestAnimationFrame(renderLaserLoop);
      }
    };
    laserCanvas.addEventListener('mousemove', pushLaserPt);
    laserCanvas.addEventListener('touchmove', (ev) => { ev.preventDefault(); pushLaserPt(ev); }, { passive: false });

    window.addEventListener('resize', () => {
      autoResizeAllTextareas();
      resizeOverlayCanvases();
      fitKeypadButtonLabels();
      if (state.graphOpen) drawGraphCanvas();
    });
  }

  function renderLaserLoop() {
    const laserCanvas = document.getElementById('laserCanvas');
    if (!laserCanvas) { laserAnimFrame = null; return; }
    const ctx = laserCanvas.getContext('2d');
    ctx.clearRect(0, 0, laserCanvas.width, laserCanvas.height);

    const now = performance.now();
    const DURATION = 900; // ms d'estela
    state.laserTrail = state.laserTrail.filter(p => now - p.t < DURATION);

    if (state.laserTrail.length > 1) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < state.laserTrail.length; i++) {
        const p0 = state.laserTrail[i - 1];
        const p1 = state.laserTrail[i];
        const age = (now - p1.t) / DURATION;
        const alpha = Math.max(0, 1 - age);
        ctx.strokeStyle = `rgba(239, 68, 68, ${alpha * 0.85})`;
        ctx.lineWidth = 4.5 * alpha + 1.5;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }

    if (state.laserTrail.length > 0) {
      const head = state.laserTrail[state.laserTrail.length - 1];
      const age = (now - head.t) / DURATION;
      if (age < 0.35) {
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      laserAnimFrame = requestAnimationFrame(renderLaserLoop);
    } else {
      laserAnimFrame = null;
    }
  }

  function resizeOverlayCanvases() {
    const wrap = document.getElementById('canvasWrap');
    const inkCanvas = document.getElementById('annotationCanvas');
    const laserCanvas = document.getElementById('laserCanvas');
    if (!wrap || !inkCanvas || !laserCanvas) return;
    const w = wrap.scrollWidth;
    const h = wrap.scrollHeight;
    if (inkCanvas.width !== w || inkCanvas.height !== h) {
      inkCanvas.width = w;
      inkCanvas.height = h;
      redrawAnnotations();
    }
    if (laserCanvas.width !== w || laserCanvas.height !== h) {
      laserCanvas.width = w;
      laserCanvas.height = h;
    }
  }

  function redrawAnnotations() {
    const inkCanvas = document.getElementById('annotationCanvas');
    const page = getActivePage();
    if (!inkCanvas) return;
    const ctx = inkCanvas.getContext('2d');
    ctx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);

    const strokes = (page && page.inkStrokes) || [];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const st of strokes) {
      if (!st.points || st.points.length === 0) continue;
      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.width || 2.8;
      ctx.beginPath();
      ctx.moveTo(st.points[0].x, st.points[0].y);
      for (let i = 1; i < st.points.length; i++) {
        ctx.lineTo(st.points[i].x, st.points[i].y);
      }
      if (st.points.length === 1) {
        ctx.arc(st.points[0].x, st.points[0].y, 1.5, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
  }

  // Temporitzador de classe
  function formatTimer(sec) {
    const m = Math.floor(Math.abs(sec) / 60);
    const s = Math.abs(sec) % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateTimerUI() {
    const txt = formatTimer(state.timerSeconds);
    const big = document.getElementById('timerDisplayBig');
    const topBtn = document.getElementById('btnTimerToggle');
    const startBtn = document.getElementById('btnTimerStartPause');
    if (big) big.textContent = txt;
    if (topBtn) {
      topBtn.textContent = state.timerRunning ? `⏱️ ${txt}` : '⏱️';
      topBtn.classList.toggle('active', state.timerRunning);
    }
    if (startBtn) startBtn.textContent = state.timerRunning ? '⏸ Pausa' : '▶ Inicia';
  }

  function toggleTimerRun() {
    if (state.timerRunning) {
      clearInterval(state.timerInterval);
      state.timerRunning = false;
      updateTimerUI();
      return;
    }
    state.timerRunning = true;
    state.timerInterval = setInterval(() => {
      if (state.timerMode === 'countdown') {
        if (state.timerSeconds > 0) {
          state.timerSeconds--;
        } else {
          clearInterval(state.timerInterval);
          state.timerRunning = false;
        }
      } else {
        state.timerSeconds++;
      }
      updateTimerUI();
    }, 1000);
    updateTimerUI();
  }

  // ============================================================================
  // 10. Tema, Zoom, Visibilitat de Panells i Vinculació d'Esdeveniments
  // ============================================================================
  function applyThemeAndZoom() {
    document.body.classList.toggle('dark-theme', state.darkMode);
    const themeBtn = document.getElementById('btnThemeToggle');
    if (themeBtn) themeBtn.textContent = state.darkMode ? '☀️' : '🌙';

    const mPx = ZOOM_MATH_SIZES[state.zoomIndex] || 22;
    const tPx = ZOOM_TEXT_SIZES[state.zoomIndex] || 15.5;
    document.documentElement.style.setProperty('--math-font-size', `${mPx}px`);
    document.documentElement.style.setProperty('--text-font-size', `${tPx}px`);

    const pct = Math.round((mPx / ZOOM_MATH_SIZES[DEFAULT_ZOOM_INDEX]) * 100);
    const zoomLbl = document.getElementById('zoomLabel');
    if (zoomLbl) zoomLbl.textContent = `${pct}%`;

    document.getElementById('btnRad')?.classList.toggle('active', state.angleMode === 'RAD');
    document.getElementById('btnDeg')?.classList.toggle('active', state.angleMode === 'DEG');

    document.getElementById('btnScopeApartat')?.classList.toggle('active', state.scoreboardScope === 'apartat');
    document.getElementById('btnScopeSection')?.classList.toggle('active', state.scoreboardScope === 'section');
    document.getElementById('btnScopePage')?.classList.toggle('active', state.scoreboardScope === 'page');

    updatePanelsVisibility();
    requestAnimationFrame(() => {
      autoResizeAllTextareas();
      resizeOverlayCanvases();
    });
  }

  function updatePanelsVisibility() {
    const nbPanel = document.getElementById('notebooksSidebar');
    const nbBtn = document.getElementById('btnToggleNotebooks');
    if (nbPanel && nbBtn) {
      nbPanel.classList.toggle('collapsed', !state.notebooksSidebarOpen);
      nbBtn.classList.toggle('active', state.notebooksSidebarOpen);
    }

    const sbPanel = document.getElementById('scoreboardPanel');
    const sbBtn = document.getElementById('btnToggleScoreboard');
    if (sbPanel && sbBtn) {
      sbPanel.classList.toggle('collapsed', state.scoreboardCollapsed);
      sbBtn.classList.toggle('active', !state.scoreboardCollapsed);
    }

    const dock = document.getElementById('keypadDock');
    const kpBtn = document.getElementById('btnToggleKeypad');
    if (dock && kpBtn) {
      dock.classList.toggle('collapsed', state.keypadCollapsed);
      kpBtn.textContent = state.keypadCollapsed ? '▲ Mostrar teclat' : '▼ Amagar teclat';
    }
  }

  function bindUIEvents() {
    // Panell de Llibretes i Breadcrumb
    const toggleNb = () => {
      state.notebooksSidebarOpen = !state.notebooksSidebarOpen;
      saveState({ contentChanged: false, silentPill: true });
      updatePanelsVisibility();
      requestAnimationFrame(() => { autoResizeAllTextareas(); resizeOverlayCanvases(); });
    };
    document.getElementById('btnToggleNotebooks')?.addEventListener('click', toggleNb);
    document.getElementById('breadcrumbBar')?.addEventListener('click', toggleNb);

    document.getElementById('btnNewNotebook')?.addEventListener('click', createNewNotebook);

    document.getElementById('btnLoadShowcaseTour')?.addEventListener('click', () => {
      // Cerca si ja existeix el Tour o en crea una pàgina nova fresca a la llibreta actual!
      const nb = getActiveNotebook();
      const newShowcasePg = {
        id: uid('page'),
        title: '🌟 Tour Complet (Totes les funcions)',
        updatedAt: Date.now(),
        overrides: {},
        inkStrokes: [],
        blocks: hydrateShowcaseBlocks()
      };
      nb.pages.push(newShowcasePg);
      saveState();
      switchNotebookAndPage(nb.id, newShowcasePg.id);
    });

    // Accions ràpides de creació de blocs a la barra superior
    document.getElementById('btnAddApartatTop')?.addEventListener('click', () => {
      const page = getActivePage();
      const afterId = state.activeBlockId || page.blocks[page.blocks.length - 1]?.id;
      insertNewApartatAfter(afterId, 'math');
    });

    document.getElementById('btnAddTextInApTop')?.addEventListener('click', () => {
      const page = getActivePage();
      const blkId = state.activeBlockId || page.blocks[page.blocks.length - 1]?.id;
      insertItemInApartat(blkId, state.activeItemId, 'text');
    });

    document.getElementById('btnAddSectionTop')?.addEventListener('click', () => {
      const page = getActivePage();
      const afterId = state.activeBlockId || page.blocks[page.blocks.length - 1]?.id;
      insertSectionAfter(afterId);
    });

    document.getElementById('whiteboardTail')?.addEventListener('click', () => {
      const page = getActivePage();
      const lastBlk = page.blocks[page.blocks.length - 1];
      insertNewApartatAfter(lastBlk?.id, 'math');
    });

    // Punter Làser i Llapis Lliure
    const laserBtn = document.getElementById('btnToggleLaser');
    const inkBtn = document.getElementById('btnToggleInk');
    const inkToolbar = document.getElementById('inkToolbar');
    const inkCanvas = document.getElementById('annotationCanvas');
    const laserCanvas = document.getElementById('laserCanvas');

    const syncPointerModes = () => {
      laserBtn?.classList.toggle('laser-active', state.laserActive);
      laserCanvas?.classList.toggle('laser-active', state.laserActive);
      inkBtn?.classList.toggle('active', state.inkActive);
      inkToolbar?.classList.toggle('visible', state.inkActive);
      inkCanvas?.classList.toggle('drawing-active', state.inkActive);
      resizeOverlayCanvases();
    };

    laserBtn?.addEventListener('click', () => {
      state.laserActive = !state.laserActive;
      if (state.laserActive) state.inkActive = false;
      syncPointerModes();
    });

    inkBtn?.addEventListener('click', () => {
      state.inkActive = !state.inkActive;
      if (state.inkActive) state.laserActive = false;
      syncPointerModes();
    });

    document.querySelectorAll('.ink-color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        state.inkColor = dot.dataset.color;
        document.querySelectorAll('.ink-color-dot').forEach(d => d.classList.toggle('active', d === dot));
      });
    });

    document.getElementById('btnInkUndo')?.addEventListener('click', () => {
      const pg = getActivePage();
      if (pg && pg.inkStrokes && pg.inkStrokes.length > 0) {
        pg.inkStrokes.pop();
        saveState();
        redrawAnnotations();
      }
    });

    document.getElementById('btnInkClear')?.addEventListener('click', () => {
      const pg = getActivePage();
      if (pg) {
        pg.inkStrokes = [];
        saveState();
        redrawAnnotations();
      }
    });

    document.getElementById('btnInkDone')?.addEventListener('click', () => {
      state.inkActive = false;
      syncPointerModes();
    });

    // Temporitzador
    const timerPopover = document.getElementById('timerPopover');
    document.getElementById('btnTimerToggle')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      timerPopover?.classList.toggle('open');
      updateTimerUI();
    });
    document.querySelectorAll('[data-timer-sec]').forEach(btn => {
      btn.addEventListener('click', () => {
        clearInterval(state.timerInterval);
        state.timerRunning = false;
        const sec = Number(btn.dataset.timerSec);
        if (sec === 0) {
          state.timerMode = 'stopwatch';
          state.timerSeconds = 0;
        } else {
          state.timerMode = 'countdown';
          state.timerSeconds = sec;
        }
        updateTimerUI();
      });
    });
    document.getElementById('btnTimerStartPause')?.addEventListener('click', toggleTimerRun);
    document.getElementById('btnTimerClose')?.addEventListener('click', () => timerPopover?.classList.remove('open'));

    // Zoom i Tema
    document.getElementById('btnZoomOut')?.addEventListener('click', () => {
      if (state.zoomIndex > 0) { state.zoomIndex--; saveState({ contentChanged: false, silentPill: true }); applyThemeAndZoom(); }
    });
    document.getElementById('btnZoomIn')?.addEventListener('click', () => {
      if (state.zoomIndex < ZOOM_MATH_SIZES.length - 1) { state.zoomIndex++; saveState({ contentChanged: false, silentPill: true }); applyThemeAndZoom(); }
    });
    document.getElementById('btnThemeToggle')?.addEventListener('click', () => {
      state.darkMode = !state.darkMode;
      saveState({ contentChanged: false, silentPill: true });
      applyThemeAndZoom();
    });

    // Scoreboard i Àmbits
    document.getElementById('btnToggleScoreboard')?.addEventListener('click', () => {
      state.scoreboardCollapsed = !state.scoreboardCollapsed;
      saveState({ contentChanged: false, silentPill: true });
      updatePanelsVisibility();
      requestAnimationFrame(() => { autoResizeAllTextareas(); resizeOverlayCanvases(); });
    });

    ['apartat', 'section', 'page'].forEach(sc => {
      const btnId = sc === 'apartat' ? 'btnScopeApartat' : sc === 'section' ? 'btnScopeSection' : 'btnScopePage';
      document.getElementById(btnId)?.addEventListener('click', () => {
        state.scoreboardScope = sc;
        saveState({ contentChanged: false, silentPill: true });
        applyThemeAndZoom();
        runAnalysisNow();
      });
    });

    // Modal de Gràfica
    const graphModal = document.getElementById('graphModal');
    document.getElementById('btnOpenGraphHeader')?.addEventListener('click', openGraphModal);
    document.getElementById('btnCloseGraph')?.addEventListener('click', () => {
      state.graphOpen = false;
      graphModal?.classList.remove('open');
    });
    graphModal?.addEventListener('click', (ev) => {
      if (ev.target === graphModal) {
        state.graphOpen = false;
        graphModal.classList.remove('open');
      }
    });

    // Modal de Desar / Importar Continguts
    const saveModal = document.getElementById('saveModal');
    document.getElementById('btnOpenSaveModal')?.addEventListener('click', () => {
      document.getElementById('saveActiveNbName').textContent = getActiveNotebook()?.title || '';
      document.getElementById('saveActivePgName').textContent = getActivePage()?.title || '';
      saveModal?.classList.add('open');
    });
    document.getElementById('btnCloseSaveModal')?.addEventListener('click', () => saveModal?.classList.remove('open'));
    saveModal?.addEventListener('click', (ev) => {
      if (ev.target === saveModal) saveModal.classList.remove('open');
    });

    document.getElementById('btnExportWorkspace')?.addEventListener('click', exportFullWorkspaceFile);
    document.getElementById('btnExportNotebook')?.addEventListener('click', () => exportNotebookFile(getActiveNotebook()));
    document.getElementById('btnExportPage')?.addEventListener('click', () => exportPageFile(getActivePage()));
    document.getElementById('btnCopyPageLatex')?.addEventListener('click', copyActivePageLatex);
    document.getElementById('btnPrintPdf')?.addEventListener('click', triggerPrintPdf);
    document.getElementById('btnPrintFromModal')?.addEventListener('click', () => {
      saveModal?.classList.remove('open');
      triggerPrintPdf();
    });
    window.addEventListener('beforeprint', preparePrintDocument);

    const fileInput = document.getElementById('importFileInput');
    let pendingImportMode = 'merge';
    document.getElementById('btnImportMerge')?.addEventListener('click', () => {
      pendingImportMode = 'merge';
      fileInput?.click();
    });
    document.getElementById('btnImportReplace')?.addEventListener('click', () => {
      if (confirm('Això substituirà les llibretes actuals pel contingut del fitxer. Vols continuar?')) {
        pendingImportMode = 'replace';
        fileInput?.click();
      }
    });
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          importFromJsonObject(parsed, pendingImportMode);
        } catch (_e) {
          alert('No s\'ha pogut llegir el fitxer JSON.');
        }
        fileInput.value = '';
      };
      reader.readAsText(file);
    });

    // Controls barra teclat inferior
    document.getElementById('btnRad')?.addEventListener('click', () => {
      state.angleMode = 'RAD'; saveState(); applyThemeAndZoom(); runAnalysisNow();
    });
    document.getElementById('btnDeg')?.addEventListener('click', () => {
      state.angleMode = 'DEG'; saveState(); applyThemeAndZoom(); runAnalysisNow();
    });
    document.getElementById('btnUndo')?.addEventListener('mousedown', e => e.preventDefault());
    document.getElementById('btnUndo')?.addEventListener('click', () => {
      const mf = getTargetMathfieldForKeypad();
      if (mf) mf.executeCommand('undo');
    });
    document.getElementById('btnRedo')?.addEventListener('mousedown', e => e.preventDefault());
    document.getElementById('btnRedo')?.addEventListener('click', () => {
      const mf = getTargetMathfieldForKeypad();
      if (mf) mf.executeCommand('redo');
    });
    document.getElementById('btnClearBoard')?.addEventListener('click', () => {
      const pg = getActivePage();
      if (!pg) return;
      if (confirm(`Vols buidar tot el contingut de "${pg.title}" per començar en blanc?`)) {
        pg.blocks = [createEmptyApartat('math')];
        pg.overrides = {};
        pg.inkStrokes = [];
        selectDefaultActiveItem(pg);
        saveState();
        renderBoardBlocks();
        redrawAnnotations();
        requestAnimationFrame(() => focusItemById(state.activeItemId, 'start'));
      }
    });
    document.getElementById('btnToggleKeypad')?.addEventListener('click', () => {
      state.keypadCollapsed = !state.keypadCollapsed;
      saveState({ contentChanged: false, silentPill: true });
      updatePanelsVisibility();
      requestAnimationFrame(() => {
        resizeOverlayCanvases();
        if (!state.keypadCollapsed) fitKeypadButtonLabels();
      });
    });

    // Modal d'Ajuda
    const helpModal = document.getElementById('helpModal');
    document.getElementById('btnHelp')?.addEventListener('click', () => helpModal?.classList.add('open'));
    document.getElementById('btnCloseHelp')?.addEventListener('click', () => helpModal?.classList.remove('open'));
    helpModal?.addEventListener('click', (ev) => {
      if (ev.target === helpModal) helpModal.classList.remove('open');
    });
  }

  // ============================================================================
  // 11. Pont amb Sincronització al Núvol (Google Drive Personal — appDataFolder)
  // ============================================================================
  function stripBlockIds(blocks) {
    return (blocks || []).map((b) => {
      if (b.type === 'section') {
        return { type: 'section', title: b.title || '' };
      }
      return {
        type: 'apartat',
        label: b.label || '',
        accent: b.accent || 'none',
        items: (b.items || []).map(it => ({
          kind: it.kind || 'math',
          latex: it.latex || '',
          text: it.text || ''
        }))
      };
    });
  }

  function isBlankStarterPage(pg) {
    if (!pg) return false;
    if (Array.isArray(pg.inkStrokes) && pg.inkStrokes.length > 0) return false;
    if (!Array.isArray(pg.blocks) || pg.blocks.length !== 1) return false;
    const b = pg.blocks[0];
    if (b.type !== 'apartat' || (b.label || '').trim() !== '') return false;
    if (!Array.isArray(b.items) || b.items.length !== 1) return false;
    const it = b.items[0];
    return !(it.latex || '').trim() && !(it.text || '').trim();
  }

  function isUntouchedStarterWorkspace() {
    const nbs = state.notebooks;
    if (!Array.isArray(nbs) || nbs.length !== 3) return false;
    if (
      nbs[0].title !== '🎓 Guia Completa i Exemples' ||
      nbs[1].title !== '📘 Classes 1r Batxillerat' ||
      nbs[2].title !== '📗 Classes 2n Batxillerat (PAU)'
    ) {
      return false;
    }
    if (!Array.isArray(nbs[0].pages) || nbs[0].pages.length !== 2) return false;
    if (!Array.isArray(nbs[1].pages) || nbs[1].pages.length !== 1) return false;
    if (!Array.isArray(nbs[2].pages) || nbs[2].pages.length !== 1) return false;

    const tourPg = nbs[0].pages[0];
    if (tourPg.title !== '🌟 Tour Complet (Totes les funcions)') return false;
    if (Array.isArray(tourPg.inkStrokes) && tourPg.inkStrokes.length > 0) return false;
    const expectedTour = JSON.stringify(stripBlockIds(window.KeypadConfig.FULL_SHOWCASE_BLOCKS));
    if (JSON.stringify(stripBlockIds(tourPg.blocks)) !== expectedTour) return false;

    if (nbs[0].pages[1].title !== '📝 Pàgina de proves en blanc' || !isBlankStarterPage(nbs[0].pages[1])) return false;
    if (nbs[1].pages[0].title !== 'Classe 1 — Pissarra nova' || !isBlankStarterPage(nbs[1].pages[0])) return false;
    if (nbs[2].pages[0].title !== 'Àlgebra i Anàlisi' || !isBlankStarterPage(nbs[2].pages[0])) return false;
    return true;
  }

  function getNotebooksFingerprint(notebooks) {
    const normalized = (notebooks || []).map(nb => ({
      title: nb.title || '',
      color: nb.color || '',
      pages: (nb.pages || []).map(pg => ({
        title: pg.title || '',
        overrides: pg.overrides || {},
        inkStrokes: pg.inkStrokes || [],
        blocks: stripBlockIds(pg.blocks)
      }))
    }));
    return JSON.stringify(normalized);
  }

  function applyCloudSnapshot(data, mode = 'replace') {
    if (!data || !Array.isArray(data.notebooks) || data.notebooks.length === 0) return false;
    const incoming = deepClone(data.notebooks);

    if (mode === 'merge') {
      const existingFingerprints = new Set(state.notebooks.map(n => getNotebooksFingerprint([n])));
      let addedCount = 0;
      incoming.forEach((nb) => {
        const fp = getNotebooksFingerprint([nb]);
        if (!existingFingerprints.has(fp)) {
          if (state.notebooks.some(existing => existing.id === nb.id)) {
            nb.id = uid('nb');
            (nb.pages || []).forEach((pg) => {
              pg.id = uid('page');
              reassignBlockAndItemIds(pg);
            });
          }
          state.notebooks.push(nb);
          state.expandedNotebookIds.add(nb.id);
          addedCount++;
        }
      });
      saveState({ fromCloud: false, pillMessage: addedCount > 0 ? 'Llibretes combinades ✓' : 'Ja estaven incloses ✓' });
    } else {
      state.notebooks = incoming;
      state.expandedNotebookIds.clear();
      state.notebooks.forEach(n => state.expandedNotebookIds.add(n.id));

      const s = data.settings || {};
      if (s.angleMode) state.angleMode = s.angleMode;
      if (s.scoreboardScope) state.scoreboardScope = s.scoreboardScope;
      if (s.darkMode !== undefined) state.darkMode = Boolean(s.darkMode);
      if (typeof s.zoomIndex === 'number') state.zoomIndex = s.zoomIndex;

      const targetNb = getNotebookById(data.activeNotebookId) || state.notebooks[0];
      state.activeNotebookId = targetNb.id;
      const targetPg = (targetNb.pages || []).find(p => p.id === data.activePageId) || targetNb.pages[0];
      state.activePageId = targetPg ? targetPg.id : null;

      saveState({ fromCloud: true, pillMessage: 'Carregat del Drive ☁️✓' });
    }

    selectDefaultActiveItem(getActivePage());
    applyThemeAndZoom();
    renderNotebooksSidebar();
    renderBoardBlocks();
    redrawAnnotations();
    return true;
  }

  function resetToStarterWorkspace() {
    const nbGuide = createShowcaseNotebook();
    const nb1r = createStarterClassesNotebook();
    const nb2n = createStarter2nBatxNotebook();
    state.notebooks = [nbGuide, nb1r, nb2n];
    state.activeNotebookId = nbGuide.id;
    state.activePageId = nbGuide.pages[0].id;
    state.expandedNotebookIds.clear();
    state.notebooks.forEach(n => state.expandedNotebookIds.add(n.id));
    selectDefaultActiveItem(getActivePage());
    saveState({ fromCloud: true, isInitialSeed: true, pillMessage: 'Dispositiu netejat ✓' });
    renderNotebooksSidebar();
    renderBoardBlocks();
    redrawAnnotations();
  }

  window.PissarraApp = {
    getCloudSnapshot: () => deepClone(buildWorkspacePayload()),
    applyCloudSnapshot,
    resetToStarterWorkspace,
    isUntouchedStarterWorkspace,
    getNotebooksFingerprint: () => getNotebooksFingerprint(state.notebooks),
    computeExternalFingerprint: (nbs) => getNotebooksFingerprint(nbs),
    flashAutosaveIndicator,
    onLocalSave: (fn) => {
      if (typeof fn === 'function') localSaveListeners.push(fn);
    }
  };

  function boot() {
    if (window.MathLive && window.MathLive.MathfieldElement) {
      window.MathLive.MathfieldElement.soundsDirectory = null;
      window.MathLive.MathfieldElement.fontsDirectory = null;
    }

    loadState();
    selectDefaultActiveItem(getActivePage());

    bindUIEvents();
    initOverlaysAndLaser();
    initGraphInteractions();
    applyThemeAndZoom();
    renderNotebooksSidebar();
    renderKeypadTabs();
    renderKeypadBody();
    renderBoardBlocks();
    redrawAnnotations();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        fitKeypadButtonLabels();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
