/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WS_URL?: string;
  // Set by `npm run dev:cf` so the client targets the wrangler worker via Vite's proxy.
  readonly VITE_CF_DEV?: string;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
