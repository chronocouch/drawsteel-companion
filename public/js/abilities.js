/**
 * abilities.js — Ability card viewer + action economy tag system
 *
 * Loads abilities from Firestore, renders cards with full tag state,
 * and handles the USE THIS ABILITY flow.
 */

// ── Card state (per-turn, lives in memory — synced to session if active) ─────
let cardState = {
  hasActed: false,
  hasManeuvered: false,
  hasUsedTriggered: false,
  hasUsedFreeTriggered: false,
  hasUsedFreeStrike: false,
  usedOncePerEncounterAbilities: [],
  usedOncePerTurnAbilities: [],
};

// ── Active type filter (null = show all) ─────────────────────────────────────
let activeTypeFilter = null;

// ── Cached ability map for DOM-patch affordability updates ───────────────────
let _renderedAbilityMap = {}; // id → ability object, populated by renderAbilityCards

// ── Virtual ability helpers ──────────────────────────────────────────────────
//
// Virtual abilities are synthesized from ancestry traits and kit signature
// abilities. They are NOT stored in Firestore — generated fresh each load.
// They carry an `isVirtual: true` flag and a `source: 'ancestry'|'kit'` tag.

// Patterns that indicate a trait desc defines an active action players must
// explicitly take. Passive riders ("once per round, deal extra damage...") do
// NOT match because they lack the colon-definition syntax.
const ACTIVE_TRAIT_PATTERNS = [
  { re: /\bfree triggered action\s*:/i, type: 'free-triggered' },
  { re: /\btriggered action\s*:/i,      type: 'triggered'      },
  { re: /\bmaneuver\s*:/i,              type: 'maneuver'       },
];

function detectTraitActionType(desc) {
  for (const { re, type } of ACTIVE_TRAIT_PATTERNS) {
    if (re.test(desc)) return type;
  }
  return null;
}

/**
 * Returns an array of virtual ability objects derived from the character's
 * ancestry signature trait and purchased traits. Only traits that define an
 * explicit action (detected via colon-syntax keywords) are included.
 */
function getAncestryAbilities(char) {
  if (!char.ancestry) return [];
  const ancestryDef = typeof ANCESTRY_DATA !== 'undefined'
    ? ANCESTRY_DATA.find(a => a.name === char.ancestry)
    : null;
  if (!ancestryDef) return [];

  const results = [];

  // Signature trait — always free, always present if it's an active action
  const sig = ancestryDef.signatureTrait;
  if (sig) {
    const sigType = detectTraitActionType(sig.desc);
    if (sigType) {
      results.push({
        id:          `virtual:ancestry:${char.ancestry}:sig`,
        name:        sig.name,
        class:       char.ancestry,
        type:        sigType,
        cost:        0,
        isSignature: true,
        frequency:   'at-will',
        keywords:    ['Ancestry'],
        distance:    'Special',
        effect:      sig.desc,
        isVirtual:   true,
        source:      'ancestry',
      });
    }
  }

  // Purchased traits
  for (const traitName of (char.ancestryTraits ?? [])) {
    const trait = ancestryDef.traits.find(t => t.name === traitName);
    if (!trait) continue;
    const actionType = detectTraitActionType(trait.desc);
    if (!actionType) continue;
    results.push({
      id:          `virtual:ancestry:${char.ancestry}:${traitName}`,
      name:        trait.name,
      class:       char.ancestry,
      type:        actionType,
      cost:        0,
      isSignature: false,
      frequency:   'at-will',
      keywords:    ['Ancestry'],
      distance:    'Special',
      effect:      trait.desc,
      isVirtual:   true,
      source:      'ancestry',
    });
  }

  return results;
}

/**
 * Returns a virtual ability for the kit signature ability, or null if the kit
 * has none or the kit data is unavailable. Used when no matching Firestore
 * ability was found during character creation.
 */
function getKitVirtualAbility(char) {
  if (!char.kit) return null;
  const kitStats = typeof KIT_STATS !== 'undefined' ? KIT_STATS[char.kit] : null;
  if (!kitStats?.sigAbility) return null;

  // New format: sigAbility is just the name; sigTiers holds tier text.
  // Legacy format had "Name: description" in sigAbility — handle both.
  const colonIdx = kitStats.sigAbility.indexOf(':');
  const name = (colonIdx > -1
    ? kitStats.sigAbility.substring(0, colonIdx)
    : kitStats.sigAbility).trim();
  const desc = kitStats.sigTiers
    ? kitStats.sigTiers
    : (colonIdx > -1 ? kitStats.sigAbility.substring(colonIdx + 1).trim() : kitStats.sigAbility);

  return {
    id:          `virtual:kit:${char.kit}`,
    name,
    class:       char.kit,
    type:        'action',
    cost:        0,
    isSignature: true,
    frequency:   'at-will',
    keywords:    ['Kit', 'Melee'],
    distance:    'Melee 1',
    effect:      desc,
    isVirtual:   true,
    source:      'kit',
  };
}

