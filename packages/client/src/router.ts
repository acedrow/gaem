import { createRouter, createWebHistory } from "vue-router";

import AppShell from "./components/AppShell.vue";
import { useSession } from "./composables/useSession.js";
import CharacterSheetDetailView from "./views/CharacterSheetDetailView.vue";
import CharacterSheetsView from "./views/CharacterSheetsView.vue";
import GameView from "./views/GameView.vue";
import LandingView from "./views/LandingView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "landing", component: LandingView },
    {
      path: "/",
      component: AppShell,
      meta: { requiresSession: true },
      children: [
        { path: "game", name: "game", component: GameView },
        {
          path: "character-sheets",
          name: "character-sheets",
          component: CharacterSheetsView,
        },
        {
          path: "character-sheets/:id",
          name: "character-sheet",
          component: CharacterSheetDetailView,
        },
      ],
    },
  ],
});

router.beforeEach((to) => {
  if (to.matched.some((r) => r.meta.requiresSession)) {
    const { isActive } = useSession();
    if (!isActive.value) return { name: "landing" };
  }
  return true;
});

export default router;
