// Estado de un actuador. Separa lo confirmado por el Arduino de lo solicitado desde la web.
//   estado:     último estado informado por el Arduino (true/false) o null si es desconocido.
//   solicitado: último estado pedido; decide la próxima orden mientras el estado es desconocido.
//   pendiente:  destino de la orden enviada y aún no confirmada, o null.
//   recibido:   instante del último mensaje de estado, para detectar silencio del Arduino.
export function crearActuador(nombre) {
  const prendido = `${nombre}_prendido`;
  const apagado = `${nombre}_apagado`;
  return {
    nombre,
    estado: null,
    solicitado: false,
    pendiente: null,
    recibido: null,

    // Prepara la orden contraria al estado conocido y la deja pendiente de confirmación.
    solicitar() {
      const destino = !(this.estado ?? this.solicitado);
      this.pendiente = destino;
      this.solicitado = destino;
      return `${destino ? 'prender' : 'apagar'}_${nombre}`;
    },

    // Aplica un mensaje de estado. Devuelve null si el mensaje no pertenece al contrato.
    recibirEstado(mensaje, ahora) {
      if (mensaje !== prendido && mensaje !== apagado) return null;
      const nuevo = mensaje === prendido;
      const cambio = this.estado !== nuevo;
      // Solo el estado esperado confirma la orden; un estado opuesto no la resuelve.
      const confirma = this.pendiente === nuevo;
      if (confirma || this.pendiente === null) this.solicitado = nuevo;
      this.estado = nuevo;
      this.recibido = ahora;
      if (confirma) this.pendiente = null;
      return { encendido: nuevo, cambio, confirma };
    },

    // Abandona la orden en curso sin suponer el resultado.
    cancelarPendiente() {
      this.pendiente = null;
    },

    // Estado desconocido: no se asume encendido ni apagado.
    olvidar() {
      this.pendiente = null;
      this.estado = null;
      this.recibido = null;
    },

    sinRespuesta(ahora, limite) {
      return this.recibido !== null && ahora - this.recibido > limite;
    },
  };
}