// ── Basic actions (universal — every hero can take these) ─────────────────────
const BASIC_ACTIONS = [
  {
    id: 'basic-catch-breath',
    name: 'Catch Your Breath',
    type: 'action',
    cost: 0,
    frequency: 'at-will',
    keywords: ['Healing'],
    distance: 'Self',
    effect: 'Spend a Recovery. You regain Stamina equal to your recovery value. You may only use this once per turn.',
    isBasic: true,
  },
  {
    id: 'basic-charge',
    name: 'Charge',
    type: 'action',
    cost: 0,
    frequency: 'at-will',
    keywords: ['Attack', 'Melee'],
    distance: 'Self → Melee 1',
    effect: 'Move up to your speed in a straight line toward a target, then make a free strike against an adjacent creature.',
    isBasic: true,
  },
  {
    id: 'basic-free-strike',
    name: 'Free Strike',
    type: 'action',
    cost: 0,
    frequency: 'at-will',
    keywords: ['Attack'],
    distance: 'Melee 1',
    effect: 'Make a basic melee attack (MGT vs. Might) or ranged attack (AGL vs. Agility). You can use this in place of your main action.',
    isBasic: true,
  },
  {
    id: 'basic-opportunity-strike',
    name: 'Free Strike (Opportunity)',
    type: 'triggered',
    cost: 0,
    frequency: 'at-will',
    keywords: ['Attack'],
    distance: 'Melee 1',
    effect: 'Trigger: An enemy leaves your melee reach. Make a free strike against that enemy. Uses your triggered action.',
    isBasic: true,
  },
  {
    id: 'basic-grab',
    name: 'Grab',
    type: 'action',
    cost: 0,
    frequency: 'at-will',
    keywords: ['Attack', 'Melee'],
    distance: 'Melee 1',
    effect: 'MGT vs. Might. Hit: the target is grabbed — they are slowed and cannot willingly move away from you.',
    isBasic: true,
  },
  {
    id: 'basic-knockback',
    name: 'Knockback',
    type: 'action',
    cost: 0,
    frequency: 'at-will',
    keywords: ['Attack', 'Melee'],
    distance: 'Melee 1',
    effect: 'MGT vs. Might. Hit: push the target 1 square.',
    isBasic: true,
  },
  {
    id: 'basic-aid-attack',
    name: 'Aid Attack',
    type: 'maneuver',
    cost: 0,
    frequency: 'at-will',
    keywords: [],
    distance: 'Melee 1',
    effect: 'Choose an adjacent enemy. The next attack against that enemy before the start of your next turn has an edge.',
    isBasic: true,
  },
  {
    id: 'basic-stand-up',
    name: 'Stand Up',
    type: 'maneuver',
    cost: 0,
    frequency: 'at-will',
    keywords: [],
    distance: 'Self',
    effect: 'Stand up from prone.',
    isBasic: true,
  },
  {
    id: 'basic-hide',
    name: 'Hide',
    type: 'maneuver',
    cost: 0,
    frequency: 'at-will',
    keywords: [],
    distance: 'Self',
    effect: 'Make an Agility test. On success, you are hidden from enemies who have no line of effect to you.',
    isBasic: true,
  },
  {
    id: 'basic-search',
    name: 'Search',
    type: 'maneuver',
    cost: 0,
    frequency: 'at-will',
    keywords: [],
    distance: 'Self',
    effect: 'Make an Intuition test to detect nearby hidden creatures or objects.',
    isBasic: true,
  },
  {
    id: 'basic-end-grab',
    name: 'End Grab',
    type: 'free',
    cost: 0,
    frequency: 'at-will',
    keywords: [],
    distance: 'Self',
    effect: 'Release a creature you are grabbing. No action required.',
    isBasic: true,
  },
];

// ── Load ability cards ────────────────────────────────────────────────────────

