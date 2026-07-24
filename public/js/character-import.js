/**
 * character-import.js — Forge Steel .ds-hero import UI
 *
 * File picker → projection (ds-hero-import.js) → review screen (what was read,
 * what is missing) → the player commits. Same principle as ingestion §8 stage
 * 4: never write silently. Every field is nullable; an incomplete character
 * still imports and stays usable.
 *
 * Only the PROJECTED record is stored in Firestore (§9.5) — the 123KB+ raw
 * export is optionally retained in Cloud Storage for re-import after a format
 * change. Re-import keys on the export's `id` (forgeSteelId) and updates in
 * place rather than duplicating.
 */

let _pendingImport = null; // { character, review, rawText }

// ── Entry point (wired to the Import button) ─────────────────────────────────

function startForgeSteelImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.ds-hero,application/json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (/\.pdf$/i.test(file.name)) {
      // §9.8 — the PDF export is lossy (no selection state, no IDs)
      showToast('Import the .ds-hero file, not the PDF — re-export from Forge Steel as JSON.', 'danger');
      return;
    }
    try {
      const text = await file.text();
      const hero = JSON.parse(text);
      const { character, review } = DSHeroImport.project(hero);
      _pendingImport = { character, review, rawText: text };
      showImportReview();
    } catch (e) {
      console.error('Import parse failed:', e);
      showToast(e.message || 'Could not read that .ds-hero file.', 'danger');
    }
  });
  input.click();
}

// ── Review screen — shows what was read and what is missing ──────────────────

function showImportReview() {
  const { character: c, review } = _pendingImport;
  const chip = (label, val) => `<div class="imp-stat"><span class="imp-stat-label">${label}</span><span class="imp-stat-val">${val}</span></div>`;
  const ch = c.characteristics;

  showModal(`
    <div class="import-review-modal">
      <h2>Import ${esc(c.name)}</h2>
      <p class="respite-desc">
        ${esc(c.class)}${c.subclass ? ' (' + esc(c.subclass) + ')' : ''} ·
        ${esc(c.ancestry)} · Level ${c.level}
        ${c.sourceUnknown ? '<span class="imp-source-unknown">contains non-core content</span>' : ''}
      </p>

      <div class="imp-stat-grid">
        ${chip('Stamina', `${c.currentHP}/${c.maxHP}`)}
        ${chip('Recoveries', `${c.recoveries.current}/${c.recoveries.max}`)}
        ${chip('Speed', c.speed)}
        ${chip('Stability', c.stability)}
        ${chip('Might', ch.MGT)} ${chip('Agility', ch.AGL)} ${chip('Reason', ch.REA)}
        ${chip('Intuition', ch.INU)} ${chip('Presence', ch.PRS)}
      </div>

      <div class="imp-section">
        <div class="imp-section-title">Resources</div>
        ${c.resources.length
          ? c.resources.map(r => `<div class="imp-line">${esc(r.name)} <span class="imp-dim">(${esc(r.type)})</span></div>`).join('')
          : '<div class="imp-dim">none</div>'}
      </div>

      <div class="imp-section">
        <div class="imp-section-title">Abilities (${c.importedAbilities.length})</div>
        ${c.importedAbilities.length
          ? c.importedAbilities.map(a => `<div class="imp-line">${esc(a.name)}${a.cost ? ` <span class="imp-dim">${a.cost}pt</span>` : (a.isSignature ? ' <span class="imp-dim">signature</span>' : '')}</div>`).join('')
          : '<div class="imp-dim">none selected</div>'}
      </div>

      ${c.kits.length ? `
        <div class="imp-section">
          <div class="imp-section-title">Kits (${c.kits.length})</div>
          ${c.kits.map(k => `<div class="imp-line">${esc(k.name)} <span class="imp-dim">+${k.stamina} stam, +${k.speed} spd, +${k.stability} stab</span></div>`).join('')}
        </div>` : ''}

      ${review.gaps.length ? `
        <div class="imp-section imp-gaps">
          <div class="imp-section-title">⚠ Unfinished (${review.gaps.length})</div>
          ${review.gaps.map(g => `<div class="imp-line">${esc(g)}</div>`).join('')}
          <div class="imp-dim" style="margin-top:6px">You can import now and fill these in later.</div>
        </div>` : ''}

      ${review.unknownTypes.length ? `
        <div class="imp-section">
          <div class="imp-section-title">Non-compendium content carried through</div>
          <div class="imp-dim">${review.unknownTypes.map(esc).join(', ')}</div>
        </div>` : ''}

      <label class="ms-squad-toggle" style="padding:8px 0">
        <input type="checkbox" id="imp-keep-raw" checked />
        <span class="ms-squad-label">Keep the raw file for re-import after a format change</span>
      </label>

      <div class="import-review-footer">
        <button class="btn btn-ghost" id="imp-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="imp-commit-btn">Import Hero</button>
      </div>
    </div>
  `);

  document.getElementById('imp-cancel-btn')?.addEventListener('click', () => { _pendingImport = null; hideModal(); });
  document.getElementById('imp-commit-btn')?.addEventListener('click', commitImport);
}

// ── Commit — projected record to Firestore; optional raw to Cloud Storage ────

async function commitImport() {
  const btn = document.getElementById('imp-commit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }

  const { character, rawText } = _pendingImport;
  const uid = AppState.currentUser.uid;
  const keepRaw = document.getElementById('imp-keep-raw')?.checked ?? true;

  try {
    const charsRef = db.collection('users').doc(uid).collection('characters');

    // Re-import keys on forgeSteelId — update in place, never duplicate (§9.5)
    let existingId = null;
    if (character.forgeSteelId) {
      const dup = await charsRef.where('forgeSteelId', '==', character.forgeSteelId).limit(1).get();
      if (!dup.empty) existingId = dup.docs[0].id;
    }

    const record = {
      ...character,
      importedAt: firebase.firestore.FieldValue.serverTimestamp(),
      // classAccentColor keeps the sheet theming consistent with wizard heroes
      classAccentColor: (CLASS_COLORS[character.class]?.accent) || '#2980B9',
      wizardStep: 11, // imported heroes are complete for sheet purposes
    };

    let characterId;
    if (existingId) {
      await charsRef.doc(existingId).update(record);
      characterId = existingId;
    } else {
      record.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const ref = await charsRef.add(record);
      characterId = ref.id;
    }

    // Optional raw retention — owner-only, best-effort (never blocks the import)
    if (keepRaw) {
      try {
        await firebase.storage()
          .ref(`users/${uid}/heroImports/${characterId}.ds-hero`)
          .putString(rawText, 'raw', { contentType: 'application/json' });
      } catch (e) {
        console.warn('Raw hero file retention failed (import still succeeded):', e);
      }
    }

    _pendingImport = null;
    hideModal();
    showToast(existingId ? `${character.name} updated from Forge Steel.` : `${character.name} imported.`, 'success');
    if (typeof loadCharacterList === 'function') loadCharacterList(uid);
  } catch (e) {
    console.error('Import commit failed:', e);
    showToast('Could not save the imported hero.', 'danger');
    if (btn) { btn.disabled = false; btn.textContent = 'Import Hero'; }
  }
}

// ── Wiring ───────────────────────────────────────────────────────────────────

document.getElementById('import-hero-btn')?.addEventListener('click', startForgeSteelImport);

if (typeof window !== 'undefined') window.startForgeSteelImport = startForgeSteelImport;
