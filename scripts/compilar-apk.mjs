// Compila el APK de depuración con el Gradle Wrapper del proyecto Android.
// Si JAVA_HOME o ANDROID_HOME no están definidos, usa el JDK incluido en Android Studio y el SDK
// en su ubicación habitual. Uso: npm run android:apk (antes ejecuta web:preparar y cap sync).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ANDROID = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'android');
const casa = os.homedir();
const primero = (rutas) => rutas.find((ruta) => ruta && existsSync(ruta));

const env = { ...process.env };
env.JAVA_HOME ||= primero([
  'C:\\Program Files\\Android\\Android Studio\\jbr',
  '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  '/opt/android-studio/jbr',
  path.join(casa, 'android-studio', 'jbr'),
]);
env.ANDROID_HOME ||= env.ANDROID_SDK_ROOT || primero([
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
  path.join(casa, 'Library', 'Android', 'sdk'),
  path.join(casa, 'Android', 'Sdk'),
]);
if (!env.JAVA_HOME) throw new Error('No se encontró un JDK. Instala Android Studio o define JAVA_HOME.');
if (!env.ANDROID_HOME && !existsSync(path.join(ANDROID, 'local.properties'))) {
  throw new Error('No se encontró el Android SDK. Abre el proyecto en Android Studio o define ANDROID_HOME.');
}

const windows = process.platform === 'win32';
// Ruta absoluta: algunos entornos Windows no buscan ejecutables en la carpeta actual.
const gradlew = path.join(ANDROID, windows ? 'gradlew.bat' : 'gradlew');
const resultado = spawnSync(windows ? `"${gradlew}"` : gradlew, ['assembleDebug'], {
  cwd: ANDROID, env, stdio: 'inherit', shell: windows,
});
if (resultado.status !== 0) process.exit(resultado.status ?? 1);
console.log(`\nAPK de depuración: ${path.join(ANDROID, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')}`);
