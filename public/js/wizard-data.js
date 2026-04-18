/**
 * wizard-data.js — Draw Steel character creation data
 *
 * All data sourced from the Steel Compendium (SteelCompendium/data-rules-md).
 * Separated from character.js to keep the logic file manageable.
 */

// ── Ancestries ────────────────────────────────────────────────────────────────
// Each ancestry grants a free Signature Trait + a pool of Purchased Traits
// (spent from a point budget of 3 or 4).

const ANCESTRY_DATA = [
  {
    name: 'Devil',
    desc: 'Born of infernal lineage, devils carry innate magic and an unsettling charisma.',
    signatureTrait: {
      name: 'Silver Tongue',
      desc: 'Gain one interpersonal skill. You have an edge on tests to discover NPC motivations during negotiations.',
    },
    traitPoints: 3,
    traits: [
      { name: 'Barbed Tail',       cost: 1, desc: 'Once per round, deal extra damage equal to your highest characteristic score on melee strikes.' },
      { name: 'Beast Legs',        cost: 1, desc: 'Your speed becomes 6.' },
      { name: 'Glowing Eyes',      cost: 1, desc: 'Triggered action: deal 1d10 + level psychic damage to a creature that just dealt damage to you.' },
      { name: 'Hellsight',         cost: 1, desc: 'See through darkness and fog. No bane on attacks against concealed creatures.' },
      { name: 'Impressive Horns',  cost: 2, desc: 'You succeed on saving throws on a result of 5 or higher.' },
      { name: 'Prehensile Tail',   cost: 2, desc: 'You can\'t be flanked.' },
      { name: 'Wings',             cost: 2, desc: 'Fly for rounds equal to your Might score (min 1). While airborne at 3rd level or lower, you have weakness 5.' },
    ],
  },
  {
    name: 'Dragon Knight',
    desc: 'Warriors who merged with draconic power through an ancient ritual of bonding.',
    signatureTrait: {
      name: 'Wyrmplate',
      desc: 'Choose one damage type: acid, cold, corruption, fire, lightning, or poison. You have immunity to that damage type equal to your level. You can change your choice after a respite.',
    },
    traitPoints: 3,
    traits: [
      { name: 'Draconian Guard',  cost: 1, desc: 'Triggered action: when you or an adjacent creature takes damage from a strike, reduce that damage by your level.' },
      { name: 'Prismatic Scales', cost: 1, desc: 'Permanently maintain one additional damage immunity from Wyrmplate (in addition to your chosen type).' },
      { name: 'Remember Your Oath', cost: 1, desc: 'Maneuver: succeed on saving throws on a result of 4+ until the start of your next turn.' },
      { name: 'Draconian Pride',  cost: 2, desc: 'Signature ability (main action): deal 2–7 damage in a burst 1 around you, with increasing push distance.' },
      { name: 'Dragon Breath',    cost: 2, desc: 'Signature ability (main action): breathe elemental energy in a 3-cube area, dealing 2–6 damage of your Wyrmplate type.' },
      { name: 'Wings',            cost: 2, desc: 'Fly for rounds equal to your Might score (min 1). While airborne at 3rd level or lower, you have weakness 5.' },
    ],
  },
  {
    name: 'Dwarf',
    desc: 'Ancient and resilient, shaped by stone and forge. Endurance personified.',
    signatureTrait: {
      name: 'Runic Carving',
      desc: 'In 10 minutes, carve a magic rune providing one of: Detection (glows near supernatural things within 20 squares), Light (sheds light 10 squares, togglable), or Voice (telepathic communication within 1 mile).',
    },
    traitPoints: 3,
    traits: [
      { name: 'Grounded',            cost: 1, desc: '+1 bonus to stability.' },
      { name: 'Stand Tough',         cost: 1, desc: 'Your Might is treated as 1 higher for resisting potencies. Edge on Might tests to resist environmental effects.' },
      { name: 'Stone Singer',        cost: 1, desc: 'After 1 hour of singing, reshape unworked stone within 3 squares of you.' },
      { name: 'Great Fortitude',     cost: 2, desc: 'You can\'t be made weakened.' },
      { name: 'Spark Off Your Skin', cost: 2, desc: '+6 bonus to your Stamina maximum, increasing by 6 at 4th, 7th, and 10th level.' },
    ],
  },
  {
    name: 'Hakaan',
    desc: 'The great giants of the world — raw power and unshakeable resolve.',
    signatureTrait: {
      name: 'Big!',
      desc: 'You are size 1L. You count as large for all purposes, including the space you occupy and how you interact with creatures and objects.',
    },
    traitPoints: 3,
    traits: [
      { name: 'All Is a Feather', cost: 1, desc: 'You have an edge on tests to lift and haul heavy objects.' },
      { name: 'Forceful',        cost: 1, desc: '+1 bonus to all forced movement distance you impose.' },
      { name: 'Stand Tough',     cost: 1, desc: 'Your Might is treated as 1 higher for resisting potencies. Edge on Might tests vs. environmental effects.' },
      { name: 'Doomsight',       cost: 2, desc: 'You can predetermine a single "death encounter." While doomed, you automatically get tier 3 results — but you die at the encounter\'s end.' },
      { name: 'Great Fortitude', cost: 2, desc: 'You can\'t be made weakened.' },
    ],
  },
  {
    name: 'High Elf',
    desc: 'Ancient and graceful, attuned to magic and the weight of long memory.',
    signatureTrait: {
      name: 'High Elf Glamor',
      desc: 'You have an edge on Presence tests using Flirt or Persuade, and you appear interesting and engaging to all creatures you interact with.',
    },
    traitPoints: 3,
    traits: [
      { name: 'Graceful Retreat',  cost: 1, desc: '+1 bonus to the distance you can shift when you use the Disengage maneuver.' },
      { name: 'High Senses',       cost: 1, desc: 'You have an edge on tests to notice hidden threats or perceive ambushes.' },
      { name: 'Revisit Memory',    cost: 1, desc: 'You have an edge on tests to recall lore and historical knowledge.' },
      { name: 'Glamor of Terror',  cost: 2, desc: 'Triggered action: a creature that just dealt damage to you becomes frightened until the end of their next turn.' },
      { name: 'Otherworldly Grace', cost: 2, desc: 'You succeed on saving throws on a result of 5 or higher.' },
      { name: 'Unstoppable Mind',  cost: 2, desc: 'You can\'t be made dazed.' },
    ],
  },
  {
    name: 'Human',
    desc: 'Adaptable and driven — defined by ambition and the will to shape the world.',
    signatureTrait: {
      name: 'Detect the Supernatural',
      desc: 'Maneuver: detect supernatural creatures and phenomena. Until the end of your next turn, you know the location of any supernatural object, undead, construct, or extraplanar creature within 5 squares (even without line of effect).',
    },
    traitPoints: 3,
    traits: [
      { name: 'Can\'t Take Hold',      cost: 1, desc: 'Ignore temporary difficult terrain from magic or psionic abilities. Reduce forced movement from those sources by 1.' },
      { name: 'Perseverance',          cost: 1, desc: 'Edge on Endurance tests. When slowed, your speed is reduced to 3 instead of 2.' },
      { name: 'Resist the Unnatural',  cost: 1, desc: 'Triggered action: take half damage from a non-untyped damage source.' },
      { name: 'Determination',         cost: 2, desc: 'Maneuver: immediately end the frightened, slowed, or weakened condition on yourself.' },
      { name: 'Staying Power',         cost: 2, desc: '+2 to your maximum number of Recoveries.' },
    ],
  },
  {
    name: 'Memonek',
    desc: 'Constructed beings of living memory — they blur the line between flesh and thought.',
    signatureTrait: {
      name: 'Constructed Body',
      desc: 'Fall Lightly: reduce any fall distance by 2 squares. Lightweight: you are treated as one size smaller when creatures attempt to force move you.',
    },
    traitPoints: 4,
    traits: [
      { name: 'I Am Law',           cost: 1, desc: 'Enemies can\'t move through your space unless you allow it.' },
      { name: 'Systematic Mind',    cost: 1, desc: 'Edge on tests to parse schematics, maps, or codes. Treat unknown languages as a related language.' },
      { name: 'Unphased',           cost: 1, desc: 'You can\'t be surprised.' },
      { name: 'Useful Emotion',     cost: 1, desc: 'At the start of combat, you gain 1 surge.' },
      { name: 'Keeper of Order',    cost: 2, desc: 'Once per round when any creature makes a power roll, you can use a free triggered action to remove an edge, convert a double edge to an edge, or convert a double bane to a bane.' },
      { name: 'Lightning Nimbleness', cost: 2, desc: 'Your speed becomes 7.' },
      { name: 'Nonstop',            cost: 2, desc: 'You can\'t be made slowed.' },
    ],
  },
  {
    name: 'Orc',
    desc: 'Fierce and vital, warriors shaped by a world that demands constant strength.',
    signatureTrait: {
      name: 'Relentless',
      desc: 'When damage leaves you dying, you can immediately make a free strike against any creature. If you reduce a creature to 0 Stamina with that strike, you can spend a Recovery.',
    },
    traitPoints: 3,
    traits: [
      { name: 'Bloodfire Rush',    cost: 1, desc: 'The first time you take damage each combat round, gain +2 to speed until the end of that round.' },
      { name: 'Grounded',          cost: 1, desc: '+1 bonus to stability.' },
      { name: 'Passionate Artisan', cost: 1, desc: 'Choose two crafting skills. You gain a +2 bonus to project rolls using those skills.' },
      { name: 'Glowing Recovery',  cost: 2, desc: 'When you use the Catch Your Breath maneuver, you may spend as many Recoveries as you like (not just one).' },
      { name: 'Nonstop',           cost: 2, desc: 'You can\'t be made slowed.' },
    ],
  },
  {
    name: 'Polder',
    desc: 'Small in stature but boundless in cunning — polders thrive by wit and speed.',
    signatureTrait: {
      name: 'Shadowmeld',
      desc: 'Magic maneuver: flatten into a shadow on a wall or floor. While merged, you\'re hidden from creatures you have cover or concealment from, gain full awareness, and enemies attacking you take a bane. You can\'t move or take main actions while merged.',
    },
    traitPoints: 4,
    traits: [
      { name: 'Corruption Immunity', cost: 1, desc: 'You gain corruption immunity equal to your level + 2.' },
      { name: 'Graceful Retreat',    cost: 1, desc: '+1 bonus to the distance you can shift when using Disengage.' },
      { name: 'Polder Geist',        cost: 1, desc: 'At the start of your turn in combat, if no enemy has line of effect to you or you\'re hidden/concealed, gain +3 speed until end of turn.' },
      { name: 'Reactive Tumble',     cost: 1, desc: 'Triggered action: shift 1 square after you are force moved.' },
      { name: 'Fearless',            cost: 2, desc: 'You can\'t be made frightened.' },
      { name: 'Nimblestep',          cost: 2, desc: 'You ignore difficult terrain effects and can move at full speed while sneaking.' },
    ],
  },
  {
    name: 'Revenant',
    desc: 'The walking dead with unfinished purpose, clinging to existence by sheer will.',
    signatureTrait: {
      name: 'Tough But Withered',
      desc: 'Immunity to cold, corruption, lightning, and poison equal to your level. Fire weakness 5. You can\'t suffocate and need no food or drink. When your Stamina reaches your negative winded value, you become inert (prone, can\'t act) instead of dying — but fire destroys you while inert.',
    },
    traitPoints: 2,
    traits: [
      { name: 'Undead Influence',    cost: 1, desc: 'You have an edge on Reason, Intuition, and Presence tests when interacting with undead creatures.' },
      { name: 'Previous Life (1pt)', cost: 1, desc: 'Select one 1-point purchased trait from your ancestry before death. Can be taken multiple times.' },
      { name: 'Bloodless',           cost: 2, desc: 'You can\'t be made bleeding, even while dying.' },
      { name: 'Previous Life (2pt)', cost: 2, desc: 'Select one 2-point purchased trait from your ancestry before death.' },
      { name: 'Vengeance Mark',      cost: 2, desc: 'Maneuver: place magical sigils on creatures within 10 squares. You always know the direction to sigil-bearers. Maximum sigils equal to your level.' },
    ],
  },
  {
    name: 'Time Raider',
    desc: 'Displaced by chrono-warfare, unstuck from their own era and its rules.',
    signatureTrait: {
      name: 'Psychic Scar',
      desc: 'You have psychic immunity equal to your level, a scar left by temporal displacement.',
    },
    traitPoints: 3,
    traits: [
      { name: 'Beyondsight',           cost: 1, desc: 'Maneuver: see through mundane obstructions up to 1 square thick until your next turn.' },
      { name: 'Four-Armed Athletics',  cost: 1, desc: 'You have an edge on Climb, Gymnastics, and Swim tests when using all four arms.' },
      { name: 'Foresight',             cost: 1, desc: 'Automatically know the location of concealed creatures within 20 squares. Triggered action: impose a bane on an incoming strike.' },
      { name: 'Four-Armed Martial Arts', cost: 2, desc: 'Target additional adjacent creatures with Grab or Knockback maneuvers using the same power roll. You can grab two creatures simultaneously.' },
      { name: 'Psionic Gift',          cost: 2, desc: 'Choose a psionic signature ability: Concussive Slam (force damage + push), Psionic Bolt (psychic damage + slide), or Minor Acceleration (speed bonus).' },
      { name: 'Unstoppable Mind',      cost: 2, desc: 'You can\'t be made dazed.' },
    ],
  },
  {
    name: 'Wode Elf',
    desc: 'Wilder kin of the high elves — hunters and wanderers of the deep forest.',
    signatureTrait: {
      name: 'Wode Elf Glamor',
      desc: 'You have an edge on Hide and Sneak tests. Any test made to search for you while you\'re hidden takes a bane.',
    },
    traitPoints: 3,
    traits: [
      { name: 'Forest Walk',       cost: 1, desc: 'You can shift into and through difficult terrain (such as dense undergrowth).' },
      { name: 'Quick and Brutal',  cost: 1, desc: 'On a critical hit, you take an additional main action and move action instead of just a main action.' },
      { name: 'Revisit Memory',    cost: 1, desc: 'Edge on tests to recall lore and historical knowledge.' },
      { name: 'Swift',             cost: 1, desc: 'Your speed becomes 6.' },
      { name: 'Otherworldly Grace', cost: 2, desc: 'You succeed on saving throws on a result of 5 or higher.' },
      { name: 'The Wode Defends',  cost: 2, desc: 'Signature ability: ranged strike at range 10. Power Roll + Might/Agility: 2–5 damage with effects ranging from slowed to restrained.' },
    ],
  },
];

