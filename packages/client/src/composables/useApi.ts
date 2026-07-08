import type { EnemyListing, PlayerProfile } from "@gaem/shared";
import { getEnemyListingByName, getEnemyPortraitUrl } from "@gaem/shared";
import { computed } from "vue";

import { useSession } from "./useSession.js";

type PlayerProfileOption = PlayerProfile & { isActive?: boolean };

export function useApi() {
  const { apiHeaders, clearSession } = useSession();

  const apiBase = computed(() =>
    import.meta.env.DEV && !import.meta.env.VITE_CF_DEV
      ? `http://${location.hostname}:3001`
      : "",
  );

  async function apiFetch(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    for (const [key, value] of Object.entries(apiHeaders())) {
      headers.set(key, value);
    }
    const res = await fetch(`${apiBase.value}${path}`, { ...init, headers });
    if (
      res.status === 401 &&
      path !== "/api/login" &&
      !path.startsWith("/api/player-profiles")
    ) {
      clearSession();
      if (location.pathname !== "/") location.assign("/");
    }
    return res;
  }

  async function fetchPlayerProfiles(): Promise<PlayerProfileOption[]> {
    const res = await apiFetch("/api/player-profiles");
    if (!res.ok) return [];
    const data = (await res.json()) as { profiles: PlayerProfileOption[] };
    return data.profiles;
  }

  async function fetchPortraitUrl(sheetId: string): Promise<string | null> {
    const res = await apiFetch(`/api/character-sheets/${sheetId}/portrait`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  function enemyPortraitUrl(listing: EnemyListing | undefined): string | null {
    return getEnemyPortraitUrl(listing);
  }

  function enemyPortraitUrlForName(name: string | undefined): string | null {
    return enemyPortraitUrl(getEnemyListingByName(name));
  }

  return { apiBase, apiFetch, fetchPlayerProfiles, fetchPortraitUrl, enemyPortraitUrl, enemyPortraitUrlForName };
}
