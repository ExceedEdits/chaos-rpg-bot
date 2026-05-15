// ============================================================
//  Chaos RPG Bot — /rpg
//  Gerencia sessões de RPG.
//  Cada sessão tem um Mestre dono (masterId) e status ativo/offline.
//  Apenas o dono ou admins podem alterar status, deletar e configurar.
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const rpgStore = require('../../utils/rpgSessionStore');
const { isMaster, isSessionMaster } = require('../../utils/sessionResolver');

const data = new SlashCommandBuilder()
  .setName('rpg')
  .setDescription('Gerencia sessões de RPG neste servidor')

  .addSubcommand(s => s
    .setName('criar')
    .setDescription('Cria uma nova sessão e vincula ao canal atual (Mestre)')
    .addStringOption(o => o
      .setName('id')
      .setDescription('Identificador da sessão (ex: campanha-sombria, oneshot-1)')
      .setRequired(true)))

  .addSubcommand(s => s
    .setName('entrar')
    .setDescription('Vincula este canal a uma sessão existente (Mestre)')
    .addStringOption(o => o
      .setName('id')
      .setDescription('ID da sessão')
      .setRequired(true)))

  .addSubcommand(s => s
    .setName('encerrar')
    .setDescription('Desvincula este canal da sessão ativa'))

  .addSubcommand(s => s
    .setName('listar')
    .setDescription('Lista todas as sessões deste servidor'))

  .addSubcommand(s => s
    .setName('status')
    .setDescription('Altera o status da sessão ativa (dono da sessão)')
    .addStringOption(o => o
      .setName('estado')
      .setDescription('Novo status da sessão')
      .setRequired(true)
      .addChoices(
        { name: '🟢 Ativa',   value: 'online'  },
        { name: '🔴 Offline', value: 'offline' },
      )))

  .addSubcommand(s => s
    .setName('deletar')
    .setDescription('Deleta uma sessão permanentemente (dono da sessão)')
    .addStringOption(o => o
      .setName('id')
      .setDescription('ID da sessão a deletar')
      .setRequired(true)))

  .addSubcommand(s => s
    .setName('configurar')
    .setDescription('Ajusta configurações da sessão ativa (dono da sessão)')
    .addStringOption(o => o
      .setName('status_tracker')
      .setDescription('Exibir status ativos no tracker de turno?')
      .addChoices(
        { name: 'Mostrar', value: 'true'  },
        { name: 'Ocultar', value: 'false' },
      ))
    .addStringOption(o => o
      .setName('efeitos_tracker')
      .setDescription('Exibir efeitos aplicando no tracker de turno?')
      .addChoices(
        { name: 'Mostrar', value: 'true'  },
        { name: 'Ocultar', value: 'false' },
      ))
    .addStringOption(o => o
      .setName('decremento')
      .setDescription('Quando decrementar duração dos status?')
      .addChoices(
        { name: 'Por rodada (volta completa)',    value: 'round' },
        { name: 'Por turno (vez de cada jogador)', value: 'turn'  },
      )));

