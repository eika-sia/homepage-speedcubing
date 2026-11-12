import { DISCIPLINE_TITLE } from "./config.js";
import { listLessons, getLesson, usingDemoData } from "./api.js";
import { renderSections } from "./renderer.js";
import { CubeManager } from "./cube.js";
import { SmartCubeSession } from "./bluetooth.js";

const $ = (id) => document.getElementById(id);
const cubes = new CubeManager();
const state = { view: "scroll", cubeMode: "animated", slide: 0, sections: [], hasCubes: false };
let lessonsPromise;
let routeRequest = 0;

const bluetooth = new SmartCubeSession({
  onMove: (move) => cubes.recordMove(move),
  onStatus: updateBluetoothStatus,
});

function lessonHref(slug = "") {
  const url = new URL(location.href);
  if (slug) url.searchParams.set("lesson", slug);
  else url.searchParams.delete("lesson");
  return `${url.pathname}${url.search}`;
}

function showError(message) {
  $("error-area").textContent = message;
  $("error-area").hidden = !message;
}

function updateBluetoothStatus(info) {
  const supported = !!navigator.bluetooth;
  $("connect-cube").disabled = !supported || !info.ready || info.connecting;
  $("connect-cube").hidden = info.connected;
  $("disconnect-cube").hidden = !info.connected;
  $("sync-cube").hidden = !info.connected;
  $("sync-cube").disabled = !info.connected;
  let status = "Bluetooth nije povezan.";
  if (info.connected) status = `${info.name || "Kocka"}: ${info.synced ? "sinkronizirano" : "potrebna sinkronizacija"}`;
  else if (info.connecting) status = "Spajanje...";
  else if (!supported) status = "Bluetooth je dostupan u Chromeu/Chromiumu.";
  else if (!info.ready) status = "Bluetooth driver nije učitan.";
  $("bluetooth-status").textContent = status;
  $("bluetooth-hint").textContent = info.message || "";
}

function refreshSlides() {
  state.sections.forEach((section, index) => section.classList.toggle("is-current", index === state.slide));
  $("slide-controls").hidden = state.view !== "slides";
  $("previous-slide").disabled = state.slide === 0;
  $("next-slide").disabled = state.slide >= state.sections.length - 1;
  $("slide-progress").textContent = `${state.sections.length ? state.slide + 1 : 0} / ${state.sections.length}`;
  // In presentation mode the other sections are display:none; only mount visible viewers.
  cubes.mountSections();
}