async function loadAbilityCards(char) {
  const container = document.getElementById('ability-cards-container');
  container.innerHTML = '<p class="loading-text">Loading abilities...</p>';

  // Forge Steel imports carry self-contained ability definitions (§9.6) — they
  // are not compendium-backed, so render them directly rather than resolving
  // Forge Steel IDs against /abilities.
  if (char.imported && Array.isArray(char.importedAbilities)) {
    renderImportedAbilityCards(char, container);
    return;
  }

  if (!char.class) {
    renderFilterBar(BASIC_ACTIONS);
    renderAbilityCards(BASIC_ACTIONS, char);
    return;
  }

  try {
    const snapshot = await db.collection('abilities')
      .where('class', '==', char.class)
      .get();

    const abilities = [];
    snapshot.forEach(doc => abilities.push({ id: doc.id, ...doc.data() }));

    if (abilities.length === 0) {
      // Show basics with a note that class abilities need seeding
      container.innerHTML = '<p class="empty-text" style="margin-bottom:8px">No class abilities found. Run the seed script.</p>';
    }

    // Hide abilities above the character's current level
    const charLevel = char.level ?? 1;
    const levelFiltered = abilities.filter(a => !a.level || a.level <= charLevel);

    // If the character has selected abilities (via wizard), show only those.
    // Fall back to all level-appropriate abilities for characters created before this feature.
    const selected = char.abilityIds?.length
      ? levelFiltered.filter(a => char.abilityIds.includes(a.id))
      : levelFiltered;

    // Inject virtual ancestry abilities (active traits only)
    const ancestryAbilities = getAncestryAbilities(char);
    for (const v of ancestryAbilities) {
      if (!selected.some(a => a.id === v.id)) selected.push(v);
    }

    // Always inject kit signature ability/abilities as virtual cards built from
    // KIT_STATS — never depend on Firestore for kit sig display. Remove any
    // Firestore ability with the same name first (backward compat with chars
    // that had a real ability ID written by the old A2 lookup).
    function injectKitVirtual(kitName) {
      if (!kitName) return;
      const virtual = getKitVirtualAbility({ ...char, kit: kitName });
      if (!virtual) return;
      const kName = virtual.name.toLowerCase();
      const dupIdx = selected.findIndex(a => !a.isVirtual && a.name?.toLowerCase() === kName);
      if (dupIdx >= 0) selected.splice(dupIdx, 1);
      // Avoid double-injecting if both kits share the same sig name (edge case)
      if (!selected.some(a => a.isVirtual && a.name?.toLowerCase() === kName)) {
        selected.push(virtual);
      }
    }
    injectKitVirtual(char.kit);
    // Tactician Field Arsenal: inject second kit sig if present
    if (char.kit2) injectKitVirtual(char.kit2);

    const toShow = [...selected, ...BASIC_ACTIONS];
    renderFilterBar(toShow);
    renderAbilityCards(toShow, char);
  } catch (e) {
    console.error('Error loading abilities:', e);
    container.innerHTML = '<p class="error-text">Error loading abilities.</p>';
  }
}

// ── Render cards ─────────────────────────────────────────────────────────────

function renderAbilityCards(abilities, char) {
  // Rebuild the cached ability map so updateCardAffordability can do DOM-only patches
  _renderedAbilityMap = {};
  for (const a of abilities) _renderedAbilityMap[a.id] = a;

  // The open card's .card-expanded node currently lives in the detail
  // surface, not in the card. Put it back before innerHTML wipes the grid,
  // otherwise it is orphaned and the surface shows a stale ability.
  closeAbilityDetail();

  const container = document.getElementById('ability-cards-container');
  // Don't clobber an empty-state message that may have been set before this call
  const existingMsg = container.querySelector('.empty-text');
  container.innerHTML = '';
  if (existingMsg) container.appendChild(existingMsg);

  const currentResource = char.heroicResource?.current ?? 0;

  // Apply type filter if active ('anytime' is a combined triggered+free-triggered filter)
  const toRender = !activeTypeFilter ? abilities
    : activeTypeFilter === 'anytime'
      ? abilities.filter(a => a.type === 'triggered' || a.type === 'free-triggered')
      : abilities.filter(a => a.type === activeTypeFilter);

  if (toRender.length === 0 && activeTypeFilter) {
    const msg = document.createElement('p');
    msg.className = 'empty-text';
    msg.textContent = activeTypeFilter === 'anytime'
      ? 'No triggered or free-triggered abilities.'
      : `No ${activeTypeFilter} abilities.`;
    container.appendChild(msg);
    return;
  }

  const sorted = sortAbilities(toRender, currentResource);

  let shownYourTurn = false;
  let shownAnyTime  = false;
  let shownSpent    = false;

  for (const ability of sorted) {
    const group = getSortGroup(ability, currentResource);

    // "YOUR TURN" header — groups 2, 3, 4 (action/maneuver, not yet spent)
    if (!shownYourTurn && (group === 2 || group === 3 || group === 4)) {
      shownYourTurn = true;
      const hdr = document.createElement('div');
      hdr.className = 'ability-section-header';
      hdr.textContent = 'YOUR TURN';
      container.appendChild(hdr);
    }

    // "ANYTIME" header — group 5 (triggered/free-triggered, available)
    if (!shownAnyTime && group === 5) {
      shownAnyTime = true;
      const hdr = document.createElement('div');
      hdr.className = 'ability-section-header ability-section-anytime';
      hdr.textContent = 'ANYTIME';
      container.appendChild(hdr);
    }

    // "SPENT" header — groups 6 and 7 (buckets used)
    if (!shownSpent && (group === 6 || group === 7)) {
      shownSpent = true;
      const hdr = document.createElement('div');
      hdr.className = 'ability-section-header ability-section-spent';
      hdr.textContent = 'SPENT';
      container.appendChild(hdr);
    }

    container.appendChild(buildCard(ability, char, currentResource));
  }
}

