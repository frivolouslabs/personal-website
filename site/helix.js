const stage = document.getElementById("stage");
const cursorEl = document.getElementById("cursor");
const statusEl = document.getElementById("status");
const viewer = document.getElementById("viewer");
const viewerImg = document.getElementById("viewer-img");
const viewerPrev = document.getElementById("viewer-prev");
const viewerNext = document.getElementById("viewer-next");
const themeButtons = document.querySelectorAll("[data-theme-choice]");
const shapeButtons = document.querySelectorAll("[data-shape]");

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const POOL = 64;
const DESKTOP_SPEED = -0.38;
const COAST_DECAY = 2.4;
const COAST_CAP = 14;
const ZOOM_EASE = "cubic-bezier(0.2, 0.8, 0.4, 1)";
const PHOTO_REV = "2";

const pointer = { x: 0, y: 0, inside: false, overChrome: false, drag: false, lastY: 0 };
const cursor = { x: 0, y: 0 };
const state = {
  photos: { landscape: [], portrait: [] },
  shape: "portrait",
  scroll: 0,
  vel: 0,
  baseSpeed: reduced ? 0 : DESKTOP_SPEED,
  pull: 0,
  hoverIndex: null,
  width: 0,
  height: 0,
  cardW: 220,
  cardH: 300,
  zoom: false,
  metrics: null,
};

let coast = 0;
let wheelUntil = 0;
let lastWheelT = 0;
const samples = [];

if (finePointer) document.documentElement.classList.add("has-cursor");

function readShape() {
  try {
    return localStorage.getItem("shape") === "landscape" ? "landscape" : "portrait";
  } catch (error) {
    return "portrait";
  }
}

state.shape = readShape();

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch (error) {
    /* storage can be blocked */
  }
  themeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === theme));
  });
}

function setShape(shape, animate) {
  state.shape = shape;
  try {
    localStorage.setItem("shape", shape);
  } catch (error) {
    /* storage can be blocked */
  }
  shapeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.shape === shape));
  });
  measure();
  if (!animate) return;
  stage.classList.add("is-hidden");
  window.setTimeout(() => {
    stage.classList.remove("is-hidden");
    assignSources(true);
  }, reduced ? 0 : 180);
}

themeButtons.forEach((button) => {
  button.addEventListener("click", () => setTheme(button.dataset.themeChoice));
});
shapeButtons.forEach((button) => {
  button.addEventListener("click", () => setShape(button.dataset.shape, true));
});
setTheme(document.documentElement.dataset.theme || "dark");

const cards = [];
for (let i = 0; i < POOL; i += 1) {
  const card = document.createElement("div");
  card.className = "card";
  const front = document.createElement("img");
  const back = document.createElement("img");
  front.className = "face front";
  back.className = "face back";
  front.alt = "";
  back.alt = "";
  front.draggable = false;
  back.draggable = false;
  front.decoding = "async";
  back.decoding = "async";
  card.append(front, back);
  card.hidden = true;
  stage.append(card);
  cards.push({ el: card, front, back, index: null, src: "", transform: "", opacity: "", z: "" });
}
setShape(state.shape, false);

function isPhone() {
  const short = Math.min(state.width, state.height);
  if (short <= 520) return true;
  return matchMedia("(pointer: coarse)").matches && short <= 900;
}

