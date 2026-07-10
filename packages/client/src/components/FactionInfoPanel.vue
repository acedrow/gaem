<script setup lang="ts">
import {
  getFactionById,
  type FactionLocation,
  type FactionQualityDots,
  type FactionStratcomAction,
  type FactionUpgrade,
} from "@gaem/shared";
import { computed } from "vue";

import { useBoardSelection } from "../composables/useBoardSelection.js";
import { useExpandableSet } from "../composables/useExpandableSet.js";
import { selectedFactionId } from "../composables/useFactionSelection.js";
import PanelShell from "./PanelShell.vue";
import RuleText from "./RuleText.vue";

const { closeRightPanel } = useBoardSelection();
const { isExpanded, toggle } = useExpandableSet();

const faction = computed(() => getFactionById(selectedFactionId.value));

const QUALITY_KEYS: (keyof FactionQualityDots)[] = ["force", "subterfuge", "territory", "assets"];

function qualityLabel(key: keyof FactionQualityDots): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function formatQuality(quality: Partial<FactionQualityDots> | undefined): string {
  if (!quality) return "";
  return QUALITY_KEYS.filter((key) => quality[key] != null)
    .map((key) => `${qualityLabel(key)} ${quality[key]}`)
    .join(", ");
}

function locationMeta(loc: FactionLocation): string {
  const parts: string[] = [];
  if (loc.type) parts.push(loc.type);
  if (loc.buildTime != null) parts.push(`Build ${"Θ".repeat(loc.buildTime)}`);
  const q = formatQuality(loc.quality);
  if (q) parts.push(q);
  return parts.join(" · ");
}

function stratcomMeta(action: FactionStratcomAction): string {
  const parts: string[] = [];
  if (action.crownCost != null) parts.push(`Crown ${"Θ".repeat(action.crownCost)}`);
  if (action.requires) parts.push(`Requires ${action.requires}`);
  return parts.join(" · ");
}

function upgradeMeta(upgrade: FactionUpgrade): string {
  const parts = [`Ichor ${upgrade.ichorCost}`];
  if (upgrade.requires) parts.push(`Requires ${upgrade.requires}`);
  return parts.join(" · ");
}

function sectionKey(section: string): string {
  return `section:${section}`;
}

function itemKey(section: string, name: string): string {
  return `${section}:${name}`;
}
</script>

