/* CH.Prop — suscripción a Novedades por WhatsApp.
 *
 * El formulario no guarda nada: arma el mensaje y abre WhatsApp al
 * 351 663-0472. El equipo agenda el contacto y lo suma a la lista de
 * difusión "Novedades" (WhatsApp Business solo le llega a quien tiene
 * el número agendado). Si dice que tiene una propiedad, es un lead
 * vendedor/administración: se le ofrece tasación.
 */
(function () {
  'use strict';
  var WA = '5493516630472';
  var forms = document.querySelectorAll('form[data-subs]');
  Array.prototype.forEach.call(forms, function (f) {
    var prop = f.querySelector('[name="propiedad"]');
    var bw = f.querySelector('.subs-barrio');
    var ok = f.querySelector('.subs-ok');
    var sync = function () {
      var si = prop.value && prop.value !== 'no';
      bw.hidden = !si;
    };
    prop.addEventListener('change', sync);
    sync();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var nom = f.querySelector('[name="nombre"]');
      var nombre = nom.value.replace(/\s+/g, ' ').trim();
      if (!nombre) { nom.focus(); nom.setAttribute('aria-invalid', 'true'); return; }
      nom.removeAttribute('aria-invalid');
      if (!prop.value) { prop.focus(); prop.setAttribute('aria-invalid', 'true'); return; }
      prop.removeAttribute('aria-invalid');
      var barrio = (f.querySelector('[name="barrio"]').value || '').replace(/\s+/g, ' ').trim();
      var en = barrio ? ' en ' + barrio : '';
      var extra = {
        vender: ' Tengo una propiedad para vender' + en + '.',
        alquilar: ' Tengo una propiedad para alquilar' + en + '.',
        alquilada: ' Tengo una propiedad alquilada' + en + '.',
        no: ''
      }[prop.value] || '';
      var msg = 'Hola, soy ' + nombre + '. Quiero recibir las Novedades de CH.Prop todos los lunes por WhatsApp.' + extra;
      window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
      ok.hidden = false;
    });
  });
})();
