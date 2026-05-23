// ============================================================
//  Chaos RPG Bot — Prefix Command Listener
//  Processa mensagens que começam com o prefixo configurado
//  e despacha para os handlers de slash commands existentes,
//  ou para handlers internos (help, setprefix, rolar).
// ============================================================

const { parse, parseExpression, buildExprLabel } = require('../utils/diceParser');
const { format }           = require('../utils/diceFormatter');
const tagStore             = require('../utils/tagStore');
const { handleInitiative } = require('../utils/initiativeTags');
const { executeCombatTag } = require('../utils/combatTags');
const { getPrefix, setPrefix } = require('../utils/prefixStore');
const { parseCommand }     = require('../utils/prefixParser');
const { TextInteraction }  = require('../utils/textInteraction');
const { isMaster }         = require('../utils/sessionResolver');

// ── Help ──────────────────────────────────────────────────────

function buildHelp(commands, prefix) {
  const lines = [
    `**Chaos RPG Bot** — Prefixo atual: \`${prefix}\``,
    '',
    `Formato: \`${prefix}comando [subcomando] chave:valor ...\``,
    `Valores com espaço: \`chave:"Ada de Andrade"\``,
    '',
  ];

  // Categorias por nome de comando
  const CATEGORIES = {
    '🎲 Dados':    ['rolar', 'tag'],
    '⚔️ Combate':  ['turno', 'iniciativa', 'status', 'dano', 'curar', 'escudo', 'vida', 'personagem', 'npc'],
    '🗺️ Mapa':     ['mapa'],
    '🎵 Música':   ['play', 'pause', 'resume', 'skip', 'back', 'restart', 'stop', 'queue', 'remove', 'clear', 'shuffle'],
    '⚙️ Config':   ['config', 'rpg'],
  };

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
        catLines.push(`  \`${prefix}${name}\` — ${json.description}`);
      } else {
        catLines.push(`  \`${prefix}${name}\``);
        for (const sub of subcmds) {
          catLines.push(`    • \`${prefix}${name} ${sub.name}\``);
        }
        for (const grp of groups) {
          const subs = (grp.options ?? []).map(s => s.name).join(' | ');
          catLines.push(`    • \`${prefix}${name} ${grp.name}\` → ${subs}`);
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
      lines.push(`  \`${prefix}${name}\``);
    }
    lines.push('');
  }

  lines.push('🔧 Especiais');
  lines.push(`  \`${prefix}setprefix <p>\` — Muda o prefixo (Mestre)`);
  lines.push(`  \`${prefix}help\` — Exibe esta ajuda`);

  return lines.join('\n');
}

// ── Listener principal ────────────────────────────────────────

function registerPrefixListener(client) {
  client.on('messageCreate', async (message) => {
    // Todo o handler dentro de try/catch — getPrefix chama MongoDB
    // e pode falhar; sem isso o erro vira uncaughtException e derruba o bot.
    try {
      if (message.author.bot) return;
      if (!message.guildId)   return;

      const raw    = message.content.trim();
      const prefix = await getPrefix(message.guildId);

      if (!raw.startsWith(prefix)) return;

      // Não processar se for só o prefixo sozinho
      const after = raw.slice(prefix.length).trim();
      if (!after) return;

      // ── setprefix ──────────────────────────────────────────
      if (after.toLowerCase().startsWith('setprefix')) {
        if (!await isMaster(message.member)) {
          await message.reply(`❌ Você precisa do cargo de **Mestre** para mudar o prefixo.`);
          return;
        }
        const novo = after.split(/\s+/)[1] ?? '';
        if (!novo || novo.length > 5) {
          await message.reply('❌ Informe um prefixo válido (1 a 5 caracteres). Ex: `!setprefix $`');
          return;
        }
        await setPrefix(message.guildId, novo);
        await message.reply(`✅ Prefixo alterado para \`${novo}\`. Use \`${novo}help\` para ver os comandos.`);
        return;
      }

      // ── help ───────────────────────────────────────────────
      if (after.toLowerCase() === 'help' || after.toLowerCase() === 'ajuda') {
        await message.reply({ content: buildHelp(client.commands, prefix) });
        return;
      }

      // ── Analisa o comando ──────────────────────────────────
      const parsed = parseCommand(raw, prefix);
      if (!parsed) return;

      // Resolve aliases antes de procurar o handler
      // Ex: "p" → "play"
      const ALIASES = { p: 'play' };
      const { group, subcommand, options, rest } = parsed;
      const cmd = ALIASES[parsed.cmd] ?? parsed.cmd;

      // ── !rolar (ou qualquer dado) ──────────────────────────
      if (cmd === 'rolar') {
        const expr = rest.trim();
        if (!expr) {
          await message.reply(`❌ Informe uma expressão. Ex: \`${prefix}rolar 2d6+5\``);
          return;
        }

        const customTags = await tagStore.getAll(message.guildId);
        const diceResult = parse(expr, customTags);

        if (!diceResult) {
          await message.reply(`❌ Não entendi \`${expr}\`. Ex: \`${prefix}rolar 2d6+5\`, \`${prefix}rolar 1d20 iniciativa Ada\``);
          return;
        }

        const value     = diceResult.results[0].total;
        const rollLabel = `\`${diceResult.results[0].notation}\` → ${diceResult.results[0].label}`;

        if (diceResult.initiativeTag) {
          const msg = await handleInitiative(
            message.guildId, message.channelId, value, rollLabel,
            diceResult.initiativeTarget, message.member
          );
          await message.reply({ content: msg });
          return;
        }

        if (diceResult.combatTag) {
          const rpgSt   = require('../utils/rpgSessionStore');
          const resolved = await rpgSt.resolveSession(message.guildId, message.channelId);
          const activeChars = resolved?.session?.activeChars ?? {};
          const msg = await executeCombatTag(
            message.guildId, diceResult.combatTag, diceResult.combatTarget,
            value, rollLabel, activeChars
          );
          await message.reply({ content: msg });
          return;
        }

        const rollFn = () => {
          const expr2 = parseExpression(diceResult.exprData?.notation ?? diceResult.results[0].notation);
          if (!expr2) return null;
          return {
            results: [{
              rolls:    expr2.rolls,
              total:    expr2.total,
              label:    buildExprLabel(expr2),
              notation: expr2.notation,
              sides:    expr2.sides,
            }],
            exprData: expr2,
          };
        };

        await message.reply({ content: format(diceResult, rollFn) });
        return;
      }

      // ── Demais comandos via TextInteraction ────────────────
      const cmdHandler = client.commands.get(cmd);
      if (!cmdHandler) {
        await message.reply(`❌ Comando \`${prefix}${cmd}\` não encontrado. Use \`${prefix}help\` para ver os disponíveis.`);
        return;
      }

      const ctx = new TextInteraction(message, { subcommand, group, options });

      try {
        await cmdHandler.execute(ctx, client);
      } catch (err) {
        console.error(`[Chaos RPG] Erro em ${prefix}${cmd}:`, err);
        await ctx.editReply('❌ Erro ao executar o comando.');
      }

    } catch (err) {
      console.error('[Chaos RPG] Erro no prefix listener:', err.message);
    }
  });
}

module.exports = { registerPrefixListener };
