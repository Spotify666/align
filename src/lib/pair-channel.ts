"use client";
// How the two phones' messages travel. In the app: a Supabase Realtime broadcast channel named
// after the code. Broadcast passes messages between the phones and stores none (the owner's
// "pass-through only"). For testing two "phones" as two tabs of one browser, `?transport=local`
// uses the browser's own BroadcastChannel instead, so nothing leaves the machine.

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase/client";
import type { PairMessage } from "./pair";

export interface PairTransport {
  send(m: PairMessage): Promise<void>;
  close(): void;
}

export function openTransport(code: string, onMessage: (m: PairMessage) => void, onStatus: (s: "connecting" | "open" | "failed") => void): PairTransport {
  const local = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("transport") === "local";
  return local ? localTransport(code, onMessage, onStatus) : realtimeTransport(code, onMessage, onStatus);
}

function localTransport(code: string, onMessage: (m: PairMessage) => void, onStatus: (s: "connecting" | "open" | "failed") => void): PairTransport {
  const ch = new BroadcastChannel(`aline-pair-${code}`);
  ch.onmessage = (e) => onMessage(e.data as PairMessage);
  queueMicrotask(() => onStatus("open"));
  return {
    send: async (m) => ch.postMessage(m),
    close: () => ch.close(),
  };
}

function realtimeTransport(code: string, onMessage: (m: PairMessage) => void, onStatus: (s: "connecting" | "open" | "failed") => void): PairTransport {
  onStatus("connecting");
  const channel: RealtimeChannel = supabase().channel(`aline-pair-${code}`, { config: { broadcast: { self: false, ack: true } } });
  channel.on("broadcast", { event: "m" }, ({ payload }) => onMessage(payload as PairMessage));
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") onStatus("open");
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onStatus("failed");
  });
  return {
    send: async (m) => {
      const r = await channel.send({ type: "broadcast", event: "m", payload: m });
      if (r !== "ok") throw new Error("The message didn't reach the server. Check the connection and try again.");
    },
    close: () => {
      void supabase().removeChannel(channel);
    },
  };
}
