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

// ── Revenant: Former Life options ────────────────────────────────────────────
// Revenants choose their ancestry before death. Any ancestry except Revenant
// itself is valid. Used to build the Former Life picker in Step 2.
const REVENANT_FORMER_LIFE_OPTIONS = [
  'Devil', 'Dragon Knight', 'Dwarf', 'Hakaan', 'High Elf', 'Human',
  'Memonek', 'Orc', 'Polder', 'Time Raider', 'Wode Elf',
];

// ── Ancestry-specific heritage cultures ──────────────────────────────────────
// Optional 4th culture layer — options filtered by chosen ancestry.
// Each entry: { name, quickBuild, skill, desc }

const ANCESTRY_CULTURES = {
  'Devil': [
    { name: 'Infernal Court',    quickBuild: 'Flirt',     skill: 'One interpersonal skill', desc: 'You were raised among the schemes and politics of an infernal court, where power is currency and every favor carries a hidden cost.' },
    { name: 'Shadow Enclave',    quickBuild: 'Lie',       skill: 'One intrigue skill',       desc: 'Your community lived apart from mortal society, surviving through careful deception and well-kept secrets.' },
  ],
  'Dragon Knight': [
    { name: 'Knightly Order',    quickBuild: 'Lead',      skill: 'One interpersonal skill', desc: 'You were raised in a formal chapterhouse of Dragon Knights, bound by oaths and martial traditions older than most kingdoms.' },
    { name: 'Draconic Enclave',  quickBuild: 'History',   skill: 'One lore skill',           desc: 'Your small community of bonded knights guarded sacred draconic sites, steeped in the lore of your ancient pact.' },
  ],
  'Dwarf': [
    { name: 'Clan Hold',         quickBuild: 'Culture',   skill: 'One crafting or lore skill', desc: 'You grew up in a dwarven clan hold — a fortified community built into stone, governed by tradition and kinship.' },
    { name: 'Deep Forge',        quickBuild: 'Blacksmithing', skill: 'Blacksmithing',        desc: 'Your community lived around a great forge deep underground, and from childhood you understood the language of craft and fire.' },
    { name: 'Stone City',        quickBuild: 'Alertness', skill: 'One intrigue or lore skill', desc: 'You were raised in a great dwarven city carved from living rock, teeming with merchants, engineers, and memory-keepers.' },
  ],
  'Hakaan': [
    { name: 'Titan Settlement',  quickBuild: 'Endurance', skill: 'One exploration skill',    desc: 'Your people lived in a sprawling settlement of giants — close-knit, communal, and proud of their place in the world.' },
    { name: 'Mountain Community',quickBuild: 'Nature',    skill: 'One exploration or crafting skill', desc: 'You grew up high in the mountains, where the air was thin and survival demanded both strength and resourcefulness.' },
  ],
  'High Elf': [
    { name: 'Ancient City',      quickBuild: 'Culture',   skill: 'One lore skill',           desc: 'You were raised in one of the great elven cities — places of art, memory, and ancient power that predate human civilization.' },
    { name: 'Noble Court',       quickBuild: 'Persuade',  skill: 'One interpersonal skill',  desc: 'Your community centered on an elven court where politics, poetry, and long-held tradition shaped every interaction.' },
    { name: "Scholar's Enclave", quickBuild: 'Magic',     skill: 'One lore skill',           desc: 'You were raised among elven scholars dedicated to preserving and interpreting the accumulated knowledge of ages past.' },
  ],
  'Human': [
    { name: 'Trade City',        quickBuild: 'Alertness', skill: 'One intrigue skill',       desc: 'You grew up in a bustling human trade hub where merchants, travelers, and opportunists from across the world converged.' },
    { name: 'Frontier Town',     quickBuild: 'Endurance', skill: 'One exploration skill',    desc: 'Your community was a frontier settlement — self-reliant, scrappy, and always one season from disaster.' },
  ],
  'Memonek': [
    { name: 'Creation Lab',      quickBuild: 'Magic',     skill: 'One lore skill',           desc: 'You emerged from an arcane workshop and were raised among the scholars and artificers who study constructed life.' },
    { name: 'Clockwork City',    quickBuild: 'Alertness', skill: 'One intrigue or lore skill', desc: 'You were raised in a city built for and by constructed beings — orderly, efficient, and deeply logical in all things.' },
  ],
  'Orc': [
    { name: 'War-Clan',          quickBuild: 'Intimidate',skill: 'One exploration or intrigue skill', desc: 'You were raised in an orc war-clan where strength was respect, and every challenge was answered with decisive action.' },
    { name: 'Tribal Settlement', quickBuild: 'Nature',    skill: 'One exploration skill',    desc: 'Your community was a tribal settlement with deep traditions, skilled hunters, and fierce pride in your shared heritage.' },
  ],
  'Polder': [
    { name: 'Burrow Town',       quickBuild: 'Sneak',     skill: 'One intrigue skill',       desc: 'You grew up in a polder burrow town — underground, hidden from larger folk, built on speed, wit, and tight community bonds.' },
    { name: 'River Community',   quickBuild: 'Navigate',  skill: 'One exploration skill',    desc: 'Your people lived along rivers and waterways, trading, fishing, and moving fast whenever danger appeared.' },
  ],
  'Revenant': [
    { name: 'Returned Community',quickBuild: 'Supernatural', skill: 'One lore skill',       desc: 'You drifted toward others like yourself — undead with unfinished purpose, forming a small enclave of those who refuse to let death end their story.' },
    { name: 'Life Before Death', quickBuild: 'History',   skill: 'One lore skill',           desc: 'As a revenant your heritage is simply your life before. You carry those memories — every name, every failure, every vow — as your truest inheritance.' },
  ],
  'Time Raider': [
    { name: 'Temporal Nexus',    quickBuild: 'Magic',     skill: 'One lore skill',           desc: 'Your people lived near a convergence of temporal energy — a place where time ran differently and change was the only constant.' },
    { name: 'Displaced Enclave', quickBuild: 'Psionics',  skill: 'One lore skill',           desc: 'Your community was a group of time-displaced peoples, sharing knowledge across eras and adapting together to survive.' },
  ],
  'Wode Elf': [
    { name: 'Forest Grove',      quickBuild: 'Nature',    skill: 'One exploration skill',    desc: 'You were raised in a deep forest grove — a living settlement woven into the trees, hidden from any who did not belong.' },
    { name: 'Wode Circle',       quickBuild: 'Hide',      skill: 'One exploration or intrigue skill', desc: 'Your community was a wode circle, a druidic enclave of guardians who kept ancient bargains with the living wild.' },
  ],
};

// ── Careers ───────────────────────────────────────────────────────────────────

