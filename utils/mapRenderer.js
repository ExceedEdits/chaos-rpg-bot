// ============================================================
//  Chaos RPG Bot — Map Renderer
//  Converte mapData + session → string formatada para Discord.
// ============================================================

/**
 * Renderiza o mapa completo com todos os painéis laterais.
 *
 * Layout:
 *   ## Rodada N
 *   [grid]
 *   **Legenda:**
 *   **Personagens:**
 *   **NPCs:**
 *   **Inimigos:**
 *   **Estruturas/Itens/Criaturas:**
 *
 * @param {object} mapData  - Dados do mapa (cols, rows, grid, legend…)
 * @param {object} session  - Estado da sessão RPG
 * @returns {string}
 */
function renderMap(mapData, session) {
  const lines = [];

  // ── Cabeçalho de rodada ───────────────────────────────────────
  const combat = session.combat ?? {};
  const round  = (combat.active && combat.round > 0) ? combat.round : null;
  lines.push(round ? `## Rodada ${round}` : '## Mapa');
  lines.push('');

  // ── Cabeçalho de colunas (sem formatação de código) ───────────
  lines.push('⬛' + mapData.cols.join(''));

  // ── Grid ─────────────────────────────────────────────────────
  for (const row of mapData.rows) {
    let rowStr = `${row}`;

    for (const col of mapData.cols) {
      const cell      = `${col}${row}`;
      const baseEmoji = mapData.grid[cell] ?? '⬛';

      // Emojis de personagens na célula (desativável via /mapa config)
      const chars = mapData.emojisNoGrid
        ? []
        : Object.entries(session.characters ?? {})
            .filter(([, c]) => c.pos === cell)
            .map(([emoji]) => emoji);

      // NPCs do mapa na célula
      const hasNpc = Object.values(session.npcs ?? {})
        .some(n => n.pos === cell);

      if (chars.length > 0) rowStr += chars.join('');
      else if (hasNpc)      rowStr += '🔵';
      else                  rowStr += baseEmoji;
    }

    lines.push(rowStr);
  }

  // ── Legenda ───────────────────────────────────────────────────
  lines.push('');
  lines.push('**Legenda:**');
  for (const [emoji, desc] of Object.entries(mapData.legend ?? {})) {
    lines.push(`${emoji} ${desc}`);
  }

  // ── Personagens ───────────────────────────────────────────────
  lines.push('');
  lines.push('**Personagens:**');
  for (const [emoji, char] of Object.entries(session.characters ?? {})) {
    let line = `${emoji} **${char.name}** — ${char.pos}`;
    if (char.cover) line += char.coverNote ? ` *(${char.coverNote})*` : ' *(Cobertura)*';
    lines.push(line);
  }

  // ── NPCs ─────────────────────────────────────────────────────
  lines.push('');
  lines.push('**NPCs:**');
  for (const [name, npc] of Object.entries(session.npcs ?? {})) {
    let line = `🔵 **${name}** — ${npc.pos}`;
    if (npc.movingTo) line += ` → ${npc.movingTo}`;
    lines.push(line);
  }

  // ── Inimigos (no mapa + fora) ─────────────────────────────────
  lines.push('');
  lines.push('**Inimigos:**');
  for (const e of session.enemies ?? []) {
    if (e.outOfMap) {
      lines.push(`— **${e.name}** ×${e.qty} *(Fora do Mapa)*`);
    } else {
      lines.push(`— **${e.name}** ×${e.qty} — ${e.pos}`);
    }
  }

  // ── Estruturas/Itens/Criaturas ────────────────────────────────
  lines.push('');
  lines.push('**Estruturas/Itens/Criaturas:**');
  for (const [cell, itemList] of Object.entries(session.items ?? {})) {
    for (const item of itemList) {
      let line = `📦 **${item.label}** ×${item.qty} — ${cell}`;
      if (item.cover) line += item.coverNote ? ` *(${item.coverNote})*` : ' *(Cobertura)*';
      lines.push(line);
    }
  }

  return lines.join('\n');
}

module.exports = { renderMap };
