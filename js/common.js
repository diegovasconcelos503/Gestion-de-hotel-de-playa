/* Utilidades compartidas: cliente de la API, escape XSS, iconos, toasts, formato */
window.CDS = (() => {
  class ApiError extends Error {
    constructor(message, status, errors) { super(message); this.status = status; this.errors = errors || {}; }
  }

  /** Misma interfaz que tenía la API PHP, pero resuelta por la base de datos local (js/localapi.js): no requiere servidor. */
  async function api(path, { method = 'GET', body } = {}) {
    try {
      return LocalAPI.handle(path, method, body);
    } catch (e) {
      if (e && e.isApi) throw new ApiError(e.message, e.status, e.errors);
      console.error(e);
      throw new ApiError('Error inesperado en la base de datos local.', 500);
    }
  }

  /** Escapa texto para insertarlo en HTML (prevención de XSS). */
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const P = {
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    instagram: '<rect width="20" height="20" x="2" y="2" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><path d="M17.5 6.5h.01"/>',
    facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
    xsocial: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    youtube: '<path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/>',
    wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.86a10 10 0 0 1 14 0"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/>',
    pool: '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
    restaurant: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    gym: '<path d="M6 7v10"/><path d="M18 7v10"/><path d="M3 10v4"/><path d="M21 10v4"/><path d="M6 12h12"/>',
    concierge: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    spa: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
    tours: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
    surf: '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 14c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    menu: '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  };
  const icon = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
  const stars = (n) => `<span class="inline-flex gap-0.5 text-cobre" role="img" aria-label="${n} de 5 estrellas">${Array.from({ length: 5 }, (_, i) => icon('star', i < n ? 'fill' : '')).join('')}</span>`;

  const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pad = (n) => String(n).padStart(2, '0');
  const hoy = (offsetDias = 0) => { const d = new Date(); d.setDate(d.getDate() + offsetDias); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const sumarDias = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const noches = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  const fecha = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  let toastTimer;
  function toast(msg, error = false) {
    document.querySelector('.toast')?.remove();
    const t = document.createElement('div');
    t.className = 'toast' + (error ? ' error' : '');
    t.setAttribute('role', error ? 'alert' : 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 4500);
  }

  const modal = {
    open(id) { const m = document.getElementById(id); m.hidden = false; document.body.style.overflow = 'hidden'; m.querySelector('[data-focus]')?.focus(); },
    close(id) { const m = document.getElementById(id); if (m) m.hidden = true; if (!document.querySelector('.modal:not([hidden])')) document.body.style.overflow = ''; },
    init() {
      document.addEventListener('click', (e) => {
        const c = e.target.closest('[data-close]');
        if (c) CDS.modal.close(c.closest('.modal').id);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') document.querySelectorAll('.modal:not([hidden])').forEach((m) => CDS.modal.close(m.id));
      });
    },
  };


  /** Factura imprimible de una reserva pagada (r = objeto de reserva devuelto por la API). */
  function verFactura(r) {
    if (!r || !r.pago) return toast('Esta reserva todavía no tiene un pago registrado.', true);
    const row = (a, b, bold) => `<tr><td class="py-2 pr-3 ${bold ? 'font-semibold' : ''}">${a}</td><td class="py-2 text-right ${bold ? 'font-semibold' : ''}">${b}</td></tr>`;
    const dato = (k, v) => `<div><p class="eyebrow">${k}</p><p class="text-sm mt-0.5">${v}</p></div>`;
    const saldo = r.saldo ?? 0;
    document.getElementById('fac-body').innerHTML = `
      <div class="p-8 md:p-10" id="factura-doc">
        <div class="flex flex-wrap justify-between gap-4 items-start">
          <div><p class="font-display text-2xl font-bold text-deep tracking-wide">COSTA DEL SOL</p>
            <p class="text-xs text-tinta/60 mt-1">Hotel boutique · Costa del Sol, La Paz, El Salvador</p></div>
          <div class="text-right"><p class="eyebrow">Factura</p><p class="font-display text-2xl text-deep">${esc(r.factura)}</p>
            <p class="text-xs text-tinta/60">Emitida: ${esc(r.pago.fecha)}</p></div>
        </div>
        <div class="mt-5 inline-block rounded-sm bg-[#e3f1e8] text-[#1d5d36] text-xs font-semibold tracking-wider px-3 py-1">${saldo > 0.005 ? 'PAGO PARCIAL' : 'PAGADO'}</div>

        <div class="grid sm:grid-cols-2 gap-x-8 gap-y-4 mt-6 pt-6 border-t border-[var(--linea)]">
          ${dato('Huésped', `<strong>${esc(r.cliente.nombre)}</strong><br>${esc(r.cliente.email)}${r.cliente.telefono ? '<br>' + esc(r.cliente.telefono) : ''}`)}
          ${dato('Reserva', `N.º <strong>${r.id}</strong> · ${esc(r.tipo.nombre)}`)}
          ${dato('Habitación', `N.º <strong>${r.habitacion.numero}</strong> · Nivel ${r.habitacion.nivel}`)}
          ${dato('Huéspedes', `${r.huespedes} persona${r.huespedes > 1 ? 's' : ''}`)}
          ${dato('Llegada', esc(fecha(r.llegada)))}${dato('Salida', `${esc(fecha(r.salida))} <span class="text-tinta/60">(hasta las 12:00 m.)</span>`)}
        </div>
        ${r.notas ? `<p class="text-sm mt-4"><span class="eyebrow">Solicitudes especiales</span><br>${esc(r.notas)}</p>` : ''}

        <table class="w-full text-sm mt-7"><thead class="text-left text-xs uppercase tracking-wider text-tinta/60 border-b border-[var(--linea)]"><tr><th class="pb-2">Concepto</th><th class="pb-2 text-right">Importe</th></tr></thead><tbody class="divide-y divide-[var(--linea)]">
          ${row(`Hospedaje · ${r.noches} noche${r.noches > 1 ? 's' : ''} × ${money(r.precioNoche)}`, money(r.totalHospedaje))}
          ${r.rutas.map((x) => row(`Ruta: ${esc(x.nombre)} · ${x.personas} × ${money(x.precioUnitario)}`, money(x.subtotal))).join('')}
        </tbody><tfoot>
          ${row('Total', money(r.total), true)}
          ${row('Pagado', money(r.pago.monto))}
          ${Math.abs(saldo) > 0.005 ? row(saldo > 0 ? 'Saldo pendiente (se paga en recepción)' : 'Saldo a favor del huésped', money(Math.abs(saldo)), true) : ''}
        </tfoot></table>

        <div class="grid sm:grid-cols-2 gap-x-8 gap-y-4 mt-7 pt-6 border-t border-[var(--linea)]">
          ${dato('Método de pago', esc(r.pago.metodo))}${dato('Detalle', esc(r.pago.detalle))}
          ${dato('Referencia', esc(r.pago.referencia || '—'))}${dato('Fecha del pago', esc(r.pago.fecha))}
        </div>
        <p class="text-xs text-tinta/60 mt-8">Gracias por elegir Hotel Costa del Sol. Presenta esta factura (impresa o en tu teléfono) al llegar a recepción.</p>
        <div class="flex flex-wrap gap-3 mt-6 no-print">
          <button class="btn btn-primary" id="fac-print" type="button">Imprimir / guardar PDF</button>
          <button class="btn btn-outline" data-close type="button">Cerrar</button>
        </div>
      </div>`;
    document.getElementById('fac-x').innerHTML = icon('close');
    document.getElementById('fac-print').onclick = () => window.print();
    modal.open('modal-factura');
  }

  /** Valida el campo y muestra el mensaje en el <p class="err"> hermano. */
  function setErr(input, msg) {
    input.classList.toggle('invalid', !!msg);
    const p = input.parentElement.querySelector('.err');
    if (p) p.textContent = msg || '';
  }

  return { api, ApiError, esc, icon, stars, money, hoy, sumarDias, noches, fecha, toast, modal, setErr, verFactura };
})();
