// ============================================================
//  Chaos RPG Bot — /help
//  Exibe link do site + select menu interativo por comando.
// ============================================================

const {
  SlashCommandBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} = require('discord.js');

const SITE_URL = 'https://exceededits.github.io/chaos-rpg-site/';

// Ordem e categorias exibidas no select menu (help excluído — é o próprio comando)
const CATEGORIES = {
  '🎲 Dados':   ['rolar', 'tag'],
  '⚔️ Combate': ['turno', 'iniciativa', 'status', 'dano', 'curar', 'escudo', 'vida', 'personagem', 'npc'],
  '🗺️ Mapa':    ['mapa'],
  '🎵 Música':  ['play', 'pause', 'resume', 'skip', 'back', 'restart', 'stop', 'queue', 'remove', 'shuffle', 'clear'],
  '⚙️ Config':  ['config', 'rpg'],
};

// ── Helpers exportados (usados também em index.js) ────────────

/**
 * Constrói o StringSelectMenuBuilder com todos os comandos disponíveis.
 * @param {import('discord.js').Collection} commands
 */
function buildSelectMenu(commands) {
  const options = [];

  for (const [cat, names] of Object.entries(CATEGORIES)) {
    for (const name of names) {
      const cmd = commands.get(name);
      if (!cmd) continue;

      const json = cmd.data.toJSON();
      // Descrição no option = "Categoria — descrição do comando" (max 100 chars)
      const desc = `${cat} — ${json.description}`.slice(0, 100);

      options.push(
        new StringSelectMenuOptionBuilder()
          .setValue(name)
          .setLabel(`/${name}`)
          .setDescription(desc),
      );
    }
  }

  return new StringSelectMenuBuilder()
    .setCustomId('help:select')
    .setPlaceholder('Selecione um comando para ver detalhes...')
    .addOptions(options);
}

/**
 * Gera o texto detalhado de um comando específico.
 * @param {import('discord.js').Collection} commands
 * @param {string} name  Nome do comando
 */
function buildCommandDetail(commands, name) {
  const cmd = commands.get(name);
  if (!cmd) return `❌ Comando \`/${name}\` não encontrado.`;

  const json     = cmd.data.toJSON();
  const subcmds  = (json.options ?? []).filter(o => o.type === 1); // SUB_COMMAND
  const groups   = (json.options ?? []).filter(o => o.type === 2); // SUB_COMMAND_GROUP
  const params   = (json.options ?? []).filter(o => o.type !== 1 && o.type !== 2);

  const lines = [`### \`/${json.name}\``, json.description];

  // Comando simples com parâmetros diretos
  if (params.length > 0) {
    lines.push('', '**Parâmetros:**');
    for (const p of params) {
      const req = p.required ? ' \\*' : '';
      lines.push(`  \`${p.name}${req}\` — ${p.description}`);
    }
  }

  // Subcomandos diretos
  if (subcmds.length > 0) {
    lines.push('', '**Subcomandos:**');
    for (const sub of subcmds) {
      lines.push(`  • \`/${json.name} ${sub.name}\` — ${sub.description}`);
    }
  }

  // Grupos de subcomandos
  for (const grp of groups) {
    lines.push('', `**\`/${json.name} ${grp.name}:\`**`);
    for (const sub of (grp.options ?? []).filter(o => o.type === 1)) {
      lines.push(`  • \`/${json.name} ${grp.name} ${sub.name}\` — ${sub.description}`);
    }
  }

  lines.push('', `📖 Documentação completa: <${SITE_URL}>`);
  return lines.join('\n');
}

// ── Mensagem base (conteúdo inicial do /help) ─────────────────

function baseContent() {
  return `📖 **Chaos RPG Bot** — Documentação: <${SITE_URL}>\n\nSelecione um comando abaixo para ver seus detalhes:`;
}

// ── Comando ───────────────────────────────────────────────────

const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Lista todos os comandos disponíveis do bot');

async function execute(interaction, client) {
  const select = buildSelectMenu(client.commands);
  const row    = new ActionRowBuilder().addComponents(select);

  await interaction.reply({
    content:    baseContent(),
    components: [row],
    flags:      MessageFlags.Ephemeral,
  });
}

module.exports = { data, execute, buildSelectMenu, buildCommandDetail, baseContent };
