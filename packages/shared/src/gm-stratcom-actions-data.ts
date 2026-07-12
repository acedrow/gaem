import gmStratcomActionsJson from "./data/rules/gm-stratcom-actions.json" with { type: "json" };

export type GmStratcomAction = {
  name: string;
  summary: string;
};

export const GM_STRATCOM_ACTIONS = gmStratcomActionsJson as GmStratcomAction[];
