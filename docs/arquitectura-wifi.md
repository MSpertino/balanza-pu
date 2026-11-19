# Arquitectura de instalación Wi-Fi

```text
Celda de carga → HX711 → ESP32 → Wi-Fi corporativo → Nginx/HTTPS → API REST → Base de datos
                                                       ↓
                                                  Dashboard web
```

## Implementado

- [`firmware-balanza/`](../firmware-balanza/) mide, calibra y conserva el factor en NVS.
- Sin red configurada crea el AP `Balanza-Setup` y ofrece un portal cautivo.
- El dispositivo se registra con `POST /api/devices/register`.
- Envía lecturas a `POST /api/devices/{deviceId}/telemetry` con el header `X-Device-Token`.
- El servidor guarda el último estado en [`data/devices.json`](../data/devices.json).
- El dashboard muestra `ONLINE`, `OFFLINE` o `NUNCA CONECTADO`.

## Prueba por etapas

La lista operativa completa está en [`docs/checklist-puesta-en-marcha.md`](checklist-puesta-en-marcha.md).

1. **Banco USB:** comprobar que `raw` cambia con la carga, hacer tara y calibrar con una masa conocida.
2. **Wi-Fi aislado:** configurar el AP del ESP32 y apuntar la API a la IP local del servidor.
3. **Dashboard:** verificar que la balanza aparece `ONLINE` y que el peso coincide con el monitor serie.
4. **Formulación:** ejecutar una preparación de prueba y comparar peso físico, telemetría y registro.
5. **Planta:** poner Nginx delante de Node, habilitar HTTPS con certificado interno, restringir firewall y reemplazar el token demo.

## Contrato de telemetría

```json
{
  "weightKg": 0.500,
  "stable": true,
  "calibrated": true,
  "tared": true,
  "button": false,
  "raw": -84213,
  "uptimeMs": 123456
}
```

`weightKg` es el peso neto del recipiente actual. El servidor no confirma automáticamente una pesada todavía: el operador sigue pulsando **OK · Registrar material**, y la aplicación valida orden y tolerancia.
