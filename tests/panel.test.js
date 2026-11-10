import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { iniciarPanel } from '../public/js/main.js';
import { BASE_TOPIC } from '../public/js/config.js';

function escenario(historial = null) {
  let tiempo = 0;
  let secuencia = 0;
  const timers = new Map();
  const reloj = {
    setTimeout(fn, ms) { const id = ++secuencia; timers.set(id, { fn, fin: tiempo + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, ms) { const id = ++secuencia; timers.set(id, { fn, fin: tiempo + ms, ms }); return id; },
  };
  const nodos = new Map();
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
    const handlers = {};
    nodos.set(id, {
      textContent: '', disabled: false, attrs: {}, clases: new Set(),
      addEventListener(nombre, fn) { handlers[nombre] = fn; },
      setAttribute(nombre, valor) { this.attrs[nombre] = valor; },
      click() { if (!this.disabled) handlers.click?.(); },
    });
    const nodo = nodos.get(id);
    nodo.classList = { toggle(clase, activo) { activo ? nodo.clases.add(clase) : nodo.clases.delete(clase); } };
  }
  const callbacks = {};
  const enviados = [];
  const cliente = {
    listo: false, fallo: false,
    suscribir(topic, fn) { callbacks[topic] = fn; },
    conectar(fn) { this.estado = fn; },
    publicar(topic, mensaje, alError) {
      if (!this.listo) return false;
      if (this.fallo) alError?.(new Error('fallo de red'));
      else enviados.push({ topic, mensaje });
      return true;
    },
  };
  iniciarPanel({ cliente, historial, doc: { getElementById: (id) => {
    assert.ok(nodos.has(id), `El HTML debe contener ${id}`);
    return nodos.get(id);
  } }, reloj, ahora: () => tiempo });
  return {
    nodo: (id) => nodos.get(id), cliente, enviados,
    conectar(listo = true) { cliente.listo = listo; cliente.estado(listo, listo ? 'MQTT conectado' : 'Desconectado'); },
    recibir(sufijo, mensaje) { callbacks[`${BASE_TOPIC}/${sufijo}`](mensaje); },
    avanzar(ms) {
      const fin = tiempo + ms;
      while (true) {
        const proximo = [...timers].filter(([, t]) => t.fin <= fin).sort((a, b) => a[1].fin - b[1].fin)[0];
        if (!proximo) break;
        const [id, timer] = proximo;
        tiempo = timer.fin;
        if (timer.ms) timer.fin += timer.ms;
        else timers.delete(id);
        timer.fn();
      }
      tiempo = fin;
    },
  };
}

test('permite enviar sin Arduino una vez conectado al broker, sin fingir confirmación', () => {
  const s = escenario();
  assert.equal(s.nodo('btn-led').disabled, true);
  s.conectar();
  assert.deepEqual(s.enviados, [{ topic: `${BASE_TOPIC}/consulta`, mensaje: 'consultar_estado' }]);
  assert.equal(s.nodo('btn-led').disabled, false);
  s.recibir('led/estado', 'basura');
  s.nodo('btn-led').click();
  assert.equal(s.enviados.at(-1).mensaje, 'prender_led');
  assert.equal(s.nodo('btn-led').attrs['aria-pressed'], 'false');
  s.avanzar(7000);
  s.nodo('btn-led').click();
  assert.equal(s.enviados.at(-1).mensaje, 'apagar_led');
});

for (const nombre of ['led', 'ventilador']) {
  test(`${nombre}: solo la respuesta esperada confirma encendido y apagado`, () => {
    const s = escenario();
    s.conectar();
    s.recibir(`${nombre}/estado`, `${nombre}_apagado`);
    const boton = s.nodo(`btn-${nombre}`);
    boton.click();
    assert.equal(s.enviados.at(-1).mensaje, `prender_${nombre}`);
    assert.equal(s.enviados.at(-1).topic, `${BASE_TOPIC}/${nombre}`);
    assert.equal(boton.attrs['aria-pressed'], 'false');
    assert.equal(boton.disabled, true);
    boton.click();
    assert.equal(s.enviados.length, 2); // consulta + una orden
    s.recibir(`${nombre}/estado`, `${nombre}_apagado`);
    assert.equal(boton.disabled, true); // un estado opuesto no confirma la orden
    s.recibir(`${nombre}/estado`, `${nombre}_prendido`);
    assert.equal(boton.attrs['aria-pressed'], 'true');
    assert.equal(boton.disabled, false);
    boton.click();
    assert.equal(s.enviados.at(-1).mensaje, `apagar_${nombre}`);
    s.recibir(`${nombre}/estado`, `${nombre}_apagado`);
    s.avanzar(8000);
    assert.equal(boton.disabled, false); // el timeout anterior quedó cancelado
    assert.equal(boton.attrs['aria-pressed'], 'false');
  });
}

test('timeout deja estado desconocido; consultar recupera sin repetir la orden', () => {
  const s = escenario(); s.conectar(); s.recibir('led/estado', 'led_apagado');
  s.nodo('btn-led').click(); s.avanzar(7000);
  assert.equal(s.nodo('btn-led').disabled, false);
  assert.match(s.nodo('estado-led').textContent, /Sin confirmación/);
  s.nodo('btn-consultar').click();
  assert.equal(s.enviados.at(-1).mensaje, 'consultar_estado');
  s.recibir('led/estado', 'led_prendido');
  assert.equal(s.nodo('btn-led').disabled, false);
  assert.equal(s.nodo('btn-led').attrs['aria-pressed'], 'true');
});

test('desconexión cancela orden pendiente y exige un estado nuevo al reconectar', () => {
  const s = escenario(); s.conectar(); s.recibir('led/estado', 'led_apagado');
  s.nodo('btn-led').click(); s.conectar(false); s.avanzar(8000);
  assert.equal(s.nodo('btn-led').disabled, true);
  assert.doesNotMatch(s.nodo('registro').textContent, /Sin confirmación/);
  s.recibir('led/estado', 'led_prendido');
  assert.equal(s.nodo('btn-led').disabled, true);
  s.conectar();
  assert.equal(s.nodo('btn-led').disabled, false);
  s.recibir('led/estado', 'led_apagado');
  assert.equal(s.nodo('btn-led').disabled, false);
});

test('Arduino silencioso informa estado desconocido pero permite enviar órdenes', () => {
  const s = escenario(); s.conectar(); s.recibir('led/estado', 'led_apagado');
  s.avanzar(17000);
  assert.equal(s.nodo('btn-led').disabled, false);
  assert.match(s.nodo('estado-led').textContent, /Arduino sin respuesta/);
});

test('valida sensores, marca lectura antigua y muestra fallo DHT22', () => {
  const s = escenario(); s.conectar();
  s.recibir('sensores', '{"temperatura":26.4,"humedad":58}');
  assert.equal(s.nodo('temperatura').textContent, '26.4 °C');
  for (const malo of ['{', 'null', '{"temperatura":"26","humedad":58}', '{"temperatura":26,"humedad":101}']) {
    s.recibir('sensores', malo);
  }
  assert.equal(s.nodo('temperatura').textContent, '26.4 °C');
  s.avanzar(17000);
  assert.match(s.nodo('estado-sensor').textContent, /Lectura antigua/);
  s.recibir('sensor/estado', 'error_dht22');
  assert.equal(s.nodo('temperatura').textContent, '—');
  assert.match(s.nodo('estado-sensor').textContent, /Error de lectura/);
  s.recibir('sensores', '{"temperatura":25,"humedad":50}');
  assert.equal(s.nodo('humedad').textContent, '50.0 %');
});

test('un fallo de publicación no deja un botón aparentemente confirmado', () => {
  const s = escenario(); s.conectar(); s.recibir('led/estado', 'led_apagado');
  s.cliente.fallo = true; s.nodo('btn-led').click();
  assert.equal(s.nodo('btn-led').disabled, false);
  assert.match(s.nodo('estado-led').textContent, /No se pudo enviar/);
});

test('guarda eventos y mediciones recibidos, nunca clics, consultas ni estados periódicos', () => {
  const eventos = [], mediciones = [];
  const s = escenario({ evento: (dato) => eventos.push(dato), medicion: (dato) => mediciones.push(dato) });
  s.conectar(); s.recibir('led/estado', 'led_apagado');
  s.nodo('btn-led').click();
  s.recibir('led/estado', 'led_prendido');
  s.recibir('led/estado', 'led_prendido');
  s.nodo('btn-consultar').click();
  assert.deepEqual(eventos, []);
  s.recibir('eventos', 'led_prendido');
  assert.deepEqual(eventos, ['led_prendido']);
  s.recibir('sensores', '{"temperatura":24.5,"humedad":62}');
  s.avanzar(10000); // pasar tiempo no genera una copia de una lectura antigua
  s.recibir('sensores', '{"temperatura":"error","humedad":62}');
  assert.deepEqual(mediciones, [{ temperatura: 24.5, humedad: 62 }]);
  s.conectar(false); s.recibir('eventos', 'led_apagado');
  assert.equal(eventos.length, 1);
});