// ── Culture (3 independent layers) ────────────────────────────────────────────
// Players choose one option from each layer. Together they define culture.

const CULTURE_ENVIRONMENTS = [
  { name: 'Nomadic',    skill: 'One exploration or interpersonal skill', quickBuild: 'Navigate',   desc: 'Your people travel from place to place to survive, following resources or avoiding threats.' },
  { name: 'Rural',      skill: 'One crafting or lore skill',             quickBuild: 'Nature',     desc: 'You grew up in a town, village, or small settled enclave — connected to the land.' },
  { name: 'Secluded',   skill: 'One interpersonal or lore skill',        quickBuild: 'Read Person', desc: 'Your community occupied one close-quarters structure: a building, cavern, or outpost.' },
  { name: 'Urban',      skill: 'One interpersonal or intrigue skill',    quickBuild: 'Alertness',  desc: 'You grew up in a city, always surrounded by crowds, commerce, and conflict.' },
  { name: 'Wilderness', skill: 'One crafting or exploration skill',      quickBuild: 'Endurance',  desc: 'Your people thrived amid nature, taking sustenance and shelter from the land itself.' },
];

const CULTURE_ORGANIZATIONS = [
  { name: 'Bureaucratic', skill: 'One interpersonal or intrigue skill', quickBuild: 'Persuade', desc: 'Your community had official leadership and formally recorded laws. You know how to bend, change, or reinterpret rules to your advantage.' },
  { name: 'Communal',     skill: 'One crafting or exploration skill',   quickBuild: 'Jump',     desc: 'All members of your community were considered equal. Decisions were made collectively, and everyone contributed.' },
];

