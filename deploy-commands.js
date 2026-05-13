// ============================================================
//  Chaos RPG Bot — Deploy de Slash Commands
//  Registra todos os slash commands na API do Discord.
//
//  Uso:
//    node deploy-commands.js          → registra no servidor (GUILD_ID)
//    node deploy-commands.js --global → registra globalmente (todos os servidores)
//
//  Comandos de guild aparecem instantaneamente.
//  Comandos globais levam até 1 hora para propagar.
// ============================================================

const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');
require('dotenv').config();

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID  = process.env.GUILD_ID;
const GLOBAL    = process.argv.includes('--global');

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ DISCORD_TOKEN e CLIENT_ID são obrigatórios no .env');
  process.exit(1);
}

if (!GLOBAL && !GUILD_ID) {
  console.error('❌ GUILD_ID é obrigatório no .env para registro de guild.');
  console.error('   Use --global para registrar globalmente sem GUILD_ID.');
  process.exit(1);
}

// ── Carrega todos os comandos recursivamente ──────────────────

const slashData = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith('.js')) {
      try {
        const exported = require(full);
        const cmds = Array.isArray(exported) ? exported : [exported];
        for (const cmd of cmds) {
          if (!cmd.data || !cmd.execute) continue;
          slashData.push(cmd.data.toJSON());
          console.log(`  + ${cmd.data.name}`);
        }
      } catch (err) {
        console.warn(`  ⚠ Ignorando ${entry.name}: ${err.message}`);
      }
    }
  }
}

console.log('\nCarregando comandos...');
walk(path.join(__dirname, 'commands'));
console.log(`\n${slashData.length} comando(s) encontrado(s).\n`);

// ── Registra via API ──────────────────────────────────────────

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    if (GLOBAL) {
      console.log('Registrando globalmente (pode levar até 1 hora para propagar)...');
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: slashData },
      );
      console.log('✅ Comandos registrados globalmente!');
    } else {
      console.log(`Registrando no servidor ${GUILD_ID} (aparece instantaneamente)...`);
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: slashData },
      );
      console.log(`✅ Comandos registrados no servidor ${GUILD_ID}!`);
    }
  } catch (err) {
    console.error('❌ Erro ao registrar comandos:', err.message);
    if (err.status === 401) console.error('   Token inválido. Verifique DISCORD_TOKEN no .env');
    if (err.status === 403) console.error('   Sem permissão. Verifique CLIENT_ID e GUILD_ID no .env');
  }
})();
