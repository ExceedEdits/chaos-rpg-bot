// ============================================================
//  Chaos RPG Bot — /mapa
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const sessionStore = require('../../utils/sessionStore');
const mapStore     = require('../../utils/mapStore');
const { renderMap } = require('../../utils/mapRenderer');

// ── Helper: edita a mensagem fixada ou posta nova ─────────────
//
// Se session.channelId estiver configurado (via /config canal destino:mapa),
// o mapa sempre vai para aquele canal — mesmo quando posta uma mensagem nova.
//
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

  // Usa canal configurado ou canal da interação como fallback
  const destCh = session.channelId
    ? await interaction.client.channels.fetch(session.channelId).catch(() => null)
    : null;
  const ch = destCh ?? interaction.channel;

  const msg = await ch.send(content);
  session.mapMessageId = msg.id;
  session.channelId    = ch.id;
  return session;
}

// ── Helper: gera letras de colunas (A, B, C ...) ─────────────
function genCols(n) {
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
}

// ── Helper: valida ID de mapa ─────────────────────────────────
function validMapId(id) {
  return /^[\w-]+$/.test(id);
}

// ── Definição do comando ──────────────────────────────────────
const data = new SlashCommandBuilder()
  .setName('mapa')
  .setDescription('Controles do mapa de combate')

  // ── Comandos existentes ──────────────────────────────────────
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
    .setDescription('Altera o tipo de uma célula do mapa')
    .addStringOption(o => o.setName('pos').setDescription('Posição (ex: D3)').setRequired(true))
    .addStringOption(o => o.setName('tipo').setDescription('Emoji do novo tipo').setRequired(true)))

  // ── Novos comandos de criação ────────────────────────────────
  .addSubcommand(s => s
    .setName('criar')
    .setDescription('Cria um novo mapa vazio e o define como ativo')
    .addStringOption(o => o
      .setName('id')
      .setDescription('Identificador único, sem espaços (ex: floresta-sombria)')
      .setRequired(true))
    .addStringOption(o => o
      .setName('nome')
      .setDescription('Nome de exibição (ex: Floresta Sombria)')
      .setRequired(true))
    .addIntegerOption(o => o
      .setName('colunas')
      .setDescription('Número de colunas — gera A, B, C… (1–10)')
      .setRequired(true)
      .setMinValue(1).setMaxValue(10))
    .addIntegerOption(o => o
      .setName('linhas')
      .setDescription('Número de linhas — gera 1, 2, 3… (1–20)')
      .setRequired(true)
      .setMinValue(1).setMaxValue(20))
    .addStringOption(o => o
      .setName('padrao')
      .setDescription('Emoji padrão de todas as células (padrão: ⬜)')))

  .addSubcommand(s => s
    .setName('linha')
    .setDescription('Preenche uma linha inteira do mapa com emojis')
    .addIntegerOption(o => o
      .setName('numero')
      .setDescription('Número da linha (ex: 2)')
      .setRequired(true))
    .addStringOption(o => o
      .setName('tipos')
      .setDescription('Emojis separados por vírgula, um por coluna (ex: ⬛,⬜,🟩,⬜,⬛)')
      .setRequired(true)))

  .addSubcommand(s => s
    .setName('coluna')
    .setDescription('Preenche uma coluna inteira do mapa com emojis')
    .addStringOption(o => o
      .setName('letra')
      .setDescription('Letra da coluna (ex: B)')
      .setRequired(true))
    .addStringOption(o => o
      .setName('tipos')
      .setDescription('Emojis separados por vírgula, um por linha (ex: ⬜,🟩,🟫,⬜)')
      .setRequired(true)))

  .addSubcommand(s => s
    .setName('submatriz')
    .setDescription('Preenche uma região retangular do mapa')
    .addStringOption(o => o
      .setName('de')
      .setDescription('Célula superior esquerda (ex: B2)')
      .setRequired(true))
    .addStringOption(o => o
      .setName('ate')
      .setDescription('Célula inferior direita (ex: D4)')
      .setRequired(true))
    .addStringOption(o => o
      .setName('tipos')
      .setDescription('Emojis separados por vírgula, linha por linha da esquerda pra direita')
      .setRequired(true)))

  .addSubcommand(s => s
    .setName('legenda')
    .setDescription('Adiciona ou atualiza uma entrada na legenda do mapa')
    .addStringOption(o => o
      .setName('emoji')
      .setDescription('Emoji do tipo de terreno')
      .setRequired(true))
    .addStringOption(o => o
      .setName('descricao')
      .setDescription('Descrição do terreno (ex: Floresta Densa)')
      .setRequired(true)))

  .addSubcommand(s => s
    .setName('carregar')
    .setDescription('Troca o mapa ativo da sessão')
    .addStringOption(o => o
      .setName('id')
      .setDescription('ID do mapa (ex: mar_profundo)')
      .setRequired(true)))

  .addSubcommand(s => s
    .setName('config')
    .setDescription('Configura opções visuais do mapa ativo')
    .addStringOption(o => o
      .setName('emojis')
      .setDescription('Como exibir os personagens no grid')
      .setRequired(true)
      .addChoices(
        { name: 'Mostrar no grid',        value: 'grid'  },
        { name: 'Apenas no texto abaixo', value: 'texto' },
      )))

  .addSubcommandGroup(g => g
    .setName('personagem')
    .setDescription('Gerencia personagens no painel do mapa')
    .addSubcommand(s => s
      .setName('adicionar')
      .setDescription('Adiciona um personagem ao painel')
      .addStringOption(o => o
        .setName('emoji')
        .setDescription('Emoji do personagem (ex: 💀)')
        .setRequired(true))
      .addStringOption(o => o
        .setName('nome')
        .setDescription('Nome de exibição (ex: Ada)')
        .setRequired(true))
      .addStringOption(o => o
        .setName('local')
        .setDescription('Posição inicial: célula (ex: B3) ou texto livre (ex: Entrada Norte)')))
    .addSubcommand(s => s
      .setName('remover')
      .setDescription('Remove um personagem do painel')
      .addStringOption(o => o
        .setName('emoji')
        .setDescription('Emoji do personagem')
        .setRequired(true)))
    .addSubcommand(s => s
      .setName('posicao')
      .setDescription('Atualiza a posição no texto do painel (sem mover no grid)')
      .addStringOption(o => o
        .setName('emoji')
        .setDescription('Emoji do personagem')
        .setRequired(true))
      .addStringOption(o => o
        .setName('local')
        .setDescription('Célula (ex: C4) ou texto livre (ex: Fora do Mapa)')
        .setRequired(true))));

