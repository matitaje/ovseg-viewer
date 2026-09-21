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
const rawToggle = document.getElementById("raw-toggle");
const rawLabel = document.getElementById("raw-label");
const copyLinkButton = document.getElementById("copy-link");
const infoText = document.getElementById("info-text");
const legendEl = document.getElementById("legend");

// Run e imagen viajan en el hash de la URL, para que un link compartido abra exactamente
// lo que el que lo mandó estaba mirando en vez del primer run y la primera imagen.
function readLocation() {
  const params = new URLSearchParams(location.hash.slice(1));
  return { run: params.get("run"), stem: params.get("img") };
}

function writeLocation() {
  const params = new URLSearchParams({ run: runSelect.value, img: imageSelect.value });
  // replaceState, no location.hash = ...: cambiar el hash directamente agrega una entrada
  // al historial por cada cambio de imagen, y el botón de atrás queda inutilizable.
  history.replaceState(null, "", `${location.pathname}#${params}`);
}

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

// Construye el tileSource "a mano" (sin fetch de un .dzi) -- ver notas en
// generate_viewer_tiles.py: un .dzi cacheado sin CORS por el CDN de GCS no se
// arregla actualizando metadata, solo esperando su TTL original. Como el layout de
// tiles es el estándar DeepZoom (mismo que pyvips.dzsave produce), alcanza con
// saber ancho/alto para reconstruirlo -- ver docs de OpenSeadragon, "Custom Tile
// Source": cualquier objeto con estas propiedades sirve, no hace falta la clase
// DziTileSource ni fetchear XML.
function makeTileSource(filesUrl, width, height, tileSize, overlap, extension) {
  return {
    width,
    height,
    tileSize,
    tileOverlap: overlap,
    minLevel: 0,
    maxLevel: Math.ceil(Math.log2(Math.max(width, height))),
    getTileUrl: function (level, x, y) {
      return `${filesUrl}/${level}/${x}_${y}.${extension}`;
    },
  };
}

function loadEntry() {
  const entry = currentEntry();
  if (!entry) return;
  writeLocation();

  infoText.textContent = `Paciente ${entry.patient_id} — ${entry.stem} — modelo ${runSelect.value}`;
  renderLegend(entry.class_labels);
  // La máscara previa al postproceso solo existe en runs que la guardaron.
  rawLabel.hidden = !entry.overlay_raw_files;
  if (!entry.overlay_raw_files) rawToggle.checked = false;

  if (viewer) {
    viewer.destroy();
    viewer = null;
  }

  const source = (files, ext) =>
    makeTileSource(gcsUrl(files), entry.width, entry.height, entry.tile_size, entry.overlap, ext);
  const overlays = [entry.overlay_files, entry.overlay_raw_files].filter(Boolean);

  viewer = OpenSeadragon({
    id: "viewer",
    prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.1/images/",
    tileSources: [source(entry.base_files, "jpg")],
    showNavigator: true,
    navigatorPosition: "BOTTOM_RIGHT",
    animationTime: 0.4,
    springStiffness: 8,
  });

  viewer.addHandler("open", () => {
    overlays.forEach((files, i) => {
      viewer.addTiledImage({ tileSource: source(files, "png"), opacity: 0, index: i + 1 });
    });
    // Las capas se agregan de forma asíncrona; recién cuando están todas se puede
    // decidir cuál mostrar.
    viewer.world.addHandler("add-item", updateOverlayOpacity);
    updateOverlayOpacity();
  });
}

// Con y sin postproceso son la misma predicción, así que se muestran de a una: la
// diferencia entre ambas es justamente lo que borró la limpieza de islas.
function updateOverlayOpacity() {
  if (!viewer) return;
  const opacity = overlayToggle.checked ? opacitySlider.value / 100 : 0;
  const wanted = rawToggle.checked && !rawLabel.hidden ? 2 : 1;
  for (let i = 1; i < viewer.world.getItemCount(); i++) {
    viewer.world.getItemAt(i).setOpacity(i === wanted ? opacity : 0);
  }
}

runSelect.addEventListener("change", () => {
  populateImages(runSelect.value);
  loadEntry();
});
imageSelect.addEventListener("change", loadEntry);
opacitySlider.addEventListener("input", updateOverlayOpacity);
overlayToggle.addEventListener("change", updateOverlayOpacity);
rawToggle.addEventListener("change", updateOverlayOpacity);
copyLinkButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(location.href);
  copyLinkButton.textContent = "¡Copiado!";
  setTimeout(() => (copyLinkButton.textContent = "Copiar link"), 1500);
});
// Pegar un link con otro hash en la misma pestaña no recarga la página.
window.addEventListener("hashchange", () => {
  const { run, stem } = readLocation();
  if (run && run !== runSelect.value) {
    runSelect.value = run;
    populateImages(run);
  }
  if (stem && stem !== imageSelect.value) imageSelect.value = stem;
  loadEntry();
});

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Pantalla de clave (ver config.js: barrera débil a propósito, el bucket sigue público).
// La sesión se recuerda mientras la pestaña viva, para no pedirla en cada recarga.
function unlock() {
  const expected = VIEWER_CONFIG.passwordSha256;
  if (!expected || sessionStorage.getItem("ovseg-viewer-unlocked") === expected) return Promise.resolve();
  const gate = document.getElementById("gate");
  const form = document.getElementById("gate-form");
  const input = document.getElementById("gate-input");
  const error = document.getElementById("gate-error");
  gate.hidden = false;
  return new Promise((resolve) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if ((await sha256Hex(input.value)) !== expected) {
        error.hidden = false;
        input.select();
        return;
      }
      try {
        sessionStorage.setItem("ovseg-viewer-unlocked", expected);
      } catch (err) {
        console.warn("sessionStorage no disponible, se pedirá la clave de nuevo", err);
      }
      gate.hidden = true;
      resolve();
    });
  });
}

(async function init() {
  try {
    await unlock();
    await loadManifest();
    populateRuns();
    const wanted = readLocation();
    if (wanted.run && manifest.runs[wanted.run]) runSelect.value = wanted.run;
    if (runSelect.value) {
      populateImages(runSelect.value);
      const images = manifest.runs[runSelect.value].images || [];
      if (wanted.stem && images.some((e) => e.stem === wanted.stem)) imageSelect.value = wanted.stem;
      loadEntry();
    } else {
      infoText.textContent = "No hay runs en el manifest todavía.";
    }
  } catch (err) {
    console.error(err);
  }
})();
