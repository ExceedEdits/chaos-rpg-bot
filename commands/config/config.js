// ============================================================
//  Chaos RPG Bot — /config
//  Configurações de servidor e de sessão ativa.
// ============================================================

const { SlashCommandBuilder, ChannelType } = require('discord.js');
const sessionStore       = require('../../utils/sessionStore');
const rpgStore           = require('../../utils/rpgSessionStore');
const { resolveOrReply } = require('../../utils/sessionResolver');
const { setPrefix }      = require('../../utils/prefixStore');

function isMaster(member) {
  return member.permissions.has('Administrator')
      || member.roles.cache.some(r => r.name === (process.env.MASTER_ROLE ?? 'Mestre'));
}

const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Configurações do servidor e da sessão ativa')

  .addSubcommand(s => s
    .setName('ver')
    .setDescription('Exibe as configurações atuais'))

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

  await interaction.deferReply({ ephemeral: true });

  if (!isMaster(interaction.member)) {
    await interaction.editReply('❌ Você precisa ser administrador ou Mestre para alterar configurações.');
    return;
  }

  // ── ver ────────────────────────────────────────────────────
  if (sub === 'ver') {
    const session    = await sessionStore.load(guildId);
    const rpgSession = (await rpgStore.resolveSession(guildId, interaction.channelId))?.session;
    const settings   = rpgSession?.settings ?? {};
    const { getPrefix } = require('../../utils/prefixStore');
    const prefix     = await getPrefix(guildId);

    const mapCh      = session.channelId              ? `<#${session.channelId}>`                      : '*canal do comando*';
    const trackCh    = rpgSession?.trackerChannelId   ? `<#${rpgSession.trackerChannelId}>`            : '*canal do comando*';
    const trackFixed = settings.trackerFixed          ? 'Sim (mensagem fixa)'                         : 'Nao (nova por turno)';
    const decr       = settings.decrementMode === 'turn' ? 'Por turno'                                : 'Por rodada';

    const lines = [
      '⚙️ **Configurações atuais**',
      '',
      `• Cargo de Mestre: **${process.env.MASTER_ROLE ?? 'Mestre'}** *(definido no .env)*`,
      `• Modo de dados: **${process.env.USE_LOCAL_DATA === 'true' ? 'Local (JSON)' : 'MongoDB Atlas'}**`,
      `• Prefixo de texto: \`${prefix}\``,
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
      // Canal do mapa vive na sessão simples (sessionStore)
      const session = await sessionStore.load(guildId);
      session.channelId    = canal.id;
      session.mapMessageId = null; // força nova mensagem no novo canal
      await sessionStore.save(guildId, session);
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