const CAREER_DATA = [
  { name: 'Agent',             fixedSkills: ['Sneak'],               chooseSkills: { count: 2, categories: ['interpersonal', 'intrigue'] },         desc: 'Former intelligence operative or spy.',              skills: 'Sneak + 1 interpersonal + 1 intrigue',      languages: 2, resources: 'One intrigue perk' },
  { name: 'Aristocrat',        fixedSkills: [],                      chooseSkills: { count: 2, categories: ['interpersonal', 'lore'] },              desc: 'Born into nobility or landed gentry.',               skills: '1 interpersonal + 1 lore',                  languages: 1, resources: 'Renown +1, Wealth +1, one lore perk' },
  { name: 'Artisan',           fixedSkills: [],                      chooseSkills: { count: 2, categories: ['crafting'] },                          desc: 'Skilled craftsperson or maker.',                    skills: '2 crafting skills',                         languages: 1, resources: 'Project Points 240, one crafting perk' },
  { name: 'Beggar',            fixedSkills: ['Rumors'],              chooseSkills: { count: 2, categories: ['exploration', 'interpersonal'] },       desc: 'Survived on the margins of society.',               skills: 'Rumors + 1 exploration + 1 interpersonal',  languages: 2, resources: 'One interpersonal perk' },
  { name: 'Criminal',          fixedSkills: ['Criminal Underworld'], chooseSkills: { count: 2, categories: ['intrigue'] },                          desc: 'Operated outside the law.',                         skills: 'Criminal Underworld + 2 intrigue',           languages: 1, resources: 'Project Points 120, one intrigue perk' },
  { name: 'Disciple',          fixedSkills: ['Religion'],            chooseSkills: { count: 2, categories: ['lore'] },                             desc: 'Devoted follower of a religion or philosophy.',     skills: 'Religion + 2 lore',                         languages: 0, resources: 'Project Points 240, one supernatural perk' },
  { name: 'Explorer',          fixedSkills: ['Navigate'],            chooseSkills: { count: 2, categories: ['exploration'] },                       desc: 'Charted unknown territories and wilderness.',        skills: 'Navigate + 2 exploration',                  languages: 2, resources: 'One exploration perk' },
  { name: 'Farmer',            fixedSkills: ['Handle Animals'],      chooseSkills: { count: 2, categories: ['exploration'] },                       desc: 'Worked the land and raised livestock.',             skills: 'Handle Animals + 2 exploration',             languages: 1, resources: 'Project Points 120, one exploration perk' },
  { name: 'Gladiator',         fixedSkills: [],                      chooseSkills: { count: 2, categories: ['exploration'] },                       desc: 'Fought for crowds in arenas.',                      skills: '2 exploration skills',                      languages: 1, resources: 'Renown +2, one exploration perk' },
  { name: 'Laborer',           fixedSkills: ['Endurance'],           chooseSkills: { count: 2, categories: ['crafting', 'exploration'] },           desc: 'Did hard physical work to survive.',                skills: 'Endurance + 2 crafting or exploration',      languages: 1, resources: 'Project Points 120, one exploration perk' },
  { name: "Mage's Apprentice", fixedSkills: ['Magic'],               chooseSkills: { count: 2, categories: ['lore'] },                             desc: 'Studied under a practicing wizard or mage.',        skills: 'Magic + 2 lore',                            languages: 1, resources: 'Renown +1, one supernatural perk' },
  { name: 'Performer',         fixedSkills: ['Perform'],             chooseSkills: { count: 2, categories: ['interpersonal'] },                     desc: 'Entertained audiences as a musician or actor.',     skills: 'Perform + 2 interpersonal',                 languages: 0, resources: 'Renown +2, one interpersonal perk' },
  { name: 'Politician',        fixedSkills: [],                      chooseSkills: { count: 2, categories: ['interpersonal'] },                     desc: 'Navigated the halls of power.',                     skills: '2 interpersonal skills',                    languages: 1, resources: 'Renown +1, Wealth +1, one interpersonal perk' },
  { name: 'Sage',              fixedSkills: [],                      chooseSkills: { count: 2, categories: ['lore'] },                             desc: 'Spent years studying and cataloguing knowledge.',   skills: '2 lore skills',                             languages: 1, resources: 'Project Points 240, one lore perk' },
  { name: 'Sailor',            fixedSkills: ['Swim'],                chooseSkills: { count: 2, categories: ['exploration'] },                       desc: 'Worked the seas, rivers, or lakes.',                skills: 'Swim + 2 exploration',                      languages: 2, resources: 'One exploration perk' },
  { name: 'Soldier',           fixedSkills: [],                      chooseSkills: { count: 2, categories: ['exploration', 'intrigue'] },           desc: 'Served in a military force or mercenary company.',  skills: '1 exploration + 1 intrigue',                languages: 2, resources: 'Renown +1, one exploration perk' },
  { name: 'Warden',            fixedSkills: ['Nature'],              chooseSkills: { count: 2, categories: ['exploration', 'intrigue'] },           desc: 'Protected a territory or wilderness area.',         skills: 'Nature + 1 exploration + 1 intrigue',       languages: 1, resources: 'Project Points 120, one exploration perk' },
  { name: 'Watch Officer',     fixedSkills: ['Alertness'],           chooseSkills: { count: 2, categories: ['intrigue'] },                          desc: 'Enforced the law in a city or town.',               skills: 'Alertness + 2 intrigue',                    languages: 2, resources: 'One exploration perk' },
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
  Beastheart: [
    { name: 'Guardian',  skill: 'Alertness',  feature: 'Stalwart Bond',     desc: 'Your bond is protective. When you or your companion takes damage, the other can use a free triggered action to move toward them. Subclass abilities focus on shielding your companion and keeping both of you in the fight.' },
    { name: 'Prowler',   skill: 'Sneak',      feature: 'Flanking Instinct', desc: 'You and your companion are expert hunters. You gain flanking benefits whenever you and your companion have the target between you, and can shift to establish flanking as a free maneuver once per turn.' },
    { name: 'Punisher',  skill: 'Intimidate', feature: 'Frenzy Strike',     desc: 'Your companion grows more dangerous as Ferocity rises. Damage and effects on companion abilities scale with current Ferocity, and entering Rampage triggers a free strike.' },
    { name: 'Spark',     skill: 'Nature',     feature: 'Wild Element',      desc: 'Your companion channels elemental power. Choose a damage type at creation — companion abilities deal that type and gain additional options at higher Ferocity.' },
  ],
};

// ── Kit stats ─────────────────────────────────────────────────────────────────
// ── Kit access per class ─────────────────────────────────────────────────────
// Only Shadow, Tactician, and Beastheart use standard kits.
// Fury gets Primordial Aspects. Conduit, Elementalist, Null, Talent get none.

const CLASS_KIT_ACCESS = {
  Shadow:       { type: 'standard',          count: 1 },
  Tactician:    { type: 'standard',          count: 2 },   // Field Arsenal: 2 kits
  Beastheart:   { type: 'standard',          count: 1 },
  Fury:         { type: 'primordial_aspect'           },   // subclass-specific aspects
  Conduit:      { type: 'none'                        },
  Elementalist: { type: 'none'                        },
  Null:         { type: 'none'                        },
  Talent:       { type: 'none'                        },
};

// ── Fury Primordial Aspects ───────────────────────────────────────────────────
// Each Fury subclass has its own aspect list.
// Stormwight aspects reference the STORMWIGHT_KITS / KIT_STATS data.
// Berserker and Reaver are display-only pending stat verification (see TODO).
// TODO: Verify Berserker and Reaver aspect combat stats from Forge Steel source.

const FURY_ASPECTS = {
  Berserker: [
    {
      name: 'Crushing Might',
      role: 'Primordial Aspect',
      desc: 'Become a force of unstoppable physical power. Your strikes hit harder, and you can lift, throw, and break things no mortal should.',
      sigAbility: 'Primordial Strength: passive — bonus damage and extraordinary feats of physical force.',
    },
    {
      name: 'Raging Frenzy',
      role: 'Primordial Aspect',
      desc: 'Your fury builds to a constant boiling point. Each strike feeds the next, and your enemies can never rest.',
      sigAbility: 'Unrelenting Assault: passive — gain bonus attacks as your rage escalates.',
    },
  ],
  Reaver: [
    {
      name: 'Cunning Predator',
      role: 'Primordial Aspect',
      desc: 'Strike from shadow and instinct, hitting where the enemy is weakest and vanishing before they can reply.',
      sigAbility: 'Primordial Cunning: passive — shift when enemies engage you, bonus damage on flanks.',
    },
    {
      name: 'Savage Ambush',
      role: 'Primordial Aspect',
      desc: 'Become the apex hunter. The first strike is devastating, and your prey never sees you coming.',
      sigAbility: 'First Blood: passive — massive bonus damage on your first strike each encounter.',
    },
  ],
  Stormwight: [
    // These reference STORMWIGHT_KITS / KIT_STATS — full verified stats available
    { name: 'Boren',  ref: 'Boren',  role: 'Bear Aspect', desc: 'Channel the bear: large, durable, cold-north aspect. Claws that grab, and can pull instead of push with forced movement.' },
    { name: 'Corven', ref: 'Corven', role: 'Crow Aspect', desc: 'Channel the crow: fast and stealthy, anabatic wind. Burst strikes that punish enemies who surround you.' },
    { name: 'Raden',  ref: 'Raden',  role: 'Rat Aspect',  desc: 'Channel the rat: mobile and elusive, the rat flood. Quick pounces that push enemies back.' },
    { name: 'Vuken',  ref: 'Vuken',  role: 'Wolf Aspect', desc: 'Channel the wolf: fleet-footed hunter, the thunderstorm. Attacks that knock enemies prone.' },
  ],
};

