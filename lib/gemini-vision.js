const Playoffs = require('../public/playoffs-model');
const catalog = require('../public/assets/catalog.json');

/**
 * Super Intelligent AI Vision Analyzer using Google Gemini Multimodal API.
 * Prefers the faster Flash Lite models, then falls back through the available Flash models.
 * 
 * Replaces legacy Tesseract OCR and pixel template matching across all broadcast modes:
 * 1. Post-Game Scoreboard: 10 heroes, levels, KDAs, gold, medals, MVP, equipment items, registered IGNs.
 * 2. Live Draft / Pick & Ban: Phase, countdown timer, all 10 bans, all 10 picks with hero names and player IGNs.
 * 3. In-Game Spectator HUD: Game time, kills, gold, turrets, lord, and side-rail player items/levels.
 */
class GeminiVision {
  static get DEFAULT_MODELS() {
    return [
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-3-flash-preview',
      'gemini-3.5-flash',
      'gemini-3.6-flash',
      'gemini-3.7-flash',
      'gemini-3.8-flash'
    ];
  }

  static _modelCooldowns = new Map();

  /**
   * Sets a temporary cooldown on a model (e.g. rate limit, quota, or 503 high demand).
   */
  static setModelCooldown(model, durationMs, reason = '') {
    const until = Date.now() + durationMs;
    this._modelCooldowns.set(model, { until, reason });
  }

  /**
   * Returns models that are not currently in cooldown, preserving priority order.
   */
  static getActiveModels() {
    const now = Date.now();
    const available = this.DEFAULT_MODELS.filter(m => {
      const cd = this._modelCooldowns.get(m);
      return !cd || cd.until <= now;
    });
    return available;
  }

  /**
   * Returns inspection status for all configured models.
   */
  static getModelStatus() {
    const now = Date.now();
    return this.DEFAULT_MODELS.map((model, idx) => {
      const cd = this._modelCooldowns.get(model);
      const isCoolingDown = cd && cd.until > now;
      return {
        priority: idx + 1,
        model,
        status: isCoolingDown ? 'cooling_down' : 'available',
        cooldownRemainingSeconds: isCoolingDown ? Math.ceil((cd.until - now) / 1000) : 0,
        reason: isCoolingDown ? cd.reason : 'Ready'
      };
    });
  }

  /**
   * Matches an item name from AI vision output against official catalog items.
   */
  static matchItem(name) {
    if (!name) return null;
    const id = typeof name === 'object' ? name.id : /^\d+$/.test(String(name)) ? Number(name) : null;
    const byId = id && catalog.items?.find(item => String(item.id) === String(id));
    if (byId) return { id: byId.id, name: byId.name, icon: byId.icon };
    if (typeof name === 'object') name = name.name;
    if (!name) return null;
    const clean = s => String(s).toLowerCase().replace(/\bshoes\b/g, 'boots').replace(/[^a-z0-9]/g, '');
    const target = clean(name);
    if (!target) return null;
    // 1. Exact match
    let found = catalog.items?.find(i => clean(i.name) === target);
    // 2. Strong prefix or word match
    if (!found && target.length >= 4) {
      const matches = catalog.items?.filter(i => {
        const c = clean(i.name);
        return c.startsWith(target) || (c.length >= 5 && target.startsWith(c));
      });
      if (matches?.length === 1) found = matches[0];
    }
    if (found) {
      return { id: found.id, name: found.name, icon: found.icon };
    }
    return { id: 0, name: String(name).trim(), icon: '' };
  }

