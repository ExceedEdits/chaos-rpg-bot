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
  lines.push('⬛' + mapData.cols.join(''));

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

  const npcCells = new Set(
    Object.values(session.npcs ?? {})
      .filter(n => n.pos)
      .map(n => n.pos)
  );

  for (const row of mapData.rows) {
    let rowStr = `${row}`;

    for (const col of mapData.cols) {
      const cell      = `${col}${row}`;
      const baseEmoji = mapData.grid[cell] ?? '⬛';

      const charsHere = charByCell[cell];
      if (charsHere?.length > 0) {
        // Exatamente 1 emoji — preserva a largura da célula
        rowStr += charsHere[0];
      } else if (npcCells.has(cell)) {
        rowStr += '🔵';
      } else {
        rowStr += baseEmoji;
      }
    }

    lines.push(rowStr);
  }

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
      let line = `🔵 **${name}** — ${npc.pos ?? '—'}`;
      if (npc.movingTo) line += ` → ${npc.movingTo}`;
      lines.push(line);
    }
  }

  // ── Inimigos ─────────────────────────────────────────────────
  if (show.inimigos) {
    lines.push('');
    lines.push('**Inimigos:**');
    for (const e of session.enemies ?? []) {
      if (e.outOfMap) {
        lines.push(`— **${e.name}** ×${e.qty} *(Fora do Mapa)*`);
      } else {
        lines.push(`— **${e.name}** ×${e.qty} — ${e.pos}`);
      }
    }
  }

  // ── Estruturas/Itens/Criaturas ────────────────────────────────
  if (show.estruturas) {
    lines.push('');
    lines.push('**Estruturas/Itens/Criaturas:**');
    for (const [cell, itemList] of Object.entries(session.items ?? {})) {
      for (const item of itemList) {
        let line = `📦 **${item.label}** ×${item.qty} — ${cell}`;
        if (item.cover) line += item.coverNote ? ` *(${item.coverNote})*` : ' *(Cobertura)*';
        lines.push(line);
      }
    }
  }

  return lines.join('\n');
}

module.exports = { renderMap };