// Full mechanical stats for each kit.
const KIT_STATS = {
  // ── Universal kits (all classes) ─────────────────────────────────────────
  'Arcane Archer':    { armor: 'None',   weapon: 'Bow',                stamina: '+0/echelon', speed: '+1', stability: '—',  meleeDmg: '—',         rangedDmg: '+2/+2/+2', rangedRange: '+10', disengage: '+1', sigAbility: 'Exploding Arrow',               sigTiers: 'T1: 3+A/R/I/P fire dmg | T2: 5+A/R/I/P fire dmg | T3: 8+A/R/I/P fire dmg' },
  'Battlemind':       { armor: 'Light',  weapon: 'Medium',             stamina: '+3/echelon', speed: '+2', stability: '+1', meleeDmg: '+2/+2/+2',  rangedDmg: '—',        rangedRange: '—',   disengage: '—',  sigAbility: 'Unmooring',                     sigTiers: 'T1: 3+M/R/I/P dmg | T2: 6+M/R/I/P dmg | T3: 9+M/R/I/P dmg' },
  'Cloak and Dagger': { armor: 'Light',  weapon: 'Light × 2',          stamina: '+3/echelon', speed: '+2', stability: '—',  meleeDmg: '+1/+1/+1',  rangedDmg: '+1/+1/+1', rangedRange: '+5',  disengage: '+1', sigAbility: 'Fade',                          sigTiers: 'T1: 2+M/A dmg; shift 1 | T2: 5+M/A dmg; shift 2 | T3: 7+M/A dmg; shift 3' },
  'Dual Wielder':     { armor: 'Medium', weapon: 'Light + Medium',     stamina: '+6/echelon', speed: '+2', stability: '—',  meleeDmg: '+2/+2/+2',  rangedDmg: '—',        rangedRange: '—',   disengage: '+1', sigAbility: 'Double Strike',                 sigTiers: 'T1: 2 dmg | T2: 4 dmg | T3: 6 dmg (two targets)' },
  'Guisarmier':       { armor: 'Medium', weapon: 'Polearm',            stamina: '+6/echelon', speed: '—',  stability: '+1', meleeDmg: '+2/+2/+2',  rangedDmg: '—',        rangedRange: '—',   disengage: '—',  sigAbility: 'Forward Thrust, Backward Smash', sigTiers: 'T1: 2 dmg | T2: 5 dmg | T3: 7 dmg (two creatures within Melee 2)' },
  'Martial Artist':   { armor: 'None',   weapon: 'Unarmed',            stamina: '+3/echelon', speed: '+3', stability: '—',  meleeDmg: '+2/+2/+2',  rangedDmg: '—',        rangedRange: '—',   disengage: '+1', sigAbility: 'Battle Grace',                  sigTiers: 'T1: 3+M/A dmg | T2: 6+M/A dmg; swap places | T3: 9+M/A dmg; swap places' },
  'Mountain':         { armor: 'Heavy',  weapon: 'Heavy',              stamina: '+9/echelon', speed: '—',  stability: '+2', meleeDmg: '+0/+0/+4',  rangedDmg: '—',        rangedRange: '—',   disengage: '—',  sigAbility: 'Pain For Pain',                 sigTiers: 'T1: 3+M/A dmg | T2: 5+M/A dmg | T3: 9+M/A dmg' },
  'Panther':          { armor: 'None',   weapon: 'Heavy',              stamina: '+6/echelon', speed: '+1', stability: '+1', meleeDmg: '+0/+0/+4',  rangedDmg: '—',        rangedRange: '—',   disengage: '—',  sigAbility: 'Devastating Rush',              sigTiers: 'T1: 3+M/A dmg | T2: 6+M/A dmg | T3: 9+M/A dmg' },
  'Pugilist':         { armor: 'None',   weapon: 'Unarmed',            stamina: '+6/echelon', speed: '+2', stability: '+1', meleeDmg: '+1/+1/+1',  rangedDmg: '—',        rangedRange: '—',   disengage: '—',  sigAbility: "Let's Dance",                   sigTiers: "T1: 2+M/A dmg | T2: 5+M/A dmg; slide 1 | T3: 7+M/A dmg; slide 2" },
  'Raider':           { armor: 'Light',  weapon: 'Shield + Light',     stamina: '+6/echelon', speed: '+1', stability: '—',  meleeDmg: '+1/+1/+1',  rangedDmg: '+1/+1/+1', rangedRange: '+5',  disengage: '+1', sigAbility: "Raider's Awe",                  sigTiers: 'T1: 2+M/A dmg | T2: 5+M/A dmg | T3: 7+M/A dmg' },
  'Ranger':           { armor: 'Medium', weapon: 'Bow + Medium',       stamina: '+6/echelon', speed: '+1', stability: '—',  meleeDmg: '+1/+1/+1',  rangedDmg: '+1/+1/+1', rangedRange: '+5',  disengage: '+1', sigAbility: 'Hamstring Shot',                sigTiers: 'T1: 2+M/A dmg; A<weak slowed (save ends) | T2: 4+M/A; A<avg slowed | T3: 6+M/A; A<strong slowed' },
  'Rapid Fire':       { armor: 'Light',  weapon: 'Bow',                stamina: '+3/echelon', speed: '+1', stability: '—',  meleeDmg: '—',         rangedDmg: '+2/+2/+2', rangedRange: '+7',  disengage: '+1', sigAbility: 'Two Shot',                      sigTiers: 'T1: 2 dmg | T2: 4 dmg | T3: 6 dmg (two targets within 12)' },
  'Retiarius':        { armor: 'Light',  weapon: 'Net + Polearm',      stamina: '+3/echelon', speed: '+1', stability: '—',  meleeDmg: '+2/+2/+2',  rangedDmg: '—',        rangedRange: '—',   disengage: '+1', sigAbility: 'Net And Stab',                  sigTiers: 'T1: 2+M/A dmg; A<weak slowed (EoT) | T2: 4+M/A; A<avg slowed (EoT) | T3: 6+M/A; A<strong restrained (EoT)' },
  'Shining Armor':    { armor: 'Heavy',  weapon: 'Shield + Medium',    stamina: '+12/echelon',speed: '—',  stability: '+1', meleeDmg: '+2/+2/+2',  rangedDmg: '—',        rangedRange: '—',   disengage: '—',  sigAbility: 'Protective Attack',             sigTiers: 'T1: 3+M/A dmg | T2: 6+M/A dmg | T3: 9+M/A dmg' },
  'Sniper':           { armor: 'None',   weapon: 'Bow',                stamina: '+0/echelon', speed: '+1', stability: '—',  meleeDmg: '—',         rangedDmg: '+0/+0/+4', rangedRange: '+10', disengage: '+1', sigAbility: 'Patient Shot',                  sigTiers: 'T1: 3+M/A dmg | T2: 6+M/A dmg | T3: 9+M/A dmg' },
  'Spellsword':       { armor: 'Light',  weapon: 'Shield + Medium',    stamina: '+6/echelon', speed: '+1', stability: '+1', meleeDmg: '+2/+2/+2',  rangedDmg: '—',        rangedRange: '—',   disengage: '—',  sigAbility: 'Leaping Lightning',             sigTiers: 'T1: 3+M/R/I/P lightning | T2: 6+M/R/I/P lightning | T3: 9+M/R/I/P lightning' },
  'Stick and Robe':   { armor: 'Light',  weapon: 'Polearm',            stamina: '+3/echelon', speed: '+2', stability: '—',  meleeDmg: '+1/+1/+1',  rangedDmg: '—',        rangedRange: '—',   disengage: '+1', sigAbility: 'Where I Want You',              sigTiers: 'T1: 3+M/A dmg | T2: 6+M/A dmg; slide 1 | T3: 9+M/A dmg; slide 3' },
  'Swashbuckler':     { armor: 'Light',  weapon: 'Medium',             stamina: '+3/echelon', speed: '+3', stability: '—',  meleeDmg: '+2/+2/+2',  rangedDmg: '—',        rangedRange: '—',   disengage: '+1', sigAbility: 'Fancy Footwork',                sigTiers: 'T1: 3+M/A dmg | T2: 5+M/A dmg; push 1 | T3: 8+M/A dmg; push 2' },
  'Sword and Board':  { armor: 'Medium', weapon: 'Shield + Medium',    stamina: '+9/echelon', speed: '—',  stability: '+1', meleeDmg: '+2/+2/+2',  rangedDmg: '—',        rangedRange: '—',   disengage: '+1', sigAbility: 'Shield Bash',                   sigTiers: 'T1: 2+M/A dmg; push 1 | T2: 5+M/A dmg; push 2 | T3: 7+M/A dmg; push 3; M<strong prone' },
  'Warrior Priest':   { armor: 'Heavy',  weapon: 'Light',              stamina: '+9/echelon', speed: '+1', stability: '+1', meleeDmg: '+1/+1/+1',  rangedDmg: '—',        rangedRange: '—',   disengage: '—',  sigAbility: 'Weakening Brand',               sigTiers: 'T1: 2+M/R/I/P holy dmg | T2: 4+M/R/I/P holy dmg | T3: 7+M/R/I/P holy dmg' },
  'Whirlwind':        { armor: 'None',   weapon: 'Whip',               stamina: '+0/echelon', speed: '+3', stability: '—',  meleeDmg: '+1/+1/+1',  rangedDmg: '—',        rangedRange: '—',   disengage: '+1', sigAbility: 'Extension Of My Arm',           sigTiers: 'T1: 3+M/A dmg; vertical pull 1 | T2: 6+M/A dmg; vertical pull 2 | T3: 9+M/A dmg; vertical pull 3' },
  // ── Stormwight Beast Aspect kits (Fury/Stormwight only) ──────────────────
  'Boren':            { armor: 'None',   weapon: 'Unarmed (bear form)',stamina: '+9/echelon', speed: '—',  stability: '+2', meleeDmg: '+0/+0/+4',  rangedDmg: '—',        rangedRange: '—',   disengage: '—',  sigAbility: 'Bear Claws',                    sigTiers: 'T1: 2+M dmg; M<weak grabbed | T2: 5+M dmg; M<avg grabbed | T3: 7+M dmg; M<strong grabbed' },
  'Corven':           { armor: 'None',   weapon: 'Unarmed (crow form)',stamina: '+3/echelon', speed: '+3', stability: '—',  meleeDmg: '+2/+2/+2',  rangedDmg: '—',        rangedRange: '—',   disengage: '+1', sigAbility: 'Wing Buffet',                   sigTiers: 'T1: 1 dmg (burst 1, each enemy) | T2: 4 dmg | T3: 6 dmg; shift after' },
  'Raden':            { armor: 'None',   weapon: 'Unarmed (rat form)', stamina: '+3/echelon', speed: '+3', stability: '—',  meleeDmg: '+2/+2/+2',  rangedDmg: '—',        rangedRange: '—',   disengage: '+1', sigAbility: 'Driving Pounce',                sigTiers: 'T1: 2+A dmg | T2: 5+A dmg; push 1 | T3: 7+A dmg; push 2' },
  'Vuken':            { armor: 'None',   weapon: 'Unarmed (wolf form)',stamina: '+9/echelon', speed: '+2', stability: '—',  meleeDmg: '+2/+2/+2',  rangedDmg: '—',        rangedRange: '—',   disengage: '+1', sigAbility: 'Unbalancing Attack',            sigTiers: 'T1: 2+M dmg; A<weak prone | T2: 5+M dmg; A<avg prone | T3: 7+M dmg; A<strong prone' },
};

// ── Beastheart companion species ──────────────────────────────────────────────
// Full data for all 14 companion options (sourced from live Forge Steel app).
// Drake has requiresSubChoice: true — player must also pick an element type.