const CULTURE_UPBRINGINGS = [
  { name: 'Academic', skill: 'One lore skill',                            quickBuild: 'History',   desc: 'You were raised by people who collect, study, and share knowledge. Books and records shaped your worldview.' },
  { name: 'Creative', skill: 'Music, Perform, or any crafting skill',     quickBuild: 'Perform',   desc: 'You were raised among folk who create art or crafted works valuable enough to trade.' },
  { name: 'Labor',    skill: 'Blacksmithing, Handle Animals, or any exploration skill', quickBuild: 'Lift', desc: 'You understand the value of hard work. Your hands built something real.' },
  { name: 'Lawless',  skill: 'One intrigue skill',                        quickBuild: 'Sneak',      desc: 'You grew up among folk who operated outside the law — by necessity or by nature.' },
  { name: 'Martial',  skill: 'One combat, exploration, or intrigue skill', quickBuild: 'Intimidate', desc: 'You were raised by warriors in a combat-focused community. Strength and discipline were core values.' },
  { name: 'Noble',    skill: 'One interpersonal skill',                   quickBuild: 'Lead',       desc: 'Whispered words in the right ear can be more powerful than any army. You learned that early.' },
];

// ── Careers ───────────────────────────────────────────────────────────────────

const CAREER_DATA = [
  { name: 'Agent',             desc: 'Former intelligence operative or spy.', skills: 'Sneak + 1 interpersonal + 1 intrigue', languages: 2, resources: 'One intrigue perk' },
  { name: 'Aristocrat',        desc: 'Born into nobility or landed gentry.', skills: '1 interpersonal + 1 lore', languages: 1, resources: 'Renown +1, Wealth +1, one lore perk' },
  { name: 'Artisan',           desc: 'Skilled craftsperson or maker.', skills: '2 crafting skills', languages: 1, resources: 'Project Points 240, one crafting perk' },
  { name: 'Beggar',            desc: 'Survived on the margins of society.', skills: 'Rumors + 1 exploration + 1 interpersonal', languages: 2, resources: 'One interpersonal perk' },
  { name: 'Criminal',          desc: 'Operated outside the law.', skills: 'Criminal Underworld + 2 intrigue', languages: 1, resources: 'Project Points 120, one intrigue perk' },
  { name: 'Disciple',          desc: 'Devoted follower of a religion or philosophy.', skills: 'Religion + 2 lore', languages: 0, resources: 'Project Points 240, one supernatural perk' },
  { name: 'Explorer',          desc: 'Charted unknown territories and wilderness.', skills: 'Navigate + 2 exploration', languages: 2, resources: 'One exploration perk' },
  { name: 'Farmer',            desc: 'Worked the land and raised livestock.', skills: 'Handle Animals + 2 exploration', languages: 1, resources: 'Project Points 120, one exploration perk' },
  { name: 'Gladiator',         desc: 'Fought for crowds in arenas.', skills: '2 exploration skills', languages: 1, resources: 'Renown +2, one exploration perk' },
  { name: 'Laborer',           desc: 'Did hard physical work to survive.', skills: 'Endurance + 2 crafting or exploration', languages: 1, resources: 'Project Points 120, one exploration perk' },
  { name: "Mage's Apprentice", desc: 'Studied under a practicing wizard or mage.', skills: 'Magic + 2 lore', languages: 1, resources: 'Renown +1, one supernatural perk' },
  { name: 'Performer',         desc: 'Entertained audiences as a musician or actor.', skills: 'Music or Perform + 2 interpersonal', languages: 0, resources: 'Renown +2, one interpersonal perk' },
  { name: 'Politician',        desc: 'Navigated the halls of power.', skills: '2 interpersonal skills', languages: 1, resources: 'Renown +1, Wealth +1, one interpersonal perk' },
  { name: 'Sage',              desc: 'Spent years studying and cataloguing knowledge.', skills: '2 lore skills', languages: 1, resources: 'Project Points 240, one lore perk' },
  { name: 'Sailor',            desc: 'Worked the seas, rivers, or lakes.', skills: 'Swim + 2 exploration', languages: 2, resources: 'One exploration perk' },
  { name: 'Soldier',           desc: 'Served in a military force or mercenary company.', skills: '1 exploration + 1 intrigue', languages: 2, resources: 'Renown +1, one exploration perk' },
  { name: 'Warden',            desc: 'Protected a territory or wilderness area.', skills: 'Nature + 1 exploration + 1 intrigue', languages: 1, resources: 'Project Points 120, one exploration perk' },
  { name: 'Watch Officer',     desc: 'Enforced the law in a city or town.', skills: 'Alertness + 2 intrigue', languages: 2, resources: 'One exploration perk' },
];

