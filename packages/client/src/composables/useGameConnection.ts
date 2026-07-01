import { ref } from "vue";

const connection = ref<"connecting" | "connected" | "disconnected">("connecting");

export function useGameConnection() {
  return { connection };
}
