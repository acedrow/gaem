<script setup lang="ts">
import type { CharacterSheet, PlayerProfile } from "@gaem/shared";
import {
  getArmorByName,
  getClassByName,
  getEquipmentByName,
  getGearByName,
  getWeaponByName,
  getClassMaxHp,
  isRangeTargetAttack,
  resolveCombatAttackSpec,
  rangeTargetMax,
} from "@gaem/shared";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";

import AbilityBlock from "./AbilityBlock.vue";
import CharacterSheetCombat from "./CharacterSheetCombat.vue";
import HpBar from "./HpBar.vue";
import RuleText from "./RuleText.vue";
import SheetActionButton from "./SheetActionButton.vue";
import SheetGearFieldRow from "./SheetGearFieldRow.vue";
import WeaponPatternDiagram from "./WeaponPatternDiagram.vue";
import { useApi } from "../composables/useApi.js";
import { useBoardActionMode } from "../composables/useBoardActionMode.js";
import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useCampaignUnlocks } from "../composables/useCampaignUnlocks.js";
import { useCharacterSheetSelection, type GearField } from "../composables/useCharacterSheetSelection.js";
import { useCombatActions } from "../composables/useCombatActions.js";
import { useGameState } from "../composables/useGameState.js";
import { useSession } from "../composables/useSession.js";

type PlayerProfileOption = PlayerProfile & { isActive?: boolean };
type EditableField = "name" | "player" | "tags";

const props = defineProps<{ sheetId: string }>();

const { apiFetch, fetchPortraitUrl, fetchPlayerProfiles } = useApi();
const { role, playerProfile } = useSession();
const { gameState, send } = useGameState();
const { selectSheet, notifySheetsChanged, startGearPick, gearPick } = useCharacterSheetSelection();
const { closeRightPanel } = useBoardSelection();
const { hasEquipmentSlot, hasGearSlot, hasSecondWeaponSlot } = useCampaignUnlocks();

const sheet = ref<CharacterSheet | null>(null);
const profiles = ref<PlayerProfileOption[]>([]);
const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
const uploading = ref(false);
const error = ref<string | null>(null);
const portraitUrl = ref<string | null>(null);

const form = ref({
  player: "",
  name: "",
  class: "",
  armor: "",
  weapon: "",
  equipment: "",
  gear: "",
  weapon2: "",
  tags: [] as string[],
});
const editingField = ref<EditableField | null>(null);
const fieldInputEl = ref<HTMLInputElement | HTMLSelectElement | null>(null);
const nameInputEl = ref<HTMLInputElement | null>(null);
const tagsInputEl = ref<HTMLTextAreaElement | null>(null);
const tagsDraft = ref("");

const canEdit = computed(() => {
  if (!sheet.value) return false;
  if (role.value === "gm") return true;
  return role.value === "player" && playerProfile.value?.id === sheet.value.player;
});

const boardPlayer = computed(() =>
  gameState.value?.players.find((p) => p.characterSheetId === props.sheetId)
);

const boardPlayerId = computed(() => boardPlayer.value?.id ?? null);

const {
  showPlayerActionBar,
  canMain,
  canSupport,
  canAux,
  armorStructured,
  sendPlayerAction,
} = useCombatActions(() => boardPlayerId.value);

const { mode, rangeAttackTargetIds, setMode, clearMode } = useBoardActionMode();

const showSheetCombatActions = computed(
  () => !!boardPlayer.value && showPlayerActionBar.value,
);

const canUseEquipmentCharge = computed(() => {
  if (!canSupport.value || !form.value.equipment) return false;
  const uses = boardPlayer.value?.equipmentUses;
  if (uses === undefined) return true;
  return uses > 0;
});

function weaponHasAttack(weaponName: string) {
  return !!getWeaponByName(weaponName)?.attack;
}

function toggleArmorAction() {
  if (!armorStructured.value) return;
  if (armorStructured.value.kind === "teleport_adjacent") {
    setMode(mode.value === "armorTeleport" ? null : "armorTeleport");
  } else {
    setMode(mode.value === "armorPush" ? null : "armorPush");
  }
}

