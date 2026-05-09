// ============================================================
//  Chaos RPG Bot — /rolar (com combat tags e iniciativa)
// ============================================================

const { SlashCommandBuilder }      = require('discord.js');
const { parse, parseSingleRoll }   = require('../../utils/diceParser');
const { format }                   = require('../../utils/diceFormatter');
const tagStore                     = require('../../utils/tagStore');
const { executeCombatTag }         = require('../../utils/combatTags');
const { handleInitiative }         = require('../../utils/initiativeTags');

const data = new SlashCommandBuilder()
  .setName('rolar')
  .setDescription('Rola dados e expressões')
  .addStringOption(o => o
    .setName('expressao')
    .setDescription('Ex: 2d6+3, 4df, &15 dano Ada, 1d20 iniciativa Ada')
    .setRequired(true));

async function execute(interaction) {
  const raw      = interaction.options.getString('expressao').trim();
  const guildId  = interaction.guildId;

  const customTags = await tagStore.getAll(guildId);
  const parsed     = parse(raw, customTags);

  if (!parsed) {
    await interaction.reply({
      content: `❌ Não entendi \`${raw}\`. Exemplos: \`2d6\`, \`4df\`, \`3#d6\`, \`&2+5\``,
      ephemeral: true,
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
    const resolved2  = await (require('../../utils/rpgSessionStore')).resolveSession(guildId, interaction.channelId);
    const activeChars = resolved2?.session?.activeChars ?? {};
    const msg = await executeCombatTag(
      guildId, parsed.combatTag, parsed.combatTarget, value, rollLabel, activeChars
    );
    await interaction.editReply(msg);
    return;
  }

  // ── Rolagem normal ──────────────────────────────────────────
  const rollFn = () => {
    const baseNotation = parsed.results[0].notation.replace(/[+-]\d+$/, '').trim();
    const r = parseSingleRoll(baseNotation);
    return r ? { results: [r] } : null;
  };

  await interaction.editReply({ content: format(parsed, rollFn) });
}

module.exports = { data, execute };
