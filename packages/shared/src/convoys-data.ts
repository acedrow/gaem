import convoysJson from "./data/rules/convoys.json" with { type: "json" };
import type { OverworldConvoyType } from "./types.js";

export type ConvoyCompletionOption = {
  name: string;
  description: string;
};

export type ConvoyTypeInfo = {
  id: OverworldConvoyType;
  name: string;
  summary: string;
  escort: string;
  completionOptions: ConvoyCompletionOption[];
};

export const CONVOY_TYPES = convoysJson as ConvoyTypeInfo[];

export function getConvoyTypeInfo(id: OverworldConvoyType): ConvoyTypeInfo | undefined {
  return CONVOY_TYPES.find((c) => c.id === id);
}
