// ============================================================
//  Chaos RPG Bot — /rolar
// ============================================================

const { SlashCommandBuilder, MessageFlags }       = require('discord.js');
const { parse, parseExpression, buildExprLabel } = require('../../utils/diceParser');
const { format }                                 = require('../../utils/diceFormatter');
const tagStore                                   = require('../../utils/tagStore');
const { executeCombatTag }                       = require('../../utils/combatTags');
const { handleInitiative }                       = require('../../utils/initiativeTags');

const data = new SlashCommandBuilder()
  .setName('rolar')
  .setDescription('Rola dados e expressões')
  .addStringOption(o => o
    .setName('expressao')
    .setDescription('Ex: 2d6+3, 2d6+1d4*2, (d20+5)*2, 4df, &15 dano Ada, 1d20 iniciativa')
    .setRequired(true));

async function execute(interaction) {
  const raw      = interaction.options.getString('expressao').trim();
  const guildId  = interaction.guildId;

  const customTags = await tagStore.getAll(guildId);
  const parsed     = parse(raw, customTags);

  if (!parsed) {
    await interaction.reply({
      content: `❌ Não entendi \`${raw}\`. Exemplos: \`2d6\`, \`2d6+1d4\`, \`(d20+5)*2\`, \`4df\`, \`3#d6\`, \`&2+5\``,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  const value     = parsed.results[0].total;
  const rollLabel = `\`${parsed.results[0].notation}\` → ${parsed.results[0].label}`;

  // ── Iniciativa ──────────────────────────────────────────────
  if (parsed.initiativeTag) {
    const msg = await handleInitiative(
      guildId, interaction.channelId, value, rollLabel,
      parsed.initiativeTarget,
      interaction.member
    );
    await interaction.editReply(msg);
    return;
  }

  // ── Combat tag ──────────────────────────────────────────────
  if (parsed.combatTag) {
    const resolved   = await (require('../../utils/rpgSessionStore')).resolveSession(guildId, interaction.channelId);
    const activeChars = resolved?.session?.activeChars ?? {};
    const msg = await executeCombatTag(
      guildId, parsed.combatTag, parsed.combatTarget, value, rollLabel, activeChars
    );
    await interaction.editReply(msg);
    return;
  }

  // ── Rolagem normal ──────────────────────────────────────────
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

  await interaction.editReply({ content: format(parsed, rollFn) });
}

module.exports = { data, execute };
