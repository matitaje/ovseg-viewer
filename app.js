// Paleta compartida con src/ovseg/data/geojson_to_mask.py (OVERLAY_COLORS) -- si esa
// cambia, actualizar acá también (no hay forma automática de compartirla entre
// Python y este JS estático).
const CLASS_COLORS = {
  Tumor: "rgb(200, 0, 0)",
  Stroma: "rgb(0, 150, 0)",
  NoTissue: "rgb(0, 165, 255)",
  Background: "rgb(120, 120, 120)",
};

let manifest = null;
let viewer = null;

const runSelect = document.getElementById("run-select");
const imageSelect = document.getElementById("image-select");
const opacitySlider = document.getElementById("opacity-slider");
const overlayToggle = document.getElementById("overlay-toggle");
const infoText = document.getElementById("info-text");
const legendEl = document.getElementById("legend");

async function loadManifest() {
  // Cache-busting query param: GCS/CDN edge caching happens server-side and isn't
  // affected by fetch's own {cache: "no-store"} (that only controls the browser's
  // local cache) -- found in practice, a CORS config change took ~17 min to actually
  // show up because the old (no-CORS-header) response was still being served from cache.
  const res = await fetch(`${gcsUrl("manifest.json")}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) {
    infoText.textContent = `No se pudo cargar manifest.json (HTTP ${res.status}). ¿El bucket es público?`;
    throw new Error(`manifest fetch failed: ${res.status}`);
  }
  manifest = await res.json();
}

function populateRuns() {
  const runIds = Object.keys(manifest.runs || {}).sort();
  runSelect.innerHTML = "";
  for (const runId of runIds) {
    const opt = document.createElement("option");
    opt.value = runId;
    opt.textContent = runId;
    runSelect.appendChild(opt);
  }
}

function populateImages(runId) {
  const images = (manifest.runs[runId] && manifest.runs[runId].images) || [];
  images.sort((a, b) => a.stem.localeCompare(b.stem));
  imageSelect.innerHTML = "";
  for (const entry of images) {
    const opt = document.createElement("option");
    opt.value = entry.stem;
    opt.textContent = `${entry.patient_id} — ${entry.stem}`;
    imageSelect.appendChild(opt);
  }
}

function currentEntry() {
  const runId = runSelect.value;
  const stem = imageSelect.value;
  return (manifest.runs[runId].images || []).find((e) => e.stem === stem);
}

function renderLegend(classLabels) {
  legendEl.innerHTML = "";
  const names = classLabels ? Object.values(classLabels).filter((n) => n !== "Ignore") : Object.keys(CLASS_COLORS);
  for (const name of names) {
    const span = document.createElement("span");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = CLASS_COLORS[name] || "#888";
    span.appendChild(swatch);
    span.appendChild(document.createTextNode(name));
    legendEl.appendChild(span);
  }
}

function loadEntry() {
  const entry = currentEntry();
  if (!entry) return;

  infoText.textContent = `Paciente ${entry.patient_id} — ${entry.stem} — modelo ${runSelect.value}`;
  renderLegend(entry.class_labels);

  if (viewer) {
    viewer.destroy();
    viewer = null;
  }

  viewer = OpenSeadragon({
    id: "viewer",
    prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.1/images/",
    tileSources: [gcsUrl(entry.base_dzi)],
    showNavigator: true,
    navigatorPosition: "BOTTOM_RIGHT",
    animationTime: 0.4,
    springStiffness: 8,
  });

  viewer.addHandler("open", () => {
    viewer.addTiledImage({
      tileSource: gcsUrl(entry.overlay_dzi),
      opacity: overlayToggle.checked ? opacitySlider.value / 100 : 0,
      index: 1,
    });
  });
}

function updateOverlayOpacity() {
  if (!viewer || viewer.world.getItemCount() < 2) return;
  const overlay = viewer.world.getItemAt(1);
  overlay.setOpacity(overlayToggle.checked ? opacitySlider.value / 100 : 0);
}

runSelect.addEventListener("change", () => {
  populateImages(runSelect.value);
  loadEntry();
});
imageSelect.addEventListener("change", loadEntry);
opacitySlider.addEventListener("input", updateOverlayOpacity);
overlayToggle.addEventListener("change", updateOverlayOpacity);

(async function init() {
  try {
    await loadManifest();
    populateRuns();
    if (runSelect.value) {
      populateImages(runSelect.value);
      loadEntry();
    } else {
      infoText.textContent = "No hay runs en el manifest todavía.";
    }
  } catch (err) {
    console.error(err);
  }
})();
