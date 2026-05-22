// ============================================================
//  Chaos RPG Bot — Map Renderer
// ============================================================

/**
 * Renderiza o mapa + painéis laterais.
 *
 * Painéis configuráveis via mapData.panels:
 *   { legenda, personagens, npcs, inimigos, estruturas }  → true/false
 *   Omitidos = true (exibido por padrão).
 *
 * Integridade de linha: cada célula do grid recebe exatamente
 * 1 emoji. Quando múltiplos personagens ocupam a mesma célula,
 * apenas o primeiro emoji aparece no grid; os demais ficam no painel.
 *
 * @param {object} mapData
 * @param {object} session
 * @returns {string}
 */
/**
 * Converte um único caractere letra em emoji de indicador regional (🇦–🇿).
 * Para não-letras retorna o valor sem alteração.
 */
function toRegional(char) {
  const code = char.toUpperCase().charCodeAt(0);
  if (code >= 65 && code <= 90) {
    return String.fromCodePoint(0x1F1E6 + code - 65);
  }
  return char;
}

function renderMap(mapData, session) {
  // ── Visibilidade dos painéis ──────────────────────────────────
  const p = mapData.panels ?? {};
  const show = {
    legenda:      p.legenda      !== false,
    personagens:  p.personagens  !== false,
    npcs:         p.npcs         !== false,
    inimigos:     p.inimigos     !== false,
    estruturas:   p.estruturas   !== false,
  };

  const lines = [];

  // ── Cabeçalho de rodada ───────────────────────────────────────
  const combat = session.combat ?? {};
  const round  = (combat.active && combat.round > 0) ? combat.round : null;
  lines.push(round ? `## Rodada ${round}` : '## Mapa');
  lines.push('');

  // ── Cabeçalho de colunas ──────────────────────────────────────
  // Usa o emoji do terreno padrão (legenda com desc 'Terreno padrão'),
  // ou o primeiro da legenda, ou ⬛ como fallback.
  const defaultTerrain =
    Object.entries(mapData.legend ?? {}).find(([, d]) => d === 'Terreno padrão')?.[0]
    ?? Object.keys(mapData.legend ?? {})[0]
    ?? '⬛';

  // Cabeçalho: `0x` | 🇦 | 🇧 | 🇨 ...
  // O rótulo da coluna de índice é fixo em 2 chars para alinhar com os números de linha.
  lines.push(['`0x`', ...mapData.cols.map(c => toRegional(c))].join(' | '));

  // ── Grid ─────────────────────────────────────────────────────
  // Monta índice emoji→célula para acesso O(1) durante a renderização
  const charByCell = {};
  if (!mapData.emojisNoGrid) {
    for (const [emoji, char] of Object.entries(session.characters ?? {})) {
      if (!char.pos) continue;
      if (!charByCell[char.pos]) charByCell[char.pos] = [];
      charByCell[char.pos].push(emoji);
    }
  }

  // Mapa célula → emoji do NPC para renderização no grid
  const npcCellEmoji = new Map();
  for (const [name, npc] of Object.entries(session.npcs ?? {})) {
    if (npc.pos && npc.pos.match(/^[A-Z]+\d+$/)) {
      npcCellEmoji.set(npc.pos, npc.emoji ?? '🔵');
    }
  }

  const rowLines = [];
  for (const row of mapData.rows) {
    const cells = [];

    for (const col of mapData.cols) {
      const cell      = `${col}${row}`;
      const baseEmoji = mapData.grid[cell] ?? '⬛';

      const charsHere = charByCell[cell];
      if (charsHere?.length > 0) {
        // Exatamente 1 emoji — preserva a largura da célula
        cells.push(charsHere[0]);
      } else if (npcCellEmoji.has(cell)) {
        cells.push(npcCellEmoji.get(cell));
      } else {
        cells.push(baseEmoji);
      }
    }

    // Linha: `01` | 🟦 | 🟦 | ...  (número sempre com 2 chars, zero-padded)
    rowLines.push(['`' + String(row).padStart(2, '0') + '`', ...cells].join(' | '));
  }

  for (const rowLine of rowLines) lines.push(rowLine);

  // ── Legenda ───────────────────────────────────────────────────
  if (show.legenda) {
    lines.push('');
    lines.push('**Legenda:**');
    for (const [emoji, desc] of Object.entries(mapData.legend ?? {})) {
      lines.push(`${emoji} ${desc}`);
    }
  }

  // ── Personagens ───────────────────────────────────────────────
  if (show.personagens) {
    lines.push('');
    lines.push('**Personagens:**');
    for (const [emoji, char] of Object.entries(session.characters ?? {})) {
      let line = `${emoji} **${char.name}** — ${char.pos ?? '—'}`;
      if (char.cover) line += char.coverNote ? ` *(${char.coverNote})*` : ' *(Cobertura)*';
      lines.push(line);
    }
  }

  // ── NPCs ─────────────────────────────────────────────────────
  if (show.npcs) {
    lines.push('');
    lines.push('**NPCs:**');
    for (const [name, npc] of Object.entries(session.npcs ?? {})) {
      const emojiDisplay = npc.emoji ?? '🔵';
      let line = `${emojiDisplay} **${name}** — ${npc.pos ?? '—'}`;
      if (npc.movingTo) line += ` → ${npc.movingTo}`;
      lines.push(line);
    }
  }

  // ── Inimigos ─────────────────────────────────────────────────
  if (show.inimigos) {
    lines.push('');
    lines.push('**Inimigos:**');
    for (const e of session.enemies ?? []) {
      const emojiDisplay = e.emoji ? `${e.emoji} ` : '— ';
      if (e.outOfMap) {
        lines.push(`${emojiDisplay}**${e.name}** ×${e.qty} *(Fora do Mapa)*`);
      } else {
        lines.push(`${emojiDisplay}**${e.name}** ×${e.qty} — ${e.pos}`);
      }
    }
  }

  // ── Estruturas/Itens/Criaturas ────────────────────────────────
  if (show.estruturas) {
    lines.push('');
    lines.push('**Estruturas/Itens/Criaturas:**');
    for (const [cell, itemList] of Object.entries(session.items ?? {})) {
      for (const item of itemList) {
        const emojiDisplay = item.emoji ?? '📦';
        let line = `${emojiDisplay} **${item.label}** ×${item.qty} — ${cell}`;
        if (item.npcRef) line += ` *(HP: /npc ver ${item.npcRef})*`;
        if (item.cover) line += item.coverNote ? ` *(${item.coverNote})*` : ' *(Cobertura)*';
        lines.push(line);
      }
    }
  }

  return lines.join('\n');
}

module.exports = { renderMap };