// ── Class subclasses ──────────────────────────────────────────────────────────
// Each class has 3 subclass options chosen at level 1.

const CLASS_SUBCLASSES = {
  Fury: [
    { name: 'Berserker',   skill: 'Lift',  feature: 'Primordial Strength', desc: 'Unleash raw physical might. You can lift incredible weights, and Primordial Strength deals bonus damage to nearby enemies at the end of your turn.' },
    { name: 'Reaver',      skill: 'Hide',  feature: 'Primordial Cunning',  desc: 'Strike fast and vanish. Primordial Cunning lets you shift freely when enemies try to engage you — you are always one step ahead.' },
    { name: 'Stormwight',  skill: 'Track', feature: 'Beast Shape',         desc: 'Embrace a primal animal aspect. Beast Shape lets you transform mid-combat into a powerful creature form suited to destruction.' },
  ],
  Tactician: [
    { name: 'Insurgent',   skill: 'Sneak',    feature: 'Doctrine: Insurgent',   desc: 'Lead through disruption and unconventional tactics. You reward allies who exploit openings and fight dirty.' },
    { name: 'Mastermind',  skill: 'Culture',  feature: 'Doctrine: Mastermind',  desc: 'Win through superior planning. Your doctrine lets you read the battlefield and counter enemy actions before they happen.' },
    { name: 'Vanguard',    skill: 'Endurance', feature: 'Doctrine: Vanguard',   desc: 'Lead from the front. Your doctrine rewards being first into danger and inspires allies through bold personal action.' },
  ],
  Shadow: [
    { name: 'College of Black Ash',       skill: 'Magic',   feature: 'Black Ash Teleport', desc: 'Master teleportation and misdirection. You can vanish in a cloud of ash and reappear elsewhere — leaving enemies grasping at nothing.' },
    { name: 'College of Caustic Alchemy', skill: 'Alchemy', feature: 'Coat the Blade',     desc: 'Deploy poisons, explosives, and chemical weapons. Your Insight grows whenever an enemy suffers one of your concoctions.' },
    { name: 'College of Harlequin Mask',  skill: 'Lie',     feature: 'I\'m On Your Side',  desc: 'Use illusion and disguise as weapons. You create convincing duplicates and make enemies question what is real.' },
  ],
  Conduit: [
    { name: 'Doctrine of the Grave',      skill: 'Supernatural', feature: 'Grave Domain',    desc: 'Channel the power of death and undeath. Your prayers deal corruption damage and support allies teetering at death\'s door.' },
    { name: 'Doctrine of the Primordial', skill: 'Nature',       feature: 'Primordial Domain', desc: 'Wield the raw force of the natural world. Your prayers call lightning, stone, and primal fury.' },
    { name: 'Doctrine of the Saint',      skill: 'Religion',     feature: 'Saint Domain',    desc: 'Channel radiant holy power. Your prayers heal the faithful and burn the wicked with divine light.' },
  ],
  Elementalist: [
    { name: 'Earth', skill: 'Nature',     feature: 'Earth Specialization', desc: 'Command stone, earth, and crystal. Slow and powerful — you reshape the terrain and outlast your opponents through sheer endurance.' },
    { name: 'Fire',  skill: 'Intimidate', feature: 'Fire Specialization',  desc: 'Unleash devastating flame. Aggressive and explosive — enemies in your path burn, and you grow stronger as the fires spread.' },
    { name: 'Green', skill: 'Nature',     feature: 'Green Specialization', desc: 'Grow and entangle with living plants. Controlling and patient — you deny enemies movement and create chokepoints from nothing.' },
    { name: 'Void',  skill: 'Psionics',   feature: 'Void Specialization',  desc: 'Wield cosmic entropy and teleportation. Strange and unpredictable — you bend space itself and make the impossible happen.' },
  ],
  Null: [
    { name: 'Chronokinetic', skill: 'History', feature: 'Chronokinesis', desc: 'Manipulate the flow of time. Slow enemies to a crawl, accelerate allies, and create temporal anomalies that reshape encounters.' },
    { name: 'Cryokinetic',   skill: 'Nature',  feature: 'Cryokinesis',   desc: 'Project intense psychic cold. Freeze enemies in place and coat the battlefield in hazardous ice.' },
    { name: 'Metakinetic',   skill: 'Psionics', feature: 'Metakinesis',  desc: 'Redirect and absorb kinetic energy. You turn attacks back on enemies and shrug off forced movement entirely.' },
  ],
  Talent: [
    { name: 'Chronopathy', skill: 'History',     feature: 'Chronopathic Tradition', desc: 'Perceive and alter the flow of time. You can see moments before and after they happen, acting on knowledge others don\'t have.' },
    { name: 'Telekinesis', skill: 'Athletics',   feature: 'Telekinetic Tradition',  desc: 'Move objects and creatures with your mind. Push enemies away, pull allies to safety, and lift things no body could manage.' },
    { name: 'Telepathy',   skill: 'Read Person', feature: 'Telepathic Tradition',   desc: 'Read and influence minds directly. You communicate without words and sense intent before action — a terrifying advantage.' },
  ],
};