function computeMetrics() {
  const phone = isPhone();
  const portraitCard = state.shape === "portrait";
  if (!phone) {
    const radius = Math.min(state.width * 0.36, state.height * 0.5, 560);
    const cardsPerTurn = portraitCard ? 23.1 : 16.8;
    const step = (Math.PI * 2) / cardsPerTurn;
    const sizeStep = (Math.PI * 2) / 20;
    const neighbor = 2 * radius * Math.sin(sizeStep / 2);
    const cardW = portraitCard
      ? Math.min(neighbor / 1.26, state.width * 0.15)
      : Math.min(neighbor / 1.12, state.width * 0.2) * 1.25;
    const cardH = portraitCard ? cardW / 0.7 : cardW / 1.42;
    const pitch = Math.max(26, state.height * 0.03) * (15 / 21);
    return {
      phone,
      radius,
      pitch,
      cardsPerTurn,
      step,
      cardW,
      cardH,
      perspective: radius * 3.1,
      baseSpeed: reduced ? 0 : DESKTOP_SPEED,
    };
  }
  const short = Math.min(state.width, state.height);
  const tall = state.height >= state.width;
  const radius = short * (tall ? 0.5 : 0.46);
  const cardsPerTurn = portraitCard ? 15.3 : 12.93;
  const step = (Math.PI * 2) / cardsPerTurn;
  const sizedStep = (Math.PI * 2) / 18;
  const neighbor = 2 * radius * Math.sin(sizedStep / 2);
  const cardW = portraitCard
    ? Math.min(neighbor / 0.98, state.width * 0.32)
    : Math.min(neighbor / 1.02, state.width * 0.36) * 1.25;
  const cardH = portraitCard ? cardW / 0.7 : cardW / 1.45;
  const pitch = short * (tall ? 0.058 : 0.05);
  const perspective = radius * 2.7;
  const frontScale = perspective / Math.max(80, perspective - radius);
  const driftPx = 14.5;
  return {
    phone,
    radius,
    pitch,
    cardsPerTurn,
    step,
    cardW,
    cardH,
    perspective,
    baseSpeed: reduced ? 0 : -driftPx / Math.max(1, pitch * frontScale),
  };
}

function measure() {
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  const metrics = computeMetrics();
  state.metrics = metrics;
  state.cardW = metrics.cardW;
  state.cardH = metrics.cardH;
  state.baseSpeed = metrics.baseSpeed;
  stage.style.perspective = `${Math.round(metrics.perspective)}px`;
  cards.forEach((card) => {
    card.el.style.width = `${state.cardW}px`;
    card.el.style.height = `${state.cardH}px`;
    card.el.style.marginLeft = `${-state.cardW / 2}px`;
    card.el.style.marginTop = `${-state.cardH / 2}px`;
    card.transform = "";
  });
}

function activePhotos() {
  return state.photos[state.shape];
}

function photoUrl(src) {
  return `${src}?v=${PHOTO_REV}`;
}

function place(u) {
  const metrics = state.metrics;
  const step = metrics.pitch;
  const radius = metrics.radius;
  const y = u * step;
  const angle = u * metrics.step;
  let x = Math.sin(angle) * radius;
  let z = Math.cos(angle) * radius;
  let fade;
  if (metrics.phone) {
    const bow = Math.min(1, Math.abs(y) / (metrics.pitch * metrics.cardsPerTurn * 1.05));
    const fall = bow * bow;
    z -= fall * radius * 1.15;
    x *= 1 - fall * 0.08;
    fade = bow < 0.62 ? 1 : Math.max(0, 1 - (bow - 0.62) / 0.38);
  } else {
    const edge = Math.min(1, Math.abs(y) / (state.height * 0.52));
    fade = edge < 0.9 ? 1 : Math.max(0, 1 - (edge - 0.9) / 0.1);
  }
  return { x, y, z, angle, fade, pitch: step };
}

