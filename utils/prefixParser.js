// ============================================================
//  Chaos RPG Bot — Prefix Command Parser
//  Analisa mensagens de texto no formato:
//    !comando [subcomando] chave:valor chave:"valor com espaço"
//    !comando [grupo] [subcomando] chave:valor ...
// ============================================================

// Comandos que usam subgrupos (dois níveis: grupo + subcomando)
const SUBCOMMAND_GROUPS = {
  mapa: ['personagem'],
};

// Comandos que NÃO têm subcomandos (todos os tokens após o nome são opções)
const COMMANDS_WITHOUT_SUBCOMMANDS = new Set([
  'dano', 'curar', 'escudo', 'vida',
]);

/**
 * Tokeniza uma string respeitando aspas duplas.
 * Ex: 'nome:"Ada de Andrade" valor:5' → ['nome:"Ada de Andrade"', 'valor:5']
 */
function tokenize(str) {
  const tokens = [];
  const re = /"([^"]*)"|([\S]+)/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    tokens.push(m[0]); // inclui as aspas para poder separar depois
  }
  return tokens;
}

/**
 * Extrai pares chave:valor de uma string de opções.
 * Suporta:
 *   chave:valor
 *   chave:"valor com espaços"
 * Retorna um objeto com todas as chaves em minúsculo.
 */
function parseOptions(str) {
  const opts = {};
  const re = /([a-zA-Z_À-ž][a-zA-Z0-9_À-ž]*):("([^"]*)"|([\S]+))/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    opts[m[1].toLowerCase()] = m[3] ?? m[4]; // m[3] = quoted, m[4] = unquoted
  }
  return opts;
}

/**
 * Analisa o conteúdo de uma mensagem que começa com o prefixo.
 *
 * Retorna:
 *   { cmd, group, subcommand, options, rest }
 *   ou null se o conteúdo não corresponde ao formato esperado.
 *
 * Exemplos:
 *   "!turno iniciar"                → { cmd:'turno', group:null, subcommand:'iniciar', options:{} }
 *   "!mapa personagem adicionar emoji:🐺 nome:Ada"
 *                                   → { cmd:'mapa', group:'personagem', subcommand:'adicionar', options:{...} }
 *   "!dano personagem:Ada valor:10" → { cmd:'dano', group:null, subcommand:null, options:{...} }
 *   "!rolar 2d6+5 Ada"              → { cmd:'rolar', group:null, subcommand:null, rest:'2d6+5 Ada' }
 */
function parseCommand(content, prefix) {
  if (!content.startsWith(prefix)) return null;

  const after = content.slice(prefix.length).trim();
  if (!after) return null;

  // Divide em tokens respeitando aspas
  const tokens = tokenize(after);
  if (tokens.length === 0) return null;

  const cmd = tokens[0].toLowerCase();

  // Comandos sem subcomando
  if (COMMANDS_WITHOUT_SUBCOMMANDS.has(cmd) || cmd === 'rolar') {
    const rest    = after.slice(cmd.length).trim();
    const options = parseOptions(rest);
    return { cmd, group: null, subcommand: null, options, rest };
  }

  let group      = null;
  let subcommand = null;
  let optStart   = 1; // índice a partir do qual começa as opções

  const groups = SUBCOMMAND_GROUPS[cmd] ?? [];

  if (tokens.length >= 3) {
    const tok1 = tokens[1].toLowerCase().replace(/^"|"$/g, '');
    const tok2 = tokens[2].toLowerCase().replace(/^"|"$/g, '');

    if (groups.includes(tok1) && /^[a-z]+$/.test(tok2)) {
      group      = tok1;
      subcommand = tok2;
      optStart   = 3;
    } else if (/^[a-z]+$/.test(tok1) && !tok1.includes(':')) {
      subcommand = tok1;
      optStart   = 2;
    }
  } else if (tokens.length === 2) {
    const tok1 = tokens[1].toLowerCase().replace(/^"|"$/g, '');
    if (/^[a-z]+$/.test(tok1) && !tok1.includes(':')) {
      subcommand = tok1;
      optStart   = 2;
    }
  }

  // Junta os tokens restantes e extrai key:value
  const optStr  = tokens.slice(optStart).join(' ');
  const options = parseOptions(optStr);
  const rest    = after.slice(tokens.slice(0, optStart).join(' ').length).trim();

  return { cmd, group, subcommand, options, rest };
}

module.exports = { parseCommand };
