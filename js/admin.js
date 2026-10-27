/* Hotel Costa del Sol · panel de administración */
(() => {
  const { api, esc, icon, money, hoy, sumarDias, noches, fecha, toast, modal, setErr } = CDS;
  const $ = (s, r = document) => r.querySelector(s);
  const state = { rutas: [], reservas: [], actual: null, timer: null, tab: 'res' };

  /* ------------------------------ Sesión ------------------------------ */
  let listo = false;
  async function abrir() {
    $('#admin-root').hidden = false; document.body.style.overflow = 'hidden';
    try { history.replaceState(null, '', '#admin'); } catch { /* file:// restringido en algunos navegadores */ }
    if (!listo) { listo = true; $('#edit-x').innerHTML = icon('close'); $('#form-x').innerHTML = icon('close'); bind(); }
    try {
      const me = await api('/admin/me');
      me ? entrar(me) : mostrarLogin();
    } catch (e) { mostrarLogin(); $('#a-err').textContent = e.message; }
  }

  function cerrar() {
    $('#admin-root').hidden = true; document.body.style.overflow = '';
    try { if (location.hash === '#admin') history.replaceState(null, '', location.pathname + location.search); } catch { /* */ }
  }

  function mostrarLogin() { $('#panel-view').hidden = true; $('#login-view').hidden = false; $('#a-user').focus(); }

  async function entrar(admin) {
    $('#login-view').hidden = true; $('#panel-view').hidden = false;
    $('#admin-name').textContent = admin.nombre;
    try { state.rutas = await api('/routes'); } catch { state.rutas = []; }
    $('#o-llegada').value = hoy(); $('#o-salida').value = hoy(1);
    cargarReservas();
  }

  async function onLogin(ev) {
    ev.preventDefault();
    const u = $('#a-user'), p = $('#a-pass');
    setErr(u, u.value.trim() ? '' : 'Ingresa tu usuario'); setErr(p, p.value ? '' : 'Ingresa tu contraseña');
    if (!u.value.trim() || !p.value) return;
    try {
      const a = await api('/admin/login', { method: 'POST', body: { usuario: u.value.trim(), password: p.value } });
      p.value = ''; $('#a-err').textContent = ''; entrar(a);
    } catch (e) { $('#a-err').textContent = e.message; }
  }

  async function salir() {
    try { await api('/admin/logout', { method: 'POST', body: {} }); } catch { /* ignorar */ }
    cerrar(); toast('Sesión de administrador cerrada.');
  }

  /* ------------------------------ Reservas ------------------------------ */
  async function cargarReservas() {
    const q = new URLSearchParams();
    if ($('#f-q').value.trim()) q.set('q', $('#f-q').value.trim());
    if ($('#f-estado').value) q.set('estado', $('#f-estado').value);
    if ($('#f-vigentes').checked) q.set('desde', hoy());
    const tb = $('#tbody');
    try {
      const d = await api('/admin/reservations?' + q);
      state.reservas = d.reservas;
      $('#stats').innerHTML = [['Pendiente', 'Pendientes'], ['Confirmada', 'Confirmadas'], ['Cancelada', 'Canceladas']]
        .map(([k, t]) => `<div class="card p-4"><p class="eyebrow">${t}</p><p class="font-display text-3xl text-deep mt-1">${d.resumen[k] ?? 0}</p></div>`).join('');
      tb.innerHTML = d.reservas.length ? d.reservas.map((r) => `
        <tr class="border-b border-[var(--linea)] hover:bg-crema/50">
          <td class="p-3 font-semibold">#${r.id}</td>
          <td class="p-3"><span class="font-medium text-deep">${esc(r.cliente.nombre)}</span><br><span class="text-xs text-tinta/60">${esc(r.cliente.email)}</span></td>
          <td class="p-3">N.º <strong>${r.habitacion.numero}</strong><br><span class="text-xs text-tinta/60">${esc(r.tipo.nombre)} · nivel ${r.habitacion.nivel}</span></td>
          <td class="p-3">${fecha(r.llegada)} → ${fecha(r.salida)}<br><span class="text-xs text-tinta/60">${r.noches} noche${r.noches > 1 ? 's' : ''} · ${r.huespedes} huésp.</span></td>
          <td class="p-3">${r.rutas.length ? r.rutas.length : '<span class="text-tinta/40">—</span>'}</td>
          <td class="p-3 text-right font-medium">${money(r.total)}</td>
          <td class="p-3"><span class="badge b-${esc(r.estado)}">${esc(r.estado)}</span><br><span class="text-xs text-tinta/60">${r.pago ? (r.saldo > 0.005 ? 'Pago parcial' : 'Pagado') : 'Sin pago'}</span></td>
          <td class="p-3 text-right whitespace-nowrap">${r.estado === 'Pendiente' ? `<button class="btn btn-primary btn-sm" data-accept="${r.id}">Aceptar</button> ` : ''}<button class="btn btn-outline btn-sm" data-edit="${r.id}">Editar</button></td>
        </tr>`).join('') : '<tr><td colspan="8" class="p-8 text-center text-tinta/60">No hay reservas con esos filtros.</td></tr>';
    } catch (e) {
      if (e.status === 401) return mostrarLogin();
      tb.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-[#8f2d2d]">${esc(e.message)}</td></tr>`;
    }
  }

  /* --------------------------- Edición de una reserva --------------------------- */
  function abrirEdicion(r) {
    state.actual = r;
    const optRutas = state.rutas.filter((x) => !r.rutas.some((y) => y.idRuta === x.id))
      .map((x) => `<option value="${x.id}">${esc(x.nombre)} · ${money(x.costo)} p/p</option>`).join('');
    $('#edit-body').innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3 pr-10">
        <h3 id="edit-title" class="font-display text-2xl text-deep">Reserva #${r.id}</h3>
        <span class="badge b-${esc(r.estado)}">${esc(r.estado)}</span>
      </div>
      <p class="text-sm text-tinta/70 mt-1">${esc(r.cliente.nombre)} · ${esc(r.cliente.email)}${r.cliente.telefono ? ' · ' + esc(r.cliente.telefono) : ''} · creada ${esc(r.creada)}</p>

      ${(() => {
        const deuda = r.pago ? r.saldo : r.total;
        return `<div class="mt-3 text-sm flex flex-wrap items-center gap-3">
          ${r.pago ? `<span>Pago: <strong>${esc(r.pago.metodo)}</strong> · ${money(r.pago.monto)} · factura ${esc(r.factura)}</span><button type="button" class="btn btn-outline btn-sm" data-ver-factura>Ver factura</button>` : '<span class="text-[#8f2d2d] font-semibold">Sin pago registrado</span>'}
          ${deuda > 0.005 ? `<span class="text-cobre font-semibold">Pendiente: ${money(deuda)}</span><button type="button" class="btn btn-primary btn-sm" data-cobrar>Registrar pago de ${money(deuda)}</button>` : ''}
          ${deuda < -0.005 ? `<span class="text-cobre font-semibold">Saldo a favor del cliente: ${money(-deuda)}</span>` : ''}</div>`;
      })()}
      <div id="edit-err" class="err mt-3 !text-sm" role="alert"></div>

      <form id="form-edit" class="grid sm:grid-cols-3 gap-4 mt-4" novalidate>
        <div class="field"><label for="e-llegada">Llegada</label><input id="e-llegada" type="date" class="input" value="${r.llegada}"><p class="err"></p></div>
        <div class="field"><label for="e-salida">Salida (extender o acortar)</label><input id="e-salida" type="date" class="input" value="${r.salida}"><p class="err"></p></div>
        <div class="field"><label for="e-hab">N.º de habitación</label><input id="e-hab" type="number" min="1" max="300" class="input" value="${r.habitacion.numero}"><p class="err"></p></div>
        <div class="field"><label for="e-huesp">Huéspedes</label><input id="e-huesp" type="number" min="1" max="20" class="input" value="${r.huespedes}"><p class="err"></p></div>
        <div class="field"><label for="e-estado">Estado</label>
          <select id="e-estado" class="input">${['Pendiente', 'Confirmada', 'Cancelada'].map((s) => `<option ${s === r.estado ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field sm:col-span-3"><label for="e-notas">Solicitudes especiales</label><textarea id="e-notas" rows="2" maxlength="1000" class="input">${esc(r.notas || '')}</textarea></div>
        <div class="sm:col-span-3 flex flex-wrap items-center justify-between gap-3">
          <p id="e-calc" class="text-sm text-tinta/80"></p>
          <button class="btn btn-primary">Guardar cambios</button>
        </div>
      </form>

      <div class="mt-6 pt-5 border-t border-[var(--linea)] flex flex-wrap items-end gap-3">
        <div class="field"><label for="e-ext">Extender la estadía</label>
          <select id="e-ext" class="input">${[1, 2, 3, 5, 7, 14].map((n) => `<option value="${n}">+${n} noche${n > 1 ? 's' : ''}</option>`).join('')}</select></div>
        <button class="btn btn-outline" id="btn-extender" type="button">Extender (salida → nueva fecha)</button>
        <p class="text-xs text-tinta/60 grow min-w-[200px]">Si otra reserva ya ocupa la habitación en esas noches, el sistema lo rechaza para no sobrevender.</p>
      </div>

      <div class="mt-8 pt-6 border-t border-[var(--linea)]">
        <h4 class="font-display text-lg text-deep">Rutas y tours agregados</h4>
        ${r.rutas.length ? `<ul class="divide-y divide-[var(--linea)] mt-2">${r.rutas.map((x) => `
          <li class="py-3 flex items-center justify-between gap-3 text-sm">
            <span><strong class="text-deep">${esc(x.nombre)}</strong> <span class="text-tinta/60">· ${x.personas} persona${x.personas > 1 ? 's' : ''} × ${money(x.precioUnitario)} = ${money(x.subtotal)}</span></span>
            <button class="btn btn-danger btn-sm" data-del-ruta="${x.id}">${icon('trash')} Eliminar</button>
          </li>`).join('')}</ul>` : '<p class="text-sm text-tinta/60 mt-2">El cliente no agregó rutas.</p>'}
        ${optRutas ? `<div class="flex flex-wrap gap-3 items-end mt-4">
          <div class="field grow"><label for="e-nueva-ruta">Agregar ruta</label><select id="e-nueva-ruta" class="input">${optRutas}</select></div>
          <button class="btn btn-outline" id="btn-add-ruta">${icon('plus')} Agregar</button></div>` : ''}
      </div>

      <div class="mt-8 pt-6 border-t border-[var(--linea)] flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm">Total actual: <strong class="font-display text-xl text-deep">${money(r.total)}</strong>
          <span class="text-xs text-tinta/60">(hospedaje ${money(r.totalHospedaje)} + rutas ${money(r.totalRutas)})</span></p>
        <button class="btn btn-danger" id="btn-del-reserva">${icon('trash')} Eliminar reserva</button>
      </div>`;
    const calc = () => {
      const a = $('#e-llegada').value, b = $('#e-salida').value;
      $('#e-calc').textContent = a && b && b > a ? `${noches(a, b)} noche(s) × ${money(r.precioNoche)} = ${money(noches(a, b) * r.precioNoche)} de hospedaje (la tarifa pactada se conserva)` : '';
    };
    ['#e-llegada', '#e-salida'].forEach((s) => $(s).addEventListener('input', calc));
    calc();
    modal.open('modal-edit');
  }

  async function guardar(ev) {
    ev.preventDefault();
    const r = state.actual, a = $('#e-llegada'), b = $('#e-salida');
    setErr(a, a.value ? '' : 'Fecha requerida'); setErr(b, !b.value ? 'Fecha requerida' : b.value <= a.value ? 'Debe ser posterior a la llegada' : '');
    if (!a.value || !b.value || b.value <= a.value) return;
    $('#edit-err').textContent = '';
    try {
      const nuevo = await api(`/admin/reservations/${r.id}`, { method: 'PUT', body: {
        llegada: a.value, salida: b.value, numeroHabitacion: Number($('#e-hab').value), huespedes: Number($('#e-huesp').value),
        estado: $('#e-estado').value, notas: $('#e-notas').value.trim(),
      } });
      toast(`Reserva #${r.id} actualizada.`);
      abrirEdicion(nuevo); refrescarVistas();
    } catch (e) {
      if (e.status === 401) return mostrarLogin();
      $('#edit-err').textContent = e.message;   // incluye el aviso de sobreventa (409)
    }
  }

  async function accionRuta(fn, ok) {
    try { const nuevo = await fn(); toast(ok); abrirEdicion(nuevo); refrescarVistas(); }
    catch (e) { $('#edit-err').textContent = e.message; }
  }

  async function eliminarReserva() {
    const r = state.actual;
    if (!confirm(`¿Eliminar definitivamente la reserva #${r.id} de ${r.cliente.nombre}? Esta acción no se puede deshacer.\n\nSi solo quieres liberar la habitación, cámbiala a «Cancelada».`)) return;
    try { await api(`/admin/reservations/${r.id}`, { method: 'DELETE', body: {} }); modal.close('modal-edit'); toast('Reserva eliminada.'); refrescarVistas(); }
    catch (e) { $('#edit-err').textContent = e.message; }
  }

  /* ------------------------------ Ocupación ------------------------------ */
  async function cargarOcupacion() {
    const a = $('#o-llegada').value, b = $('#o-salida').value;
    if (!a || !b || b <= a) { $('#o-resumen').textContent = 'La fecha final debe ser posterior a la inicial.'; return; }
    try {
      const d = await api(`/admin/occupancy?llegada=${a}&salida=${b}`);
      $('#o-resumen').innerHTML = `<strong class="text-deep">${d.ocupadas}</strong> ocupadas · <strong class="text-deep">${d.libres}</strong> libres de ${d.habitaciones.length}`;
      const nombres = { 2: 'Nivel 2 · Estándar (1–100)', 3: 'Nivel 3 · Deluxe (101–200)', 4: 'Nivel 4 · Suites Ocean View (201–300)' };
      $('#ocu-niveles').innerHTML = [2, 3, 4].map((n) => `
        <div><h4 class="font-display text-lg text-deep mb-2">${nombres[n]}</h4>
          <div class="room-grid" style="grid-template-columns:repeat(10,minmax(0,1fr))">${d.habitaciones.filter((h) => h.nivel === n).map((h) => h.ocupada
            ? `<button class="room" style="background:${h.estado === 'Confirmada' ? 'var(--deep)' : 'var(--cobre)'};color:#fff;border-color:transparent;text-decoration:none" data-res="${h.idReserva}" title="${esc(h.cliente)} · reserva #${h.idReserva} (${esc(h.estado)})">${h.numero}</button>`
            : `<span class="room flex items-center justify-center cursor-default" style="cursor:default">${h.numero}</span>`).join('')}</div></div>`).join('');
    } catch (e) { if (e.status === 401) return mostrarLogin(); toast(e.message, true); }
  }

  function refrescarVistas() { TABS[state.tab || 'res'](); if (state.tab !== 'res') cargarReservas(); }


  /* ------------------------- Utilidades de formularios ------------------------- */
  const fld = (id, label, type, val = '', extra = '') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" class="input" value="${esc(val)}" ${extra}><p class="err"></p></div>`;
  function abrirForm(titulo, html, onSubmit) {
    $('#form-title').textContent = titulo; $('#form-err').textContent = ''; $('#form-body').innerHTML = html;
    state.onForm = onSubmit; modal.open('modal-form');
  }
  async function enviar(fn, ok) {
    try { await fn(); modal.close('modal-form'); toast(ok); refrescarVistas(); }
    catch (e) { if (e.status === 401) return mostrarLogin(); $('#form-err').textContent = e.message; }
  }
  const vacio = (cols, msg) => `<tr><td colspan="${cols}" class="p-8 text-center text-tinta/60">${msg}</td></tr>`;

  /* ------------------------------ Aceptar / extender ------------------------------ */
  async function aceptar(id) {
    try { await api(`/admin/reservations/${id}`, { method: 'PUT', body: { estado: 'Confirmada' } }); toast(`Reserva #${id} confirmada.`); refrescarVistas(); }
    catch (e) { toast(e.message, true); }
  }
  async function extender() {
    const r = state.actual, n = Number($('#e-ext').value), nueva = sumarDias(r.salida, n);
    try { const nuevo = await api(`/admin/reservations/${r.id}`, { method: 'PUT', body: { salida: nueva } }); toast(`Estadía extendida hasta el ${fecha(nueva)}.`); abrirEdicion(nuevo); refrescarVistas(); }
    catch (e) { $('#edit-err').textContent = e.message; }
  }

  /* ------------------------------ Nueva reserva (con mapa) ------------------------------ */
  async function abrirNuevaReserva() {
    let clientes = [];
    try { clientes = await api('/admin/clients'); } catch (e) { return toast(e.message, true); }
    if (!clientes.length) return toast('Primero agrega un cliente en la pestaña «Clientes».', true);
    state.formHab = null;
    abrirForm('Nueva reserva', `
      <div class="grid sm:grid-cols-3 gap-4 mt-4">
        <div class="field sm:col-span-3"><label for="n-cli">Cliente</label><select id="n-cli" class="input">${clientes.map((c) => `<option value="${c.id}">${esc(c.nombre)} · ${esc(c.email)}</option>`).join('')}</select></div>
        ${fld('n-llegada', 'Llegada', 'date', hoy())}${fld('n-salida', 'Salida', 'date', hoy(1))}${fld('n-huesp', 'Huéspedes', 'number', 1, 'min="1" max="4"')}
        <div class="field"><label for="n-estado">Estado</label><select id="n-estado" class="input"><option>Confirmada</option><option>Pendiente</option></select></div>
        <div class="field sm:col-span-2"><label for="n-notas">Solicitudes especiales</label><input id="n-notas" class="input" maxlength="1000"></div>
        <div class="field"><label for="n-pago">Pago recibido</label><select id="n-pago" class="input"><option>Efectivo en recepción</option><option>Tarjeta (terminal del hotel)</option><option>Transferencia bancaria</option><option value="">Sin pago aún</option></select></div>
      </div>
      <p class="text-sm mt-5 font-semibold text-deep">Habitación <span id="n-sel" class="font-normal text-tinta/70">(elige una disponible)</span></p>
      <div class="flex flex-wrap gap-5 text-xs mt-2 text-tinta/70">
        <span class="inline-flex items-center gap-2"><i class="inline-block w-4 h-3 border border-deep bg-white"></i>Libre</span>
        <span class="inline-flex items-center gap-2"><i class="inline-block w-4 h-3 bg-deep"></i>Elegida</span>
        <span class="inline-flex items-center gap-2"><i class="inline-block w-4 h-3" style="background:var(--ocupada)"></i>Ocupada en esas fechas (no se puede elegir)</span>
      </div>
      <div id="n-rooms" class="mt-3 space-y-5"></div>
      <div class="flex justify-end mt-6"><button class="btn btn-primary">Crear reserva</button></div>`, crearReservaAdmin);
    ['#n-llegada', '#n-salida'].forEach((q) => $(q).addEventListener('change', () => { state.formHab = null; cargarDisp(); }));
    cargarDisp();
  }
  async function cargarDisp() {
    const a = $('#n-llegada').value, b = $('#n-salida').value, box = $('#n-rooms');
    if (!a || !b || b <= a) { box.innerHTML = '<p class="text-sm text-[#8f2d2d]">La salida debe ser posterior a la llegada.</p>'; return; }
    try { state.disp = await api(`/admin/availability?llegada=${a}&salida=${b}`); pintarHabitaciones(); }
    catch (e) { box.innerHTML = `<p class="text-sm text-[#8f2d2d]">${esc(e.message)}</p>`; }
  }
  function pintarHabitaciones() {
    const nom = { 2: 'Nivel 2 · Estándar (1–100)', 3: 'Nivel 3 · Deluxe (101–200)', 4: 'Nivel 4 · Suites (201–300)' }, nivel = (n) => (n <= 100 ? 2 : n <= 200 ? 3 : 4);
    $('#n-rooms').innerHTML = [2, 3, 4].map((l) => `<div><p class="text-xs uppercase tracking-wider text-tinta/60 mb-1">${nom[l]}</p><div class="room-grid" style="grid-template-columns:repeat(10,minmax(0,1fr))">${
      state.disp.filter((h) => nivel(h.numero) === l).map((h) => `<button type="button" class="room${h.numero === state.formHab ? ' sel' : ''}" ${h.disponible ? `data-pick-hab="${h.numero}"` : 'disabled'} aria-label="Habitación ${h.numero} ${h.disponible ? 'disponible' : 'ocupada'}">${h.numero}</button>`).join('')}</div></div>`).join('');
    $('#n-sel').textContent = state.formHab ? `N.º ${state.formHab}` : '(elige una disponible)';
  }
  function crearReservaAdmin() {
    if (!state.formHab) { $('#form-err').textContent = 'Selecciona una habitación disponible en el mapa.'; return; }
    enviar(() => api('/admin/reservations', { method: 'POST', body: {
      idCliente: Number($('#n-cli').value), numeroHabitacion: state.formHab, llegada: $('#n-llegada').value, salida: $('#n-salida').value,
      huespedes: Number($('#n-huesp').value), estado: $('#n-estado').value, notas: $('#n-notas').value.trim(), metodoPago: $('#n-pago').value } }), 'Reserva creada.');
  }

  /* --------------------------------- Clientes --------------------------------- */
  async function cargarClientes() {
    const tb = $('#tbody-cli'), q = $('#c-q').value.trim().toLowerCase();
    try {
      state.clientes = await api('/admin/clients');
      const l = state.clientes.filter((c) => !q || c.nombre.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
      tb.innerHTML = l.length ? l.map((c) => `<tr class="border-b border-[var(--linea)] hover:bg-crema/50">
        <td class="p-3 font-semibold">#${c.id}</td>
        <td class="p-3"><span class="font-medium text-deep">${esc(c.nombre)}</span><br><span class="text-xs text-tinta/60">${esc(c.email)}${c.puedeIngresar ? '' : ' · cuenta de ejemplo'}</span></td>
        <td class="p-3">${esc(c.telefono || '—')}</td><td class="p-3">${esc((c.registro || '').slice(0, 10))}</td>
        <td class="p-3">${c.reservas} <span class="text-xs text-tinta/60">(${c.vigentes} vigente${c.vigentes === 1 ? '' : 's'})</span></td>
        <td class="p-3 text-right whitespace-nowrap"><button class="btn btn-outline btn-sm" data-cli-edit="${c.id}">Editar</button> <button class="btn btn-danger btn-sm" data-cli-del="${c.id}">${icon('trash')} Eliminar</button></td></tr>`).join('') : vacio(6, 'No hay clientes.');
    } catch (e) { if (e.status === 401) return mostrarLogin(); tb.innerHTML = vacio(6, esc(e.message)); }
  }
  function formCliente(c) {
    abrirForm(c ? `Editar cliente #${c.id}` : 'Agregar cliente', `
      <div class="grid sm:grid-cols-2 gap-4 mt-4">
        ${fld('c-nombre', 'Nombre completo', 'text', c?.nombre, 'maxlength="100"')}${fld('c-email', 'Correo', 'email', c?.email, 'maxlength="100"')}
        ${fld('c-tel', 'Teléfono (opcional)', 'tel', c?.telefono || '')}${fld('c-pass', c ? 'Nueva contraseña (vacío = no cambiar)' : 'Contraseña (8+, letras y números)', 'password', '', 'autocomplete="new-password"')}
      </div><div class="flex justify-end mt-6"><button class="btn btn-primary">${c ? 'Guardar' : 'Agregar'}</button></div>`,
    () => {
      const body = { nombre: $('#c-nombre').value, email: $('#c-email').value, telefono: $('#c-tel').value, password: $('#c-pass').value };
      enviar(() => api(c ? `/admin/clients/${c.id}` : '/admin/clients', { method: c ? 'PUT' : 'POST', body }), c ? 'Cliente actualizado.' : 'Cliente agregado.');
    });
  }
  async function eliminarCliente(id) {
    const c = state.clientes.find((x) => x.id === id);
    if (!confirm(`¿Eliminar a ${c.nombre}?\n\nSe borrarán también sus ${c.reservas} reserva(s), rutas y reseñas, y sus habitaciones quedarán libres. No se puede deshacer.`)) return;
    try { const r = await api(`/admin/clients/${id}`, { method: 'DELETE', body: {} }); toast(`Cliente eliminado (${r.reservasEliminadas} reservas liberadas).`); refrescarVistas(); }
    catch (e) { toast(e.message, true); }
  }

  /* ---------------------------------- Rutas ---------------------------------- */
  const IMGS_RUTA = ['ruta-tunco', 'ruta-imposible', 'ruta-flores', 'ruta-coatepeque', 'ruta-tazumal', 'ruta-libertad'];
  async function cargarRutas() {
    const tb = $('#tbody-rut');
    try {
      state.rutasAdm = await api('/admin/routes');
      tb.innerHTML = state.rutasAdm.length ? state.rutasAdm.map((r) => `<tr class="border-b border-[var(--linea)] hover:bg-crema/50">
        <td class="p-3"><span class="font-medium text-deep">${esc(r.nombre)}</span><br><span class="text-xs text-tinta/60">${esc(r.duracion)} · ${r.lugares.length} lugares</span></td>
        <td class="p-3">${r.distanciaKm} km</td><td class="p-3">${esc(r.dificultad)}</td><td class="p-3 text-right">${money(r.costo)}</td>
        <td class="p-3">${r.usos}</td><td class="p-3">${r.activa ? 'Sí' : '<span class="text-tinta/50">Oculta</span>'}</td>
        <td class="p-3 text-right whitespace-nowrap"><button class="btn btn-outline btn-sm" data-rut-edit="${r.id}">Editar</button> <button class="btn btn-danger btn-sm" data-rut-del="${r.id}">${icon('trash')} Eliminar</button></td></tr>`).join('') : vacio(7, 'No hay rutas.');
    } catch (e) { if (e.status === 401) return mostrarLogin(); tb.innerHTML = vacio(7, esc(e.message)); }
  }
  function formRuta(r) {
    abrirForm(r ? `Editar ruta` : 'Agregar ruta', `
      <div class="grid sm:grid-cols-3 gap-4 mt-4">
        <div class="sm:col-span-3">${fld('r-nombre', 'Nombre', 'text', r?.nombre, 'maxlength="100"')}</div>
        <div class="field sm:col-span-3"><label for="r-desc">Descripción</label><textarea id="r-desc" rows="2" maxlength="600" class="input">${esc(r?.descripcion || '')}</textarea></div>
        ${fld('r-km', 'Distancia (km)', 'number', r?.distanciaKm ?? '', 'min="0" step="0.1"')}${fld('r-dur', 'Duración (ej. 1h 15min)', 'text', r?.duracion || '', 'maxlength="20"')}
        <div class="field"><label for="r-dif">Dificultad</label><select id="r-dif" class="input">${['Baja', 'Media', 'Alta'].map((d) => `<option ${d === r?.dificultad ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
        ${fld('r-costo', 'Costo por persona ($)', 'number', r?.costo ?? '', 'min="0" step="0.5"')}${fld('r-lat', 'Latitud', 'number', r?.lat ?? '', 'step="any"')}${fld('r-lng', 'Longitud', 'number', r?.lng ?? '', 'step="any"')}
        <div class="field sm:col-span-2"><label for="r-lug">Lugares (uno por línea)</label><textarea id="r-lug" rows="3" class="input">${esc((r?.lugares || []).join('\n'))}</textarea></div>
        <div class="field"><label for="r-img">Imagen</label><select id="r-img" class="input">${IMGS_RUTA.map((i) => `<option value="assets/img/${i}.jpg" ${r?.imagen === `assets/img/${i}.jpg` ? 'selected' : ''}>${i.replace('ruta-', '')}</option>`).join('')}</select>
          <label class="flex items-center gap-2 text-sm mt-3"><input type="checkbox" id="r-act" ${r?.activa === false ? '' : 'checked'}> Visible en el sitio</label></div>
      </div><div class="flex justify-end mt-6"><button class="btn btn-primary">${r ? 'Guardar' : 'Agregar'}</button></div>`,
    () => {
      const body = { nombre: $('#r-nombre').value, descripcion: $('#r-desc').value, distanciaKm: $('#r-km').value, duracion: $('#r-dur').value, dificultad: $('#r-dif').value,
        costo: $('#r-costo').value, lat: $('#r-lat').value, lng: $('#r-lng').value, lugares: $('#r-lug').value, imagen: $('#r-img').value, activa: $('#r-act').checked };
      enviar(() => api(r ? `/admin/routes/${r.id}` : '/admin/routes', { method: r ? 'PUT' : 'POST', body }), r ? 'Ruta actualizada.' : 'Ruta agregada.');
    });
  }
  async function eliminarRuta(id) {
    const r = state.rutasAdm.find((x) => x.id === id);
    if (!confirm(`¿Eliminar la ruta «${r.nombre}»?\n\nSe quitará del catálogo y de ${r.usos} reserva(s) que la tienen (sus totales se recalculan).\nSi solo quieres ocultarla, edítala y desmarca «Visible».`)) return;
    try { await api(`/admin/routes/${id}`, { method: 'DELETE', body: {} }); toast('Ruta eliminada.'); refrescarVistas(); } catch (e) { toast(e.message, true); }
  }

  /* --------------------------------- Reseñas --------------------------------- */
  async function cargarResenas() {
    const tb = $('#tbody-rev');
    try {
      const l = await api('/admin/reviews');
      tb.innerHTML = l.length ? l.map((r) => `<tr class="border-b border-[var(--linea)]"><td class="p-3 font-medium text-deep">${esc(r.cliente)}</td><td class="p-3">${esc(r.pais)}</td><td class="p-3">${r.calificacion}/5</td>
        <td class="p-3 max-w-md">${esc(r.comentario)}</td><td class="p-3 text-right"><button class="btn btn-danger btn-sm" data-rev-del="${r.id}">${icon('trash')} Eliminar</button></td></tr>`).join('') : vacio(5, 'No hay reseñas.');
    } catch (e) { if (e.status === 401) return mostrarLogin(); tb.innerHTML = vacio(5, esc(e.message)); }
  }
  async function eliminarResena(id) {
    if (!confirm('¿Eliminar esta reseña?')) return;
    try { await api(`/admin/reviews/${id}`, { method: 'DELETE', body: {} }); toast('Reseña eliminada.'); cargarResenas(); } catch (e) { toast(e.message, true); }
  }

  /* ------------------------------ Base de datos ------------------------------ */
  function exportarBD() {
    const url = URL.createObjectURL(new Blob([LocalAPI.exportar()], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = `costa-del-sol-respaldo-${hoy()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Copia descargada.');
  }
  function importarBD(ev) {
    const f = ev.target.files[0]; if (!f) return;
    if (!confirm('Esto reemplaza TODOS los datos actuales por los del archivo. ¿Continuar?')) { ev.target.value = ''; return; }
    const rd = new FileReader();
    rd.onload = () => { try { LocalAPI.importar(String(rd.result)); toast('Copia importada.'); location.reload(); } catch (e) { toast(e.message, true); } };
    rd.readAsText(f); ev.target.value = '';
  }
  function reiniciarBD() {
    if (!confirm('¿Borrar TODOS los datos y volver a los de ejemplo? Esto no se puede deshacer.')) return;
    LocalAPI.reiniciar(); toast('Base reiniciada.'); location.reload();
  }
  async function cambiarPass(ev) {
    ev.preventDefault();
    const a = $('#p-actual'), n = $('#p-nueva');
    try { await api('/admin/password', { method: 'POST', body: { actual: a.value, nueva: n.value } }); a.value = n.value = ''; setErr(a, ''); setErr(n, ''); toast('Contraseña actualizada.'); }
    catch (e) { setErr(a, e.errors.actual || ''); setErr(n, e.errors.nueva || ''); if (!Object.keys(e.errors).length) toast(e.message, true); }
  }

  /* ------------------------------ Eventos ------------------------------ */
  const TABS = { res: cargarReservas, ocu: cargarOcupacion, cli: cargarClientes, rut: cargarRutas, rev: cargarResenas, bd: () => {} };
  function tab(cual) {
    Object.keys(TABS).forEach((k) => { $('#view-' + k).hidden = k !== cual; });
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => {
      const on = b.dataset.tab === cual;
      b.className = 'px-5 py-3 text-sm font-semibold border-b-2 whitespace-nowrap ' + (on ? 'border-deep text-deep' : 'border-transparent text-tinta/60');
      b.setAttribute('aria-selected', on);
    });
    state.tab = cual; TABS[cual]();
  }

  async function abrirPorId(id) {
    try { abrirEdicion(await api(`/admin/reservations/${id}`)); } catch (e) { toast(e.message, true); }
  }

  function bind() {
    $('#form-admin').addEventListener('submit', onLogin);
    $('#btn-salir').addEventListener('click', salir);
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.addEventListener('click', () => tab(b.dataset.tab)));
    $('#c-q').addEventListener('input', () => { clearTimeout(state.timer); state.timer = setTimeout(cargarClientes, 250); });
    $('#btn-nueva-res').addEventListener('click', abrirNuevaReserva);
    $('#btn-nuevo-cli').addEventListener('click', () => formCliente());
    $('#btn-nueva-rut').addEventListener('click', () => formRuta());
    $('#btn-export').addEventListener('click', exportarBD);
    $('#file-import').addEventListener('change', importarBD);
    $('#btn-reset').addEventListener('click', reiniciarBD);
    $('#form-pass').addEventListener('submit', cambiarPass);
    $('#f-q').addEventListener('input', () => { clearTimeout(state.timer); state.timer = setTimeout(cargarReservas, 300); });
    $('#f-estado').addEventListener('change', cargarReservas);
    $('#f-vigentes').addEventListener('change', cargarReservas);
    $('#o-llegada').addEventListener('change', () => { if ($('#o-salida').value <= $('#o-llegada').value) $('#o-salida').value = sumarDias($('#o-llegada').value, 1); cargarOcupacion(); });
    $('#o-salida').addEventListener('change', cargarOcupacion);

    document.addEventListener('click', (e) => {
      const ed = e.target.closest('[data-edit]'), rs = e.target.closest('[data-res]'), dr = e.target.closest('[data-del-ruta]');
      const t = (a) => e.target.closest(`[data-${a}]`);
      if (t('ver-factura')) CDS.verFactura(state.actual);
      else if (t('cobrar')) accionRuta(() => api(`/admin/reservations/${state.actual.id}/payment`, { method: 'POST', body: {} }), 'Pago registrado.');
      else if (t('accept')) aceptar(t('accept').dataset.accept);
      else if (e.target.closest('#btn-extender')) extender();
      else if (t('cli-edit')) formCliente(state.clientes.find((c) => c.id === Number(t('cli-edit').dataset.cliEdit)));
      else if (t('cli-del')) eliminarCliente(Number(t('cli-del').dataset.cliDel));
      else if (t('rut-edit')) formRuta(state.rutasAdm.find((r) => r.id === Number(t('rut-edit').dataset.rutEdit)));
      else if (t('rut-del')) eliminarRuta(Number(t('rut-del').dataset.rutDel));
      else if (t('rev-del')) eliminarResena(Number(t('rev-del').dataset.revDel));
      else if (t('pick-hab')) { state.formHab = Number(t('pick-hab').dataset.pickHab); pintarHabitaciones(); }
      else if (ed) abrirPorId(ed.dataset.edit);
      else if (rs) abrirPorId(rs.dataset.res);
      else if (dr) {
        if (confirm('¿Eliminar esta ruta de la reserva? El total se recalculará.'))
          accionRuta(() => api(`/admin/reservations/${state.actual.id}/routes/${dr.dataset.delRuta}`, { method: 'DELETE', body: {} }), 'Ruta eliminada de la reserva.');
      } else if (e.target.closest('#btn-add-ruta')) {
        const idRuta = Number($('#e-nueva-ruta').value);
        accionRuta(() => api(`/admin/reservations/${state.actual.id}/routes`, { method: 'POST', body: { idRuta } }), 'Ruta agregada.');
      } else if (e.target.closest('#btn-del-reserva')) eliminarReserva();
    });
    document.addEventListener('submit', (e) => { if (e.target.id === 'form-edit') guardar(e); else if (e.target.id === 'form-generic') { e.preventDefault(); state.onForm?.(); } });
  }

  /* Entradas al panel: logo (menú), enlace del pie de página o dirección #admin */
  const menu = () => document.getElementById('logo-menu');
  const cerrarMenu = () => { if (menu()) { menu().hidden = true; document.getElementById('logo-btn')?.setAttribute('aria-expanded', 'false'); } };
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-admin-open]')) { e.preventDefault(); cerrarMenu(); abrir(); return; }
    if (e.target.closest('[data-admin-close]')) { cerrar(); return; }
    const logo = e.target.closest('#logo-btn');
    if (logo) { e.preventDefault(); menu().hidden = !menu().hidden; logo.setAttribute('aria-expanded', String(!menu().hidden)); return; }
    if (!e.target.closest('#logo-menu')) cerrarMenu(); else if (e.target.closest('#logo-menu a')) cerrarMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMenu(); });
  document.addEventListener('DOMContentLoaded', () => { if (location.hash === '#admin') abrir(); });
})();