const BEASTHEART_COMPANION_SPECIES = [
  {
    name: 'Basilisk', type: 'Beast', size: '1L', speed: 4,
    stamina: 21, stability: 2,
    might: 2, agility: 1, reason: -1, intuition: 2, presence: 2,
    immunities: ['Poison 3'], movement: [],
    heroBenefit: null, role: 'Controller',
    specialTrait: 'Stoned — a condition that can petrify enemies over time. Adjacent creatures can cut the stone away (dealing damage) to end it early.',
    signatureManeuver: 'Petrify: Melee 1 or Ranged 5. Corruption damage (3 + MGT) + Stoned (save ends). Spend 1 Ferocity: target is also Slowed while Stoned.',
    desc: 'Ancient and terrible. Its petrifying gaze afflicts enemies with a calcifying condition, slowing and eventually turning them to stone.',
  },
  {
    name: 'Bear', type: 'Animal', size: '1L', speed: 5,
    stamina: 21, stability: 2,
    might: 2, agility: 1, reason: -1, intuition: 2, presence: 2,
    immunities: [], movement: ['Climb'],
    heroBenefit: '+1 Stability (passive, always active)', role: 'Bruiser',
    specialTrait: 'Strong Like Bear: you gain +1 to your Stability while bonded to this companion.',
    signatureManeuver: 'Backhand: Melee 1. Damage (4 + MGT) + pushed 2 squares. Spend 1 Ferocity: pushed additional squares equal to MGT.',
    desc: 'A massive, unyielding fighter. Mauls targets and pushes them across the battlefield. Grants you improved Stability while bonded.',
  },
  {
    name: 'Boar', type: 'Animal', size: '1M', speed: 5,
    stamina: 21, stability: 2,
    might: 2, agility: 1, reason: -1, intuition: 2, presence: 2,
    immunities: [], movement: [],
    heroBenefit: null, role: 'Bruiser',
    specialTrait: 'Spiteful Endurance: while Winded, the boar has damage immunity equal to their MGT score and ignores Bleeding.',
    signatureManeuver: 'Gore: Melee 1. Moves in a straight line up to speed; deals damage (3 + MGT) at end. Bonus damage equal to MGT if moved toward target. Spend 1 Ferocity: target is Bleeding until end of next turn.',
    desc: 'Slow to start but relentless once charging. More durable when bloodied, and inflicts Bleeding on targets.',
  },
  {
    name: 'Condor', type: 'Animal', size: '1M', speed: 7,
    stamina: 21, stability: 0,
    might: 2, agility: 2, reason: -1, intuition: 2, presence: 1,
    immunities: [], movement: ['Fly'],
    heroBenefit: null, role: 'Skirmisher',
    specialTrait: 'Moving Target: while flying with speed > 0, ranged strikes against the condor take a bane.',
    signatureManeuver: 'Flurry of Wings: Melee 1. Damage (3 + MGT). Enemies are Weakened while adjacent to the condor until end of your next turn. Spend 1 Ferocity: Weakened becomes Taunted.',
    desc: 'A fast aerial striker that suppresses nearby enemies. Ranged attacks against it take a bane while it\'s in motion.',
  },
  {
    name: 'Deinonychus', type: 'Animal', size: '1M', speed: 7,
    stamina: 21, stability: 1,
    might: 2, agility: 2, reason: -1, intuition: 2, presence: 1,
    immunities: [], movement: [],
    heroBenefit: null, role: 'Striker',
    specialTrait: 'Blood Frenzy: whenever the deinonychus deals damage to a Bleeding creature, it gains 1 surge.',
    signatureManeuver: 'Terrible Claws: Melee 1. Damage (3 + MGT). If target has M < −1, they are Bleeding until end of next turn. Spend 1 Ferocity: if M < 0, Bleeding (save ends).',
    desc: 'A fast predator that rewards targeting already-wounded enemies. Gains surges from Bleeding creatures and inflicts the condition.',
  },
  {
    name: 'Drake', type: 'Dragon', size: '1M', speed: 5,
    stamina: 21, stability: 1,
    might: 2, agility: 1, reason: -1, intuition: 2, presence: 2,
    immunities: ['Chosen element 3'], movement: ['Fly'],
    heroBenefit: 'Immunity 3 to the drake\'s attuned damage type (shared with you)', role: 'Striker/Area',
    specialTrait: 'Elementally Attuned: choose a damage type at creation. All drake abilities use this type. You gain immunity 3 to this type.',
    signatureManeuver: 'Drake Breath: Area, 1 cube within 1. Each creature in area takes damage (MGT) of attuned type. Spend 1–2 Ferocity: expands to 3-cube (1 pt) or 4-cube (2 pt).',
    desc: 'A young dragon-kin with elemental breath and flight. You choose its element type at creation — both you and the drake gain immunity to that damage type.',
    requiresSubChoice: true,
    subChoiceLabel: 'Elemental Attunement',
    subChoiceOptions: ['Acid', 'Cold', 'Corruption', 'Fire', 'Lightning', 'Poison', 'Sonic'],
  },
  {
    name: 'Elemental Spark', type: 'Elemental', size: '1M', speed: 7,
    stamina: 21, stability: 1,
    might: 2, agility: 2, reason: -1, intuition: 2, presence: 1,
    immunities: ['Lightning 3'], movement: [],
    heroBenefit: null, role: 'Striker',
    specialTrait: 'Electric Surge: the first time on a turn that you or the spark deal lightning damage, you gain 1 surge.',
    signatureManeuver: 'Static Shock: Melee 1. Lightning damage (2 + MGT). Spend 1 Ferocity: distance becomes Melee 5.',
    desc: 'A creature of living lightning that arcs electricity at enemies and generates surges when either of you deals lightning damage.',
  },
  {
    name: 'Gummy Ball', type: 'Ooze', size: '1L', speed: 5,
    stamina: 21, stability: 2,
    might: 2, agility: 2, reason: -1, intuition: 2, presence: 1,
    immunities: ['Acid 3'], movement: [],
    heroBenefit: null, role: 'Controller',
    specialTrait: 'Gelatinous: can occupy enemy spaces. A creature fully inside it has line of effect only to the ball. The ball\'s space is Difficult Terrain.',
    signatureManeuver: 'Absorb: Melee 1. Acid damage (3 + MGT). If target has A < −1, ball moves into target\'s space and grabs them if they fit. Spend 1 Ferocity: grabbed creature takes acid damage (MGT) at end of each of ball\'s turns.',
    desc: 'A gelatinous ooze that engulfs enemies in acid, blocks movement, and denies vision by swallowing targets whole.',
  },
  {
    name: 'Hellhound', type: 'Infernal', size: '1M', speed: 7,
    stamina: 21, stability: 1,
    might: 2, agility: 2, reason: -1, intuition: 2, presence: 1,
    immunities: ['Fire 3'], movement: [],
    heroBenefit: 'Fire immunity equal to hellhound\'s fire immunity (shared with you)', role: 'Striker',
    specialTrait: 'Hellish Pact: you have fire immunity equal to the hellhound\'s fire immunity.',
    signatureManeuver: 'Fire Breath: Melee 2. Fire damage (3 + MGT). Spend 1 Ferocity: gain bonus to damage OR distance equal to INU score.',
    desc: 'An infernal beast of living flame with Melee 2 range. Grants you matching fire immunity while bonded.',
  },
  {
    name: 'Lightbender', type: 'Beast', size: '1L', speed: 7,
    stamina: 21, stability: 2,
    might: 2, agility: 1, reason: -1, intuition: 2, presence: 2,
    immunities: [], movement: [],
    heroBenefit: null, role: 'Controller/Support',
    specialTrait: 'Avoidance: any save-ends effect on the lightbender ends automatically at the end of their next turn (no roll needed).',
    signatureManeuver: 'Sparkling Tail Whip: Melee 1. Damage (3 + MGT). If M < −1, target is Dazzled (line of effect only within 1 square) until end of next turn. Spend 1 Ferocity: Dazzled target also takes bane on strikes.',
    desc: 'A large, resilient creature that ignores lingering conditions and blinds enemies with its dazzling strikes.',
  },
  {
    name: 'Panther', type: 'Animal', size: '1M', speed: 7,
    stamina: 21, stability: 1,
    might: 2, agility: 2, reason: -1, intuition: 2, presence: 1,
    immunities: [], movement: ['Climb'],
    heroBenefit: null, role: 'Striker',
    specialTrait: 'Mighty Spring: on Advance or Charge, can jump up to speed squares in any direction (including vertically) as part of movement.',
    signatureManeuver: 'Pounce: Melee 1. Damage (3 + MGT). If M < −1, target knocked prone. Spend 1 Ferocity: jump up to speed before attacking; if jumped ≥ 1 square, M < 0 knocks prone.',
    desc: 'An ambush predator with extraordinary leap distance. Knocks targets prone and can scale vertical surfaces.',
  },
  {
    name: 'Spider', type: 'Animal', size: '1M', speed: 5,
    stamina: 21, stability: 1,
    might: 2, agility: 2, reason: -1, intuition: 2, presence: 1,
    immunities: [], movement: ['Climb'],
    heroBenefit: null, role: 'Controller',
    specialTrait: 'Come Into My Parlor: strikes against Restrained creatures deal extra poison damage equal to twice INU score.',
    signatureManeuver: 'Web Shot: Ranged 5. If M < −1, target Restrained until end of next turn. Spend 1 Ferocity: if M < 0, Restrained (save ends).',
    desc: 'A ranged controller that fires webs to Restrain enemies, then deals bonus poison damage to trapped targets.',
  },
  {
    name: 'Sporeling', type: 'Beast', size: '1S', speed: 5,
    stamina: 21, stability: 0,
    might: 2, agility: 2, reason: -1, intuition: 2, presence: 1,
    immunities: ['Poison 3'], movement: [],
    heroBenefit: null, role: 'Support/Stealth',
    specialTrait: 'Skulker: can end movement in an ally\'s space. While sharing an ally\'s space, has cover.',
    signatureManeuver: 'Spore Puff: Melee 1. Poison damage (3 + MGT). Sporeling becomes invisible to target until end of sporeling\'s next turn or until it deals damage. Spend 1 Ferocity: if M < 0, target is Dazed until end of next turn.',
    desc: 'A small fungal creature that hides inside allies, poisons enemies, and turns invisible after striking.',
  },
  {
    name: 'Wolf', type: 'Animal', size: '1M', speed: 7,
    stamina: 21, stability: 1,
    might: 2, agility: 2, reason: -1, intuition: 2, presence: 1,
    immunities: [], movement: [],
    heroBenefit: null, role: 'Controller/Striker',
    specialTrait: 'Retriever: moves at full speed while Grabbing a creature, regardless of grabbed creature\'s size.',
    signatureManeuver: 'Clamping Jaws: Melee 1. Damage (3 + MGT). If M < −1, target Grabbed. Spend 1 Ferocity: if M < 0, Grabbed.',
    desc: 'A fast pack hunter that grabs enemies and drags them across the battlefield at full speed.',
  },
];

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


