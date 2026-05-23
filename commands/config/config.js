// ============================================================
//  Chaos RPG Bot — /config
//  Configurações de servidor e de sessão ativa.
// ============================================================

const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const rpgStore              = require('../../utils/rpgSessionStore');
const { resolveOrReply,
        isMaster }          = require('../../utils/sessionResolver');
const { setPrefix }         = require('../../utils/prefixStore');
const { getMasterRoleId,
        setMasterRoleId,
        getDiceListener,
        setDiceListener }   = require('../../utils/guildSettingsStore');

const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Configurações do servidor e da sessão ativa')

  .addSubcommand(s => s
    .setName('ver')
    .setDescription('Exibe as configurações atuais'))

  .addSubcommand(s => s
    .setName('cargo-mestre')
    .setDescription('Define o cargo de Mestre do servidor (apenas Administradores)')
    .addRoleOption(o => o
      .setName('cargo')
      .setDescription('Cargo que terá permissão de Mestre')
      .setRequired(true)))

  .addSubcommand(s => s
    .setName('canal')
    .setDescription('Define o canal de saída para mapa ou tracker de turno (Mestre)')
    .addStringOption(o => o
      .setName('destino')
      .setDescription('O que configurar')
      .setRequired(true)
      .addChoices(
        { name: 'Mapa',              value: 'mapa'    },
        { name: 'Tracker de turno',  value: 'tracker' },
      ))
    .addChannelOption(o => o
      .setName('canal')
      .setDescription('Canal onde as mensagens serão enviadas')
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildText)))

  .addSubcommand(s => s
    .setName('prefixo')
    .setDescription('Muda o prefixo de comandos de texto do servidor (Mestre)')
    .addStringOption(o => o
      .setName('prefixo')
      .setDescription('Novo prefixo (1 a 5 caracteres, ex: ! $ >> ?)')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(5)))

  .addSubcommand(s => s
    .setName('listener-dado')
    .setDescription('Ativa ou desativa a rolagem automática de dados em mensagens (Mestre)')
    .addStringOption(o => o
      .setName('estado')
      .setDescription('Ativar ou desativar o listener de dados')
      .setRequired(true)
      .addChoices(
        { name: 'Ativo — responde rolagens escritas em mensagens (ex: 2d6)',   value: 'sim' },
        { name: 'Inativo — ignora mensagens; use apenas /rolar ou prefixo',    value: 'nao' },
      )))

  .addSubcommand(s => s
    .setName('tracker')
    .setDescription('Configura o comportamento do tracker de turno (Mestre)')
    .addStringOption(o => o
      .setName('fixo')
      .setDescription('Editar sempre a mesma mensagem fixada ou postar uma nova a cada turno')
      .setRequired(true)
      .addChoices(
        { name: 'Sim — mensagem fixa editada',     value: 'sim' },
        { name: 'Nao — nova mensagem a cada turno', value: 'nao' },
      ))
    .addStringOption(o => o
      .setName('decremento')
      .setDescription('Quando os status dos personagens decrementam')
      .addChoices(
        { name: 'Por rodada — todos ao virar a rodada', value: 'round' },
        { name: 'Por turno — cada um ao fim do seu turno', value: 'turn' },
      )));

