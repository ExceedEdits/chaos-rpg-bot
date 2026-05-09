// ============================================================
//  Chaos RPG Bot — /tag
//  Gerenciamento de tags customizadas (multi-guild, MongoDB)
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const tagStore = require('../../utils/tagStore');

function isMaster(member) {
  const cargoNome = process.env.MASTER_ROLE ?? 'Mestre';
  return member.roles.cache.some(r => r.name === cargoNome);
}

function parseConditions(raw) {
  const parts = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const result = [];

  for (const part of parts) {
    if (part === 'min')                  { result.push({ type: 'min' }); continue; }
    if (part === 'max')                  { result.push({ type: 'max' }); continue; }
    if (part === 'minoumax' || part === 'min ou max') { result.push({ type: 'minOrMax' }); continue; }

    if (part.startsWith('valor:')) {
      const n = parseInt(part.split(':')[1], 10);
      if (isNaN(n)) return `Valor inválido em "${part}". Use: valor:N`;
      result.push({ type: 'value', value: n }); continue;
    }
    if (part.startsWith('tentativas:')) {
      const n = parseInt(part.split(':')[1], 10);
      if (isNaN(n) || n < 1) return `Número inválido em "${part}". Use: tentativas:N`;
      result.push({ type: 'attempts', value: n }); continue;
    }
    if (part.startsWith('explodir:')) {
      const n = parseInt(part.split(':')[1], 10);
      if (isNaN(n)) return `Valor inválido em "${part}". Use: explodir:N`;
      result.push({ type: 'explode', value: n }); continue;
    }
    return `Condição não reconhecida: "${part}". Opções: min, max, minoumax, valor:N, tentativas:N, explodir:N`;
  }

  if (result.length === 0) return 'Informe ao menos uma condição.';
  return result;
}

function condLabel(cond) {
  const map = {
    min:      'para no mínimo (1)',
    max:      'para no máximo do dado',
    minOrMax: 'para no mínimo OU máximo',
    value:    `para quando sair ${cond.value}`,
    attempts: `para após ${cond.value} tentativas`,
    explode:  `explode ao sair ${cond.value} (rola dado extra)`,
  };
  return map[cond.type] ?? cond.type;
}

function displayLabel(d) {
  return d === 'allBest' ? 'todas + destaque do melhor' : 'todas as tentativas';
}

const data = new SlashCommandBuilder()
  .setName('tag')
  .setDescription('Gerencia tags customizadas de rolagem (requer cargo de Mestre)')

  .addSubcommand(s => s
    .setName('criar')
    .setDescription('Cria ou atualiza uma tag de rolagem')
    .addStringOption(o => o.setName('nome').setDescription('Nome da tag').setRequired(true))
    .addStringOption(o => o.setName('condicoes')
      .setDescription('ex: min, max, minoumax, valor:N, tentativas:N, explodir:N')
      .setRequired(true))
    .addStringOption(o => o.setName('exibicao').setDescription('Como exibir os resultados')
      .setRequired(true)
      .addChoices(
        { name: 'Todas as tentativas',       value: 'all'     },
        { name: 'Todas + destacar o melhor', value: 'allBest' },
      )))

  .addSubcommand(s => s
    .setName('deletar')
    .setDescription('Remove uma tag existente')
    .addStringOption(o => o.setName('nome').setDescription('Nome da tag').setRequired(true)))

  .addSubcommand(s => s
    .setName('listar')
    .setDescription('Lista todas as tags ativas'));

async function execute(interaction) {
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  // listar — sem restrição de cargo
  if (sub === 'listar') {
    const tags = await tagStore.getAll(guildId);
    const keys = Object.keys(tags);

    if (keys.length === 0) {
      await interaction.reply({ content: '📭 Nenhuma tag customizada criada ainda.', ephemeral: true });
      return;
    }

    const lines = ['📋 **Tags de rolagem disponíveis:**', ''];
    for (const key of keys) {
      const t = tags[key];
      lines.push(`**${t.name}**`);
      lines.push(`  • Condições: ${t.stopConditions.map(condLabel).join(', ')}`);
      lines.push(`  • Exibição: ${displayLabel(t.display)}`);
      lines.push('');
    }
    lines.push(`*Use \`1d6 ${keys[0]}\` para testar.*`);
    await interaction.reply({ content: lines.join('\n'), ephemeral: true });
    return;
  }

  // criar / deletar — exige cargo de Mestre
  if (!isMaster(interaction.member)) {
    const cargo = process.env.MASTER_ROLE ?? 'Mestre';
    await interaction.reply({
      content: `❌ Você precisa do cargo **${cargo}** para gerenciar tags.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === 'criar') {
    const nome     = interaction.options.getString('nome').toLowerCase().trim();
    const condsRaw = interaction.options.getString('condicoes');
    const display  = interaction.options.getString('exibicao');

    if (!/^[\w\u00C0-\u017E-]+$/.test(nome)) {
      await interaction.reply({ content: '❌ Nome inválido. Use apenas letras, números e hífens.', ephemeral: true });
      return;
    }

    const conditions = parseConditions(condsRaw);
    if (typeof conditions === 'string') {
      await interaction.reply({ content: `❌ ${conditions}`, ephemeral: true });
      return;
    }

    const tagDef = {
      name:           nome,
      stopConditions: conditions,
      display,
      createdBy:      interaction.user.tag,
      createdAt:      new Date().toISOString(),
    };

    const existed = !!(await tagStore.get(guildId, nome));
    await tagStore.upsert(guildId, tagDef);

    const action = existed ? '✏️ Tag atualizada' : '✅ Tag criada';
    await interaction.reply({
      content: [
        `${action}: **${nome}**`,
        `  • Condições: ${conditions.map(condLabel).join(', ')}`,
        `  • Exibição: ${displayLabel(display)}`,
        '',
        `*Uso: \`1d6 ${nome}\`, \`2d8+2 ${nome} Ada\`, etc.*`,
      ].join('\n'),
      ephemeral: true,
    });
    return;
  }

  if (sub === 'deletar') {
    const nome = interaction.options.getString('nome').toLowerCase().trim();
    const ok   = await tagStore.remove(guildId, nome);

    await interaction.reply({
      content: ok ? `🗑️ Tag **${nome}** removida.` : `❌ Tag \`${nome}\` não encontrada.`,
      ephemeral: true,
    });
  }
}

module.exports = { data, execute };
