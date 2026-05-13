// ============================================================
//  Chaos RPG Bot — /help
//  Lista todos os comandos disponíveis, gerado dinamicamente
//  a partir dos slash commands registrados no cliente.
// ============================================================

const { SlashCommandBuilder } = require('discord.js');
const { getPrefix }           = require('../../utils/prefixStore');

const CATEGORIES = {
  '🎲 Dados':   ['rolar', 'tag'],
  '⚔️ Combate': ['turno', 'iniciativa', 'status', 'dano', 'curar', 'escudo', 'vida', 'personagem', 'npc'],
  '🗺️ Mapa':    ['mapa'],
  '⚙️ Config':  ['config', 'rpg', 'help'],
};

function buildHelp(commands, prefix) {
  const lines = [
    '**Chaos RPG Bot** — Referência de Comandos',
    `Prefixo de texto: \`${prefix}\` · Slash commands: \`/\``,
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
        catLines.push(`  \`/${name}\` — ${json.description}`);
      } else {
        catLines.push(`  \`/${name}\``);
        for (const sub of subcmds) {
          catLines.push(`    • \`/${name} ${sub.name}\` — ${sub.description}`);
        }
        for (const grp of groups) {
          const subs = (grp.options ?? []).map(s => `\`${s.name}\``).join(', ');
          catLines.push(`    • \`/${name} ${grp.name}\` → ${subs}`);
        }
      }
    }

    if (catLines.length > 0) {
      lines.push(cat);
      lines.push(...catLines);
      lines.push('');
    }
  }

  // Comandos não categorizados
  const rest = [...commands.keys()].filter(k => !listed.has(k));
  if (rest.length > 0) {
    lines.push('📦 Outros');
    for (const name of rest) {
      const cmd  = commands.get(name);
      const desc = cmd?.data.toJSON().description ?? '';
      lines.push(`  \`/${name}\` — ${desc}`);
    }
    lines.push('');
  }

  lines.push('🔧 Exclusivos de texto');
  lines.push(`  \`${prefix}setprefix <p>\` · \`/setprefix prefixo\` — Muda o prefixo (Mestre)`);
  lines.push(`  \`${prefix}help\` · \`/help\` — Esta ajuda`);

  return lines.join('\n');
}

const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Lista todos os comandos disponíveis do bot');

async function execute(interaction, client) {
  const prefix = await getPrefix(interaction.guildId);
  const help   = buildHelp(client.commands, prefix);
  await interaction.reply({ content: help, ephemeral: true });
}

module.exports = { data, execute };
