# Mouse Final

Control remoto personal de mouse y teclado para tu PC desde el celular, pensado para usar la PC como "tele" desde la cama.

## Cómo funciona

- Un servidor Node.js (`server.js`) corre en tu PC y expone una página web + WebSocket en tu red local.
- Un agente en PowerShell (`agent/input-agent.ps1`) traduce los comandos recibidos en movimientos de mouse y teclas reales, usando solo APIs de Windows (sin instalar nada extra ni compilar módulos nativos).
- Desde el iPhone, abrís la IP de tu PC en Safari: tenés un trackpad táctil, teclado nativo y una grilla de botones personalizables.

## Primer uso

```bash
npm install
npm start
```

La consola va a mostrar algo como:

```
Mouse_Final escuchando en el puerto 5577
  -> Abrí desde el celular (misma red WiFi): http://192.168.x.x:5577
```

1. Conectá el iPhone a la **misma red WiFi** que la PC.
2. Abrí esa dirección en Safari.
3. Ingresa el PIN (por defecto `1234`). La primera vez que arranca, el servidor crea `config.json` copiando `config.example.json`; cambia el PIN ahí. `config.json` no se sube al repo.
4. Tocá **"Compartir" → "Agregar a pantalla de inicio"** en Safari para tener un ícono como si fuera una app.

Si Windows te pregunta si permitir el acceso de Node.js a la red (Firewall de Windows), elegí **Permitir** (al menos para redes privadas).

## App de escritorio (beta)

En vez de la consola, se puede usar la app de escritorio, que corre el mismo servidor con una ventana e ícono en la bandeja del sistema:

```bash
npm install
npm run desktop
```

- Muestra un **código QR** para abrir la app en el celular escaneándolo, la dirección para copiar y, si la PC tiene varias redes (WSL, VPN…), un selector de cuál usar.
- **Emparejar escaneando el QR**: el QR lleva un código de emparejamiento que se renueva cada 10 minutos (una foto vieja del QR no sirve), así que el celular queda conectado sin escribir nada. El PIN queda como alternativa (por ejemplo, para la app agregada a la pantalla de inicio del iPhone, que no comparte datos con Safari).
- Lista de **dispositivos emparejados**, con botón para olvidar uno o todos (se desconectan al instante).
- Permite **cambiar el PIN** (no afecta a los ya emparejados), el puerto, **iniciar con Windows** y activar o desactivar el historial del portapapeles. Si el PIN es el de ejemplo (`1234`), la app lo reemplaza por uno al azar.
- Cerrar la ventana la deja en la bandeja; para salir del todo: clic derecho en el ícono → Salir.
- Su configuración vive en `%APPDATA%\Mouse Final\config.json` (separada del `config.json` del repo, que sigue usando `npm start`). La primera vez copia el `config.json` del repo si existe.
- El código está en `desktop/` (Electron) y el servidor compartido en `src/server.js`.

### Generar el instalador

```bash
npm run dist
```

Crea `dist/MouseFinal-Setup-<versión>.exe`, un instalador de Windows que trae todo adentro (el usuario no necesita Node.js). Al instalar:

- Pide permiso de administrador una vez, para instalar en Archivos de programa y agregar la regla del Firewall de Windows (solo redes privadas), así no aparece el aviso al abrir la app.
- Crea accesos directos en Inicio y Escritorio, y abre la app al terminar.
- Al desinstalar, se borran la regla del Firewall y el inicio automático. La configuración y los dispositivos emparejados (`%APPDATA%\Mouse Final`) se conservan por si se reinstala.

El instalador no está firmado: Windows SmartScreen muestra "Windows protegió tu PC" → **Más información** → **Ejecutar de todas formas**. Para quitar ese aviso hace falta un certificado de firma de código.

La configuración de empaquetado está en `package.json` (`"build"`) y los pasos extra del instalador en `build/installer.nsh`.

## Estética

Tema inspirado en Resident Evil: negro cálido, rojo sangre, texto hueso en mayúsculas espaciadas, esquinas rectas con marcos de expediente, grano de película y viñeta (ambos en `body::before` / `body::after`, sin bloquear toques).

