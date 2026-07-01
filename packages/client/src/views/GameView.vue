<script setup lang="ts">
import GameBoard from "../components/GameBoard.vue";
import { useSession } from "../composables/useSession.js";

const { role, playerProfile } = useSession();
</script>

<template>
  <GameBoard
    v-if="role"
    :role="role"
    :player-profile="playerProfile"
  />
</template>
