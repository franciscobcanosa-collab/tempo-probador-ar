# Tempo · Probador AR

Web app que abre la cámara, detecta la mano y le pone encima un guante de box 3D de Tempo que sigue sus movimientos y se acorta al cerrar el puño. No necesita instalar nada: funciona en el navegador del celular o de la compu.

## Cómo probarlo

**Link público:** https://franciscobcanosa-collab.github.io/tempo-probador-ar/ (abrir en el celular y dar permiso a la cámara). Cada cambio que se sube a `main` se publica solo.

La cámara del navegador solo funciona en páginas **https** (o en `localhost`). Por eso no alcanza con abrir el archivo `index.html` con doble clic.

**En el celular (recomendado): publicarlo gratis con https**

- **GitHub Pages:** crear un repositorio, subir todo el contenido de esta carpeta y activar *Settings → Pages → Deploy from branch (main / root)*. La dirección queda como `https://usuario.github.io/repositorio/`.
- **Netlify:** entrar a app.netlify.com/drop y arrastrar esta carpeta. Te da una dirección https al instante.

Después abrís esa dirección en Chrome (Android) o Safari (iPhone) y das permiso a la cámara.

**En la compu (para probar rápido)**

Desde esta carpeta, en una terminal:

```
python3 -m http.server 8000
```

y abrís `http://localhost:8000` en Chrome. Usa la webcam.

## Qué hace

1. **Tus onzas:** dos preguntas (uso y peso). No hay respuestas preseleccionadas, y el botón "Siguiente" se activa recién cuando elegís.
2. **Tu guante:** recomienda las onzas y muestra Elite, Pro y Fit con precio y stock. Si las onzas recomendadas no están en stock, lo avisa.
3. **Permiso de cámara:** explica para qué se usa. "Ahora no" lleva al visor 3D sin cámara.
4. **Escaneo:** muestra los 21 puntos de la mano y el estado de la luz, la distancia y los puntos detectados.
5. **Guante puesto:** el guante sigue la mano, cambia de color (blanco o negro), tiene foto con temporizador de 3 segundos, botón de ayuda y la opción de ocultar los controles.
6. **Foto:** la guarda con la marca Tempo y se puede compartir si el celular lo permite.
7. **Carrito:** cuotas, descuento por transferencia y la sugerencia de sumar las Tempo Wraps.

Pantallas de error: navegador sin soporte, permiso de cámara denegado, sin cámara, falla al cargar el detector y "No detectamos tu mano", con consejos y la opción de reintentar.

## Cómo funciona

- **Detección de la mano:** MediaPipe Hands (Google) en el navegador. Encuentra 21 puntos de la mano en cada cuadro del video.
- **Forma del guante:** sale de un **escaneo 3D de un guante de box real** ("Boxing Glove 3D-scan by CreativeTools", licencia CC BY-SA 4.0, ver `CREDITOS.md`). `herramientas/procesar_escaneo.py` lo descarga, une las piezas, lo simplifica a 60.000 triángulos, lo orienta y escala a la mano, le calcula la textura desplegada y el sombreado de los pliegues, y lo guarda en `models/tempo-scan.bin` + `.json`. Al publicar en GitHub esto lo hace solo la acción `.github/workflows/publicar.yml`. Si el escaneo no está, se usa el guante esculpido de respaldo: forma esculpida como volumen. El puño, la cabeza acolchada de los nudillos, el frente de los dedos doblados, el dorso, la concavidad de la palma, el pulgar y el puño del guante se funden con transiciones suaves. Las costuras de los paneles laterales y de la unión con el puño quedan talladas como surcos. Las proporciones siguen las de un guante de 16 oz: puño de ~13–14 cm de ancho y ~12 cm de profundidad, y puño del guante más angosto. La malla se genera fuera de línea con `herramientas/generar_guante.py` y se guarda en `models/tempo-glove.bin` + `.json` (~2 MB, 70.000 triángulos, con textura desplegada y sombreado de pliegues incorporado).
- **Materiales y detalles (`glove3d.js`):** Three.js con materiales físicos:
  - Cuero con grano generado por código: relieve del poro, rugosidad variable y sombreado en los surcos.
  - Barniz suave y brillo de cuero, más oscuro y mate en el negro.
  - Surcos de costura en el dorso, los costados y el puño, con más de 700 puntadas de hilo.
  - Pulgar unido con una tira, ojales metálicos y cordón tejido cruzado (Elite) o abrojo con costura (Pro y Fit).
  - Logo dorado metálico en relieve, forro interior y sombreado en los pliegues.
- **Integración con la imagen real:**
  - Luz tomada del propio video: el guante refleja y toma el color del lugar.
  - Estimación de la luz principal (dirección, intensidad y color) a partir del brillo del cuadro.
  - Sombra suave detrás del guante.
  - Grano de cámara, más fuerte con poca luz.
  - Nitidez del render igualada a la del video.
- **Seguimiento:** en cada cuadro se calcula la orientación de la mano (muñeca, nudillos del índice, medio y meñique) y el guante se ubica, rota y escala sobre ella. Un filtro One Euro elimina el temblor sin agregar retraso. La mano izquierda y la derecha se distinguen para poner el pulgar y los cordones del lado correcto.
- **Orden de carga del guante:** primero el escaneo real procesado (`models/tempo-scan.*`), después el guante esculpido y, si ninguno carga, una versión simple armada por código.

## Cómo cambiar la forma del guante

`herramientas/generar_guante.py` define el volumen con piezas simples (elipsoides y cápsulas) que se funden entre sí. Para modificarlo hace falta Python 3 con `numpy`, `scikit-image`, `fast-simplification` y `xatlas`:

```
pip install numpy scikit-image fast-simplification xatlas
python3 herramientas/generar_guante.py models/tempo-glove
```

Las medidas principales están en `P` (puño del guante) y en `fist_sd` / `thumb_sd` (puño y pulgar).
- **Se amolda:** según la distancia entre la muñeca y la punta del dedo medio, el cuerpo del guante se alarga con la mano abierta y se acorta con el puño cerrado.
- **Privacidad:** todo se procesa en el dispositivo. No se graba ni se envía ninguna imagen.

## Cómo cambiar el catálogo

Al principio del script de `index.html` está el objeto `CONFIG`:

- `models`: nombres, descripciones y precios (tomados del MVP).
- `stock`: onzas disponibles por modelo. Hoy todos los modelos están en 16 oz, como en el MVP.
- `colors`: colores del cuero, las terminaciones y el logo.
- `ozGuide`: la guía orientativa de onzas por uso y peso. Conviene validarla con Tempo o con un entrenador.

## Limitaciones

- La forma es la de un guante real escaneado, pero no es el guante de Tempo: tiene cierre de abrojo, así que el Elite (de cordones) se ve con abrojo y la pantalla lo aclara. Para que sea el producto exacto hay que escanear el guante de Tempo y procesarlo con el mismo script.
- El guante escaneado ya tiene forma de puño: con la mano abierta solo se estira un poco.
- El tamaño por onzas es aproximado.
- La detección necesita buena luz y la mano entera dentro de la pantalla. La profundidad se estima desde una sola cámara, así que con la mano muy de costado el guante puede desacomodarse.
- Se probó en Chromium con una cámara simulada. Falta probarlo en celulares reales.

## Licencias

- Escaneo del guante: CreativeTools, CC BY-SA 4.0 (ver `CREDITOS.md`).
- MediaPipe Hands: Apache 2.0 (Google), en `vendor/mediapipe-hands/`.
- three.js: MIT, en `vendor/three/`.