// ── Sort order ────────────────────────────────────────────────────────────────
// Groups:
//   1 = Signature/free (always usable)
//   2 = YOUR TURN: action, affordable, bucket free
//   3 = YOUR TURN: maneuver, affordable, bucket free
//   4 = YOUR TURN: unaffordable action/maneuver, bucket free
//   5 = ANY TIME: triggered/free-triggered, bucket free
//   6 = ANY TIME: triggered bucket spent
//   7 = YOUR TURN: action/maneuver bucket spent
//   8 = Encounter-locked

function sortAbilities(abilities, currentResource) {
  return [...abilities].sort((a, b) => {
    const aGroup = getSortGroup(a, currentResource);
    const bGroup = getSortGroup(b, currentResource);
    if (aGroup !== bGroup) return aGroup - bGroup;
    return (a.cost ?? 0) - (b.cost ?? 0);
  });
}

function getSortGroup(ability, currentResource) {
  // Encounter-locked: last
  if (cardState.usedOncePerEncounterAbilities.includes(ability.id)) return 8;
  if (cardState.usedOncePerTurnAbilities.includes(ability.id)) return 7;
  // Bucket-spent
  if (ability.type === 'action' && cardState.hasActed) return 7;
  if (ability.type === 'maneuver' && cardState.hasManeuvered) return 7;
  if (ability.type === 'triggered' && cardState.hasUsedTriggered) return 6;
  if (ability.type === 'free-triggered' && cardState.hasUsedFreeTriggered) return 6;
  // Signature / free
  if (ability.isSignature || ability.type === 'free') return 1;
  const affordable = (ability.cost ?? 0) <= currentResource;
  // ANY TIME abilities (can fire off-turn)
  if (ability.type === 'triggered' || ability.type === 'free-triggered') return 5;
  // YOUR TURN abilities
  if (ability.type === 'action') return affordable ? 2 : 4;
  if (ability.type === 'maneuver') return affordable ? 3 : 4;
  return affordable ? 2 : 4;
}

function isSpent(ability) {
  if (ability.type === 'action' && cardState.hasActed) return true;
  if (ability.type === 'maneuver' && cardState.hasManeuvered) return true;
  if (ability.type === 'triggered' && cardState.hasUsedTriggered) return true;
  if (ability.type === 'free-triggered' && cardState.hasUsedFreeTriggered) return true;
  if (cardState.usedOncePerEncounterAbilities.includes(ability.id)) return true;
  if (cardState.usedOncePerTurnAbilities.includes(ability.id)) return true;
  return false;
}

// ── Build a single card ───────────────────────────────────────────────────────