El indicador de conexión es un electrocardiograma con los tres estados del juego:
- **FINE** (verde, latiendo) — conectado
- **CAUTION** (ámbar) — verificando PIN / conectando
- **DANGER** (rojo) — sin conexión o PIN incorrecto

Los textos de la app hablan como personajes de los juegos: la pantalla del PIN es un terminal de seguridad de Umbrella, el apagado es el "sistema de autodestrucción", el baúl lo atiende el Buhonero de RE4, y las notas de cada tarjeta vienen firmadas (Barry, Leon, Jill, Rebecca) con `<span class="sign">`. Los botones y las instrucciones igual dicen claro qué hacen.

Toda la paleta está en variables CSS al principio de `public/style.css`, así que se puede retematizar cambiando solo ese bloque.

Las imágenes ambientales viven en `public/img/` y se muestran como "archivos de expediente" (`.dossier`) en los espacios libres de Multimedia, Navegación y Atajos. Son de uso personal dentro de la red local; no se publican en ningún lado.

Al programar un apagado se abre una **ventana de confirmación** (`#confirmModal`) con el zombie de fondo. Además de la estética, evita programar un apagado sin querer.

### Ícono y objetos

El ícono es un **licker** (cerebro, boca y lengua) en tono carne cruda sobre el fondo del tema. La figura sale de un flash de tatuaje de jayeshepherdtattoo, recortada del papel y recoloreada; está en `public/img/licker.png`. Es solo para uso personal, no la publiques. Se genera con `scripts/make-icon.ps1`:

```powershell
./scripts/make-icon.ps1 ./public/icon-512.png 512          # licker
./scripts/make-icon.ps1 ./public/icon-512.png 512 stars    # volver al badge de S.T.A.R.S.
```

Si cambiás el ícono, subí el `?v=N` de los íconos en `index.html` y `manifest.json`, y en el iPhone borrá el acceso directo y agregalo de nuevo (iOS guarda el ícono viejo).

En `public/img/re/` están los 25 objetos del set de emotes, recortados de la lámina original con el fondo hecho transparente. Repartidos así:

| Objeto | Dónde |
|---|---|
| S.T.A.R.S. | ícono alternativo (`make-icon.ps1 … stars`) |
| Umbrella | pantalla de PIN |
| Máquina de escribir | panel del teclado |
| Cinta de tinta | tarjeta de apagado |
| Encendedor | tarjeta de brillo |
| Vial verde | tarjeta de cursor |
| Spray | tarjeta de volumen |
| 4 emblemas | pestaña Navegación |

El resto de los sprites (hierbas, llaves, displays EKG, etc.) quedan en `public/img/re/` sin usar, disponibles por si se quieren poner en otro lado. Los EKG en particular no se usan para no duplicar el indicador de conexión, que es un SVG dibujado a mano y animado.

La ventana de confirmación con el zombie aparece tanto al **programar** como al **cancelar** un apagado.

## Controles

- **Trackpad:** un dedo mueve el cursor, tap = clic izquierdo, dos dedos = clic derecho (tap) o scroll (arrastrar).
  - El scroll con dos dedos manda "clics" de rueda completos (120, como una rueda real), uno cada 22 px de dedo (`PX_PER_NOTCH` en `app.js`). Dedos hacia arriba = la página sube, como en el iPhone.
  - Mientras haya dos dedos el gesto queda en modo scroll hasta soltar todo, así el cursor no salta si levantás un dedo antes que el otro.
- **Teclado:** el botón rojo del teclado (en Mouse va arriba del trackpad; en las otras pestañas, abajo a la derecha) abre un panel con un campo de texto; lo que escribas se envía en tiempo real (soporta tildes y ñ).
  - Se escribe simulando la tecla real del layout de Windows (`VkKeyScanEx` + `keybd_event`), no con "paquetes Unicode", porque muchos juegos y reproductores a pantalla completa ignoran esos últimos.
  - El campo se mantiene relleno con caracteres invisibles (espacio de ancho cero). Sin eso, apretar "borrar" con el campo vacío no genera ningún evento en iOS y no había forma de borrar texto que ya estaba escrito en la PC.
  - Además hay botones explícitos **⌫ Borrar** (se puede mantener presionado) y **Borrar todo** (manda `Ctrl+A` y luego borrar), como respaldo que no depende de cómo reporte las teclas el teclado del celular.
