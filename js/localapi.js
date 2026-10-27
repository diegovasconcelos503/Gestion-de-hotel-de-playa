/* =====================================================================
   HOTEL COSTA DEL SOL · Base de datos local (reemplaza PHP + SQL Server)
   ---------------------------------------------------------------------
   No necesita servidor, extensiones ni instalar nada: los datos se guardan
   en el almacenamiento del navegador (localStorage) y esta capa responde a
   las MISMAS rutas que tenía la API PHP (/rooms/availability, /reservations,
   /admin/...). Cada petición lee la base, valida, modifica y guarda de forma
   síncrona, por lo que dos reservas nunca pueden "pisarse" (anti-sobreventa).
   Las contraseñas se guardan con sal + SHA-256 (nunca en texto plano).
   ===================================================================== */
window.LocalAPI = (() => {
  'use strict';
  const KEY = 'cds_db_v1', K_CLI = 'cds_sesion_cliente', K_ADM = 'cds_sesion_admin', K_FAIL = 'cds_fallos_';
  const MAX_NOCHES = 30, MAX_NOCHES_ADMIN = 120;
  const ESTADOS = ['Pendiente', 'Confirmada', 'Cancelada'];

  /* ------------------------- Almacenamiento seguro ------------------------- */
  const mem = {};
  const mk = (kind) => ({
    get(k) { try { const v = window[kind].getItem(k); return v === null ? (mem[kind + k] ?? null) : v; } catch { return mem[kind + k] ?? null; } },
    set(k, v) { try { window[kind].setItem(k, v); delete mem[kind + k]; } catch { mem[kind + k] = v; } },
    del(k) { try { window[kind].removeItem(k); } catch { /* */ } delete mem[kind + k]; },
  });
  const disco = mk('localStorage'), sesion = mk('sessionStorage');

  /* ------------------------------- SHA-256 ------------------------------- */
  function sha256(msg) {
    const b = new TextEncoder().encode(msg), P = [];
    for (let c = 2; P.length < 64; c++) if (P.every((p) => c % p)) P.push(c);
    const fr = (x) => ((x - Math.floor(x)) * 4294967296) | 0;
    const K = P.map((p) => fr(Math.cbrt(p)));
    const H = P.slice(0, 8).map((p) => fr(Math.sqrt(p)));
    const len = b.length, tot = (((len + 9 + 63) >> 6) << 6), m = new Uint8Array(tot);
    m.set(b); m[len] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(tot - 8, Math.floor((len * 8) / 4294967296)); dv.setUint32(tot - 4, (len * 8) >>> 0);
    const rr = (x, n) => (x >>> n) | (x << (32 - n)), w = new Array(64);
    for (let o = 0; o < tot; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, bb, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      [a, bb, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) | 0; });
    }
    return H.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
  }
  const salt = () => Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const hashPass = (pw) => { const s = salt(); return s + '$' + sha256(s + pw); };
  const checkPass = (pw, stored) => { const [s, h] = String(stored || '').split('$'); return !!h && sha256(s + pw) === h; };

  /* ------------------------------- Fechas ------------------------------- */
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hoy = () => iso(new Date());
  const sumar = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  const noches = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  const ahora = () => { const d = new Date(); return `${iso(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  /* ------------------------------ Errores ------------------------------ */
  const fail = (status, message, errors) => { const e = new Error(message); e.isApi = true; e.status = status; e.errors = errors || {}; throw e; };

  /* ---------------------------- Validaciones ---------------------------- */
  const V = {
    texto(v, campo, min, max) {
      const s = String(v ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim(), n = [...s].length;
      if (n < min || n > max) fail(422, `El campo «${campo}» debe tener entre ${min} y ${max} caracteres.`, { [campo]: 'Longitud inválida' });
      return s;
    },
    textoOpc(v, campo, max) { const s = String(v ?? '').trim(); return s === '' ? null : V.texto(s, campo, 1, max); },
    email(v) {
      const s = String(v ?? '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) || s.length > 100) fail(422, 'El correo electrónico no es válido.', { email: 'Correo inválido' });
      return s;
    },
    telefono(v) {
      const s = String(v ?? '').trim(); if (!s) return null;
      if (!/^[0-9+\-\s()]{7,20}$/.test(s)) fail(422, 'El teléfono no es válido.', { telefono: 'Teléfono inválido' });
      return s;
    },
    password(v) {
      const s = String(v ?? '');
      if (s.length < 8 || s.length > 72 || !/[A-Za-z]/.test(s) || !/\d/.test(s)) fail(422, 'La contraseña debe tener de 8 a 72 caracteres, con letras y números.', { password: 'Contraseña débil' });
      return s;
    },
    fecha(v, campo) {
      const s = String(v ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || iso(new Date(s + 'T00:00:00')) !== s) fail(422, `La fecha de «${campo}» no es válida.`, { [campo]: 'Fecha inválida' });
      return s;
    },
    entero(v, campo, min, max) {
      const n = Number(v);
      if (v === null || v === '' || v === undefined || !Number.isInteger(n) || n < min || n > max) fail(422, `El campo «${campo}» debe ser un número entre ${min} y ${max}.`, { [campo]: 'Valor fuera de rango' });
      return n;
    },
    decimal(v, campo, min, max) {
      const n = Number(v);
      if (v === null || v === '' || v === undefined || !Number.isFinite(n) || n < min || n > max) fail(422, `El campo «${campo}» debe ser un número entre ${min} y ${max}.`, { [campo]: 'Valor fuera de rango' });
      return n;
    },
    rango(llegada, salida, permitirPasado = false, max = MAX_NOCHES) {
      if (salida <= llegada) fail(422, 'La fecha de salida debe ser posterior a la de llegada.', { salida: 'Debe ser posterior a la llegada' });
      if (!permitirPasado && llegada < hoy()) fail(422, 'La fecha de llegada no puede estar en el pasado.', { llegada: 'Fecha pasada' });
      if (noches(llegada, salida) > max) fail(422, `La estadía máxima es de ${max} noches.`, { salida: 'Estadía demasiado larga' });
    },
  };

  /* --------------------------- Base de datos --------------------------- */
  function semilla() {
    const db = {
      version: 1,
      seq: { cliente: 0, reserva: 0, reservaRuta: 0, resena: 0, ruta: 0, servicio: 0, admin: 0 },
      tipos: [
        { id: 1, nombre: 'Habitación Estándar', descripcion: 'Confort esencial con estilo tropical sobrio. Nivel 2, habitaciones 1 a 100.', precio: 85, capacidad: 2, nivel: 2, cama: 'Cama Doble', caracteristicas: ['Cama Doble', 'Aire acondicionado', 'Smart TV de 55"', 'Wi-Fi de alta velocidad'], imagen: 'assets/img/estandar.jpg' },
        { id: 2, nombre: 'Habitación Deluxe', descripcion: 'Más espacio y detalles premium para un descanso superior. Nivel 3, habitaciones 101 a 200.', precio: 120, capacidad: 3, nivel: 3, cama: 'Cama Queen', caracteristicas: ['Cama Queen', 'Terraza privada', 'Minibar premium', 'Aire acondicionado', 'Wi-Fi de alta velocidad'], imagen: 'assets/img/deluxe.jpg' },
        { id: 3, nombre: 'Suite Ocean View', descripcion: 'La experiencia más exclusiva, con vista directa al mar. Nivel 4, habitaciones 201 a 300.', precio: 180, capacidad: 4, nivel: 4, cama: 'Cama King', caracteristicas: ['Cama King', 'Balcón con vista al mar', 'Jacuzzi privado', 'Minibar premium', 'Servicio a la habitación', 'Wi-Fi de alta velocidad'], imagen: 'assets/img/suite.jpg' },
      ],
      servicios: [], rutas: [], clientes: [], admins: [], reservas: [], reservaRutas: [], resenas: [],
    };
    const nx = (k) => ++db.seq[k];
    [['Wi-Fi de alta velocidad', 'Conexión estable en todo el hotel y en la playa.', 'wifi', 1, null],
      ['Piscina infinita', 'Piscina frente al mar con camastros y sombrillas.', 'pool', 1, null],
      ['Restaurante', 'Cocina de autor con productos del mar salvadoreño (nivel 1).', 'restaurant', 1, null],
      ['Gimnasio', 'Equipamiento completo, abierto desde las 5:00 a.m. (nivel 1).', 'gym', 1, null],
      ['Recepción 24 horas', 'Atención permanente y asistencia para tus planes.', 'concierge', 1, null],
      ['Spa & Wellness', 'Masajes y tratamientos con ingredientes locales.', 'spa', 0, 45],
      ['Tours guiados', 'Rutas con guía certificado y transporte (ver mapa de rutas).', 'tours', 0, null],
      ['Clases de surf', 'Instructores certificados bilingües, equipo incluido.', 'surf', 0, 35],
    ].forEach(([nombre, descripcion, icono, inc, precio]) => db.servicios.push({ id: nx('servicio'), nombre, descripcion, icono, incluido: !!inc, precio }));

    [['Playa El Tunco', 'Playa de arena oscura y roca emblemática, cuna del surf salvadoreño. Atardeceres, bares y restaurantes frente al mar.', 18, '25 min', 'Baja', 20, 'Roca El Tunco|Playa Sunzal|Mirador de la costa', 13.4936, -89.3828, 'ruta-tunco'],
      ['Parque Nacional El Imposible', 'Bosque tropical con cascadas, ríos y senderos entre las áreas protegidas más ricas en biodiversidad del país.', 85, '1h 30min', 'Alta', 45, 'Sendero Los Enanos|Cascada del Río Venado|Mirador del Cerro Leon', 13.8667, -89.9333, 'ruta-imposible'],
      ['Ruta de las Flores', 'Pueblos de colores, gastronomía, cafetales, artesanías y feria gastronómica de fin de semana.', 120, '2h', 'Media', 40, 'Juayúa|Apaneca|Ataco|Salcoatitán', 13.845, -89.745, 'ruta-flores'],
      ['Lago de Coatepeque', 'Lago volcánico de aguas turquesa rodeado de montañas; ideal para kayak, paseo en lancha y almuerzo frente al agua.', 70, '1h 15min', 'Baja', 30, 'Mirador de Coatepeque|Isla Teopán|Muelle de Cerro Verde', 13.8667, -89.55, 'ruta-coatepeque'],
      ['Ruinas de Tazumal', 'Sitio arqueológico maya en Chalchuapa con pirámides y museo, uno de los más importantes del país.', 95, '1h 45min', 'Media', 35, 'Pirámide principal|Museo Dr. Stanley H. Boggs|Casa Blanca', 13.9783, -89.6811, 'ruta-tazumal'],
      ['Puerto de La Libertad', 'Muelle turístico, mercado de mariscos y malecón; perfecto para una tarde de gastronomía local.', 15, '20 min', 'Baja', 15, 'Muelle turístico|Mercado de mariscos|Malecón', 13.4883, -89.3225, 'ruta-libertad'],
    ].forEach(([nombre, descripcion, distanciaKm, duracion, dificultad, costo, lugares, lat, lng, img]) =>
      db.rutas.push({ id: nx('ruta'), nombre, descripcion, distanciaKm, duracion, dificultad, costo, lugares: lugares.split('|'), lat, lng, imagen: `assets/img/${img}.jpg`, activa: true }));

    db.admins.push({ id: nx('admin'), usuario: 'administrador', nombre: 'Administrador', hash: hashPass('admin123') });

    [['Laura Martínez', 'demo.laura@example.com', 'México', 'La suite con vista al mar es de otro nivel. El personal nos recomendó la ruta al Lago de Coatepeque y fue lo mejor del viaje.', 5],
      ['James Carter', 'demo.james@example.com', 'Estados Unidos', 'Clases de surf excelentes y una noche de fogata inolvidable. Volveremos.', 5],
      ['Camila Rojas', 'demo.camila@example.com', 'Chile', 'Habitaciones limpias y cómodas, y el restaurante superó mis expectativas. Muy buena relación calidad-precio.', 4],
    ].forEach(([nombre, email, pais, comentario, calificacion]) => {
      const id = nx('cliente');
      db.clientes.push({ id, nombre, email, telefono: null, hash: '!', registro: ahora() });   // '!' = no puede iniciar sesión
      db.resenas.push({ id: nx('resena'), idCliente: id, pais, comentario, calificacion, creada: ahora() });
    });
    return db;
  }

  function cargar() {
    const raw = disco.get(KEY);
    if (raw) { try { const d = JSON.parse(raw); if (d && Array.isArray(d.reservas)) return d; } catch { /* base dañada: se regenera */ } }
    const db = semilla(); guardar(db); return db;
  }
  function guardar(db) { disco.set(KEY, JSON.stringify(db)); }
  const next = (db, k) => { db.seq[k] = (db.seq[k] || 0) + 1; return db.seq[k]; };

  /* ------------------------------ Habitaciones ------------------------------ */
  // 1-100 Nivel 2 Estándar · 101-200 Nivel 3 Deluxe · 201-300 Nivel 4 Suite (el nivel 1 es recepción/restaurante/gimnasio)
  const habInfo = (n) => ({ id: n, numero: n, nivel: n <= 100 ? 2 : n <= 200 ? 3 : 4, tipo: n <= 100 ? 1 : n <= 200 ? 2 : 3 });
  const habitacion = (n) => (Number.isInteger(n) && n >= 1 && n <= 300 ? habInfo(n) : fail(404, 'La habitación indicada no existe.'));

  /** REGLA ANTI-SOBREVENTA: [llegada, salida) se solapa con otra reserva activa de la misma habitación. El día de salida queda libre. */
  const libre = (db, num, llegada, salida, excluir = null) =>
    !db.reservas.some((r) => r.habitacion === num && r.estado !== 'Cancelada' && r.id !== excluir && r.llegada < salida && r.salida > llegada);

  /* ------------------------------- Formateo ------------------------------- */
  const cliente = (c) => ({ id: c.id, nombre: c.nombre, email: c.email, telefono: c.telefono });
  function fmt(db, r) {
    const c = db.clientes.find((x) => x.id === r.idCliente), h = habInfo(r.habitacion), t = db.tipos.find((x) => x.id === r.idTipo);
    const rutas = db.reservaRutas.filter((x) => x.idReserva === r.id).map((x) => ({
      id: x.id, idRuta: x.idRuta, nombre: db.rutas.find((y) => y.id === x.idRuta)?.nombre ?? '(ruta eliminada)',
      personas: x.personas, precioUnitario: x.precioUnitario, subtotal: x.precioUnitario * x.personas,
    }));
    const n = noches(r.llegada, r.salida), hosp = n * r.precioNoche, totalRutas = rutas.reduce((s, x) => s + x.subtotal, 0);
    return {
      id: r.id, cliente: cliente(c), habitacion: { id: h.id, numero: h.numero, nivel: h.nivel }, tipo: { id: t.id, nombre: t.nombre },
      llegada: r.llegada, salida: r.salida, noches: n, huespedes: r.huespedes, notas: r.notas, estado: r.estado, creada: r.creada,
      precioNoche: r.precioNoche, totalHospedaje: hosp, totalRutas, total: hosp + totalRutas, rutas,
      factura: r.factura || null, pago: r.pago || null,
      saldo: r.pago ? Math.round((hosp + totalRutas - r.pago.monto) * 100) / 100 : null,   // >0 debe; <0 a favor del cliente
    };
  }
  const detalle = (db, id) => { const r = db.reservas.find((x) => x.id === id); return r ? fmt(db, r) : null; };

  /* ----------------------------- Sesiones ----------------------------- */
  const clienteId = (db) => { const id = Number(disco.get(K_CLI)); return id && db.clientes.some((c) => c.id === id) ? id : null; };
  const adminId = (db) => { const id = Number(sesion.get(K_ADM)); return id && db.admins.some((a) => a.id === id) ? id : null; };
  const reqCliente = (db) => clienteId(db) ?? fail(401, 'Debes iniciar sesión para continuar.');
  const reqAdmin = (db) => adminId(db) ?? fail(401, 'Acceso de administrador requerido.');
  function freno(k) { const f = JSON.parse(sesion.get(K_FAIL + k) || '{"n":0,"hasta":0}'); if (f.n >= 5 && Date.now() < f.hasta) fail(429, 'Demasiados intentos fallidos. Espera un minuto e inténtalo de nuevo.'); }
  function fallo(k) { const f = JSON.parse(sesion.get(K_FAIL + k) || '{"n":0,"hasta":0}'); f.n++; f.hasta = Date.now() + 60000; sesion.set(K_FAIL + k, JSON.stringify(f)); }


  /* ------------------------------- Pagos ------------------------------- */
  const BANCOS = ['Banco Agrícola', 'Banco Cuscatlán', 'Davivienda', 'Banco Promerica', 'BAC Credomatic', 'Banco Azul'];
  const luhn = (n) => { let t = 0, alt = false; for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } t += d; alt = !alt; } return t % 10 === 0; };
  const marca = (n) => (/^4/.test(n) ? 'Visa' : /^(5[1-5]|2[2-7])/.test(n) ? 'Mastercard' : /^3[47]/.test(n) ? 'American Express' : 'Tarjeta');
  /** Valida el método de pago y devuelve lo que se puede guardar (NUNCA el número completo ni el CVV). */
  function validarPago(b) {
    const m = String(b?.metodo ?? '');
    if (m === 'tarjeta') {
      const titular = V.texto(b.titular, 'titular', 3, 60), num = String(b.numero ?? '').replace(/[\s-]/g, '');
      if (!/^\d{13,19}$/.test(num) || !luhn(num)) fail(422, 'El número de tarjeta no es válido.', { numero: 'Número inválido' });
      const mt = String(b.vence ?? '').match(/^(\d{2})\s*\/\s*(\d{2})$/);
      const mes = mt ? +mt[1] : 0, anio = mt ? 2000 + +mt[2] : 0, d = new Date();
      if (!mt || mes < 1 || mes > 12 || anio * 12 + mes < d.getFullYear() * 12 + d.getMonth() + 1) fail(422, 'La fecha de vencimiento no es válida o la tarjeta está vencida.', { vence: 'Vencimiento inválido' });
      if (!/^\d{3,4}$/.test(String(b.cvv ?? ''))) fail(422, 'El código de seguridad (CVV) no es válido.', { cvv: 'CVV inválido' });
      return { metodo: 'Tarjeta de crédito/débito', detalle: `${marca(num)} •••• ${num.slice(-4)} · ${titular}` };
    }
    if (m === 'transferencia') {
      if (!BANCOS.includes(b.banco)) fail(422, 'Selecciona el banco desde el que transferiste.', { banco: 'Requerido' });
      return { metodo: 'Transferencia bancaria', detalle: `${b.banco} · comprobante ${V.texto(b.comprobante, 'comprobante', 4, 30)}` };
    }
    if (m === 'paypal') return { metodo: 'PayPal', detalle: `Cuenta ${V.email(b.email)}` };
    return fail(422, 'Selecciona un método de pago para continuar.', { metodo: 'Requerido' });
  }
  /** Registra el pago de la reserva y le asigna su número de factura. */
  function cobrar(db, r, pago) {
    const total = fmt(db, r).total, ref = Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    r.pago = { ...pago, monto: total, fecha: ahora(), referencia: 'PAY-' + ref, estado: 'Pagado' };
    r.factura = 'F-' + String(next(db, 'factura')).padStart(6, '0');
  }

  /* ------------------------------ Reservas ------------------------------ */
  function insertarRuta(db, idReserva, idRuta, personas) {
    const ruta = db.rutas.find((r) => r.id === idRuta && r.activa) ?? fail(422, 'Una de las rutas seleccionadas no existe.');
    db.reservaRutas.push({ id: next(db, 'reservaRuta'), idReserva, idRuta: ruta.id, personas, precioUnitario: ruta.costo });
  }

  function crearReserva(db, idCliente, d, estado = 'Pendiente', pago = null) {
    const h = habitacion(d.numero), t = db.tipos.find((x) => x.id === h.tipo);
    if (d.huespedes > t.capacidad) fail(422, `Esta habitación admite hasta ${t.capacidad} huéspedes.`, { huespedes: 'Excede la capacidad' });
    if (!libre(db, h.numero, d.llegada, d.salida)) fail(409, `La habitación ${h.numero} ya no está disponible en esas fechas. Elige otra habitación o cambia las fechas.`);
    const r = { id: next(db, 'reserva'), idCliente, idTipo: t.id, habitacion: h.numero, llegada: d.llegada, salida: d.salida, huespedes: d.huespedes, notas: d.notas ?? null, estado, precioNoche: t.precio, creada: ahora() };
    db.reservas.push(r);
    [...new Set(d.rutas || [])].forEach((idRuta) => insertarRuta(db, r.id, idRuta, d.huespedes));
    if (pago) cobrar(db, r, pago);
    return r.id;
  }

  function actualizarReserva(db, id, inp) {
    const cur = db.reservas.find((x) => x.id === id) ?? fail(404, 'La reserva no existe.');
    const has = (k) => Object.prototype.hasOwnProperty.call(inp, k);
    const llegada = has('llegada') ? V.fecha(inp.llegada, 'llegada') : cur.llegada;
    const salida = has('salida') ? V.fecha(inp.salida, 'salida') : cur.salida;
    V.rango(llegada, salida, true, MAX_NOCHES_ADMIN);
    const huespedes = has('huespedes') ? V.entero(inp.huespedes, 'huespedes', 1, 20) : cur.huespedes;
    const estado = has('estado') ? String(inp.estado) : cur.estado;
    if (!ESTADOS.includes(estado)) fail(422, 'Estado de reserva inválido.', { estado: 'Valor no permitido' });
    const notas = has('notas') ? V.textoOpc(inp.notas, 'notas', 1000) : cur.notas;
    const h = has('numeroHabitacion') ? habitacion(V.entero(inp.numeroHabitacion, 'numeroHabitacion', 1, 300)) : habInfo(cur.habitacion);
    const t = db.tipos.find((x) => x.id === h.tipo);
    if (huespedes > t.capacidad) fail(422, `La habitación ${h.numero} admite hasta ${t.capacidad} huéspedes.`, { huespedes: 'Excede la capacidad' });
    if (estado !== 'Cancelada' && !libre(db, h.numero, llegada, salida, cur.id)) fail(409, `La habitación ${h.numero} ya está reservada en alguna fecha entre ${llegada} y ${salida}. No se puede sobrevender.`);
    if (t.id !== cur.idTipo) cur.precioNoche = t.precio;   // si cambia de categoría, rige la nueva tarifa; si no, se conserva la pactada
    Object.assign(cur, { habitacion: h.numero, idTipo: t.id, llegada, salida, huespedes, notas, estado });
    return detalle(db, cur.id);
  }

  const quitarReserva = (db, id) => {
    if (!db.reservas.some((r) => r.id === id)) fail(404, 'La reserva no existe.');
    db.reservas = db.reservas.filter((r) => r.id !== id);
    db.reservaRutas = db.reservaRutas.filter((x) => x.idReserva !== id);
  };

  function listar(db, q) {
    const estado = q.get('estado'), txt = (q.get('q') || '').trim().slice(0, 100).toLowerCase(), desde = q.get('desde');
    if (desde) V.fecha(desde, 'desde');
    const num = txt.replace(/^#/, '');
    const rows = db.reservas.filter((r) => {
      if (estado && ESTADOS.includes(estado) && r.estado !== estado) return false;
      if (desde && r.salida < desde) return false;
      if (txt) {
        const c = db.clientes.find((x) => x.id === r.idCliente);
        if (!(c.nombre.toLowerCase().includes(txt) || c.email.toLowerCase().includes(txt) || String(r.id) === num || String(r.habitacion) === num)) return false;
      }
      return true;
    }).sort((a, b) => b.id - a.id).slice(0, 500);
    const resumen = { Pendiente: 0, Confirmada: 0, Cancelada: 0 };
    db.reservas.forEach((r) => { resumen[r.estado]++; });
    return { reservas: rows.map((r) => fmt(db, r)), resumen };
  }

  /* ------------------------------- Rutas (catálogo) ------------------------------- */
  const listaLugares = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[|\n]/)).map((s) => String(s).trim()).filter(Boolean).slice(0, 10);
  function datosRuta(b) {
    const dif = String(b.dificultad ?? '');
    if (!['Baja', 'Media', 'Alta'].includes(dif)) fail(422, 'La dificultad debe ser Baja, Media o Alta.', { dificultad: 'Valor no permitido' });
    return {
      nombre: V.texto(b.nombre, 'nombre', 3, 100), descripcion: V.textoOpc(b.descripcion, 'descripcion', 600) ?? '',
      distanciaKm: V.decimal(b.distanciaKm, 'distanciaKm', 0, 2000), duracion: V.texto(b.duracion, 'duracion', 1, 20),
      dificultad: dif, costo: V.decimal(b.costo, 'costo', 0, 100000), lugares: listaLugares(b.lugares),
      lat: V.decimal(b.lat, 'lat', -90, 90), lng: V.decimal(b.lng, 'lng', -180, 180),
      imagen: /^assets\/img\/[\w.-]+$/.test(String(b.imagen || '')) ? b.imagen : 'assets/img/ruta-tunco.jpg',
    };
  }
  const rutaOut = (r) => ({ id: r.id, nombre: r.nombre, descripcion: r.descripcion, distanciaKm: r.distanciaKm, duracion: r.duracion, dificultad: r.dificultad, costo: r.costo, lugares: r.lugares, lat: r.lat, lng: r.lng, imagen: r.imagen, activa: r.activa });

  /* ------------------------------- Clientes ------------------------------- */
  const conteos = (db, c) => ({ ...cliente(c), registro: c.registro, puedeIngresar: c.hash !== '!',
    reservas: db.reservas.filter((r) => r.idCliente === c.id).length, vigentes: db.reservas.filter((r) => r.idCliente === c.id && r.estado !== 'Cancelada' && r.salida >= hoy()).length });
  const emailLibre = (db, email, excepto = null) => { if (db.clientes.some((c) => c.email === email && c.id !== excepto)) fail(409, 'Ya existe un cliente con ese correo.', { email: 'Correo ya registrado' }); };

  /* ------------------------------ Disponibilidad ------------------------------ */
  function disponibilidad(db, idTipo, llegada, salida) {
    const hab = []; for (let n = 1; n <= 300; n++) { const h = habInfo(n); if (h.tipo === idTipo) hab.push({ id: h.id, numero: h.numero, nivel: h.nivel, disponible: libre(db, n, llegada, salida) }); }
    return { habitaciones: hab, libres: hab.filter((h) => h.disponible).length, total: hab.length };
  }

  /* --------------------------------- Rutas HTTP --------------------------------- */
  const R = [];
  const on = (m, re, fn) => R.push([m, re, fn]);

  on('GET', /^\/rooms\/types$/, ({ db }) => [...db.tipos].sort((a, b) => b.precio - a.precio).map((t) => {
    const nums = Array.from({ length: 300 }, (_, i) => i + 1).filter((n) => habInfo(n).tipo === t.id);
    return { ...t, desde: nums[0], hasta: nums[nums.length - 1], total: nums.length };
  }));
  on('GET', /^\/rooms\/availability$/, ({ db, q }) => {
    const tipo = V.entero(q.get('tipo'), 'tipo', 1, 1000000), llegada = V.fecha(q.get('llegada'), 'llegada'), salida = V.fecha(q.get('salida'), 'salida');
    V.rango(llegada, salida);
    return disponibilidad(db, tipo, llegada, salida);
  });
  on('GET', /^\/services$/, ({ db }) => [...db.servicios].sort((a, b) => Number(b.incluido) - Number(a.incluido) || a.id - b.id));
  on('GET', /^\/routes$/, ({ db }) => db.rutas.filter((r) => r.activa).sort((a, b) => a.distanciaKm - b.distanciaKm).map(rutaOut));
  on('GET', /^\/reviews$/, ({ db }) => [...db.resenas].sort((a, b) => b.id - a.id).slice(0, 12).map((r) => {
    const c = db.clientes.find((x) => x.id === r.idCliente), p = c.nombre.trim().split(/\s+/);
    return { id: r.id, nombre: p[0] + (p.length > 1 ? ' ' + p[p.length - 1][0] + '.' : ''), pais: r.pais, comentario: r.comentario, calificacion: r.calificacion };
  }));
  on('POST', /^\/reviews$/, ({ db, body }) => {
    const idCliente = reqCliente(db);
    db.resenas.push({ id: next(db, 'resena'), idCliente, pais: V.texto(body.pais, 'pais', 2, 50), comentario: V.texto(body.comentario, 'comentario', 10, 800), calificacion: V.entero(body.calificacion, 'calificacion', 1, 5), creada: ahora() });
  });

  /* Clientes */
  on('POST', /^\/auth\/register$/, ({ db, body: b }) => {
    const nombre = V.texto(b.nombre, 'nombre', 3, 100), email = V.email(b.email), tel = V.telefono(b.telefono), pass = V.password(b.password);
    if (db.clientes.some((c) => c.email === email)) fail(409, 'Ya existe una cuenta con ese correo. Inicia sesión.', { email: 'Correo ya registrado' });
    const c = { id: next(db, 'cliente'), nombre, email, telefono: tel, hash: hashPass(pass), registro: ahora() };
    db.clientes.push(c); disco.set(K_CLI, String(c.id));
    return cliente(c);
  });
  on('POST', /^\/auth\/login$/, ({ db, body: b }) => {
    freno('cliente');
    const c = db.clientes.find((x) => x.email === String(b.email ?? '').trim().toLowerCase());
    if (!c || !checkPass(String(b.password ?? ''), c.hash)) { fallo('cliente'); fail(401, 'Correo o contraseña incorrectos.'); }
    sesion.del(K_FAIL + 'cliente'); disco.set(K_CLI, String(c.id));
    return cliente(c);
  });
  on('POST', /^\/auth\/logout$/, () => { disco.del(K_CLI); });
  on('GET', /^\/auth\/me$/, ({ db }) => { const id = clienteId(db); return id ? cliente(db.clientes.find((c) => c.id === id)) : null; });

  /* Reservas del cliente */
  on('POST', /^\/reservations$/, ({ db, body: b }) => {
    const idCliente = reqCliente(db), llegada = V.fecha(b.llegada, 'llegada'), salida = V.fecha(b.salida, 'salida');
    V.rango(llegada, salida);
    const rutas = b.rutas ?? []; if (!Array.isArray(rutas) || rutas.length > 20) fail(422, 'La lista de rutas no es válida.');
    const pago = validarPago(b.pago);   // el pago es obligatorio: sin método de pago no hay reserva
    const id = crearReserva(db, idCliente, {
      numero: V.entero(b.idHabitacion, 'idHabitacion', 1, 300), llegada, salida, huespedes: V.entero(b.huespedes, 'huespedes', 1, 20),
      notas: V.textoOpc(b.notas, 'notas', 1000), rutas: rutas.map((x) => V.entero(x, 'rutas', 1, 1000000)),
    }, 'Confirmada', pago);   // se confirma al instante: el cliente no espera a recepción
    return detalle(db, id);
  });
  on('POST', /^\/payments\/validate$/, ({ db, body }) => { reqCliente(db); validarPago(body.pago); });
  on('GET', /^\/reservations\/mine$/, ({ db }) => { const id = reqCliente(db); return db.reservas.filter((r) => r.idCliente === id).sort((a, b) => b.id - a.id).map((r) => fmt(db, r)); });
  on('GET', /^\/reservations\/(\d+)$/, ({ db, p }) => { const idC = reqCliente(db), r = db.reservas.find((x) => x.id === Number(p[0]) && x.idCliente === idC) ?? fail(404, 'La reserva no existe.'); return fmt(db, r); });
  on('POST', /^\/reservations\/(\d+)\/cancel$/, ({ db, p }) => {
    const idC = reqCliente(db), r = db.reservas.find((x) => x.id === Number(p[0]) && x.idCliente === idC) ?? fail(404, 'La reserva no existe.');
    if (r.estado !== 'Pendiente') fail(409, 'Solo se pueden cancelar solicitudes pendientes. Para otros cambios contacta al hotel.');
    r.estado = 'Cancelada';
    return detalle(db, r.id);
  });

  /* Administrador: sesión */
  on('POST', /^\/admin\/login$/, ({ db, body: b }) => {
    freno('admin');
    const a = db.admins.find((x) => x.usuario === String(b.usuario ?? '').trim());
    if (!a || !checkPass(String(b.password ?? ''), a.hash)) { fallo('admin'); fail(401, 'Usuario o contraseña de administrador incorrectos.'); }
    sesion.del(K_FAIL + 'admin'); sesion.set(K_ADM, String(a.id));
    return { id: a.id, nombre: a.nombre };
  });
  on('POST', /^\/admin\/logout$/, () => { sesion.del(K_ADM); });
  on('GET', /^\/admin\/me$/, ({ db }) => { const id = adminId(db); const a = id && db.admins.find((x) => x.id === id); return a ? { id: a.id, nombre: a.nombre } : null; });
  on('POST', /^\/admin\/password$/, ({ db, body: b }) => {
    const a = db.admins.find((x) => x.id === reqAdmin(db));
    if (!checkPass(String(b.actual ?? ''), a.hash)) fail(422, 'La contraseña actual no es correcta.', { actual: 'Incorrecta' });
    const nueva = String(b.nueva ?? ''); if (nueva.length < 6 || nueva.length > 72) fail(422, 'La nueva contraseña debe tener entre 6 y 72 caracteres.', { nueva: 'Longitud inválida' });
    a.hash = hashPass(nueva);
  });

  /* Administrador: reservas */
  on('GET', /^\/admin\/reservations$/, ({ db, q }) => { reqAdmin(db); return listar(db, q); });
  on('GET', /^\/admin\/reservations\/(\d+)$/, ({ db, p }) => { reqAdmin(db); return detalle(db, Number(p[0])) ?? fail(404, 'La reserva no existe.'); });
  on('POST', /^\/admin\/reservations$/, ({ db, body: b }) => {   // el administrador agrega una reserva a nombre de un cliente
    reqAdmin(db);
    const idCliente = V.entero(b.idCliente, 'idCliente', 1, 1e9); if (!db.clientes.some((c) => c.id === idCliente)) fail(404, 'El cliente no existe.');
    const llegada = V.fecha(b.llegada, 'llegada'), salida = V.fecha(b.salida, 'salida'); V.rango(llegada, salida, true, MAX_NOCHES_ADMIN);
    const estado = ESTADOS.includes(b.estado) ? b.estado : 'Confirmada';
    const metodo = ['Efectivo en recepción', 'Tarjeta (terminal del hotel)', 'Transferencia bancaria'].includes(b.metodoPago) ? b.metodoPago : null;
    const id = crearReserva(db, idCliente, { numero: V.entero(b.numeroHabitacion, 'numeroHabitacion', 1, 300), llegada, salida, huespedes: V.entero(b.huespedes, 'huespedes', 1, 20), notas: V.textoOpc(b.notas, 'notas', 1000), rutas: [] }, estado, metodo ? { metodo, detalle: 'Registrado por administración' } : null);
    return detalle(db, id);
  });
  on('PUT', /^\/admin\/reservations\/(\d+)$/, ({ db, p, body }) => { reqAdmin(db); return actualizarReserva(db, Number(p[0]), body); });
  on('DELETE', /^\/admin\/reservations\/(\d+)$/, ({ db, p }) => { reqAdmin(db); quitarReserva(db, Number(p[0])); });
  on('POST', /^\/admin\/reservations\/(\d+)\/payment$/, ({ db, p, body: b }) => {   // cobra lo que falte (p. ej. tras extender la estadía)
    reqAdmin(db); const r = db.reservas.find((x) => x.id === Number(p[0])) ?? fail(404, 'La reserva no existe.');
    if (!r.pago) cobrar(db, r, { metodo: String(b.metodo || 'Efectivo en recepción').slice(0, 40), detalle: 'Registrado por administración' });
    else { r.pago.monto = fmt(db, r).total; r.pago.fecha = ahora(); r.pago.estado = 'Pagado'; }
    return detalle(db, r.id);
  });
  on('POST', /^\/admin\/reservations\/(\d+)\/routes$/, ({ db, p, body: b }) => {
    reqAdmin(db); const id = Number(p[0]), r = db.reservas.find((x) => x.id === id) ?? fail(404, 'La reserva no existe.');
    const idRuta = V.entero(b.idRuta, 'idRuta', 1, 1000000), personas = b.personas ? V.entero(b.personas, 'personas', 1, 20) : r.huespedes;
    if (db.reservaRutas.some((x) => x.idReserva === id && x.idRuta === idRuta)) fail(409, 'Esa ruta ya está agregada a la reserva.');
    insertarRuta(db, id, idRuta, personas);
    return detalle(db, id);
  });
  on('DELETE', /^\/admin\/reservations\/(\d+)\/routes\/(\d+)$/, ({ db, p }) => {
    reqAdmin(db); const n = db.reservaRutas.length;
    db.reservaRutas = db.reservaRutas.filter((x) => !(x.id === Number(p[1]) && x.idReserva === Number(p[0])));
    if (db.reservaRutas.length === n) fail(404, 'La ruta no está en esta reserva.');
    return detalle(db, Number(p[0]));
  });
  on('GET', /^\/admin\/occupancy$/, ({ db, q }) => {
    reqAdmin(db);
    const llegada = q.get('llegada') ? V.fecha(q.get('llegada'), 'llegada') : hoy(), salida = q.get('salida') ? V.fecha(q.get('salida'), 'salida') : sumar(llegada, 1);
    V.rango(llegada, salida, true, 400);
    const habitaciones = Array.from({ length: 300 }, (_, i) => {
      const h = habInfo(i + 1);
      const r = db.reservas.filter((x) => x.habitacion === h.numero && x.estado !== 'Cancelada' && x.llegada < salida && x.salida > llegada).sort((a, b) => a.llegada.localeCompare(b.llegada))[0];
      return { id: h.id, numero: h.numero, nivel: h.nivel, tipo: h.tipo, ocupada: !!r, idReserva: r?.id ?? null, estado: r?.estado ?? null, cliente: r ? db.clientes.find((c) => c.id === r.idCliente).nombre : null };
    });
    const ocupadas = habitaciones.filter((h) => h.ocupada).length;
    return { llegada, salida, habitaciones, ocupadas, libres: 300 - ocupadas };
  });
  on('GET', /^\/admin\/availability$/, ({ db, q }) => {   // para el formulario "nueva reserva" del administrador
    reqAdmin(db);
    const llegada = V.fecha(q.get('llegada'), 'llegada'), salida = V.fecha(q.get('salida'), 'salida'); V.rango(llegada, salida, true, MAX_NOCHES_ADMIN);
    const ex = q.get('excluir') ? Number(q.get('excluir')) : null;
    return Array.from({ length: 300 }, (_, i) => ({ numero: i + 1, disponible: libre(db, i + 1, llegada, salida, ex) }));
  });

  /* Administrador: clientes */
  on('GET', /^\/admin\/clients$/, ({ db }) => { reqAdmin(db); return [...db.clientes].sort((a, b) => b.id - a.id).map((c) => conteos(db, c)); });
  on('POST', /^\/admin\/clients$/, ({ db, body: b }) => {
    reqAdmin(db);
    const nombre = V.texto(b.nombre, 'nombre', 3, 100), email = V.email(b.email), tel = V.telefono(b.telefono), pass = V.password(b.password);
    emailLibre(db, email);
    const c = { id: next(db, 'cliente'), nombre, email, telefono: tel, hash: hashPass(pass), registro: ahora() };
    db.clientes.push(c); return conteos(db, c);
  });
  on('PUT', /^\/admin\/clients\/(\d+)$/, ({ db, p, body: b }) => {
    reqAdmin(db); const c = db.clientes.find((x) => x.id === Number(p[0])) ?? fail(404, 'El cliente no existe.');
    const nombre = V.texto(b.nombre, 'nombre', 3, 100), email = V.email(b.email), tel = V.telefono(b.telefono);
    emailLibre(db, email, c.id);
    const pass = b.password ? V.password(b.password) : null;
    Object.assign(c, { nombre, email, telefono: tel }); if (pass) c.hash = hashPass(pass);
    return conteos(db, c);
  });
  on('DELETE', /^\/admin\/clients\/(\d+)$/, ({ db, p }) => {   // borra también sus reservas, rutas y reseñas (liberando las habitaciones)
    reqAdmin(db); const id = Number(p[0]); if (!db.clientes.some((c) => c.id === id)) fail(404, 'El cliente no existe.');
    const ids = db.reservas.filter((r) => r.idCliente === id).map((r) => r.id);
    db.reservas = db.reservas.filter((r) => r.idCliente !== id);
    db.reservaRutas = db.reservaRutas.filter((x) => !ids.includes(x.idReserva));
    db.resenas = db.resenas.filter((r) => r.idCliente !== id);
    db.clientes = db.clientes.filter((c) => c.id !== id);
    if (Number(disco.get(K_CLI)) === id) disco.del(K_CLI);
    return { reservasEliminadas: ids.length };
  });

  /* Administrador: rutas turísticas (agregar / editar / quitar) */
  on('GET', /^\/admin\/routes$/, ({ db }) => { reqAdmin(db); return [...db.rutas].sort((a, b) => a.id - b.id).map((r) => ({ ...rutaOut(r), usos: db.reservaRutas.filter((x) => x.idRuta === r.id).length })); });
  on('POST', /^\/admin\/routes$/, ({ db, body: b }) => {
    reqAdmin(db); const d = datosRuta(b);
    if (db.rutas.some((r) => r.nombre.toLowerCase() === d.nombre.toLowerCase())) fail(409, 'Ya existe una ruta con ese nombre.', { nombre: 'Nombre repetido' });
    const r = { id: next(db, 'ruta'), ...d, activa: b.activa !== false }; db.rutas.push(r); return rutaOut(r);
  });
  on('PUT', /^\/admin\/routes\/(\d+)$/, ({ db, p, body: b }) => {
    reqAdmin(db); const r = db.rutas.find((x) => x.id === Number(p[0])) ?? fail(404, 'La ruta no existe.'), d = datosRuta(b);
    if (db.rutas.some((x) => x.id !== r.id && x.nombre.toLowerCase() === d.nombre.toLowerCase())) fail(409, 'Ya existe una ruta con ese nombre.', { nombre: 'Nombre repetido' });
    Object.assign(r, d, { activa: b.activa !== false }); return rutaOut(r);
  });
  on('DELETE', /^\/admin\/routes\/(\d+)$/, ({ db, p }) => {   // la quita del catálogo y de las reservas que la tenían
    reqAdmin(db); const id = Number(p[0]); if (!db.rutas.some((r) => r.id === id)) fail(404, 'La ruta no existe.');
    const quitadas = db.reservaRutas.filter((x) => x.idRuta === id).length;
    db.reservaRutas = db.reservaRutas.filter((x) => x.idRuta !== id); db.rutas = db.rutas.filter((r) => r.id !== id);
    return { quitadasDeReservas: quitadas };
  });

  /* Administrador: reseñas */
  on('GET', /^\/admin\/reviews$/, ({ db }) => { reqAdmin(db); return [...db.resenas].sort((a, b) => b.id - a.id).map((r) => ({ ...r, cliente: db.clientes.find((c) => c.id === r.idCliente)?.nombre ?? '—' })); });
  on('DELETE', /^\/admin\/reviews\/(\d+)$/, ({ db, p }) => {
    reqAdmin(db); const n = db.resenas.length; db.resenas = db.resenas.filter((r) => r.id !== Number(p[0]));
    if (db.resenas.length === n) fail(404, 'La reseña no existe.');
  });

  /* ---------------------------------- Entrada ---------------------------------- */
  function handle(path, method = 'GET', body = {}) {
    const url = new URL(path, 'http://local'), db = cargar();
    let hit = false;
    for (const [m, re, fn] of R) {
      const mt = url.pathname.match(re); if (!mt) continue;
      hit = true; if (m !== method) continue;
      const data = fn({ db, q: url.searchParams, body: body || {}, p: mt.slice(1) });
      if (method !== 'GET') guardar(db);   // solo se guarda si todo salió bien: si hubo error, no cambia nada
      return data === undefined ? null : JSON.parse(JSON.stringify(data));
    }
    return fail(hit ? 405 : 404, hit ? 'Método no permitido.' : 'Endpoint no encontrado.');
  }

  /* Respaldo: exportar / importar / reiniciar toda la base */
  const exportar = () => JSON.stringify(cargar(), null, 1);
  function importar(texto) {
    let d; try { d = JSON.parse(texto); } catch { fail(422, 'El archivo no es un JSON válido.'); }
    const ok = ['tipos', 'servicios', 'rutas', 'clientes', 'admins', 'reservas', 'reservaRutas', 'resenas'].every((k) => Array.isArray(d?.[k])) && d.seq;
    if (!ok) fail(422, 'El archivo no parece una copia de la base de datos del hotel.');
    guardar(d);
  }
  function reiniciar() { guardar(semilla()); disco.del(K_CLI); sesion.del(K_ADM); }

  return { handle, exportar, importar, reiniciar, _sha256: sha256, _hoy: hoy };
})();