  /**
   * Matches a hero name from AI vision output against official catalog heroes.
   */
  static matchHero(name) {
    if (!name) return '';
    const clean = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const target = clean(name);
    if (!target) return '';
    const botMatch = String(name).match(/(?:\[|\b)Computer\]?\s*([A-Za-z0-9\s'-]+)/i);
    const candidate = botMatch ? clean(botMatch[1]) : target;
    let found = catalog.heroes?.find(h => clean(h.name) === candidate);
    if (found) return found.name;
    if (candidate.length >= 3) {
      found = catalog.heroes?.find(h => {
        const c = clean(h.name);
        return c.startsWith(candidate) || (candidate.length >= 4 && candidate.startsWith(c));
      });
      if (found) return found.name;
    }
    return botMatch ? botMatch[1].trim() : String(name).trim();
  }

  /**
   * Format official playoff rosters for prompt context.
   */
  static formatRosterContext(teams = Playoffs.teams) {
    return (teams || Playoffs.teams).map(t => {
      return `- ${t.id} (${t.name}): [${t.players.join(', ')}]`;
    }).join('\n');
  }

  // =========================================================================
  // 1. POST-GAME SCOREBOARD VISION
  // =========================================================================

  /**
   * Builds the system prompt for scoreboard extraction.
   */
  static buildPrompt(teams = Playoffs.teams) {
    const rosterList = this.formatRosterContext(teams);
    return `You are a world-class Mobile Legends: Bang Bang (MLBB) tournament referee and esports statistics analyst.
Analyze the attached post-game scoreboard screenshot and extract complete, highly accurate match data in JSON format.

AUTOMATIC SCREEN LOCATION & ELEMENT DETECTION:
- First, scan the full image to auto-detect where the game viewport is located. Automatically ignore any black bars (letterboxing/pillarboxing), emulator window titlebars (MuMuPlayer, LDPlayer, BlueStacks, Nox), desktop background, taskbars, or Android navigation buttons.
- The screenshot can be of ANY resolution (720p, 1080p, 1440p, 4K, 1600x900, windowed emulator capture, or mobile/tablet screen mirror) and any aspect ratio (16:9, 16:10, 18:9, 19.5:9, 20:9, 4:3).
- Auto-locate all visual elements semantically by their layout structure wherever they are located on the screen, without relying on fixed pixel coordinates.

MATCH STRUCTURE & SEMANTIC LAYOUT:
1. HEADER:
   - Match duration (gameTime in format "MM:SS") is located in the center of the top bar.
   - Blue side team total kills are on the top bar to the left of the game clock.
   - Red side team total kills are on the top bar to the right of the game clock.
   - The winning team is marked by the golden "VICTORY" banner and/or holds the gold MVP crown ribbon.

2. PLAYERS (5 on Blue Side left, 5 on Red Side right):
   - From top to bottom, the 5 player rows correspond to roles: EXP Lane, Jungle, Mid Lane, Gold Lane, Roam.
   - For each player, locate and extract:
     * hero: The official canonical hero name (e.g. "Fanny", "Yu Zhong", "Valentina", "Claude", "Tigreal", "Ling", "Terizla", "Melissa", "Gloo", "Aamon", etc.), identifying the hero even with custom skins or tournament portraits.
     * rawIgn: The exact string visible on screen (including squad tags, clan symbols like ÁŚ, emojis, etc.). If the player is a bot ([Computer] <HeroName>), the hero is strictly that HeroName.
     * name: The resolved canonical IGN from the official registered team rosters below. Strip squad prefixes (e.g. 'SIMP ', 'FEX ', 'NOVA ', 'TAG ') and clan symbols.
     * kda: Format "K/D/A" (e.g. "6/0/4").
     * gold: Total gold as an integer (e.g. 8900).
     * level: Hero level as an integer (1-15) located on the hero avatar badge.
     * items: Array of up to 6 item/equipment names from the player's 6 item slots (e.g. "Demon Boots", "Blade of Despair", "Athena's Shield", "Endless Battle", "Malefic Roar", "Corrosion Scythe", "Oracle", "Clock of Destiny", etc.).
     * isMvp: boolean. Look at the medal column in the middle. The Game MVP has a distinctive golden medal with a vibrant red ribbon banner reading "MVP" and a golden crown. Exactly ONE player in the entire match has isMvp: true.

3. OFFICIAL REGISTERED PLAYOFF ROSTERS:
${rosterList}

CRITICAL RULES:
- Identify which registered team is on the Blue side and which is on the Red side by matching player names.
- Always strip squad prefixes (e.g., 'SIMP LenXer.' -> 'LenXer.', 'ÁŚ Nocturne' -> 'Nocturne', 'FEX Seffyroth' -> 'Seffyroth').
- Winner must be strictly "blue" or "red".
- All numerical totals (kills, gold) must be accurate and non-negative.
- Output MUST be valid, parseable JSON conforming strictly to the requested schema. No conversational prose or explanations outside the JSON.`;
  }

  static get JSON_SCHEMA() {
    return {
      type: "object",
      properties: {
        winner: { type: "string", enum: ["blue", "red"] },
        gameTime: { type: "string" },
        blue: {
          type: "object",
          properties: {
            teamId: { type: "string" },
            teamName: { type: "string" },
            kills: { type: "integer" },
            gold: { type: "integer" },
            players: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  slot: { type: "integer" },
                  role: { type: "string" },
                  hero: { type: "string" },
                  rawIgn: { type: "string" },
                  name: { type: "string" },
                  kda: { type: "string" },
                  gold: { type: "integer" },
                  level: { type: "integer" },
                  items: { type: "array", items: { type: "string" } },
                  isMvp: { type: "boolean" }
                },
                required: ["slot", "role", "hero", "name", "kda", "gold", "isMvp"]
              }
            }
          },
          required: ["kills", "gold", "players"]
        },
        red: {
          type: "object",
          properties: {
            teamId: { type: "string" },
            teamName: { type: "string" },
            kills: { type: "integer" },
            gold: { type: "integer" },
            players: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  slot: { type: "integer" },
                  role: { type: "string" },
                  hero: { type: "string" },
                  rawIgn: { type: "string" },
                  name: { type: "string" },
                  kda: { type: "string" },
                  gold: { type: "integer" },
                  level: { type: "integer" },
                  items: { type: "array", items: { type: "string" } },
                  isMvp: { type: "boolean" }
                },
                required: ["slot", "role", "hero", "name", "kda", "gold", "isMvp"]
              }
            }
          },
          required: ["kills", "gold", "players"]
        },
        mvp: {
          type: "object",
          properties: {
            side: { type: "string", enum: ["blue", "red"] },
            slot: { type: "integer" },
            name: { type: "string" },
            hero: { type: "string" },
            kda: { type: "string" },
            reason: { type: "string" }
          },
          required: ["side", "slot", "name", "hero", "kda"]
        }
      },
      required: ["winner", "gameTime", "blue", "red", "mvp"]
    };
  }

  // =========================================================================
  // 2. DRAFT (PICK & BAN) VISION
  // =========================================================================

  static buildDraftPrompt(teams = Playoffs.teams) {
    const rosterList = this.formatRosterContext(teams);
    return `You are a world-class Mobile Legends: Bang Bang (MLBB) tournament referee and esports broadcast analyst.
Analyze the attached draft / pick & ban screen screenshot and extract all draft data in JSON format:

AUTOMATIC SCREEN LOCATION & ELEMENT DETECTION:
- First, scan the full image to auto-detect where the game viewport is located. Automatically ignore any black bars (letterboxing/pillarboxing), emulator window titlebars (MuMuPlayer, LDPlayer, BlueStacks, Nox), desktop background, taskbars, or Android navigation buttons.
- The screenshot can be of ANY resolution (720p, 1080p, 1440p, 4K, 1600x900, windowed emulator capture, or mobile/tablet screen mirror) and any aspect ratio (16:9, 16:10, 18:9, 19.5:9, 20:9, 4:3).
- Auto-locate all visual draft elements semantically by their structural placement wherever they appear on the screen, without relying on fixed coordinates.

DRAFT STRUCTURE & SEMANTIC LAYOUT:
1. DRAFT HEADER & PHASE:
   - Identify the current draft phase header (e.g. "Allied Team Ban", "Enemy Team Ban", "Allied Team Pick", "Enemy Team Pick", "Last Changes", "LIVE DRAFT", etc.) located in the top-center area.
   - Extract the remaining countdown timer in seconds (integer 0-60) displayed near the center header.

2. BANS (up to 5 per side):
   - Blue side bans: Located in the upper area on the left side (up to 5 banned heroes).
   - Red side bans: Located in the upper area on the right side (up to 5 banned heroes).
   - Use canonical hero names (e.g. "Brody", "Valentina", "Angela", "Diggie", "Mathilda", "Nolan", "Joy", "Fanny", etc.). Leave empty "" for unbanned/empty slots.

3. PICKS (5 per side):
   - Blue side picks: 5 heroes along the left side (slots 0 to 4 from top to bottom).
   - Red side picks: 5 heroes along the right side (slots 0 to 4 from top to bottom).
   - For each picked hero:
     * slot: 0 to 4 (top to bottom).
     * hero: Canonical hero name (e.g. "Fanny", "Nolan", "Melissa", "Clint", "Tigreal", etc.). Leave empty "" if not yet picked or still selecting.
     * rawIgn: Visible player name or handle shown under/beside the hero avatar.
     * name: Resolved canonical IGN from the official registered team rosters below. Strip squad tags.

4. OFFICIAL REGISTERED PLAYOFF ROSTERS:
${rosterList}

CRITICAL RULES:
- Identify which registered team is on the Blue side and which is on the Red side by matching player names.
- Output MUST be valid, parseable JSON conforming strictly to the requested schema. No conversational prose or explanations outside the JSON.`;
  }

  static get DRAFT_SCHEMA() {
    return {
      type: "object",
      properties: {
        phase: { type: "string" },
        timer: { type: "integer" },
        blue: {
          type: "object",
          properties: {
            teamName: { type: "string" },
            bans: {
              type: "array",
              items: { type: "string" }
            },
            picks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  slot: { type: "integer" },
                  hero: { type: "string" },
                  rawIgn: { type: "string" },
                  name: { type: "string" }
                },
                required: ["slot", "hero"]
              }
            }
          },
          required: ["bans", "picks"]
        },
        red: {
          type: "object",
          properties: {
            teamName: { type: "string" },
            bans: {
              type: "array",
              items: { type: "string" }
            },
            picks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  slot: { type: "integer" },
                  hero: { type: "string" },
                  rawIgn: { type: "string" },
                  name: { type: "string" }
                },
                required: ["slot", "hero"]
              }
            }
          },
          required: ["bans", "picks"]
        }
      },
      required: ["phase", "blue", "red"]
    };
  }

  // =========================================================================
  // 3. IN-GAME SPECTATOR HUD VISION
  // =========================================================================

  static buildInGamePrompt(teams = Playoffs.teams, currentMatch = null) {
    const rosterList = this.formatRosterContext(teams);
    let heroLockContext = '';
    if (currentMatch && (currentMatch.blueHeroes?.length || currentMatch.redHeroes?.length || currentMatch.blue?.some(p => p.hero) || currentMatch.red?.some(p => p.hero))) {
      const formatTeam = (teamOrHeroes) => {
        if (!teamOrHeroes) return '';
        if (Array.isArray(teamOrHeroes) && typeof teamOrHeroes[0] === 'string') return teamOrHeroes.filter(Boolean).join(', ');
        return (teamOrHeroes || []).filter(p => p.hero).map(p => `Slot ${p.slot} (${p.name || 'Player ' + (p.slot + 1)}): ${p.hero}`).join(', ');
      };
      const bH = formatTeam(currentMatch.blue || currentMatch.blueHeroes);
      const rH = formatTeam(currentMatch.red || currentMatch.redHeroes);
      heroLockContext = `
CURRENT MATCH HERO CONSISTENCY:
- In Mobile Legends, players NEVER change their hero during an active match.
- Already confirmed heroes in this ongoing match:
  * Blue Side: [${bH || 'Detecting'}]
  * Red Side: [${rH || 'Detecting'}]
- Maintain hero consistency for each slot throughout the game. If a slot's hero is already listed above, lock it to that exact hero. Do NOT flip confirmed heroes to different heroes on blurry or animated frames.
`;
    }
    return `You are a world-class Mobile Legends: Bang Bang (MLBB) tournament referee and esports statistics analyst.
Analyze the attached in-game spectator match screenshot and extract current live telemetry in JSON format:
${heroLockContext}
AUTOMATIC SCREEN LOCATION & ELEMENT DETECTION:
- First, scan the full image to auto-detect where the game viewport is located. Automatically ignore any black bars (letterboxing/pillarboxing), emulator window titlebars (MuMuPlayer, LDPlayer, BlueStacks, Nox), desktop background, taskbars, or Android navigation buttons.
- The screenshot can be of ANY resolution (720p, 1080p, 1440p, 4K, 1600x900, ultrawide, windowed emulator capture, or mobile/tablet screen mirror) and any aspect ratio (16:9, 16:10, 18:9, 19.5:9, 20:9, 4:3).
- Auto-locate all visual telemetry elements semantically by their structural placement wherever they appear on the screen, without relying on fixed coordinates.

IN-GAME HUD STRUCTURE & SEMANTIC LAYOUT:
1. MATCH CLOCK & OBJECTIVES (Top HUD Bar):
   - gameTime: Game clock (e.g. "05:37", "14:22") located in the top-center bar.
   - Blue team total kills: Located to the left of the game clock.
   - Red team total kills: Located to the right of the game clock.
   - Blue total gold (e.g. 17200) and Red total gold (e.g. 14300) from the top score bar.
   - Blue and Red turrets destroyed count if visible.
   - Lord counts for both sides if visible on the top/side HUD.

2. PLAYER TELEMETRY (5 Blue on left, 5 Red on right):
   - MLBB spectator mode displays players either along the side rails (5 on left edge, 5 on right edge) or in an expanded equipment overlay table across the center. Auto-detect which display is shown.
   - For each player from slot 0 to 4 (top to bottom):
     * slot: 0 to 4.
     * hero: Official canonical hero name (e.g. "Hanabi", "Layla", "Dyrroth", "Zilong", "Minotaur", "Aurora", "Uranus"). If player name contains "[Computer] <HeroName>", the hero is definitely that hero name.
     * rawIgn: Exact visible player name string.
     * name: Resolved canonical IGN from the official registered team rosters below. Strip squad tags.
     * level: Current hero level as an integer (1-15) displayed on the level badge.
     * kda: Current format "K/D/A" string (e.g. "2/0/5").
     * gold: Player gold as an integer (e.g. 3400) if visible.
     * items: Array of currently equipped item names (e.g. ["Blade of the Heptaseas", "Hunter Strike", "Tough Boots"]).

3. OFFICIAL REGISTERED PLAYOFF ROSTERS:
${rosterList}

CRITICAL RULES:
- Identify which registered team is on the Blue side and which is on the Red side by matching player names.
- Output MUST be valid, parseable JSON conforming strictly to the requested schema. No conversational prose or explanations outside the JSON.`;
  }

  static get INGAME_SCHEMA() {
    return {
      type: "object",
      properties: {
        gameTime: { type: "string" },
        blue: {
          type: "object",
          properties: {
            kills: { type: "integer" },
            gold: { type: "integer" },
            turrets: { type: "integer" },
            lord: { type: "integer" },
            players: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  slot: { type: "integer" },
                  hero: { type: "string" },
                  rawIgn: { type: "string" },
                  name: { type: "string" },
                  level: { type: "integer", nullable: true },
                  kda: { type: "string" },
                  gold: { type: "integer" },
                  itemsVisible: { type: "boolean" },
                  items: { type: "array", items: { type: "string" } }
                },
                required: ["slot", "hero", "level", "itemsVisible", "items"]
              }
            }
          },
          required: ["kills", "players"]
        },
        red: {
          type: "object",
          properties: {
            kills: { type: "integer" },
            gold: { type: "integer" },
            turrets: { type: "integer" },
            lord: { type: "integer" },
            players: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  slot: { type: "integer" },
                  hero: { type: "string" },
                  rawIgn: { type: "string" },
                  name: { type: "string" },
                  level: { type: "integer", nullable: true },
                  kda: { type: "string" },
                  gold: { type: "integer" },
                  itemsVisible: { type: "boolean" },
                  items: { type: "array", items: { type: "string" } }
                },
                required: ["slot", "hero", "level", "itemsVisible", "items"]
              }
            }
          },
          required: ["kills", "players"]
        }
      },
      required: ["gameTime", "blue", "red"]
    };
  }

  // =========================================================================
  // 4. UNIFIED REALTIME LIVE SCREEN VISION (Auto-Classifies Mode)
  // =========================================================================

  static buildLivePrompt(teams = Playoffs.teams, currentMatch = null) {
    const rosterList = this.formatRosterContext(teams);
    let heroLockContext = '';
    if (currentMatch && (currentMatch.blueHeroes?.length || currentMatch.redHeroes?.length || currentMatch.blue?.some(p => p.hero) || currentMatch.red?.some(p => p.hero))) {
      const formatTeam = (teamOrHeroes) => {
        if (!teamOrHeroes) return '';
        if (Array.isArray(teamOrHeroes) && typeof teamOrHeroes[0] === 'string') return teamOrHeroes.filter(Boolean).join(', ');
        return (teamOrHeroes || []).filter(p => p.hero).map(p => `Slot ${p.slot} (${p.name || 'Player ' + (p.slot + 1)}): ${p.hero}`).join(', ');
      };
      const bH = formatTeam(currentMatch.blue || currentMatch.blueHeroes);
      const rH = formatTeam(currentMatch.red || currentMatch.redHeroes);
      heroLockContext = `
CURRENT MATCH HERO CONSISTENCY:
- In Mobile Legends, players NEVER change their hero during an active match.
- Already confirmed heroes in this ongoing match:
  * Blue Side: [${bH || 'Detecting'}]
  * Red Side: [${rH || 'Detecting'}]
- Maintain hero consistency for each slot throughout the game. If a slot's hero is already listed above, lock it to that exact hero. Do NOT flip confirmed heroes to different heroes on blurry or animated frames.
`;
    }
    return `You are a world-class real-time Mobile Legends: Bang Bang (MLBB) tournament broadcast referee AI.
Analyze this screen capture and extract structured tournament data in JSON format:
${heroLockContext}
AUTOMATIC SCREEN LOCATION & ELEMENT DETECTION:
- First, scan the full image to auto-detect where the game viewport is located. Automatically ignore any black bars (letterboxing/pillarboxing), emulator window titlebars (MuMuPlayer, LDPlayer, BlueStacks, Nox), desktop background, taskbars, or Android navigation buttons.
- The screenshot can be of ANY resolution (720p, 1080p, 1440p, 4K, 1600x900, ultrawide, windowed emulator capture, or mobile/tablet screen mirror) and any aspect ratio (16:9, 16:10, 18:9, 19.5:9, 20:9, 4:3).
- Auto-locate all visual elements semantically by their structural placement wherever they appear on the screen, without relying on fixed coordinates.

SCREEN CLASSIFICATION & DATA EXTRACTION:
First, classify the active screen into one of these modes:
1. "draft": Pick & Ban phase screen (bans at top, picks on left/right columns, countdown timer in header).
   - Extract draft object: phase, timer (seconds remaining), blue bans (up to 5), red bans (up to 5), blue picks (5 slots: slot, hero, rawIgn, name), red picks (5 slots: slot, hero, rawIgn, name).
2. "game": In-game live spectator match screen (clock at top center, team kills, gold, turrets, 10 player side-rails/equipment cards).
   - Extract game object: gameTime ("MM:SS"), blue kills/gold/turrets, red kills/gold/turrets, and 10 players (5 blue, 5 red: slot, hero, rawIgn, name, level 1-15, kda "K/D/A", gold, items). Recognize each player's hero from the circular hero portrait on their side-rail card. Never output player IGN as hero. If player name contains "[Computer] <HeroName>", the hero is definitely that hero name.
3. "result": Final post-game match scoreboard (victory/defeat banner, 10 player scoreboard rows with items, levels, gold, KDAs, and MVP).
   - Extract result object: winner ("blue" or "red"), gameTime ("MM:SS"), blue/red kills and gold, 10 player rows (slot 0-4, role, hero, rawIgn, name, kda, gold, level 1-15, items, isMvp), and mvp object (side, slot, name, hero, kda). Look for the golden medal with red "MVP" ribbon for isMvp.
4. "other": Loading screen, lobby, caster desk, or other screen. Set mode: "other" and omit details.

OFFICIAL REGISTERED PLAYOFF ROSTERS:
${rosterList}

CRITICAL RULES:
- Identify teams and resolve player names against the official rosters. Strip squad tags.
- Output MUST be valid, parseable JSON conforming strictly to schema. No conversational prose or explanations outside the JSON.`;
  }

  static get LIVE_SCHEMA() {
    return {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["draft", "game", "result", "other"] },
        draft: this.DRAFT_SCHEMA,
        game: this.INGAME_SCHEMA,
        result: this.JSON_SCHEMA
      },
      required: ["mode"]
    };
  }

  static buildRealtimePrompt(currentMatch) {
    return `Extract only visible Mobile Legends: Bang Bang broadcast data as compact JSON.
Locate the game inside any emulator borders. Classify mode: draft, game, result, or other.
Include ONLY the object for that mode. No commentary. Do not invent hidden values.
game: gameTime MM:SS, blue/red visible kills, gold, turrets, lord counts and players.
draft: phase, countdown timer seconds, blue/red bans and picks.
result: winner blue/red, gameTime, blue/red kills/gold and players, actual MVP medal.
Player slot is the visual row, 0-4 per side, even when rows differ from draft order.
Read hero, rawIgn, visible kda/gold, and level badge 1-15; use null for unreadable level.
Recognize hero portraits, including skins. Every player has a hero portrait avatar in their side-rail card. Identify the official MLBB hero from the portrait (e.g. Miya, Layla, Saber, Balmond, Hanabi, Zilong, Badang, Aurora, Uranus, Minotaur, Chou, etc.). Never output a player's gamer tag or IGN as their hero name. A [Computer] Hero label identifies its hero.
For EVERY player output itemsVisible and items. Equipment visible: output up to 6 equipment
names in slot order; use empty string for an unreadable or empty slot. Hidden equipment:
itemsVisible=false, items=[]. The round spell beside a side-rail portrait is NOT equipment.
An open equipment table is still mode=game, unless a victory/defeat result is visible.
Only assign items and level to the same visible player's row. Do not assume role order.
Known identities (use to identify heroes, not to copy statistics): ${JSON.stringify(currentMatch || {})}
Equipment vocabulary: ${catalog.items.filter(i => i.icon).map(i => i.name).join(', ')}.`;
  }

  // =========================================================================
  // CORE API CALLER (fast-first model cascade with automatic 503/429 retry)
  // =========================================================================

  /**
   * Universal Gemini Vision API caller, starting with the fastest available Lite models.
   */
  static async callVisionApi(imageInput, apiKey, prompt, schema, options = {}) {
    const key = String(apiKey || process.env.GEMINI_API_KEY || '').trim();
    if (!key) throw Error('Missing Google Gemini API Key. Configure the key in the Post-Match tab.');
    const imageInputs = Array.isArray(imageInput) ? imageInput : [imageInput];
    if (!imageInputs.length || imageInputs.length > 4) throw Error('Gemini Vision accepts one to four images per analysis.');
    const imageParts = imageInputs.map(input => {
      let mimeType = 'image/jpeg', base64Data;
      if (Buffer.isBuffer(input)) base64Data = input.toString('base64');
      else if (typeof input === 'string') {
        if (input.startsWith('data:')) {
          const match = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
          if (!match) throw Error('Invalid image data URL format');
          [, mimeType, base64Data] = match;
        } else base64Data = input.trim();
      } else throw Error('Invalid image input provided to Gemini Vision');
      if (!base64Data) throw Error('Empty image provided to Gemini Vision');
      return { inline_data: { mime_type: mimeType, data: base64Data } };
    });
    const models = this.getActiveModels();
    if (!models.length) throw Error('AI models are cooling down; local HUD detection continues.');
    // One total deadline, including fallback. Never retry the same stale frame
    // twice per model or accumulate minutes of requests behind live capture.
    const deadline = AbortSignal.timeout(options.realtime ? 12000 : 35000);
    const signal = options.signal ? AbortSignal.any([deadline, options.signal]) : deadline;
    let lastError;
    for (const model of models.slice(0, options.realtime ? 2 : 3)) {
      signal.throwIfAborted();
      const payload = {
        contents: [{ parts: [{ text: prompt }, ...imageParts] }],
        generationConfig: {
          response_mime_type: 'application/json', response_schema: schema,
          temperature: 0, maxOutputTokens: 4096,
          thinkingConfig: { thinkingLevel: /3\.[78]-/.test(model) ? 'low' : 'minimal' }
        }
      };
      try {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(payload), signal
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const message = body.error?.message || 'Gemini API HTTP ' + response.status;
          const error = Error(message);
          if (response.status === 401 || response.status === 403) throw Object.assign(error, { fatal: true });
          if ([404, 429, 503].includes(response.status)) {
            const retryAfter = Number(response.headers?.get?.('retry-after')) * 1000;
            this.setModelCooldown(model, response.status === 404 ? 900000 : Math.max(15000, retryAfter || 60000), message);
          }
          throw error;
        }
        const body = await response.json(), candidate = body.candidates?.[0];
        if (!candidate || candidate.finishReason && candidate.finishReason !== 'STOP') throw Error('Incomplete AI response: ' + (candidate?.finishReason || 'no candidate'));
        const output = (candidate.content?.parts || []).filter(part => !part.thought).map(part => part.text || '').join('').trim();
        const cleaned = output.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        const parsed = JSON.parse(cleaned);
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw Error('AI response must be a JSON object');
        parsed._modelUsed = model;
        this._modelCooldowns.delete(model);
        return parsed;
      } catch (error) {
        if (signal.aborted || error.fatal) throw error;
        lastError = error;
      }
    }
    throw Error('AI Vision analysis failed: ' + (lastError?.message || 'no available model'));
  }

  // =========================================================================
  // PUBLIC ANALYSIS METHODS
  // =========================================================================

  /**
   * Analyzes an MLBB postgame scoreboard image with Gemini Vision API.
   */
  static async analyzeScoreboard(imageInput, apiKey, teams = Playoffs.teams) {
    const prompt = this.buildPrompt(teams) + (Array.isArray(imageInput) && imageInput.length > 1
      ? '\nThe first image is the full scoreboard. Following images are enlarged crops of the blue and red player tables in that order. Use the crops to identify each row\'s own hero portrait and item icons. Keep each item list attached to its same row; do not shift icons between adjacent players.' : '');
    const data = await this.callVisionApi(imageInput, apiKey, prompt, this.JSON_SCHEMA);
    return this.formatResult(data, teams);
  }

  /**
   * Analyzes an MLBB draft / pick & ban image with Gemini Vision API.
   */
  static async analyzeDraft(imageInput, apiKey, teams = Playoffs.teams) {
    const prompt = this.buildDraftPrompt(teams);
    const data = await this.callVisionApi(imageInput, apiKey, prompt, this.DRAFT_SCHEMA);
    return this.formatDraftResult(data, teams);
  }

  /**
   * Analyzes an MLBB in-game spectator HUD image with Gemini Vision API.
   */
  static async analyzeInGame(imageInput, apiKey, teams = Playoffs.teams, currentMatch = null) {
    const prompt = this.buildInGamePrompt(teams, currentMatch);
    const data = await this.callVisionApi(imageInput, apiKey, prompt, this.INGAME_SCHEMA);
    return this.formatInGameResult(data, teams);
  }

  /**
   * Analyzes an MLBB live screen of ANY resolution and auto-detects mode (draft, game, result).
   */
  static async analyzeLiveScreen(imageInput, apiKey, teams = Playoffs.teams, currentMatch = null, options = {}) {
    const prompt = options.realtime ? this.buildRealtimePrompt(currentMatch) : this.buildLivePrompt(teams, currentMatch) + '\nNever infer hidden equipment. For every player provide itemsVisible, items in slot order, and null for unreadable levels. Round battle spells are not equipment.';
    const data = await this.callVisionApi(imageInput, apiKey, prompt, this.LIVE_SCHEMA, options);
    return this.formatLiveResult(data, teams);
  }

  // =========================================================================
  // RESULT FORMATTERS & BROADCAST PATCH GENERATORS
  // =========================================================================

  /**
   * Post-processes and normalizes Gemini Vision output against official playoff models.
   */
  static formatResult(data, teams = Playoffs.teams) {
    const roles = ['EXP', 'JUNGLE', 'MID', 'GOLD', 'ROAM'];

    // Verify and post-process players for both sides
    for (const side of ['blue', 'red']) {
      const teamObj = data[side] || {};
      const players = Array.isArray(teamObj.players) ? teamObj.players : [];

      // Find registered team if teamId wasn't exact
      let identifiedTeam = Playoffs.team(teamObj.teamId) || Playoffs.identify(players.map(p => p.rawIgn || p.name))?.team;
      if (identifiedTeam) {
        teamObj.teamId = identifiedTeam.id;
        teamObj.teamName = identifiedTeam.name;
      }

      teamObj.players = Array.from({ length: 5 }, (_, i) => {
        const p = players[i] || {};
        let canonicalName = p.name || p.rawIgn || '';
        let matchMethod = 'AI Vision';

        // Secondary verification against official roster
        if (identifiedTeam) {
          const match = Playoffs.matchPlayer(p.rawIgn || p.name, identifiedTeam.players);
          if (match) {
            canonicalName = match.name;
            matchMethod = match.method;
          }
        }

        const rawItems = Array.isArray(p.items) ? p.items : [];
        const resolvedItems = rawItems.slice(0, 6).map(it => {
          return typeof it === 'string' ? (GeminiVision.matchItem(it) || { id: 0, name: it, icon: '' }) : it;
        });

        const rawName = String(p.rawIgn || p.name || '').trim();
        const botMatch = rawName.match(/(?:\[|\b)Computer\]?\s*([A-Za-z0-9\s'-]+)/i);
        const resolvedHero = botMatch ? GeminiVision.matchHero(botMatch[1]) : (GeminiVision.matchHero(p.hero) || '');

        return {
          slot: i,
          role: p.role || roles[i] || 'EXP',
          hero: resolvedHero,
          rawName,
          name: canonicalName,
          kda: String(p.kda || '0/0/0').replace(/\s+/g, ''),
          gold: Number.isFinite(p.gold) ? p.gold : 0,
          level: Number.isFinite(p.level) ? Math.min(15, Math.max(1, p.level)) : 15,
          items: resolvedItems,
          isMvp: !!p.isMvp,
          matchMethod
        };
      });

      // Calculate kill sum if missing
      const calculatedKills = teamObj.players.reduce((sum, p) => sum + (parseInt(p.kda.split('/')[0], 10) || 0), 0);
      teamObj.kills = teamObj.kills ?? calculatedKills;

      // Calculate gold sum if missing
      const calculatedGold = teamObj.players.reduce((sum, p) => sum + (p.gold || 0), 0);
      teamObj.gold = teamObj.gold ?? calculatedGold;
    }

    // Determine Game MVP player (must strictly be from the winning team)
    const winSide = data.winner === 'red' ? 'red' : 'blue';
    const mvpSide = winSide;
    const mvpSlot = (data.mvp?.side === winSide && Number.isInteger(data.mvp?.slot)) ? data.mvp.slot : 0;
    const mvpPlayer = (data.mvp?.side === winSide && data[winSide]?.players?.[mvpSlot]) || data[winSide]?.players?.find(p => p.isMvp) || data[winSide]?.players?.[0];

    const patch = {
      winner: winSide,
      gameTime: data.gameTime || '11:00',
      scene: 'postgame',
      phase: 'RESULT',
      blue: {
        kills: data.blue.kills,
        gold: data.blue.gold,
        players: data.blue.players.map(p => ({
          name: p.name,
          role: p.role,
          hero: p.hero,
          kda: p.kda,
          gold: p.gold,
          level: p.level,
          items: p.items || []
        }))
      },
      red: {
        kills: data.red.kills,
        gold: data.red.gold,
        players: data.red.players.map(p => ({
          name: p.name,
          role: p.role,
          hero: p.hero,
          kda: p.kda,
          gold: p.gold,
          level: p.level,
          items: p.items || []
        }))
      },
      mvp: {
        player: `${mvpSide}.${mvpSlot}`,
        name: mvpPlayer?.name || '',
        role: mvpPlayer?.role || '',
        hero: mvpPlayer?.hero || '',
        kda: mvpPlayer?.kda || '',
        items: Array.from({ length: 6 }, (_, idx) => {
          const it = (mvpPlayer?.items || [])[idx];
          return typeof it === 'string' ? it : (it?.name || '');
        }),
        gpm: mvpPlayer?.gold ? String(Math.round(mvpPlayer.gold / 11)) : '700',
        kp: '80%'
      }
    };

    const modelUsed = data._modelUsed || 'gemini-3.1-flash-lite';
    return {
      success: true,
      engine: `Gemini Vision AI (${modelUsed})`,
      data,
      patch
    };
  }

  /**
   * Post-processes and normalizes draft vision output.
   */
  static formatDraftResult(data, teams = Playoffs.teams) {
    const formatBans = (bans) => {
      const arr = Array.isArray(bans) ? bans : [];
      return Array.from({ length: 5 }, (_, i) => {
        const b = String(arr[i] || '').trim();
        return GeminiVision.matchHero(b) || b;
      });
    };

    const formatPicks = (picks, side) => {
      const arr = Array.isArray(picks) ? picks : [];
      return Array.from({ length: 5 }, (_, i) => {
        const p = arr.find((row, index) => (row.slot ?? index) === i) || {};
        const rawName = String(p.rawIgn || p.name || '').trim();
        const botMatch = rawName.match(/(?:\[|\b)Computer\]?\s*([A-Za-z0-9\s'-]+)/i);
        const resolvedHero = botMatch ? GeminiVision.matchHero(botMatch[1]) : (GeminiVision.matchHero(p.hero) || '');
        return {
          slot: i,
          role: ['EXP', 'JUNGLE', 'MID', 'GOLD', 'ROAM'][i],
          hero: resolvedHero,
          name: String(p.name || p.rawIgn || `Player ${i + 1}`).trim(),
          kda: '0/0/0',
          gold: 0,
          level: 0
        };
      });
    };

    const timer = Number.isInteger(data.timer) ? Math.max(0, Math.min(60, data.timer)) : 30;

    const patch = {
      scene: 'draft',
      phase: String(data.phase || 'LIVE DRAFT').trim(),
      draftTimer: {
        remaining: timer
      },
      blue: {
        bans: formatBans(data.blue?.bans),
        players: formatPicks(data.blue?.picks, 'blue')
      },
      red: {
        bans: formatBans(data.red?.bans),
        players: formatPicks(data.red?.picks, 'red')
      }
    };

    const modelUsed = data._modelUsed || 'gemini-3.1-flash-lite';
    return {
      success: true,
      engine: `Gemini Vision AI (Draft - ${modelUsed})`,
      data,
      patch
    };
  }

  /**
   * Post-processes and normalizes in-game spectator HUD vision output.
   */
  static formatInGameResult(data, teams = Playoffs.teams) {
    const formatInGamePlayers = (players) => {
      const arr = Array.isArray(players) ? players : [];
      return Array.from({ length: 5 }, (_, i) => {
        const p = arr.find((row, index) => (row.slot ?? index) === i) || {};
        const rawItems = Array.isArray(p.items) ? p.items : [];
        const resolvedItems = rawItems.slice(0, 6).map(it => {
          return GeminiVision.matchItem(it) || { id: 0, name: '', icon: '' };
        });

        const rawName = String(p.rawIgn || p.name || '').trim();
        const botMatch = rawName.match(/(?:\[|\b)Computer\]?\s*([A-Za-z0-9\s'-]+)/i);
        const resolvedHero = botMatch ? GeminiVision.matchHero(botMatch[1]) : (GeminiVision.matchHero(p.hero) || '');

        return {
          slot: i,
          role: ['EXP', 'JUNGLE', 'MID', 'GOLD', 'ROAM'][i],
          hero: resolvedHero,
          name: String(p.name || p.rawIgn || `Player ${i + 1}`).trim(),
          level: Number.isInteger(p.level) && p.level >= 1 && p.level <= 15 ? p.level : 0,
          kda: String(p.kda || '0/0/0').replace(/\s+/g, ''),
          gold: Number.isFinite(p.gold) ? p.gold : 0,
          items: resolvedItems,
          itemsVisible: p.itemsVisible === true || (p.itemsVisible !== false && rawItems.length > 0)
        };
      });
    };

    const patch = {
      scene: 'scoreboard',
      blue: {
        players: formatInGamePlayers(data.blue?.players)
      },
      red: {
        players: formatInGamePlayers(data.red?.players)
      }
    };

    if (/^\d{1,3}:[0-5]\d$/.test(data.gameTime)) patch.gameTime = data.gameTime;
    for (const side of ['blue', 'red']) for (const field of ['kills', 'gold', 'turrets', 'lord']) {
      const value = data[side]?.[field];
      if (Number.isFinite(value) && value >= 0) patch[side][field] = value;
    }

    const modelUsed = data._modelUsed || 'gemini-3.1-flash-lite';
    return {
      success: true,
      engine: `Gemini Vision AI (In-Game - ${modelUsed})`,
      data,
      patch
    };
  }

  /**
   * Post-processes unified live detection output and generates appropriate scene patch.
   */
  static formatLiveResult(data, teams = Playoffs.teams) {
    const mode = data.mode || 'other';
    const modelUsed = data._modelUsed || 'gemini-3.1-flash-lite';
    if (mode === 'draft' && data.draft) {
      if (typeof data.draft === 'object') data.draft._modelUsed = modelUsed;
      const res = this.formatDraftResult(data.draft, teams);
      return { mode: 'draft', ...res };
    }
    if (mode === 'game' && data.game) {
      if (typeof data.game === 'object') data.game._modelUsed = modelUsed;
      const res = this.formatInGameResult(data.game, teams);
      return { mode: 'game', ...res };
    }
    if (mode === 'result' && data.result) {
      if (typeof data.result === 'object') data.result._modelUsed = modelUsed;
      const res = this.formatResult(data.result, teams);
      return { mode: 'result', ...res };
    }
    return {
      success: true,
      mode: 'other',
      engine: `Gemini Vision AI (${modelUsed})`,
      patch: null
    };
  }
}

module.exports = GeminiVision;
