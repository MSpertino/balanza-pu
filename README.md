# Balanza digital y trazabilidad de formulaciones

Prototipo local sin hardware, basado en [documentación base](docs/_documentacion_base.pdf).

## Ejecutar

Requiere Node.js 20 o superior. No necesita instalar dependencias.

```powershell
node server.js
```

Abrir http://localhost:3000. También se puede usar `npm start` o hacer doble clic en `iniciar-servidor.cmd`. Mantener la terminal abierta; Ctrl+C detiene el servidor.

## Flujo

1. Elegir producto e ingresar manualmente los kg de poliol (base 190 kg; atajos de entero, medio y tres cuartos).
2. Confirmar la validación de poliol e isocianato, dosificados fuera de esta balanza.
3. Pesar los aditivos en orden. Objetivo = cantidad original × kg de poliol / 190, sin redondeo intermedio. Cada aditivo tiene tolerancia porcentual propia.
4. Amarillo: falta material. Verde: dentro del rango inclusivo. Rojo: exceso. Solo verde permite OK. Cada recipiente se pesa por separado y OK reinicia la lectura a cero. La tara queda disponible para el próximo recipiente.
5. Para reiniciar el aditivo actual, retirar su material hasta volver a cero; el resto se conserva. Para repetir el último confirmado, recuperar primero su lectura total anterior. La pesada anterior se anula y conserva en el historial y CSV.
6. Finalizar requiere todos los aditivos confirmados y ninguna carga pendiente.

Antes de iniciar una formulación, el operador o responsable puede abrir **Configurar fórmulas** desde la pantalla principal. Allí crea o actualiza una receta con código SAP, nombre, poliol de referencia y materiales ordenados; cada material tiene cantidad de referencia y tolerancia. La fórmula queda guardada en `data/formulas.json` y aparece luego en la pantalla de inicio para ser pesada.

Las recetas SAP-001 y SAP-002, cantidades y tolerancias son **ejemplos inventados**, no fórmulas aprobadas. Cada preparación guarda una copia de la receta utilizada. El cálculo conserva la precisión de JavaScript; la pantalla muestra hasta seis decimales en kg.

El simulador recibe el peso neto del recipiente actual: con receta SAP-001 y 190 kg de poliol, ingresar 2,5 kg de agua, OK y luego 0,5 kg para el siguiente aditivo. El indicador vuelve a cero con cada OK. La integración Wi‑Fi del ESP32 está documentada en [`docs/arquitectura-wifi.md`](docs/arquitectura-wifi.md).

## Datos

Los registros, validaciones y auditoría se guardan en `data/sessions.json` mediante reemplazo de archivo temporal y escrituras serializadas. Persisten al reiniciar y se recuperan desde la pantalla inicial. No ejecutar dos servidores contra el mismo archivo. Para respaldar, detener el servidor y copiar `data/`. Si el archivo está corrupto, el servidor se detiene sin sobrescribirlo. No es todavía una base de datos de producción.

La lógica de negocio vive únicamente en `src/formulation.js`, ejecutada por el servidor. Sin conexión la pantalla informa error: no hay modo demo autónomo.

## Configuración

Por defecto escucha en 127.0.0.1:3000. Para pruebas de intranet:

```powershell
$env:HOST = '0.0.0.0'
$env:PORT = '3000'
node server.js
```

Acceder desde otra máquina con `http://IP-DEL-SERVIDOR:3000`. Para que el ESP32 llegue al servidor, usar `npm run start:lan` o `iniciar-servidor.cmd`, que escucha en todas las interfaces. El acceso requiere conectividad y regla de firewall. La API de dispositivo usa token en `X-Device-Token`; autenticación de usuarios, permisos y Nginx/HTTPS quedan para producción. `DATA_FILE` permite elegir otra ruta de almacenamiento.

## Prueba inicial de hardware

El proyecto PlatformIO y las instrucciones de conexión, carga, tara, calibración y portal Wi‑Fi están en [`firmware-balanza/README.md`](firmware-balanza/README.md). El dashboard muestra el estado de la balanza y permite tomar la última lectura Wi‑Fi en la formulación activa.

## Pruebas de la aplicación

```powershell
node --test
```

Las pruebas usan datos temporales y verifican límites de tolerancia, bloqueo por API, proporciones, tara, correcciones y recuperación después de reiniciar.