function buildCard(ability, char, currentResource) {
  const affordable = (ability.cost ?? 0) <= currentResource;
  const spent = isSpent(ability);
  const meta = CLASS_COLORS[char.class] || { accent: '#866D4B' };

  const card = document.createElement('div');
  card.className = `ability-card ${spent ? 'spent' : affordable ? 'affordable' : 'unaffordable'}`;
  card.dataset.abilityId = ability.id;
  card.style.setProperty('--class-accent', meta.accent);

  // Summary text: tier 2 outcome for power-roll abilities, or first sentence of effect
  const hasTiers = ability.tier1 || ability.tier2 || ability.tier3;
  const summaryText = ability.tier2 ||
    (ability.effect ? ability.effect.split(/\.\s+/)[0] + '.' : '—');

  card.innerHTML = `
    <div class="card-header">
      <div class="card-header-left">
        <span class="card-name">${ability.name}</span>
        <span class="card-distance">${ability.distance || ''}</span>
      </div>
      <div class="card-header-right">
        ${buildTypeBadge(ability, spent)}
        ${buildFrequencyBadge(ability)}
        ${buildResourcePips(ability, currentResource, meta.accent)}
      </div>
    </div>
    <div class="card-body">
      <div class="card-summary">${summaryText}</div>
      ${ability.keywords?.length ? `<div class="card-keywords">${ability.keywords.join(' · ')}</div>` : ''}
    </div>
    <div class="card-expanded hidden">

      ${hasTiers ? `
        <div class="card-tiers">
          <div class="tier tier1">
            <span class="tier-label">≤11</span>
            <span class="tier-text">${ability.tier1 || '—'}</span>
          </div>
          <div class="tier tier2">
            <span class="tier-label">12–16</span>
            <span class="tier-text">${ability.tier2 || '—'}</span>
          </div>
          <div class="tier tier3">
            <span class="tier-label">17+</span>
            <span class="tier-text">${ability.tier3 || '—'}</span>
          </div>
        </div>
      ` : ''}

      ${ability.effect ? `
        <div class="card-effect">
          <span class="card-section-label">Effect</span>
          <p class="card-effect-text">${ability.effect}</p>
        </div>
      ` : ''}

      ${ability.spendEffects?.length ? ability.spendEffects.map(se => `
        <div class="card-effect card-spend">
          <span class="card-section-label">${se.label}</span>
          <p class="card-effect-text">${se.text}</p>
        </div>
      `).join('') : ''}

      ${buildKitModifier(ability, char)}

      ${!spent ? `
        <button class="btn btn-use-ability" data-ability-id="${ability.id}">
          Use This Ability
        </button>
      ` : ''}

      ${ability.flavor ? `<p class="card-flavor">${ability.flavor}</p>` : ''}
    </div>
  `;

  // Open in the detail surface (panel on desktop, full-screen on mobile)
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;   // let inner controls act
    toggleAbilityDetail(card, ability);
  });

  // Use ability button
  const useBtn = card.querySelector('.btn-use-ability');
  if (useBtn) {
    useBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      useAbility(ability, char);
    });
  }

  return card;
}

// ── Badge builders ───────────────────────────────────────────────────────────

function buildTypeBadge(ability, spent) {
  const labels = {
    'action': 'ACTION',
    'maneuver': 'MANEUVER',
    'triggered': 'TRIGGERED',
    'free-triggered': 'FREE TRIG.',
    'free': 'FREE',
  };
  const classes = {
    'action': spent && cardState.hasActed ? 'badge-spent' : 'badge-action',
    'maneuver': spent && cardState.hasManeuvered ? 'badge-spent' : 'badge-maneuver',
    'triggered': 'badge-triggered',
    'free-triggered': 'badge-free-triggered',
    'free': 'badge-free',
  };
  const label = spent
    ? `${labels[ability.type] || 'ACTION'} SPENT`
    : labels[ability.type] || 'ACTION';
  return `<span class="badge ${classes[ability.type] || 'badge-action'}">${label}</span>`;
}

function buildFrequencyBadge(ability) {
  // Virtual abilities: show source badge instead of frequency
  if (ability.isVirtual && ability.source === 'ancestry') {
    return ability.isSignature
      ? '<span class="badge badge-signature">SIG</span><span class="badge badge-ancestry">ANCESTRY</span>'
      : '<span class="badge badge-ancestry">ANCESTRY</span>';
  }
  if (ability.isVirtual && ability.source === 'kit') {
    return '<span class="badge badge-signature">SIG</span><span class="badge badge-kit">KIT</span>';
  }
  if (ability.isSignature) return '<span class="badge badge-signature">SIG</span>';
  if (ability.frequency === 'once-per-encounter') {
    const used = cardState.usedOncePerEncounterAbilities.includes(ability.id);
    return `<span class="badge badge-encounter ${used ? 'badge-used' : ''}">1/ENC ${used ? '✓' : ''}</span>`;
  }
  if (ability.frequency === 'once-per-turn') {
    const used = cardState.usedOncePerTurnAbilities.includes(ability.id);
    return `<span class="badge badge-turn ${used ? 'badge-used' : ''}">1/TURN ${used ? '✓' : ''}</span>`;
  }
  return '';
}

function buildResourcePips(ability, currentResource, accentColor) {
  const cost = ability.cost ?? 0;
  if (cost === 0) return '';
  const pips = [];
  for (let i = 1; i <= cost; i++) {
    const filled = i <= currentResource;
    pips.push(`<span class="pip ${filled ? 'pip-filled' : 'pip-empty'}" style="${filled ? `background:${accentColor}` : ''}"></span>`);
  }
  return `<span class="resource-pips">${pips.join('')}</span>`;
}

// ── Kit modifier (filtered to character's equipped kit) ───────────────────────

