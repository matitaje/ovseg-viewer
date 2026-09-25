# ovseg-viewer

Visor web de predicciones para el proyecto [ovseg-ovarian-segmentation](https://github.com/matitaje/ovseg-ovarian-segmentation)
— pensado para que un médico pueda revisar visualmente las predicciones del modelo
sobre imágenes whole-slide completas, con zoom real, sin instalar nada ni loguearse.

Página estática (HTML/JS puro, [OpenSeadragon](https://openseadragon.github.io/) vía
CDN) — no hay backend. Todos los datos (tiles DeepZoom + `manifest.json`) viven en un
bucket de GCS público de solo lectura, generados por
[`scripts/generate_viewer_tiles.py`](https://github.com/matitaje/ovseg-ovarian-segmentation/blob/master/scripts/generate_viewer_tiles.py)
del repo principal.

## Cómo funciona

- `manifest.json` en la raíz del bucket lista, por `run_id` (el mismo identificador de
  `training_runs.md` en el repo principal), las imágenes con predicción disponible.
- Por imagen: una pirámide DeepZoom de la imagen original (`base.dzi` + `base_files/`)
  y otra del overlay de predicción coloreado semi-transparente (`overlay.dzi` +
  `overlay_files/`) — mismo esquema de color que el resto del proyecto (Tumor rojo,
  Stroma verde, NoTissue naranja, Background gris).
- El overlay se genera a partir de `pred_masks/<stem>.png`, la máscara cruda de
  predicción que `train.py` ya guarda como subproducto de cada run (mismo array que
  usa wandb para las `test_predictions`) — no requiere volver a correr el modelo.
  No usa el GeoJSON simplificado (`pseudo_geojson/`, que cada run también guarda) como
  fuente: ese GeoJSON existe para revisión/edición en QuPath, pero al simplificar
  polígonos (filtra regiones chicas, no encodea huecos) pierde detalle que sí está en
  la máscara cruda.
- `app.js` arma los selectores de run/imagen a partir del manifest, y controla opacidad
  del overlay con un slider.

## Configurar

Editar [`config.js`](config.js) si el bucket cambia de nombre. Nada más necesita
configuración — es una página estática.

## Generar/actualizar los tiles de un run

`scripts/generate_viewer_tiles.py` solo decodifica un PNG y tilea con `pyvips` — no
necesita `torch` ni GPU, así que corre en la imagen liviana de dataprep (CPU-only)
como Vertex AI job. Desde el repo principal (`ovseg-ovarian-segmentation`):

```bash
gcloud ai custom-jobs create --region=europe-west4 --project=digitalanalysis-ai \
  --display-name=ovseg-viewer-tiles-runNNN \
  --config=configs/vertex_jobs/generate_viewer_tiles.yaml
```

Editar `--run-id` dentro del yaml para apuntar al run deseado. Requiere que `runNNN`
ya haya terminado de entrenar y haya subido `pred_masks/` (agregado a partir de
run018 -- runs anteriores solo tienen `pseudo_geojson/` y necesitarían la versión
anterior del script, que sí re-corría inferencia).

## Deploy

Cualquier hosting estático sirve (GitHub Pages, Vercel, Netlify) — no hay build step,
son 4 archivos (`index.html`, `app.js`, `config.js`, `style.css`). Para GitHub Pages:
Settings → Pages → Deploy from branch → `master` / `/ (root)`.

## Trabajo futuro: escalar a las 2500 imágenes del dataset completo

El proyecto principal armó un pipeline de inferencia batch sobre las 2501 imágenes del
dataset completo (`scripts/run_inference_batch.py` + `scripts/launch_full_dataset_inference.sh`
en `ovseg-ovarian-segmentation`, para reproducir el análisis de invasión que antes se
hacía con Aiforia). Ese pipeline ya sube un thumbnail-overlay PNG por imagen (gratis,
subproducto de la inferencia), pero **deliberadamente no** los publica en este bucket
público: hoy el visor expone 13-24 imágenes de QA por run detrás de una clave débil
(ver `config.js`) — extenderlo a las 2500 imágenes de todos los pacientes del dataset
es un salto de exposición mucho mayor, y quedó pendiente de decisión explícita antes de
hacerlo (no es un default, hay que pedirlo).

Cuando se retome, dos cosas quedaron pendientes de resolver juntas, no por separado:

1. **Seguridad**: la clave débil actual (SHA-256 hardcodeado en `config.js`, bucket
   sigue público igual) alcanza para 13-24 imágenes de QA compartidas informalmente,
   pero no para el dataset completo de pacientes reales. Antes de publicar 2500
   imágenes hace falta algo más serio que eso — a definir (auth real, bucket privado +
   proxy autenticado, etc.), no simplemente subir el volumen con el mismo gate de hoy.

2. **UX para navegar 2500 imágenes** (el selector `<select>` actual de `app.js`/`index.html`
   no escala a ese volumen):
   - Buscador/filtro (por paciente, por stem, por run)
   - Navegación con flechas de teclado (anterior/siguiente)
   - Carrusel de miniaturas para saltar rápido a imágenes cercanas
   - Orden alfabético (o por paciente) además del orden actual

No hay diseño ni implementación de esto todavía — queda como el punto de partida para
cuando se decida seguir.