- **Botones personalizados:** Play/Pausa, Volumen +/-, Silenciar, Esc, F (fullscreen), flechas, clic de rueda (botón del medio) y los botones laterales del mouse (atrás/adelante).

## Apagado automático

En la tarjeta "🌙 Apagado automático" podés:
- Tocar un preset (15 / 30 / 45 / 60 / 90 min).
- Poner minutos personalizados.
- Programarlo para una hora específica del día (si esa hora ya pasó hoy, lo programa para mañana).
- Ver la cuenta regresiva en vivo y cancelarlo en cualquier momento con "Cancelar apagado".

Internamente usa el comando nativo `shutdown /s /t <segundos>` de Windows (y `shutdown /a` para cancelar), acotado entre 10 segundos y 24 horas. El estado se sincroniza entre todos los dispositivos conectados a la vez.

## Baúl de copiados (portapapeles)

En la pestaña **Atajos** hay un historial del portapapeles del PC, como el baúl de objetos de los juegos:

- **Todo el texto que copies en el PC** (Ctrl+C, clic derecho → Copiar, o el botón Copiar de la app) se guarda solo, lo más nuevo arriba. Copiar algo que ya estaba lo sube arriba en vez de duplicarlo.
- **Pegar** pone ese texto en el portapapeles del PC y manda Ctrl+V, así que se pega donde esté el cursor. Después sigue quedando copiado por si querís pegarlo de nuevo.
- **Guardar** agrega texto escrito o pegado desde el celu (por ejemplo, un link que copiaste en el iPhone) para pegarlo en el PC.
- **Fijar** deja un elemento arriba (en ámbar). "Vaciar baúl" borra todo menos lo fijado y pide confirmación.
- Guarda hasta 60 elementos (más los fijados), de hasta 20.000 caracteres cada uno. Solo texto: las imágenes y archivos copiados no se guardan.

Cómo funciona: `agent/clipboard-watch.ps1` corre aparte, mira cada 400 ms el contador de cambios del portapapeles de Windows (`GetClipboardSequenceNumber`, casi gratis) y solo lee el texto cuando cambió. Para pegar se usa el comando `CLIP|<base64>` del agente de entrada.

Privacidad:
- El historial se guarda en `%LOCALAPPDATA%\MouseFinal\clipboard.json`, **fuera de la carpeta del proyecto**, para que OneDrive no lo suba a la nube.
- Lo que los gestores de contraseñas marcan como "no guardar en historial" (el mismo criterio que usa Win+V) **no** se guarda.
- Igual que el resto de la app, el historial viaja sin cifrar por tu WiFi hacia el celu. Solo lo reciben dispositivos que pusieron el PIN.

## Sonidos

Sonidos de menú al estilo del inventario de los primeros Resident Evil (`public/sfx.js`). Están **sintetizados con Web Audio**, no son el audio de los juegos:

| Sonido | Cuándo suena |
|---|---|
| `cursor` (pip corto) | cambiar de pestaña, flechas del D-pad, Vol +/-, ⌫, mover sliders |
| `select` (click + dos pips subiendo) | botones, OK, confirmar, PIN correcto |
| `cancel` (dos pips bajando) | cancelar la ventana, "Listo" del teclado, "Borrar todo" |
| `open` (golpe + deslizamiento) | abrir la ventana de confirmación o el teclado |
| `error` (zumbido grave) | PIN incorrecto, "A esa hora" sin hora |

El trackpad no hace ruido a propósito. Se activan/desactivan y se les baja el volumen en **Sistema → Sonidos** (se guarda en el celular). Suenan en el celu, no en la PC, y el iPhone los silencia si tiene puesto el switch de silencio.