function refreshModes() {
  for (const [id, active] of [
    ["scroll-mode", state.view === "scroll"],
    ["slides-mode", state.view === "slides"],
    ["animated-mode", state.cubeMode === "animated"],
    ["live-mode", state.cubeMode === "live"],
  ]) {
    const button = $(id);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  $("lesson-view").dataset.view = state.view;
  document.body.classList.toggle("lesson-presenting", state.view === "slides" && !$("lesson-view").hidden);
  $("device-controls").hidden = state.cubeMode !== "live" || !state.hasCubes;
  $("device-status").hidden = state.cubeMode !== "live" || !state.hasCubes;
  refreshSlides();
  cubes.setMode(state.cubeMode);
}

function setView(view) {
  if (!(["scroll", "slides"].includes(view)) || view === state.view) return;
  state.view = view;
  if (view === "scroll") {
    // Reading is for replaying the authored lesson algorithms. Keep the
    // Bluetooth connection and move history; only change the displayed mode.
    state.cubeMode = "animated";
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  refreshModes();
}

function stepSlide(delta) {
  const next = Math.max(0, Math.min(state.sections.length - 1, state.slide + delta));
  if (next === state.slide) return;
  state.slide = next;
  refreshSlides();
  // Keep the viewport fixed during slide changes.
}

function makeLessonCard(lesson, index) {
  const link = document.createElement("a");
  link.className = "lesson-card";
  link.href = lessonHref(lesson.slug);
  link.dataset.lessonLink = "";
  const number = document.createElement("span");
  number.className = "lesson-card-number";
  number.textContent = String(index + 1).padStart(2, "0");
  const title = document.createElement("h2");
  title.textContent = lesson.title;
  const description = document.createElement("p");
  description.textContent = lesson.description || "";
  const action = document.createElement("span");
  action.className = "lesson-card-action";
  action.textContent = "Otvori →";
  link.append(number, title, description, action);
  return link;
}

async function loadLessons() {
  if (!lessonsPromise) lessonsPromise = listLessons().catch((error) => { lessonsPromise = null; throw error; });
  return lessonsPromise;
}

function renderIndex(lessons) {
  cubes.clearSections();
  state.sections = [];
  state.hasCubes = false;
  state.view = "scroll";
  $("lesson-view").hidden = true;
  refreshModes();
  $("lesson-index").hidden = false;
  $("lesson-list").replaceChildren(...lessons.map(makeLessonCard));
  $("empty-lessons").hidden = lessons.length > 0;
  document.title = `${DISCIPLINE_TITLE} — Lekcije | Speedcubing Hrvatska`;
}

async function renderLesson(slug, lessons, request) {
  const lesson = await getLesson(slug);
  if (request !== routeRequest) return;
  if (!lesson) {
    renderIndex(lessons);
    showError("Lekcija nije pronađena ili još nije objavljena.");
    return;
  }

  cubes.clearSections();
  $("lesson-body").replaceChildren();
  $("lesson-title").textContent = lesson.title;
  $("stage-lesson-title").textContent = lesson.title;
  $("lesson-description").textContent = lesson.description || "";
  state.slide = 0;
  state.hasCubes = lesson.sections.some((section) => section.__component === "lesson.cube");
  $("cube-mode-controls").hidden = !state.hasCubes;

  if (state.hasCubes && !cubes.TwistyPlayer) {
    try { await cubes.preload(); }
    catch (error) { showError(`cubing.js: ${error.message}`); }
  }
  if (request !== routeRequest) return;

  const { fragment, sections } = renderSections(lesson.sections, cubes);
  state.sections = sections;
  $("lesson-body").append(fragment);
  $("lesson-index").hidden = true;
  $("lesson-view").hidden = false;
  $("back-to-lessons").href = lessonHref();

  const position = lessons.findIndex((item) => item.slug === slug);
  for (const [id, target, label] of [
    ["previous-lesson", lessons[position - 1], "←"],
    ["next-lesson", lessons[position + 1], "→"],
  ]) {
    const anchor = $(id);
    anchor.hidden = !target;
    if (target) {
      anchor.href = lessonHref(target.slug);
      anchor.textContent = `${label} ${target.title}`;
    }
  }
  $("empty-sections").hidden = sections.length > 0;
  refreshModes();
  document.title = `${lesson.title} | Speedcubing Hrvatska`;
}

async function showRoute() {
  const request = ++routeRequest;
  if (state.view === "slides") setView("scroll");
  // Opening another lesson always starts with the authored demonstrations.
  // The shared Bluetooth connection and its physical move history remain alive.
  state.cubeMode = "animated";
  showError("");
  $("loading").hidden = false;
  $("lesson-view").hidden = true;
  $("lesson-index").hidden = true;
  try {
    const lessons = await loadLessons();
    if (request !== routeRequest) return;
    const slug = new URLSearchParams(location.search).get("lesson");
    if (slug) await renderLesson(slug, lessons, request);
    else renderIndex(lessons);
  } catch (error) {
    if (request === routeRequest) {
      $("lesson-index").hidden = false;
      showError(`Učitavanje lekcija nije uspjelo: ${error.message}`);
    }
  } finally {
    if (request === routeRequest) $("loading").hidden = true;
  }
}

function navigate(link) {
  const url = new URL(link.href, location.href);
  history.pushState({}, "", `${url.pathname}${url.search}`);
  showRoute();
  window.scrollTo(0, 0);
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-lesson-link]");
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.origin !== location.origin) return;
  event.preventDefault();
  navigate(link);
});
window.addEventListener("popstate", showRoute);
$("scroll-mode").addEventListener("click", () => setView("scroll"));
$("slides-mode").addEventListener("click", () => setView("slides"));
$("exit-presentation").addEventListener("click", () => setView("scroll"));
$("animated-mode").addEventListener("click", () => { state.cubeMode = "animated"; refreshModes(); });
$("live-mode").addEventListener("click", () => { state.cubeMode = "live"; refreshModes(); });
$("previous-slide").addEventListener("click", () => stepSlide(-1));
$("next-slide").addEventListener("click", () => stepSlide(1));
$("connect-cube").addEventListener("click", async () => {
  try { await bluetooth.connect(); }
  catch (error) { $("bluetooth-hint").textContent = error.message; }
});
$("disconnect-cube").addEventListener("click", () => bluetooth.disconnect());
$("sync-cube").addEventListener("click", () => { cubes.syncSolved(); bluetooth.syncSolved(); });

const fullscreenButton = $("fullscreen-toggle");
fullscreenButton.hidden = !document.fullscreenEnabled;
function refreshFullscreen() {
  const enabled = document.fullscreenElement === $("lesson-view");
  fullscreenButton.textContent = enabled ? "Izađi iz cijelog zaslona" : "Cijeli zaslon";
  fullscreenButton.setAttribute("aria-label", fullscreenButton.textContent);
}
fullscreenButton.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $("lesson-view").requestFullscreen();
  } catch (error) { showError(`Cijeli zaslon nije dostupan: ${error.message}`); }
});
document.addEventListener("fullscreenchange", refreshFullscreen);

window.addEventListener("keydown", (event) => {
  if (state.view !== "slides" || $("lesson-view").hidden || event.altKey || event.ctrlKey || event.metaKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "") || document.activeElement?.isContentEditable) return;
  if (event.key === "Escape" && !document.fullscreenElement) setView("scroll");
  if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); stepSlide(1); }
  if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); stepSlide(-1); }
});

$("demo-indicator").hidden = !usingDemoData();
bluetooth.notify();
bluetooth.preload();
showRoute();
