/**
 * vault.js — Obsidian vault attachment and markdown generation
 *
 * The app WRITES markdown; it never reads campaign markdown as a source of
 * truth. The one permitted read is read-to-preserve: before overwriting an
 * entity note, the raw bytes after the <!-- ds-app:end --> sentinel are
 * retained verbatim. That is a byte operation, not a parse — state is never
 * derived from it.
 *
 * Layout — one vault directory, one folder per campaign (named by the
 * campaign's app-owned slug), so several campaigns never collide:
 *   <vault>/<Campaign Slug>/Sessions/S07 - 2026-07-18.md
 *   <vault>/<Campaign Slug>/NPCs|Threads|Locations|Factions/<Entity>.md
 *   <vault>/<Campaign Slug>/_Dashboard.md
 *
 * File System Access API is Chromium-only (Chrome/Edge/Opera desktop).
 * Where unsupported, the vault UI is hidden and the same generated markdown
 * is offered as a zip download. Never import.
 *
 * Writes are atomic: createWritable() stages to a swap file and commits on
 * close(), so a crash mid-write never leaves a truncated note.
 */

const Vault = (() => {

  const SENTINEL_START = '<!-- ds-app:generated -->';
  const SENTINEL_END   = '<!-- ds-app:end -->';

  const ENTITY_DIRS = {
    npc:      'NPCs',
    thread:   'Threads',
    location: 'Locations',
    faction:  'Factions',
  };

  // ── Capability ───────────────────────────────────────────────────────────

  function isSupported() {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  // ── Handle persistence (IndexedDB) ───────────────────────────────────────

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('ds-vault', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('handles');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(key, value) {
    const dbx = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = dbx.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbGet(key) {
    const dbx = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx  = dbx.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbDelete(key) {
    const dbx = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = dbx.transaction('handles', 'readwrite');
      tx.objectStore('handles').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ── Attach / detach / permission ─────────────────────────────────────────

  let _dirHandle = null;

  // Requires a user gesture — never call on page load
  async function attach() {
    if (!isSupported()) throw new Error('File System Access API not supported in this browser.');
    _dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'ds-vault' });
    await idbSet('dir', _dirHandle);
    await flushPending();
    return _dirHandle.name;
  }

  async function detach() {
    _dirHandle = null;
    await idbDelete('dir');
  }

  // 'unsupported' | 'detached' | 'needs-permission' | 'attached'
  async function status() {
    if (!isSupported()) return { state: 'unsupported' };
    if (!_dirHandle) _dirHandle = await idbGet('dir');
    if (!_dirHandle) return { state: 'detached' };
    const perm = await _dirHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return { state: 'needs-permission', name: _dirHandle.name };
    return { state: 'attached', name: _dirHandle.name };
  }

  // Requires a user gesture (re-attach button)
  async function requestPermission() {
    if (!_dirHandle) _dirHandle = await idbGet('dir');
    if (!_dirHandle) return false;
    const perm = await _dirHandle.requestPermission({ mode: 'readwrite' });
    if (perm === 'granted') { await flushPending(); return true; }
    return false;
  }

  // ── Writing — always checked, never silent, queued on failure ────────────

  const _pending = [];  // [{path, content}] — replayed when the vault comes back

  function pendingCount() { return _pending.length; }

  async function getDirForPath(relPath, { create } = { create: true }) {
    const parts = relPath.split('/');
    const fileName = parts.pop();
    let dir = _dirHandle;
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create });
    }
    return { dir, fileName };
  }

  async function readRaw(relPath) {
    try {
      const { dir, fileName } = await getDirForPath(relPath, { create: false });
      const fh   = await dir.getFileHandle(fileName, { create: false });
      const file = await fh.getFile();
      return await file.text();
    } catch (_) {
      return null; // new file
    }
  }

  // Permission is checked before every write batch (it can be revoked
  // silently in site settings). On any failure the write is queued and the
  // caller is told, so nothing ever fails silently.
  async function writeNote(relPath, content) {
    const s = await status();
    if (s.state !== 'attached') {
      queueWrite(relPath, content);
      return { written: false, queued: true, reason: s.state };
    }
    try {
      const { dir, fileName } = await getDirForPath(relPath);
      const fh = await dir.getFileHandle(fileName, { create: true });
      const writable = await fh.createWritable(); // staged; commits on close()
      await writable.write(content);
      await writable.close();
      return { written: true };
    } catch (e) {
      console.error('Vault write failed:', relPath, e);
      queueWrite(relPath, content);
      return { written: false, queued: true, reason: 'error' };
    }
  }

  function queueWrite(relPath, content) {
    const existing = _pending.findIndex(p => p.path === relPath);
    if (existing !== -1) _pending[existing] = { path: relPath, content };
    else _pending.push({ path: relPath, content });
    document.dispatchEvent(new CustomEvent('vault-pending-changed', { detail: _pending.length }));
  }

  async function flushPending() {
    if (!_pending.length) return 0;
    const s = await status();
    if (s.state !== 'attached') return 0;
    let flushed = 0;
    const batch = _pending.splice(0, _pending.length);
    for (const p of batch) {
      const r = await writeNote(p.path, p.content);
      if (r.written) flushed++;
    }
    document.dispatchEvent(new CustomEvent('vault-pending-changed', { detail: _pending.length }));
    return flushed;
  }

  // Sentinel-preserving entity write: read raw bytes, keep everything after
  // the end sentinel verbatim, replace only the frontmatter + generated block
  async function writeEntityNoteFile(relPath, generatedHead) {
    const s = await status();
    let existing = null;
    if (s.state === 'attached') existing = await readRaw(relPath);
    const full = mergePreservedTail(generatedHead, existing);
    return writeNote(relPath, full);
  }

  // ── Markdown generation (pure — also exercised by node tests) ────────────

  function slugify(name) {
    // Display-style slug: keeps case and spaces (Obsidian filenames + wikilinks
    // match), strips only filesystem-hostile characters. Fixed at creation —
    // never re-derived from a renamed display name.
    return String(name || '').replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'Unnamed';
  }

  function wikilink(slug) { return `[[${slug}]]`; }

  function yamlList(items) {
    return `[${(items || []).map(i => JSON.stringify(String(i))).join(', ')}]`;
  }

  // Each campaign writes into its OWN folder, named by the campaign's
  // app-owned slug, so several campaigns can share one vault without
  // overwriting each other's session notes and entity files. Falls back to the
  // original flat 'Campaign' folder if a slug is somehow missing.
  function campaignFolder(campaignSlug) {
    const s = campaignSlug == null ? '' : String(campaignSlug).trim();
    return s || 'Campaign';
  }

  function entityPath(entity, campaignSlug) {
    const dir = ENTITY_DIRS[entity.entityType] || 'NPCs';
    return `${campaignFolder(campaignSlug)}/${dir}/${entity.slug}.md`;
  }

  function sessionNotePath(note, campaignSlug) {
    const n = String(note.sessionNumber ?? 0).padStart(2, '0');
    return `${campaignFolder(campaignSlug)}/Sessions/S${n} - ${note.dateStr || 'undated'}.md`;
  }

  function dashboardPath(campaignSlug) {
    return `${campaignFolder(campaignSlug)}/_Dashboard.md`;
  }

  // §7.3 — headings fixed, order fixed, real wikilinks
  function generateSessionNote(note) {
    const s = note.sections || {};
    const fm = [
      '---',
      'type: session',
      `session_number: ${note.sessionNumber ?? 0}`,
      `date: ${note.dateStr || ''}`,
      `party_level: ${note.partyLevel ?? 1}`,
      `victories: ${note.victories ?? 0}`,
      `heroes_present: ${yamlList((note.heroesPresent || []).map(wikilink))}`,
      `npcs_touched: ${yamlList((note.npcsTouched || []).map(wikilink))}`,
      `threads_touched: ${yamlList((note.threadsTouched || []).map(wikilink))}`,
      `locations_visited: ${yamlList((note.locationsVisited || []).map(wikilink))}`,
      `encounters_run: ${yamlList((note.encountersRun || []).map(wikilink))}`,
      '---',
      '',
    ];
    const bullets = arr => (arr || []).map(b => `- ${b}`).join('\n') || '_none_';
    const body = [
      '## What Happened',
      bullets(s.whatHappened),
      '',
      '## Key Decisions',
      (s.keyDecisions || []).map(d => `- **${d.decision}** — ${d.likelyConsequence}`).join('\n') || '_none_',
      '',
      '## NPC Developments',
      bullets(s.npcDevelopments),
      '',
      '## Open Threads',
      bullets(s.openThreads),
      '',
      '## State of Play',
      s.stateOfPlay || '_none_',
      '',
      '## Director Notes',
      bullets(s.directorNotes),
      '',
    ];
    return fm.concat(body).join('\n');
  }

  // §7.4 — frontmatter + generated block ending in the sentinel.
  // The caller appends the preserved tail (mergePreservedTail).
  function generateEntityHead(entity) {
    const fm = ['---', `type: ${entity.entityType}`];
    if (entity.aliases?.length) fm.push(`aliases: ${yamlList(entity.aliases)}`);
    if (entity.status)          fm.push(`status: ${entity.status}`);
    if (entity.disposition)     fm.push(`disposition: ${entity.disposition}`);
    if (entity.urgency)         fm.push(`urgency: ${entity.urgency}`);
    if (entity.firstAppeared != null) fm.push(`first_appeared: ${entity.firstAppeared}`);
    if (entity.lastTouched != null)   fm.push(`last_appeared: ${entity.lastTouched}`);
    fm.push('---', '');

    const gen = [SENTINEL_START, ''];
    gen.push(`# ${entity.name}`);
    if (entity.summary) gen.push('', entity.summary);
    if (entity.locationSlug) gen.push('', `Location: ${wikilink(entity.locationSlug)}`);
    if (entity.appearances?.length) {
      gen.push('', '## Appearances');
      for (const a of entity.appearances) gen.push(`- Session ${a.sessionNumber}: ${wikilink(a.noteSlug)}`);
    }
    if (entity.relatedSlugs?.length) {
      gen.push('', '## Related');
      for (const r of entity.relatedSlugs) gen.push(`- ${wikilink(r)}`);
    }
    gen.push('', SENTINEL_END);
    return fm.join('\n') + gen.join('\n');
  }

  // Byte-preserving merge: everything after the end sentinel in the existing
  // file survives verbatim. Missing sentinel (new file) → full template.
  function mergePreservedTail(generatedHead, existingRaw) {
    const DEFAULT_TAIL = "\n\n## Director's Notes\n\n";
    if (existingRaw == null) return generatedHead + DEFAULT_TAIL;
    const idx = existingRaw.indexOf(SENTINEL_END);
    if (idx === -1) return generatedHead + DEFAULT_TAIL;
    const tail = existingRaw.slice(idx + SENTINEL_END.length);
    return generatedHead + tail;
  }

  // §8.2 — staleness written into the dashboard; last_touched frontmatter
  // makes the same query work in Obsidian via Dataview
  function generateDashboard(opts) {
    const { campaignName, currentSession, threshold, staleThreads, staleNPCs, clockRunning, recentNotes } = opts;
    const lines = [
      '---',
      'type: dashboard',
      `current_session: ${currentSession}`,
      `staleness_threshold: ${threshold}`,
      '---',
      '',
      `# ${campaignName} — Dashboard`,
      '',
      '## Needs Attention',
      '',
      '### Clock-Running Threads',
      (clockRunning || []).map(e => `- ${wikilink(e.slug)} — ${e.summary || ''}`).join('\n') || '_none_',
      '',
      `### Stale Threads (untouched for ${threshold}+ sessions)`,
      (staleThreads || []).map(e => `- ${wikilink(e.slug)} — last touched session ${e.lastTouched ?? '?'}`).join('\n') || '_none_',
      '',
      `### Quiet NPCs (unseen for ${threshold}+ sessions)`,
      (staleNPCs || []).map(e => `- ${wikilink(e.slug)} — last seen session ${e.lastTouched ?? '?'}`).join('\n') || '_none_',
      '',
      '## Recent Sessions',
      (recentNotes || []).map(n => `- ${wikilink(n.slug)}`).join('\n') || '_none_',
      '',
    ];
    return lines.join('\n');
  }

  // ── Zip fallback (store-only, no compression) ────────────────────────────

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function buildZip(files) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;

    const u16 = v => new Uint8Array([v & 0xFF, (v >> 8) & 0xFF]);
    const u32 = v => new Uint8Array([v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF]);

    for (const f of files) {
      const nameBytes = enc.encode(f.path);
      const dataBytes = enc.encode(f.content);
      const crc = crc32(dataBytes);
      const header = [
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(dataBytes.length), u32(dataBytes.length),
        u16(nameBytes.length), u16(0),
      ];
      const headerLen = 30 + nameBytes.length;
      central.push({ nameBytes, dataBytes, crc, offset });
      for (const part of header) chunks.push(part);
      chunks.push(nameBytes, dataBytes);
      offset += headerLen + dataBytes.length;
    }

    const centralStart = offset;
    for (const c of central) {
      const rec = [
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(c.crc), u32(c.dataBytes.length), u32(c.dataBytes.length),
        u16(c.nameBytes.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(c.offset),
      ];
      for (const part of rec) chunks.push(part);
      chunks.push(c.nameBytes);
      offset += 46 + c.nameBytes.length;
    }
    const eocd = [
      u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
      u32(offset - centralStart), u32(centralStart), u16(0),
    ];
    for (const part of eocd) chunks.push(part);

    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) { out.set(c, pos); pos += c.length; }
    return out;
  }

  function downloadZip(files, zipName) {
    const bytes = buildZip(files);
    const blob = new Blob([bytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipName || 'campaign-vault.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  return {
    SENTINEL_START, SENTINEL_END,
    isSupported, attach, detach, status, requestPermission,
    writeNote, writeEntityNoteFile, pendingCount, flushPending,
    slugify, wikilink, campaignFolder, entityPath, sessionNotePath, dashboardPath,
    generateSessionNote, generateEntityHead, mergePreservedTail, generateDashboard,
    buildZip, downloadZip, crc32,
  };
})();

if (typeof window !== 'undefined') window.Vault = Vault;
if (typeof module !== 'undefined' && module.exports) module.exports = Vault;
