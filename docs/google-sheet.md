# Recogida de tiempos para el premio (Google Sheets)

La app envía los minutos de cada socio a una hoja de Google. No hace falta
backend ni cuenta de usuario: cada móvil manda su propia fila y el Apps Script
la crea o actualiza.

```
Móvil del socio (Modo Fan)  ──POST JSON──►  Apps Script  ──►  Hoja "Participantes"
```

## 1. Crear la hoja (2 min)

1. Entra en <https://sheets.google.com> con la cuenta de Google que vaya a
   gestionar el premio y crea una hoja de cálculo en blanco.
2. Ponle un nombre, por ejemplo **Modo Anxo Carro · premio**.
3. No hace falta escribir columnas: el script crea la pestaña `Participantes`
   con sus cabeceras y la pestaña `Ranking` la primera vez que recibe datos.

## 2. Pegar el script (3 min)

1. En la hoja: **Extensiones → Apps Script**.
2. Borra el contenido de `Código.gs` y pega el contenido de
   [`docs/google-sheet-apps-script.js`](./google-sheet-apps-script.js).
3. Guarda (💾 o `Ctrl+S`).

## 3. Desplegarlo como aplicación web (3 min)

1. Arriba a la derecha: **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Rellena:
   - **Descripción**: `Modo Anxo Carro premio`
   - **Ejecutar como**: **Yo** (tu cuenta)
   - **Quién tiene acceso**: **Cualquier persona**
4. **Implementar** → autoriza los permisos con tu cuenta
   (aparecerá "Google no ha verificado esta aplicación" → **Configuración
   avanzada → Ir a … (no seguro)**; es tu propio script).
5. Copia la **URL de la aplicación web**. Acaba en `/exec` y es larga.
6. Pega esa URL en el navegador: debe responder
   `{"ok":true,"hoja":"Participantes","filas":0,...}`. Si responde eso, está
   listo.

> Cada vez que cambies el script hay que hacer **Implementar → Gestionar
> implementaciones → ✏️ → Nueva versión**. Cambiar solo el código no actualiza
> la web publicada.

## 4. Conectar la app (1 min)

**Opción recomendada (todos los móviles a la vez):** crear `.env.local` en la
raíz del proyecto con:

```
VITE_FAN_SHEET_URL=https://script.google.com/macros/s/XXXXXXXX/exec
```

y reiniciar el servidor de desarrollo (`npm run dev`). La URL queda compilada
en la app.

**Opción rápida (un dispositivo, sin reiniciar):** abrir la app con
`?sheet=https://script.google.com/macros/s/XXXXXXXX/exec`. El navegador
recuerda esa URL para las siguientes cargas (`localStorage`).

Sin URL configurada, la app funciona igual y no envía nada.

## 5. Ensayo antes del partido (`?demo=`)

El cronómetro solo suma **desde el kickoff**. Si pruebas antes del domingo, los
minutos serán 0 (la fila se crea igual, con 0). Para ensayar los minutos:

1. Abre la app con `?demo=20` (simula que han pasado 20 minutos de partido).
2. Entra al Modo Fan con la casilla del premio marcada.
3. En la hoja aparece una fila con **Prueba: Sí**; sus minutos crecen en tiempo
   real y el `Ranking` la ignora.
4. Borra esas filas de prueba antes del partido real.

Se puede combinar con la URL de la hoja:
`.../?demo=20&sheet=https://script.google.com/macros/s/XXXX/exec&debug=1`

## 6. Comprobar que llega

1. Abre la app, regístrate **marcando la casilla del premio** y pulsa
   **Entrar al Modo Fan**.
2. En unos segundos debe aparecer una fila en `Participantes`.
3. Añade `?debug=1` a la URL: el panel inferior muestra
   `hoja: on / consent: true / cola: 0` y el id de sesión.
4. La fila se actualiza cada 30 s y también al salir/volver a la app.

## Columnas de la hoja

| Columna | Contenido |
| --- | --- |
| Sesión | id interno (clave del upsert) |
| Nombre, Socio, Teléfono, Email | datos del registro |
| Partido, Fecha partido, Kickoff | partido en el que se participó |
| Entrada, Minuto entrada | hora real y minuto de partido al entrar |
| **Min. fan** | minutos acumulados en Modo Fan (lo que decide el premio) |
| Min. fuera | minutos de juego real fuera de la app |
| Salidas | nº de veces que salió de la app |
| Estado | `En directo` / `Finalizado` |
| Consentimiento | `Sí` / `No` |
| Dispositivo | sistema y navegador |
| Enviado, Última actualización | marcas de tiempo (Europe/Madrid) |
| Prueba | `Sí` en las sesiones simuladas con `?demo=` |

`Ranking` ordena automáticamente por **Min. fan** de mayor a menor y **excluye
las filas marcadas como Prueba**.

Al terminar: **Archivo → Descargar → Microsoft Excel (.xlsx)**.

## Reglas del premio (acordadas)

- Gana quien más minutos acumule en Modo Fan.
- Sin mínimo de tiempo.
- El nº de socio no se valida (se guarda informativo).
- Desempate: menos salidas y, si sigue, quien entró antes.

## Si algo falla

- **No aparece ninguna fila**
  - Comprueba que marcaste la casilla del premio (Perfil → "Participar en el
    premio"). Sin consentimiento no se envía nada.
  - Comprueba que la URL está puesta (`?debug=1` → `hoja: off` significa que
    no hay URL).
  - Vuelve a abrir la URL del `/exec` en el navegador: debe responder `ok`.
  - Si cambiaste el script, publica **Nueva versión**.
- **Error de acceso / login de Google**: la implementación debe ser
  "Ejecutar como: Yo" y "Acceso: Cualquier persona".
- **Fila duplicada**: solo pasa si la sesión se creó de nuevo (por ejemplo,
  borrar datos del navegador). Es una sesión distinta a efectos de la hoja.
- **Faltan los últimos segundos**: el latido es de 30 s; como mucho se pierden
  esos 30 s si el móvil se apaga de golpe. Al salir de la app se manda un
  envío inmediato.

## Por qué no hay CORS

La app manda el JSON como `text/plain` con `mode: "no-cors"` y usa
`navigator.sendBeacon` al ocultar la página. Así el navegador no bloquea la
petición y el envío sobrevive a que la pestaña se cierre. La respuesta no se
puede leer (es opaca) y no hace falta: el script escribe la fila igualmente.
