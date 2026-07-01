import type { Enemy, GameState, Player } from "@gaem/shared";

import { logConsole } from "./useGameConsole.js";

function playerLabel(player: Player): string {
  return player.nickname ?? player.id;
}

function enemyLabel(enemy: Enemy): string {
  return enemy.name ?? "Enemy";
}

export function logGameStateChanges(prev: GameState | null, next: GameState) {
  if (!prev) return;

  for (const player of next.players) {
    const old = prev.players.find((p) => p.id === player.id);
    if (!old) {
      logConsole(`${playerLabel(player)} joined at (${player.x}, ${player.y})`);
      continue;
    }
    if (old.x !== player.x || old.y !== player.y) {
      logConsole(`${playerLabel(player)} moved to (${player.x}, ${player.y})`);
    }
    if (old.hp !== player.hp) {
      logConsole(`${playerLabel(player)} HP set to ${player.hp ?? 0}`);
    }
    if (old.class !== player.class) {
      logConsole(`${playerLabel(player)} class set to ${player.class ?? "—"}`);
    }
  }

  for (const old of prev.players) {
    if (!next.players.some((p) => p.id === old.id)) {
      logConsole(`${playerLabel(old)} left the game`);
    }
  }

  for (const enemy of next.enemies) {
    const old = prev.enemies.find((e) => e.id === enemy.id);
    if (!old) {
      logConsole(`${enemyLabel(enemy)} spawned at (${enemy.x}, ${enemy.y})`);
      continue;
    }
    if (old.x !== enemy.x || old.y !== enemy.y) {
      logConsole(`${enemyLabel(enemy)} moved to (${enemy.x}, ${enemy.y})`);
    }
    if (old.hp !== enemy.hp) {
      logConsole(`${enemyLabel(enemy)} HP set to ${enemy.hp ?? 0}`);
    }
  }

  for (const old of prev.enemies) {
    if (!next.enemies.some((e) => e.id === old.id)) {
      logConsole(`${enemyLabel(old)} removed`);
    }
  }
}
