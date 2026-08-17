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
- El overlay se resuelve rasterizando el GeoJSON que cada training run ya guarda como
  subproducto (respeta el orden de prioridad correcto entre clases superpuestas) — no
  es una reconstrucción de polígonos ambigua como se ve al abrir el mismo GeoJSON en
  QuPath.
- `app.js` arma los selectores de run/imagen a partir del manifest, y controla opacidad
  del overlay con un slider.

## Configurar

Editar [`config.js`](config.js) si el bucket cambia de nombre. Nada más necesita
configuración — es una página estática.

## Generar/actualizar los tiles de un run

Desde el repo principal (`ovseg-ovarian-segmentation`):

```bash
docker build -f docker/Dockerfile.dataprep -t ovseg-dataprep .
docker run --rm \
  -v ~/.config/gcloud:/root/.config/gcloud \
  -v "$(pwd)/src:/app/src:ro" -v "$(pwd)/scripts:/app/scripts:ro" \
  --entrypoint python ovseg-dataprep scripts/generate_viewer_tiles.py --run-id runNNN
```

Requiere que `runNNN` ya haya terminado de entrenar (necesita el `pseudo_geojson/` que
`train.py` sube como subproducto al finalizar).

## Deploy

Cualquier hosting estático sirve (GitHub Pages, Vercel, Netlify) — no hay build step,
son 4 archivos (`index.html`, `app.js`, `config.js`, `style.css`). Para GitHub Pages:
Settings → Pages → Deploy from branch → `master` / `/ (root)`.
