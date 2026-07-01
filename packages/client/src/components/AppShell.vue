<script setup lang="ts">
import { RouterView, useRouter } from "vue-router";

import { useSession } from "../composables/useSession.js";
import SideNav from "./SideNav.vue";

const router = useRouter();
const { role, playerProfile, clearSession } = useSession();

function leave() {
  clearSession();
  router.push("/");
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">Gaem</div>
      <SideNav />
      <div class="session-info">
        <span class="role-tag">{{ role === "gm" ? "GM" : "Player" }}</span>
        <span v-if="playerProfile" class="profile-name">{{ playerProfile.name }}</span>
        <button class="leave-btn" type="button" @click="leave">
          Leave
        </button>
      </div>
    </aside>
    <main class="main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: calc(100vh - 3rem);
  margin: -1.5rem;
  max-width: none;
}

.sidebar {
  display: flex;
  flex-direction: column;
  border-right: 1px solid #30363d;
  background: #0d1117;
}

.brand {
  padding: 1rem 0.75rem 0.5rem;
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: -0.03em;
}

.session-info {
  margin-top: auto;
  padding: 0.75rem;
  border-top: 1px solid #30363d;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.role-tag {
  font-size: 0.72rem;
  color: #d29922;
  text-transform: uppercase;
  font-weight: 700;
}

.profile-name {
  font-size: 0.85rem;
  color: #8b949e;
}

.leave-btn {
  margin-top: 0.25rem;
  border: 1px solid #30363d;
  border-radius: 8px;
  background: #161b22;
  color: #e6edf3;
  padding: 0.4rem 0.55rem;
  cursor: pointer;
  font-size: 0.85rem;
}

.leave-btn:hover {
  background: #1f2937;
}

.main {
  flex: 1;
  padding: 1.25rem 1.5rem;
  min-width: 0;
}
</style>
