# Créditos y licencias

- **Probador AR Tempo**: trabajo práctico de Diseño UX (UADE). Hecho con asistencia de Claude (Anthropic).
- **Forma del guante**: escaneo 3D real ["Boxing Glove 3D-scan by CreativeTools"](https://sketchfab.com/3d-models/boxing-glove-3d-scan-by-creativetools-c46261e951c34455bba5f1cc6dbea076), de [CreativeTools](https://sketchfab.com/creativetools), escaneado con un EinScan Pro. Licencia [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Se descarga de la copia pública del dataset [Objaverse](https://huggingface.co/datasets/allenai/objaverse) (Allen AI).
  - Cambios: se simplificó la malla, se reorientó y escaló, se le agregó desenvolvido UV y sombreado de oclusión; el cuero, el color y el logo los pone el probador. Script: `herramientas/procesar_escaneo.py`.
  - Por la licencia CC BY-SA 4.0, el modelo adaptado (`models/tempo-scan.*`) se comparte con la misma licencia CC BY-SA 4.0.
  - El escaneo no es un guante de Tempo: se usa como referencia de forma de un guante de box real.
- **Guante esculpido** (respaldo si no carga el escaneo): `models/tempo-glove.*`, generado con `herramientas/generar_guante.py`.
- **Diseño Tempo**: emblema (laureles dorados y reloj de arena rojo), colores, tipografías y componentes tomados del UI Kit y de los wireframes del equipo; placa del puño según las fotos de los guantes.
- **Tipografías**: Archivo, Lato y Cinzel (SIL Open Font License), en `vendor/fonts/`.
- **MediaPipe Hands** (Google): Apache 2.0. `vendor/mediapipe-hands/`
- **QR Code Generator** (Kazuhiko Arase): MIT. `vendor/qrcode/`
- **three.js**: MIT. `vendor/three/`