function mod(index) {
  return ((index % POOL) + POOL) % POOL;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pickHover(laid) {
  if (!finePointer || !pointer.inside || state.zoom) return null;
  const hit = Math.max(state.cardW, state.cardH) * 0.42;
  const points = laid.map((item) => ({
    index: item.index,
    x: state.width / 2 + item.x,
    y: state.height / 2 + item.y,
  }));
  if (state.hoverIndex != null) {
    const current = points.find((item) => item.index === state.hoverIndex);
    if (current && Math.hypot(current.x - pointer.x, current.y - pointer.y) < hit * 1.4) {
      return state.hoverIndex;
    }
  }
  let best = null;
  let bestDist = hit;
  points.forEach((item) => {
    const dist = Math.hypot(item.x - pointer.x, item.y - pointer.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = item.index;
    }
  });
  return best;
}

function assignSources(force) {
  cards.forEach((card) => {
    if (card.index == null) return;
    const photos = activePhotos();
    if (!photos.length) return;
    const wrapped = ((card.index % photos.length) + photos.length) % photos.length;
    const src = photoUrl(photos[wrapped].src);
    if (!force && card.src === src) return;
    card.src = src;
    card.front.src = src;
    card.back.src = src;
  });
}

function writeStyle(card, transform, opacity, zIndex) {
  if (card.transform !== transform) {
    card.transform = transform;
    card.el.style.transform = transform;
  }
  if (card.opacity !== opacity) {
    card.opacity = opacity;
    card.el.style.opacity = opacity;
  }
  if (card.z !== zIndex) {
    card.z = zIndex;
    card.el.style.zIndex = zIndex;
  }
}

let last = performance.now();

function paint(dt) {
  const sample = place(0);
  const span = Math.ceil((state.height * 0.48) / sample.pitch) + 1;
  const base = Math.floor(state.scroll);
  const used = new Array(POOL).fill(false);
  const laid = [];
  const yLimit = state.metrics.phone
    ? sample.pitch * state.metrics.cardsPerTurn * 1.2
    : sample.pitch * state.metrics.cardsPerTurn * 0.58;

  for (let i = -span; i <= span; i += 1) {
    const index = base + i;
    const u = index - state.scroll;
    const posed = place(u);
    if (Math.abs(posed.y) > yLimit) continue;
    const slot = mod(index);
    if (used[slot]) continue;
    used[slot] = true;
    laid.push({ slot, index, u, ...posed });
  }

  const hover = pickHover(laid);
  if (hover !== state.hoverIndex) state.hoverIndex = hover;
  const pullTarget = state.hoverIndex == null ? 0 : 1;
  state.pull += (pullTarget - state.pull) * (1 - Math.exp(-dt * (reduced ? 24 : 3.2)));

  for (let slot = 0; slot < POOL; slot += 1) {
    if (used[slot]) continue;
    const card = cards[slot];
    card.el.hidden = true;
    card.index = null;
  }

  laid.forEach((item) => {
    const card = cards[item.slot];
    const lift = item.index === state.hoverIndex ? state.pull * 36 : 0;
    const turn = (item.angle * 180) / Math.PI;
    const alpha = Math.max(0, Math.min(1, item.fade));
    const far = Math.abs(item.angle) > 1.05;
    if (card.far !== far) {
      card.far = far;
      card.el.classList.toggle("is-far", far);
    }
    card.el.hidden = false;
    card.index = item.index;
    writeStyle(
      card,
      `translate3d(${item.x}px, ${item.y}px, ${item.z + lift}px) rotateY(${turn}deg)`,
      alpha.toFixed(3),
      String(Math.round(item.z + lift + 4000)),
    );
  });
  assignSources(false);

  if (finePointer) {
    const show = pointer.inside && !state.zoom;
    cursorEl.hidden = !show;
    if (show) {
      const follow = reduced ? 1 : 1 - Math.exp(-dt * 16);
      cursor.x += (pointer.x - cursor.x) * follow;
      cursor.y += (pointer.y - cursor.y) * follow;
      cursorEl.style.transform = `translate(${cursor.x}px, ${cursor.y}px)`;
    }
  }
}

function frame(now) {
  const dt = Math.min(0.034, Math.max(0, (now - last) / 1000));
  last = now;

  if (state.zoom) {
    coast = 0;
    requestAnimationFrame(frame);
    return;
  }

  if (!reduced && !document.hidden && !press.active && now >= wheelUntil) {
    coast *= Math.exp(-dt * COAST_DECAY);
    if (Math.abs(coast) < 0.012) coast = 0;
    state.vel = state.baseSpeed + coast;
    state.scroll += state.vel * dt;
  }

  paint(dt);
  requestAnimationFrame(frame);
}

function onChrome(target) {
  return Boolean(target && target.closest && target.closest("a, button, .pill, .viewer"));
}

function photoAt(index) {
  const photos = activePhotos();
  if (!photos.length || index == null) return null;
  const wrapped = ((index % photos.length) + photos.length) % photos.length;
  return photos[wrapped];
}

let zoomAnim = null;
let zoomDir = "open";
let openStamp = 0;
let stepAnim = null;
let viewerToken = 0;
const REST = "translate3d(0px, 0px, 0) scale(1, 1)";

function cardBox(index) {
  const card = cards.find((item) => item.index === index && !item.el.hidden);
  if (!card) return null;
  const box = card.el.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return null;
  return {
    cx: box.left + box.width / 2,
    cy: box.top + box.height / 2,
    w: box.width,
    h: box.height,
  };
}

function fittedBox(width, height) {
  const maxW = Math.min(state.width * 0.9, 1400);
  const maxH = state.height * 0.86;
  const aspect = width / height;
  let boxW = maxW;
  let boxH = boxW / aspect;
  if (boxH > maxH) {
    boxH = maxH;
    boxW = boxH * aspect;
  }
  return {
    left: (state.width - boxW) / 2,
    top: (state.height - boxH) / 2,
    width: boxW,
    height: boxH,
  };
}

function flightTransform(from, to) {
  const dx = from.cx - (to.left + to.width / 2);
  const dy = from.cy - (to.top + to.height / 2);
  const sx = from.w / to.width;
  const sy = from.h / to.height;
  return `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
}

function layoutViewer(box) {
  viewerImg.style.left = `${box.left}px`;
  viewerImg.style.top = `${box.top}px`;
  viewerImg.style.width = `${box.width}px`;
  viewerImg.style.height = `${box.height}px`;
}

function dropZoomAnim() {
  if (!zoomAnim) return;
  zoomAnim.onfinish = null;
  zoomAnim.cancel();
  zoomAnim = null;
}

function markSource(on) {
  cards.forEach((card) => card.el.classList.remove("is-source"));
  if (!on || state.zoomIndex == null) return;
  const card = cards.find((item) => item.index === state.zoomIndex);
  if (card) card.el.classList.add("is-source");
}

function cancelStep() {
  if (!stepAnim) return;
  stepAnim.onfinish = null;
  stepAnim.cancel();
  stepAnim = null;
  viewerImg.style.opacity = "1";
  viewerImg.style.transform = REST;
}

function syncNav() {
  const many = activePhotos().length > 1;
  viewerPrev.hidden = !many;
  viewerNext.hidden = !many;
}

function finishClose() {
  dropZoomAnim();
  cancelStep();
  viewerToken += 1;
  state.zoom = false;
  state.zoomClosing = false;
  state.zoomIndex = null;
  markSource(false);
  viewer.classList.remove("is-open");
  viewer.hidden = true;
  viewerImg.removeAttribute("src");
  viewerImg.style.opacity = "1";
  viewerImg.style.transform = "none";
  document.documentElement.classList.remove("is-zoomed");
}

function setViewerSource(photo) {
  const token = (viewerToken += 1);
  const full = photoUrl(photo.src.replace("/photos/wall/", "/photos/images/"));
  viewerImg.dataset.fallback = photoUrl(photo.src);
  viewerImg.dataset.usedFallback = "";
  const upgrade = () => {
    if (token !== viewerToken || !state.zoom || state.zoomClosing) return;
    if (viewerImg.src.endsWith(full.slice(full.lastIndexOf("/")))) return;
    viewerImg.src = full;
  };
  viewerImg.src = photoUrl(photo.src);
  if (full === photo.src) return;
  const pre = new Image();
  pre.decoding = "async";
  pre.onload = () => {
    if (token !== viewerToken) return;
    if (typeof pre.decode === "function") {
      pre.decode().then(upgrade).catch(upgrade);
      return;
    }
    upgrade();
  };
  pre.src = full;
}

function showPhoto(index, dir) {
  const photo = photoAt(index);
  if (!photo) return;
  state.zoomIndex = index;
  layoutViewer(fittedBox(photo.w || state.cardW, photo.h || state.cardH));
  setViewerSource(photo);
  paint(0.016);
  markSource(true);
  viewerImg.style.opacity = "1";
  viewerImg.style.transform = REST;
  if (reduced || !dir) return;
  const enter = dir > 0 ? "14%" : "-14%";
  stepAnim = viewerImg.animate(
    [
      { transform: `translate3d(${enter}, 0, 0)`, opacity: 0 },
      { transform: REST, opacity: 1 },
    ],
    { duration: 260, easing: ZOOM_EASE, fill: "both" },
  );
  stepAnim.onfinish = () => {
    viewerImg.style.opacity = "1";
    viewerImg.style.transform = REST;
    stepAnim = null;
  };
}

function stepZoom(dir) {
  if (!state.zoom || state.zoomClosing || state.zoomIndex == null) return;
  if (activePhotos().length < 2) return;
  const nextIndex = state.zoomIndex + dir;
  if (!photoAt(nextIndex)) return;
  if (zoomAnim && zoomDir === "open") {
    dropZoomAnim();
    viewerImg.style.transform = REST;
  }
  cancelStep();
  state.scroll += dir;
  showPhoto(nextIndex, dir);
}

function openZoom(index) {
  const photo = photoAt(index);
  if (!photo) return;
  const from = cardBox(index);
  if (!from) return;
  dropZoomAnim();
  cancelStep();
  openStamp = performance.now();
  state.zoomClosing = false;
  state.zoom = true;
  state.zoomIndex = index;
  coast = 0;
  const to = fittedBox(photo.w || state.cardW, photo.h || state.cardH);
  const fromT = flightTransform(from, to);
  const rest = REST;
  layoutViewer(to);
  viewerImg.style.transform = fromT;
  setViewerSource(photo);
  viewer.hidden = false;
  syncNav();
  markSource(true);
  document.documentElement.classList.add("is-zoomed");
  cursorEl.hidden = true;
  if (reduced) {
    viewerImg.style.transform = rest;
    viewer.classList.add("is-open");
    return;
  }
  zoomDir = "open";
  viewer.classList.add("is-open");
  zoomAnim = viewerImg.animate([{ transform: fromT }, { transform: rest }], {
    duration: 400,
    easing: ZOOM_EASE,
    fill: "both",
  });
  zoomAnim.onfinish = () => {
    if (zoomDir === "close") {
      finishClose();
      return;
    }
    viewerImg.style.transform = rest;
    dropZoomAnim();
  };
}

function closeZoom() {
  if (!state.zoom || state.zoomClosing) return;
  cancelStep();
  const from = cardBox(state.zoomIndex);
  document.documentElement.classList.remove("is-zoomed");
  viewer.classList.remove("is-open");
  if (!from || reduced) {
    finishClose();
    return;
  }
  state.zoomClosing = true;
  zoomDir = "close";
  if (zoomAnim && zoomAnim.playState === "running") {
    zoomAnim.reverse();
    return;
  }
  const to = {
    left: parseFloat(viewerImg.style.left),
    top: parseFloat(viewerImg.style.top),
    width: parseFloat(viewerImg.style.width),
    height: parseFloat(viewerImg.style.height),
  };
  const backT = flightTransform(from, to);
  const current = getComputedStyle(viewerImg).transform;
  viewerImg.style.transform = current === "none" ? REST : current;
  dropZoomAnim();
  zoomAnim = viewerImg.animate(
    [{ transform: viewerImg.style.transform }, { transform: backT }],
    { duration: 340, easing: ZOOM_EASE, fill: "both" },
  );
  zoomAnim.onfinish = () => {
    if (zoomDir === "close") finishClose();
  };
}

viewerImg.addEventListener("error", () => {
  const fallback = viewerImg.dataset.fallback;
  if (!fallback || viewerImg.dataset.usedFallback === "1") return;
  viewerImg.dataset.usedFallback = "1";
  viewerImg.src = fallback;
});

let swipe = null;
let blockClose = false;

viewerPrev.addEventListener("click", (event) => {
  event.stopPropagation();
  stepZoom(-1);
});
viewerNext.addEventListener("click", (event) => {
  event.stopPropagation();
  stepZoom(1);
});

viewer.addEventListener("pointerdown", (event) => {
  if (!state.zoom || state.zoomClosing || event.button !== 0) return;
  if (event.target.closest && event.target.closest(".viewer-nav")) return;
  swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
  try {
    viewer.setPointerCapture(event.pointerId);
  } catch (error) {
    /* capture can fail on a stale pointer */
  }
});

function endSwipe(event) {
  if (!swipe || event.pointerId !== swipe.id) return;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  swipe = null;
  if (Math.hypot(dx, dy) > 10) blockClose = true;
  if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy)) stepZoom(dx < 0 ? 1 : -1);
}

viewer.addEventListener("pointerup", endSwipe);
viewer.addEventListener("pointercancel", (event) => {
  if (swipe && event.pointerId === swipe.id) swipe = null;
});

viewer.addEventListener("click", (event) => {
  if (blockClose) {
    blockClose = false;
    return;
  }
  if (event.target.closest && event.target.closest(".viewer-nav")) return;
  if (performance.now() - openStamp < 320) return;
  closeZoom();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeZoom();
    return;
  }
  if (!state.zoom) return;
  if (event.key === "ArrowRight") {
    event.preventDefault();
    stepZoom(1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    stepZoom(-1);
  }
});

const press = { active: false, x: 0, y: 0, index: null, moved: false };

function noteSample() {
  const t = performance.now();
  samples.push({ t, scroll: state.scroll });
  while (samples.length && t - samples[0].t > 100) samples.shift();
}

function releaseVelocity() {
  const t = performance.now();
  while (samples.length && t - samples[0].t > 90) samples.shift();
  if (samples.length < 2) return 0;
  const a = samples[0];
  const b = samples[samples.length - 1];
  const dt = (b.t - a.t) / 1000;
  if (dt < 0.012) return 0;
  return clamp((b.scroll - a.scroll) / dt - state.baseSpeed, -COAST_CAP, COAST_CAP);
}

function endPress() {
  if (!press.active) return;
  if (!press.moved && press.index != null) openZoom(press.index);
  else if (press.moved) coast = releaseVelocity();
  press.active = false;
  pointer.drag = false;
  samples.length = 0;
}

window.addEventListener("pointermove", (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.overChrome = onChrome(event.target);
  pointer.inside = !pointer.overChrome && !state.zoom;
  if (!press.active) return;
  if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) {
    press.moved = true;
    pointer.drag = true;
  }
  if (!pointer.drag) return;
  const dy = event.clientY - pointer.lastY;
  pointer.lastY = event.clientY;
  state.scroll += -dy / state.metrics.pitch;
  noteSample();
});

window.addEventListener("pointerdown", (event) => {
  if (state.zoom || onChrome(event.target) || event.button !== 0) return;
  press.active = true;
  press.moved = false;
  press.x = event.clientX;
  press.y = event.clientY;
  press.index = null;
  pointer.lastY = event.clientY;
  coast = 0;
  samples.length = 0;
  noteSample();
  try {
    stage.setPointerCapture(event.pointerId);
  } catch (error) {
    /* capture can fail on a stale pointer */
  }
  const cardEl = event.target.closest && event.target.closest(".card");
  if (!cardEl) return;
  const found = cards.find((card) => card.el === cardEl);
  press.index = found ? found.index : null;
});

window.addEventListener("pointerup", endPress);
window.addEventListener("pointercancel", endPress);

window.addEventListener("pointerleave", () => {
  pointer.inside = false;
});

window.addEventListener(
  "wheel",
  (event) => {
    if (state.zoom || onChrome(event.target)) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? state.height : 1;
    const cardsMoved = (event.deltaY * unit) / Math.max(state.metrics.pitch, 1);
    const now = performance.now();
    const dt = clamp((now - lastWheelT) / 1000, 0.008, 0.04);
    lastWheelT = now;
    state.scroll += cardsMoved;
    const inst = cardsMoved / dt;
    coast = clamp((inst - state.baseSpeed) * 0.45, -COAST_CAP, COAST_CAP);
    wheelUntil = now + 80;
    noteSample();
  },
  { passive: false },
);

window.addEventListener("resize", measure);
document.addEventListener("visibilitychange", () => {
  last = performance.now();
});

fetch("/photos/wall.json")
  .then((response) => {
    if (!response.ok) throw new Error("photos");
    return response.json();
  })
  .then((photos) => {
    photos.forEach((photo) => {
      const landscape = photo.w >= photo.h;
      state.photos[landscape ? "landscape" : "portrait"].push(photo);
    });
    measure();
    requestAnimationFrame(frame);
  })
  .catch(() => {
    statusEl.textContent = "Photos didn’t load.";
  });
