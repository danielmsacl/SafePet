// Prepara www/, la carpeta de recursos web que Capacitor empaqueta en la app Android.
// La fuente única sigue siendo la raíz del repositorio (la misma que publica GitHub Pages).
// Solo se copia la lista explícita de abajo; firmware, pruebas, documentos, herramientas y
// dependencias quedan fuera. Uso: npm run web:preparar
import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(RAIZ, 'www');

// Archivos que necesita la interfaz. De public/js se copian únicamente módulos .js.
const ARCHIVOS = [
  'index.html',
  'public/css/styles.css',
  'public/img/petsafe-logo.webp',
  'public/img/petsafe-icono-64.png',
];
const CARPETAS_JS = ['public/js'];

async function listarJs(carpeta) {
  const salida = [];
  for (const entrada of await readdir(path.join(RAIZ, carpeta), { withFileTypes: true })) {
    const relativa = `${carpeta}/${entrada.name}`;
    if (entrada.isDirectory()) salida.push(...await listarJs(relativa));
    else if (entrada.name.endsWith('.js')) salida.push(relativa);
  }
  return salida;
}

// Comprueba que toda referencia local del HTML y todo import relativo exista en la copia.
async function verificarReferencias(copiados) {
  const presentes = new Set(copiados);
  const faltan = [];
  const html = await readFile(path.join(DESTINO, 'index.html'), 'utf8');
  for (const [, ruta] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (!/^[a-z]+:/i.test(ruta) && !presentes.has(ruta)) faltan.push(`index.html → ${ruta}`);
  }
  for (const archivo of copiados.filter((ruta) => ruta.endsWith('.js'))) {
    const codigo = await readFile(path.join(DESTINO, archivo), 'utf8');
    for (const [, ruta] of codigo.matchAll(/(?:from|import\()\s*'(\.{1,2}\/[^']+)'/g)) {
      const destino = path.posix.normalize(path.posix.join(path.posix.dirname(archivo), ruta));
      if (!presentes.has(destino)) faltan.push(`${archivo} → ${ruta}`);
    }
  }
  if (faltan.length) throw new Error(`Referencias sin copiar:\n  ${faltan.join('\n  ')}`);
}

// Borra solo la carpeta generada www/ dentro del repositorio.
if (path.basename(DESTINO) !== 'www' || path.dirname(DESTINO) !== RAIZ) throw new Error('Destino inesperado');
await rm(DESTINO, { recursive: true, force: true });

const copiados = [...ARCHIVOS];
for (const carpeta of CARPETAS_JS) copiados.push(...await listarJs(carpeta));
let bytes = 0;
for (const archivo of copiados) {
  const origen = path.join(RAIZ, archivo);
  bytes += (await stat(origen)).size;
  await mkdir(path.dirname(path.join(DESTINO, archivo)), { recursive: true });
  await cp(origen, path.join(DESTINO, archivo));
}
await verificarReferencias(copiados);
console.log(`www/ preparado: ${copiados.length} archivos, ${(bytes / 1024).toFixed(1)} KB.`);
