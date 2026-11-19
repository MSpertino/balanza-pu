Proyecto de prueba para ESP32 DevKit + modulo HX711 + celda de carga.

Esta etapa prueba solamente:
- Compilacion.
- Upload.
- Comunicacion serial a 115200.
- LED integrado del ESP32.
- Presencia del HX711.
- Lectura RAW, tara y calibracion basica.

Pinout tomado del plano:
- HX711 DOUT/DT -> ESP32 GPIO2
- HX711 SCK -> ESP32 GPIO22
- HX711 GND -> ESP32 GND
- HX711 VCC -> alimentacion compatible con el modulo; no aplicar 5 V a un GPIO del ESP32.

Comandos por monitor serial a 115200:
- T: tara con la plataforma vacia.
- R: lectura RAW.
- C 1000: calibrar colocando una referencia de 1000 gramos.
- S: mostrar estado guardado.

Con la celda o el HX711 desconectados se espera HX711_NOT_READY; el heartbeat y el LED deben seguir funcionando.
