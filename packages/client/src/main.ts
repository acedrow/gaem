import { createApp } from "vue";
import App from "./App.vue";
import { initTheme } from "./composables/useTheme.js";
import router from "./router.js";
import "./style.css";

initTheme();

createApp(App).use(router).mount("#app");
