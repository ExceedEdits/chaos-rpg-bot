// ============================================================
//  Chaos RPG Bot — Entry Point
//  discord.js v14 | Node.js v18+
// ============================================================

const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');
require('dotenv').config();

const { registerMessageRoll }          = require('./listeners/messageRoll');
const { register, unregister }         = require('./utils/guildStore');

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
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log(`[Chaos RPG] Registrando ${slashData.length} comando(s)...`);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: slashData },
    );
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

// ── Inicia ────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
