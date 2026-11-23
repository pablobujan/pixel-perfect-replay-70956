# Modo Anxo Carro · CD Lugo

Web para animar al CD Lugo desde el Anxo Carro sin mirar el móvil. El socio se identifica, ve la guía completa, consulta el calendario y entra en el **Modo Fan**, donde un aro y un cronómetro acompañan el partido.

- **Web pública:** https://pablobujan.github.io/
- **Repositorio de la web publicada:** https://github.com/pablobujan/pablobujan.github.io
- **Repositorio de código fuente:** este repositorio

## Qué hace

- Guía de 4 pasos y premio justo después de pulsar **Comenzar**.
- Calendario de jornadas, resultados y próximos partidos, leído desde Google Sheets.
- Modo Fan con aro de progreso, descuentos del árbitro y cronómetro.
- El tramo gris del aro marca el tiempo fuera de la web; el reloj se pausa y se reanuda al volver.
- Envío de minutos a Google Sheets **solo si el usuario marca la casilla de consentimiento**. Sin ella la app funciona igual y no envía nada.
- Sin notificaciones al salir de la web con el Modo Fan activo.

## Desarrollo

Requiere Node.js y npm.

```bash
npm install
npm run dev
```

La URL local aparece en la terminal, normalmente `http://localhost:8080/`.

### Variables de entorno

Crea `.env.local` en la raíz con la URL de tu propia aplicación de Apps Script:

```env
VITE_FAN_SHEET_URL=https://script.google.com/macros/s/TU_DEPLOYMENT/exec
```

Sin esta variable la app funciona, pero usa el calendario de reserva incluido en el código.

### Comandos

```bash
npm run dev        # servidor de desarrollo
npm run build      # compilación de producción
npm run preview    # vista previa de la compilación
npm run test       # 57 tests
npm run lint       # ESLint
npx tsc --noEmit   # comprobación de tipos
```

## Google Sheets / Apps Script

El backend es una aplicación web de Google Apps Script sin servidor propio. El código está en:

```text
docs/google-sheet-apps-script.js
```

Pasos para usarlo:

1. Crear una hoja de cálculo con las pestañas **Participantes** y **Partidos**.
2. Pegar el script en Extensions → Apps Script.
3. Ajustar `ADMIN_TOKEN` a una clave privada.
4. Desplegar como **Web app**, ejecutando como **Cualquier persona**.
5. Copiar la URL del despliegue en `VITE_FAN_SHEET_URL`.

El script expone:

| Acción | Uso |
| --- | --- |
| `?action=partidos` | Leer el calendario desde el navegador mediante JSONP. |
| `type: "partido"` | Crear o actualizar un partido desde el panel. |
| `type: "partido-borrar"` | Borrar un partido desde el panel. |

La lectura usa JSONP para evitar CORS. La escritura usa `fetch` con `no-cors` y `sendBeacon`, con una cola en `localStorage` para no perder envíos.

## Panel privado

Se abre con:

```text
https://pablobujan.github.io/?admin=1
```

La clave se introduce en el propio panel y se guarda solo en ese navegador. **No está en este README ni en el código**: se configura en `ADMIN_TOKEN` dentro del Apps Script.

Desde el panel se pueden editar rivales, fechas, jornadas, resultados y descuentos del árbitro. Al guardar, las pestañas abiertas se actualizan al instante; en otros móviles el cambio aparece al abrir la app o en unos minutos.

Si queda una URL de prueba guardada, el panel ofrece **«Usar hoja oficial»** para volver a la hoja compilada.

## Parámetros de prueba

| Parámetro | Efecto |
| --- | --- |
| `?admin=1` | Abre el panel privado. |
| `?demo=46` | Simula 46 minutos de partido, útil para ver `45+2'`. |
| `?demo=10` | Simula 10 minutos y hace crecer el tramo rojo. |
| `?prueba=1` | Marca los envíos como «Prueba» en la hoja. |
| `?debug=1` | Muestra el estado interno del detector de pantalla apagada. |
| `?sheet=...` | Prueba otra URL de Apps Script. Se recuerda en ese navegador. |

Para volver a la hoja oficial, quita `?sheet=` de la dirección o pulsa **«Usar hoja oficial»** en el panel.

## Estructura

```text
src/
  components/admin-panel.tsx   Panel privado del calendario
  lib/fan-sheet.ts             Envíos a Google Sheets y URL del endpoint
  lib/matches.ts              Calendario, caché y guardado de partidos
  routes/index.tsx             Guía, alta, Modo Fan, calendario y panel
docs/google-sheet-apps-script.js  Backend de Apps Script
```

## Privacidad

Los datos del socio solo se envían a Google Sheets cuando marca la casilla de autorización del premio. La casilla aparece en el formulario y se puede dejar sin marcar: la app sigue funcionando con normalidad y no envía nada.
