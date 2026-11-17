import test from 'node:test';
import assert from 'node:assert/strict';
import { crearActuador } from '../public/js/models/actuador.js';
import { crearAmbiente, interpretarMedicion, medicionValida } from '../public/js/models/mediciones.js';

test('actuador: estado confirmado y solicitado se mantienen separados', () => {
  const led = crearActuador('led');
  assert.equal(led.estado, null);
  assert.equal(led.solicitar(), 'prender_led'); // desconocido: se usa lo solicitado (apagado)
  assert.equal(led.pendiente, true);
  assert.equal(led.estado, null); // pedir no confirma
  assert.deepEqual(led.recibirEstado('led_apagado', 10), { encendido: false, cambio: true, confirma: false });
  assert.equal(led.pendiente, true); // el estado opuesto no resuelve la orden
  assert.equal(led.solicitado, true);
  assert.deepEqual(led.recibirEstado('led_prendido', 20), { encendido: true, cambio: true, confirma: true });
  assert.equal(led.pendiente, null);
  assert.equal(led.recibirEstado('ventilador_prendido', 30), null);
  assert.equal(led.recibirEstado('basura', 30), null);
  assert.equal(led.recibido, 20);
});

test('actuador: estado periódico repetido no es un cambio y el silencio se detecta', () => {
  const motor = crearActuador('ventilador');
  motor.recibirEstado('ventilador_prendido', 0);
  assert.equal(motor.recibirEstado('ventilador_prendido', 5000).cambio, false);
  assert.equal(motor.sinRespuesta(21000, 16000), false);
  assert.equal(motor.sinRespuesta(21001, 16000), true);
  motor.olvidar();
  assert.equal(motor.estado, null);
  assert.equal(motor.sinRespuesta(99999, 16000), false);
  assert.equal(motor.solicitar(), 'apagar_ventilador'); // conserva lo último pedido/confirmado
});

test('mediciones: una sola regla de validación y datos antiguos', () => {
  assert.deepEqual(interpretarMedicion('{"temperatura":26.4,"humedad":58,"extra":1}'), { temperatura: 26.4, humedad: 58 });
  for (const malo of ['{', 'null', '[]', '{"temperatura":"26","humedad":58}', '{"temperatura":81,"humedad":50}',
    '{"temperatura":20,"humedad":-1}', '{"temperatura":null,"humedad":50}']) {
    assert.equal(interpretarMedicion(malo), null, malo);
  }
  assert.equal(medicionValida({ temperatura: -40, humedad: 100 }), true);
  const ambiente = crearAmbiente();
  assert.equal(ambiente.esAntigua(100000, 16000), false); // sin lectura no hay dato antiguo
  ambiente.registrar({ temperatura: 20, humedad: 40 }, 1000);
  assert.equal(ambiente.esAntigua(17000, 16000), false);
  assert.equal(ambiente.esAntigua(17001, 16000), true);
  ambiente.marcarError();
  assert.equal(ambiente.valores, null);
  assert.equal(ambiente.error, true);
});

test('enlace con el Arduino: sin datos, activo y silencioso', async () => {
  const { crearEnlaceDispositivo } = await import('../public/js/models/dispositivo.js');
  const enlace = crearEnlaceDispositivo();
  assert.equal(enlace.estado(0, 16000), 'sin_datos');
  enlace.registrar(1000);
  assert.equal(enlace.estado(17000, 16000), 'activo');
  assert.equal(enlace.estado(17001, 16000), 'silencioso');
  enlace.olvidar();
  assert.equal(enlace.estado(17001, 16000), 'sin_datos');
});
