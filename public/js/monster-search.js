/**
 * monster-search.js — Monster browser and encounter picker
 *
 * Loads /monsters from Firestore once into a local cache, then provides
 * showMonsterSearch(onSelect) which opens a modal with:
 *   - Text search (client-side, instant)
 *   - Role filter pills
 *   - Level min/max inputs
 *   - Results list: name, level badge, EV, role, stamina
 *   - Tap result → count + squad prompt → onSelect(monsterData, count, isSquad)
 *
 * Usage:
 *   await MonsterSearch.init();           // preload cache (optional)
 *   showMonsterSearch((m, n, squad) => {  // open picker
 *     addMonsterToEncounter(m, n, squad);
 *   });
 */

const MonsterSearch = (() => {

  // ── State ──────────────────────────────────────────────────────────────────

  let _cache   = [];     // all monsters from Firestore
  let _loaded  = false;
  let _loading = null;   // promise while in-flight, prevents double-fetches

  // ── Init / cache ───────────────────────────────────────────────────────────

  async function init() {
    if (_loaded) return;
    if (_loading) return _loading;

    _loading = (async () => {
      try {
        const snap = await db.collection('monsters').orderBy('name').get();
        _cache = [];
        snap.forEach(doc => _cache.push({ id: doc.id, ...doc.data() }));
        _loaded = true;
      } catch (e) {
        console.error('MonsterSearch: failed to load monsters', e);
        _cache  = [];
        _loaded = false;
      } finally {
        _loading = null;
      }
    })();

    return _loading;
  }

  // ── Canonical roles for filter pills ──────────────────────────────────────

  const ROLES = ['brute', 'controller', 'defender', 'hexer', 'artillery', 'ambusher', 'leader', 'solo'];

  // ── Filter logic ───────────────────────────────────────────────────────────

  function filterMonsters(query, role, levelMin, levelMax) {
    const q   = query.trim().toLowerCase();
    const min = parseInt(levelMin, 10) || 1;
    const max = parseInt(levelMax, 10) || 10;

    return _cache.filter(m => {
      if (q && !m.name.toLowerCase().includes(q)) return false;
      if (role && m.role !== role) return false;
      if (m.level < min || m.level > max) return false;
      return true;
    });
  }

  // ── Role pill label ────────────────────────────────────────────────────────

  function roleLabel(r) {
    return r.charAt(0).toUpperCase() + r.slice(1);
  }

  // ── Build results HTML ─────────────────────────────────────────────────────

  function buildResultsHTML(monsters) {
    if (monsters.length === 0) {
      return '<p class="ms-empty">No monsters match your filters.</p>';
    }
    return monsters.slice(0, 80).map(m => `
      <button class="ms-result-row" data-monster-id="${m.id}">
        <span class="ms-level-badge">Lv ${m.level}</span>
        <span class="ms-name">${m.name}</span>
        <span class="ms-role-tag">${roleLabel(m.role)}</span>
        <span class="ms-ev">EV ${m.ev}</span>
        <span class="ms-stamina">${m.stamina} HP</span>
        ${m.isMinion ? '<span class="ms-minion-tag">MINION</span>' : ''}
      </button>
    `).join('');
  }

  // ── Main search modal ──────────────────────────────────────────────────────

  async function showMonsterSearch(onSelect) {
    if (!_loaded) {
      showToast('Loading monster data…', 'info');
      await init();
    }

    const initialResults = filterMonsters('', null, 1, 10);

    showModal(`
      <div class="monster-search-modal">
        <h2>Monster Search</h2>

        <div class="ms-search-row">
          <input
            type="text"
            id="ms-text-input"
            class="ms-text-input"
            placeholder="Search by name…"
            autocomplete="off"
          />
          <div class="ms-level-range">
            <label class="ms-range-label">Lv</label>
            <input type="number" id="ms-level-min" class="ms-level-input" value="1" min="1" max="10" />
            <span class="ms-range-sep">–</span>
            <input type="number" id="ms-level-max" class="ms-level-input" value="10" min="1" max="10" />
          </div>
        </div>

        <div class="ms-role-pills" id="ms-role-pills">
          <button class="ms-role-pill active" data-role="">All</button>
          ${ROLES.map(r => `
            <button class="ms-role-pill" data-role="${r}">${roleLabel(r)}</button>
          `).join('')}
        </div>

        <div class="ms-count-row">
          <span class="ms-result-count" id="ms-result-count">${Math.min(initialResults.length, 80)} of ${_cache.length} monsters</span>
        </div>

        <div class="ms-results" id="ms-results">
          ${buildResultsHTML(initialResults)}
        </div>
      </div>
    `);

    // ── Internal state ───────────────────────────────────────────────────────
    let activeRole = null;

    // ── Re-render results ────────────────────────────────────────────────────
    function refreshResults() {
      const query    = document.getElementById('ms-text-input')?.value || '';
      const levelMin = document.getElementById('ms-level-min')?.value  || '1';
      const levelMax = document.getElementById('ms-level-max')?.value  || '10';
      const filtered = filterMonsters(query, activeRole, levelMin, levelMax);

      const resultsEl = document.getElementById('ms-results');
      const countEl   = document.getElementById('ms-result-count');
      if (resultsEl) resultsEl.innerHTML = buildResultsHTML(filtered);
      if (countEl)   countEl.textContent = `${Math.min(filtered.length, 80)} of ${_cache.length} monsters`;

      wireResultRows(onSelect);
    }

    // ── Role pills ───────────────────────────────────────────────────────────
    document.getElementById('ms-role-pills')?.querySelectorAll('.ms-role-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.ms-role-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        activeRole = pill.dataset.role || null;
        refreshResults();
      });
    });

    // ── Text + level inputs ──────────────────────────────────────────────────
    document.getElementById('ms-text-input')?.addEventListener('input', refreshResults);
    document.getElementById('ms-level-min')?.addEventListener('input', refreshResults);
    document.getElementById('ms-level-max')?.addEventListener('input', refreshResults);

    // ── Wire initial result rows ─────────────────────────────────────────────
    wireResultRows(onSelect);
  }

  // ── Wire result row clicks → count/squad prompt ───────────────────────────

  function wireResultRows(onSelect) {
    document.querySelectorAll('.ms-result-row').forEach(row => {
      row.addEventListener('click', () => {
        const monster = _cache.find(m => m.id === row.dataset.monsterId);
        if (!monster) return;
        showCountPrompt(monster, onSelect);
      });
    });
  }

  // ── Count + squad sub-prompt ───────────────────────────────────────────────

  function showCountPrompt(monster, onSelect) {
    const defaultCount = monster.isMinion ? 4 : 1;

    showModal(`
      <div class="ms-count-modal">
        <h2>${monster.name}</h2>
        <div class="ms-count-meta">
          <span class="ms-level-badge">Lv ${monster.level}</span>
          <span class="ms-role-tag">${roleLabel(monster.role)}</span>
          <span class="ms-ev">EV ${monster.ev} each</span>
          <span class="ms-stamina">${monster.stamina} HP</span>
        </div>

        <div class="ms-count-field">
          <label class="ms-count-label">How many?</label>
          <div class="ms-count-controls">
            <button class="ms-count-btn" id="ms-count-minus">−</button>
            <span class="ms-count-value" id="ms-count-value">${defaultCount}</span>
            <button class="ms-count-btn" id="ms-count-plus">+</button>
          </div>
        </div>

        <label class="ms-squad-toggle">
          <input type="checkbox" id="ms-squad-check" ${monster.isMinion ? 'checked' : ''} />
          <span class="ms-squad-label">Squad (pool stamina)</span>
        </label>

        <div class="ms-count-ev-preview" id="ms-count-ev-preview">
          Total EV: ${monster.ev * defaultCount}
        </div>

        <div class="ms-count-actions">
          <button class="btn btn-ghost" id="ms-count-back">← Back</button>
          <button class="btn btn-primary" id="ms-count-confirm">Add to Encounter</button>
        </div>
      </div>
    `);

    let count = defaultCount;

    function updatePreview() {
      const countEl   = document.getElementById('ms-count-value');
      const previewEl = document.getElementById('ms-count-ev-preview');
      if (countEl)   countEl.textContent   = count;
      if (previewEl) previewEl.textContent = `Total EV: ${monster.ev * count}`;
    }

    document.getElementById('ms-count-minus')?.addEventListener('click', () => {
      if (count > 1) { count--; updatePreview(); }
    });
    document.getElementById('ms-count-plus')?.addEventListener('click', () => {
      count++;
      updatePreview();
    });

    document.getElementById('ms-count-back')?.addEventListener('click', () => {
      showMonsterSearch(onSelect);
    });

    document.getElementById('ms-count-confirm')?.addEventListener('click', () => {
      const isSquad = document.getElementById('ms-squad-check')?.checked ?? false;
      hideModal();
      onSelect(monster, count, isSquad);
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return { init, showMonsterSearch };

})();

// ── Expose globally ──────────────────────────────────────────────────────────

window.MonsterSearch      = MonsterSearch;
window.showMonsterSearch  = MonsterSearch.showMonsterSearch;