// ── Kit stats ─────────────────────────────────────────────────────────────────
// Full mechanical stats for each kit. No class restrictions — all kits are
// available to all classes.

const KIT_STATS = {
  'Cloak and Dagger': { armor: 'Light', weapon: 'Light × 2', stamina: '+3/echelon', speed: '+2', stability: '—', meleeDmg: '+1/+1/+1', rangedDmg: '+1/+1/+1', rangedRange: '+5', disengage: '+1', sigAbility: 'Fade: deal 3–8+ damage; shift 1–3 squares' },
  'Dancer':           { armor: 'None', weapon: 'Unarmed', stamina: '+3/echelon', speed: '+3', stability: '—', meleeDmg: '+2/+2/+2', rangedDmg: '—', rangedRange: '—', disengage: '+1', sigAbility: 'Battle Grace: deal 5–11+ damage; option to swap places with target' },
  'Dual Wielder':     { armor: 'Medium', weapon: 'Light + Medium', stamina: '+6/echelon', speed: '+2', stability: '—', meleeDmg: '+2/+2/+2', rangedDmg: '—', rangedRange: '—', disengage: '+1', sigAbility: 'Double Strike: deal 4–8 damage split between two targets' },
  'Guisarmier':       { armor: 'Medium', weapon: 'Polearm', stamina: '+6/echelon', speed: '—', stability: '+1', meleeDmg: '+2/+2/+2', rangedDmg: '—', rangedRange: '—', disengage: '—', sigAbility: 'Forward Thrust, Backward Smash: deal 4–9 damage to two creatures within melee 2' },
  'Mountain':         { armor: 'Heavy', weapon: 'Heavy', stamina: '+9/echelon', speed: '—', stability: '+2', meleeDmg: '+0/+0/+4', rangedDmg: '—', rangedRange: '—', disengage: '—', sigAbility: 'Pain for Pain: deal 3–13+ damage, bonus if target wounded you' },
  'Panther':          { armor: 'None', weapon: 'Heavy', stamina: '+6/echelon', speed: '+1', stability: '+1', meleeDmg: '+0/+0/+4', rangedDmg: '—', rangedRange: '—', disengage: '—', sigAbility: 'Devastating Rush: advance 3 squares toward target; deal bonus damage' },
  'Pugilist':         { armor: 'None', weapon: 'Unarmed', stamina: '+6/echelon', speed: '+2', stability: '+1', meleeDmg: '+1/+1/+1', rangedDmg: '—', rangedRange: '—', disengage: '—', sigAbility: 'Let\'s Dance: deal 3–8+ damage; slide target 1–2 squares and shift into their space' },
  'Raider':           { armor: 'Light', weapon: 'Shield + Light', stamina: '+6/echelon', speed: '+1', stability: '—', meleeDmg: '+1/+1/+1', rangedDmg: '+1/+1/+1', rangedRange: '+5', disengage: '+1', sigAbility: 'Raider\'s Awe: deal 3–8+ damage; impose a bane on the target\'s next roll' },
  'Rapid Fire':       { armor: 'Light', weapon: 'Bow', stamina: '+3/echelon', speed: '+1', stability: '—', meleeDmg: '—', rangedDmg: '+2/+2/+2', rangedRange: '+7', disengage: '+1', sigAbility: 'Two Shot: deal 4–8 damage to two targets within 12 squares' },
  'Ranger':           { armor: 'Medium', weapon: 'Bow + Medium', stamina: '+6/echelon', speed: '+1', stability: '—', meleeDmg: '+1/+1/+1', rangedDmg: '+1/+1/+1', rangedRange: '+5', disengage: '+1', sigAbility: 'Hamstring Shot: deal 3–7+ damage; target is slowed until they save' },
  'Retiarius':        { armor: 'Light', weapon: 'Net + Polearm', stamina: '+3/echelon', speed: '+1', stability: '—', meleeDmg: '+2/+2/+2', rangedDmg: '—', rangedRange: '—', disengage: '+1', sigAbility: 'Net and Stab: deal 4–8+ damage; target slowed or restrained until they save' },
  'Shining Armor':    { armor: 'Heavy', weapon: 'Shield + Medium', stamina: '+12/echelon', speed: '—', stability: '+1', meleeDmg: '+2/+2/+2', rangedDmg: '—', rangedRange: '—', disengage: '—', sigAbility: 'Protective Attack: deal 5–17+ damage; taunt target until end of next turn' },
  'Sniper':           { armor: 'None', weapon: 'Bow', stamina: '—', speed: '+1', stability: '—', meleeDmg: '—', rangedDmg: '+0/+0/+4', rangedRange: '+10', disengage: '+1', sigAbility: 'Patient Shot: deal 3–13+ damage; bonus if you haven\'t moved this turn' },
  'Spellsword':       { armor: 'Light', weapon: 'Shield + Medium', stamina: '+6/echelon', speed: '+1', stability: '+1', meleeDmg: '+2/+2/+2', rangedDmg: '—', rangedRange: '—', disengage: '—', sigAbility: 'Leaping Lightning: deal 5–11+ lightning damage; splash to nearby creatures' },
  'Stormwight':       { armor: 'Medium', weapon: 'Natural', stamina: '+6/echelon', speed: '+2', stability: '—', meleeDmg: '+2/+2/+2', rangedDmg: '—', rangedRange: '—', disengage: '—', sigAbility: 'Bestial Strike: deal 4–10+ damage in beast form with additional effects' },
  'Swashbuckler':     { armor: 'Light', weapon: 'Medium', stamina: '+3/echelon', speed: '+3', stability: '—', meleeDmg: '+2/+2/+2', rangedDmg: '—', rangedRange: '—', disengage: '+1', sigAbility: 'Fancy Footwork: deal 5–10+ damage; push target and shift into their space' },
  'Warrior Priest':   { armor: 'Heavy', weapon: 'Light', stamina: '+9/echelon', speed: '+1', stability: '+1', meleeDmg: '+1/+1/+1', rangedDmg: '—', rangedRange: '—', disengage: '—', sigAbility: 'Weakening Brand: deal 3–8+ holy damage; target weakened until end of next turn' },
};

