/* ═══════════════════════════════════════════════════════════════════════════
   PRINT-READY ABILITY CARDS
   ───────────────────────────────────────────────────────────────────────────
   Home-printable cards for one character's full ability deck. Reads the same
   deck assembleCharacterAbilities() feeds the on-screen sheet, so what you
   print is always what the sheet shows.

   Three axes the player controls from the print preview toolbar:
     • Colour vs Ink-saver — Ink-saver drops all colour and every fill so a
       plain B&W laser prints essentially just text; action type stays legible
       through the activation glyph, the bold label, and a tier rule-weight
       ladder (1px → 2px → 3px double).
     • Tarot (6-up) vs Poker (9-up) — tarot holds long caster tier text;
       poker packs a lean martial deck tighter.
     • Backs on/off — an optional class-tinted back page, column-mirrored for
       duplex ("flip on long edge") so every back lands behind its front.

   The preview is an in-document overlay (not a popup — popups broke on mobile,
   see auth.js), and printing is the browser's own Print → Save as PDF, so it
   works from any phone or laptop at the table with no dependencies. All card
   styling lives in css/print.css; this file only builds DOM + wiring.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // Cards per page, by size.
  const PAGE = {
    tarot: { cols: 3, rows: 2, per: 6 },
    poker: { cols: 3, rows: 3, per: 9 },
  };

  // Action-economy bucket → colour tokens, human label, and MCDM activation
  // glyph (outlined '!' box '(' for actions/maneuvers/free; solid '!' box ')'
  // for triggered). Colours mirror the --econ-* semantic tokens.
  const BUCKET = {
    action:          { key: 'action',    label: 'Action',    glyph: '(' },
    maneuver:        { key: 'maneuver',  label: 'Maneuver',  glyph: '(' },
    triggered:       { key: 'triggered', label: 'Triggered', glyph: ')' },
    'free-triggered':{ key: 'free',      label: 'Free Triggered', glyph: ')' },
    free:            { key: 'free',      label: 'Free',      glyph: '(' },
  };

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Map any type value — the compendium enum or an imported freeform string
  // like "Main Action" / "Free Maneuver" — onto a bucket for colour + glyph.
  function classifyType(type) {
    const t = String(type || '').toLowerCase();
    if (BUCKET[t]) return BUCKET[t];                 // exact enum hit
    if (t.includes('triggered')) return BUCKET.triggered;
    if (t.includes('maneuver'))  return BUCKET.maneuver;
    if (t.includes('free'))      return BUCKET.free;
    return BUCKET.action;
  }

  // A distance string → its MCDM glyph, so the meta strip carries the book's
  // icon. Falls back to the "special" glyph.
  function distanceGlyph(distance) {
    const d = String(distance || '').toLowerCase();
    if (d.includes('melee'))  return 't';
    if (d.includes('ranged')) return 'g';
    if (d.includes('self'))   return 'f';
    if (d.includes('aura') || d.includes('burst')) return 'b';
    if (d.includes('cube') || d.includes('line') || d.includes('wall') || d.includes('area')) return 'e';
    return 'c';
  }

  // Normalise both card shapes (native compendium/virtual/basic vs Forge Steel
  // import) into one structure the renderer understands.
  function normalize(a, char) {
    // Forge Steel imports keep tiers/effect inside a.sections
    if (a.sections) {
      const roll = (a.sections || []).map(s => s.roll).find(Boolean);
      const effect = (a.sections || [])
        .filter(s => s.text).map(s => s.text).join('\n');
      return {
        name: a.name,
        bucket: classifyType(a.type),
        typeLabel: a.type || 'Action',
        cost: a.cost || 0,
        isSignature: !!a.isSignature,
        frequency: a.frequency || null,
        keywords: a.keywords || [],
        distance: a.distance || '',
        target: a.target || '',
        tiers: roll ? [roll.tier1, roll.tier2, roll.tier3] : null,
        effect,
        kit: null,
        flavor: a.flavor || '',
      };
    }

    // Native card. Build the effect block from effect + any spend effects.
    const effectParts = [];
    if (a.effect) effectParts.push(a.effect);
    for (const se of (a.spendEffects || [])) {
      if (se.text) effectParts.push(`${se.label ? se.label + ': ' : ''}${se.text}`);
    }

    // Kit modifier for this character's equipped kit only.
    let kit = null;
    if (a.kitModifiers?.length && char.kit) {
      const km = a.kitModifiers.find(k => k.kitName === char.kit);
      if (km) kit = { label: `${km.kitName} Kit`, text: km.modification };
    }

    const hasTiers = a.tier1 || a.tier2 || a.tier3;
    const bucket = classifyType(a.type);
    return {
      name: a.name,
      bucket,
      typeLabel: bucket.label,
      cost: a.cost || 0,
      isSignature: !!a.isSignature,
      frequency: a.frequency || null,
      keywords: a.keywords || [],
      distance: a.distance || '',
      target: a.target || '',
      tiers: hasTiers ? [a.tier1 || '—', a.tier2 || '—', a.tier3 || '—'] : null,
      effect: effectParts.join('\n'),
      kit,
      flavor: a.flavor || '',
    };
  }

  // Small right-aligned availability tag: SIGNATURE / 1·ENC / 1·TURN.
  function availabilityTag(c) {
    if (c.isSignature) return 'Signature';
    if (c.frequency === 'once-per-encounter') return '1 · Encounter';
    if (c.frequency === 'once-per-turn') return '1 · Turn';
    return '';
  }

  const TIER_RANGES = ['≤11', '12–16', '17+'];

  function renderCard(c) {
    const tag = availabilityTag(c);
    const distText = [c.distance, c.target].filter(Boolean).map(esc).join('  ·  ');
    const dGlyph = c.distance ? distanceGlyph(c.distance) : '';

    const tiersHtml = c.tiers ? `
      <div class="pc-tiers">
        ${c.tiers.map((t, i) => `
          <div class="pc-tier pc-tier-${i + 1}">
            <span class="pc-tier-range">${TIER_RANGES[i]}</span>
            <span class="pc-tier-text">${esc(t)}</span>
          </div>`).join('')}
      </div>` : '';

    // No power roll → the card is effect-driven; lead with the effect block.
    const effectHtml = c.effect ? `
      <div class="pc-effect${c.tiers ? '' : ' pc-effect-lead'}">${esc(c.effect).replace(/\n/g, '<br>')}</div>` : '';

    const kitHtml = c.kit ? `
      <div class="pc-kit">
        <span class="pc-kit-label">${esc(c.kit.label)}</span> ${esc(c.kit.text)}
      </div>` : '';

    const flavorHtml = c.flavor ? `<div class="pc-flavor">${esc(c.flavor)}</div>` : '';

    return `
      <div class="pc-card" data-bucket="${c.bucket.key}">
        <div class="pc-head">
          <div class="pc-activation">
            <span class="pc-glyph" aria-hidden="true">${c.bucket.glyph}</span>
            <span class="pc-type">${esc(c.typeLabel)}</span>
            ${tag ? `<span class="pc-tag">${esc(tag)}</span>` : ''}
          </div>
          <div class="pc-name">${esc(c.name)}</div>
        </div>
        ${distText ? `
        <div class="pc-meta">
          ${dGlyph ? `<span class="pc-glyph pc-meta-glyph" aria-hidden="true">${dGlyph}</span>` : ''}
          <span>${distText}</span>
          ${c.cost ? `<span class="pc-cost">${c.cost} pt</span>` : ''}
        </div>` : (c.cost ? `<div class="pc-meta"><span class="pc-cost">${c.cost} pt</span></div>` : '')}
        <div class="pc-body">
          ${tiersHtml}
          ${effectHtml}
          ${kitHtml}
          ${flavorHtml}
        </div>
      </div>`;
  }

  function renderBack(char, meta) {
    const accent = meta.accent || '#866D4B';
    const initial = (char.class || '?').charAt(0).toUpperCase();
    return `
      <div class="pc-card pc-back" style="--pc-accent:${accent}">
        <div class="pc-back-frame">
          <div class="pc-back-brand">Draw Steel</div>
          <div class="pc-back-sigil"><span>${esc(initial)}</span></div>
          <div class="pc-back-class">${esc(char.class || '')}</div>
          <div class="pc-back-resource">
            <span class="pc-back-rule"></span>
            <span>${esc(meta.resource || 'Resource')}</span>
            <span class="pc-back-rule"></span>
          </div>
          <div class="pc-back-license">DRAW STEEL © MCDM Productions, LLC</div>
        </div>
      </div>`;
  }

  // Reorder a page's cards so each row reads right-to-left — the geometry a
  // duplex "flip on the long edge" produces, so backs seat behind their fronts.
  function mirrorRows(cards, cols) {
    const out = [];
    for (let i = 0; i < cards.length; i += cols) {
      const row = cards.slice(i, i + cols);
      while (row.length < cols) row.push(null); // pad short final row before mirroring
      out.push(...row.reverse());
    }
    return out;
  }

  function cropMarks() {
    return `
      <span class="pc-crop pc-crop-tl"></span>
      <span class="pc-crop pc-crop-tr"></span>
      <span class="pc-crop pc-crop-bl"></span>
      <span class="pc-crop pc-crop-br"></span>`;
  }

  // Build all page DOM for the current options.
  function buildPages(cards, char, meta, opts) {
    const { cols, per } = PAGE[opts.size];
    const pages = [];

    for (let i = 0; i < cards.length; i += per) {
      const chunk = cards.slice(i, i + per);

      // Front page
      pages.push(`
        <div class="pc-page pc-page-${opts.size}">
          ${cropMarks()}
          <div class="pc-grid">${chunk.map(renderCard).join('')}</div>
        </div>`);

      // Matching mirrored back page
      if (opts.backs) {
        const backs = mirrorRows(chunk, cols)
          .map(card => card === null ? '<div class="pc-card pc-card-blank"></div>' : renderBack(char, meta))
          .join('');
        pages.push(`
          <div class="pc-page pc-page-${opts.size} pc-page-back">
            ${cropMarks()}
            <div class="pc-grid">${backs}</div>
          </div>`);
      }
    }
    return pages.join('');
  }

  function buildToolbar(char, opts) {
    return `
      <div class="pc-toolbar">
        <div class="pc-toolbar-title">Print cards — ${esc(char.name || 'Hero')}</div>
        <div class="pc-toolbar-controls">
          <div class="pc-seg" data-group="ink">
            <button class="pc-seg-btn${!opts.mono ? ' active' : ''}" data-ink="color">Colour</button>
            <button class="pc-seg-btn${opts.mono ? ' active' : ''}" data-ink="mono">Ink-saver</button>
          </div>
          <div class="pc-seg" data-group="size">
            <button class="pc-seg-btn${opts.size === 'tarot' ? ' active' : ''}" data-size="tarot">Tarot · 6</button>
            <button class="pc-seg-btn${opts.size === 'poker' ? ' active' : ''}" data-size="poker">Poker · 9</button>
          </div>
          <label class="pc-check">
            <input type="checkbox" id="pc-backs"${opts.backs ? ' checked' : ''}> Backs
          </label>
          <button class="pc-btn pc-btn-print" id="pc-print">Print</button>
          <button class="pc-btn pc-btn-close" id="pc-close" aria-label="Close print preview">Close</button>
        </div>
      </div>`;
  }

  function applyOptionClasses(root, opts) {
    root.classList.toggle('pc-mono', opts.mono);
  }

  window.openPrintCards = async function openPrintCards(char) {
    char = char || (window.AppState && window.AppState.currentCharacter);
    if (!char) return;
    const meta = (window.CLASS_COLORS && window.CLASS_COLORS[char.class])
      || { accent: '#866D4B', resource: 'Resource' };

    // Remove any prior overlay
    document.getElementById('print-root')?.remove();

    const opts = { mono: false, size: 'tarot', backs: false };

    const root = document.createElement('div');
    root.id = 'print-root';
    root.innerHTML = `
      ${buildToolbar(char, opts)}
      <div class="pc-preview"><div class="pc-loading">Assembling deck…</div></div>`;
    document.body.appendChild(root);
    applyOptionClasses(root, opts);

    const preview = root.querySelector('.pc-preview');

    // Resolve the deck (shared with the on-screen sheet).
    let cards;
    try {
      const { abilities } = await window.assembleCharacterAbilities(char);
      cards = abilities.map(a => normalize(a, char));
    } catch (e) {
      console.error('Print: failed to assemble deck', e);
      preview.innerHTML = '<div class="pc-loading">Could not load abilities. Check your connection and try again.</div>';
      return;
    }

    if (!cards.length) {
      preview.innerHTML = '<div class="pc-loading">This hero has no abilities to print yet.</div>';
    }

    function rebuild() {
      preview.innerHTML = buildPages(cards, char, meta, opts);
      applyOptionClasses(root, opts);
    }
    if (cards.length) rebuild();

    // ── Wiring ────────────────────────────────────────────────────────────
    root.querySelector('[data-group="ink"]').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ink]');
      if (!btn) return;
      opts.mono = btn.dataset.ink === 'mono';
      root.querySelectorAll('[data-ink]').forEach(b => b.classList.toggle('active', b === btn));
      rebuild();
    });
    root.querySelector('[data-group="size"]').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-size]');
      if (!btn) return;
      opts.size = btn.dataset.size;
      root.querySelectorAll('[data-size]').forEach(b => b.classList.toggle('active', b === btn));
      rebuild();
    });
    root.querySelector('#pc-backs').addEventListener('change', (e) => {
      opts.backs = e.target.checked;
      rebuild();
    });
    root.querySelector('#pc-print').addEventListener('click', () => window.print());

    function close() {
      root.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    root.querySelector('#pc-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
  };
})();
