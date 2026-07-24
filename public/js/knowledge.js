/**
 * knowledge.js — Campaign knowledge layer (Director only)
 *
 * Entities (NPCs / threads / locations / factions), session notes, transcript
 * ingestion with review-before-commit, and the staleness dashboard.
 *
 * Two rules override convenience everywhere here:
 *  1. Nothing is written without explicit Director confirmation — ingestion
 *     produces a proposal; every change is individually accept/reject/edit,
 *     and NOTHING touches Firestore or the vault until Commit.
 *  2. Firestore is the source of truth for structured state; markdown is a
 *     write-only projection (see vault.js).
 */

// ── State ────────────────────────────────────────────────────────────────────

const Knowledge = {
  campaign: null,
  entities: [],       // live /campaigns/{id}/entities docs
  notes: [],          // live /campaigns/{id}/sessionNotes docs
  tab: 'entities',
  proposal: null,     // current ingestion proposal (memory only until commit)
  proposalMeta: null, // { noteId, sessionNumber, dateStr, transcriptPath, transcriptBytes }
};

const ENTITY_TYPES = [
  { v: 'npc',      l: 'NPC' },
  { v: 'thread',   l: 'Thread' },
  { v: 'location', l: 'Location' },
  { v: 'faction',  l: 'Faction' },
];

const NPC_STATUSES    = ['alive', 'dead', 'missing', 'hostile', 'ally', 'unknown'];
const THREAD_STATUSES = ['open', 'advanced', 'resolved', 'abandoned', 'dormant'];
const DISPOSITIONS    = ['hostile', 'wary', 'neutral', 'friendly', 'devoted'];
const URGENCIES       = ['background', 'normal', 'pressing', 'clock-running'];

function knCurrentSession() {
  return Knowledge.notes.reduce((m, n) => Math.max(m, n.sessionNumber || 0), 0);
}

function knThreshold() {
  return Knowledge.campaign?.stalenessThreshold ?? 3;
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function knLoadData(campaign) {
  Knowledge.campaign = campaign;
  const base = db.collection('campaigns').doc(campaign.id);
  const [entSnap, noteSnap] = await Promise.all([
    base.collection('entities').get(),
    base.collection('sessionNotes').orderBy('sessionNumber', 'desc').get(),
  ]);
  Knowledge.entities = entSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  Knowledge.notes    = noteSnap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Overlay shell ────────────────────────────────────────────────────────────

async function openKnowledgeScreen() {
  const campaign = AppState.currentCampaign;
  if (!campaign) return;

  document.getElementById('knowledge-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'knowledge-overlay';
  overlay.className = 'encounter-editor-overlay';
  overlay.innerHTML = '<p class="loading-text" style="padding:40px">Loading campaign knowledge…</p>';
  document.getElementById('campaign-screen')?.appendChild(overlay);

  try {
    await knLoadData(campaign);
  } catch (e) {
    console.error('Knowledge load failed:', e);
    overlay.innerHTML = '<p class="panel-empty" style="padding:40px">Could not load knowledge data.</p>';
    return;
  }
  renderKnowledgeScreen();
}

function closeKnowledgeScreen() {
  document.getElementById('knowledge-overlay')?.remove();
}

async function renderKnowledgeScreen() {
  const overlay = document.getElementById('knowledge-overlay');
  if (!overlay) return;
  const vaultStatus = await Vault.status();

  overlay.innerHTML = `
    <div class="enc-editor-header">
      <button class="btn btn-ghost btn-icon" id="kn-back-btn">←</button>
      <span class="enc-editor-title">Campaign Knowledge</span>
      <span class="kn-vault-status" id="kn-vault-status">${knVaultStatusHTML(vaultStatus)}</span>
    </div>

    <nav class="sheet-tabs kn-tabs">
      ${[
        ['entities',  'Entities'],
        ['sessions',  'Sessions'],
        ['ingest',    'Ingest'],
        ['staleness', 'Staleness'],
      ].map(([v, l]) => `
        <button class="tab-btn ${Knowledge.tab === v ? 'active' : ''}" data-kn-tab="${v}">${l}</button>
      `).join('')}
    </nav>

    <div class="kn-body" id="kn-body"></div>
  `;

  document.getElementById('kn-back-btn')?.addEventListener('click', closeKnowledgeScreen);
  overlay.querySelectorAll('[data-kn-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      Knowledge.tab = btn.dataset.knTab;
      renderKnowledgeScreen();
    });
  });
  wireVaultStatusButtons();
  renderKnowledgeTab();
}

// ── Vault status strip ───────────────────────────────────────────────────────

