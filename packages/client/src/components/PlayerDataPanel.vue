<script setup lang="ts">
import type { PlayerArmor, PlayerClass, PlayerWeapon } from "@gaem/shared";
import { PLAYER_ARMOR, PLAYER_CLASSES, PLAYER_WEAPONS } from "@gaem/shared";
import { computed, ref } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useCharacterSheetSelection } from "../composables/useCharacterSheetSelection.js";
import PanelShell from "./PanelShell.vue";
import PlayerItemDetail from "./PlayerItemDetail.vue";
import RuleText from "./RuleText.vue";

const props = defineProps<{
  category: "armor" | "classes" | "weapons";
}>();

const { closeRightPanel } = useBoardSelection();
const { gearPick, gearPickCategory, cancelGearPick, equipGear } = useCharacterSheetSelection();
const expanded = ref<Set<string>>(new Set());
const equipping = ref(false);
const equipError = ref<string | null>(null);

const selectionMode = computed(
  () => !!gearPick.value && gearPickCategory.value === props.category,
);

const browseTitle = computed(() => {
  if (props.category === "armor") return "Armor";
  if (props.category === "classes") return "Classes";
  return "Weapons";
});

const selectionTitle = computed(() => {
  if (props.category === "armor") return "Select new armor";
  if (props.category === "classes") return "Select new class";
  return "Select new weapon";
});

const title = computed(() => (selectionMode.value ? selectionTitle.value : browseTitle.value));
const currentValue = computed(() => gearPick.value?.currentValue ?? "");

const items = computed(() => {
  if (props.category === "armor") return PLAYER_ARMOR;
  if (props.category === "classes") return PLAYER_CLASSES;
  return PLAYER_WEAPONS;
});

function isExpanded(name: string): boolean {
  return expanded.value.has(name);
}

function toggle(name: string) {
  if (expanded.value.has(name)) expanded.value.delete(name);
  else expanded.value.add(name);
}

function onClose() {
  if (selectionMode.value) cancelGearPick();
  else closeRightPanel();
}

async function onEquip(item: PlayerClass | PlayerArmor | PlayerWeapon) {
  if (item.name === currentValue.value || equipping.value) return;
  equipping.value = true;
  equipError.value = null;
  const err = await equipGear(item.name);
  if (err) equipError.value = err;
  equipping.value = false;
}
</script>

<template>
  <PanelShell
    :title="title"
    :show-back="selectionMode"
    @back="cancelGearPick"
    @close="onClose"
  >
    <div class="panel-body">
      <p v-if="equipError" class="error">{{ equipError }}</p>
      <article v-for="item in items" :key="item.name" class="list-card">
        <button
          v-if="!selectionMode"
          type="button"
          class="list-card-header"
          :class="{ expanded: isExpanded(item.name) }"
          @click="toggle(item.name)"
        >
          <span class="item-name">{{ item.name }}</span>
          <span class="chevron" aria-hidden="true">{{ isExpanded(item.name) ? "▾" : "▸" }}</span>
        </button>
        <div
          v-else
          class="list-card-header with-equip"
          :class="{ expanded: isExpanded(item.name) }"
        >
          <button
            type="button"
            class="list-card-header-main"
            :class="{ expanded: isExpanded(item.name) }"
            @click="toggle(item.name)"
          >
            <span class="item-name">{{ item.name }}</span>
            <span class="chevron" aria-hidden="true">{{ isExpanded(item.name) ? "▾" : "▸" }}</span>
          </button>
          <button
            v-if="selectionMode"
            type="button"
            class="equip-btn cta secondary"
            :disabled="item.name === currentValue || equipping"
            @click="onEquip(item)"
          >
            {{ item.name === currentValue ? "Equipped" : "Equip" }}
          </button>
        </div>

        <div v-if="isExpanded(item.name)" class="list-card-body">
          <p v-if="'summary' in item && item.summary" class="item-summary">{{ item.summary }}</p>
          <p class="item-description">
            <RuleText :text="item.description" />
          </p>
          <PlayerItemDetail :item="item" :kind="category" />
        </div>
      </article>
    </div>
  </PanelShell>
</template>

<style scoped>
.chevron {
  color: var(--color-muted);
  font-size: 1.5rem;
}

.item-summary {
  margin: 0 0 0.5rem;
  font-weight: 600;
  color: var(--color-text);
}

.list-card-header.with-equip {
  display: flex;
  align-items: stretch;
  gap: 0.35rem;
  padding: 0.35rem 0.5rem 0.35rem 0;
  background: var(--color-surface);
}

.list-card-header.with-equip.expanded {
  background: var(--color-surface-hover);
}

.list-card-header-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--color-text);
  padding: 0.25rem 0.5rem 0.25rem 0.75rem;
  font-family: var(--font-heading);
  font-weight: 500;
  font-size: 0.9rem;
  letter-spacing: 0.04rem;
  text-align: left;
  cursor: pointer;
}

.list-card-header-main:hover,
.list-card-header-main.expanded {
  background: var(--color-surface-hover);
}

.equip-btn {
  flex-shrink: 0;
  align-self: center;
  margin-right: 0.25rem;
  padding: 0.3rem 0.55rem;
  font-size: 0.75rem;
}

.error {
  margin: 0 0 0.75rem;
  color: var(--color-danger);
}
</style>
