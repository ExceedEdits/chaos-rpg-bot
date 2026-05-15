// ============================================================
//  Chaos RPG Bot — Map Renderer
//  Converte session.json + mapa base → string de emojis Discord
// ============================================================

/**
 * Renderiza o estado completo do mapa como texto formatado para Discord.
 *
 * @param {object} mapData   - Conteúdo de data/maps/<id>.json
 * @param {object} session   - Conteúdo de data/session.json
 * @returns {string}         - Mensagem pronta para postar/editar no Discord
 */
function renderMap(mapData, session) {
  const lines = [];

  // ── Cabeçalho de colunas ────────────────────────────────────
  const colHeader = '⬛' + mapData.cols.map(c => `\`${c}\``).join('');
  lines.push(colHeader);

  // ── Grid ────────────────────────────────────────────────────
  for (const row of mapData.rows) {
    let rowStr = `\`${row}\``;

    for (const col of mapData.cols) {
      const cell = `${col}${row}`;
      const baseEmoji = mapData.grid[cell] ?? '⬛';

      // Personagens na célula (omitido quando emojisNoGrid está ativo)
      const chars = mapData.emojisNoGrid
        ? []
        : Object.entries(session.characters ?? {})
            .filter(([, c]) => c.pos === cell)
            .map(([emoji]) => emoji);

      // NPCs na célula
      const npcs = Object.entries(session.npcs ?? {})
        .filter(([, n]) => n.pos === cell)
        .map(([name]) => name[0]); // primeira letra como indicador

      if (chars.length > 0) {
        rowStr += chars.join('');
      } else if (npcs.length > 0) {
        rowStr += '🔵'; // NPC genérico
      } else {
        rowStr += baseEmoji;
      }
    }

    lines.push(rowStr);
  }

  // ── Legenda ─────────────────────────────────────────────────
  lines.push('');
  lines.push('**Legenda:**');
  for (const [emoji, desc] of Object.entries(mapData.legend ?? {})) {
    lines.push(`${emoji} ${desc}`);
  }

  return lines.join('\n');
}

module.exports = { renderMap };
