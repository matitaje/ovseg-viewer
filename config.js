// Público, sin autenticación (bucket dedicado y aislado del bucket de datos de
// entrenamiento -- ver README). Si el bucket cambia, este es el único lugar a tocar.
const VIEWER_CONFIG = {
  bucket: "digitalanalysis-ai-ovseg-viewer-tiles",
};

function gcsUrl(pathOrGsUri) {
  // Acepta tanto "gs://bucket/path" (como lo escribe generate_viewer_tiles.py en el
  // manifest) como un path relativo -- normaliza a la URL pública HTTPS.
  const prefix = `gs://${VIEWER_CONFIG.bucket}/`;
  const path = pathOrGsUri.startsWith(prefix) ? pathOrGsUri.slice(prefix.length) : pathOrGsUri;
  return `https://storage.googleapis.com/${VIEWER_CONFIG.bucket}/${path}`;
}