// ── Full d100 Complications table ─────────────────────────────────────────────
// 100 entries matching the official Draw Steel d100 complication roll.
// Text is abbreviated for wizard display; direct players to the rulebook for full rules.
const COMPLICATIONS = [
  { id:  1, name: 'Amnesiac',               benefit: 'Creatures auto-fail magical attempts to read your surface thoughts.', drawback: 'You have no memory of your life before becoming a hero.' },
  { id:  2, name: 'Ancient Curse',          benefit: 'Corruption immunity 5.', drawback: 'Holy weakness 5.' },
  { id:  3, name: 'Animal Form',            benefit: 'Transform into a Tiny animal (maneuver). Gain that animal\'s movement while transformed.', drawback: 'You involuntarily transform into your animal form whenever you become dying.' },
  { id:  4, name: 'Antihero',              benefit: 'When you would gain a hero token, gain 1d6 temporary Stamina instead.', drawback: 'When a hero token is spent by the party, you lose 1d6 Stamina (minimum 1).' },
  { id:  5, name: 'Artifact Bonded',       benefit: 'You own a unique indestructible supernatural item: weapon (+1 damage), armor (+1 stability), or implement (+5 to one skill test/encounter).', drawback: 'The artifact attracts dangerous supernatural attention.' },
  { id:  6, name: 'Bereaved',              benefit: '+2 damage to a creature that has killed an ally until end of combat.', drawback: 'Bane on power rolls until end of your next turn whenever an ally reaches 0 Stamina.' },
  { id:  7, name: 'Betrothed',             benefit: '+1 Renown (betrothed is a person of means).', drawback: 'Your betrothed or their family may make demands on your time and loyalty.' },
  { id:  8, name: 'Chaos Touched',         benefit: 'Edge on Escape Grab, Grab, and Knockback maneuvers. Can hold an extra item even when hands are full.', drawback: 'While dying, random uncoordinated limbs impose a bane on your power rolls.' },
  { id:  9, name: 'Chosen One',            benefit: '3 destiny points — spend instead of your heroic resource.', drawback: 'A sinister cult needs you for their plans.' },
  { id: 10, name: 'Consuming Interest',    benefit: 'Edge on tests using a skill related to your chosen field of study.', drawback: 'Bane on Awareness tests when absorbed in your area of study.' },
  { id: 11, name: 'Corrupted Mentor',      benefit: 'Gain one additional skill from any skill group.', drawback: 'Your evil former mentor occasionally sends agents against you.' },
  { id: 12, name: 'Coward',               benefit: 'Edge on tests to avoid danger or escape. +2 speed on Disengage.', drawback: 'Bane on your first power roll each turn when you start adjacent to 2+ enemies.' },
  { id: 13, name: 'Crash Landed',         benefit: 'Own one piece of advanced technology functioning as a supernatural implement (choose with Director).', drawback: 'You\'re from another world and don\'t understand many local customs.' },
  { id: 14, name: 'Cult Victim',          benefit: 'Once per turn, move through solid matter 1 square thick or less.', drawback: 'If you end your turn inside solid matter, you\'re forced out and take 5 unreducible damage.' },
  { id: 15, name: 'Curse of Caution',     benefit: 'You can never be surprised.', drawback: 'You always act last in initiative order when your side acts.' },
  { id: 16, name: 'Curse of Stone',       benefit: 'Weapon immunity 3.', drawback: 'Speed -1. Your skin has a visible stone-like texture.' },
  { id: 17, name: 'Deserter',             benefit: 'One military skill of your choice. Edge on tests to navigate battlefields.', drawback: 'Former comrades who recognize you may turn hostile or report you.' },
  { id: 18, name: 'Devil Deal',           benefit: 'When present for an unsurprised battle, your side goes first on a roll of 4+.', drawback: 'An archdevil occasionally demands you defeat specific enemies. Refusal summons devils.' },
  { id: 19, name: 'Dispossessed Noble',   benefit: '+2 Renown among those who know your heritage.', drawback: 'Your family\'s enemies actively work to prevent you reclaiming your title.' },
  { id: 20, name: 'Doppelganger',         benefit: 'Spend 5 minutes to rearrange your face to resemble another creature of your ancestry. Double edge on impersonation tests.', drawback: 'Taking damage makes your face go blank until you use this ability again.' },
  { id: 21, name: 'Elemental Absorption', benefit: 'Choose a damage type: immunity 5 to that type.', drawback: 'Weakness 5 to the opposed element type.' },
  { id: 22, name: 'Elemental Inside',     benefit: '+5 maximum Stamina at 1st level, then +1 per level gained.', drawback: 'While dying, a possessing elemental controls your body and attacks the nearest creature.' },
  { id: 23, name: 'Escaped Experiment',   benefit: 'One supernatural sense (darkvision, tremorsense, or similar; choose with Director).', drawback: 'The organization that experimented on you wants you back.' },
  { id: 24, name: 'Ex-Con',               benefit: 'One skill from the intrigue skill group.', drawback: 'When meeting an NPC for the first time, the Director can decide they were a victim of your past crimes.' },
  { id: 25, name: 'Fae-Touched',          benefit: 'Edge on tests to resist charm, illusion, and enchantment.', drawback: 'You must keep every promise. Breaking one gives you a bane on all power rolls for 24 hours.' },
  { id: 26, name: 'Family Heirloom',      benefit: 'A strange trinket that is secretly a supernatural item with hidden powers (work with Director).', drawback: 'Others covet it and may try to steal or extort it from you.' },
  { id: 27, name: 'Fire and Chaos',       benefit: 'Fire immunity 5.', drawback: 'Cold weakness 5.' },
  { id: 28, name: 'Former Undead',        benefit: 'Corruption immunity 5. See in darkness up to 5 squares.', drawback: 'Holy damage against you ignores your immunities.' },
  { id: 29, name: 'Frostheart',           benefit: 'Cold immunity 5. Survive freezing temperatures indefinitely.', drawback: 'Fire weakness 5.' },
  { id: 30, name: 'Grounded',             benefit: 'You have the 1st-level Elementalist Specialization feature (Earth only).', drawback: 'You cannot fly by any means, magical or otherwise.' },
  { id: 31, name: 'Guilty Conscience',    benefit: 'When you use a heroic ability to help an ally, gain 1 temporary Stamina.', drawback: 'When an ally drops to 0 Stamina, you lose 1d3 Stamina.' },
  { id: 32, name: 'Haunted',              benefit: 'A ghost follows you. Once per encounter it can impose a bane on an enemy\'s next power roll.', drawback: 'The ghost has its own agenda that may conflict with yours.' },
  { id: 33, name: 'Hunted',               benefit: '+1 speed. You have the Alertness skill.', drawback: 'A powerful hunter or organization actively tracks you.' },
  { id: 34, name: 'Infernal Contract',    benefit: 'Gain one additional class ability at 1st level.', drawback: 'An archdevil can call in a favor at any time.' },
  { id: 35, name: 'Infernal Contract, But Like, Bad', benefit: 'Choose: +2 Renown, +2 Wealth, or +10 Stamina.', drawback: 'The contract is worse than a standard infernal contract — the archdevil can demand bigger favors.' },
  { id: 36, name: 'Inherited Debt',       benefit: '+1 Wealth from an estate and access to a small property.', drawback: 'The attached debt is large and the creditors are dangerous.' },
  { id: 37, name: 'Kinslayer',            benefit: 'Edge on Intimidate tests.', drawback: 'You killed a family member. Those who know shun or fear you.' },
  { id: 38, name: 'Last of Your Line',    benefit: 'Edge on death saving throws.', drawback: 'You are the last of your family or people. The Director may introduce threats to your legacy.' },
  { id: 39, name: 'Living Anchor',        benefit: 'Teleportation and banishment effects on you automatically fail.', drawback: 'You cannot benefit from any teleportation, even from allies.' },
  { id: 40, name: 'Living Nightmare',     benefit: 'Enter the dreams of a sleeping creature within 5 squares and communicate.', drawback: 'Your own dreams are vivid and disturbing. You occasionally scream in your sleep.' },
  { id: 41, name: 'Lost At Sea',          benefit: 'Swim skill. Hold your breath 10 minutes. +1 speed while swimming.', drawback: 'Deep phobia of drowning. Bane on power rolls while submerged.' },
  { id: 42, name: 'Lost Love',            benefit: '+1 to all damage while Winded.', drawback: 'Music that reminds you of your lost love imposes a bane on your next power roll.' },
  { id: 43, name: 'Lost Memory',          benefit: 'Memory is magically sealed. Psionic immunity 3.', drawback: 'Memory gaps can be exploited by those who know about them.' },
  { id: 44, name: 'Lost Nobility',        benefit: 'Lead skill and +1 Renown.', drawback: 'You lost your title through disgrace. Former nobles treat you with contempt.' },
  { id: 45, name: 'Lost Prophecy',        benefit: 'Once per session: ask the Director a yes/no question about the immediate future.', drawback: 'The prophecy is incomplete and misinterpretation leads to disaster.' },
  { id: 46, name: 'Lost Sibling',         benefit: '+1 Renown in communities you\'ve visited (searcher network).', drawback: 'Your search can be exploited to lure you into traps.' },
  { id: 47, name: 'Lost Your Head',       benefit: 'Your head can detach and function independently. Body is Blinded but you can see from your detached head.', drawback: 'If your head is more than 10 squares from your body, you are Dazed.' },
  { id: 48, name: 'Lycanthrope',          benefit: 'Once per encounter: transform into beast form (maneuver). +2 melee damage and +1 speed.', drawback: 'Full moon forces a Reason test (difficulty 3) or you transform and attack the nearest creature.' },
  { id: 49, name: 'Magnetic Personality', benefit: 'Edge on Persuade and Charm tests.', drawback: 'You attract dangerous admirers.' },
  { id: 50, name: 'Marked by Death',      benefit: 'See dying and 0-Stamina creatures through walls within 10 squares.', drawback: 'Undead are drawn to you and appear more frequently.' },
  { id: 51, name: 'Marked for Sacrifice', benefit: '+5 maximum Stamina.', drawback: 'A cult intends to sacrifice you in a ritual.' },
  { id: 52, name: 'Meddling Kids',        benefit: 'A group of young friends gathers information for you. Edge on Gather Rumors tests.', drawback: 'The kids sometimes get into trouble and need rescuing.' },
  { id: 53, name: 'Wanted',               benefit: 'Hide and Sneak skills.', drawback: 'There is a bounty on your head. Bounty hunters appear at the worst times.' },
  { id: 54, name: 'Lucky',                benefit: 'Once per session: reroll any one power roll and take the better result.', drawback: 'Once per session: the Director forces you to reroll a success and take the worse result.' },
  { id: 55, name: 'Master Chef',          benefit: 'During a respite, prepare a meal granting each ally 1d6 temporary Stamina until the next encounter.', drawback: 'Obsessed with rare ingredients — the Director presents irresistible (and dangerous) foraging opportunities.' },
  { id: 56, name: 'Meddling Butler',      benefit: 'A loyal servant handles mundane tasks, carries equipment, and runs errands.', drawback: 'Your butler offers unsolicited advice and occasionally acts in ways that complicate situations.' },
  { id: 57, name: 'Medium',               benefit: 'Communicate with spirits of the dead. Edge on Supernatural tests about deceased individuals.', drawback: 'Spirits seek you out uninvited with demanding or dangerous requests.' },
  { id: 58, name: 'Medusa Blood',         benefit: 'Weapon immunity 3.', drawback: 'Bane on first impression social tests with strangers.' },
  { id: 59, name: 'Misunderstood',        benefit: 'Edge on Intimidate tests.', drawback: 'People are initially afraid of you. Bane on Persuade tests with strangers.' },
  { id: 60, name: 'Mundane',              benefit: 'Completely undetectable by magical or supernatural senses.', drawback: 'You cannot benefit from magical or supernatural healing.' },
  { id: 61, name: 'Outlaw',               benefit: 'Hide skill and one intrigue group skill.', drawback: 'You are wanted by the law in at least one jurisdiction.' },
  { id: 62, name: 'Pirate',               benefit: 'Navigate skill. You know a secret pirate port to fence goods and gather information.', drawback: 'Your former crew or their enemies may come looking for you.' },
  { id: 63, name: 'Preacher',             benefit: 'Convince skill. Once per session: deliver a sermon granting allies an edge on their next power roll.', drawback: 'You are compelled to proselytize, which can alienate or anger listeners.' },
  { id: 64, name: 'Primordial Sickness',  benefit: 'Corruption immunity 5 and poison immunity 5.', drawback: 'Permanently -1 Recovery.' },
  { id: 65, name: 'Prisoner of the Synlirii', benefit: 'Telepathically communicate with any creature within 10 squares (if you share a language).', drawback: 'Any voiceless talker within 1 mile knows your location and can overhear your telepathic conversations.' },
  { id: 66, name: 'Punishment Curse',     benefit: 'Choose an animal type: edge on Handle Animals with that type and can communicate with them.', drawback: 'You don\'t have a culture. You can speak Caelian only.' },
  { id: 67, name: 'Raised by Wolves',     benefit: 'Handle Animals skill. Edge on wilderness survival tests.', drawback: 'Bane on Etiquette tests.' },
  { id: 68, name: 'Rebel',               benefit: 'Contacts in an underground resistance. +1 Renown among rebels.', drawback: 'Authorities consider you a dissident and may seek to arrest you.' },
  { id: 69, name: 'Reborn',              benefit: 'You have died and returned. Edge on death saving throws.', drawback: 'Occasional visions of the afterlife leave you Dazed for a round.' },
  { id: 70, name: 'Reluctant Leader',    benefit: 'Lead skill. Allies within 5 squares gain +1 stability.', drawback: 'People look to you for guidance even when you don\'t want it. Failure weighs heavily.' },
  { id: 71, name: 'Rivalry',             benefit: 'Edge on power rolls against your chosen rival when you can see them.', drawback: 'Your rival also has an edge on power rolls against you.' },
  { id: 72, name: 'Runic Tattoos',       benefit: 'Choose a damage type: unarmed strikes deal that type. +1 unarmed damage.', drawback: 'Tattoos glow when you use abilities. Bane on Hide tests in combat.' },
  { id: 73, name: 'Scavenger',           benefit: 'After each encounter, find 1d6 gold worth of useful items among the remains.', drawback: 'You are a compulsive hoarder.' },
  { id: 74, name: 'Secret Identity',     benefit: 'A second established identity with its own +2 Renown.', drawback: 'If exposed, both identities\' Renown drops to 0.' },
  { id: 75, name: 'Secret Society',      benefit: 'A secret society provides information and safe houses.', drawback: 'The society expects loyalty and assigns tasks that conflict with your goals.' },
  { id: 76, name: 'Shadow Twin',         benefit: 'Your shadow acts independently. Once per encounter it makes a free strike against a creature within 5 squares.', drawback: 'Your shadow sometimes reveals secrets or acts against your wishes.' },
  { id: 77, name: 'Shapeshifter',        benefit: 'Change your appearance to any humanoid of similar size (maneuver). Not specific individuals.', drawback: 'Your true form is unusual or frightening. It shows when your ability is disrupted.' },
  { id: 78, name: 'Shipwrecked',         benefit: 'Swim and Navigate skills.', drawback: 'Stranded far from home with no way back except by finding passage.' },
  { id: 79, name: 'Soul Jar',            benefit: 'Soul stored externally: edge on death saving throws and can\'t be raised as undead.', drawback: 'If the soul jar is destroyed, you die instantly regardless of Stamina.' },
  { id: 80, name: 'Spirit Bonded',       benefit: 'Nature spirit bonded to you: Nature skill and edge on nature-related tests.', drawback: 'The spirit imposes penalties if you act against nature.' },
  { id: 81, name: 'Stolen Face',         benefit: 'You stole a powerful person\'s face and can impersonate them perfectly.', drawback: 'The faceless person is hunting you with significant resources.' },
  { id: 82, name: 'Strange Dreams',      benefit: 'Once per session: the Director gives you a cryptic clue about upcoming events.', drawback: 'Dreams are nightmarish. You sometimes act out in your sleep.' },
  { id: 83, name: 'Summoner',            benefit: 'Once per encounter: summon a Tiny elemental creature that assists you for 1 round.', drawback: 'The creature is mischievous and may act unpredictably.' },
  { id: 84, name: 'Sworn Enemy',         benefit: '+2 damage to creatures of a specific type (choose with Director).', drawback: 'Creatures of that type deal +2 damage to you.' },
  { id: 85, name: 'Tainted Blood',       benefit: 'Poison immunity 5.', drawback: 'Your blood is toxic. Healers take a bane on tests to treat your wounds.' },
  { id: 86, name: 'Time Displaced',      benefit: 'Edge on History and Lore tests about a different era you came from.', drawback: 'Bane on Culture and Etiquette tests in the current era.' },
  { id: 87, name: 'Time Loop',           benefit: 'Once per session: declare you\'ve "already seen this" and reroll a failed power roll.', drawback: 'Constant déjà vu. Bane on Awareness tests once per encounter (Director\'s choice).' },
  { id: 88, name: 'Touched by the Void', benefit: 'See in magical darkness. Void immunity 3.', drawback: 'Unsettling to be around. Bane on Charm tests. Animals are uneasy near you.' },
  { id: 89, name: 'Tragic Hero',         benefit: 'When an ally within 5 squares drops to 0 Stamina, gain a surge (+2 to your next power roll).', drawback: 'You believe you are fated to lose everyone you care about, making you reckless.' },
  { id: 90, name: 'Transformed',         benefit: 'Transformed from another creature into a humanoid. Retain one sense or minor ability from your original form.', drawback: 'Under stress, your original nature shows through.' },
  { id: 91, name: 'Turncoat',            benefit: 'Inside knowledge of an enemy organization. Edge on tests to understand their plans.', drawback: 'Former allies want you dead. The organization sends agents after you.' },
  { id: 92, name: 'Two Worlds',          benefit: '+1 Renown in each of two cultures you belong to.', drawback: 'Neither culture fully trusts you. Bane on Loyalty tests from either community.' },
  { id: 93, name: 'Undead Relic',        benefit: 'An undead body part (hand, eye, etc.) that functions normally. Grants the Supernatural skill.', drawback: 'The powerful undead who owned it wants it back.' },
  { id: 94, name: 'Unlucky',             benefit: 'Gain a hero token whenever you roll a natural 1.', drawback: 'The Director gains a villain power whenever you roll a natural 20.' },
  { id: 95, name: 'Vivid Dreams',        benefit: 'Edge on Supernatural tests to interpret signs and portents.', drawback: 'Visions come unbidden and can leave you Dazed.' },
  { id: 96, name: 'Wanted Dead or Alive',benefit: 'Flee and Sneak skills.', drawback: 'A bounty on your head. Bounty hunters appear at the worst times.' },
  { id: 97, name: 'War of the Guilds',   benefit: 'Connections to a guild: discounted goods and information.', drawback: 'The guild is at war with a rival. You may be dragged into the conflict.' },
  { id: 98, name: 'Ward',               benefit: 'A powerful NPC watches over you from afar and can provide occasional aid.', drawback: 'Your protector can\'t openly reveal their connection with you. Discovery makes things worse.' },
  { id: 99, name: 'Werewolf',            benefit: 'Transform into a wolf or hybrid form. +2 melee damage and +2 speed in beast form.', drawback: 'Full moon forces transformation. Silver weakness 5.' },
  { id: 100, name: 'Wild Magic',         benefit: 'When you use a supernatural ability, roll d20: on a 1, a random wild magic surge occurs.', drawback: 'Wild magic surges are unpredictable and can harm allies.' },
];