function toggleWeaponAttack() {
  if (mode.value === "attack") clearMode();
  else setMode("attack");
}

function swapWeapon() {
  clearMode();
  sendPlayerAction({ action: "weaponSwap" });
}

function useWeaponAbility() {
  const weaponName = equippedWeaponName.value;
  if (!weaponName) return;
  sendPlayerAction({ action: "weaponActive" });
}

const equippedWeaponName = computed(() => boardPlayer.value?.weapon ?? form.value.weapon);
const carriedWeaponName = computed(() => boardPlayer.value?.weapon2 ?? form.value.weapon2);
const canSwapWeapon = computed(() => !!carriedWeaponName.value);

const rangeAttackHint = computed(() => {
  if (mode.value !== "attack" || !boardPlayer.value) return null;
  const spec = resolveCombatAttackSpec(boardPlayer.value, equippedWeaponName.value);
  if (!spec || !isRangeTargetAttack(spec)) return null;
  const max = rangeTargetMax(spec);
  const count = rangeAttackTargetIds.value.length;
  if (max <= 1) return "Click an enemy in range to attack";
  return `Select up to ${max} enemies (${count}/${max}). Click to toggle, empty tile to confirm.`;
});

function useEquipmentItem() {
  sendPlayerAction({ action: "useEquipment", detail: form.value.equipment });
}

function useGearItem() {
  sendPlayerAction({ action: "interact", detail: form.value.gear });
}

const maxHp = computed(() => getClassMaxHp(form.value.class));
const currentHp = computed(() => boardPlayer.value?.hp ?? 0);

const selectedClass = computed(() => getClassByName(form.value.class));
const selectedArmor = computed(() => getArmorByName(form.value.armor));
const selectedWeapon = computed(() => getWeaponByName(equippedWeaponName.value));
const selectedEquipment = computed(() => getEquipmentByName(form.value.equipment));
const selectedGear = computed(() => getGearByName(form.value.gear));
const selectedWeapon2 = computed(() => getWeaponByName(carriedWeaponName.value));
const selectedProfileName = computed(
  () => profiles.value.find((p) => p.id === form.value.player)?.name ?? form.value.player
);

async function loadProfiles() {
  if (role.value !== "gm") return;
  profiles.value = await fetchPlayerProfiles();
}

async function loadPortrait() {
  if (portraitUrl.value) {
    URL.revokeObjectURL(portraitUrl.value);
    portraitUrl.value = null;
  }
  if (!sheet.value?.portraitKey) return;
  portraitUrl.value = await fetchPortraitUrl(props.sheetId);
}

function syncBoardLoadoutIfNeeded() {
  const bp = boardPlayer.value;
  if (!bp) return;
  const outOfSync =
    bp.class !== form.value.class ||
    bp.armor !== form.value.armor ||
    (bp.equipment ?? "") !== form.value.equipment ||
    (bp.gear ?? "") !== form.value.gear;
  if (!outOfSync) return;
  send({
    type: "syncPlayerSheet",
    characterSheetId: props.sheetId,
    class: form.value.class,
    armor: form.value.armor,
    weapon: form.value.weapon,
    equipment: form.value.equipment,
    gear: form.value.gear,
    weapon2: form.value.weapon2,
  });
}

async function loadSheet() {
  loading.value = true;
  error.value = null;
  try {
    const res = await apiFetch(`/api/character-sheets/${props.sheetId}`);
    if (!res.ok) throw new Error("Character sheet not found");
    const data = (await res.json()) as { sheet: CharacterSheet };
    sheet.value = data.sheet;
    form.value = {
      player: data.sheet.player,
      name: data.sheet.name,
      class: data.sheet.class,
      armor: data.sheet.armor,
      weapon: data.sheet.weapon,
      equipment: data.sheet.equipment ?? "",
      gear: data.sheet.gear ?? "",
      weapon2: data.sheet.weapon2 ?? "",
      tags: [...(data.sheet.tags ?? [])],
    };
    await loadPortrait();
    syncBoardLoadoutIfNeeded();
  } catch {
    error.value = "Unable to load character sheet";
    sheet.value = null;
  } finally {
    loading.value = false;
  }
}

