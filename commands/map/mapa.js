// ============================================================
//  Chaos RPG Bot — /mapa
//  Todos os subcomandos de controle do mapa (multi-guild)
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const sessionStore = require('../../utils/sessionStore');
const mapStore     = require('../../utils/mapStore');
const { renderMap } = require('../../utils/mapRenderer');

// ── Helper: edita a mensagem fixada ou posta nova ─────────────
async function editMapMessage(interaction, session, mapData) {
  const content = renderMap(mapData, session);

  if (session.mapMessageId && session.channelId) {
    try {
      const channel = await interaction.client.channels.fetch(session.channelId);
      const msg     = await channel.messages.fetch(session.mapMessageId);
      await msg.edit(content);
      return session;
    } catch { /* mensagem sumiu — posta nova abaixo */ }
  }

  const msg = await interaction.channel.send(content);
  session.mapMessageId = msg.id;
  session.channelId    = interaction.channelId;
  return session;
}

// ── Definição do comando ──────────────────────────────────────
const data = new SlashCommandBuilder()
  .setName('mapa')
  .setDescription('Controles do mapa de combate')

  .addSubcommand(s => s.setName('mostrar').setDescription('Posta o mapa no canal'))
  .addSubcommand(s => s.setName('atualizar').setDescription('Força re-render manual do mapa'))

  .addSubcommand(s => s
    .setName('mover')
    .setDescription('Move um personagem para uma célula')
    .addStringOption(o => o.setName('emoji').setDescription('Emoji do personagem').setRequired(true))
    .addStringOption(o => o.setName('celula').setDescription('Célula destino (ex: C4)').setRequired(true)))

  .addSubcommand(s => s
    .setName('cobertura')
    .setDescription('Alterna cobertura de um personagem')
    .addStringOption(o => o.setName('emoji').setDescription('Emoji do personagem').setRequired(true))
    .addStringOption(o => o.setName('nota').setDescription('Nota de cobertura (opcional)')))

  .addSubcommand(s => s
    .setName('inimigo')
    .setDescription('Move inimigo menor ou marca como fora do mapa')
    .addStringOption(o => o.setName('nome').setDescription('Nome do inimigo').setRequired(true))
    .addStringOption(o => o.setName('pos').setDescription('Célula destino ou "fora"').setRequired(true)))

  .addSubcommand(s => s
    .setName('efeito')
    .setDescription('Atualiza um efeito de turno')
    .addStringOption(o => o.setName('id').setDescription('ID do efeito (ex: nivel_mar)').setRequired(true))
    .addNumberOption(o => o.setName('valor').setDescription('Novo valor').setRequired(true)))

  .addSubcommand(s => s
    .setName('celula')
    .setDescription('Altera o tipo de uma célula do mapa base')
    .addStringOption(o => o.setName('pos').setDescription('Posição (ex: D3)').setRequired(true))
    .addStringOption(o => o.setName('tipo').setDescription('Emoji do novo tipo').setRequired(true)));

// ── Executor ──────────────────────────────────────────────────
async function execute(interaction) {
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  await interaction.deferReply({ ephemeral: true });

  // Carrega estado do servidor
  const session = await sessionStore.load(guildId);
  const mapData = await mapStore.load(guildId, session.activeMap);

  switch (sub) {

    case 'mostrar': {
      session.mapMessageId = null;
      const updated = await editMapMessage(interaction, session, mapData);
      await sessionStore.save(guildId, updated);
      await interaction.editReply('✅ Mapa postado.');
      break;
    }

    case 'atualizar': {
      const updated = await editMapMessage(interaction, session, mapData);
      await sessionStore.save(guildId, updated);
      await interaction.editReply('✅ Mapa atualizado.');
      break;
    }

    case 'mover': {
      const emoji = interaction.options.getString('emoji');
      const cell  = interaction.options.getString('celula').toUpperCase();

      if (!session.characters[emoji])
        return interaction.editReply(`❌ Personagem \`${emoji}\` não encontrado.`);
      if (!mapData.grid[cell])
        return interaction.editReply(`❌ Célula \`${cell}\` não existe no mapa.`);

      session.characters[emoji].pos = cell;
      const updated = await editMapMessage(interaction, session, mapData);
      await sessionStore.save(guildId, updated);
      await interaction.editReply(`✅ ${emoji} movido para **${cell}**.`);
      break;
    }

    case 'cobertura': {
      const emoji = interaction.options.getString('emoji');
      const nota  = interaction.options.getString('nota');

      if (!session.characters[emoji])
        return interaction.editReply(`❌ Personagem \`${emoji}\` não encontrado.`);

      const char = session.characters[emoji];
      if (nota) {
        char.cover     = true;
        char.coverNote = nota;
      } else {
        char.cover     = !char.cover;
        if (!char.cover) char.coverNote = '';
      }

      const updated = await editMapMessage(interaction, session, mapData);
      await sessionStore.save(guildId, updated);
      await interaction.editReply(`✅ Cobertura ${char.cover ? 'ativada' : 'removida'} para ${emoji}.`);
      break;
    }

    case 'inimigo': {
      const nome = interaction.options.getString('nome');
      const pos  = interaction.options.getString('pos');
      const enemy = session.enemies.find(e => e.name.toLowerCase() === nome.toLowerCase());

      if (!enemy)
        return interaction.editReply(`❌ Inimigo \`${nome}\` não encontrado.`);

      if (pos.toLowerCase() === 'fora') {
        enemy.outOfMap = true;
        enemy.pos      = null;
        const updated = await editMapMessage(interaction, session, mapData);
        await sessionStore.save(guildId, updated);
        await interaction.editReply(`✅ **${enemy.name}** marcado como Fora do Mapa.`);
      } else {
        const cell = pos.toUpperCase();
        if (!mapData.grid[cell])
          return interaction.editReply(`❌ Célula \`${cell}\` não existe no mapa.`);
        enemy.outOfMap = false;
        enemy.pos      = cell;
        const updated = await editMapMessage(interaction, session, mapData);
        await sessionStore.save(guildId, updated);
        await interaction.editReply(`✅ **${enemy.name}** movido para **${cell}**.`);
      }
      break;
    }

    case 'efeito': {
      const id    = interaction.options.getString('id');
      const valor = interaction.options.getNumber('valor');
      const effect = session.turnEffects.find(e => e.id === id);

      if (!effect)
        return interaction.editReply(`❌ Efeito \`${id}\` não encontrado.`);

      effect.value = valor;
      const updated = await editMapMessage(interaction, session, mapData);
      await sessionStore.save(guildId, updated);
      await interaction.editReply(`✅ **${effect.label}** atualizado para \`${valor}\`.`);
      break;
    }

    case 'celula': {
      const pos  = interaction.options.getString('pos').toUpperCase();
      const tipo = interaction.options.getString('tipo');

      if (!mapData.grid[pos])
        return interaction.editReply(`❌ Célula \`${pos}\` não existe no mapa.`);

      mapData.grid[pos] = tipo;
      await mapStore.save(guildId, session.activeMap, mapData);
      const updated = await editMapMessage(interaction, session, mapData);
      await sessionStore.save(guildId, updated);
      await interaction.editReply(`✅ Célula **${pos}** alterada para ${tipo}.`);
      break;
    }

    default:
      await interaction.editReply('❌ Subcomando não reconhecido.');
  }
}

module.exports = { data, execute };