// ── Class primary characteristics ─────────────────────────────────────────────
// The two characteristics that can reach 2 during level-1 point-buy.
// All other characteristics are capped at 1 in Step 9.
const CLASS_PRIMARY_CHARACTERISTICS = {
  Beastheart:   ['MGT', 'INU'],
  Conduit:      ['INU', 'PRS'],
  Elementalist: ['REA', 'INU'],
  Fury:         ['MGT', 'AGL'],
  Null:         ['MGT', 'REA'],
  Shadow:       ['AGL', 'INU'],
  Tactician:    ['MGT', 'REA'],
  Talent:       ['INU', 'PRS'],
};

// ── Ability pick counts per class (level 1) ──────────────────────────────────
// signatures: how many signature abilities the player picks
// heroic: how many non-signature heroic abilities the player picks
// Tactician has 0 signatures — their sigs come from kits, not class choices
const CLASS_ABILITY_PICKS = {
  // Martial classes: 1 signature pick + 1×3pt + 1×5pt
  Shadow:       { signatures: 1, heroic3: 1, heroic5: 1 },
  Fury:         { signatures: 1, heroic3: 1, heroic5: 1 },
  Beastheart:   { signatures: 1, heroic3: 1, heroic5: 1 },

  // Tactician: 0 sig picks — sigs come from kits (Field Arsenal)
  Tactician:    { signatures: 0, heroic3: 1, heroic5: 1 },

  // Caster classes: 2 signature picks + 1×3pt + 1×5pt
  Conduit:      { signatures: 2, heroic3: 1, heroic5: 1 },
  Elementalist: { signatures: 2, heroic3: 1, heroic5: 1 },
  Null:         { signatures: 2, heroic3: 1, heroic5: 1 },
  Talent:       { signatures: 2, heroic3: 1, heroic5: 1 },
};

