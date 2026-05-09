// ============================================================
//  Chaos RPG Bot — /turno
//  Gerencia o ciclo de combate — usa sessão ativa do canal.
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const characterStore          = require('../../utils/characterStore');
const rpgStore                = require('../../utils/rpgSessionStore');
const { resolveOrReply }      = require('../../utils/sessionResolver');
const { processRoundForChar } = require('../../utils/statusEngine');
const { renderTracker }       = require('../../utils/turnRenderer');

function isMaster(member) {
  const cargo = process.env.MASTER_ROLE ?? 'Mestre';
  return member.roles.cache.some(r => r.name === cargo)
      || member.permissions.has('Administrator');
}

function makeSlotKey() {
  return Math.random().toString(36).slice(2, 8);
}

// ── Envia ou edita o tracker no canal correto ─────────────────
//
//   Se trackerFixed=true: tenta editar mensagem fixada; se não
//   existir ou sumir, posta nova e grava o ID.
//   Se trackerChannelId estiver definido: envia para aquele canal.
//   Caso contrário: envia para o canal atual da interação.
//
//   O reply da interação é sempre uma confirmação ephemeral
//   (quando o conteúdo vai para outro canal) ou o próprio
//   conteúdo do tracker (quando nenhum canal externo foi
//   configurado e o modo não é fixed).
//
async function sendTracker(interaction, session, content, guildId, sessionId) {
  const fixed    = session.settings?.trackerFixed    ?? false;
  const targetId = session.trackerChannelId ?? null;

  // Resolve canal de destino
  let destCh = null;
  if (targetId) {
    destCh = await interaction.client.channels.fetch(targetId).catch(() => null);
  }

  if (fixed) {
    const ch = destCh ?? interaction.channel;

    // Tenta editar a mensagem fixada
    if (session.trackerMessageId) {
      try {
        const fetchCh  = session.trackerChannelId
          ? await interaction.client.channels.fetch(session.trackerChannelId).catch(() => null) ?? ch
          : ch;
        const existing = await fetchCh.messages.fetch(session.trackerMessageId).catch(() => null);
        if (existing) {
          await existing.edit(content);
          await interaction.editReply('✅ Tracker atualizado.');
          return;
        }
      } catch { /* mensagem sumiu — posta nova abaixo */ }
    }

    // Posta nova mensagem fixada
    const msg = await ch.send(content);
    session.trackerMessageId = msg.id;
    session.trackerChannelId = ch.id;
    await rpgStore.saveSession(guildId, sessionId, session);
    const where = destCh ? ` em <#${ch.id}>` : '';
    await interaction.editReply(`✅ Tracker fixado${where}.`);
    return;
  }

  // Sem modo fixo — envia para canal configurado ou canal atual
  if (destCh) {
    await destCh.send(content);
    await interaction.editReply(`✅ Tracker enviado para <#${destCh.id}>.`);
    return;
  }

  // Padrão: send no canal atual (visível a todos) + editReply invisível
  await interaction.channel.send(content);
  await interaction.editReply('✅');
}

// ── Definição do comando ──────────────────────────────────────

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
    .setDescription('Mostra o tracker de turno atual (resposta privada)'))

  .addSubcommand(s => s
    .setName('adicionar')
    .setDescription('Adiciona um participante ao combate em andamento (Mestre)')
    .addStringOption(o => o
      .setName('nome')
      .setDescription('Nome de exibição')
      .setRequired(true))
    .addIntegerOption(o => o
      .setName('valor')
      .setDescription('Valor de iniciativa')
      .setRequired(true))
    .addStringOption(o => o
      .setName('emoji')
      .setDescription('Emoji opcional (ex: 👺)'))
    .addStringOption(o => o
      .setName('tipo')
      .setDescription('Tipo do participante')
      .addChoices(
        { name: 'PC (jogador)', value: 'pc'      },
        { name: 'NPC aliado',  value: 'npc'     },
        { name: 'Inimigo',     value: 'inimigo'  },
      )))

  .addSubcommand(s => s
    .setName('remover')
    .setDescription('Remove um participante do combate em andamento (Mestre)')
    .addStringOption(o => o
      .setName('nome')
      .setDescription('Nome do participante (remove todas as entradas com esse nome)')
      .setRequired(true)));

// ── Executor ──────────────────────────────────────────────────

