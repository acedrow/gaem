import type { Ref } from "vue";
import { computed, nextTick, ref, watch } from "vue";

import { readPersistedViewport, writePersistedViewport } from "./uiPersist.js";

const BOARD_PAD = 0;
const ZOOM_MAX_FACTOR = 4;
const PAN_MIN_VISIBLE_FRACTION = 0.2;

function clampPanAxis(pan: number, scaledSize: number, viewportSize: number): number {
  const minVisible = Math.min(
    scaledSize * PAN_MIN_VISIBLE_FRACTION,
    viewportSize * PAN_MIN_VISIBLE_FRACTION,
  );
  return Math.min(viewportSize - minVisible, Math.max(minVisible - scaledSize, pan));
}

export function useBoardViewport(
  viewportEl: Ref<HTMLElement | null>,
  boardWidthPx: Ref<number>,
  hasGameState: Ref<boolean>,
  boardHeight: Ref<number>,
  boardWidth: Ref<number>,
  boardKey: Ref<string | null>,
) {
  const scale = ref(1);
  const panX = ref(0);
  const panY = ref(0);
  const fitScale = ref(1);
  const fitPanX = ref(0);
  const fitPanY = ref(0);

  const stageStyle = computed(() => ({
    transform: `translate(${panX.value}px, ${panY.value}px) scale(${scale.value})`,
    "--board-scale": String(scale.value),
  }));

  const isTransformed = computed(
    () =>
      Math.abs(scale.value - fitScale.value) > 0.005 ||
      Math.abs(panX.value - fitPanX.value) > 1 ||
      Math.abs(panY.value - fitPanY.value) > 1,
  );

  function getBoardSize() {
    const innerW = boardWidthPx.value;
    const innerH = innerW * (boardHeight.value / boardWidth.value);
    return { w: innerW + BOARD_PAD, h: innerH + BOARD_PAD };
  }

  function viewportSize(el: HTMLElement): { vw: number; vh: number } | null {
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    return vw > 0 && vh > 0 ? { vw, vh } : null;
  }

  function computeFitTransform(vw: number, vh: number) {
    const { w, h } = getBoardSize();
    const s = Math.min(vw / w, vh / h);
    return { scale: s, panX: (vw - w * s) / 2, panY: (vh - h * s) / 2 };
  }

  function updateFitState() {
    const el = viewportEl.value;
    if (!el) return;
    const size = viewportSize(el);
    if (!size) return;
    const fit = computeFitTransform(size.vw, size.vh);
    fitScale.value = fit.scale;
    fitPanX.value = fit.panX;
    fitPanY.value = fit.panY;
  }

  function clampView() {
    const el = viewportEl.value;
    if (!el || !viewportSize(el)) return;
    const minS = fitScale.value;
    const maxS = fitScale.value * ZOOM_MAX_FACTOR;
    scale.value = Math.min(maxS, Math.max(minS, scale.value));
    const { w, h } = getBoardSize();
    const scaledW = w * scale.value;
    const scaledH = h * scale.value;
    panX.value = clampPanAxis(panX.value, scaledW, el.clientWidth);
    panY.value = clampPanAxis(panY.value, scaledH, el.clientHeight);
  }

  function fitToView() {
    const el = viewportEl.value;
    const size = el ? viewportSize(el) : null;
    if (!el || !size || !hasGameState.value) return;
    const fit = computeFitTransform(size.vw, size.vh);
    scale.value = fit.scale;
    panX.value = fit.panX;
    panY.value = fit.panY;
    fitScale.value = fit.scale;
    fitPanX.value = fit.panX;
    fitPanY.value = fit.panY;
    persistViewport();
  }

  function restoreOrFit() {
    const el = viewportEl.value;
    const key = boardKey.value;
    if (!el || !hasGameState.value || !key) return;
    updateFitState();
    const saved = readPersistedViewport(key);
    if (saved && saved.scale > 0) {
      scale.value = saved.scale;
      panX.value = saved.panX;
      panY.value = saved.panY;
      clampView();
      persistViewport();
      return;
    }
    fitToView();
  }

  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  function persistViewport() {
    const key = boardKey.value;
    if (!key) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      writePersistedViewport(key, scale.value, panX.value, panY.value);
    }, 150);
  }

  let resizeFrame = 0;

  const resizeObserver = new ResizeObserver(() => {
    const wasFit = !isTransformed.value;
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      const el = viewportEl.value;
      if (!el || !viewportSize(el)) return;
      if (wasFit) fitToView();
      else {
        updateFitState();
        clampView();
      }
    });
  });

  let wheelFrame = 0;
  let pendingPanDx = 0;
  let pendingPanDy = 0;
  let pendingZoom: { deltaY: number; mx: number; my: number } | null = null;

  function applyWheelUpdate() {
    wheelFrame = 0;
    const el = viewportEl.value;
    if (!el) {
      pendingPanDx = 0;
      pendingPanDy = 0;
      pendingZoom = null;
      return;
    }

    if (pendingZoom) {
      const { deltaY, mx, my } = pendingZoom;
      pendingZoom = null;
      const minS = fitScale.value;
      const maxS = fitScale.value * ZOOM_MAX_FACTOR;
      const next = Math.min(maxS, Math.max(minS, scale.value * Math.exp(-deltaY * 0.005)));
      const ratio = next / scale.value;
      panX.value = mx - (mx - panX.value) * ratio;
      panY.value = my - (my - panY.value) * ratio;
      scale.value = next;
      clampView();
      persistViewport();
      return;
    }

    const dx = pendingPanDx;
    const dy = pendingPanDy;
    pendingPanDx = 0;
    pendingPanDy = 0;
    if (dx === 0 && dy === 0) return;

    panX.value -= dx;
    panY.value -= dy;
    clampView();
    persistViewport();
  }

  function onWheel(e: WheelEvent) {
    if (!viewportEl.value) return;
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      const rect = viewportEl.value.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (pendingZoom) pendingZoom.deltaY += e.deltaY;
      else pendingZoom = { deltaY: e.deltaY, mx, my };
      pendingZoom.mx = mx;
      pendingZoom.my = my;
      pendingPanDx = 0;
      pendingPanDy = 0;
    } else {
      pendingPanDx += e.deltaX;
      pendingPanDy += e.deltaY;
    }

    if (!wheelFrame) wheelFrame = requestAnimationFrame(applyWheelUpdate);
  }

  function observeViewport(el: HTMLElement | null, prev: HTMLElement | null) {
    if (prev) resizeObserver.unobserve(prev);
    if (el) resizeObserver.observe(el);
  }

  function disconnect() {
    if (wheelFrame) cancelAnimationFrame(wheelFrame);
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    if (persistTimer) clearTimeout(persistTimer);
    resizeObserver.disconnect();
  }

  watch(
    [viewportEl, boardKey, hasGameState],
    ([el, key, ready]) => {
      if (!el || !key || !ready) return;
      nextTick(restoreOrFit);
    },
    { immediate: true },
  );

  return {
    scale,
    panX,
    panY,
    stageStyle,
    isTransformed,
    fitToView,
    restoreOrFit,
    onWheel,
    observeViewport,
    disconnect,
  };
}
