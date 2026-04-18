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

  const colonIdx = kitStats.sigAbility.indexOf(':');
  const name = (colonIdx > -1
    ? kitStats.sigAbility.substring(0, colonIdx)
    : kitStats.sigAbility).trim();
  const desc = colonIdx > -1
    ? kitStats.sigAbility.substring(colonIdx + 1).trim()
    : kitStats.sigAbility;

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

    // Inject virtual kit signature ability if not already covered by a
    // Firestore ability with the same name (added in finishCharacterCreation)
    const kitVirtual = getKitVirtualAbility(char);
    if (kitVirtual) {
      const kName = kitVirtual.name.toLowerCase();
      const alreadyCovered = selected.some(a => a.name?.toLowerCase() === kName);
      if (!alreadyCovered) selected.push(kitVirtual);
    }

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
  const meta = CLASS_COLORS[char.class] || { accent: '#2980B9' };

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

  // Toggle expand/collapse
  card.querySelector('.card-header').addEventListener('click', () => {
    const expanded = card.querySelector('.card-expanded');
    expanded.classList.toggle('hidden');
    card.classList.toggle('expanded');
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

  const meta = CLASS_COLORS[char.class] || { accent: '#2980B9' };
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
