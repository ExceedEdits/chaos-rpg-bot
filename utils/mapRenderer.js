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

  // ── Efeitos de turno ────────────────────────────────────────
  for (const effect of session.turnEffects ?? []) {
    const display = effect.display.replace('{value}', effect.value);
    lines.push(display);
  }
  if (session.turnEffects?.length) lines.push('');

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

  // ── Personagens ─────────────────────────────────────────────
  const charEntries = Object.entries(session.characters ?? {});
  if (charEntries.length) {
    lines.push('');
    lines.push('**Personagens:**');
    for (const [emoji, char] of charEntries) {
      let line = `${emoji} **${char.name}** — ${char.pos}`;
      if (char.cover) {
        line += char.coverNote ? ` *(${char.coverNote})*` : ' *(Cobertura)*';
      }
      lines.push(line);
    }
  }

  // ── NPCs ────────────────────────────────────────────────────
  const npcEntries = Object.entries(session.npcs ?? {});
  if (npcEntries.length) {
    lines.push('');
    lines.push('**NPCs:**');
    for (const [name, npc] of npcEntries) {
      let line = `🔵 **${name}** — ${npc.pos}`;
      if (npc.movingTo) line += ` → ${npc.movingTo}`;
      lines.push(line);
    }
  }

  // ── Inimigos ────────────────────────────────────────────────
  const activeEnemies = (session.enemies ?? []).filter(e => !e.outOfMap);
  const outEnemies    = (session.enemies ?? []).filter(e => e.outOfMap);

  if (activeEnemies.length) {
    lines.push('');
    lines.push('**Inimigos:**');
    for (const e of activeEnemies) {
      lines.push(`— **${e.name}** ×${e.qty} — ${e.pos}`);
    }
  }
  if (outEnemies.length) {
    lines.push('');
    lines.push('**Fora do Mapa:**');
    for (const e of outEnemies) {
      lines.push(`— **${e.name}** ×${e.qty}`);
    }
  }

  // ── Itens no mapa ───────────────────────────────────────────
  const itemEntries = Object.entries(session.items ?? {});
  if (itemEntries.length) {
    lines.push('');
    lines.push('**Itens/Criaturas:**');
    for (const [cell, itemList] of itemEntries) {
      for (const item of itemList) {
        let line = `📦 **${item.label}** ×${item.qty} — ${cell}`;
        if (item.cover) {
          line += item.coverNote ? ` *(${item.coverNote})*` : ' *(Cobertura)*';
        }
        lines.push(line);
      }
    }
  }

  return lines.join('\n');
}

module.exports = { renderMap };
