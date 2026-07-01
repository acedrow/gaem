import { createRouter, createWebHistory } from "vue-router";

import AppShell from "./components/AppShell.vue";
import { useSession } from "./composables/useSession.js";
import LandingView from "./views/LandingView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "landing", component: LandingView },
    {
      path: "/game",
      component: AppShell,
      meta: { requiresSession: true },
    },
    {
      path: "/character-sheets/:id?",
      redirect: "/game",
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
