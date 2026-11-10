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
3. **Permiso de cámara:** explica para qué se usa. En la compu, además de usar la webcam, se puede tocar **"Seguir en el celular"**: aparece un código QR que abre el probador en el celular con el mismo modelo, color y onzas, directo en este paso. "Ahora no" lleva al visor 3D sin cámara.
4. **Escaneo:** muestra los 21 puntos de la mano y el estado de la luz, la distancia y los puntos detectados.
5. **Guante puesto:** el guante sigue la mano, cambia de color (blanco o negro), tiene foto con temporizador de 3 segundos, botón de ayuda y la opción de ocultar los controles.
6. **Foto:** la guarda con la marca Tempo y se puede compartir si el celular lo permite.
7. **Carrito:** cuotas, descuento por transferencia y la sugerencia de sumar las Tempo Wraps.

Pantallas de error: navegador sin soporte, permiso de cámara denegado, sin cámara, falla al cargar el detector y "No detectamos tu mano", con consejos y la opción de reintentar.

## Diseño

- Las pantallas siguen el **UI Kit** y los **wireframes de media fidelidad** del equipo (AR 1 a AR 9): fondo #141414 con resplandor rojo, acento ámbar #F2B866, títulos en Archivo expandida 800 en mayúsculas, textos en Lato, botones píldora, chips, cards con borde ámbar al seleccionar, marco punteado y línea de escaneo en AR 6, pines 1 y 2, etiqueta "Largo 43 cm" y panel inferior con Foto y Agregar en AR 7, y precios con el formato 209.999,00$.
- El guante lleva el diseño de Tempo: emblema de laureles y reloj de arena en el dorso y en el costado, placa dorada TEMPO en el puño y, en el Elite, lengüeta, ojales y cordones del lado de la palma. Blanco o negro.

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
- **Palma o dorso:** se decide con la curvatura de los dedos en 3D (siempre se doblan hacia la palma) y la etiqueta de mano de MediaPipe, con histéresis. Así el guante no queda al revés aunque la etiqueta falle o la cámara esté espejada.
- **Sin retraso visible:** la pantalla muestra el mismo cuadro de video que analizó el detector y el guante se dibuja encima en el mismo instante, así no queda atrás de la mano aunque el detector tarde unos milisegundos.
- **Que parezca puesto y no apoyado:**
  - *Puño articulado:* el puño sigue al antebrazo y la parte de la mano sigue a la mano, con un doblez suave en la muñeca (en el shader, así se doblan juntos el cuero, los logos y los cordones). La dirección del antebrazo se estima sin otro modelo: se calibra el color de la piel con la palma y se busca la dirección con más piel por debajo de la muñeca (±80°). Si no se destaca (manga larga, fondo del mismo color), el puño queda alineado con la mano.
  - *Puño abierto:* se quitó la tapa con la que el escáner cierra el puño; tiene ribete de cuero y forro oscuro, y por la abertura se ve el brazo entrando.
  - *Sombra de contacto* sobre el brazo, justo debajo del borde del puño.
  - *Luz de la escena:* el brillo del guante se mide y se compara con los blancos de la imagen (el blanco queda blanco y no gris); el color de la luz sale de las zonas claras de la imagen.
  - *Rotación 3D real:* la inclinación hacia la cámara sale de las coordenadas 3D del detector, y el tamaño se corrige por esa inclinación.
  - *Desenfoque de movimiento* cuando la mano se mueve rápido (`motionBlur` en `CONFIG`).
- **Borrado de la mano:** si asoma algo de la mano real alrededor del guante (un dedo al abrir la mano, la mano corrida en un movimiento rápido), se tapa con el fondo que la rodea, difuminado. Se arma una máscara con los 21 puntos (más ancha cuanto más rápido se mueve la mano), se rellena con un promedio desenfocado de los píxeles de fondo cercanos (sin los de la mano) y el guante se dibuja encima. Se calcula en baja resolución; si en un celular lento tarda demasiado, baja la resolución y, si hace falta, se apaga solo. Se puede desactivar con `eraseHand: false` en `CONFIG`.
- **Filtro de movimiento:** One Euro ajustado para movimientos rápidos (en simulación, el retraso medio bajó de 11–17 % a ~3 % del tamaño de la palma, con el mismo temblor en reposo).
- **Tamaño real:** el guante escaneado mide 29,6 cm; una palma adulta (muñeca a nudillo medio) mide ~10,5 cm, así que el guante se escala a 1,2 veces esa medida por unidad del modelo y la muñeca queda a 9 cm del borde del puño. La medida de la mano usa el largo de la palma o el ancho de los nudillos (el mayor), para que no se achique al inclinar la mano. Las onzas ajustan un poco el tamaño.
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
- QR Code Generator (Kazuhiko Arase): MIT, en `vendor/qrcode/`.
- three.js: MIT, en `vendor/three/`.