function buildKitModifier(ability, char) {
  if (!ability.kitModifiers?.length) return '';

  // Show only the modifier for the character's current kit
  const kitMod = char.kit
    ? ability.kitModifiers.find(km => km.kitName === char.kit)
    : null;

  if (kitMod) {
    return `
      <div class="kit-modifiers">
        <p class="kit-mod kit-mod-active">
          <strong>${kitMod.kitName} Kit:</strong> ${kitMod.modification}
        </p>
      </div>
    `;
  }

  // No modifier for this kit — show a neutral hint
  return `
    <div class="kit-modifiers">
      <p class="kit-mod kit-mod-none">No modifier for ${char.kit || 'your kit'}.</p>
    </div>
  `;
}

// ── Use ability ───────────────────────────────────────────────────────────────

async function useAbility(ability, char) {
  const currentResource = char.heroicResource?.current ?? 0;

  // Check affordability
  if ((ability.cost ?? 0) > currentResource) {
    showModal(`<p>Not enough ${char.heroicResource?.name || 'resource'} to use ${ability.name}.</p>`);
    return;
  }

  // Mark action economy bucket as spent
  if (ability.type === 'action') cardState.hasActed = true;
  if (ability.type === 'maneuver') cardState.hasManeuvered = true;
  if (ability.type === 'triggered') cardState.hasUsedTriggered = true;
  if (ability.type === 'free-triggered') cardState.hasUsedFreeTriggered = true;

  // Mark frequency
  if (ability.frequency === 'once-per-encounter') {
    cardState.usedOncePerEncounterAbilities.push(ability.id);
  }
  if (ability.frequency === 'once-per-turn') {
    cardState.usedOncePerTurnAbilities.push(ability.id);
  }

  // Decrement resource
  if (ability.cost > 0) {
    await adjustResource(-ability.cost);
  }

  // Update action economy buckets UI
  updateActionEconomyUI();

  // Bleeding damage — triggers on main actions and triggered actions
  if (['action', 'triggered', 'free-triggered'].includes(ability.type)) {
    const conditions = char.conditions ?? [];
    if (conditions.includes('Bleeding')) {
      const roll = Math.floor(Math.random() * 6) + 1;
      const dmg  = roll;  // 1d6 (level added by player if tracking)
      await adjustHP(-dmg);
      showToast(`Bleeding! Rolled ${roll} on 1d6 — took ${dmg} damage (add your level).`, 'danger');
    }
  }

  // Sync to session if active
  if (AppState.currentSession) {
    updateHeroInSession({
      hasActed: cardState.hasActed,
      hasManeuvered: cardState.hasManeuvered,
      hasUsedTriggered: cardState.hasUsedTriggered,
      hasUsedFreeTriggered: cardState.hasUsedFreeTriggered,
      usedOncePerEncounterAbilities: cardState.usedOncePerEncounterAbilities,
    });
  }

  // Re-render cards
  loadAbilityCards(AppState.currentCharacter);
}

// ── Update card affordability (called when resource changes) ─────────────────
//
// DOM-only patch — no Firestore fetch, no full re-render.
// Iterates existing .ability-card nodes, looks up each ability in the cached
// map, recomputes affordable/unaffordable, patches classList and resource pips.

function updateCardAffordability(newResource) {
  const char = AppState.currentCharacter;
  if (!char) return;

  const meta = CLASS_COLORS[char.class] || { accent: '#866D4B' };
  const accentColor = meta.accent;

  document.querySelectorAll('.ability-card').forEach(card => {
    const ability = _renderedAbilityMap[card.dataset.abilityId];
    if (!ability) return;

    const cost = ability.cost ?? 0;
    const affordable = cost <= newResource;
    const spent = isSpent(ability);

    // Patch top-level class — don't touch 'spent', only affordable/unaffordable
    if (!spent) {
      card.classList.toggle('affordable',   affordable);
      card.classList.toggle('unaffordable', !affordable);
    }

    // Patch resource pips in-place
    const pipsEl = card.querySelector('.resource-pips');
    if (pipsEl && cost > 0) {
      pipsEl.innerHTML = Array.from({ length: cost }, (_, i) => {
        const filled = i + 1 <= newResource;
        return `<span class="pip ${filled ? 'pip-filled' : 'pip-empty'}" style="${filled ? `background:${accentColor}` : ''}"></span>`;
      }).join('');
    }
  });
}

// ── Action economy UI ─────────────────────────────────────────────────────────

function updateActionEconomyUI() {
  const buckets = {
    'action': cardState.hasActed,
    'maneuver': cardState.hasManeuvered,
    'triggered': cardState.hasUsedTriggered,
    'free-triggered': cardState.hasUsedFreeTriggered,
    'free-strike': cardState.hasUsedFreeStrike,
  };

  for (const [bucket, spent] of Object.entries(buckets)) {
    const el = document.getElementById(`bucket-${bucket}`);
    if (el) el.classList.toggle('spent', spent);
  }
}

