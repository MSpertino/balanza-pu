# Prueba USB de ESP32 + HX711

Proyecto independiente de PlatformIO. La web sigue usando el simulador: este firmware prueba primero la medición por monitor serie y no registra preparaciones.

## Cableado

Para un **ESP32 clásico Dev Module**, no C3/S3. Desconectar USB antes de cablear.

| HX711 | ESP32 |
| --- | --- |
| DT / DOUT | GPIO 23 |
| SCK / CLK | GPIO 22 |
| GND | GND |
| VCC | 3V3, si el módulo admite alimentación a 3,3 V |

DT y SCK confirmados físicamente por el usuario según el diagrama de Lionel. Confirmar el módulo antes de alimentarlo; no conectar una salida DT de 5 V al ESP32. Si el módulo separa alimentación analógica y lógica, consultar su esquema. Conectar la celda a E+/E− y A+/A− según su ficha; los colores no son universales. Los pines se cambian al comienzo de `src/main.cpp`.

Botón habilitado en GPIO 25 con `INPUT_PULLUP`: se asume que el pulsador une ese pin a GND al presionarlo. Confirmar su otro contacto. La lectura tiene antirrebote de 30 ms; `btn` pasa a `true` mientras se mantiene presionado y a `false` al soltar. Por ahora informa el estado, sin ejecutar tara ni confirmar pesadas.

## Compilar, subir y observar

1. PlatformIO → Open Project → seleccionar la carpeta `firmware-balanza` de este repositorio. No hace falta crear otro proyecto ni reemplazar el `src/` de la aplicación web.
2. Conectar el ESP32 por USB con un cable de datos.
3. Ejecutar **Build**, luego **Upload**. Si hay varios dispositivos, seleccionar el puerto de la placa antes de subir.
4. Abrir **Monitor** a 115200 baudios. Cerrarlo antes de volver a subir.

Alternativa en una terminal con `pio` disponible, desde esta carpeta:

```powershell
pio run
pio device list
pio run --target upload --upload-port COM5
pio device monitor --port COM5 --baud 115200
```

Reemplazar COM5 por el puerto real. Si `pio` no está en PATH, usar la terminal de PlatformIO o `& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe"` en su lugar.

## Primera medición y calibración

1. Sin carga y con la plataforma quieta, enviar `T` y Enter. Esperar `tare_done` (promedia diez muestras).
2. Colocar una masa de referencia conocida, esperar que se asiente y enviar, por ejemplo, `C 500` para **500 gramos**. Esperar `calibration_saved`. Usar punto para decimales.
3. Retirar la referencia: debe volver cerca de cero. Colocarla otra vez y comparar. Probar además otra masa conocida antes de confiar en la escala.

El factor se conserva en el ESP32. La tara se realiza de nuevo tras cada reinicio; no se hace automáticamente para evitar ocultar una carga presente al encender.

Antes de calibrar y tarar se verá `"g":null` y `"stable":false`, con la lectura `raw` disponible. Después:

```json
{"g":500.00,"raw":-84213,"stable":true,"btn":false,"calibrated":true,"tared":true}
```

Los números son ilustrativos. El firmware emite como máximo diez mediciones por segundo, únicamente con muestras nuevas; la frecuencia efectiva depende del HX711. `stable` exige diez muestras con un rango máximo de 1 g, umbral inicial ajustable que no garantiza exactitud. No modificar el pin RATE para esta primera prueba.

`hx711_timeout` indica que no llegan muestras durante dos segundos: revisar alimentación, masa común y DT/SCK. Que `raw` cambie al cargar la celda es la primera comprobación; lecturas clavadas cerca de ±8388607 indican saturación y requieren revisar celda y conexiones. No calibrar con la celda saturada o moviéndose.

Los comandos de tara/calibración son exclusivos de esta prueba de banco: antes de conectarlos a la aplicación se deben respetar sus bloqueos de tara y reglas de formulación. No pulsar Reset ni tarar durante una preparación.