function knVaultStatusHTML(s) {
  const pending = Vault.pendingCount();
  const pendingHTML = pending ? `<span class="kn-vault-pending">${pending} write${pending !== 1 ? 's' : ''} queued</span>` : '';
  if (s.state === 'unsupported') {
    return `<span class="kn-vault-label">Vault: not supported in this browser</span>
      <button class="btn btn-ghost btn-small" id="kn-zip-btn">⬇ Download Zip</button>`;
  }
  if (s.state === 'detached') {
    return `<span class="kn-vault-label">Vault: not attached</span> ${pendingHTML}
      <button class="btn btn-ghost btn-small" id="kn-attach-btn">📁 Attach Vault</button>
      <button class="btn btn-ghost btn-small" id="kn-zip-btn">⬇ Zip</button>`;
  }
  if (s.state === 'needs-permission') {
    return `<span class="kn-vault-label">Vault: ${esc(s.name)} — permission needed</span> ${pendingHTML}
      <button class="btn btn-primary btn-small" id="kn-reattach-btn">Re-attach</button>`;
  }
  return `<span class="kn-vault-label">Vault: ${esc(s.name)} ✓</span> ${pendingHTML}
    <button class="btn btn-ghost btn-small" id="kn-detach-btn">Detach</button>
    <button class="btn btn-ghost btn-small" id="kn-zip-btn">⬇ Zip</button>`;
}

function wireVaultStatusButtons() {
  document.getElementById('kn-attach-btn')?.addEventListener('click', async () => {
    try {
      const name = await Vault.attach();
      showToast(`Vault attached: ${name}`, 'success');
    } catch (e) {
      if (e?.name !== 'AbortError') showToast('Could not attach vault.', 'danger');
    }
    renderKnowledgeScreen();
  });
  document.getElementById('kn-reattach-btn')?.addEventListener('click', async () => {
    const ok = await Vault.requestPermission();
    showToast(ok ? 'Vault permission restored.' : 'Permission denied.', ok ? 'success' : 'danger');
    renderKnowledgeScreen();
  });
  document.getElementById('kn-detach-btn')?.addEventListener('click', async () => {
    await Vault.detach();
    showToast('Vault detached. Writes will be queued.', 'info');
    renderKnowledgeScreen();
  });
  document.getElementById('kn-zip-btn')?.addEventListener('click', () => {
    const files = knGenerateAllMarkdown();
    Vault.downloadZip(files, `${Vault.slugify(Knowledge.campaign?.name || 'campaign')}-vault.zip`);
  });
}

function renderKnowledgeTab() {
  const body = document.getElementById('kn-body');
  if (!body) return;
  if (Knowledge.tab === 'entities')  renderEntitiesTab(body);
  if (Knowledge.tab === 'sessions')  renderSessionsTab(body);
  if (Knowledge.tab === 'ingest')    renderIngestTab(body);
  if (Knowledge.tab === 'staleness') renderStalenessTab(body);
}

// ── Entities tab ─────────────────────────────────────────────────────────────

function entityStatusOptions(type) {
  return type === 'thread' ? THREAD_STATUSES : NPC_STATUSES;
}

function renderEntitiesTab(body) {
  const groups = ENTITY_TYPES.map(t => ({
    ...t,
    items: Knowledge.entities.filter(e => e.entityType === t.v)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
  }));

  body.innerHTML = `
    <div class="kn-toolbar">
      <button class="btn btn-primary btn-small" id="kn-add-entity-btn">+ New Entity</button>
    </div>
    ${groups.map(g => `
      <div class="kn-entity-group">
        <div class="panel-header"><span class="panel-title">${g.l}s (${g.items.length})</span></div>
        ${g.items.length ? g.items.map(e => `
          <div class="kn-entity-row" data-entity-id="${e.id}">
            <span class="kn-entity-name">${esc(e.name)}</span>
            ${e.status ? `<span class="kn-tag kn-tag-${esc(e.status)}">${esc(e.status)}</span>` : ''}
            ${e.urgency === 'clock-running' ? '<span class="kn-tag kn-tag-clock">⏰ clock</span>' : ''}
            <span class="kn-entity-meta">last touched S${e.lastTouched ?? '—'}</span>
          </div>
        `).join('') : '<p class="panel-empty">None yet.</p>'}
      </div>
    `).join('')}
  `;

  document.getElementById('kn-add-entity-btn')?.addEventListener('click', () => showEntityModal(null));
  body.querySelectorAll('.kn-entity-row').forEach(row => {
    row.addEventListener('click', () => {
      const e = Knowledge.entities.find(x => x.id === row.dataset.entityId);
      if (e) showEntityModal(e);
    });
  });
}