// ── End turn ─────────────────────────────────────────────────────────────────

function resetTurnState() {
  cardState.hasActed = false;
  cardState.hasManeuvered = false;
  // hasUsedTriggered and hasUsedFreeTriggered are per-ROUND, not per-turn —
  // they reset via advanceRound() / Next Round snapshot, not here.
  cardState.hasUsedFreeStrike = false;
  cardState.usedOncePerTurnAbilities = [];
  updateActionEconomyUI();
  if (AppState.currentCharacter) loadAbilityCards(AppState.currentCharacter);
}

// ── Restore state from session (when rejoining) ───────────────────────────────

function restoreCardStateFromSession(heroData) {
  cardState.hasActed = heroData.hasActed ?? false;
  cardState.hasManeuvered = heroData.hasManeuvered ?? false;
  cardState.hasUsedTriggered = heroData.hasUsedTriggered ?? false;
  cardState.hasUsedFreeTriggered = heroData.hasUsedFreeTriggered ?? false;
  cardState.hasUsedFreeStrike = heroData.hasUsedFreeStrike ?? false;
  cardState.usedOncePerEncounterAbilities = heroData.usedOncePerEncounterAbilities ?? [];
  updateActionEconomyUI();
}

// ── Dynamic filter bar — hide pills with no matching abilities ────────────────

function renderFilterBar(abilities) {
  const presentTypes = new Set(abilities.map(a => a.type));
  document.querySelectorAll('#ability-filter-bar .filter-pill[data-type]').forEach(pill => {
    const t = pill.dataset.type;
    if (t === '' || t === 'anytime') return; // always visible
    pill.classList.toggle('hidden', !presentTypes.has(t));
  });
  // If active filter no longer has results, reset it (anytime is always valid)
  if (activeTypeFilter && activeTypeFilter !== 'anytime' && !presentTypes.has(activeTypeFilter)) {
    activeTypeFilter = null;
    updateBucketFilterUI();
  }
}

// ── Type filter (wired to action economy bucket icons) ────────────────────────

// Map bucket IDs to ability types
const BUCKET_TYPE_MAP = {
  'bucket-action':        'action',
  'bucket-maneuver':      'maneuver',
  'bucket-triggered':     'anytime',
  'bucket-free-triggered':'anytime',
};

function setTypeFilter(type) {
  activeTypeFilter = activeTypeFilter === type ? null : type;
  updateBucketFilterUI();
  if (AppState.currentCharacter) loadAbilityCards(AppState.currentCharacter);
}

function updateBucketFilterUI() {
  // Sync action economy bucket highlights (session mode)
  for (const [id, type] of Object.entries(BUCKET_TYPE_MAP)) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('filter-active', activeTypeFilter === type);
  }

  // Sync filter pill bar (always visible)
  document.querySelectorAll('#ability-filter-bar .filter-pill').forEach(pill => {
    const pillType = pill.dataset.type;
    pill.classList.toggle('active', pillType === (activeTypeFilter ?? ''));
  });
}

function initAbilityFilters() {
  // Bucket icons (session mode)
  for (const [id, type] of Object.entries(BUCKET_TYPE_MAP)) {
    document.getElementById(id)?.addEventListener('click', (e) => {
      e.stopPropagation();
      setTypeFilter(type);
    });
  }

  // Filter pill bar (always visible)
  document.getElementById('ability-filter-bar')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    const type = pill.dataset.type || null; // '' → null = clear filter
    activeTypeFilter = type;
    updateBucketFilterUI();
    if (AppState.currentCharacter) loadAbilityCards(AppState.currentCharacter);
  });
}

// ── Imported (Forge Steel) ability cards — self-contained, read-only ─────────

