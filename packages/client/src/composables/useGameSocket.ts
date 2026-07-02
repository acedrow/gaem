import type { ClientMessage, ServerMessage } from "@gaem/shared";
import type { Ref } from "vue";
import { ref } from "vue";

import { appendConsoleEntry, setConsoleEntries } from "./useGameConsole.js";
import { useGameConnection } from "./useGameConnection.js";
import { useGameState } from "./useGameState.js";

export function useGameSocket(opts: {
  wsUrl: string;
  role: Ref<"gm" | "player">;
  playerProfile: Ref<{ id: string; name: string } | null | undefined>;
  selectedSheetId: Ref<string | null>;
  onError: (message: string) => void;
  onSelectionInvalidated: (state: ServerMessage & { type: "state" }) => void;
}) {
  const { connection } = useGameConnection();
  const { setGameState, registerSend, clearGameState } = useGameState();
  let socket: WebSocket | null = null;

  function send(msg: ClientMessage) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  }

  function connect() {
    connection.value = "connecting";
    socket = new WebSocket(opts.wsUrl);
    registerSend(send);

    socket.addEventListener("open", () => {
      connection.value = "connected";
      send({
        type: "join",
        role: opts.role.value,
        playerKey: opts.role.value === "player" ? opts.playerProfile.value?.id : undefined,
        nickname: opts.role.value === "player" ? opts.playerProfile.value?.name : undefined,
        characterSheetId:
          opts.role.value === "player" ? opts.selectedSheetId.value ?? undefined : undefined,
      });
    });

    socket.addEventListener("close", () => {
      connection.value = "disconnected";
      socket = null;
    });

    socket.addEventListener("message", (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        opts.onError("Invalid message from server");
        return;
      }
      if (msg.type === "state") {
        setGameState(msg.state, msg.yourPlayerId);
        opts.onSelectionInvalidated(msg);
      } else if (msg.type === "consoleSync") {
        setConsoleEntries(msg.entries);
      } else if (msg.type === "console") {
        appendConsoleEntry(msg.entry);
      } else if (msg.type === "error") {
        opts.onError(msg.message);
      }
    });
  }

  function disconnect() {
    socket?.close();
    clearGameState();
    connection.value = "disconnected";
  }

  return { send, connect, disconnect };
}
