<script setup lang="ts">
import { formatRuleText } from "@gaem/shared";
import { computed } from "vue";

const props = defineProps<{ text: string }>();

const html = computed(() => formatRuleText(props.text));
</script>

<template>
  <span class="rule-text" v-html="html" />
</template>
