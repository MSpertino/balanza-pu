# Balanza digital y trazabilidad de formulaciones

MVP local para probar el flujo de identificación, formulación, pesaje y trazabilidad antes de conectar el ESP32 con HX711.

## Requisitos

- Node.js 20 o superior.
- Navegador en la misma máquina.

## Ejecutar

Podés iniciar el servidor de cualquiera de estas formas:

```powershell
npm start
```

O haciendo doble clic en [`iniciar-servidor.cmd`](iniciar-servidor.cmd). La ventana que se abre debe permanecer abierta mientras usás la página.

Abrir <http://localhost:3000>.

El MVP funciona sin hardware. El peso se simula desde la pantalla y el servidor conserva los registros en memoria. Al reiniciar, los datos demo vuelven a su estado inicial.

## Próximos pasos

1. Validar en planta el orden de carga, tolerancias, unidades y reglas de corrección.
2. Reemplazar el adaptador de peso simulado por comunicación USB/serial con el ESP32.
3. Persistir en SQLite/PostgreSQL y agregar autenticación real.
4. Definir el formato de exportación/importación con SAP.

La especificación inicial está en [`docs/analisis-inicial.md`](docs/analisis-inicial.md).
