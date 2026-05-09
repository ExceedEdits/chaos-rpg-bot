// ============================================================
//  Chaos RPG Bot — /turno
//  Gerencia o ciclo de combate — usa sessão ativa do canal.
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const characterStore           = require('../../utils/characterStore');
const rpgStore                 = require('../../utils/rpgSessionStore');
const { resolveOrReply }       = require('../../utils/sessionResolver');
const { processRoundForChar }  = require('../../utils/statusEngine');
const { renderTracker }        = require('../../utils/turnRenderer');

const data = new SlashCommandBuilder()
  .setName('turno')
  .setDescription('Gerencia o sistema de turnos de combate')
  .addSubcommand(s => s
    .setName('iniciar')
    .setDescription('Inicia o combate com a ordem de iniciativa atual'))
  .addSubcommand(s => s
    .setName('avancar')
    .setDescription('Avança para o próximo turno'))
  .addSubcommand(s => s
    .setName('encerrar')
    .setDescription('Encerra o combate e limpa a ordem de turno'))
  .addSubcommand(s => s
    .setName('ver')
    .setDescription('Mostra o tracker de turno atual'));

async function execute(interaction) {
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  await interaction.deferReply();

  const resolved = await resolveOrReply(interaction);
  if (!resolved) return;

  const { session, sessionId } = resolved;
  const settings  = session.settings ?? {};
  const combat    = session.combat ?? { active: false, round: 0, current: 0, order: [] };
  const allChars  = await characterStore.getAll(guildId);

  // ── iniciar ────────────────────────────────────────────────
  if (sub === 'iniciar') {
    if (!combat.order || combat.order.length === 0) {
      await interaction.editReply(
        '❌ Nenhuma iniciativa registrada.\nUse `2d6 iniciativa Ada` para registrar antes de iniciar.'
      );
      return;
    }
    combat.order.sort((a, b) => b.initiative - a.initiative);
    combat.active  = true;
    combat.round   = 1;
    combat.current = 0;
    session.combat = combat;
    await rpgStore.saveSession(guildId, sessionId, session);

    await interaction.editReply(
      `⚔️ **Combate iniciado!**\n\n${renderTracker(combat, allChars, settings)}`
    );
    return;
  }

  // ── ver ────────────────────────────────────────────────────
  if (sub === 'ver') {
    if (!combat.active) {
      await interaction.editReply('❌ Nenhum combate ativo. Use `/turno iniciar`.');
      return;
    }
    await interaction.editReply(renderTracker(combat, allChars, settings));
    return;
  }

  // ── encerrar ───────────────────────────────────────────────
  if (sub === 'encerrar') {
    session.combat = { active: false, round: 0, current: 0, order: [] };
    await rpgStore.saveSession(guildId, sessionId, session);
    await interaction.editReply('🏁 Combate encerrado. Ordem de turno limpa.');
    return;
  }

  // ── avancar ────────────────────────────────────────────────
  if (sub === 'avancar') {
    if (!combat.active) {
      await interaction.editReply('❌ Nenhum combate ativo. Use `/turno iniciar`.');
      return;
    }

    const decrementMode = settings.decrementMode ?? 'round';
    const prevIdx       = combat.current;
    combat.current      = (combat.current + 1) % combat.order.length;
    const isNewRound    = combat.current === 0;

    const statusLogs = [];

    if (decrementMode === 'turn') {
      // Decrementa só o personagem que acabou de jogar
      const prevEntry = combat.order[prevIdx];
      const prevChar  = prevEntry.charId
        ? allChars.find(c => c.id === prevEntry.charId)
        : null;

      if (prevChar?.statuses?.length > 0) {
        const { char: updated, logs, expired } =
          await processRoundForChar(prevChar, async c => characterStore.upsert(guildId, c));
        await characterStore.upsert(guildId, updated);

        const name = updated.emoji
          ? `${updated.emoji} **${updated.name}**` : `**${updated.name}**`;
        if (logs.length > 0 || expired.length > 0) {
          statusLogs.push(name);
          statusLogs.push(...logs);
          if (expired.length > 0)
            statusLogs.push(`  ✨ Expirou: ${expired.map(l => `**${l}**`).join(', ')}`);
        }
      }
    } else if (isNewRound) {
      // Decrementa todos ao virar a rodada
      combat.round++;
      const withStatus = allChars.filter(c => c.statuses?.length > 0);

      for (const char of withStatus) {
        const { char: updated, logs, expired } =
          await processRoundForChar(char, async c => characterStore.upsert(guildId, c));
        await characterStore.upsert(guildId, updated);

        const name = updated.emoji
          ? `${updated.emoji} **${updated.name}**` : `**${updated.name}**`;
        if (logs.length > 0 || expired.length > 0) {
          statusLogs.push(name);
          statusLogs.push(...logs);
          if (expired.length > 0)
            statusLogs.push(`  ✨ Expirou: ${expired.map(l => `**${l}**`).join(', ')}`);
        }
      }
    }

    // Se modo round mas não virou rodada, só incrementa round no iniciar
    if (decrementMode === 'round' && !isNewRound) {
      // Não incrementa round aqui — só na virada
    } else if (decrementMode === 'turn') {
      // No modo turn, round incrementa a cada volta completa também
      if (isNewRound) combat.round++;
    }

    session.combat = combat;
    await rpgStore.saveSession(guildId, sessionId, session);

    const freshChars = await characterStore.getAll(guildId);
    const tracker    = renderTracker(combat, freshChars, settings);

    const lines = [];
    if (isNewRound && decrementMode === 'round') {
      lines.push(`🔄 **Nova rodada — Rodada ${combat.round}!**`);
    }
    if (statusLogs.length > 0) {
      lines.push('', '📋 **Efeitos de status processados:**', ...statusLogs, '');
    }
    lines.push(tracker);

    await interaction.editReply(lines.join('\n'));
  }
}

module.exports = { data, execute };