async function execute(interaction) {
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // ── cargo-mestre — apenas administradores ─────────────────
  if (sub === 'cargo-mestre') {
    if (!interaction.member.permissions.has('Administrator')) {
      await interaction.editReply('❌ Apenas administradores podem definir o cargo de Mestre do servidor.');
      return;
    }
    const role = interaction.options.getRole('cargo');
    await setMasterRoleId(guildId, role.id);
    await interaction.editReply(`✅ Cargo de Mestre definido como <@&${role.id}>.\nMembros com este cargo terão permissões de Mestre.`);
    return;
  }

  if (!await isMaster(interaction.member)) {
    await interaction.editReply('❌ Você precisa ser administrador ou Mestre para alterar configurações.');
    return;
  }

  // ── ver ────────────────────────────────────────────────────
  if (sub === 'ver') {
    const rpgSession = (await rpgStore.resolveSession(guildId, interaction.channelId))?.session;
    const settings   = rpgSession?.settings ?? {};
    const { getPrefix } = require('../../utils/prefixStore');
    const prefix     = await getPrefix(guildId);

    const mapCh      = rpgSession?.channelId         ? `<#${rpgSession.channelId}>`                   : '*canal do comando*';
    const trackCh    = rpgSession?.trackerChannelId  ? `<#${rpgSession.trackerChannelId}>`            : '*canal do comando*';
    const trackFixed = settings.trackerFixed          ? 'Sim (mensagem fixa)'                         : 'Nao (nova por turno)';
    const decr       = settings.decrementMode === 'turn' ? 'Por turno'                                : 'Por rodada';

    const masterRoleId = await getMasterRoleId(guildId);
    const masterRoleLabel = masterRoleId
      ? `<@&${masterRoleId}>`
      : `**${process.env.MASTER_ROLE ?? 'Mestre'}** *(fallback por nome — use \`/config cargo-mestre\` para configurar por ID)*`;

    const diceEnabled = await getDiceListener(guildId);

    const lines = [
      '⚙️ **Configurações atuais**',
      '',
      `• Cargo de Mestre: ${masterRoleLabel}`,
      `• Modo de dados: **${process.env.USE_LOCAL_DATA === 'true' ? 'Local (JSON)' : 'MongoDB Atlas'}**`,
      `• Prefixo de texto: \`${prefix}\``,
      `• Listener de dados: **${diceEnabled ? '✅ Ativo' : '❌ Inativo'}**`,
      '',
      '**Canais de saída:**',
      `  • Mapa: ${mapCh}`,
      `  • Tracker: ${trackCh}`,
      '',
      '**Tracker:**',
      `  • Modo fixo: **${trackFixed}**`,
      `  • Decremento de status: **${decr}**`,
    ];

    await interaction.editReply(lines.join('\n'));
    return;
  }

  // ── listener-dado ─────────────────────────────────────────
  if (sub === 'listener-dado') {
    const ativo = interaction.options.getString('estado') === 'sim';
    await setDiceListener(guildId, ativo);
    await interaction.editReply(
      ativo
        ? '✅ Listener de dados **ativado**. O bot responderá a rolagens escritas em mensagens (ex: `2d6`).'
        : '✅ Listener de dados **desativado**. Use `/rolar` ou o prefixo de texto para rolar dados.'
    );
    return;
  }

  // ── prefixo ───────────────────────────────────────────────
  if (sub === 'prefixo') {
    const novo = interaction.options.getString('prefixo');
    await setPrefix(guildId, novo);
    await interaction.editReply(`✅ Prefixo alterado para \`${novo}\`. Use \`${novo}help\` ou \`/help\` para ver os comandos.`);
    return;
  }

  // ── canal ──────────────────────────────────────────────────
  if (sub === 'canal') {
    const destino = interaction.options.getString('destino');
    const canal   = interaction.options.getChannel('canal');

    if (destino === 'mapa') {
      // Canal do mapa vive na sessão RPG
      const resolved = await resolveOrReply(interaction);
      if (!resolved) return;

      const { session, sessionId } = resolved;
      session.channelId    = canal.id;
      session.mapMessageId = null; // força nova mensagem no novo canal
      await rpgStore.saveSession(guildId, sessionId, session);
      await interaction.editReply(`✅ Canal do **mapa** definido como <#${canal.id}>.\nA próxima atualização do mapa será postada lá.`);
      return;
    }

    if (destino === 'tracker') {
      // Canal do tracker vive na sessão RPG
      const resolved = await resolveOrReply(interaction);
      if (!resolved) return;

      const { session, sessionId } = resolved;
      session.trackerChannelId = canal.id;
      session.trackerMessageId = null; // força nova mensagem no novo canal
      await rpgStore.saveSession(guildId, sessionId, session);
      await interaction.editReply(`✅ Canal do **tracker** definido como <#${canal.id}>.\nO próximo avanço de turno enviará o tracker lá.`);
      return;
    }
  }

  // ── tracker ────────────────────────────────────────────────
  if (sub === 'tracker') {
    const resolved = await resolveOrReply(interaction);
    if (!resolved) return;

    const { session, sessionId } = resolved;
    session.settings = session.settings ?? {};

    const fixo      = interaction.options.getString('fixo');
    const decremento = interaction.options.getString('decremento');

    const lines = [];

    if (fixo !== null) {
      const isFixed = fixo === 'sim';
      session.settings.trackerFixed = isFixed;
      if (!isFixed) session.trackerMessageId = null; // descarta mensagem fixada anterior
      lines.push(`• Modo fixo: **${isFixed ? 'Sim (mensagem fixa editada)' : 'Nao (nova por turno)'}**`);
    }

    if (decremento !== null) {
      session.settings.decrementMode = decremento;
      lines.push(`• Decremento de status: **${decremento === 'turn' ? 'Por turno' : 'Por rodada'}**`);
    }

    await rpgStore.saveSession(guildId, sessionId, session);
    await interaction.editReply(`✅ **Tracker configurado:**\n${lines.join('\n')}`);
  }
}

module.exports = { data, execute };