function renderImportedAbilityCards(char, container) {
  const esc2 = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const abilities = char.importedAbilities || [];

  renderFilterBar(BASIC_ACTIONS); // keep the filter bar shell consistent

  if (!abilities.length) {
    container.innerHTML = '<p class="empty-text" style="padding:20px">No abilities were selected in this Forge Steel export. Choose them in Forge Steel and re-import.</p>';
    return;
  }

  container.innerHTML = `
    <div class="imported-banner">Imported from Forge Steel${char.sourceUnknown ? ' — includes non-compendium content' : ''}. Cards are read-only.</div>
    ${abilities.map(a => {
      const roll = (a.sections || []).map(s => s.roll).find(Boolean);
      const text = (a.sections || []).filter(s => s.text).map(s => esc2(s.text)).join('<br>');
      const costLabel = a.isSignature ? 'SIGNATURE' : (a.cost ? `${a.cost} pt` : 'FREE');
      return `
        <div class="ability-card imported-card">
          <div class="ability-card-header">
            <span class="ability-card-name">${esc2(a.name)}</span>
            <span class="ability-cost-badge">${costLabel}</span>
          </div>
          <div class="ability-card-meta">
            ${a.type ? `<span class="ability-type-badge">${esc2(a.type)}</span>` : ''}
            ${a.keywords?.length ? `<span class="ability-keywords">${a.keywords.map(esc2).join(', ')}</span>` : ''}
          </div>
          ${a.distance || a.target ? `<div class="ability-card-line">${esc2(a.distance)}${a.distance && a.target ? ' · ' : ''}${esc2(a.target)}</div>` : ''}
          ${roll ? `
            <div class="ability-tiers">
              <div class="ability-tier">≤11 <span>${esc2(roll.tier1)}</span></div>
              <div class="ability-tier">12–16 <span>${esc2(roll.tier2)}</span></div>
              <div class="ability-tier">17+ <span>${esc2(roll.tier3)}</span></div>
            </div>` : ''}
          ${text ? `<div class="ability-card-effect">${text}</div>` : ''}
        </div>
      `;
    }).join('')}
  `;
}

// Wire filters once DOM is ready
initAbilityFilters();

// ── Expose globals ────────────────────────────────────────────────────────────
window.loadAbilityCards = loadAbilityCards;
window.resetTurnState = resetTurnState;
window.restoreCardStateFromSession = restoreCardStateFromSession;
window.updateCardAffordability = updateCardAffordability;
window.cardState = cardState;
window.getAncestryAbilities = getAncestryAbilities;
window.getKitVirtualAbility = getKitVirtualAbility;


// ── Ability detail surface ───────────────────────────────────────────────────
// Replaces inline card expansion. One click target, two presentations:
// a sticky side panel on desktop (cards stay visible, so you can still
// compare before committing) and a full-screen sheet on mobile.
//
// The card's .card-expanded element is MOVED into the surface rather than
// cloned, so the "Use This Ability" listener bound in buildCard() keeps
// working. closeAbilityDetail() always moves it home again.

let _openAbilityCard = null;

function getAbilityDetailSurface() {
  let el = document.getElementById('ability-detail');
  if (el) return el;

  el = document.createElement('div');
  el.id = 'ability-detail';
  el.className = 'ability-detail';
  el.innerHTML = `
    <div class="ability-detail-dialog" role="dialog" aria-modal="true" aria-label="Ability detail">
      <div class="ability-detail-head">
        <span class="ability-detail-title"></span>
        <button class="ability-detail-close" aria-label="Close">&times;</button>
      </div>
      <div class="ability-detail-body"></div>
    </div>`;

  // Mounted on <body>, not inside the tab: a fixed overlay nested under a
  // transformed or scrolling ancestor gets clipped and mis-stacked.
  document.body.appendChild(el);
  el.querySelector('.ability-detail-close').addEventListener('click', closeAbilityDetail);
  // Click the scrim (but not the dialog) to dismiss.
  el.addEventListener('click', (e) => { if (e.target === el) closeAbilityDetail(); });
  return el;
}

function closeAbilityDetail() {
  if (!_openAbilityCard) return;
  const surface = document.getElementById('ability-detail');
  const node = surface?.querySelector('.ability-detail-body > .card-expanded');
  if (node) {
    node.classList.add('hidden');
    _openAbilityCard.appendChild(node);     // move it home
  }
  _openAbilityCard.classList.remove('expanded');
  _openAbilityCard = null;
  surface?.classList.remove('is-open');
  document.body.classList.remove('detail-open');
}

function openAbilityDetail(card, ability) {
  closeAbilityDetail();

  const node = card.querySelector('.card-expanded');
  if (!node) return;                        // nothing to show

  const surface = getAbilityDetailSurface();
  surface.querySelector('.ability-detail-title').textContent = ability.name;
  node.classList.remove('hidden');
  surface.querySelector('.ability-detail-body').appendChild(node);

  card.classList.add('expanded');
  _openAbilityCard = card;
  surface.querySelector('.ability-detail-body').scrollTop = 0;
  // Next frame, so the browser has a chance to paint the closed state and
  // actually run the open transition instead of jumping straight to it.
  requestAnimationFrame(() => surface.classList.add('is-open'));
  document.body.classList.add('detail-open');
  surface.querySelector('.ability-detail-close').focus({ preventScroll: true });
}

function toggleAbilityDetail(card, ability) {
  if (_openAbilityCard === card) closeAbilityDetail();
  else openAbilityDetail(card, ability);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAbilityDetail();
});
