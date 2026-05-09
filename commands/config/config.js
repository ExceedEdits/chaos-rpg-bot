// ============================================================
//  Chaos RPG Bot — /config
//  Configurações globais do servidor (placeholder para fases futuras).
//  Atualmente: cargo de Mestre, prefixo, configurações de música.
// ============================================================

const { SlashCommandBuilder } = require('discord.js');

function isMaster(member) {
  return member.permissions.has('Administrator') ||
    member.roles.cache.some(r => r.name === (process.env.MASTER_ROLE ?? 'Mestre'));
}

const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Configurações globais do servidor (somente administradores)')

  .addSubcommand(s => s
    .setName('ver')
    .setDescription('Exibe as configurações atuais do servidor'));

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!isMaster(interaction.member)) {
    await interaction.editReply('❌ Você precisa ser administrador ou Mestre para ver as configurações.');
    return;
  }

  const lines = [
    '⚙️ **Configurações do servidor**',
    '',
    `• Cargo de Mestre: **${process.env.MASTER_ROLE ?? 'Mestre'}** *(definido no .env)*`,
    `• Modo de dados: **${process.env.USE_LOCAL_DATA === 'true' ? 'Local (JSON)' : 'MongoDB Atlas'}**`,
    '',
    '*Configurações de música e outras funcionalidades serão adicionadas nas próximas fases.*',
  ];

  await interaction.editReply(lines.join('\n'));
}

module.exports = { data, execute };