async function saveSheet() {
  if (!sheet.value || !canEdit.value) return;
  saving.value = true;
  error.value = null;
  try {
    const body: Record<string, unknown> = {
      name: form.value.name,
      class: form.value.class,
      armor: form.value.armor,
      weapon: form.value.weapon,
      equipment: form.value.equipment,
      gear: form.value.gear,
      weapon2: form.value.weapon2,
      tags: form.value.tags,
    };
    if (role.value === "gm") body.player = form.value.player;

    const res = await apiFetch(`/api/character-sheets/${props.sheetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "Failed to save");
    }
    const data = (await res.json()) as { sheet: CharacterSheet };
    sheet.value = data.sheet;
    notifySheetsChanged();
    if (boardPlayer.value) {
        send({
          type: "syncPlayerSheet",
          characterSheetId: props.sheetId,
          class: form.value.class,
          armor: form.value.armor,
          weapon: form.value.weapon,
          equipment: form.value.equipment,
          gear: form.value.gear,
          weapon2: form.value.weapon2,
        });
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Unable to save";
  } finally {
    saving.value = false;
  }
}

function resetFormFromSheet() {
  if (!sheet.value) return;
  form.value = {
    player: sheet.value.player,
    name: sheet.value.name,
    class: sheet.value.class,
    armor: sheet.value.armor,
    weapon: sheet.value.weapon,
    equipment: sheet.value.equipment ?? "",
    gear: sheet.value.gear ?? "",
    weapon2: sheet.value.weapon2 ?? "",
    tags: [...(sheet.value.tags ?? [])],
  };
  tagsDraft.value = "";
}

function parseTagsDraft(text: string): string[] {
  return text.split("\n").map((t) => t.trim()).filter(Boolean);
}

function startFieldEdit(field: EditableField) {
  if (!canEdit.value) return;
  if (field === "tags") tagsDraft.value = form.value.tags.join("\n");
  editingField.value = field;
  nextTick(() => {
    const el =
      field === "name" ? nameInputEl.value : field === "tags" ? tagsInputEl.value : fieldInputEl.value;
    el?.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.select();
  });
}

function startGearFieldEdit(field: GearField) {
  if (!canEdit.value || !sheet.value) return;
  startGearPick(props.sheetId, field, form.value[field]);
}

async function commitFieldEdit() {
  if (!editingField.value) return;
  if (editingField.value === "tags") {
    form.value.tags = parseTagsDraft(tagsDraft.value);
  }
  editingField.value = null;
  tagsDraft.value = "";
  await saveSheet();
}

function cancelFieldEdit() {
  editingField.value = null;
  tagsDraft.value = "";
  resetFormFromSheet();
}

async function deleteSheet() {
  if (!sheet.value || !confirm("Delete this character sheet?")) return;
  deleting.value = true;
  error.value = null;
  try {
    const res = await apiFetch(`/api/character-sheets/${props.sheetId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete");
    notifySheetsChanged();
    closeRightPanel();
    selectSheet(null);
  } catch {
    error.value = "Unable to delete character sheet";
  } finally {
    deleting.value = false;
  }
}

async function onPortraitSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !sheet.value) return;

  uploading.value = true;
  error.value = null;
  try {
    const res = await apiFetch(`/api/character-sheets/${props.sheetId}/portrait`, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "Failed to upload portrait");
    }
    const data = (await res.json()) as { sheet: CharacterSheet };
    sheet.value = data.sheet;
    await loadPortrait();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Unable to upload portrait";
  } finally {
    uploading.value = false;
    input.value = "";
  }
}

function commitHp(hp: number) {
  if (!canEdit.value || !boardPlayer.value) return;
  send({ type: "setPlayerHp", playerId: boardPlayer.value.id, hp });
}

watch(
  () => props.sheetId,
  async (id) => {
    if (!id) return;
    editingField.value = null;
    await loadProfiles();
    await loadSheet();
  },
  { immediate: true }
);

