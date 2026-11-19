# Prueba rápida: ESP32 + HX711

Proyecto mínimo de PlatformIO para probar una **ESP32 Dev Module clásica** con el HX711 de la balanza. Imprime la lectura cruda por el monitor serie, sin calibración ni conexión con la aplicación web. No usa bibliotecas externas.

## Cableado

| HX711 | ESP32 |
| --- | --- |
| DT / DOUT | GPIO 23 |
| SCK / CLK | GPIO 22 |
| GND | GND |
| VCC | 3V3, si el módulo admite 3,3 V |

Desconectá el USB antes de cambiar cables. Verificá que el módulo HX711 no envíe 5 V a los GPIO del ESP32. Para comprobar solo el USB, dejá el HX711 desconectado: el monitor serie debe mostrar el mensaje de inicio.

## Pasos

1. En VS Code, abrí PlatformIO y elegí **Open Project**.
2. Seleccioná esta carpeta `esp32-hola-mundo`.
3. Conectá el ESP32 por USB. Si la computadora ofrece varios puertos, identificá el que corresponde a la placa.
4. Ejecutá **Build** y luego **Upload** desde la barra de PlatformIO.
5. Abrí **Monitor** a **115200 baudios**. Con el HX711 conectado, deberías ver líneas `raw=...`; al poner peso sobre la celda el valor debería cambiar. Si no hay datos, aparecerá un mensaje para revisar alimentación, GND y DOUT.

También podés usar una terminal de PlatformIO, situada en esta carpeta:

```powershell
pio run
pio device list
pio run --target upload --upload-port COM5
pio device monitor --port COM5 --baud 115200
```

Reemplazá `COM5` por el puerto de tu ESP32. Cerrá el monitor antes de volver a subir el programa. El dato `raw` es una lectura eléctrica sin convertir a gramos; primero sirve para confirmar que el HX711 responde y cambia al cargar la celda.
