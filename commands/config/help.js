// ============================================================
//  Chaos RPG Bot — /help
//  Lista todos os comandos disponíveis, gerado dinamicamente
//  a partir dos slash commands registrados no cliente.
// ============================================================

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getPrefix }                         = require('../../utils/prefixStore');

const CATEGORIES = {
  '🎲 Dados':    ['rolar', 'tag'],
  '⚔️ Combate':  ['turno', 'iniciativa', 'status', 'dano', 'curar', 'escudo', 'vida', 'personagem', 'npc'],
  '🗺️ Mapa':     ['mapa'],
  '🎵 Música':   ['play', 'pause', 'resume', 'skip', 'back', 'restart', 'stop', 'queue', 'remove', 'shuffle', 'clear'],
  '⚙️ Config':   ['config', 'rpg', 'help'],
};

/**
 * Gera o texto de ajuda de forma compacta — apenas nomes dos subcomandos,
 * sem descrições individuais, para caber no limite de 2000 chars do Discord.
 */
function buildHelp(commands, prefix) {
  const lines = [
    '**Chaos RPG Bot** — Comandos disponíveis',
    `Prefixo: \`${prefix}\` · Slash: \`/\` · 📖 https://exceededits.github.io/chaos-rpg-site/`,
    '',
  ];

  const listed = new Set();

  for (const [cat, names] of Object.entries(CATEGORIES)) {
    const catLines = [];

    for (const name of names) {
      const cmd = commands.get(name);
      if (!cmd) continue;
      listed.add(name);

      const json    = cmd.data.toJSON();
      const subcmds = (json.options ?? []).filter(o => o.type === 1); // SUB_COMMAND
      const groups  = (json.options ?? []).filter(o => o.type === 2); // SUB_COMMAND_GROUP

      if (subcmds.length === 0 && groups.length === 0) {
        // Comando simples — exibe com descrição curta
        catLines.push(`  \`/${name}\` — ${json.description}`);
      } else {
        // Comando com subcomandos — lista só os nomes numa linha
        const subNames = [
          ...subcmds.map(s => s.name),
          ...groups.flatMap(g => (g.options ?? []).map(s => s.name)),
        ].join(', ');
        catLines.push(`  \`/${name}\` — ${subNames}`);
      }
    }

    if (catLines.length > 0) {
      lines.push(`**${cat}**`);
      lines.push(...catLines);
      lines.push('');
    }
  }

  // Comandos não categorizados
  const rest = [...commands.keys()].filter(k => !listed.has(k));
  if (rest.length > 0) {
    lines.push('**📦 Outros**');
    for (const name of rest) {
      const desc = commands.get(name)?.data.toJSON().description ?? '';
      lines.push(`  \`/${name}\` — ${desc}`);
    }
    lines.push('');
  }

  lines.push('**🔧 Exclusivos de texto**');
  lines.push(`  \`${prefix}setprefix <p>\` — Muda o prefixo (Mestre)`);
  lines.push(`  \`${prefix}help\` — Esta ajuda`);

  return lines.join('\n');
}

/**
 * Divide um texto longo em chunks de até maxLength caracteres,
 * quebrando sempre em fim de linha para não cortar palavras.
 */
function splitChunks(text, maxLength = 1900) {
  const chunks = [];
  const lines  = text.split('\n');
  let current  = '';

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLength) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// ── Comando ───────────────────────────────────────────────────

const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Lista todos os comandos disponíveis do bot');

async function execute(interaction, client) {
  const prefix = await getPrefix(interaction.guildId);
  const help   = buildHelp(client.commands, prefix);
  const chunks = splitChunks(help);

  // Primeira mensagem como reply ephemeral
  await interaction.reply({
    content: chunks[0],
    flags:   MessageFlags.Ephemeral,
  });

  // Chunks adicionais como followUp (caso o help seja muito longo)
  for (let i = 1; i < chunks.length; i++) {
    await interaction.followUp({
      content: chunks[i],
      flags:   MessageFlags.Ephemeral,
    });
  }
}

module.exports = { data, execute };
