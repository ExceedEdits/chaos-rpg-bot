// ============================================================
//  Chaos RPG Bot — Message Listener
//  Detecta rolagens, combat tags e iniciativa em mensagens normais.
// ============================================================

const { parse, parseSingleRoll } = require('../utils/diceParser');
const { format }                 = require('../utils/diceFormatter');
const tagStore                   = require('../utils/tagStore');
const { executeCombatTag }       = require('../utils/combatTags');
const { handleInitiative }       = require('../utils/initiativeTags');

const IGNORED_PREFIXES = ['/', '!', '?', '.', '-'];

function registerMessageRoll(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guildId)   return;

    const raw = message.content.trim();
    if (!raw) return;
    if (IGNORED_PREFIXES.some(p => raw.startsWith(p))) return;

    const customTags = await tagStore.getAll(message.guildId);
    const parsed     = parse(raw, customTags);
    if (!parsed) return;

    const value     = parsed.results[0].total;
    const rollLabel = `\`${parsed.results[0].notation}\` → ${parsed.results[0].label}`;

    try {
      // ── Iniciativa ────────────────────────────────────────────
      if (parsed.initiativeTag) {
        const msg = await handleInitiative(
          message.guildId, message.channelId, value, rollLabel,
          parsed.initiativeTarget,
          message.member
        );
        await message.reply({ content: msg });
        return;
      }

      // ── Combat tag ────────────────────────────────────────────
      if (parsed.combatTag) {
        const rpgSt2     = require('../utils/rpgSessionStore');
        const resolved2  = await rpgSt2.resolveSession(message.guildId, message.channelId);
        const activeChars = resolved2?.session?.activeChars ?? {};
        const msg = await executeCombatTag(
          message.guildId, parsed.combatTag, parsed.combatTarget, value, rollLabel, activeChars
        );
        await message.reply({ content: msg });
        return;
      }

      // ── Rolagem normal ────────────────────────────────────────
      const rollFn = () => {
        const baseNotation = parsed.results[0].notation.replace(/[+-]\d+$/, '').trim();
        const r = parseSingleRoll(baseNotation);
        return r ? { results: [r] } : null;
      };
      await message.reply({ content: format(parsed, rollFn) });

    } catch (err) {
      console.error('[Chaos RPG] Erro ao responder mensagem:', err);
    }
  });
}

module.exports = { registerMessageRoll };
