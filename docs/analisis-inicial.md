# Análisis inicial — sistema de formulación y trazabilidad

## Objetivo

Registrar, en el orden real de fabricación, qué producto SAP se formuló, qué materiales se cargaron, cuánto pesó cada uno, quién realizó la operación y cuándo. La pantalla debe reducir la operación del trabajador a escanear/ingresar un producto, seguir la lista y pulsar **Registrar material**.

## Alcance del primer prototipo

- Identificación de producto mediante código SAP.
- Fórmula ordenada por material, objetivo y tolerancia.
- Inicio de una formulación y número único.
- Lectura de peso simulada para trabajar antes de conectar el ESP32.
- Cero/tara de la formulación.
- Registro de cada material con peso y fecha.
- Finalización y exportación CSV para validar el circuito con el responsable de SAP.
- Separación de roles prevista: administrador interno, jefe/consulta y operador.

## Arquitectura propuesta

```text
ESP32 + HX711 + celda de carga
          │ USB durante pruebas / Wi-Fi en planta
          ▼
Adaptador de lectura de peso ── API del servidor ── Interfaz web de planta
                                      │
                            Base de datos + exportación SAP
```

Durante la prueba local el adaptador se reemplaza por el simulador de la pantalla. La API no debe depender de la tecnología física de la balanza.

## Reglas de negocio a confirmar

1. ¿La fórmula tiene un orden obligatorio? El prototipo asume que sí.
2. ¿Se registra el peso bruto, el incremento desde el último registro o ambos?
3. ¿Qué tolerancia tiene cada material y qué ocurre si queda fuera de tolerancia?
4. ¿Se permite corregir, quitar o repetir un material? Toda corrección debe quedar auditada.
5. ¿Se debe escanear un código de barras/QR, y qué formato exacto tiene el código SAP?
6. ¿Cómo se identifica el lote del material y del producto terminado?
7. ¿Cuándo se considera finalizada una formulación y quién puede reabrirla?
8. ¿Qué significa “poner en 0”: tara del recipiente vacío, inicio de una nueva formulación o corrección autorizada?
9. ¿Qué columnas/formato requiere SAP y mediante qué mecanismo se importarán los datos?
10. ¿Cuántas balanzas habrá, qué alcance de red tiene el Wi-Fi y qué sucede si se corta la conexión?

## Roles iniciales

- **Administrador interno:** productos, fórmulas, tolerancias, usuarios, Wi-Fi/configuración y exportación.
- **Jefe:** consulta de formulaciones, trazabilidad, incidencias y reportes.
- **Operador:** iniciar una fórmula, seguir el orden, tarar con permiso y registrar cada material.

Se debe evitar que el operador vea configuración técnica o pueda borrar registros.

## Riesgos técnicos

- La celda de 10 kg puede quedar chica si recipiente + material superan ese límite.
- La calibración, la tara, las vibraciones y la estabilidad de la lectura son críticas.
- Wi-Fi no debe ser el único lugar donde vive un registro: hay que definir reintento y almacenamiento local.
- Una exportación CSV no equivale todavía a integración SAP; el formato debe aprobarlo el responsable de SAP.
- No se deben guardar contraseñas Wi-Fi ni credenciales SAP en el firmware o en el repositorio.

## Plan de implementación

### Fase 1 — prototipo local

Usar el servidor incluido en este proyecto y datos simulados. Validar con usuarios el flujo y los nombres.

### Fase 2 — persistencia y seguridad

Agregar SQLite/PostgreSQL, login, permisos, auditoría, respaldo y configuración administrable.

### Fase 3 — hardware

Probar serial USB con el ESP32, calibrar HX711, agregar estado de estabilidad, desconexión y reconexión.

### Fase 4 — piloto de planta

Una balanza, un producto y una fórmula real. Comparar registros con el método manual y ajustar tolerancias.

### Fase 5 — servidor e integración

Publicar en intranet, documentar operación y seguridad, y conectar el formato aprobado por SAP.
