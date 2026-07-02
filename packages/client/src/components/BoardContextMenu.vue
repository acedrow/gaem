<script setup lang="ts">
export type BoardContextMenuItem = {
  id: string;
  label: string;
  danger?: boolean;
};

defineProps<{
  open: boolean;
  x: number;
  y: number;
  items: BoardContextMenuItem[];
}>();

const emit = defineEmits<{
  select: [id: string];
  close: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && items.length"
      class="board-context-menu-backdrop"
      @click="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <div
        class="board-context-menu"
        :style="{ left: `${x}px`, top: `${y}px` }"
        @click.stop
        @contextmenu.prevent.stop
      >
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="menu-item"
          :class="{ danger: item.danger }"
          @click="emit('select', item.id)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.board-context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
}
.board-context-menu {
  position: fixed;
  min-width: 140px;
  padding: 0.25rem;
  border-radius: 8px;
  border: 1px solid #30363d;
  background: #161b22;
  box-shadow: 0 8px 24px #01040999;
}
.menu-item {
  display: block;
  width: 100%;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #e6edf3;
  padding: 0.4rem 0.65rem;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
}
.menu-item:hover {
  background: #21262d;
}
.menu-item.danger {
  color: #f85149;
}
.menu-item.danger:hover {
  background: #f8514922;
}
</style>