// ── Class skill grants ────────────────────────────────────────────────────────
// Classes that grant specific skills beyond what culture/career provide.
// fixed: always granted; choose: number of player picks; pool: options to pick from
// Note: subclass skill (p._subclassSkill) is captured separately — not listed here.
const CLASS_SKILL_GRANTS = {
  Beastheart: {
    fixed:  ['Handle Animals'],
    choose: 2,
    pool:   ['Alertness', 'Endurance', 'Hide', 'Intimidate', 'Jump', 'Lift', 'Nature', 'Sneak', 'Swim', 'Track'],
  },
  Fury: {
    fixed:  [],
    choose: 2,
    pool:   [
      // exploration
      'Alertness', 'Climb', 'Endurance', 'Handle Animals', 'Hide', 'Jump',
      'Lift', 'Navigate', 'Ride', 'Search', 'Swim', 'Track',
      // interpersonal
      'Brag', 'Flirt', 'Intimidate', 'Lead', 'Lie', 'Perform', 'Persuade', 'Read Person',
    ],
  },
  Tactician: {
    fixed:  ['Lead'],
    choose: 2,
    pool:   [
      'Alertness', 'Architecture', 'Blacksmithing', 'Brag', 'Culture',
      'Fletching', 'Folklore', 'Forgery', 'Gambling', 'Handle Animals',
      'History', 'Intimidate', 'Lie', 'Mechanics', 'Monster Lore',
      'Navigate', 'Persuade', 'Read Person', 'Rumors', 'Search',
      'Sneak', 'Track',
    ],
  },
  Shadow: {
    fixed:  [],
    choose: 2,
    pool:   [
      // interpersonal
      'Brag', 'Flirt', 'Intimidate', 'Lead', 'Lie', 'Perform', 'Persuade', 'Read Person',
      // intrigue
      'Criminal Underworld', 'Gambling', 'Pick Lock', 'Rumors', 'Sabotage', 'Sneak',
    ],
  },
  // Conduit: class skill comes entirely from the subclass pick (_subclassSkill)
  Elementalist: {
    fixed:  [],
    choose: 2,
    pool:   ['Nature', 'Magic', 'Folklore', 'Monster Lore', 'Psionics', 'Supernatural'],
  },
  Null: {
    fixed:  [],
    choose: 2,
    pool:   [
      'Psionics', 'History', 'Architecture', 'Culture', 'Folklore',
      'Magic', 'Monster Lore', 'Nature', 'Supernatural',
    ],
  },
  Talent: {
    fixed:  [],
    choose: 2,
    pool:   [
      // interpersonal
      'Brag', 'Flirt', 'Intimidate', 'Lead', 'Lie', 'Perform', 'Persuade', 'Read Person',
      // supernatural
      'Psionics', 'Religion', 'Supernatural',
    ],
  },
};

// ── Level-up feature table ────────────────────────────────────────────────────
// Defines what each class gains at each level from 2–10.
// gain types:
//   heroic_ability_N  pick 1 new class ability with cost N
//   perk              pick 1 perk from PERKS_DATA
//   skill             pick 1 new skill from LEVEL_UP_SKILL_POOL
//   kit_improvement   automatic — kit bonuses scale with echelon (no choice)
//   doctrine_feature  automatic — subclass grants a new passive feature (no choice)
//   epic_resource     automatic — heroic resource max increases to 12 (no choice)
//
// Characteristics at L4/L7/L10 and Stamina at every level are handled
// automatically by previewLevelUp / computeCharacteristicsForLevel.

const CLASS_LEVEL_FEATURES = {
  Conduit: {
    2:  { gains: ['heroic_ability_3'] },
    3:  { gains: ['perk'] },
    4:  { gains: ['skill', 'kit_improvement'] },
    5:  { gains: ['doctrine_feature'] },
    6:  { gains: ['perk', 'heroic_ability_5'] },
    7:  { gains: ['kit_improvement'] },
    8:  { gains: ['perk', 'doctrine_feature'] },
    9:  { gains: ['heroic_ability_9'] },
    10: { gains: ['epic_resource'] },
  },
  Elementalist: {
    2:  { gains: ['heroic_ability_3'] },
    3:  { gains: ['perk'] },
    4:  { gains: ['skill', 'kit_improvement'] },
    5:  { gains: ['doctrine_feature'] },
    6:  { gains: ['perk', 'heroic_ability_5'] },
    7:  { gains: ['kit_improvement'] },
    8:  { gains: ['perk', 'doctrine_feature'] },
    9:  { gains: ['heroic_ability_9'] },
    10: { gains: ['epic_resource'] },
  },
  Fury: {
    2:  { gains: ['heroic_ability_3'] },
    3:  { gains: ['perk'] },
    4:  { gains: ['skill', 'kit_improvement'] },
    5:  { gains: ['doctrine_feature'] },
    6:  { gains: ['perk', 'heroic_ability_5'] },
    7:  { gains: ['kit_improvement'] },
    8:  { gains: ['perk', 'doctrine_feature'] },
    9:  { gains: ['heroic_ability_9'] },
    10: { gains: ['epic_resource'] },
  },
  Null: {
    2:  { gains: ['heroic_ability_3'] },
    3:  { gains: ['perk'] },
    4:  { gains: ['skill', 'kit_improvement'] },
    5:  { gains: ['doctrine_feature'] },
    6:  { gains: ['perk', 'heroic_ability_5'] },
    7:  { gains: ['kit_improvement'] },
    8:  { gains: ['perk', 'doctrine_feature'] },
    9:  { gains: ['heroic_ability_9'] },
    10: { gains: ['epic_resource'] },
  },
  Shadow: {
    2:  { gains: ['heroic_ability_3'] },
    3:  { gains: ['perk'] },
    4:  { gains: ['skill', 'kit_improvement'] },
    5:  { gains: ['doctrine_feature'] },
    6:  { gains: ['perk', 'heroic_ability_5'] },
    7:  { gains: ['kit_improvement'] },
    8:  { gains: ['perk', 'doctrine_feature'] },
    9:  { gains: ['heroic_ability_9'] },
    10: { gains: ['epic_resource'] },
  },
  Tactician: {
    2:  { gains: ['heroic_ability_3'] },
    3:  { gains: ['perk'] },
    4:  { gains: ['skill', 'kit_improvement'] },
    5:  { gains: ['doctrine_feature'] },
    6:  { gains: ['perk', 'heroic_ability_5'] },
    7:  { gains: ['kit_improvement'] },
    8:  { gains: ['perk', 'doctrine_feature'] },
    9:  { gains: ['heroic_ability_9'] },
    10: { gains: ['epic_resource'] },
  },
  Talent: {
    2:  { gains: ['heroic_ability_3'] },
    3:  { gains: ['perk'] },
    4:  { gains: ['skill', 'kit_improvement'] },
    5:  { gains: ['doctrine_feature'] },
    6:  { gains: ['perk', 'heroic_ability_5'] },
    7:  { gains: ['kit_improvement'] },
    8:  { gains: ['perk', 'doctrine_feature'] },
    9:  { gains: ['heroic_ability_9'] },
    10: { gains: ['epic_resource'] },
  },
  Beastheart: {
    2:  { gains: ['heroic_ability_3'] },
    3:  { gains: ['perk'] },
    4:  { gains: ['skill', 'kit_improvement'] },
    5:  { gains: ['doctrine_feature'] },
    6:  { gains: ['perk', 'heroic_ability_5'] },
    7:  { gains: ['kit_improvement'] },
    8:  { gains: ['perk', 'doctrine_feature'] },
    9:  { gains: ['heroic_ability_9'] },
    10: { gains: ['epic_resource'] },
  },
};