// ── Complications ─────────────────────────────────────────────────────────────
// Optional — require Director approval. Each grants one perk and one drawback.

const COMPLICATION_DATA = [
  {
    name: 'None',
    desc: 'No complication — a clean slate.',
    perk: 'None.',
    drawback: 'None.',
  },
  {
    name: 'Artifact Bonded',
    desc: 'You are bound to a powerful artifact that manifests in your hour of need.',
    perk: 'When you are reduced to 0 Stamina in combat, the artifact appears and activates one of its properties (until end of encounter, until you use a property, or until you regain Stamina).',
    drawback: 'Each time the artifact appears, lose 1 Recovery. If you have none remaining, take 1d10 unreducible damage.',
  },
  {
    name: 'Chosen One',
    desc: 'You are destined for something great — or terrible.',
    perk: 'Gain 3 destiny points (regain 1 per Victory). Spend them as an alternative to your class resource.',
    drawback: 'Spending destiny points deals psychic damage to you that bypasses all reduction. A cult seeking you always learns your location when you spend them.',
  },
  {
    name: 'Corrupted Mentor',
    desc: 'Your mentor taught you well — and left a dark mark on your soul.',
    perk: 'Corrupt Spirit maneuver: deal extra corruption damage equal to your highest characteristic on a single-target heroic ability.',
    drawback: 'Begin with holy weakness 1. Each use increases it by 1 (up to your recovery value). Resets to 1 when you take holy damage.',
  },
  {
    name: 'Curse of Immortality',
    desc: 'You do not age, and death cannot claim you — but it still tries.',
    perk: 'You do not age. When dying, you enter suspended animation indistinguishable from death. You resurrect after 12 hours (if your body survives) at full Stamina.',
    drawback: 'Bane on tests to recall lore (your long life has blurred the details).',
  },
  {
    name: 'Hunted',
    desc: 'Someone or something dangerous is tracking you.',
    perk: 'Gain one intrigue skill. When you lay low, your pursuers lose track of your location.',
    drawback: 'Each time you gain Renown, your pursuer learns your location. Within 1d10 days, they will find you unless you lay low.',
  },
  {
    name: 'Infernal Contract',
    desc: 'You signed something you perhaps shouldn\'t have.',
    perk: 'Combat advantage: determine initiative on a roll of 4+ (when neither side is surprised).',
    drawback: 'A fiendish patron demands favors. Refusal causes devils to come after you and those you care about.',
  },
  {
    name: 'Rival',
    desc: 'Someone with similar skills sees you as competition.',
    perk: 'Choose one skill — you gain a +3 bonus instead of the usual +2.',
    drawback: 'Bane on tests using that skill in situations where your rival is involved or watching.',
  },
  {
    name: 'Thrill Seeker',
    desc: 'You live for danger, and danger finds you.',
    perk: 'Your party earns a hero token at 2, 4, and 6 Victories (earlier than normal).',
    drawback: 'Your party does not earn a hero token at the start of a new session (the normal source).',
  },
];


// ── Ability pick counts per class (level 1) ──────────────────────────────────
// signatures: how many signature abilities the player picks
// heroic: how many non-signature heroic abilities the player picks
const CLASS_ABILITY_PICKS = {
  Conduit:      { signatures: 1, heroic: 2 },
  Elementalist: { signatures: 1, heroic: 2 },
  Fury:         { signatures: 1, heroic: 2 },
  Null:         { signatures: 1, heroic: 2 },
  Shadow:       { signatures: 1, heroic: 2 },
  Tactician:    { signatures: 1, heroic: 2 },
  Talent:       { signatures: 1, heroic: 2 },
};
