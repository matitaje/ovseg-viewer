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