// ── Perks ─────────────────────────────────────────────────────────────────────
// Perks grant a skill (if not already held) and a +2 bonus to tests using it.
// Grouped by skill category. Characters can have the same perk-skill listed in
// their skills array — the perk bonus stacks with the base skill.

const PERKS_DATA = [
  // Exploration
  { name: 'Alertness',     type: 'exploration',   desc: 'You gain the Alertness skill. +2 to tests made to notice threats, spot hidden creatures, or detect ambushes.' },
  { name: 'Climb',         type: 'exploration',   desc: 'You gain the Climb skill. +2 to tests made to scale walls, cliffs, and other vertical surfaces.' },
  { name: 'Endurance',     type: 'exploration',   desc: 'You gain the Endurance skill. +2 to tests made to resist fatigue, hold your breath, or survive harsh environments.' },
  { name: 'Hide',          type: 'exploration',   desc: 'You gain the Hide skill. +2 to tests made to conceal yourself from detection.' },
  { name: 'Jump',          type: 'exploration',   desc: 'You gain the Jump skill. +2 to tests made to leap across gaps or over obstacles.' },
  { name: 'Navigate',      type: 'exploration',   desc: 'You gain the Navigate skill. +2 to tests made to find your way through wilderness or unfamiliar terrain.' },
  { name: 'Ride',          type: 'exploration',   desc: 'You gain the Ride skill. +2 to tests made to control mounts and beasts of burden.' },
  { name: 'Search',        type: 'exploration',   desc: 'You gain the Search skill. +2 to tests made to find hidden objects, secret doors, and concealed details.' },
  { name: 'Swim',          type: 'exploration',   desc: 'You gain the Swim skill. +2 to tests made to move through water.' },
  { name: 'Track',         type: 'exploration',   desc: 'You gain the Track skill. +2 to tests made to follow trails and identify signs of passage.' },
  // Interpersonal
  { name: 'Brag',          type: 'interpersonal', desc: 'You gain the Brag skill. +2 to tests made to boast, impress, or demoralize through personal reputation.' },
  { name: 'Flirt',         type: 'interpersonal', desc: 'You gain the Flirt skill. +2 to tests made to charm or distract through attraction.' },
  { name: 'Intimidate',    type: 'interpersonal', desc: 'You gain the Intimidate skill. +2 to tests made to frighten or coerce.' },
  { name: 'Lead',          type: 'interpersonal', desc: 'You gain the Lead skill. +2 to tests made to inspire and direct others in a crisis.' },
  { name: 'Lie',           type: 'interpersonal', desc: 'You gain the Lie skill. +2 to tests made to deceive and misdirect.' },
  { name: 'Persuade',      type: 'interpersonal', desc: 'You gain the Persuade skill. +2 to tests made to convince others through reason or emotion.' },
  { name: 'Read Person',   type: 'interpersonal', desc: 'You gain the Read Person skill. +2 to tests made to discern motives, detect lies, or gauge emotional states.' },
  // Intrigue
  { name: 'Pick Lock',     type: 'intrigue',      desc: 'You gain the Pick Lock skill. +2 to tests made to open locked mechanisms without a key.' },
  { name: 'Sabotage',      type: 'intrigue',      desc: 'You gain the Sabotage skill. +2 to tests made to disable traps, devices, or machinery.' },
  { name: 'Sneak',         type: 'intrigue',      desc: 'You gain the Sneak skill. +2 to tests made to move silently and avoid detection.' },
  // Lore
  { name: 'Architecture',  type: 'lore',          desc: 'You gain the Architecture skill. +2 to tests made to assess structures, identify weaknesses, and recall construction techniques.' },
  { name: 'Culture',       type: 'lore',          desc: 'You gain the Culture skill. +2 to tests made to recall customs, etiquette, and the norms of a society.' },
  { name: 'Folklore',      type: 'lore',          desc: 'You gain the Folklore skill. +2 to tests made to recall legends, myths, and regional stories.' },
  { name: 'History',       type: 'lore',          desc: 'You gain the History skill. +2 to tests made to recall past events, rulers, wars, and significant figures.' },
  { name: 'Magic',         type: 'lore',          desc: 'You gain the Magic skill. +2 to tests made to identify magical effects, recall arcane theory, and recognize enchantments.' },
  { name: 'Monster Lore',  type: 'lore',          desc: 'You gain the Monster Lore skill. +2 to tests made to recall weaknesses, behaviors, and facts about monsters.' },
  { name: 'Nature',        type: 'lore',          desc: 'You gain the Nature skill. +2 to tests made to identify plants, animals, weather, and natural phenomena.' },
  // Supernatural
  { name: 'Psionics',      type: 'supernatural',  desc: 'You gain the Psionics skill. +2 to tests made to recall psionic theory and interact with psionic phenomena.' },
  { name: 'Religion',      type: 'supernatural',  desc: 'You gain the Religion skill. +2 to tests made to recall divine lore, holy rites, and religious hierarchies.' },
  { name: 'Supernatural',  type: 'supernatural',  desc: 'You gain the Supernatural skill. +2 to tests made to identify and interact with extraplanar and undead creatures.' },
  // Crafting
  { name: 'Alchemy',       type: 'crafting',      desc: 'You gain the Alchemy skill. +2 to tests made to brew potions, identify substances, and understand alchemical reactions.' },
  { name: 'Blacksmithing', type: 'crafting',      desc: 'You gain the Blacksmithing skill. +2 to tests made to craft and repair metal goods and weapons.' },
  { name: 'Fletching',     type: 'crafting',      desc: 'You gain the Fletching skill. +2 to tests made to craft arrows, bolts, and ranged weapons.' },
  { name: 'Forgery',       type: 'crafting',      desc: 'You gain the Forgery skill. +2 to tests made to create and detect fake documents, seals, and identities.' },
  { name: 'Heal',          type: 'crafting',      desc: 'You gain the Heal skill. +2 to tests made to treat wounds, cure diseases, and stabilize the dying.' },
  { name: 'Mechanics',     type: 'crafting',      desc: 'You gain the Mechanics skill. +2 to tests made to build, repair, and understand complex mechanical devices.' },
];

// ── Skill category map ────────────────────────────────────────────────────────
// Maps every skill name to its display category. Used to group skills on the
// character sheet Details tab.

const SKILL_CATEGORY_ORDER = [
  'exploration', 'interpersonal', 'intrigue', 'lore', 'supernatural', 'crafting',
];

const SKILL_CATEGORY_LABELS = {
  exploration:   'Exploration',
  interpersonal: 'Interpersonal',
  intrigue:      'Intrigue',
  lore:          'Lore',
  supernatural:  'Supernatural',
  crafting:      'Crafting',
};

const SKILL_CATEGORIES = {
  // Exploration
  Alertness:           'exploration',
  Climb:               'exploration',
  Endurance:           'exploration',
  'Handle Animals':    'exploration',
  Hide:                'exploration',
  Jump:                'exploration',
  Lift:                'exploration',
  Navigate:            'exploration',
  Ride:                'exploration',
  Search:              'exploration',
  Swim:                'exploration',
  Track:               'exploration',
  // Interpersonal
  Brag:                'interpersonal',
  Flirt:               'interpersonal',
  Intimidate:          'interpersonal',
  Lead:                'interpersonal',
  Lie:                 'interpersonal',
  Perform:             'interpersonal',
  Persuade:            'interpersonal',
  'Read Person':       'interpersonal',
  // Intrigue
  'Criminal Underworld': 'intrigue',
  Gambling:            'intrigue',
  'Pick Lock':         'intrigue',
  Rumors:              'intrigue',
  Sabotage:            'intrigue',
  Sneak:               'intrigue',
  // Lore
  Architecture:        'lore',
  Culture:             'lore',
  Folklore:            'lore',
  History:             'lore',
  Magic:               'lore',
  'Monster Lore':      'lore',
  Nature:              'lore',
  // Supernatural
  Psionics:            'supernatural',
  Religion:            'supernatural',
  Supernatural:        'supernatural',
  // Crafting
  Alchemy:             'crafting',
  Blacksmithing:       'crafting',
  Fletching:           'crafting',
  Forgery:             'crafting',
  Heal:                'crafting',
  Mechanics:           'crafting',
};

// ── Skill pool for level-4 skill choice ───────────────────────────────────────
// A broad list from which players can pick one new skill at level 4.
// Excludes class-specific pools — all skills are universal choices here.

const LEVEL_UP_SKILL_POOL = [
  'Alertness', 'Architecture', 'Alchemy', 'Blacksmithing', 'Brag', 'Climb',
  'Culture', 'Endurance', 'Fletching', 'Flirt', 'Folklore', 'Forgery',
  'Gambling', 'Handle Animals', 'Heal', 'Hide', 'History', 'Intimidate',
  'Jump', 'Lead', 'Lie', 'Magic', 'Mechanics', 'Monster Lore', 'Nature',
  'Navigate', 'Perform', 'Persuade', 'Pick Lock', 'Psionics', 'Read Person',
  'Religion', 'Ride', 'Rumors', 'Sabotage', 'Search', 'Sneak', 'Supernatural',
  'Swim', 'Track',
];