async function execute(interaction) {
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  // Todos os subcomandos de turno respondem ephemerally:
  // o conteúdo do tracker vai para o canal via channel.send().
  await interaction.deferReply({ ephemeral: true });

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
        '❌ Nenhuma iniciativa registrada.\n' +
        'Use `2d6 iniciativa Ada` ou `/iniciativa adicionar` para registrar antes de iniciar.'
      );
      return;
    }

    combat.order.sort((a, b) => b.initiative - a.initiative);
    combat.active  = true;
    combat.round   = 1;
    combat.current = 0;
    session.combat = combat;
    await rpgStore.saveSession(guildId, sessionId, session);

    const tracker = renderTracker(combat, allChars, settings);
    await sendTracker(interaction, session, `⚔️ **Combate iniciado!**\n\n${tracker}`, guildId, sessionId);
    return;
  }

  // ── ver ────────────────────────────────────────────────────
  if (sub === 'ver') {
    if (!combat.active) {
      await interaction.editReply('❌ Nenhum combate ativo. Use `/turno iniciar`.');
      return;
    }
    // ver é sempre ephemeral — só o Mestre/jogador consultando
    await interaction.editReply(renderTracker(combat, allChars, settings));
    return;
  }

  // ── encerrar ───────────────────────────────────────────────
  if (sub === 'encerrar') {
    session.combat           = { active: false, round: 0, current: 0, order: [] };
    session.trackerMessageId = null;
    await rpgStore.saveSession(guildId, sessionId, session);
    await interaction.editReply('🏁 Combate encerrado. Ordem de turno limpa.');
    return;
  }

  // ── adicionar ──────────────────────────────────────────────
  if (sub === 'adicionar') {
    if (!isMaster(interaction.member)) {
      await interaction.editReply(`❌ Você precisa do cargo **${process.env.MASTER_ROLE ?? 'Mestre'}** para modificar a ordem de turno.`);
      return;
    }

    const nome  = interaction.options.getString('nome').trim();
    const valor = interaction.options.getInteger('valor');
    const emoji = interaction.options.getString('emoji') ?? null;
    const tipo  = interaction.options.getString('tipo')  ?? null;

    const char      = await characterStore.find(guildId, nome);
    const prevKey   = combat.order[combat.current]?.slotKey;

    const entry = {
      charId:     char?.id       ?? null,
      name:       char?.name     ?? nome,
      emoji:      emoji ?? char?.emoji ?? null,
      team:       tipo  ?? char?.team  ?? null,
      initiative: valor,
      discordId:  char?.discordId ?? null,
      slotKey:    makeSlotKey(),
      isManual:   true,
    };

    combat.order.push(entry);

    if (combat.active) {
      combat.order.sort((a, b) => b.initiative - a.initiative);
      if (prevKey) {
        const newIdx = combat.order.findIndex(e => e.slotKey === prevKey);
        if (newIdx >= 0) combat.current = newIdx;
      }
    }

    session.combat = combat;
    await rpgStore.saveSession(guildId, sessionId, session);

    const freshChars = await characterStore.getAll(guildId);
    const nameLabel  = entry.emoji ? `${entry.emoji} **${entry.name}**` : `**${entry.name}**`;
    const teamLabel  = tipo ? ` [${tipo}]` : '';
    const header     = `✅ ${nameLabel}${teamLabel} adicionado ao combate (iniciativa ${valor}).\n\n`;

    if (combat.active) {
      const tracker = renderTracker(combat, freshChars, settings);
      await sendTracker(interaction, session, header + tracker, guildId, sessionId);
    } else {
      await interaction.editReply(header.trim());
    }
    return;
  }

  // ── remover ────────────────────────────────────────────────
  if (sub === 'remover') {
    if (!isMaster(interaction.member)) {
      await interaction.editReply(`❌ Você precisa do cargo **${process.env.MASTER_ROLE ?? 'Mestre'}** para modificar a ordem de turno.`);
      return;
    }

    const nome    = interaction.options.getString('nome').trim().toLowerCase();
    const prevKey = combat.order[combat.current]?.slotKey;
    const before  = combat.order.length;

    combat.order = combat.order.filter(e => e.name.toLowerCase() !== nome);
    const removed = before - combat.order.length;

    if (removed === 0) {
      await interaction.editReply(`❌ Nenhuma entrada com o nome **${nome}** encontrada no combate.`);
      return;
    }

    // Ajusta ponteiro de turno atual
    if (combat.order.length === 0) {
      combat.current = 0;
    } else if (prevKey) {
      const newIdx = combat.order.findIndex(e => e.slotKey === prevKey);
      combat.current = newIdx >= 0
        ? newIdx
        : Math.min(combat.current, combat.order.length - 1);
    } else {
      combat.current = Math.min(combat.current, combat.order.length - 1);
    }

    session.combat = combat;
    await rpgStore.saveSession(guildId, sessionId, session);

    const freshChars = await characterStore.getAll(guildId);
    const header     = `🗑️ **${removed}** entrada(s) de **${nome}** removida(s) do combate.\n\n`;

    if (combat.active && combat.order.length > 0) {
      const tracker = renderTracker(combat, freshChars, settings);
      await sendTracker(interaction, session, header + tracker, guildId, sessionId);
    } else {
      await interaction.editReply(
        header + (combat.order.length === 0 ? '*Nenhum participante restante.*' : '')
      );
    }
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
    const prevKey       = combat.order[prevIdx]?.slotKey;
    combat.current      = (combat.current + 1) % combat.order.length;
    const isNewRound    = combat.current === 0;

    const statusLogs = [];

    if (decrementMode === 'turn') {
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

      if (isNewRound) combat.round++;

    } else if (isNewRound) {
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

    await sendTracker(interaction, session, lines.join('\n'), guildId, sessionId);
  }
}

module.exports = { data, execute };
