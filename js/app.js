/* Hotel Costa del Sol · sitio público */
(() => {
  const { api, esc, icon, stars, money, hoy, sumarDias, noches, fecha, toast, modal, setErr } = CDS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Coordenadas aproximadas del hotel (Km 65, Costa del Sol, La Paz). Ajustables.
  const HOTEL = { lat: 13.305, lng: -88.935 };
  const MAX_NOCHES = 30;

  const EXPERIENCIAS = [
    { img: 'exp-surf', t: 'Clases de Surf', d: 'Domina las famosas olas salvadoreñas con instructores certificados bilingües.' },
    { img: 'exp-bote', t: 'Paseos en Bote al Atardecer', d: 'Navega los mágicos canales y esteros rodeados de manglares y fauna exótica.' },
    { img: 'exp-cocina', t: 'Degustación de Cocina Local', d: 'Un viaje culinario guiado para probar las auténticas delicias tradicionales del mar.' },
    { img: 'exp-fogata', t: 'Noches de Fogata', d: 'Música acústica, malvaviscos y cócteles alrededor del fuego frente al mar.' },
  ];

  const state = {
    user: null, tipos: [], rutas: [], servicios: [],
    cart: loadCart(),
    tipoId: null, rooms: [], roomId: null, reqToken: 0,
    pendingSubmit: false, map: null, mias: [], ultima: null,
  };

  /* ------------------------- Carrito de rutas (sessionStorage) ------------------------- */
  function loadCart() { try { return JSON.parse(sessionStorage.getItem('cds_rutas') || '[]').map(Number).filter(Boolean); } catch { return []; } }
  function saveCart() { try { sessionStorage.setItem('cds_rutas', JSON.stringify(state.cart)); } catch { /* sin almacenamiento */ } }
  const enCarrito = (id) => state.cart.includes(id);

  /* ------------------------------------ Utilidades ------------------------------------ */
  const tipoActual = () => state.tipos.find((t) => t.id === state.tipoId);
  const habSel = () => state.rooms.find((r) => r.id === state.roomId);
  const val = (id) => $('#' + id).value.trim();
  function fallo(el, e) { el.innerHTML = `<p class="col-span-full text-center text-sm text-[#8f2d2d] py-8">${esc(e.message)}</p>`; }

  /* ================================ NAVBAR / AUTENTICACIÓN ================================ */
  function renderAuth() {
    const html = state.user
      ? `<span class="text-tinta/70 hidden md:inline">Hola, ${esc(state.user.nombre.split(' ')[0])}</span>
         <button data-act="mis" class="font-semibold text-deep hover:underline">Mis reservas</button>
         <button data-act="logout" class="text-tinta/70 hover:underline">Salir</button>`
      : `<button data-act="login" class="font-semibold text-deep hover:underline inline-flex items-center gap-1.5">${icon('user')} Ingresar</button>`;
    $('#auth-area').innerHTML = html;
    $('#auth-area-m').innerHTML = html;
  }

  function openAuth(tab = 'login') {
    const login = tab === 'login';
    $('#form-login').hidden = !login; $('#form-reg').hidden = login;
    $('#tab-login').setAttribute('aria-selected', login); $('#tab-reg').setAttribute('aria-selected', !login);
    $('#tab-login').className = 'px-4 py-2 border-b-2 ' + (login ? 'border-deep text-deep' : 'border-transparent text-tinta/60');
    $('#tab-reg').className = 'px-4 py-2 border-b-2 ' + (!login ? 'border-deep text-deep' : 'border-transparent text-tinta/60');
    $('#auth-title').textContent = login ? 'Ingresa a tu cuenta' : 'Crea tu cuenta';
    $('#login-err').textContent = ''; $('#reg-err').textContent = '';
    modal.open('modal-auth');
    (login ? $('#l-email') : $('#r-nombre')).focus();
  }

  const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

  async function onLogin(ev) {
    ev.preventDefault();
    const email = $('#l-email'), pass = $('#l-pass');
    setErr(email, emailOk(email.value.trim()) ? '' : 'Ingresa un correo válido');
    setErr(pass, pass.value ? '' : 'Ingresa tu contraseña');
    if (!emailOk(email.value.trim()) || !pass.value) return;
    try {
      state.user = await api('/auth/login', { method: 'POST', body: { email: email.value.trim(), password: pass.value } });
      afterAuth('Sesión iniciada. ¡Bienvenido!');
    } catch (e) { $('#login-err').textContent = e.message; }
  }

  async function onRegister(ev) {
    ev.preventDefault();
    const f = { n: $('#r-nombre'), e: $('#r-email'), t: $('#r-tel'), p: $('#r-pass') };
    const bad = [
      [f.n, f.n.value.trim().length >= 3 ? '' : 'Ingresa tu nombre completo'],
      [f.e, emailOk(f.e.value.trim()) ? '' : 'Ingresa un correo válido'],
      [f.t, !f.t.value.trim() || /^[0-9+\-\s()]{7,20}$/.test(f.t.value.trim()) ? '' : 'Teléfono inválido'],
      [f.p, f.p.value.length >= 8 && /[A-Za-z]/.test(f.p.value) && /\d/.test(f.p.value) ? '' : 'Mínimo 8 caracteres, con letras y números'],
    ];
    bad.forEach(([i, m]) => setErr(i, m));
    if (bad.some(([, m]) => m)) return;
    try {
      state.user = await api('/auth/register', { method: 'POST', body: { nombre: f.n.value.trim(), email: f.e.value.trim(), telefono: f.t.value.trim(), password: f.p.value } });
      afterAuth('Cuenta creada. ¡Bienvenido a Costa del Sol!');
    } catch (e) { $('#reg-err').textContent = e.message; }
  }

  function afterAuth(msg) {
    modal.close('modal-auth');
    $('#form-login').reset(); $('#form-reg').reset();
    renderAuth(); toast(msg);
    if (state.pendingSubmit) { state.pendingSubmit = false; submit(); }
  }

  async function logout() {
    try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { /* ignorar */ }
    state.user = null; renderAuth(); toast('Sesión cerrada.');
  }

  /* ================================== SERVICIOS ================================== */
  function renderServicios() {
    const card = (s) => `<article class="card p-5 flex gap-4 items-start">
        <span class="icon-circle">${icon(s.icono)}</span>
        <div class="min-w-0"><h4 class="font-display font-semibold text-deep">${esc(s.nombre)}</h4>
          <p class="text-sm text-tinta/70 mt-1 leading-6">${esc(s.descripcion)}</p>
          ${s.incluido ? '' : `<p class="text-xs font-semibold text-[var(--cobre-txt)] mt-2">${s.precio != null ? money(s.precio) + ' por persona' : 'Según la ruta elegida'}</p>`}
        </div></article>`;
    $('#srv-incluidos').innerHTML = state.servicios.filter((s) => s.incluido).map(card).join('');
    $('#srv-extras').innerHTML = state.servicios.filter((s) => !s.incluido).map(card).join('');
  }

  /* ================================== HABITACIONES ================================== */
  function renderTipos() {
    $('#room-cards').innerHTML = state.tipos.map((t) => `
      <article class="card overflow-hidden flex flex-col">
        <img src="${esc(t.imagen)}" alt="${esc(t.nombre)}" class="w-full aspect-[16/10] object-cover" loading="lazy">
        <div class="p-5 flex flex-col flex-1">
          <div class="flex items-baseline justify-between gap-3">
            <h3 class="font-display text-lg font-semibold text-deep">${esc(t.nombre)}</h3>
            <p class="text-cobre font-semibold whitespace-nowrap">${money(t.precio).replace('.00', '')} <span class="text-xs text-tinta/60 font-normal">/ noche</span></p>
          </div>
          <hr class="my-3 border-[var(--linea)]">
          <ul class="space-y-1.5 text-sm text-tinta/80 flex-1">
            ${t.caracteristicas.slice(0, 3).map((c) => `<li class="flex gap-2 items-center"><span class="text-deep">${icon('check')}</span>${esc(c)}</li>`).join('')}
          </ul>
          <button class="btn btn-outline w-full mt-5" data-act="room" data-id="${t.id}">Ver detalles</button>
        </div>
      </article>`).join('');

    const porNivel = [...state.tipos].sort((a, b) => a.nivel - b.nivel);
    $('#niveles').innerHTML = [`<div class="card p-4"><p class="eyebrow">Nivel 1</p><p class="mt-1 font-medium text-deep">Recepción, restaurante y gimnasio</p></div>`]
      .concat(porNivel.map((t) => `<div class="card p-4"><p class="eyebrow">Nivel ${t.nivel}</p><p class="mt-1 font-medium text-deep">${esc(t.nombre)}</p><p class="text-xs text-tinta/60 mt-0.5">Habitaciones ${t.desde} a ${t.hasta}</p></div>`)).join('');
  }

  function openRoom(id) {
    const t = state.tipos.find((x) => x.id === id); if (!t) return;
    $('#room-body').innerHTML = `
      <img src="${esc(t.imagen)}" alt="${esc(t.nombre)}" class="w-full aspect-[16/9] object-cover">
      <div class="p-7">
        <div class="flex items-baseline justify-between gap-4 flex-wrap">
          <h3 class="font-display text-2xl text-deep">${esc(t.nombre)}</h3>
          <p class="text-cobre font-semibold text-lg">${money(t.precio)} <span class="text-sm text-tinta/60 font-normal">/ noche</span></p>
        </div>
        <p class="mt-3 text-sm leading-6 text-tinta/80">${esc(t.descripcion)}</p>
        <dl class="grid grid-cols-2 gap-3 mt-5 text-sm">
          <div class="card p-3"><dt class="eyebrow">Ubicación</dt><dd class="mt-1">Nivel ${t.nivel} · hab. ${t.desde} a ${t.hasta}</dd></div>
          <div class="card p-3"><dt class="eyebrow">Capacidad</dt><dd class="mt-1">Hasta ${t.capacidad} huéspedes · ${esc(t.cama)}</dd></div>
        </dl>
        <ul class="grid sm:grid-cols-2 gap-2 mt-5 text-sm">${t.caracteristicas.map((c) => `<li class="flex gap-2 items-center"><span class="text-deep">${icon('check')}</span>${esc(c)}</li>`).join('')}</ul>
        <button class="btn btn-primary mt-7" data-act="reservar-tipo" data-id="${t.id}">Reservar esta categoría</button>
      </div>`;
    modal.open('modal-room');
  }

  /* ============================== RUTAS Y MAPA INTERACTIVO ============================== */
  function renderRutas() {
    $('#route-cards').innerHTML = state.rutas.map((r) => `
      <button type="button" class="card overflow-hidden text-left group" data-act="ruta" data-id="${r.id}" aria-label="Ver ruta ${esc(r.nombre)}">
        <div class="relative"><img src="${esc(r.imagen)}" alt="" class="w-full aspect-[16/9] object-cover" loading="lazy">
          ${enCarrito(r.id) ? `<span class="badge absolute top-2 right-2 bg-deep text-white">Agregada</span>` : ''}</div>
        <div class="p-4 bg-crema/70">
          <h3 class="font-display font-semibold text-deep">${esc(r.nombre)}</h3>
          <p class="text-xs text-tinta/70 mt-1.5 flex items-center gap-1.5"><span class="text-cobre">${icon('pin')}</span>${r.distanciaKm} km (${esc(r.duracion)})</p>
        </div>
      </button>`).join('');
  }

  function openRuta(id) {
    const r = state.rutas.find((x) => x.id === id); if (!r) return;
    const add = enCarrito(r.id);
    $('#ruta-body').innerHTML = `
      <div class="grid md:grid-cols-2">
        <div class="p-7 order-2 md:order-1">
          <img src="${esc(r.imagen)}" alt="${esc(r.nombre)}" class="w-full aspect-[16/8] object-cover rounded-md">
          <h3 class="font-display text-2xl text-deep mt-5">${esc(r.nombre)}</h3>
          <p class="text-sm leading-6 text-tinta/80 mt-2">${esc(r.descripcion)}</p>
          <dl class="grid grid-cols-2 gap-3 mt-5 text-sm">
            <div class="card p-3"><dt class="eyebrow">Distancia</dt><dd class="mt-1">${r.distanciaKm} km desde el hotel</dd></div>
            <div class="card p-3"><dt class="eyebrow">Duración</dt><dd class="mt-1">${esc(r.duracion)} en carretera</dd></div>
            <div class="card p-3"><dt class="eyebrow">Dificultad</dt><dd class="mt-1">${esc(r.dificultad)}</dd></div>
            <div class="card p-3"><dt class="eyebrow">Costo</dt><dd class="mt-1">${money(r.costo)} por persona</dd></div>
          </dl>
          ${r.lugares.length ? `<p class="eyebrow mt-5">Lugares incluidos</p><ul class="mt-2 text-sm space-y-1">${r.lugares.map((l) => `<li class="flex gap-2 items-center"><span class="text-cobre">${icon('pin')}</span>${esc(l)}</li>`).join('')}</ul>` : ''}
          <div class="flex flex-wrap gap-3 mt-6">
            <button class="btn ${add ? 'btn-outline' : 'btn-primary'}" data-act="toggle-ruta" data-id="${r.id}">${add ? 'Quitar de mi reserva' : 'Agregar a mi reserva'}</button>
            ${add ? `<a href="#reservar" class="btn btn-primary" data-close>Ir a reservar</a>` : ''}
          </div>
        </div>
        <div class="order-1 md:order-2 min-h-[300px] md:min-h-full bg-crema relative">
          <div id="map-ruta" class="absolute inset-0" role="application" aria-label="Mapa de la ruta a ${esc(r.nombre)}"></div>
        </div>
      </div>`;
    modal.open('modal-ruta');
    dibujarMapa(r);
  }

  function dibujarMapa(r) {
    const el = $('#map-ruta');
    if (state.map) { state.map.remove(); state.map = null; }
    if (typeof L === 'undefined') {
      el.innerHTML = `<p class="p-6 text-sm text-tinta/70">No se pudo cargar el mapa (se requiere conexión a internet). Coordenadas: ${r.lat}, ${r.lng}.</p>`;
      return;
    }
    const map = L.map(el, { scrollWheelZoom: true });
    // CARTO ahora exige API key (devuelve una imagen de aviso sin dar error), y OpenStreetMap bloquea archivos locales (403).
    // Esri World Street Map es gratuito, no pide clave y funciona abriendo el archivo directamente. Si falla, se usa Esri Topo.
    const base = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' });
    let fallos = 0;
    base.on('tileerror', () => {
      if (++fallos !== 4) return;
      map.removeLayer(base);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' }).addTo(map);
    });
    base.addTo(map);
    const hotel = [HOTEL.lat, HOTEL.lng], dest = [r.lat, r.lng];
    L.polyline([hotel, dest], { color: '#0D3B3E', weight: 3, dashArray: '8 8' }).addTo(map);
    L.circleMarker(hotel, { radius: 9, color: '#fff', weight: 2, fillColor: '#0D3B3E', fillOpacity: 1 }).addTo(map).bindTooltip('Hotel Costa del Sol', { permanent: true, direction: 'top' });
    L.circleMarker(dest, { radius: 9, color: '#fff', weight: 2, fillColor: '#C17F52', fillOpacity: 1 }).addTo(map).bindTooltip(r.nombre, { permanent: true, direction: 'top' });
    map.fitBounds([hotel, dest], { padding: [50, 50] });
    state.map = map;
    setTimeout(() => map.invalidateSize(), 120);
  }

  function toggleRuta(id) {
    const r = state.rutas.find((x) => x.id === id);
    if (enCarrito(id)) { state.cart = state.cart.filter((x) => x !== id); toast(`«${r.nombre}» se quitó de tu reserva.`); }
    else { state.cart.push(id); toast(`«${r.nombre}» agregada. Completa tu solicitud en la sección Reservar.`); }
    saveCart(); renderRutas(); renderBookingRutas(); renderSummary(); openRuta(id);
  }

  /* ================================ RESEÑAS ================================ */
  async function cargarResenas() {
    const box = $('#review-list');
    try {
      const rs = await api('/reviews');
      box.innerHTML = rs.length ? rs.map((r) => `
        <figure class="card p-6 flex flex-col gap-3">
          ${stars(r.calificacion)}
          <blockquote class="text-sm leading-6 text-tinta/85">${esc(r.comentario)}</blockquote>
          <figcaption class="mt-auto text-sm"><span class="font-semibold text-deep">${esc(r.nombre)}</span> <span class="text-tinta/60">· ${esc(r.pais)}</span></figcaption>
        </figure>`).join('') : '<p class="col-span-full text-sm text-tinta/60">Aún no hay reseñas. ¡Sé el primero en compartir tu experiencia!</p>';
    } catch (e) { fallo(box, e); }
  }

  async function onResena(ev) {
    ev.preventDefault();
    const pais = $('#rs-pais'), com = $('#rs-com');
    setErr(pais, pais.value.trim().length >= 2 ? '' : 'Indica tu país');
    setErr(com, com.value.trim().length >= 10 ? '' : 'Escribe al menos 10 caracteres');
    if (pais.value.trim().length < 2 || com.value.trim().length < 10) return;
    try {
      await api('/reviews', { method: 'POST', body: { pais: pais.value.trim(), comentario: com.value.trim(), calificacion: Number($('#rs-cal').value) } });
      modal.close('modal-resena'); $('#form-resena').reset(); toast('¡Gracias por tu reseña!'); cargarResenas();
    } catch (e) { toast(e.message, true); }
  }

  /* ============================== FORMULARIO DE RESERVA ============================== */
  function renderTiposReserva() {
    const orden = [...state.tipos].sort((a, b) => a.precio - b.precio);
    $('#b-tipos').innerHTML = orden.map((t) => `
      <label class="block cursor-pointer">
        <input type="radio" name="tipo" value="${t.id}" class="sr-only peer" ${t.id === state.tipoId ? 'checked' : ''}>
        <span class="block border border-[#cfc6b3] bg-white rounded-sm p-4 h-full peer-checked:border-deep peer-checked:ring-2 peer-checked:ring-deep peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-cobre">
          <span class="block font-display font-semibold text-deep">${esc(t.nombre)}</span>
          <span class="block text-cobre font-semibold mt-1">${money(t.precio).replace('.00', '')}<span class="text-xs text-tinta/60 font-normal"> / noche</span></span>
          <span class="block text-xs text-tinta/70 mt-2">Nivel ${t.nivel} · hab. ${t.desde}–${t.hasta}<br>Hasta ${t.capacidad} huéspedes</span>
        </span>
      </label>`).join('');
  }

  function renderBookingRutas() {
    const box = $('#b-rutas'), g = Number($('#b-huespedes').value) || 1;
    const sel = state.cart.map((id) => state.rutas.find((r) => r.id === id)).filter(Boolean);
    box.innerHTML = sel.length
      ? `<ul class="divide-y divide-[var(--linea)]">${sel.map((r) => `
          <li class="py-3 flex items-center justify-between gap-3 text-sm">
            <span><span class="font-semibold text-deep">${esc(r.nombre)}</span><br><span class="text-tinta/60 text-xs">${money(r.costo)} × ${g} persona${g > 1 ? 's' : ''} = ${money(r.costo * g)}</span></span>
            <button type="button" class="btn btn-danger btn-sm" data-act="quitar-ruta" data-id="${r.id}" aria-label="Quitar ${esc(r.nombre)}">${icon('trash')} Quitar</button>
          </li>`).join('')}</ul>
         <a href="#rutas" class="inline-block mt-3 text-sm font-semibold text-deep hover:underline">Agregar otra ruta</a>`
      : `<p class="text-sm text-tinta/70">Aún no has agregado rutas. <a href="#rutas" class="font-semibold text-deep underline">Explora el mapa de rutas turísticas</a> y agrégalas a tu estadía.</p>`;
  }

  /** Devuelve mensaje de error o null si las fechas son válidas. */
  function validarFechas() {
    const a = $('#b-llegada').value, b = $('#b-salida').value;
    if (!a || !b) return 'Selecciona las fechas de llegada y salida.';
    if (a < hoy()) return 'La llegada no puede ser en el pasado.';
    if (b <= a) return 'La salida debe ser posterior a la llegada.';
    if (noches(a, b) > MAX_NOCHES) return `La estadía máxima es de ${MAX_NOCHES} noches.`;
    return null;
  }

  async function refreshRooms() {
    const info = $('#b-rooms-info'), grid = $('#b-rooms'), legend = $('#b-legend');
    const t = tipoActual();
    const errF = validarFechas();
    setErr($('#b-llegada'), ''); setErr($('#b-salida'), errF && $('#b-llegada').value && $('#b-salida').value ? errF : '');
    if (!t || errF) {
      state.rooms = []; state.roomId = null; grid.innerHTML = ''; legend.classList.add('hidden');
      info.textContent = errF && ($('#b-llegada').value && $('#b-salida').value) ? errF : 'Elige fechas y una categoría para ver las habitaciones disponibles.';
      renderSummary(); return;
    }
    const token = ++state.reqToken;
    info.textContent = 'Consultando disponibilidad…';
    try {
      const d = await api(`/rooms/availability?tipo=${t.id}&llegada=${$('#b-llegada').value}&salida=${$('#b-salida').value}`);
      if (token !== state.reqToken) return; // llegó una respuesta más nueva
      state.rooms = d.habitaciones;
      if (!habSel()?.disponible) state.roomId = null;
      info.innerHTML = d.libres
        ? `<strong class="text-deep">${d.libres} de ${d.total}</strong> habitaciones disponibles · Nivel ${t.nivel} · del ${fecha($('#b-llegada').value)} al ${fecha($('#b-salida').value)}`
        : `<span class="text-[#8f2d2d]">No quedan habitaciones ${esc(t.nombre)} para esas fechas. Prueba otras fechas u otra categoría.</span>`;
      legend.classList.remove('hidden'); legend.classList.add('flex');
      renderRoomGrid();
    } catch (e) { info.innerHTML = `<span class="text-[#8f2d2d]">${esc(e.message)}</span>`; state.rooms = []; $('#b-rooms').innerHTML = ''; }
    renderSummary();
  }

  function renderRoomGrid() {
    $('#b-rooms').innerHTML = state.rooms.map((r) => `<button type="button" class="room${r.id === state.roomId ? ' sel' : ''}" data-act="pick-room" data-id="${r.id}"
        ${r.disponible ? '' : 'disabled'} aria-pressed="${r.id === state.roomId}" aria-label="Habitación ${r.numero}, nivel ${r.nivel}, ${r.disponible ? 'disponible' : 'ocupada'}">${r.numero}</button>`).join('');
  }

  function renderSummary() {
    const t = tipoActual(), h = habSel(), a = $('#b-llegada').value, b = $('#b-salida').value;
    const g = Number($('#b-huespedes').value) || 1;
    const okF = !validarFechas(), n = okF ? noches(a, b) : 0;
    const rutas = state.cart.map((id) => state.rutas.find((r) => r.id === id)).filter(Boolean);
    const hosp = t && n ? n * t.precio : 0, extras = rutas.reduce((s, r) => s + r.costo * g, 0);
    const row = (k, v) => `<div class="flex justify-between gap-3"><dt class="text-tinta/60">${k}</dt><dd class="text-right font-medium">${v}</dd></div>`;
    $('#b-summary').innerHTML =
      row('Fechas', okF ? `${fecha(a)} → ${fecha(b)}<br><span class="text-xs text-tinta/60">${n} noche${n > 1 ? 's' : ''}</span>` : '—') +
      row('Categoría', t ? esc(t.nombre) : '—') +
      row('Habitación', h ? `N.º ${h.numero} · Nivel ${h.nivel}` : '<span class="text-tinta/50">Sin elegir</span>') +
      row('Huéspedes', g) +
      row('Hospedaje', t && n ? `${n} × ${money(t.precio)} = ${money(hosp)}` : '—') +
      (rutas.length ? row('Rutas', rutas.map((r) => `${esc(r.nombre)}: ${money(r.costo * g)}`).join('<br>')) : '') +
      `<div class="flex justify-between gap-3 pt-3 mt-2 border-t border-[var(--linea)] text-base"><dt class="font-semibold text-deep">Total estimado</dt><dd class="font-display font-bold text-deep">${money(hosp + extras)}</dd></div>`;
    $('#b-submit').textContent = state.user ? 'Continuar al pago' : 'Inicia sesión para reservar';
  }

  function onHuespedes() {
    const t = tipoActual(), inp = $('#b-huespedes'), g = Number(inp.value);
    if (t) inp.max = t.capacidad;
    setErr(inp, !g || g < 1 ? 'Mínimo 1 huésped' : t && g > t.capacidad ? `Esta categoría admite hasta ${t.capacidad}` : '');
    renderBookingRutas(); renderSummary();
  }

  function onFechas(ev) {
    const l = $('#b-llegada'), s = $('#b-salida');
    if (ev?.target === l && l.value) {
      s.min = sumarDias(l.value, 1);
      if (!s.value || s.value <= l.value) s.value = sumarDias(l.value, 1);
    }
    state.roomId = null; refreshRooms();
  }

  async function submit() {
    const errF = validarFechas(), t = tipoActual(), g = Number($('#b-huespedes').value);
    if (errF) return toast(errF, true);
    if (!t) return toast('Elige una categoría de habitación.', true);
    if (!g || g < 1 || g > t.capacidad) return toast(`Esta categoría admite de 1 a ${t.capacidad} huéspedes.`, true);
    if (!state.roomId) return toast('Selecciona un número de habitación en el mapa.', true);
    if (!state.user) { state.pendingSubmit = true; return openAuth('login'); }

    abrirConfirmacion();
  }

  /* ============================ CONFIRMACIÓN Y PAGO ============================ */
  // La reserva se paga en el momento y queda CONFIRMADA al instante: el cliente no espera la respuesta de recepción.
  const BANCOS = ['Banco Agrícola', 'Banco Cuscatlán', 'Davivienda', 'Banco Promerica', 'BAC Credomatic', 'Banco Azul'];
  const pay = { metodo: 'tarjeta', notas: '' };
  const paso = (html) => { $('#pay-body').innerHTML = html; $('#pay-body').querySelector('[data-focus]')?.focus(); };

  function datosReserva() {
    const t = tipoActual(), h = habSel(), a = $('#b-llegada').value, b = $('#b-salida').value, g = Number($('#b-huespedes').value) || 1;
    const n = noches(a, b), rutas = state.cart.map((id) => state.rutas.find((r) => r.id === id)).filter(Boolean);
    const hosp = n * t.precio, extras = rutas.reduce((sum, r) => sum + r.costo * g, 0);
    return { t, h, a, b, g, n, rutas, hosp, extras, total: hosp + extras };
  }

  function abrirConfirmacion() {
    const d = datosReserva(), row = (k, v) => `<div class="flex justify-between gap-4"><dt class="text-tinta/60">${k}</dt><dd class="text-right font-medium">${v}</dd></div>`;
    pay.metodo = 'tarjeta'; pay.notas = $('#b-notas').value.trim();
    paso(`
      <h3 id="pay-title" class="font-display text-2xl text-deep pr-10">Confirma tu reserva</h3>
      <p class="text-sm text-tinta/70 mt-1">Revisa los detalles antes de continuar al pago.</p>
      <dl class="mt-5 space-y-2 text-sm">
        ${row('Habitación', `N.º ${d.h.numero} · Nivel ${d.h.nivel} · ${esc(d.t.nombre)}`)}
        ${row('Fechas', `${fecha(d.a)} → ${fecha(d.b)} (${d.n} noche${d.n > 1 ? 's' : ''})`)}
        ${row('Huéspedes', d.g)}
        ${row('Hospedaje', `${d.n} × ${money(d.t.precio)} = ${money(d.hosp)}`)}
        ${d.rutas.length ? row('Rutas', d.rutas.map((r) => `${esc(r.nombre)}: ${money(r.costo * d.g)}`).join('<br>')) : ''}
        <div class="flex justify-between gap-4 pt-3 mt-2 border-t border-[var(--linea)] text-base"><dt class="font-semibold text-deep">Total a pagar</dt><dd class="font-display font-bold text-deep">${money(d.total)}</dd></div>
      </dl>
      <p class="mt-6 font-medium text-deep">¿Confirmas que quieres reservar esta habitación?</p>
      <div class="flex flex-wrap gap-3 mt-4">
        <button type="button" class="btn btn-primary" data-act="pay-go" data-focus>Sí, continuar al pago</button>
        <button type="button" class="btn btn-outline" data-act="pay-close">Volver</button>
      </div>`);
    modal.open('modal-pay');
  }

  function camposPago(m) {
    const f = (id, label, ph, extra = '') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" class="input" placeholder="${ph}" ${extra}></div>`;
    if (m === 'tarjeta') return `<div class="grid grid-cols-2 gap-3">
        <div class="col-span-2">${f('p-titular', 'Nombre en la tarjeta', 'Como aparece en la tarjeta', 'autocomplete="cc-name" maxlength="60"')}</div>
        <div class="col-span-2">${f('p-num', 'Número de tarjeta', '4242 4242 4242 4242', 'inputmode="numeric" autocomplete="cc-number" maxlength="23"')}</div>
        ${f('p-vence', 'Vence (MM/AA)', '08/29', 'inputmode="numeric" autocomplete="cc-exp" maxlength="5"')}${f('p-cvv', 'CVV', '123', 'inputmode="numeric" autocomplete="cc-csc" maxlength="4" type="password"')}</div>`;
    if (m === 'transferencia') return `<div class="grid gap-3">
        <div class="field"><label for="p-banco">Banco de origen</label><select id="p-banco" class="input"><option value="">Selecciona…</option>${BANCOS.map((b) => `<option>${b}</option>`).join('')}</select></div>
        ${f('p-comp', 'N.º de comprobante', 'Ej. 00123456', 'maxlength="30"')}</div>`;
    return f('p-mail', 'Correo de tu cuenta PayPal', 'tucorreo@ejemplo.com', 'type="email" maxlength="100"');
  }

  function pasoPago(msg = '') {
    const d = datosReserva(), card = (v, t, sub) => `<label class="block"><input type="radio" name="pm" value="${v}" class="sr-only" ${pay.metodo === v ? 'checked' : ''}><span class="paycard"><span class="block font-semibold text-deep text-sm">${t}</span><span class="block text-xs text-tinta/60 mt-0.5">${sub}</span></span></label>`;
    paso(`
      <h3 id="pay-title" class="font-display text-2xl text-deep pr-10">Método de pago</h3>
      <p class="text-sm text-tinta/70 mt-1">Elige cómo pagar. Tu reserva se confirma en el momento del pago.</p>
      <div class="grid sm:grid-cols-3 gap-3 mt-5" id="pay-metodos">${card('tarjeta', 'Tarjeta', 'Crédito o débito')}${card('transferencia', 'Transferencia', 'Banco local')}${card('paypal', 'PayPal', 'Cuenta PayPal')}</div>
      <div id="pay-campos" class="mt-5">${camposPago(pay.metodo)}</div>
      <p id="pay-err" class="err mt-3 !text-sm" role="alert">${esc(msg)}</p>
      <p class="text-xs text-tinta/60 mt-2">Demostración: no se realiza ningún cobro real. Tarjeta de prueba: 4242 4242 4242 4242, cualquier fecha futura y CVV. No se guardan el número completo ni el CVV.</p>
      <div class="flex flex-wrap gap-3 mt-5">
        <button type="button" class="btn btn-primary" data-act="pay-submit">Pagar ${money(d.total)}</button>
        <button type="button" class="btn btn-outline" data-act="pay-back">Atrás</button>
      </div>`);
  }

  function leerPago() {
    const m = pay.metodo, v = (id) => ($(id)?.value ?? '').trim();
    if (m === 'tarjeta') return { metodo: m, titular: v('#p-titular'), numero: v('#p-num'), vence: v('#p-vence'), cvv: v('#p-cvv') };
    if (m === 'transferencia') return { metodo: m, banco: v('#p-banco'), comprobante: v('#p-comp') };
    return { metodo: m, email: v('#p-mail') };
  }

  async function pagar() {
    const pago = leerPago(), d = datosReserva();
    $('#pay-err').textContent = '';
    try { await api('/payments/validate', { method: 'POST', body: { pago } }); }
    catch (e) { if (e.status === 401) { state.user = null; renderAuth(); } $('#pay-err').textContent = e.message; return; }

    paso(`<div class="py-10 text-center" role="status" aria-live="polite"><div class="spinner" aria-hidden="true"></div>
      <h3 class="font-display text-2xl text-deep mt-6">Procesando tu pago…</h3><p class="text-sm text-tinta/70 mt-2">Por favor no cierres esta ventana.</p></div>`);
    const t0 = Date.now();
    let r = null, err = null;
    try {
      r = await api('/reservations', { method: 'POST', body: { idHabitacion: d.h.id, llegada: d.a, salida: d.b, huespedes: d.g, notas: pay.notas, rutas: state.cart, pago } });
    } catch (e) { err = e; }
    await new Promise((res) => setTimeout(res, Math.max(0, 2200 - (Date.now() - t0))));   // pantalla de carga mínima

    if (err) {
      if (err.status === 401) { state.user = null; renderAuth(); }
      paso(`<div class="py-6 text-center"><h3 class="font-display text-2xl text-[#8f2d2d]">No se pudo completar la reserva</h3>
        <p class="text-sm mt-3">${esc(err.message)}</p><p class="text-sm text-tinta/70 mt-2"><strong>No se realizó ningún cobro.</strong></p>
        <button class="btn btn-primary mt-6" data-act="pay-close">Elegir otra habitación o fechas</button></div>`);
      state.roomId = null; refreshRooms(); return;
    }
    state.ultima = r;
    paso(`<div class="py-4 text-center">
        <div class="mx-auto w-16 h-16 rounded-full bg-[#e3f1e8] text-[#1d5d36] flex items-center justify-center">${icon('check', 'w-8 h-8')}</div>
        <h3 id="pay-title" class="font-display text-3xl text-deep mt-5">¡Pago exitoso!</h3>
        <p class="mt-2 text-tinta/80">Tu habitación ha sido reservada.</p>
        <div class="card text-left text-sm mt-6 p-4 space-y-1.5">
          <div class="flex justify-between gap-3"><span class="text-tinta/60">Reserva</span><strong>#${r.id} · Factura ${esc(r.factura)}</strong></div>
          <div class="flex justify-between gap-3"><span class="text-tinta/60">Habitación</span><strong>N.º ${r.habitacion.numero} · ${esc(r.tipo.nombre)}</strong></div>
          <div class="flex justify-between gap-3"><span class="text-tinta/60">Fechas</span><strong>${fecha(r.llegada)} → ${fecha(r.salida)}</strong></div>
          <div class="flex justify-between gap-3"><span class="text-tinta/60">Pagado con</span><strong>${esc(r.pago.metodo)}</strong></div>
          <div class="flex justify-between gap-3 pt-2 border-t border-[var(--linea)]"><span class="text-tinta/60">Total pagado</span><strong class="font-display text-base text-deep">${money(r.pago.monto)}</strong></div>
        </div>
        <div class="flex flex-wrap justify-center gap-3 mt-6">
          <button class="btn btn-primary" data-act="pay-factura" data-focus>Ver factura</button>
          <button class="btn btn-outline" data-act="pay-mis">Ver mis reservaciones</button>
        </div></div>`);
    state.cart = []; saveCart(); state.roomId = null; $('#b-notas').value = '';
    renderRutas(); renderBookingRutas(); refreshRooms();
  }

  /* ================================== MIS RESERVAS ================================== */
  async function openMis() {
    if (!state.user) return openAuth('login');
    const body = $('#mis-body');
    body.innerHTML = '<div class="skeleton h-24"></div>';
    modal.open('modal-mis');
    try {
      const rs = await api('/reservations/mine'); state.mias = rs;
      body.innerHTML = rs.length ? rs.map((r) => `
        <article class="card p-5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h4 class="font-display text-lg text-deep">Reserva #${r.id} · ${esc(r.tipo.nombre)}</h4>
            <span class="badge b-${esc(r.estado)}">${esc(r.estado)}</span>
          </div>
          <p class="text-sm mt-2 text-tinta/80">Habitación <strong>${r.habitacion.numero}</strong> (nivel ${r.habitacion.nivel}) · ${fecha(r.llegada)} → ${fecha(r.salida)} · ${r.noches} noche${r.noches > 1 ? 's' : ''} · ${r.huespedes} huésped${r.huespedes > 1 ? 'es' : ''}</p>
          ${r.pago ? `<p class="text-sm mt-2 text-tinta/80">Pagado con ${esc(r.pago.metodo)} · factura ${esc(r.factura)}</p>` : ''}
          ${r.rutas.length ? `<p class="text-sm mt-2 text-tinta/80"><span class="text-cobre">${icon('route')}</span> ${r.rutas.map((x) => esc(x.nombre)).join(', ')}</p>` : ''}
          <div class="flex flex-wrap items-center justify-between gap-3 mt-4">
            <p class="text-sm">Total: <strong class="font-display text-deep text-base">${money(r.total)}</strong>
              <span class="text-xs text-tinta/60">(hospedaje ${money(r.totalHospedaje)} + rutas ${money(r.totalRutas)})</span></p>
            <div class="flex flex-wrap gap-2">${r.pago ? `<button class="btn btn-outline btn-sm" data-act="factura" data-id="${r.id}">Ver factura</button>` : ''}
            ${r.estado === 'Pendiente' ? `<button class="btn btn-danger btn-sm" data-act="cancelar" data-id="${r.id}">Cancelar solicitud</button>` : ''}</div>
          </div>
        </article>`).join('')
        : '<p class="text-sm text-tinta/70">Todavía no tienes reservas. ¡Elige tu habitación en la sección Reservar!</p>';
    } catch (e) { body.innerHTML = `<p class="text-sm text-[#8f2d2d]">${esc(e.message)}</p>`; }
  }

  async function cancelar(id) {
    if (!confirm(`¿Cancelar la solicitud #${id}? La habitación quedará libre para otros huéspedes.`)) return;
    try { await api(`/reservations/${id}/cancel`, { method: 'POST', body: {} }); toast('Solicitud cancelada.'); openMis(); refreshRooms(); }
    catch (e) { toast(e.message, true); }
  }

  /* ====================================== INIT ====================================== */
  function bindEvents() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]'); if (!el) return;
      const id = Number(el.dataset.id);
      switch (el.dataset.act) {
        case 'login': openAuth('login'); break;
        case 'logout': logout(); break;
        case 'mis': openMis(); break;
        case 'room': openRoom(id); break;
        case 'reservar-tipo':
          modal.close('modal-room'); state.tipoId = id; renderTiposReserva(); onHuespedes(); state.roomId = null; refreshRooms();
          $('#reservar').scrollIntoView({ behavior: 'smooth' }); break;
        case 'ruta': openRuta(id); break;
        case 'toggle-ruta': toggleRuta(id); break;
        case 'quitar-ruta': state.cart = state.cart.filter((x) => x !== id); saveCart(); renderRutas(); renderBookingRutas(); renderSummary(); break;
        case 'pick-room': state.roomId = id; renderRoomGrid(); renderSummary(); break;
        case 'cancelar': cancelar(id); break;
        case 'factura': CDS.verFactura(state.mias.find((x) => x.id === id)); break;
        case 'pay-go': pasoPago(); break;
        case 'pay-back': abrirConfirmacion(); break;
        case 'pay-close': modal.close('modal-pay'); break;
        case 'pay-submit': pagar(); break;
        case 'pay-factura': modal.close('modal-pay'); CDS.verFactura(state.ultima); break;
        case 'pay-mis': modal.close('modal-pay'); openMis(); break;
      }
    });
    document.addEventListener('change', (e) => { if (e.target.name === 'pm') { pay.metodo = e.target.value; $('#pay-campos').innerHTML = camposPago(pay.metodo); } });
    document.addEventListener('input', (e) => {
      if (e.target.id === 'p-num') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
      if (e.target.id === 'p-vence') { const d = e.target.value.replace(/\D/g, '').slice(0, 4); e.target.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; }
      if (e.target.id === 'p-cvv') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    });
    $('#tab-login').addEventListener('click', () => openAuth('login'));
    $('#tab-reg').addEventListener('click', () => openAuth('reg'));
    $('#form-login').addEventListener('submit', onLogin);
    $('#form-reg').addEventListener('submit', onRegister);
    $('#form-resena').addEventListener('submit', onResena);
    $('#btn-resena').addEventListener('click', () => { if (!state.user) { toast('Inicia sesión para escribir una reseña.'); openAuth('login'); } else modal.open('modal-resena'); });
    $('#b-submit').addEventListener('click', submit);
    $('#b-llegada').addEventListener('change', onFechas);
    $('#b-salida').addEventListener('change', onFechas);
    $('#b-huespedes').addEventListener('input', onHuespedes);
    $('#b-tipos').addEventListener('change', (e) => {
      state.tipoId = Number(e.target.value); state.roomId = null;
      const t = tipoActual(); $('#b-huespedes').max = t.capacidad;
      if (Number($('#b-huespedes').value) > t.capacidad) $('#b-huespedes').value = t.capacidad;
      onHuespedes(); refreshRooms();
    });
    $('#booking-form').addEventListener('submit', (e) => e.preventDefault());
    $('#menu-btn').addEventListener('click', () => {
      const nav = $('#mobile-nav'), open = nav.classList.toggle('hidden') === false;
      nav.classList.toggle('flex', open); $('#menu-btn').setAttribute('aria-expanded', open);
    });
    $$('#mobile-nav a').forEach((a) => a.addEventListener('click', () => { $('#mobile-nav').classList.add('hidden'); $('#mobile-nav').classList.remove('flex'); }));
    $('#ruta-x').addEventListener('click', () => { if (state.map) { state.map.remove(); state.map = null; } });
  }

  async function init() {
    modal.init();
    $('#menu-btn').innerHTML = icon('menu');
    $$('.modal-x').forEach((b) => (b.innerHTML = icon('close')));
    $('#ic-phone').innerHTML = icon('phone'); $('#ic-mail').innerHTML = icon('mail'); $('#ic-pin').innerHTML = icon('pin');
    $('#socials').innerHTML = [['instagram', 'Instagram', 'https://instagram.com'], ['facebook', 'Facebook', 'https://facebook.com'], ['xsocial', 'X', 'https://x.com'], ['youtube', 'YouTube', 'https://youtube.com']]
      .map(([i, n, u]) => `<a href="${u}" class="icon-ring" aria-label="${n}" target="_blank" rel="noopener noreferrer">${icon(i)}</a>`).join('');
    $('#exp-grid').innerHTML = EXPERIENCIAS.map((x) => `
      <article class="card overflow-hidden flex">
        <img src="assets/img/${x.img}.jpg" alt="${esc(x.t)}" class="w-2/5 object-cover" loading="lazy">
        <div class="p-5 flex flex-col justify-center"><h3 class="font-display font-semibold text-deep">${esc(x.t)}</h3><p class="text-sm text-tinta/70 mt-2 leading-6">${esc(x.d)}</p></div>
      </article>`).join('');

    const l = $('#b-llegada'), s = $('#b-salida');
    l.min = hoy(); l.value = hoy(7); s.min = hoy(1); s.value = hoy(10);

    bindEvents();
    renderAuth();
    renderBookingRutas();

    const [me, tipos, servicios, rutas] = await Promise.allSettled([
      api('/auth/me'), api('/rooms/types'), api('/services'), api('/routes'),
    ]);
    if (me.status === 'fulfilled') state.user = me.value;
    renderAuth();

    if (tipos.status === 'fulfilled') {
      state.tipos = tipos.value;
      state.tipoId = [...state.tipos].sort((a, b) => a.precio - b.precio)[0]?.id ?? null;
      renderTipos(); renderTiposReserva(); onHuespedes();
    } else fallo($('#room-cards'), tipos.reason);
    if (servicios.status === 'fulfilled') { state.servicios = servicios.value; renderServicios(); }
    else { fallo($('#srv-incluidos'), servicios.reason); }
    if (rutas.status === 'fulfilled') { state.rutas = rutas.value; state.cart = state.cart.filter((id) => state.rutas.some((r) => r.id === id)); renderRutas(); renderBookingRutas(); }
    else fallo($('#route-cards'), rutas.reason);

    cargarResenas();
    refreshRooms();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
