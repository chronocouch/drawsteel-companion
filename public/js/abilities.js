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

// ── Load ability cards ────────────────────────────────────────────────────────

async function loadAbilityCards(char) {
  const container = document.getElementById('ability-cards-container');
  container.innerHTML = '<p class="loading-text">Loading abilities...</p>';

  if (!char.class) {
    container.innerHTML = '<p class="empty-text">Complete character creation to see abilities.</p>';
    return;
  }

  try {
    const snapshot = await db.collection('abilities')
      .where('class', '==', char.class)
      .get();

    const abilities = [];
    snapshot.forEach(doc => abilities.push({ id: doc.id, ...doc.data() }));

    if (abilities.length === 0) {
      container.innerHTML = '<p class="empty-text">No abilities found. Run the seed script.</p>';
      return;
    }

    renderAbilityCards(abilities, char);
  } catch (e) {
    console.error('Error loading abilities:', e);
    container.innerHTML = '<p class="error-text">Error loading abilities.</p>';
  }
}

// ── Render cards ─────────────────────────────────────────────────────────────

function renderAbilityCards(abilities, char) {
  const container = document.getElementById('ability-cards-container');
  container.innerHTML = '';

  const currentResource = char.heroicResource?.current ?? 0;
  const sorted = sortAbilities(abilities, currentResource);

  for (const ability of sorted) {
    container.appendChild(buildCard(ability, char, currentResource));
  }
}

// ── Sort order ────────────────────────────────────────────────────────────────
// 1. Signature/free abilities
// 2. Affordable actions (cost ascending)
// 3. Affordable maneuvers
// 4. Triggered (dimmed on your turn)
// 5. Unaffordable
// 6. Spent/locked

function sortAbilities(abilities, currentResource) {
  return [...abilities].sort((a, b) => {
    const aGroup = getSortGroup(a, currentResource);
    const bGroup = getSortGroup(b, currentResource);
    if (aGroup !== bGroup) return aGroup - bGroup;
    return (a.cost ?? 0) - (b.cost ?? 0);
  });
}

function getSortGroup(ability, currentResource) {
  if (isSpent(ability)) return 6;
  if (ability.isSignature || ability.type === 'free') return 1;
  const affordable = (ability.cost ?? 0) <= currentResource;
  if (!affordable) return 5;
  if (ability.type === 'action') return 2;
  if (ability.type === 'maneuver') return 3;
  if (ability.type === 'triggered' || ability.type === 'free-triggered') return 4;
  return 2;
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

      ${ability.kitModifiers?.length ? `
        <div class="kit-modifiers">
          ${ability.kitModifiers.map(km => `<p class="kit-mod"><strong>${km.kitName}:</strong> ${km.modification}</p>`).join('')}
        </div>
      ` : ''}

      ${!spent && AppState.currentSession ? `
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

function updateCardAffordability(newResource) {
  document.querySelectorAll('.ability-card').forEach(card => {
    const abilityId = card.dataset.abilityId;
    // Simple re-render — find ability and rebuild
    // Full re-render via loadAbilityCards is cleaner for Phase 3
  });
  // For now, just reload all cards
  if (AppState.currentCharacter) {
    loadAbilityCards(AppState.currentCharacter);
  }
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
  cardState.hasUsedTriggered = false;
  cardState.hasUsedFreeTriggered = false;
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

// ── Expose globals ────────────────────────────────────────────────────────────
window.loadAbilityCards = loadAbilityCards;
window.resetTurnState = resetTurnState;
window.restoreCardStateFromSession = restoreCardStateFromSession;
window.updateCardAffordability = updateCardAffordability;
window.cardState = cardState;
