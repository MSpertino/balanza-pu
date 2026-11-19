# Checklist de puesta en marcha

## Mientras PlatformIO compila

- Dejar el ESP32 conectado por un cable USB de datos.
- Confirmar que la placa sea un ESP32 clásico compatible con `esp32dev`, no C3/S3.
- No conectar ni desconectar la celda con el módulo energizado.
- Tener preparada una masa conocida para calibrar, por ejemplo 500 g.
- Tener a mano el SSID y contraseña de la red Wi‑Fi de planta.
- Identificar la IPv4 de la PC/servidor con `ipconfig`.

## Servidor local

Desde la carpeta del proyecto:

```powershell
npm run start:lan
```

La API debe quedar disponible en:

```text
http://IP-DE-LA-PC:3000
```

Si el ESP32 no llega al servidor, revisar primero el Firewall de Windows y permitir TCP de entrada en el puerto 3000 para la red privada.

## Primera prueba del firmware

1. Subir el firmware desde PlatformIO.
2. Abrir el monitor serie a `115200`.
3. Si aparece `config_portal`, conectar el celular o PC a `Balanza-Setup`.
4. Abrir `192.168.4.1`.
5. Completar la URL del servidor, el ID `balanza-01` y el token `demo-device-token`.
6. Esperar `wifi_connected` y luego `device_register` con estado exitoso.
7. Abrir el dashboard y verificar `Balanza Wi-Fi: ONLINE`.

## Calibración segura

1. Dejar el recipiente/plataforma vacía y quieta.
2. Enviar `T` por el monitor serie.
3. Esperar `tare_done`.
4. Colocar una masa conocida y estable.
5. Enviar `C 500` si la masa es de 500 gramos.
6. Esperar `calibration_saved`.
7. Retirar la masa y comprobar que vuelva cerca de cero.
8. Repetir con otra masa antes de usar una fórmula real.

No calibrar si la lectura está saturada, cambia continuamente o la celda está mal montada.

## Primera formulación de prueba

- Usar una receta demo y un recipiente por aditivo.
- Confirmar que el peso aparece en el monitor serie y en el dashboard.
- Pulsar **Tomar lectura Wi-Fi**.
- Confirmar que solo se registra el aditivo actual.
- Verificar que después de OK la lectura vuelve a `0 kg`.
- Exportar el CSV y comprobar el historial.

## Antes de planta

- Cambiar el token demo.
- No usar `setInsecure()` en HTTPS productivo; instalar la CA del certificado interno.
- Reservar IP o DNS para el servidor.
- Definir respaldo de `data/`.
- Confirmar recetas, tolerancias, orden de aditivos y formato SAP.
- Probar pérdida y recuperación de Wi‑Fi sin perder la formulación activa.
