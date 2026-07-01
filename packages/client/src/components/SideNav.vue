<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<template>
  <nav class="side-nav">
    <RouterLink class="nav-link" to="/game">Game</RouterLink>
    <RouterLink class="nav-link" to="/character-sheets">Character Sheets</RouterLink>
  </nav>
</template>

<style scoped>
.side-nav {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 10rem;
  padding: 1rem 0.75rem;
  border-right: 1px solid #30363d;
  background: #0d1117;
}

.nav-link {
  display: block;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  color: #8b949e;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.9rem;
}

.nav-link:hover {
  color: #e6edf3;
  background: #161b22;
}

.nav-link.router-link-active {
  color: #e6edf3;
  background: #161b22;
  border: 1px solid #30363d;
}
</style>
