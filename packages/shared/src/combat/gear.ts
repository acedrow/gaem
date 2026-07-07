import type { GameState, Player } from "../types.js";
import { applyEffectStacks } from "./effects.js";
import { playerArmorGearName, playerWeaponGearName } from "./attractor.js";
import { EXPANDED_AGGRESSION_GEAR, activateExpandedAggressionGear } from "./provoke.js";

export { activateExpandedAggressionGear };

export const ASSISTED_ASCENSION_GEAR = "Assisted Ascension Module (Armor)";
export const SOTER_GEAR = "Soter Assisted Defense System (Weapon)";
export const ANGELWEIGHT_GEAR = "Angelweight Optimization (Armor)";
export const SPIKED_SHOULDERS_GEAR = "Spiked Shoulders (Armor)";

export function hasAssistedAscensionGear(player: Player): boolean {
  return playerArmorGearName(player) === ASSISTED_ASCENSION_GEAR;
}

export function hasSoterGear(player: Player): boolean {
  return playerWeaponGearName(player) === SOTER_GEAR;
}

export function hasAngelweightGear(player: Player): boolean {
  return playerArmorGearName(player) === ANGELWEIGHT_GEAR;
}

export function hasSpikedShouldersGear(player: Player): boolean {
  return playerArmorGearName(player) === SPIKED_SHOULDERS_GEAR;
}

export function applyGearPassivesOnLoadout(player: Player): void {
  if (!player.effects) player.effects = {};
  if (hasAssistedAscensionGear(player)) {
    const current = player.effects.Aegis ?? 0;
    if (current < 1) player.effects.Aegis = 1;
  }
}

export function enforceAssistedAscensionFloor(player: Player): void {
  if (!hasAssistedAscensionGear(player)) return;
  if (!player.effects) player.effects = {};
  const current = player.effects.Aegis ?? 0;
  if (current < 1) player.effects.Aegis = 1;
}

export function validateUseGear(_state: GameState, player: Player, detail?: string): string | null {
  const gearName = detail ?? player.gear ?? player.gearArmor;
  if (!gearName) return "No gear equipped";
  if (gearName === EXPANDED_AGGRESSION_GEAR) return null;
  if (gearName === ASSISTED_ASCENSION_GEAR) return "Assisted Ascension is passive";
  if (gearName === SOTER_GEAR) return "Soter is passive while standing still";
  if (gearName === ANGELWEIGHT_GEAR) return "Angelweight is passive at Elevation 3";
  if (gearName === SPIKED_SHOULDERS_GEAR) return "Spiked Shoulders is passive on melee hit";
  return null;
}

export function applyUseGear(state: GameState, player: Player, detail?: string): string {
  const gearName = detail ?? player.gear ?? player.gearArmor ?? "";
  if (gearName === EXPANDED_AGGRESSION_GEAR) {
    return activateExpandedAggressionGear(state, player) ?? `Used ${gearName}`;
  }
  return `Used ${gearName}`;
}

export function applySpikedShouldersRetaliation(
  state: GameState,
  defender: Player,
  attackerEnemyId: string | undefined,
  isMelee: boolean,
): string | null {
  if (!isMelee || !hasSpikedShouldersGear(defender) || !attackerEnemyId) return null;
  const enemy = state.enemies.find((e) => e.id === attackerEnemyId);
  if (!enemy || (enemy.hp ?? 0) <= 0) return null;
  enemy.hp = Math.max(0, (enemy.hp ?? 0) - 1);
  return `Spiked Shoulders dealt 1 damage`;
}

export function applySoterCoverIfEligible(player: Player, movedThisTurn: boolean, attackedThisTurn: boolean): void {
  if (!hasSoterGear(player) || movedThisTurn || !attackedThisTurn) return;
  if (!player.effects) player.effects = {};
  applyEffectStacks(player, ["Cover:1"]);
}
