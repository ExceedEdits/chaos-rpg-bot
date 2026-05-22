// ============================================================
//  Chaos RPG Bot — Message Listener
//  Detecta rolagens, combat tags e iniciativa em mensagens normais.
// ============================================================

const { parse, parseExpression, buildExprLabel } = require('../utils/diceParser');
const { format }                                  = require('../utils/diceFormatter');
const tagStore                                    = require('../utils/tagStore');
const { executeCombatTag }                        = require('../utils/combatTags');
const { handleInitiative }                        = require('../utils/initiativeTags');
const { getPrefix }                               = require('../utils/prefixStore');

// Prefixos fixos de bots comuns — mensagens que começam com eles
// nunca são rolagens de dado (ex: /slash, !comando, .comando).
const IGNORED_PREFIXES = ['/', '!', '?', '.', '-'];

function registerMessageRoll(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guildId)   return;

    const raw = message.content.trim();
    if (!raw) return;

    // Ignora prefixos fixos de bots comuns
    if (IGNORED_PREFIXES.some(p => raw.startsWith(p))) return;

    // Ignora o prefixo configurado para este servidor — essas mensagens
    // já são tratadas pelo prefixListener e não devem gerar double reply.
    const guildPrefix = await getPrefix(message.guildId);
    if (raw.startsWith(guildPrefix)) return;

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
        const rpgSt      = require('../utils/rpgSessionStore');
        const resolved   = await rpgSt.resolveSession(message.guildId, message.channelId);
        const activeChars = resolved?.session?.activeChars ?? {};
        const msg = await executeCombatTag(
          message.guildId, parsed.combatTag, parsed.combatTarget, value, rollLabel, activeChars
        );
        await message.reply({ content: msg });
        return;
      }

      // ── Rolagem normal ────────────────────────────────────────
      const rollFn = () => {
        const expr = parseExpression(parsed.exprData?.notation ?? parsed.results[0].notation);
        if (!expr) return null;
        const compat = {
          rolls:    expr.rolls,
          total:    expr.total,
          label:    buildExprLabel(expr),
          notation: expr.notation,
          sides:    expr.sides,
        };
        return { results: [compat], exprData: expr };
      };

      await message.reply({ content: format(parsed, rollFn) });

    } catch (err) {
      console.error('[Chaos RPG] Erro ao responder mensagem:', err);
    }
  });
}

module.exports = { registerMessageRoll };
