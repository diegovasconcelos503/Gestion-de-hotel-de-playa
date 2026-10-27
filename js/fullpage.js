/* Full page: secciones tipo diapositiva con puntos de navegación y teclado */
(() => {
  const secs = [...document.querySelectorAll('#sitio > section'), document.querySelector('footer')].filter(Boolean);
  if (!secs.length) return;
  document.documentElement.classList.add('fp');
  const nombres = { inicio: 'Inicio', nosotros: 'Nosotros', servicios: 'Servicios', habitaciones: 'Habitaciones', galeria: 'Galería', experiencias: 'Experiencias', rutas: 'Rutas', resenas: 'Reseñas', reservar: 'Reservar', contacto: 'Contacto' };
  const nav = document.createElement('nav');
  nav.className = 'fp-dots'; nav.setAttribute('aria-label', 'Secciones');
  secs.forEach((s, i) => {
    if (!s.id) s.id = 'fp-' + i;
    const a = document.createElement('a');
    a.href = '#' + s.id; a.setAttribute('aria-label', nombres[s.id] || 'Pie de página');
    a.innerHTML = '<span>' + (nombres[s.id] || 'Pie') + '</span>';
    nav.appendChild(a);
  });
  document.body.appendChild(nav);
  const dots = [...nav.children];
  const marcar = () => {
    const y = window.scrollY + window.innerHeight / 3;
    let k = 0;
    secs.forEach((s, i) => { if (s.offsetTop <= y) k = i; });
    dots.forEach((d, i) => d.classList.toggle('on', i === k));
  };
  window.addEventListener('scroll', marcar, { passive: true });
  window.addEventListener('resize', marcar);
  marcar();
  // Flechas arriba/abajo, RePág/AvPág (solo si no se está escribiendo ni hay un modal abierto)
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) return;
    if (document.querySelector('.modal:not([hidden])') || !document.getElementById('admin-root').hidden) return;
    const k = dots.findIndex((d) => d.classList.contains('on'));
    let n = k;
    if (e.key === 'PageDown') n = Math.min(k + 1, secs.length - 1);
    else if (e.key === 'PageUp') n = Math.max(k - 1, 0);
    else return;
    e.preventDefault();
    secs[n].scrollIntoView({ behavior: 'smooth' });
  });
})();