watch(gearPick, (pick, prev) => {
  if (prev && !pick) loadSheet();
});

onUnmounted(() => {
  if (portraitUrl.value) URL.revokeObjectURL(portraitUrl.value);
});
</script>

<template>
  <div class="panel">
    <svg aria-hidden="true" class="icon-defs">
      <symbol id="icon-pencil" viewBox="0 0 16 16">
        <path
          d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.387 8.387L2.5 14.5l1.126-3.666 8.387-8.387z"
        />
      </symbol>
    </svg>

    <div class="panel-header">
      <div v-if="sheet" class="sheet-hero">
        <div class="portrait-block">
          <div class="portrait-frame" :class="{ editable: canEdit }">
            <img v-if="portraitUrl" :src="portraitUrl" alt="Portrait" class="portrait" />
            <span v-else class="portrait-placeholder">No portrait</span>
            <label v-if="canEdit" class="portrait-edit-btn" :class="{ uploading }">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                :disabled="uploading"
                @change="onPortraitSelected"
              />
              <svg class="icon"><use href="#icon-pencil" /></svg>
            </label>
          </div>
        </div>

        <div class="sheet-summary">
          <div class="sheet-title-row">
            <input
              v-if="editingField === 'name'"
              ref="nameInputEl"
              v-model="form.name"
              class="panel-title-input"
              type="text"
              required
              @blur="commitFieldEdit"
              @keydown.enter.prevent="commitFieldEdit"
              @keydown.esc.prevent="cancelFieldEdit"
            />
            <h2
              v-else
              class="panel-title"
              :class="{ editable: canEdit }"
              @click="canEdit && startFieldEdit('name')"
            >
              {{ form.name || "Character sheet" }}
            </h2>
            <button class="close-btn" type="button" title="Close" @click="closeRightPanel">×</button>
          </div>

          <HpBar
            inline
            class="sheet-hp-bar"
            :current-hp="currentHp"
            :max-hp="maxHp"
            :editable="canEdit && !!boardPlayer"
            @commit="commitHp"
          />

          <div class="field-row tags-row">
            <template v-if="editingField !== 'tags'">
              <span class="field-label">Tags:</span>
              <div class="tags">
                <span v-for="tag in form.tags" :key="tag" class="tag">{{ tag }}</span>
                <span v-if="!form.tags.length" class="field-value">—</span>
              </div>
              <button
                v-if="canEdit"
                type="button"
                class="edit-btn"
                aria-label="Edit tags"
                @click="startFieldEdit('tags')"
              >
                <svg class="icon"><use href="#icon-pencil" /></svg>
              </button>
            </template>
            <template v-else>
              <span class="field-label">Tags:</span>
              <textarea
                ref="tagsInputEl"
                v-model="tagsDraft"
                class="field-input tags-input"
                rows="3"
                placeholder="One tag per line"
                @blur="commitFieldEdit"
                @keydown.esc.prevent="cancelFieldEdit"
              />
            </template>
          </div>
        </div>
      </div>
      <div v-else class="sheet-title-row">
        <h2 class="panel-title">Character sheet</h2>
        <button class="close-btn" type="button" title="Close" @click="closeRightPanel">×</button>
      </div>
    </div>

    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="error && !sheet" class="error">{{ error }}</p>

    <div v-else-if="sheet" class="panel-body">
      <CharacterSheetCombat v-if="boardPlayer" :player-id="boardPlayer.id" />
      <p v-if="error" class="error">{{ error }}</p>

      <div class="fields">
          <div v-if="role === 'gm'" class="field-row">
            <template v-if="editingField !== 'player'">
              <span class="field-label">Player:</span>
              <span class="field-value">{{ selectedProfileName || "—" }}</span>
              <button
                v-if="canEdit"
                type="button"
                class="edit-btn"
                aria-label="Edit player"
                @click="startFieldEdit('player')"
              >
                <svg class="icon"><use href="#icon-pencil" /></svg>
              </button>
            </template>
            <template v-else>
              <span class="field-label">Player:</span>
              <select
                ref="fieldInputEl"
                v-model="form.player"
                class="field-input"
                @change="commitFieldEdit"
                @blur="commitFieldEdit"
                @keydown.esc.prevent="cancelFieldEdit"
              >
                <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </template>
          </div>

          <SheetGearFieldRow
            label="Class"
            :value="form.class"
            kind="classes"
            :item="selectedClass"
            :can-edit="canEdit"
            @start-edit="startGearFieldEdit('class')"
          />

          <SheetGearFieldRow
            label="Armor"
            :value="form.armor"
            kind="armor"
            :item="selectedArmor"
            :can-edit="canEdit"
            @start-edit="startGearFieldEdit('armor')"
          >
            <template v-if="showSheetCombatActions && selectedArmor" #actions>
              <SheetActionButton
                :disabled="!canSupport || !armorStructured"
                @click="toggleArmorAction"
              >
                Active ability
                <template #tooltip>
                  <AbilityBlock
                    tier-label="Armor action"
                    :content="selectedArmor.armorAction"
                  />
                </template>
              </SheetActionButton>
            </template>
          </SheetGearFieldRow>

          <SheetGearFieldRow
            label="Equipped weapon"
            :value="equippedWeaponName"
            kind="weapons"
            :item="selectedWeapon"
            :can-edit="canEdit"
            @start-edit="startGearFieldEdit('weapon')"
          >
            <template v-if="showSheetCombatActions && selectedWeapon" #actions>
              <SheetActionButton
                :active="mode === 'attack'"
                :disabled="!canMain || !weaponHasAttack(equippedWeaponName)"
                @click="toggleWeaponAttack"
              >
                Attack
                <template #tooltip>
                  <p v-if="selectedWeapon.summary" class="tooltip-summary">
                    {{ selectedWeapon.summary }}
                  </p>
                  <WeaponPatternDiagram
                    v-if="selectedWeapon.attack"
                    :attack="selectedWeapon.attack"
                  />
                </template>
              </SheetActionButton>
              <SheetActionButton :disabled="!canMain" @click="useWeaponAbility">
                Active ability
                <template #tooltip>
                  <AbilityBlock tier-label="Active" :content="selectedWeapon.activeAbility" />
                </template>
              </SheetActionButton>
              <SheetActionButton
                :disabled="!canAux || !canSwapWeapon"
                @click="swapWeapon"
              >
                Swap
                <template #tooltip>
                  <AbilityBlock
                    tier-label="Aux action"
                    content="Swap weapon — Switch your equipped and carried weapons."
                  />
                </template>
              </SheetActionButton>
            </template>
            <p v-if="rangeAttackHint" class="range-attack-hint">{{ rangeAttackHint }}</p>
          </SheetGearFieldRow>

          <SheetGearFieldRow
            v-if="hasSecondWeaponSlot"
            label="Carried weapon"
            :value="carriedWeaponName"
            kind="weapons"
            :item="selectedWeapon2"
            :can-edit="canEdit"
            @start-edit="startGearFieldEdit('weapon2')"
          />

          <SheetGearFieldRow
            v-if="hasEquipmentSlot"
            label="Equipment"
            :value="form.equipment"
            kind="equipment"
            :item="selectedEquipment"
            :can-edit="canEdit"
            @start-edit="startGearFieldEdit('equipment')"
          >
            <template v-if="showSheetCombatActions && selectedEquipment && form.equipment" #actions>
              <SheetActionButton :disabled="!canUseEquipmentCharge" @click="useEquipmentItem">
                Use
                <template #tooltip>
                  <RuleText :text="selectedEquipment.effect" />
                </template>
              </SheetActionButton>
            </template>
          </SheetGearFieldRow>

          <p
            v-if="hasEquipmentSlot && boardPlayer?.equipmentUses != null"
            class="field-subline"
          >
            Equipment charges {{ boardPlayer.equipmentUses ? "●" : "○" }}
          </p>

          <SheetGearFieldRow
            v-if="hasGearSlot"
            label="Gear"
            :value="form.gear"
            kind="gear"
            :item="selectedGear"
            :can-edit="canEdit"
            @start-edit="startGearFieldEdit('gear')"
          >
            <template v-if="showSheetCombatActions && selectedGear && form.gear" #actions>
              <SheetActionButton :disabled="!canSupport" @click="useGearItem">
                Use
                <template #tooltip>
                  <RuleText :text="selectedGear.effect" />
                </template>
              </SheetActionButton>
            </template>
          </SheetGearFieldRow>
      </div>
    </div>

    <div v-if="canEdit && sheet" class="panel-footer">
      <button class="cta danger" type="button" :disabled="deleting || saving" @click="deleteSheet">
        {{ deleting ? "Deleting…" : "Delete" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 1rem;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 0.75rem;
}

.panel-footer {
  flex-shrink: 0;
  padding-top: 1rem;
}

.icon-defs {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

.panel-header {
  flex-shrink: 0;
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border);
}

.sheet-hero {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
}

.sheet-summary {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-top: 0.1rem;
}

.sheet-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.portrait-block {
  flex-shrink: 0;
}

.sheet-summary :deep(.sheet-hp-bar) {
  margin-bottom: 0;
}

.panel-title {
  margin: 0;
  flex: 1;
  min-width: 0;
}

.panel-title.editable {
  cursor: pointer;
  border-bottom: 1px dashed transparent;
}

.panel-title.editable:hover {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent-muted);
}

