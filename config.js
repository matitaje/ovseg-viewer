// Bucket dedicado y aislado del bucket de datos de entrenamiento (ver README). Si el
// bucket cambia, este es el único lugar a tocar.
//
// `passwordSha256` pone una pantalla de clave antes del visor. Es a propósito una
// barrera débil: el bucket sigue siendo público, así que cualquiera con la URL de un
// tile la puede leer sin pasar por acá. Sirve para que el link se pueda compartir en el
// grupo sin quedar abierto a cualquiera que lo encuentre, no para proteger los datos.
// Para cambiarla, pegar en la consola del navegador:
//   crypto.subtle.digest("SHA-256", new TextEncoder().encode("LA-CLAVE"))
//     .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,"0")).join("")))
// Dejar en null para sacar la pantalla de clave.
const VIEWER_CONFIG = {
  bucket: "digitalanalysis-ai-ovseg-viewer-tiles",
  passwordSha256: "f1c627fc27b15019a05e6ba867f7836a6eef7647fedbb3913d8f22cf25794d41",
};

function gcsUrl(pathOrGsUri) {
  // Acepta tanto "gs://bucket/path" (como lo escribe generate_viewer_tiles.py en el
  // manifest) como un path relativo -- normaliza a la URL pública HTTPS.
  const prefix = `gs://${VIEWER_CONFIG.bucket}/`;
  const path = pathOrGsUri.startsWith(prefix) ? pathOrGsUri.slice(prefix.length) : pathOrGsUri;
  // Los nombres de archivo originales tienen espacios y otros caracteres sin escapar
  // (ej. "...Image Export-30_s4c...") -- sin encodeURIComponent por segmento,
  // OpenSeadragon fallaba al pedir el .dzi con "HTTP 0" (URL mal formada).
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://storage.googleapis.com/${VIEWER_CONFIG.bucket}/${encodedPath}`;
}
