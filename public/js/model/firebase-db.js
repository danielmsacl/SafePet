import { BASE_TOPIC } from '../config.js';

const cargarSDK = () => Promise.all([
  import('https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js'),
  import('https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js'),
]);

export function crearFirebase(config, { alEstado = () => {}, alDatos = () => {} } = {}, cargar = cargarSDK) {
  let preparada;
  return {
    conectar() {
      if (preparada) return preparada;
      preparada = (async () => {
        if (!config?.apiKey || !config?.databaseURL || !config?.projectId || !config?.appId) {
          throw new Error('Completa firebase-config.js con la configuración web de Firebase.');
        }
        alEstado('Conectando con Firebase…');
        const [appSDK, authSDK, dbSDK] = await cargar();
        const app = appSDK.initializeApp(config);
        const auth = authSDK.getAuth(app);
        await authSDK.setPersistence(auth, authSDK.browserLocalPersistence);
        await auth.authStateReady();
        const usuario = auth.currentUser ?? (await authSDK.signInAnonymously(auth)).user;
        const db = dbSDK.getDatabase(app);
        const ruta = `usuarios/${usuario.uid}/registros`;
        dbSDK.onValue(dbSDK.ref(db, '.info/connected'), (snap) => {
          alEstado(snap.val() ? 'Firebase conectado. Registro automático activo.'
            : 'Firebase sin conexión. No cierres la pestaña si hay registros pendientes.');
        });
        dbSDK.onValue(dbSDK.query(dbSDK.ref(db, ruta), dbSDK.orderByChild('fecha'), dbSDK.limitToLast(100)),
          (snap) => {
            const datos = [];
            snap.forEach((child) => datos.push({ ...child.val(), id: child.key }));
            alDatos(datos);
          }, () => alEstado('No se pudo leer el historial. Revisa las reglas de Firebase.'));
        return { dbSDK, db, ruta };
      })();
      return preparada;
    },
    async guardar({ id, fecha, ...datos }) {
      const { dbSDK, db, ruta } = await this.conectar();
      // Fecha de guardado del servidor; conservar aparte la recepción del navegador.
      await dbSDK.set(dbSDK.ref(db, `${ruta}/${id}`), {
        ...datos, dispositivo: BASE_TOPIC, recibidaEn: fecha, fecha: dbSDK.serverTimestamp(),
      });
    },
  };
}
