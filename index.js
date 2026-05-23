// ============================================================
//  Chaos RPG Bot — Entry Point
//  discord.js v14 | Node.js v18+
// ============================================================

const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');
require('dotenv').config();

const { registerMessageRoll }    = require('./listeners/messageRoll');
const { registerPrefixListener } = require('./listeners/prefixListener');
const { register, unregister }   = require('./utils/guildStore');

const USE_LOCAL = process.env.USE_LOCAL_DATA === 'true';

if (USE_LOCAL) {
  console.log('[Chaos RPG] Modo local ativo — usando data/*.json');
} else {
  // Valida MONGODB_URI antes de qualquer coisa
  if (!process.env.MONGODB_URI) {
    console.error('[Chaos RPG] MONGODB_URI não definida. Configure o .env ou use USE_LOCAL_DATA=true.');
    process.exit(1);
  }
}

// ── Cliente Discord ───────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = new Collection();

// ── Carrega comandos recursivamente ───────────────────────────
const commandFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) commandFiles.push(full);
  }
}
walk(path.join(__dirname, 'commands'));

const slashData = [];
for (const file of commandFiles) {
  const exported = require(file);
  // Suporta exportação simples { data, execute } ou array [{ data, execute }, ...]
  const cmds = Array.isArray(exported) ? exported : [exported];
  for (const cmd of cmds) {
    if (!cmd.data || !cmd.execute) continue;
    client.commands.set(cmd.data.name, cmd);
    slashData.push(cmd.data.toJSON());
  }
}

// ── Registra slash commands ───────────────────────────────────
async function registerCommands() {
  const rest    = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const guildId = process.env.GUILD_ID;

  try {
    if (guildId) {
      // Modo dev: registra só no servidor de teste — aparece instantaneamente.
      console.log(`[Chaos RPG] Registrando ${slashData.length} comando(s) no servidor ${guildId} (dev)...`);
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: slashData },
      );
    } else {
      // Modo produção: registra globalmente — funciona em todos os servidores.
      // Leva até 1 hora para propagar na primeira vez.
      console.log(`[Chaos RPG] Registrando ${slashData.length} comando(s) globalmente...`);
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: slashData },
      );
    }
    console.log('[Chaos RPG] Comandos registrados.');
  } catch (err) {
    console.error('[Chaos RPG] Erro ao registrar comandos:', err);
  }
}

// ── Eventos ───────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`[Chaos RPG] Online como ${client.user.tag}`);
  await registerCommands();
  registerMessageRoll(client);
  registerPrefixListener(client);

  // Registra todos os servidores onde o bot já está presente
  if (!USE_LOCAL) {
    for (const guild of client.guilds.cache.values()) {
      await register(guild).catch(err =>
        console.error(`[Chaos RPG] Erro ao registrar guild ${guild.id}:`, err)
      );
    }
    console.log(`[Chaos RPG] ${client.guilds.cache.size} servidor(es) registrado(s).`);
  }
});

// Bot adicionado a um novo servidor
client.on('guildCreate', async (guild) => {
  console.log(`[Chaos RPG] Adicionado ao servidor: ${guild.name} (${guild.id})`);
  await register(guild).catch(err =>
    console.error('[Chaos RPG] Erro ao registrar novo servidor:', err)
  );
});

// Bot removido de um servidor
client.on('guildDelete', async (guild) => {
  console.log(`[Chaos RPG] Removido do servidor: ${guild.name} (${guild.id})`);
  await unregister(guild.id).catch(err =>
    console.error('[Chaos RPG] Erro ao desregistrar servidor:', err)
  );
});

client.on('interactionCreate', async (interaction) => {
  // ── Botão "Carregar mais músicas" ─────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith('loadmore:')) {
    const parts = interaction.customId.split(':');
    // formato: loadmore:{type}:{id}:{offset}
    // id pode conter ':' (raro mas seguro dividir em 4 partes max)
    const [, type, id, offsetStr] = parts;
    const offset = parseInt(offsetStr, 10);

    if (!type || !id || isNaN(offset)) {
      return interaction.reply({ content: '❌ Dados do botão inválidos.', ephemeral: true });
    }

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({ content: '❌ Entre em um canal de voz primeiro.', ephemeral: true });
    }

    await interaction.deferUpdate();

    const { loadMoreTracks, addManyToQueue } = require('./utils/musicPlayer');
    try {
      const result = await loadMoreTracks({ type, id, offset }, interaction.user.username);
      const { tracks, truncated, continuation } = result;

      if (!tracks.length) {
        return interaction.editReply({ content: '✅ Não há mais músicas para carregar.', components: [] });
      }

      await addManyToQueue(interaction.guildId, tracks, voiceChannel, interaction.channel);

      if (truncated && continuation) {
        const newCustomId = `loadmore:${continuation.type}:${continuation.id}:${continuation.offset}`;
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(newCustomId)
            .setLabel('Carregar mais músicas')
            .setStyle(ButtonStyle.Secondary),
        );
        return interaction.editReply({
          content: `📂 ➕ **+${tracks.length}** músicas adicionadas à fila. Ainda há mais.`,
          components: [row],
        });
      }

      return interaction.editReply({
        content: `📂 ✅ **+${tracks.length}** músicas adicionadas. Playlist completamente carregada!`,
        components: [],
      });
    } catch (err) {
      console.error('[Music] loadMoreTracks error:', err);
      return interaction.editReply({ content: `❌ Erro ao carregar mais músicas: ${err.message}`, components: [] });
    }
  }

  // ── Slash commands ────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;

  try {
    await cmd.execute(interaction, client);
  } catch (err) {
    console.error(`[Chaos RPG] Erro em /${interaction.commandName}:`, err);
    const msg = { content: '❌ Erro ao executar o comando.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
    else await interaction.reply(msg);
  }
});

// ── Shutdown gracioso ─────────────────────────────────────────
async function shutdown(signal) {
  console.log(`[Chaos RPG] ${signal} recebido. Encerrando...`);
  client.destroy();
  if (!USE_LOCAL) {
    const { close } = require('./utils/db');
    await close();
  }
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── Handlers globais de erro ──────────────────────────────────
// Evita que o bot caia silenciosamente no Railway por uma promise
// rejeitada não tratada ou por uma exceção inesperada.
process.on('unhandledRejection', (reason) => {
  console.error('[Chaos RPG] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Chaos RPG] Uncaught Exception:', err.message);
  // Não encerramos o processo em erros de rede/DNS (ex: MongoDB indisponível)
  // para evitar loop de restart no Railway. O bot continua operando para
  // comandos que não dependem do banco.
});

// ── Inicia ────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
