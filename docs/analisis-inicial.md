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

## Actualización 10/11/2026 — reglas de la reunión

La documentación base vigente es [el PDF](../_documentacion_base.pdf). Esta actualización reemplaza las suposiciones anteriores del prototipo sobre peso de poliol, tolerancias fijas y datos volátiles:

- Poliol ingresado manualmente; referencia de fórmula de 190 kg. Poliol e isocianato se validan y registran fuera de la balanza de aditivos.
- Objetivos proporcionales sin redondeo intermedio y tolerancia porcentual por aditivo.
- Amarillo por debajo, verde dentro del rango, rojo por encima. OK solo en verde; tara bloqueada en rojo.
- OK registra y tara. Reinicio individual con retiro físico del material y conservación del historial.
- Persistencia local en JSON; lógica de negocio exclusivamente en el servidor.

Las recetas y porcentajes incluidos siguen siendo demostrativos. Falta confirmar recetas reales, identificación de materiales, procedimiento de jarras, precisión del hardware y permisos para uso en planta. La selección de proveedor/versiones y el registro detallado de cantidades de isocianato quedan pendientes.

## Actualización 16/11/2026 — recipientes independientes

La balanza de aditivos no trabaja con un único recipiente acumulativo. Cada aditivo se pesa en un recipiente diferente; luego los recipientes se vuelcan juntos para formar el sólido final.

- La lectura registrada es el **peso neto del aditivo del recipiente actual**, no el peso acumulado del sólido.
- El operador debe retirar el recipiente anterior, colocar el próximo recipiente vacío y pulsar **Tarar recipiente** antes de cargar el siguiente material.
- La pantalla debe mostrar en forma destacada **Siguiente material: [nombre]**, junto con su objetivo y rango permitido.
- **OK** registra solamente el aditivo actual y reinicia la lectura y la tara a `0 kg`; el siguiente aditivo comienza desde cero.
- El sistema no debe permitir confirmar si el peso está por debajo o por encima de la tolerancia.
- El orden de la fórmula es el orden de pesaje y queda auditado.

En el simulador, para cada material se ingresa la lectura del recipiente actual, se actualiza, se verifica el rango, se registra, se vuelve la lectura a cero para simular el retiro del recipiente y se tara el recipiente siguiente. El PDF original se conserva como documento fuente; esta especificación editable contiene las actualizaciones funcionales del prototipo.

## Actualización 18/11/2026 — configuración de fórmulas

Se agrega una pantalla independiente de configuración, accesible desde la pantalla principal mediante **Configurar fórmulas**. Su objetivo es que el responsable cargue la receta sin modificar el código del sistema y que el operador pueda mantener abierta la pantalla de configuración junto con la pantalla de pesaje.

- Cada fórmula se identifica por código SAP y nombre.
- La fórmula define una referencia de poliol en kg para calcular proporciones.
- Los materiales se agregan en el orden de pesaje.
- Cada material contiene código, nombre, cantidad de referencia en kg y tolerancia porcentual.
- Guardar una fórmula nueva o existente la persiste en `data/formulas.json` y la publica en el selector de la pantalla de formulación.
- Al iniciar una formulación se copia la receta vigente; cambios posteriores no alteran formulaciones ya iniciadas.
- El acceso de configuración queda separado visualmente del flujo operativo de pesaje. En una etapa productiva deberá restringirse por rol de administrador o responsable de proceso.

El PDF original se conserva sin modificación como documento fuente. Esta especificación editable registra el comportamiento implementado hasta contar con una herramienta aprobada para editar o regenerar el PDF oficial.
