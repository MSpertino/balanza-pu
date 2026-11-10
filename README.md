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
4. Amarillo: falta material. Verde: dentro del rango inclusivo. Rojo: exceso. Solo verde permite OK. OK registra y aplica tara automáticamente. La tara inicial queda bloqueada en rojo.
5. Para reiniciar el aditivo actual, retirar su material hasta volver a cero; el resto se conserva. Para repetir el último confirmado, recuperar primero su lectura total anterior. La pesada anterior se anula y conserva en el historial y CSV.
6. Finalizar requiere todos los aditivos confirmados y ninguna carga pendiente.

Las recetas SAP-001 y SAP-002, cantidades y tolerancias son **ejemplos inventados**, no fórmulas aprobadas. Editarlas en `src/formulation.js` cuando estén disponibles las recetas reales. Cada preparación guarda una copia de la receta utilizada. El cálculo conserva la precisión de JavaScript; la pantalla muestra hasta seis decimales en kg.

El simulador recibe lectura total acumulada: con receta SAP-001 y 190 kg de poliol, ingresar 2,5 kg de agua, OK y luego 3 kg totales para el aditivo de 0,5 kg. El indicador neto vuelve a cero con cada OK. El mecanismo de jarras independientes y la resolución real se deben validar antes de conectar hardware.

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

Acceder desde otra máquina con `http://IP-DEL-SERVIDOR:3000`. El acceso requiere conectividad y regla de firewall. Autenticación, permisos y conexión ESP32/HX711 están pendientes. `DATA_FILE` permite elegir otra ruta de almacenamiento.

## Verificación

```powershell
node --test
```

Las pruebas usan datos temporales y verifican límites de tolerancia, bloqueo por API, proporciones, tara, correcciones y recuperación después de reiniciar.