Para usar sonidos propios, poné los archivos en `public/sfx/` y anotalos en `public/sfx/index.json`, por ejemplo `{ "cursor": "cursor.mp3", "select": "select.mp3" }`. Los que no estén en la lista siguen usando el sintetizado.

## Otras funciones

- **Pantalla siempre despierta**: mientras la página está abierta y visible, el celular no bloquea la pantalla solo (usa la Wake Lock API; si el navegador no la soporta o la batería está muy baja, simplemente no hace nada, sin romper el resto).
- **Mantener presionado para repetir**: las flechas del D-pad y los botones Vol +/- repiten la acción mientras los mantengas tocados (como un control remoto real).
- **Pestaña "Atajos"**: Alt+Tab, tecla Windows, Copiar (Ctrl+C), Pegar (Ctrl+V) y Refrescar (F5). Podés agregar más combinaciones en `config.json` usando `"code": "MOD1+MOD2+TECLA"` (ej. `"CTRL+SHIFT+ESCAPE"`), siempre que las teclas estén en el mapa de `agent/input-agent.ps1`.
- **Slider de volumen**: en la pestaña Multimedia. Es aproximado (simula pulsaciones de Vol +/-), no lee el volumen real de Windows.
- ~~**Tamaño del cursor**~~: no es viable de forma confiable por control remoto (Windows necesita generar bitmaps reales). En su lugar, hay un botón en Sistema que abre directo la pantalla de ajustes de Windows.
- **Brillo de pantalla**: en la pestaña Sistema. Usa DDC/CI vía HDMI (`Dxva2.dll`). Funciona si tu monitor/TV lo soporta — muchos monitores sí, pero varias TVs usadas como monitor no. Si el slider no hace nada, es una limitación del hardware, no de la app.

## Personalizar los botones

Editá `config.json`. Cada botón tiene esta forma:

```json
{ "label": "Nombre", "icon": "🔥", "action": { "type": "key", "code": "ESCAPE" } }
```

Tipos de `action` disponibles:

- `{"type":"key","code":"..."}` — códigos soportados: `ESCAPE`, `F`, `UP`, `DOWN`, `LEFT`, `RIGHT`, `BACKSPACE`, `ENTER`, `VOLUME_UP`, `VOLUME_DOWN`, `VOLUME_MUTE`, `MEDIA_PLAY_PAUSE`, `BROWSER_BACK`, `BROWSER_FORWARD`.
- `{"type":"click","button":"..."}` — `left`, `right`, `middle`, `x1` (lateral atrás), `x2` (lateral adelante).

Guardá el archivo y refrescá la página del celular; no hace falta reiniciar el servidor.

## Arranque automático con Windows

```powershell
./scripts/install-autostart.ps1
```

Esto crea una Tarea Programada (`MouseFinalRemote`) que inicia el servidor cada vez que iniciás sesión en Windows. Para quitarlo:

```powershell
./scripts/uninstall-autostart.ps1
```

También podés administrarla a mano desde el **Programador de tareas de Windows** (buscala como `MouseFinalRemote`).

## Licencia

El código está bajo licencia [MIT](LICENSE).

La licencia **no cubre las imágenes de `public/img/`** (fotos y sprites de Resident Evil, el licker basado en el flash de jayeshepherdtattoo) ni los íconos `public/icon-*.png` generados a partir de él. Son de sus respectivos dueños (Capcom y los artistas originales) y están incluidas solo como fan art de uso personal, sin fines comerciales. Si eres dueño de alguna y quieres que la saque, abre un issue.

## Seguridad

- Pensado para tu red WiFi doméstica, no para exponerlo a internet.
- El celular guarda un **token de dispositivo**, no el PIN. En la PC solo se guarda su hash (`devices.json`).
- **Límite de intentos**: después de 5 PIN o QR incorrectos desde una misma IP se bloquea 30 s, y cada fallo extra duplica la espera (hasta 15 min).
- Cambiá el PIN en `config.json` si querés más privacidad (cualquiera en tu WiFi que sepa la IP y el puerto podría intentar conectarse sin él).
- No lo publiques con port-forwarding en el router sin agregar HTTPS y una autenticación más fuerte.