function showEntityModal(entity) {
  const isNew = !entity;
  const e = entity || { entityType: 'npc', name: '', aliases: [], status: 'alive', summary: '' };

  showModal(`
    <div class="kn-entity-modal">
      <h2>${isNew ? 'New Entity' : esc(e.name)}</h2>

      <div class="wizard-field">
        <label class="wizard-label">Type</label>
        <select id="kn-e-type" class="hp-damage-type-select" ${isNew ? '' : 'disabled'}>
          ${ENTITY_TYPES.map(t => `<option value="${t.v}" ${e.entityType === t.v ? 'selected' : ''}>${t.l}</option>`).join('')}
        </select>
      </div>

      <div class="wizard-field">
        <label class="wizard-label">Name</label>
        <input type="text" id="kn-e-name" class="wizard-text-input" value="${esc(e.name)}" maxlength="80" />
        ${isNew ? '' : `<span class="kn-slug-note">File: ${esc(e.slug)}.md (fixed at creation)</span>`}
      </div>

      <div class="wizard-field">
        <label class="wizard-label">Aliases (comma-separated — drives transcript resolution)</label>
        <input type="text" id="kn-e-aliases" class="wizard-text-input" value="${esc((e.aliases || []).join(', '))}" />
      </div>

      <div class="wizard-field">
        <label class="wizard-label">Status</label>
        <select id="kn-e-status" class="hp-damage-type-select">
          ${entityStatusOptions(e.entityType).map(s => `<option value="${s}" ${e.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>

      <div class="wizard-field" id="kn-e-disposition-field" style="${e.entityType === 'npc' ? '' : 'display:none'}">
        <label class="wizard-label">Disposition</label>
        <select id="kn-e-disposition" class="hp-damage-type-select">
          <option value="">—</option>
          ${DISPOSITIONS.map(d => `<option value="${d}" ${e.disposition === d ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </div>

      <div class="wizard-field" id="kn-e-urgency-field" style="${e.entityType === 'thread' ? '' : 'display:none'}">
        <label class="wizard-label">Urgency</label>
        <select id="kn-e-urgency" class="hp-damage-type-select">
          <option value="">—</option>
          ${URGENCIES.map(u => `<option value="${u}" ${e.urgency === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select>
      </div>

      <div class="wizard-field">
        <label class="wizard-label">Summary (one line)</label>
        <input type="text" id="kn-e-summary" class="wizard-text-input" value="${esc(e.summary || '')}" maxlength="200" />
      </div>

      <div class="kn-modal-footer">
        ${isNew ? '' : '<button class="btn btn-ghost" id="kn-e-delete-btn" style="color:var(--color-danger)">Delete</button>'}
        <button class="btn btn-ghost" id="kn-e-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="kn-e-save-btn">${isNew ? 'Create' : 'Save'}</button>
      </div>
    </div>
  `);

  document.getElementById('kn-e-type')?.addEventListener('change', ev => {
    const t = ev.target.value;
    document.getElementById('kn-e-disposition-field').style.display = t === 'npc' ? '' : 'none';
    document.getElementById('kn-e-urgency-field').style.display = t === 'thread' ? '' : 'none';
    const statusSel = document.getElementById('kn-e-status');
    statusSel.innerHTML = entityStatusOptions(t).map(s => `<option value="${s}">${s}</option>`).join('');
  });

  document.getElementById('kn-e-cancel-btn')?.addEventListener('click', hideModal);

  document.getElementById('kn-e-delete-btn')?.addEventListener('click', async () => {
    if (!confirm(`Delete ${e.name}? The Firestore record is removed; the vault note is left in place.`)) return;
    await db.collection('campaigns').doc(Knowledge.campaign.id)
      .collection('entities').doc(e.id).delete();
    Knowledge.entities = Knowledge.entities.filter(x => x.id !== e.id);
    hideModal();
    renderKnowledgeTab();
  });

  document.getElementById('kn-e-save-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('kn-e-name')?.value.trim();
    if (!name) { showToast('Name is required.', 'danger'); return; }
    const data = {
      entityType:  document.getElementById('kn-e-type')?.value || 'npc',
      name,
      aliases:     (document.getElementById('kn-e-aliases')?.value || '')
                     .split(',').map(s => s.trim()).filter(Boolean),
      status:      document.getElementById('kn-e-status')?.value || '',
      disposition: document.getElementById('kn-e-disposition')?.value || '',
      urgency:     document.getElementById('kn-e-urgency')?.value || '',
      summary:     document.getElementById('kn-e-summary')?.value.trim() || '',
      updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
    };

    try {
      const base = db.collection('campaigns').doc(Knowledge.campaign.id).collection('entities');
      if (isNew) {
        // Slug is app-owned, derived once at creation, never from renames
        let slug = Vault.slugify(name);
        while (Knowledge.entities.some(x => x.slug === slug)) slug += ' 2';
        data.slug = slug;
        data.firstAppeared = knCurrentSession();
        data.lastTouched = knCurrentSession();
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        const ref = await base.add(data);
        Knowledge.entities.push({ id: ref.id, ...data });
        await knWriteEntityToVault({ id: ref.id, ...data });
      } else {
        await base.doc(e.id).update(data);
        Object.assign(e, data);
        await knWriteEntityToVault(e);
      }
      hideModal();
      renderKnowledgeTab();
    } catch (err) {
      console.error('Entity save failed:', err);
      showToast('Could not save entity.', 'danger');
    }
  });
}

// ── Sessions tab ─────────────────────────────────────────────────────────────

function renderSessionsTab(body) {
  if (!Knowledge.notes.length) {
    body.innerHTML = '<p class="panel-empty" style="padding:24px">No session notes yet. Use the Ingest tab after a session.</p>';
    return;
  }
  body.innerHTML = Knowledge.notes.map(n => `
    <div class="kn-note-card" data-note-id="${n.id}">
      <div class="kn-note-header">
        <span class="kn-note-title">Session ${n.sessionNumber} — ${esc(n.dateStr || '')}</span>
        <span class="kn-tag ${n.writtenToVault ? 'kn-tag-ok' : ''}">${n.writtenToVault ? 'in vault' : 'not in vault'}</span>
        <button class="btn btn-ghost btn-small kn-note-vault-btn" data-note-id="${n.id}">Write to Vault</button>
        ${n.transcriptPath ? `<button class="btn btn-ghost btn-small kn-note-deltx-btn" data-note-id="${n.id}" title="Remove the raw transcript from Cloud Storage; the note stays">🗑 Transcript</button>` : ''}
      </div>
      <div class="kn-note-body">
        ${knNoteSectionsHTML(n.sections || {})}
      </div>
    </div>
  `).join('');

  body.querySelectorAll('.kn-note-vault-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const n = Knowledge.notes.find(x => x.id === btn.dataset.noteId);
      if (n) { await knWriteSessionNoteToVault(n); renderKnowledgeTab(); }
    });
  });
  body.querySelectorAll('.kn-note-deltx-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const n = Knowledge.notes.find(x => x.id === btn.dataset.noteId);
      if (!n?.transcriptPath) return;
      if (!confirm('Delete the raw transcript from Cloud Storage? The session note is kept.')) return;
      try {
        await firebase.storage().ref(n.transcriptPath).delete();
        await db.collection('campaigns').doc(Knowledge.campaign.id)
          .collection('sessionNotes').doc(n.id)
          .update({ transcriptPath: '', transcriptBytes: 0 });
        n.transcriptPath = ''; n.transcriptBytes = 0;
        showToast('Transcript deleted.', 'success');
        renderKnowledgeTab();
      } catch (e) {
        console.error(e);
        showToast('Could not delete transcript.', 'danger');
      }
    });
  });
}

function knNoteSectionsHTML(s) {
  const list = arr => (arr || []).map(b => `<li>${esc(b)}</li>`).join('') || '<li class="kn-dim">none</li>';
  return `
    <div class="kn-note-section"><strong>What Happened</strong><ul>${list(s.whatHappened)}</ul></div>
    <div class="kn-note-section"><strong>Key Decisions</strong><ul>
      ${(s.keyDecisions || []).map(d => `<li>${esc(d.decision)} — <em>${esc(d.likelyConsequence)}</em></li>`).join('') || '<li class="kn-dim">none</li>'}
    </ul></div>
    <div class="kn-note-section"><strong>NPC Developments</strong><ul>${list(s.npcDevelopments)}</ul></div>
    <div class="kn-note-section"><strong>Open Threads</strong><ul>${list(s.openThreads)}</ul></div>
    <div class="kn-note-section"><strong>State of Play</strong><p>${esc(s.stateOfPlay || 'none')}</p></div>
    <div class="kn-note-section"><strong>Director Notes</strong><ul>${list(s.directorNotes)}</ul></div>
  `;
}

// ── Ingest tab — 5 stages, stage 4 (review) is non-negotiable ────────────────

function renderIngestTab(body) {
  if (Knowledge.proposal) { renderReviewUI(body); return; }

  const nextSession = knCurrentSession() + 1;
  const today = new Date().toISOString().slice(0, 10);

  body.innerHTML = `
    <div class="kn-ingest-form">
      <p class="respite-desc">Paste the session transcript (Whisper Memos or similar). The model proposes a
      session note and entity updates; nothing is saved until you review and commit.</p>
      <div class="enc-field-row">
        <div class="enc-field">
          <label class="enc-label">Session #</label>
          <input type="number" id="kn-ingest-session" class="wizard-text-input" value="${nextSession}" min="1" />
        </div>
        <div class="enc-field">
          <label class="enc-label">Date</label>
          <input type="date" id="kn-ingest-date" class="wizard-text-input" value="${today}" />
        </div>
      </div>
      <div class="wizard-field">
        <label class="wizard-label">Transcript</label>
        <textarea id="kn-ingest-transcript" class="campaign-textarea" rows="14"
          placeholder="Paste the raw transcript here…"></textarea>
        <span class="kn-slug-note" id="kn-ingest-size"></span>
      </div>
      <button class="btn btn-primary" id="kn-ingest-go-btn" style="width:100%">Analyze Transcript →</button>
      <div class="kn-ingest-progress hidden" id="kn-ingest-progress"></div>
    </div>
  `;

  const MAX_CHARS = 240000; // ~60k tokens; the server enforces this too
  const txEl = document.getElementById('kn-ingest-transcript');
  txEl?.addEventListener('input', () => {
    const n = txEl.value.length;
    const el = document.getElementById('kn-ingest-size');
    if (el) {
      el.textContent = `~${Math.ceil(n / 4).toLocaleString()} tokens${n > MAX_CHARS ? ' — TOO LONG, trim before analyzing' : ''}`;
      el.style.color = n > MAX_CHARS ? 'var(--color-danger)' : '';
    }
  });

  document.getElementById('kn-ingest-go-btn')?.addEventListener('click', () => runIngestion(MAX_CHARS));
}

async function runIngestion(maxChars) {
  const transcript = document.getElementById('kn-ingest-transcript')?.value || '';
  const sessionNumber = parseInt(document.getElementById('kn-ingest-session')?.value, 10) || knCurrentSession() + 1;
  const dateStr = document.getElementById('kn-ingest-date')?.value || new Date().toISOString().slice(0, 10);

  if (!transcript.trim()) { showToast('Paste a transcript first.', 'danger'); return; }
  if (transcript.length > maxChars) {
    showToast(`Transcript too long (~${Math.ceil(transcript.length / 4).toLocaleString()} tokens; limit ~60k).`, 'danger');
    return;
  }

  const btn = document.getElementById('kn-ingest-go-btn');
  const progress = document.getElementById('kn-ingest-progress');
  const setProgress = (t) => { if (progress) { progress.classList.remove('hidden'); progress.textContent = t; } };
  if (btn) btn.disabled = true;

  try {
    const campaignId = Knowledge.campaign.id;
    const noteId = db.collection('campaigns').doc(campaignId).collection('sessionNotes').doc().id;
    const transcriptPath = `campaigns/${campaignId}/transcripts/${noteId}.txt`;

    setProgress('Uploading transcript to Cloud Storage…');
    await firebase.storage().ref(transcriptPath)
      .putString(transcript, 'raw', { contentType: 'text/plain' });

    setProgress('Analyzing transcript… this can take a minute or two.');
    const callable = firebase.functions().httpsCallable('ingestSessionTranscript', { timeout: 300000 });
    const result = await callable({
      campaignId, noteId, transcriptPath, sessionNumber, sessionDate: dateStr,
      context: {
        entities: Knowledge.entities.map(e => ({
          entityId: e.id, entityType: e.entityType, name: e.name,
          aliases: e.aliases || [], status: e.status, disposition: e.disposition,
          urgency: e.urgency, summary: e.summary,
        })),
        openThreads: Knowledge.entities
          .filter(e => e.entityType === 'thread' && e.status === 'open')
          .map(e => e.name),
        encountersRun: (Knowledge.campaign._encounters || [])
          .filter(enc => enc.status === 'complete')
          .map(enc => ({ name: enc.name, type: enc.type, victoriesAwarded: enc.victoriesAwarded || 0,
                         record: enc.completionRecord || null })),
      },
    });

    if (result.data?.error) {
      showToast(result.data.message || 'Ingestion failed — retry.', 'danger');
      if (btn) btn.disabled = false;
      return;
    }

    Knowledge.proposal = result.data.proposal;
    Knowledge.proposalMeta = {
      noteId, sessionNumber, dateStr, transcriptPath,
      transcriptBytes: new Blob([transcript]).size,
    };
    renderKnowledgeTab();
  } catch (e) {
    console.error('Ingestion failed:', e);
    showToast(e.message || 'Ingestion failed.', 'danger');
    if (btn) btn.disabled = false;
  }
}

// ── Stage 4: Review UI — every change individually accept / reject / edit ────

function renderReviewUI(body) {
  const p = Knowledge.proposal;
  const s = p.sessionNote || {};
  const joinLines = arr => (arr || []).join('\n');

  body.innerHTML = `
    <div class="kn-review">
      <div class="kn-review-banner">
        Reviewing proposal for <strong>Session ${Knowledge.proposalMeta.sessionNumber}</strong>.
        Nothing is saved until you commit. Uncheck anything that's wrong — a bad link is worse than no link.
      </div>

      <div class="kn-review-section">
        <div class="panel-header"><span class="panel-title">Session Note (edit freely)</span></div>
        ${[
          ['whatHappened',    'What Happened (one bullet per line)'],
          ['npcDevelopments', 'NPC Developments'],
          ['openThreads',     'Open Threads'],
          ['directorNotes',   'Director Notes'],
        ].map(([k, label]) => `
          <div class="wizard-field">
            <label class="wizard-label">${label}</label>
            <textarea class="campaign-textarea kn-rv-section" data-section="${k}" rows="4">${esc(joinLines(s[k]))}</textarea>
          </div>
        `).join('')}
        <div class="wizard-field">
          <label class="wizard-label">Key Decisions (decision — consequence, one per line)</label>
          <textarea class="campaign-textarea kn-rv-section" data-section="keyDecisions" rows="3">${esc((s.keyDecisions || []).map(d => `${d.decision} — ${d.likelyConsequence}`).join('\n'))}</textarea>
        </div>
        <div class="wizard-field">
          <label class="wizard-label">State of Play</label>
          <textarea class="campaign-textarea kn-rv-section" data-section="stateOfPlay" rows="3">${esc(s.stateOfPlay || '')}</textarea>
        </div>
      </div>

      <div class="kn-review-section">
        <div class="panel-header"><span class="panel-title">Entity Changes (${(p.entityChanges || []).length})</span></div>
        ${(p.entityChanges || []).map((c, i) => `
          <label class="kn-review-row">
            <input type="checkbox" class="kn-rv-change" data-idx="${i}" checked />
            <span class="kn-review-text">
              <strong>${esc(c.name)}</strong>: ${esc(c.field)} → <strong>${esc(c.proposedValue)}</strong>
              <span class="kn-evidence">“${esc(c.evidence)}”</span>
            </span>
          </label>
        `).join('') || '<p class="panel-empty">No entity changes proposed.</p>'}
      </div>

      <div class="kn-review-section">
        <div class="panel-header"><span class="panel-title">New Entities (${(p.newEntities || []).length})</span></div>
        ${(p.newEntities || []).map((n, i) => `
          <label class="kn-review-row">
            <input type="checkbox" class="kn-rv-new" data-idx="${i}" checked />
            <span class="kn-review-text">
              <strong>${esc(n.name)}</strong> <span class="kn-tag">${esc(n.entityType)}</span>
              ${esc(n.summary)}
              <span class="kn-evidence">“${esc(n.evidence)}”</span>
            </span>
          </label>
        `).join('') || '<p class="panel-empty">No new entities proposed.</p>'}
      </div>

      <div class="kn-review-section">
        <div class="panel-header"><span class="panel-title">Links (${(p.links || []).length})</span></div>
        ${(p.links || []).map((l, i) => `
          <label class="kn-review-row">
            <input type="checkbox" class="kn-rv-link" data-idx="${i}" checked />
            <span class="kn-review-text">
              ${esc(l.fromName)} ↔ ${esc(l.toName)}: ${esc(l.relationship)}
              <span class="kn-evidence">“${esc(l.evidence)}”</span>
            </span>
          </label>
        `).join('') || '<p class="panel-empty">No links proposed.</p>'}
      </div>

      <div class="kn-review-footer">
        <button class="btn btn-ghost" id="kn-rv-discard-btn">Discard Proposal</button>
        <button class="btn btn-primary" id="kn-rv-commit-btn">Commit to Campaign →</button>
      </div>
    </div>
  `;

  document.getElementById('kn-rv-discard-btn')?.addEventListener('click', () => {
    Knowledge.proposal = null;
    Knowledge.proposalMeta = null;
    renderKnowledgeTab();
  });
  document.getElementById('kn-rv-commit-btn')?.addEventListener('click', commitProposal);
}

// ── Stage 5: Commit — Firestore first, then markdown, then writtenToVault ────

async function commitProposal() {
  const btn = document.getElementById('kn-rv-commit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Committing…'; }

  const p = Knowledge.proposal;
  const meta = Knowledge.proposalMeta;
  const campaignId = Knowledge.campaign.id;
  const base = db.collection('campaigns').doc(campaignId);

  try {
    // Gather the Director's edits
    const readLines = k => (document.querySelector(`.kn-rv-section[data-section="${k}"]`)?.value || '')
      .split('\n').map(x => x.trim()).filter(Boolean);
    const sections = {
      whatHappened:    readLines('whatHappened'),
      keyDecisions:    readLines('keyDecisions').map(line => {
        const [decision, ...rest] = line.split('—');
        return { decision: (decision || '').trim(), likelyConsequence: rest.join('—').trim() };
      }),
      npcDevelopments: readLines('npcDevelopments'),
      openThreads:     readLines('openThreads'),
      stateOfPlay:     document.querySelector('.kn-rv-section[data-section="stateOfPlay"]')?.value.trim() || '',
      directorNotes:   readLines('directorNotes'),
    };
    const acceptedChanges = (p.entityChanges || []).filter((_, i) =>
      document.querySelector(`.kn-rv-change[data-idx="${i}"]`)?.checked);
    const acceptedNew = (p.newEntities || []).filter((_, i) =>
      document.querySelector(`.kn-rv-new[data-idx="${i}"]`)?.checked);
    const acceptedLinks = (p.links || []).filter((_, i) =>
      document.querySelector(`.kn-rv-link[data-idx="${i}"]`)?.checked);

    const batch = db.batch();
    const sessionNumber = meta.sessionNumber;
    const touchedIds = new Set();

    // Accepted changes to known entities
    for (const c of acceptedChanges) {
      const ent = Knowledge.entities.find(e => e.id === c.entityId);
      if (!ent) continue;
      const update = { lastTouched: sessionNumber, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
      if (['status', 'disposition', 'urgency', 'summary'].includes(c.field)) update[c.field] = c.proposedValue;
      batch.update(base.collection('entities').doc(ent.id), update);
      Object.assign(ent, update, { lastTouched: sessionNumber });
      touchedIds.add(ent.id);
    }

    // Accepted new entities — slugs assigned here, app-owned forever
    const createdEntities = [];
    for (const n of acceptedNew) {
      let slug = Vault.slugify(n.name);
      while (Knowledge.entities.some(x => x.slug === slug) || createdEntities.some(x => x.slug === slug)) slug += ' 2';
      const ref = base.collection('entities').doc();
      const data = {
        entityType: n.entityType, name: n.name, slug,
        aliases: n.aliases || [], status: n.status || '',
        disposition: '', urgency: '', summary: n.summary || '',
        firstAppeared: sessionNumber, lastTouched: sessionNumber,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      batch.set(ref, data);
      createdEntities.push({ id: ref.id, ...data });
      touchedIds.add(ref.id);
    }
    Knowledge.entities.push(...createdEntities);

    // Accepted links → relatedSlugs on both ends (name-resolved)
    const findByName = name => Knowledge.entities.find(e =>
      e.name === name || (e.aliases || []).includes(name));
    for (const l of acceptedLinks) {
      const a = findByName(l.fromName), b = findByName(l.toName);
      if (!a || !b || a.id === b.id) continue;
      const aRel = Array.from(new Set([...(a.relatedSlugs || []), b.slug]));
      const bRel = Array.from(new Set([...(b.relatedSlugs || []), a.slug]));
      batch.update(base.collection('entities').doc(a.id), { relatedSlugs: aRel, lastTouched: sessionNumber });
      batch.update(base.collection('entities').doc(b.id), { relatedSlugs: bRel, lastTouched: sessionNumber });
      a.relatedSlugs = aRel; b.relatedSlugs = bRel;
      a.lastTouched = sessionNumber; b.lastTouched = sessionNumber;
      touchedIds.add(a.id); touchedIds.add(b.id);
    }

    // The session note document — transcript stays in Storage, not here
    const heroes = Knowledge.campaign.heroes || [];
    const partyLevel = heroes.length
      ? Math.round(heroes.reduce((s2, h) => s2 + (h.level || 1), 0) / heroes.length) : 1;
    const note = {
      sessionNumber,
      dateStr: meta.dateStr,
      date: firebase.firestore.Timestamp.fromDate(new Date(meta.dateStr)),
      partyLevel,
      victories: heroes.length
        ? Math.floor(heroes.reduce((s2, h) => s2 + (h.currentVictories || 0), 0) / heroes.length) : 0,
      heroesPresent: heroes.map(h => h.displayName),
      entitiesTouched: Array.from(touchedIds),
      encountersRun: (Knowledge.campaign._encounters || [])
        .filter(e => e.status === 'complete').map(e => e.name),
      sections,
      transcriptPath: meta.transcriptPath,
      transcriptBytes: meta.transcriptBytes,
      ingestedAt: firebase.firestore.FieldValue.serverTimestamp(),
      writtenToVault: false,
    };
    const noteRef = base.collection('sessionNotes').doc(meta.noteId);
    batch.set(noteRef, note);

    await batch.commit();
    const committedNote = { id: meta.noteId, ...note };
    Knowledge.notes.unshift(committedNote);

    // Markdown after Firestore — queued automatically if the vault is detached
    const noteWrite = await knWriteSessionNoteToVault(committedNote);
    for (const id of touchedIds) {
      const ent = Knowledge.entities.find(e => e.id === id);
      if (ent) await knWriteEntityToVault(ent);
    }
    await knWriteDashboardToVault();

    Knowledge.proposal = null;
    Knowledge.proposalMeta = null;
    Knowledge.tab = 'sessions';
    showToast(noteWrite?.written
      ? 'Session committed and written to vault.'
      : 'Session committed. Vault writes queued (attach the vault to flush).', 'success');
    renderKnowledgeScreen();
  } catch (e) {
    console.error('Commit failed:', e);
    showToast('Commit failed — nothing was partially written to the vault.', 'danger');
    if (btn) { btn.disabled = false; btn.textContent = 'Commit to Campaign →'; }
  }
}

// ── Staleness tab (§8.2) ─────────────────────────────────────────────────────

function knStaleness() {
  const current = knCurrentSession();
  const t = knThreshold();
  const isStale = e => (e.lastTouched ?? 0) <= current - t;
  return {
    current, threshold: t,
    clockRunning: Knowledge.entities.filter(e => e.entityType === 'thread' && e.urgency === 'clock-running'),
    staleThreads: Knowledge.entities.filter(e => e.entityType === 'thread' && e.status === 'open' && isStale(e)),
    staleNPCs:    Knowledge.entities.filter(e => e.entityType === 'npc' && e.status === 'alive' && isStale(e)),
  };
}

function renderStalenessTab(body) {
  const st = knStaleness();
  const row = e => `
    <div class="kn-entity-row" data-entity-id="${e.id}">
      <span class="kn-entity-name">${esc(e.name)}</span>
      <span class="kn-entity-meta">last touched S${e.lastTouched ?? '—'} (current: S${st.current})</span>
    </div>`;

  body.innerHTML = `
    <div class="kn-toolbar">
      <label class="enc-label" style="margin-right:8px">Staleness threshold (sessions)</label>
      <input type="number" id="kn-threshold-input" class="wizard-text-input" style="width:70px"
        value="${st.threshold}" min="1" max="20" />
      <button class="btn btn-ghost btn-small" id="kn-dashboard-btn" style="margin-left:auto">Write _Dashboard.md</button>
    </div>

    <div class="kn-entity-group">
      <div class="panel-header"><span class="panel-title">⏰ Clock-Running Threads (always shown)</span></div>
      ${st.clockRunning.map(row).join('') || '<p class="panel-empty">None.</p>'}
    </div>
    <div class="kn-entity-group">
      <div class="panel-header"><span class="panel-title">Stale Open Threads</span></div>
      ${st.staleThreads.map(row).join('') || '<p class="panel-empty">None — every open thread is fresh.</p>'}
    </div>
    <div class="kn-entity-group">
      <div class="panel-header"><span class="panel-title">Quiet NPCs</span></div>
      ${st.staleNPCs.map(row).join('') || '<p class="panel-empty">None — every living NPC has been seen recently.</p>'}
    </div>
  `;

  document.getElementById('kn-threshold-input')?.addEventListener('change', async (ev) => {
    const v = Math.min(20, Math.max(1, parseInt(ev.target.value, 10) || 3));
    await db.collection('campaigns').doc(Knowledge.campaign.id).update({ stalenessThreshold: v });
    Knowledge.campaign.stalenessThreshold = v;
    renderKnowledgeTab();
  });
  document.getElementById('kn-dashboard-btn')?.addEventListener('click', async () => {
    const r = await knWriteDashboardToVault();
    showToast(r?.written ? '_Dashboard.md written.' : 'Dashboard write queued.', r?.written ? 'success' : 'info');
  });
  body.querySelectorAll('.kn-entity-row').forEach(rowEl => {
    rowEl.addEventListener('click', () => {
      const e = Knowledge.entities.find(x => x.id === rowEl.dataset.entityId);
      if (e) showEntityModal(e);
    });
  });
}

// ── Vault write helpers ──────────────────────────────────────────────────────

function knEntityHead(e) {
  const appearances = Knowledge.notes
    .filter(n => (n.entitiesTouched || []).includes(e.id))
    .sort((a, b) => (a.sessionNumber || 0) - (b.sessionNumber || 0))
    .map(n => ({ sessionNumber: n.sessionNumber, noteSlug: knNoteSlug(n) }));
  return Vault.generateEntityHead({ ...e, appearances, relatedSlugs: e.relatedSlugs || [] });
}

function knNoteSlug(n) {
  return `S${String(n.sessionNumber ?? 0).padStart(2, '0')} - ${n.dateStr || 'undated'}`;
}

async function knWriteEntityToVault(e) {
  return Vault.writeEntityNoteFile(Vault.entityPath(e), knEntityHead(e));
}

async function knWriteSessionNoteToVault(n) {
  const slugsFor = (type, ids) => Knowledge.entities
    .filter(e => e.entityType === type && (ids || []).includes(e.id)).map(e => e.slug);
  const md = Vault.generateSessionNote({
    sessionNumber: n.sessionNumber, dateStr: n.dateStr,
    partyLevel: n.partyLevel, victories: n.victories,
    heroesPresent: n.heroesPresent || [],
    npcsTouched:      slugsFor('npc', n.entitiesTouched),
    threadsTouched:   slugsFor('thread', n.entitiesTouched),
    locationsVisited: slugsFor('location', n.entitiesTouched),
    encountersRun: (n.encountersRun || []).map(name => `ENC - ${Vault.slugify(name)}`),
    sections: n.sections || {},
  });
  const result = await Vault.writeNote(Vault.sessionNotePath({ sessionNumber: n.sessionNumber, dateStr: n.dateStr }), md);
  if (result.written && !n.writtenToVault) {
    await db.collection('campaigns').doc(Knowledge.campaign.id)
      .collection('sessionNotes').doc(n.id).update({ writtenToVault: true });
    n.writtenToVault = true;
  }
  return result;
}

async function knWriteDashboardToVault() {
  const st = knStaleness();
  const md = Vault.generateDashboard({
    campaignName: Knowledge.campaign?.name || 'Campaign',
    currentSession: st.current,
    threshold: st.threshold,
    staleThreads: st.staleThreads,
    staleNPCs: st.staleNPCs,
    clockRunning: st.clockRunning,
    recentNotes: Knowledge.notes.slice(0, 5).map(n => ({ slug: knNoteSlug(n) })),
  });
  return Vault.writeNote('Campaign/_Dashboard.md', md);
}

// Full-vault snapshot for the zip fallback (Firefox/Safari) — same markdown,
// generated from the current Firestore state
function knGenerateAllMarkdown() {
  const files = [];
  for (const e of Knowledge.entities) {
    files.push({ path: Vault.entityPath(e), content: Vault.mergePreservedTail(knEntityHead(e), null) });
  }
  for (const n of Knowledge.notes) {
    const slugsFor = (type, ids) => Knowledge.entities
      .filter(x => x.entityType === type && (ids || []).includes(x.id)).map(x => x.slug);
    files.push({
      path: Vault.sessionNotePath({ sessionNumber: n.sessionNumber, dateStr: n.dateStr }),
      content: Vault.generateSessionNote({
        sessionNumber: n.sessionNumber, dateStr: n.dateStr,
        partyLevel: n.partyLevel, victories: n.victories,
        heroesPresent: n.heroesPresent || [],
        npcsTouched: slugsFor('npc', n.entitiesTouched),
        threadsTouched: slugsFor('thread', n.entitiesTouched),
        locationsVisited: slugsFor('location', n.entitiesTouched),
        encountersRun: (n.encountersRun || []).map(name => `ENC - ${Vault.slugify(name)}`),
        sections: n.sections || {},
      }),
    });
  }
  const st = knStaleness();
  files.push({
    path: 'Campaign/_Dashboard.md',
    content: Vault.generateDashboard({
      campaignName: Knowledge.campaign?.name || 'Campaign',
      currentSession: st.current, threshold: st.threshold,
      staleThreads: st.staleThreads, staleNPCs: st.staleNPCs,
      clockRunning: st.clockRunning,
      recentNotes: Knowledge.notes.slice(0, 5).map(n => ({ slug: knNoteSlug(n) })),
    }),
  });
  return files;
}

// ── Wiring ───────────────────────────────────────────────────────────────────

document.getElementById('knowledge-btn')?.addEventListener('click', openKnowledgeScreen);

document.addEventListener('vault-pending-changed', async () => {
  const el = document.getElementById('kn-vault-status');
  if (el) el.innerHTML = knVaultStatusHTML(await Vault.status());
  if (el) wireVaultStatusButtons();
});