.panel-title-input {
  flex: 1;
  min-width: 0;
  margin: 0;
  border: 1px solid var(--color-accent);
  border-radius: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 500;
  letter-spacing: 0.04rem;
  padding: 0.1rem 0.35rem;
}

.close-btn {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--color-muted);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.15rem;
}

.close-btn:hover {
  color: var(--color-text);
}

.portrait-frame {
  position: relative;
  width: 88px;
  height: 88px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-surface);
  display: grid;
  place-items: center;
}

.portrait-frame.editable:hover .portrait-edit-btn,
.portrait-frame.editable:focus-within .portrait-edit-btn {
  opacity: 1;
}

.portrait {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.portrait-placeholder {
  color: var(--color-muted);
  font-size: 0.72rem;
  text-align: center;
  padding: 0 0.25rem;
}

.portrait-edit-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  place-items: center;
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-translucent);
  color: var(--color-text);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.portrait-edit-btn:hover {
  background: var(--color-surface);
  color: var(--color-accent-bright);
}

.portrait-edit-btn.uploading {
  opacity: 1;
  cursor: wait;
}

.portrait-edit-btn .icon {
  width: 0.85rem;
  height: 0.85rem;
  fill: currentColor;
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field-subline {
  margin: -0.15rem 0 0 0.35rem;
  font-size: 0.75rem;
  color: var(--color-muted);
  font-weight: 600;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.9rem;
  line-height: 1.4;
  min-height: 1.75rem;
}

.field-label {
  flex-shrink: 0;
  color: var(--color-muted);
  font-weight: 500;
}

.field-value {
  color: var(--color-text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--color-accent);
  border-radius: 0;
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0.2rem 0.45rem;
  font: inherit;
  font-size: 0.9rem;
}

.tags-row {
  align-items: flex-start;
}

.tags-row .tags {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.tag {
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  font-size: 0.72rem;
}

.tags-input {
  resize: vertical;
  min-height: 3.5rem;
  line-height: 1.35;
}

.edit-btn {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  padding: 0;
}

.edit-btn:hover {
  color: var(--color-accent-bright);
  background: var(--color-surface-raised);
}

.edit-btn .icon {
  width: 0.75rem;
  height: 0.75rem;
  fill: currentColor;
}

.cta {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  padding: 0.45rem 0.75rem;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
}

.cta:hover {
  background: var(--color-surface-alt);
}

.cta:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.danger {
  border-color: var(--color-danger-muted-border);
  color: var(--color-danger);
}

.muted {
  color: var(--color-muted);
}

.error {
  color: var(--color-danger);
}

.range-attack-hint {
  margin: 0.35rem 0 0;
  font-size: 0.72rem;
  color: var(--color-muted);
  line-height: 1.35;
}
</style>
