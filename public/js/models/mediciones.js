// Reglas de las mediciones del DHT22. Única definición del rango aceptado.
export function medicionValida(datos) {
  return Number.isFinite(datos?.temperatura) && Number.isFinite(datos?.humedad)
    && datos.temperatura >= -40 && datos.temperatura <= 80
    && datos.humedad >= 0 && datos.humedad <= 100;
}

// Convierte el texto JSON recibido por MQTT; devuelve null si no es una medición válida.
export function interpretarMedicion(texto) {
  try {
    const datos = JSON.parse(texto);
    return medicionValida(datos) ? { temperatura: datos.temperatura, humedad: datos.humedad } : null;
  } catch {
    return null;
  }
}

// Última medición recibida en esta sesión. No inventa valores: sin lectura, `valores` es null.
export function crearAmbiente() {
  return {
    valores: null,
    recibida: null,
    error: false,
    registrar(valores, ahora) {
      this.valores = valores;
      this.recibida = ahora;
      this.error = false;
    },
    marcarError() {
      this.valores = null;
      this.recibida = null;
      this.error = true;
    },
    reiniciar() {
      this.valores = null;
      this.recibida = null;
      this.error = false;
    },
    esAntigua(ahora, limite) {
      return this.recibida !== null && ahora - this.recibida > limite;
    },
  };
}