// ── Executor ──────────────────────────────────────────────────
async function execute(interaction) {
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const chanId  = interaction.channelId;

  await interaction.deferReply({ ephemeral: true });

  // ── listar — sem restrição de cargo ───────────────────────
  if (sub === 'listar') {
    const list = await rpgStore.listSessions(guildId);
    if (list.length === 0) {
      await interaction.editReply('📭 Nenhuma sessão criada. Use `/rpg criar`.');
      return;
    }
    const lines = ['📋 **Sessões RPG neste servidor:**', ''];
    for (const s of list) {
      const cfg    = s.settings ?? {};
      const status = s.online !== false ? '🟢 Ativa' : '🔴 Offline';
      const mestre = s.masterId ? `<@${s.masterId}>` : '*desconhecido*';
      lines.push(`**${s.sessionId}** — ${status}`);
      lines.push(`  • Mestre: ${mestre}`);
      lines.push(`  • Mapa ativo: \`${s.activeMap ?? 'nenhum'}\``);
      lines.push(`  • Status no tracker: ${cfg.showStatusInTracker !== false ? '✅' : '❌'}`);
      lines.push(`  • Decremento: ${cfg.decrementMode === 'turn' ? '⏩ por turno' : '🔁 por rodada'}`);
      lines.push('');
    }
    await interaction.editReply(lines.join('\n'));
    return;
  }

  // ── criar — qualquer Mestre ────────────────────────────────
  if (sub === 'criar') {
    if (!isMaster(interaction.member)) {
      const cargo = process.env.MASTER_ROLE ?? 'Mestre';
      await interaction.editReply(`❌ Você precisa do cargo **${cargo}** para criar sessões.`);
      return;
    }
    const id = interaction.options.getString('id');
    try {
      const session = await rpgStore.createSession(guildId, id);
      // Salva o masterId e online
      session.masterId = interaction.user.id;
      session.online   = true;
      await rpgStore.saveSession(guildId, session.sessionId, session);
      await rpgStore.setChannelSession(guildId, chanId, session.sessionId);
      await interaction.editReply([
        `✅ Sessão **${session.sessionId}** criada e vinculada a este canal.`,
        `👑 Mestre responsável: <@${interaction.user.id}>`,
        ``,
        `Use \`/rpg configurar\` para ajustar as preferências.`,
        `Use \`/rpg entrar id:${session.sessionId}\` em outros canais para acessar a mesma sessão.`,
      ].join('\n'));
    } catch (e) {
      await interaction.editReply(`❌ ${e.message}`);
    }
    return;
  }

  // ── entrar — qualquer Mestre ───────────────────────────────
  if (sub === 'entrar') {
    if (!isMaster(interaction.member)) {
      const cargo = process.env.MASTER_ROLE ?? 'Mestre';
      await interaction.editReply(`❌ Você precisa do cargo **${cargo}** para vincular canais.`);
      return;
    }
    const id      = interaction.options.getString('id').toLowerCase().replace(/\s+/g, '-');
    const session = await rpgStore.loadSession(guildId, id);
    if (!session) {
      await interaction.editReply(`❌ Sessão \`${id}\` não encontrada. Use \`/rpg listar\`.`);
      return;
    }
    await rpgStore.setChannelSession(guildId, chanId, id);
    const status = session.online !== false ? '🟢 Ativa' : '🔴 Offline';
    await interaction.editReply(`✅ Canal vinculado à sessão **${id}** (${status}).`);
    return;
  }

  // ── encerrar — qualquer Mestre ─────────────────────────────
  if (sub === 'encerrar') {
    if (!isMaster(interaction.member)) {
      const cargo = process.env.MASTER_ROLE ?? 'Mestre';
      await interaction.editReply(`❌ Você precisa do cargo **${cargo}** para desvincular canais.`);
      return;
    }
    const current = await rpgStore.getChannelSession(chanId);
    if (!current) {
      await interaction.editReply('❌ Este canal não está vinculado a nenhuma sessão.');
      return;
    }
    await rpgStore.clearChannelSession(chanId);
    await interaction.editReply(`✅ Canal desvinculado da sessão **${current}**.`);
    return;
  }

  // ── status — dono da sessão ────────────────────────────────
  if (sub === 'status') {
    const resolved = await rpgStore.resolveSession(guildId, chanId);
    if (!resolved) {
      await interaction.editReply('❌ Nenhuma sessão ativa neste canal. Use `/rpg entrar`.');
      return;
    }
    const { session, sessionId } = resolved;

    if (!isSessionMaster(interaction.member, session)) {
      await interaction.editReply('❌ Apenas o Mestre que criou esta sessão (ou um administrador) pode alterar o status.');
      return;
    }

    const estado   = interaction.options.getString('estado');
    session.online = estado === 'online';
    await rpgStore.saveSession(guildId, sessionId, session);

    const label = session.online ? '🟢 Ativa' : '🔴 Offline';
    await interaction.editReply(`✅ Sessão **${sessionId}** agora está **${label}**.`);
    return;
  }

  // ── deletar — dono da sessão ───────────────────────────────
  if (sub === 'deletar') {
    if (!isMaster(interaction.member)) {
      const cargo = process.env.MASTER_ROLE ?? 'Mestre';
      await interaction.editReply(`❌ Você precisa do cargo **${cargo}** para deletar sessões.`);
      return;
    }

    const id      = interaction.options.getString('id').toLowerCase().replace(/\s+/g, '-');
    const session = await rpgStore.loadSession(guildId, id);
    if (!session) {
      await interaction.editReply(`❌ Sessão \`${id}\` não encontrada.`);
      return;
    }

    if (!isSessionMaster(interaction.member, session)) {
      await interaction.editReply('❌ Apenas o Mestre que criou esta sessão (ou um administrador) pode deletá-la.');
      return;
    }

    // Remove todos os vínculos de canal e depois a sessão
    await rpgStore.clearSessionChannels(guildId, id);
    await rpgStore.deleteSession(guildId, id);
    await interaction.editReply(`🗑️ Sessão **${id}** deletada e todos os canais desvinculados.`);
    return;
  }

  // ── configurar — dono da sessão ────────────────────────────
  if (sub === 'configurar') {
    const resolved = await rpgStore.resolveSession(guildId, chanId);
    if (!resolved) {
      await interaction.editReply('❌ Nenhuma sessão ativa neste canal. Use `/rpg criar` ou `/rpg entrar`.');
      return;
    }
    const { session, sessionId } = resolved;

    if (!isSessionMaster(interaction.member, session)) {
      await interaction.editReply('❌ Apenas o Mestre que criou esta sessão (ou um administrador) pode configurá-la.');
      return;
    }

    if (!session.settings) session.settings = { ...rpgStore.DEFAULT_SETTINGS };

    const statusTracker  = interaction.options.getString('status_tracker');
    const efeitosTracker = interaction.options.getString('efeitos_tracker');
    const decremento     = interaction.options.getString('decremento');

    if (statusTracker  !== null) session.settings.showStatusInTracker = statusTracker  === 'true';
    if (efeitosTracker !== null) session.settings.showEffectsApplying = efeitosTracker === 'true';
    if (decremento     !== null) session.settings.decrementMode       = decremento;

    await rpgStore.saveSession(guildId, sessionId, session);

    const cfg = session.settings;
    await interaction.editReply([
      `✅ Sessão **${sessionId}** configurada:`,
      `  • Status no tracker: ${cfg.showStatusInTracker ? '✅ visível' : '❌ oculto'}`,
      `  • Efeitos aplicando: ${cfg.showEffectsApplying ? '✅ visível' : '❌ oculto'}`,
      `  • Decremento: ${cfg.decrementMode === 'turn' ? '⏩ por turno' : '🔁 por rodada'}`,
    ].join('\n'));
  }
}

module.exports = { data, execute };
