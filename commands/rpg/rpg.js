// ============================================================
//  Chaos RPG Bot — /rpg
//  Gerencia sessões de RPG por canal (requer MASTER_ROLE)
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const rpgStore = require('../../utils/rpgSessionStore');

function isMaster(member) {
  const cargo = process.env.MASTER_ROLE ?? 'Mestre';
  return member.roles.cache.some(r => r.name === cargo);
}

function requireMaster(interaction) {
  if (!isMaster(interaction.member)) {
    const cargo = process.env.MASTER_ROLE ?? 'Mestre';
    return `❌ Você precisa do cargo **${cargo}** para gerenciar sessões.`;
  }
  return null;
}

const data = new SlashCommandBuilder()
  .setName('rpg')
  .setDescription('Gerencia sessões de RPG neste servidor')

  .addSubcommand(s => s
    .setName('criar')
    .setDescription('Cria uma nova sessão e vincula ao canal atual')
    .addStringOption(o => o
      .setName('id')
      .setDescription('Identificador da sessão (ex: campanha-sombria, oneshot-1)')
      .setRequired(true)))

  .addSubcommand(s => s
    .setName('entrar')
    .setDescription('Vincula este canal a uma sessão existente')
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
    .setName('configurar')
    .setDescription('Ajusta configurações da sessão ativa neste canal')
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
        { name: 'Por rodada (volta completa)', value: 'round' },
        { name: 'Por turno (vez de cada jogador)', value: 'turn'  },
      )));

async function execute(interaction) {
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const chanId  = interaction.channelId;

  await interaction.deferReply({ ephemeral: true });

  // listar — sem restrição de cargo
  if (sub === 'listar') {
    const list = await rpgStore.listSessions(guildId);
    if (list.length === 0) {
      await interaction.editReply('📭 Nenhuma sessão criada. Use `/rpg criar`.');
      return;
    }
    const lines = ['📋 **Sessões RPG neste servidor:**', ''];
    for (const s of list) {
      const cfg = s.settings ?? {};
      lines.push(`**${s.sessionId}**`);
      lines.push(`  • Mapa ativo: \`${s.activeMap}\``);
      lines.push(`  • Status no tracker: ${cfg.showStatusInTracker !== false ? '✅' : '❌'}`);
      lines.push(`  • Efeitos aplicando: ${cfg.showEffectsApplying !== false ? '✅' : '❌'}`);
      lines.push(`  • Decremento: ${cfg.decrementMode === 'turn' ? '⏩ por turno' : '🔁 por rodada'}`);
      lines.push('');
    }
    await interaction.editReply(lines.join('\n'));
    return;
  }

  // demais subcomandos exigem cargo de Mestre
  const err = requireMaster(interaction);
  if (err) { await interaction.editReply(err); return; }

  if (sub === 'criar') {
    const id = interaction.options.getString('id');
    try {
      const session = await rpgStore.createSession(guildId, id);
      await rpgStore.setChannelSession(guildId, chanId, session.sessionId);
      await interaction.editReply([
        `✅ Sessão **${session.sessionId}** criada e vinculada a este canal.`,
        ``,
        `Use \`/rpg configurar\` para ajustar as preferências.`,
        `Use \`/rpg entrar id:${session.sessionId}\` em outros canais para acessar a mesma sessão.`,
      ].join('\n'));
    } catch (e) {
      await interaction.editReply(`❌ ${e.message}`);
    }
    return;
  }

  if (sub === 'entrar') {
    const id = interaction.options.getString('id').toLowerCase().replace(/\s+/g, '-');
    const session = await rpgStore.loadSession(guildId, id);
    if (!session) {
      await interaction.editReply(`❌ Sessão \`${id}\` não encontrada. Use \`/rpg listar\`.`);
      return;
    }
    await rpgStore.setChannelSession(guildId, chanId, id);
    await interaction.editReply(`✅ Canal vinculado à sessão **${id}**.`);
    return;
  }

  if (sub === 'encerrar') {
    const current = await rpgStore.getChannelSession(chanId);
    if (!current) {
      await interaction.editReply('❌ Este canal não está vinculado a nenhuma sessão.');
      return;
    }
    await rpgStore.clearChannelSession(chanId);
    await interaction.editReply(`✅ Canal desvinculado da sessão **${current}**.`);
    return;
  }

  if (sub === 'configurar') {
    const resolved = await rpgStore.resolveSession(guildId, chanId);
    if (!resolved) {
      await interaction.editReply('❌ Nenhuma sessão ativa neste canal. Use `/rpg criar` ou `/rpg entrar`.');
      return;
    }
    const { session, sessionId } = resolved;
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