// ── Executor ──────────────────────────────────────────────────
async function execute(interaction) {
  const sub     = interaction.options.getSubcommand();
  const group   = interaction.options.getSubcommandGroup(false);
  const guildId = interaction.guildId;

  await interaction.deferReply({ ephemeral: true });

  const session = await sessionStore.load(guildId);
  const mapData = await mapStore.load(guildId, session.activeMap);

  // ── Grupo: personagem ────────────────────────────────────────
  if (group === 'personagem') {
    const emoji = interaction.options.getString('emoji').trim();

    switch (sub) {
      case 'adicionar': {
        if (session.characters[emoji])
          return interaction.editReply(`❌ Personagem ${emoji} já existe no painel.`);

        const nome  = interaction.options.getString('nome').trim();
        const local = interaction.options.getString('local')?.trim() ?? '—';

        session.characters[emoji] = { name: nome, pos: local, cover: false, coverNote: '' };
        const updated = await editMapMessage(interaction, session, mapData);
        await sessionStore.save(guildId, updated);
        await interaction.editReply(`✅ ${emoji} **${nome}** adicionado — *${local}*.`);
        break;
      }

      case 'remover': {
        if (!session.characters[emoji])
          return interaction.editReply(`❌ Personagem ${emoji} não encontrado.`);

        const nome = session.characters[emoji].name;
        delete session.characters[emoji];
        const updated = await editMapMessage(interaction, session, mapData);
        await sessionStore.save(guildId, updated);
        await interaction.editReply(`✅ ${emoji} **${nome}** removido do painel.`);
        break;
      }

      case 'posicao': {
        if (!session.characters[emoji])
          return interaction.editReply(`❌ Personagem ${emoji} não encontrado.`);

        const local = interaction.options.getString('local').trim();
        session.characters[emoji].pos = local;
        const updated = await editMapMessage(interaction, session, mapData);
        await sessionStore.save(guildId, updated);
        await interaction.editReply(`✅ ${emoji} posição atualizada → *${local}*.`);
        break;
      }
    }
    return;
  }

  // ── Subcomandos diretos ──────────────────────────────────────
  switch (sub) {

    // ── Comandos existentes ────────────────────────────────────

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
      const nome  = interaction.options.getString('nome');
      const pos   = interaction.options.getString('pos');
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
      const id     = interaction.options.getString('id');
      const valor  = interaction.options.getNumber('valor');
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

    // ── Novos comandos de criação ──────────────────────────────

    case 'criar': {
      const id      = interaction.options.getString('id').toLowerCase().trim();
      const nome    = interaction.options.getString('nome').trim();
      const numCols = interaction.options.getInteger('colunas');
      const numRows = interaction.options.getInteger('linhas');
      const padrao  = interaction.options.getString('padrao')?.trim() ?? '⬜';

      if (!validMapId(id))
        return interaction.editReply('❌ ID inválido. Use apenas letras, números e hífens (ex: `floresta-sombria`).');

      const cols = genCols(numCols);                              // ['A','B','C',...]
      const rows = Array.from({ length: numRows }, (_, i) => i + 1); // [1,2,3,...]

      const grid = {};
      for (const col of cols)
        for (const row of rows)
          grid[`${col}${row}`] = padrao;

      const newMap = {
        id,
        name:   nome,
        cols,
        rows,
        legend: { [padrao]: 'Terreno padrão' },
        grid,
        paths:  {},
      };

      await mapStore.save(guildId, id, newMap);

      // Ativa o novo mapa e força nova mensagem
      session.activeMap    = id;
      session.mapMessageId = null;
      session.channelId    = null;

      const updated = await editMapMessage(interaction, session, newMap);
      await sessionStore.save(guildId, updated);

      const colLabels = cols.join(', ');
      await interaction.editReply([
        `✅ Mapa **${nome}** criado — ${numCols} colunas (${colLabels}) × ${numRows} linhas.`,
        '',
        `Preencha linha por linha:`,
        `\`/mapa linha numero:1 tipos:${Array(numCols).fill(padrao).join(',')}\``,
        '',
        `Ou altere células individuais:`,
        `\`/mapa celula pos:A1 tipo:🟥\``,
        '',
        `Gerencie a legenda:`,
        `\`/mapa legenda emoji:🟥 descricao:Chefe\``,
      ].join('\n'));
      break;
    }

    case 'linha': {
      const numero = interaction.options.getInteger('numero');
      const tipos  = interaction.options.getString('tipos')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      if (!mapData.rows.includes(numero))
        return interaction.editReply(`❌ Linha \`${numero}\` não existe neste mapa (linhas: ${mapData.rows.join(', ')}).`);

      if (tipos.length !== mapData.cols.length)
        return interaction.editReply(
          `❌ Esperava **${mapData.cols.length}** tipos (um por coluna: ${mapData.cols.join(', ')}), recebi **${tipos.length}**.`
        );

      for (let i = 0; i < mapData.cols.length; i++)
        mapData.grid[`${mapData.cols[i]}${numero}`] = tipos[i];

      await mapStore.save(guildId, session.activeMap, mapData);
      const updated = await editMapMessage(interaction, session, mapData);
      await sessionStore.save(guildId, updated);
      await interaction.editReply(`✅ Linha **${numero}** preenchida: ${tipos.join(' ')}`);
      break;
    }

    case 'coluna': {
      const letra = interaction.options.getString('letra').toUpperCase().trim();
      const tipos = interaction.options.getString('tipos')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      if (!mapData.cols.includes(letra))
        return interaction.editReply(`❌ Coluna \`${letra}\` não existe neste mapa (colunas: ${mapData.cols.join(', ')}).`);

      if (tipos.length !== mapData.rows.length)
        return interaction.editReply(
          `❌ Esperava **${mapData.rows.length}** tipos (um por linha: ${mapData.rows.join(', ')}), recebi **${tipos.length}**.`
        );

      for (let i = 0; i < mapData.rows.length; i++)
        mapData.grid[`${letra}${mapData.rows[i]}`] = tipos[i];

      await mapStore.save(guildId, session.activeMap, mapData);
      const updated = await editMapMessage(interaction, session, mapData);
      await sessionStore.save(guildId, updated);
      await interaction.editReply(`✅ Coluna **${letra}** preenchida: ${tipos.join(' ')}`);
      break;
    }

    case 'submatriz': {
      const deRaw  = interaction.options.getString('de').toUpperCase().trim();
      const ateRaw = interaction.options.getString('ate').toUpperCase().trim();
      const tipos  = interaction.options.getString('tipos')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const parseCell = c => {
        const m = c.match(/^([A-Z]+)(\d+)$/);
        return m ? { col: m[1], row: parseInt(m[2], 10) } : null;
      };

      const from = parseCell(deRaw);
      const to   = parseCell(ateRaw);

      if (!from || !to)
        return interaction.editReply('❌ Formato de célula inválido. Use letras seguidas de número (ex: `B2`).');

      const colStart = mapData.cols.indexOf(from.col);
      const colEnd   = mapData.cols.indexOf(to.col);
      const rowStart = mapData.rows.indexOf(from.row);
      const rowEnd   = mapData.rows.indexOf(to.row);

      if (colStart === -1 || colEnd === -1)
        return interaction.editReply(`❌ Coluna fora do mapa. Colunas válidas: ${mapData.cols.join(', ')}.`);
      if (rowStart === -1 || rowEnd === -1)
        return interaction.editReply(`❌ Linha fora do mapa. Linhas válidas: ${mapData.rows.join(', ')}.`);
      if (colStart > colEnd || rowStart > rowEnd)
        return interaction.editReply('❌ A célula `de` deve ser o canto superior esquerdo e `ate` o inferior direito.');

      const subCols    = mapData.cols.slice(colStart, colEnd + 1);
      const subRows    = mapData.rows.slice(rowStart, rowEnd + 1);
      const esperados  = subCols.length * subRows.length;

      if (tipos.length !== esperados)
        return interaction.editReply(
          `❌ A região ${deRaw}→${ateRaw} tem **${subCols.length} colunas × ${subRows.length} linhas = ${esperados} células**. Recebi **${tipos.length}** tipo(s).`
        );

      let i = 0;
      for (const row of subRows)
        for (const col of subCols)
          mapData.grid[`${col}${row}`] = tipos[i++];

      await mapStore.save(guildId, session.activeMap, mapData);
      const updated = await editMapMessage(interaction, session, mapData);
      await sessionStore.save(guildId, updated);
      await interaction.editReply(
        `✅ Submatriz **${deRaw}→${ateRaw}** (${subCols.length}×${subRows.length}) preenchida.`
      );
      break;
    }

    case 'legenda': {
      const emoji     = interaction.options.getString('emoji').trim();
      const descricao = interaction.options.getString('descricao').trim();

      mapData.legend         = mapData.legend ?? {};
      mapData.legend[emoji]  = descricao;

      await mapStore.save(guildId, session.activeMap, mapData);
      const updated = await editMapMessage(interaction, session, mapData);
      await sessionStore.save(guildId, updated);
      await interaction.editReply(`✅ Legenda: ${emoji} → **${descricao}**`);
      break;
    }

    case 'config': {
      const emojis = interaction.options.getString('emojis');
      mapData.emojisNoGrid = emojis === 'texto';

      await mapStore.save(guildId, session.activeMap, mapData);
      const updated = await editMapMessage(interaction, session, mapData);
      await sessionStore.save(guildId, updated);

      const label = mapData.emojisNoGrid ? 'Apenas no texto abaixo' : 'Visível no grid';
      await interaction.editReply(`✅ Personagens no grid: **${label}**`);
      break;
    }

    case 'carregar': {
      const id = interaction.options.getString('id').toLowerCase().trim();

      let novoMapa;
      try {
        novoMapa = await mapStore.load(guildId, id);
      } catch {
        return interaction.editReply(`❌ Mapa \`${id}\` não encontrado.`);
      }

      session.activeMap    = id;
      session.mapMessageId = null;
      session.channelId    = null;

      const updated = await editMapMessage(interaction, session, novoMapa);
      await sessionStore.save(guildId, updated);
      await interaction.editReply(`✅ Mapa **${novoMapa.name}** carregado.`);
      break;
    }

    default:
      await interaction.editReply('❌ Subcomando não reconhecido.');
  }
}

module.exports = { data, execute };
