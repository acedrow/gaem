import { computed, ref } from "vue";

export type TileBrushGalleryKind = "appearance" | "feature";

const openKind = ref<TileBrushGalleryKind | null>(null);

export function useTileBrushGalleryUi() {
  const appearanceGalleryOpen = computed(() => openKind.value === "appearance");
  const featureGalleryOpen = computed(() => openKind.value === "feature");
  const galleryOpen = computed(() => openKind.value !== null);

  function openAppearanceGallery() {
    openKind.value = "appearance";
  }

  function openFeatureGallery() {
    openKind.value = "feature";
  }

  function toggleAppearanceGallery() {
    openKind.value = openKind.value === "appearance" ? null : "appearance";
  }

  function toggleFeatureGallery() {
    openKind.value = openKind.value === "feature" ? null : "feature";
  }

  function closeGalleries() {
    openKind.value = null;
  }

  return {
    openKind,
    galleryOpen,
    appearanceGalleryOpen,
    featureGalleryOpen,
    openAppearanceGallery,
    openFeatureGallery,
    toggleAppearanceGallery,
    toggleFeatureGallery,
    closeGalleries,
  };
}