<template>
  <PanelShell
    v-if="faction"
    :title="faction.name"
    close-variant="ghost"
    @close="closeRightPanel"
  >
    <div class="panel-scroll">
      <header class="faction-header">
        <p class="faction-tagline">
          {{ faction.tagline }}: {{ faction.threat }}
        </p>
        <p class="item-description">{{ faction.description }}</p>
        <div class="qualities">
          <span v-for="key in QUALITY_KEYS" :key="key" class="quality">
            {{ qualityLabel(key) }}: {{ "Θ".repeat(faction[key]) }}
          </span>
        </div>
        <div v-if="faction.uniqueMechanics?.length" class="mechanics">
          <p
            v-for="mech in faction.uniqueMechanics"
            :key="mech.name"
            class="mechanic"
          >
            <span class="mechanic-name">{{ mech.name }}</span>
            {{ mech.effect }}
          </p>
        </div>
      </header>

      <section class="faction-section">
        <button
          type="button"
          class="section-toggle"
          :class="{ expanded: isExpanded(sectionKey('starting')) }"
          @click="toggle(sectionKey('starting'))"
        >
          <span>Starting Locations</span>
          <span class="chevron" aria-hidden="true">
            {{ isExpanded(sectionKey("starting")) ? "▾" : "▸" }}
          </span>
        </button>
        <div v-if="isExpanded(sectionKey('starting'))" class="section-body">
          <article
            v-for="loc in faction.startingLocations"
            :key="loc.name"
            class="list-card"
          >
            <button
              type="button"
              class="list-card-header"
              :class="{ expanded: isExpanded(itemKey('starting', loc.name)) }"
              @click="toggle(itemKey('starting', loc.name))"
            >
              <span class="item-header">
                <span class="item-name">{{ loc.name }}</span>
                <span v-if="locationMeta(loc)" class="item-meta">{{ locationMeta(loc) }}</span>
              </span>
              <span class="chevron" aria-hidden="true">
                {{ isExpanded(itemKey("starting", loc.name)) ? "▾" : "▸" }}
              </span>
            </button>
            <div v-if="isExpanded(itemKey('starting', loc.name))" class="list-card-body">
              <p class="item-description">{{ loc.description }}</p>
              <p v-if="loc.purpose" class="detail"><span class="detail-label">Purpose</span> {{ loc.purpose }}</p>
              <p v-if="loc.terrain" class="detail"><span class="detail-label">Terrain</span> {{ loc.terrain }}</p>
              <p v-if="loc.defenses" class="detail"><span class="detail-label">Defenses</span> {{ loc.defenses }}</p>
              <p v-if="loc.requires" class="detail"><span class="detail-label">Requires</span> {{ loc.requires }}</p>
            </div>
          </article>
        </div>
      </section>

      <section class="faction-section">
        <button
          type="button"
          class="section-toggle"
          :class="{ expanded: isExpanded(sectionKey('unique')) }"
          @click="toggle(sectionKey('unique'))"
        >
          <span>Unique Locations</span>
          <span class="chevron" aria-hidden="true">
            {{ isExpanded(sectionKey("unique")) ? "▾" : "▸" }}
          </span>
        </button>
        <div v-if="isExpanded(sectionKey('unique'))" class="section-body">
          <article
            v-for="loc in faction.uniqueLocations"
            :key="loc.name"
            class="list-card"
          >
            <button
              type="button"
              class="list-card-header"
              :class="{ expanded: isExpanded(itemKey('unique', loc.name)) }"
              @click="toggle(itemKey('unique', loc.name))"
            >
              <span class="item-header">
                <span class="item-name">{{ loc.name }}</span>
                <span v-if="locationMeta(loc)" class="item-meta">{{ locationMeta(loc) }}</span>
              </span>
              <span class="chevron" aria-hidden="true">
                {{ isExpanded(itemKey("unique", loc.name)) ? "▾" : "▸" }}
              </span>
            </button>
            <div v-if="isExpanded(itemKey('unique', loc.name))" class="list-card-body">
              <p class="item-description">{{ loc.description }}</p>
              <p v-if="loc.purpose" class="detail"><span class="detail-label">Purpose</span> {{ loc.purpose }}</p>
              <p v-if="loc.terrain" class="detail"><span class="detail-label">Terrain</span> {{ loc.terrain }}</p>
              <p v-if="loc.defenses" class="detail"><span class="detail-label">Defenses</span> {{ loc.defenses }}</p>
              <p v-if="loc.requires" class="detail"><span class="detail-label">Requires</span> {{ loc.requires }}</p>
            </div>
          </article>
        </div>
      </section>

      <section class="faction-section">
        <button
          type="button"
          class="section-toggle"
          :class="{ expanded: isExpanded(sectionKey('stratcom')) }"
          @click="toggle(sectionKey('stratcom'))"
        >
          <span>STRATCOM Actions</span>
          <span class="chevron" aria-hidden="true">
            {{ isExpanded(sectionKey("stratcom")) ? "▾" : "▸" }}
          </span>
        </button>
        <div v-if="isExpanded(sectionKey('stratcom'))" class="section-body">
          <article
            v-for="action in faction.stratcomActions"
            :key="action.name"
            class="list-card"
          >
            <button
              type="button"
              class="list-card-header"
              :class="{ expanded: isExpanded(itemKey('stratcom', action.name)) }"
              @click="toggle(itemKey('stratcom', action.name))"
            >
              <span class="item-header">
                <span class="item-name">{{ action.name }}</span>
                <span v-if="stratcomMeta(action)" class="item-meta">{{ stratcomMeta(action) }}</span>
              </span>
              <span class="chevron" aria-hidden="true">
                {{ isExpanded(itemKey("stratcom", action.name)) ? "▾" : "▸" }}
              </span>
            </button>
            <div v-if="isExpanded(itemKey('stratcom', action.name))" class="list-card-body">
              <p v-if="action.flavor" class="flavor">{{ action.flavor }}</p>
              <p class="item-description">
                <RuleText :text="action.description" />
              </p>
            </div>
          </article>
        </div>
      </section>

      <section class="faction-section">
        <button
          type="button"
          class="section-toggle"
          :class="{ expanded: isExpanded(sectionKey('upgrades')) }"
          @click="toggle(sectionKey('upgrades'))"
        >
          <span>Upgrades</span>
          <span class="chevron" aria-hidden="true">
            {{ isExpanded(sectionKey("upgrades")) ? "▾" : "▸" }}
          </span>
        </button>
        <div v-if="isExpanded(sectionKey('upgrades'))" class="section-body">
          <article
            v-for="upgrade in faction.upgrades"
            :key="upgrade.name"
            class="list-card"
          >
            <button
              type="button"
              class="list-card-header"
              :class="{ expanded: isExpanded(itemKey('upgrades', upgrade.name)) }"
              @click="toggle(itemKey('upgrades', upgrade.name))"
            >
              <span class="item-header">
                <span class="item-name">{{ upgrade.name }}</span>
                <span class="item-meta">{{ upgradeMeta(upgrade) }}</span>
              </span>
              <span class="chevron" aria-hidden="true">
                {{ isExpanded(itemKey("upgrades", upgrade.name)) ? "▾" : "▸" }}
              </span>
            </button>
            <div v-if="isExpanded(itemKey('upgrades', upgrade.name))" class="list-card-body">
              <p v-if="upgrade.flavor" class="flavor">{{ upgrade.flavor }}</p>
              <p class="item-description">
                <RuleText :text="upgrade.effect" />
              </p>
            </div>
          </article>
        </div>
      </section>
    </div>
  </PanelShell>
</template>

<style scoped>
.panel-scroll {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow-y: auto;
  min-height: 0;
  flex: 1;
}

.faction-header {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--color-border);
}

.faction-tagline {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--color-accent);
}

.qualities {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
}

.quality {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.mechanics {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.mechanic {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.mechanic-name {
  display: block;
  font-weight: 600;
  color: var(--color-text);
}

.faction-section {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.section-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.4rem 0.15rem;
  border: none;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.section-toggle:hover {
  color: var(--color-accent);
}

.section-body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.item-header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  min-width: 0;
}

.item-meta {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.chevron {
  color: var(--color-muted);
  font-size: 1.25rem;
  flex-shrink: 0;
}

.flavor {
  margin: 0 0 0.5rem;
  font-style: italic;
  color: var(--color-text-secondary);
}

.detail {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.detail-label {
  display: inline-block;
  margin-right: 0.35rem;
  font-weight: 600;
  color: var(--color-text);
}
</style>
