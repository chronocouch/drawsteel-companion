/**
 * ds-hero-import.js — Forge Steel .ds-hero parser and projection engine
 *
 * A .ds-hero file is a full class-definition dump, not a character record:
 * every subclass, all ten feature levels, and the entire ability pool ship in
 * every export. The import is a PROJECTION WITH FILTERING, not a field
 * mapping.
 *
 * The scope rule (§9.2.0) is applied before ANY summation — this is the
 * highest-risk part of the importer, and the wrong answers it prevents are
 * believable numbers that only exact-value tests catch:
 *   1. Nothing inside an `options` array applies — only selected content.
 *   2. Subclass content applies only when `selected === true`.
 *   3. featuresByLevel blocks apply only when block.level <= class.level.
 *   4. Features must be reachable from ancestry, culture, career,
 *      complication, class, the selected subclass, selected kits, titles,
 *      or top-level features.
 *
 * Every field is nullable; unknown feature types are carried through as
 * display-only, never dropped and never fatal. Import is always a draft —
 * the review screen shows what was read and what is missing.
 */

const DSHeroImport = (() => {

  // Echelon from level: 1–3 → 1, 4–6 → 2, 7–9 → 3, 10 → 4
  function echelonOf(level) {
    return level >= 10 ? 4 : level >= 7 ? 3 : level >= 4 ? 2 : 1;
  }

  // Base speed is NOT in the export (§9.2.5). The app supplies Draw Steel's
  // per-ancestry base: 5 for most, but a few move faster. Memonek are speed 7.
  const ANCESTRY_BASE_SPEED = { Memonek: 7 };
  function baseSpeed(ancestryName) {
    return ANCESTRY_BASE_SPEED[ancestryName] ?? 5;
  }

  const KNOWN_TYPES = new Set([
    'Ability', 'Text', 'Skill Choice', 'Damage Modifier', 'Characteristic Bonus',
    'Choice', 'Class Ability', 'Perk', 'Bonus', 'Language Choice',
    'Package Content', 'Multiple Features', 'Heroic Resource Gain',
    'Heroic Resource', 'Movement Mode', 'Kit', 'Condition Immunity',
    'Ability Damage', 'Domain Feature', 'Speed', 'Ancestry Feature Choice',
    'Ancestry Choice', 'Save Threshold', 'Proficiency', 'Domain',
  ]);

  // Choice-like features whose selections may be bare choices rather than
  // features (skill/language names as strings)
  function isFeature(x) {
    return x && typeof x === 'object' && typeof x.type === 'string';
  }

  // ── In-scope feature collection ────────────────────────────────────────────

  function collectFeatures(hero) {
    const level = hero.class?.level || 1;
    const out = [];   // { f, source, level } in traversal order (class levels ascending)
    const seen = new Set();

    function visit(raw, source, atLevel) {
      const f = raw?.feature || raw;
      if (!isFeature(f)) return;
      if (seen.has(f)) return;
      seen.add(f);
      out.push({ f, source, level: atLevel });

      // Recurse into SELECTED content and Multiple Features bundles only.
      // data.options is never traversed for stats — rule 1.
      const d = f.data;
      if (!d) return;
      if (Array.isArray(d.features)) {
        for (const sub of d.features) visit(sub, source, atLevel);
      }
      if (Array.isArray(d.selected)) {
        for (const sub of d.selected) {
          if (isFeature(sub?.feature || sub)) visit(sub, source, atLevel);
        }
      }
      // Selected kits: walk each kit's own feature list too
      if (f.type === 'Kit' && Array.isArray(d.selected)) {
        for (const kit of d.selected) {
          for (const kf of kit?.features || []) visit(kf, `kit:${kit.name}`, atLevel);
        }
      }
    }

    function visitLevels(featuresByLevel, source) {
      for (const block of featuresByLevel || []) {
        if ((block.level ?? 1) > level) continue;   // rule 3 — load-bearing
        for (const f of block.features || []) visit(f, source, block.level ?? 1);
      }
    }

    for (const f of hero.ancestry?.features || []) visit(f, 'ancestry', 0);
    // Culture is read from the top-level `culture` path ONLY; ancestry.culture
    // is a byte-identical duplicate and is ignored (rule §9.1.3)
    for (const cf of [hero.culture?.environment, hero.culture?.organization, hero.culture?.upbringing]) {
      if (cf) visit(cf, 'culture', 0);
    }
    for (const f of hero.career?.features || []) visit(f, 'career', 0);
    for (const f of hero.complication?.features || []) visit(f, 'complication', 0);
    for (const f of hero.features || []) visit(f, 'hero', 0);

    visitLevels(hero.class?.featuresByLevel, 'class');
    // Rule 2: only subclasses with selected === true. Never assume how many
    // subclasses exist (Tactician has 3, Elementalist 4).
    for (const sub of (hero.class?.subclasses || []).filter(s => s.selected === true)) {
      visitLevels(sub.featuresByLevel, `subclass:${sub.name}`);
    }
    for (const title of hero.state?.titles || []) {
      for (const f of title?.features || []) visit(f, `title:${title.name}`, 0);
    }
    return out;
  }

  // Resource IDENTITY (name + type) is a class-defining fact, not a level-gated
  // benefit: Forge Steel files the epic resource at featuresByLevel[10], but a
  // level-4 hero still HAS that resource. So resource definitions are collected
  // ignoring the level cap (options/unselected-subclass rules still apply).
  // Gains RESOLUTION stays level-scoped — a level-10 gain must not reach a
  // level-4 character.
  function collectResourceDefs(hero) {
    const out = [];
    const seen = new Set();
    function scan(featuresByLevel) {
      for (const block of featuresByLevel || []) {
        for (const f of block.features || []) {
          if (f?.type === 'Heroic Resource' && f.data && !seen.has(f)) {
            seen.add(f);
            out.push(f);
          }
        }
      }
    }
    scan(hero.class?.featuresByLevel);
    for (const sub of (hero.class?.subclasses || []).filter(s => s.selected === true)) {
      scan(sub.featuresByLevel);
    }
    return out;
  }

  // Class Ability SLOTS are the character's ability loadout — a completeness
  // checklist, enumerated across all levels for the review's gap list (a level-1
  // hero still has five slots to eventually fill: 3/5/7/9/11pt). Distinct from
  // the stat level filter: abilities are only RESOLVED from in-scope slots.
  function collectClassAbilitySlots(hero) {
    const out = [];
    function scan(featuresByLevel) {
      for (const block of featuresByLevel || []) {
        for (const f of block.features || []) {
          if (f?.type === 'Class Ability' && f.data) out.push({ f, level: block.level ?? 1 });
        }
      }
    }
    scan(hero.class?.featuresByLevel);
    for (const sub of (hero.class?.subclasses || []).filter(s => s.selected === true)) {
      scan(sub.featuresByLevel);
    }
    return out;
  }

  // ── Stat math ──────────────────────────────────────────────────────────────

  // §9.2.1 — the two scaling terms are asymmetric ON PURPOSE:
  // valuePerLevel × (level − 1) but valuePerEchelon × echelon.
  // valuePerLevel features carry the level-1 amount in `value`, so their
  // scaling term starts at zero; echelon features carry value 0 and the
  // echelon term supplies the whole bonus from echelon 1.
  function bonusValue(data, level, echelon, characteristics) {
    let v = (data.value || 0)
      + (data.valuePerLevel || 0) * (level - 1)
      + (data.valuePerEchelon || 0) * echelon;
    if (Array.isArray(data.valueCharacteristics) && data.valueCharacteristics.length) {
      const sum = data.valueCharacteristics
        .reduce((s, name) => s + (characteristics[name] ?? 0), 0);
      v += sum * (data.valueCharacteristicMultiplier ?? 1);
    }
    return v;
  }

  // ── Resource gains — later features REPLACE earlier ones via replacesTags ──

  function resolveGains(baseGains, gainFeatures) {
    let gains = (baseGains || []).map(g => ({ tag: g.tag, trigger: g.trigger, value: g.value }));
    for (const gf of gainFeatures) {   // traversal order == level order
      const d = gf.data || {};
      const replaces = new Set(d.replacesTags || []);
      if (replaces.size) gains = gains.filter(g => !replaces.has(g.tag));
      gains.push({ tag: d.tag, trigger: d.trigger, value: d.value });
    }
    return gains;
  }

  // ── Ability projection (embedded card data, self-contained per §9.6) ───────

  function projectAbility(a, origin) {
    if (!a) return null;
    return {
      id: a.id || '', name: a.name || '', origin,
      type: a.type?.usage || a.type || '',
      cost: a.cost === 'signature' ? 0 : (a.cost ?? 0),
      isSignature: a.cost === 'signature',
      keywords: a.keywords || [],
      distance: Array.isArray(a.distance)
        ? a.distance.map(dd => dd?.type || '').filter(Boolean).join(', ')
        : (a.distance || ''),
      target: a.target || '',
      sections: (a.sections || []).map(s => ({
        type: s.type || '',
        text: typeof s.text === 'string' ? s.text : '',
        roll: s.roll ? { characteristic: s.roll.characteristic || [], tier1: s.roll.tier1 || '', tier2: s.roll.tier2 || '', tier3: s.roll.tier3 || '' } : null,
      })),
    };
  }

  // ── Main projection ────────────────────────────────────────────────────────

  function project(hero) {
    // Structural validation only — never strict (§9.7)
    if (!hero || typeof hero !== 'object') throw new Error('Not a Forge Steel export.');
    if (!hero.class || !hero.state || !hero.name) {
      throw new Error('Missing class, state, or name — not a valid .ds-hero file.');
    }

    const level = hero.class.level || 1;
    const echelon = echelonOf(level);
    const gaps = [];
    const unknownTypes = [];
    const collected = collectFeatures(hero);
    const features = collected.map(c => c.f);

    // Characteristics: base assigned array + in-scope Characteristic Bonus.
    // Values can be negative — no falsy checks, no clamping.
    const characteristics = {};
    for (const c of hero.class.characteristics || []) {
      characteristics[c.characteristic] = c.value;
    }
    for (const f of features) {
      if (f.type === 'Characteristic Bonus' && f.data) {
        const k = f.data.characteristic;
        characteristics[k] = (characteristics[k] ?? 0) + (f.data.value || 0);
      }
    }

    // Kits: flat top-level numeric fields, NOT Bonus features. Sum every
    // selected kit — a hero may legitimately benefit from more than one.
    const kitFeatures = features.filter(f => f.type === 'Kit');
    const kits = kitFeatures.flatMap(f => f.data?.selected || []);
    const kitSum = field => kits.reduce((s, k) => s + (k?.[field] || 0), 0);
    for (const f of kitFeatures) {
      if ((f.data?.count ?? 0) > 0 && !(f.data?.selected || []).length) {
        gaps.push(`No kit selected (${f.name || 'Kit'})`);
      }
    }

    // Bonus totals keyed by field — open set, never switch on known names
    const totals = {};
    for (const f of features) {
      if (f.type === 'Bonus' && f.data?.field) {
        totals[f.data.field] = (totals[f.data.field] || 0)
          + bonusValue(f.data, level, echelon, characteristics);
      }
    }
    const total = field => totals[field] || 0;

    const maxStamina = total('Stamina') + kitSum('stamina');
    const recoveries = total('Recoveries') + kitSum('recoveries');

    // Speed: app-supplied base 5 (not in the file) + additive bonuses; a
    // Speed-type feature is an ABSOLUTE override applied after all additive
    // sources — last in scope wins
    let speed = baseSpeed(hero.ancestry?.name) + total('Speed') + kitSum('speed');
    const speedOverrides = features.filter(f => f.type === 'Speed' && f.data?.speed != null);
    if (speedOverrides.length) speed = speedOverrides[speedOverrides.length - 1].data.speed;

    const stability = total('Stability') + kitSum('stability');
    const disengage = 1 + total('Disengage') + kitSum('disengage');

    // Resources: key off data.type, never the name. Two per class, no max.
    // Identity is collected across all levels; gains resolution is in-scope.
    const resourceFeatures = collectResourceDefs(hero);
    const gainFeatures = features.filter(f => f.type === 'Heroic Resource Gain' && f.data);
    const resources = resourceFeatures.map(rf => ({
      name: rf.name || '',
      type: rf.data.type || 'heroic',
      gains: rf.data.type === 'heroic'
        ? resolveGains(rf.data.gains, gainFeatures)
        : (rf.data.gains || []).map(g => ({ tag: g.tag, trigger: g.trigger, value: g.value })),
      current: 0,
    }));

    // Class abilities: ID references resolved against the class pool. Every
    // slot (all levels) is flagged if empty; only in-scope slots are resolved.
    const pool = new Map((hero.class.abilities || []).map(a => [a.id, a]));
    const abilities = [];
    const classLevel = level;
    for (const { f, level: slotLevel } of collectClassAbilitySlots(hero)) {
      const ids = f.data.selectedIDs || [];
      if (!ids.length) { gaps.push(`${f.name || 'Class ability'} not chosen`); continue; }
      if (slotLevel > classLevel) continue;   // selected but not yet unlocked — don't resolve
      for (const id of ids) {
        const a = pool.get(id);
        if (a) abilities.push(projectAbility(a, 'class'));
        else gaps.push(`Ability ${id} not found in class pool`);
      }
    }
    for (const f of features) {
      if (f.type === 'Ability' && f.data?.ability) {
        abilities.push(projectAbility(f.data.ability, f.name || 'feature'));
      }
    }

    // Damage modifiers — immunities/weaknesses that scale with level
    const damageModifiers = [];
    for (const f of features) {
      if (f.type === 'Damage Modifier' && Array.isArray(f.data?.modifiers)) {
        for (const m of f.data.modifiers) {
          damageModifiers.push({
            damageType: m.damageType || '', modifierType: m.type || '',
            value: bonusValue(m, level, echelon, characteristics),
          });
        }
      }
      if (f.type === 'Condition Immunity' && f.data) {
        for (const cond of f.data.conditions || []) {
          damageModifiers.push({ damageType: cond, modifierType: 'Condition Immunity', value: null });
        }
      }
    }

    const movementModes = features
      .filter(f => f.type === 'Movement Mode' && f.data?.mode).map(f => f.data.mode);

    // Skills / languages / perks — selections only; empty means not chosen
    const skills = [];
    const languages = [];
    const perks = [];
    for (const f of features) {
      const sel = f.data?.selected;
      if (f.type === 'Skill Choice') {
        const names = (sel || []).filter(x => typeof x === 'string');
        if (!names.length && (f.data?.count ?? 1) > 0) gaps.push(`Skill not chosen (${f.name || 'Skill Choice'})`);
        skills.push(...names);
      }
      if (f.type === 'Language Choice') {
        languages.push(...(sel || []).filter(x => typeof x === 'string'));
      }
      if (f.type === 'Perk') {
        const chosen = (sel || []).map(x => (x?.feature || x)?.name).filter(Boolean);
        if (!chosen.length) gaps.push(`Perk not chosen (${f.name || 'Perk'})`);
        perks.push(...chosen);
      }
      if (f.type === 'Choice' && Array.isArray(f.data?.options) && !(sel || []).length) {
        gaps.push(`Choice not made (${f.name || 'Choice'})`);
      }
    }

    // Unknown feature types: display-only carry, logged, never fatal (§9.7)
    const displayFeatures = [];
    for (const { f, source } of collected) {
      if (!KNOWN_TYPES.has(f.type)) {
        if (!unknownTypes.includes(f.type)) unknownTypes.push(f.type);
        displayFeatures.push({ name: f.name || '', type: f.type, source,
          description: (f.description || '').slice(0, 500) });
      } else if (['Text', 'Ability Damage', 'Proficiency', 'Save Threshold', 'Package Content'].includes(f.type)) {
        displayFeatures.push({ name: f.name || '', type: f.type, source,
          description: (f.description || '').slice(0, 500),
          data: f.type === 'Ability Damage' || f.type === 'Proficiency' ? f.data ?? null : null });
      }
    }

    // Third-party / homebrew content (§9.6): self-contained by design; mark
    // when the export declares non-core settings or sourcebooks
    const CORE_SETTINGS = new Set(['core', 'orden', '']);
    const sourceUnknown =
      (hero.settingIDs || []).some(s => !CORE_SETTINGS.has(s)) ||
      (hero.sourcebookIDs || []).some(s => !CORE_SETTINGS.has(s));

    // State mapping: Forge Steel tracks damage taken, not current stamina
    const st = hero.state || {};
    const currentStamina = maxStamina - (st.staminaDamage || 0) + (st.staminaTemp || 0);

    if (!hero.career) gaps.push('No career selected');
    if (!hero.culture?.name) gaps.push('No culture selected');

    const heroic = resources.find(r => r.type === 'heroic') || null;
    const epic   = resources.find(r => r.type === 'epic') || null;

    const character = {
      imported: true,
      forgeSteelId: hero.id || null,
      sourceUnknown,
      name: hero.name,
      ancestry: hero.ancestry?.name || '',
      culture: hero.culture?.name || '',
      career: hero.career?.name || '',
      class: hero.class?.name || '',
      subclass: (hero.class?.subclasses || []).find(s => s.selected === true)?.name || '',
      level, echelon,
      characteristics: {
        MGT: characteristics.Might ?? 0,
        AGL: characteristics.Agility ?? 0,
        REA: characteristics.Reason ?? 0,
        INU: characteristics.Intuition ?? 0,
        PRS: characteristics.Presence ?? 0,
      },
      maxHP: maxStamina,
      currentHP: currentStamina,
      recoveries: { current: recoveries - (st.recoveriesUsed || 0), max: recoveries },
      speed, stability, disengage,
      // Draw Steel heroic resources have no maximum — `max` is deprecated,
      // not invented. A list keyed by type replaces the single field.
      resources,
      heroicResource: heroic ? { name: heroic.name, current: 0 } : null,
      epicResource:   epic   ? { name: epic.name,   current: 0 } : null,
      kits: kits.map(k => ({
        name: k.name || '', stamina: k.stamina || 0, speed: k.speed || 0,
        stability: k.stability || 0, disengage: k.disengage || 0,
        armor: k.armor || [], weapon: k.weapon || [],
        meleeDamage: k.meleeDamage || null, rangedDamage: k.rangedDamage || null,
        meleeDistance: k.meleeDistance || 0, rangedDistance: k.rangedDistance || 0,
      })),
      movementModes, damageModifiers,
      importedAbilities: abilities,
      displayFeatures,
      skills, languages, perks,
      conditions: st.conditions || [],
      inventory: (st.inventory || []).map(i => (typeof i === 'string' ? i : i?.name || '')).filter(Boolean),
      victories: st.victories || 0,
      xp: st.xp || 0,
      surges: st.surges || 0,
      heroTokens: st.heroTokens || 0,
      renown: st.renown || 0,
      wealth: st.wealth || 0,
      projectPoints: st.projectPoints || 0,
      notes: st.notes || '',
    };

    return { character, review: { gaps, unknownTypes } };
  }

  return { project, echelonOf, bonusValue, resolveGains, collectFeatures };
})();

if (typeof window !== 'undefined') window.DSHeroImport = DSHeroImport;
if (typeof module !== 'undefined' && module.exports) module.exports = DSHeroImport;
