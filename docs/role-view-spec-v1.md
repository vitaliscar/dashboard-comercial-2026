# Role View Spec v1

## Objetivo

Definir el contrato oficial de acceso a vistas, módulos y acciones por rol en Dashboard Comercial 2026.

## Roles

- gerencia
- gerente_comercial
- coordinador
- asesor

## Reglas globales de alcance

1. UI nunca debe mostrar datos fuera de alcance del rol.
2. Toda consulta en vistas protegidas debe aplicar `scoped(...)` además de RLS.
3. Menú lateral debe renderizar sólo módulos autorizados.
4. Acciones de escritura deben respetar el contrato de rol en UI y en política de base de datos.

## Módulos y acceso por rol

| Módulo                  | gerencia | gerente_comercial | coordinador | asesor |
| ----------------------- | -------- | ----------------- | ----------- | ------ |
| resumen                 | si       | si                | si          | si     |
| dashboard (router)      | si       | si                | si          | si     |
| gerencia_nacional       | si       | si                | no          | no     |
| cobranzas               | si       | si                | si          | si     |
| minutas (lectura)       | si       | si                | si          | si     |
| minutas (crear/editar)  | si       | si                | si          | no     |
| minutas (eliminar)      | si       | no                | no          | no     |
| pipeline                | si       | si                | si          | si     |
| pareto                  | si       | si                | no          | no     |
| alertas                 | si       | si                | si          | si     |
| usuarios                | si       | no                | no          | no     |
| carga excel             | si       | no                | no          | no     |
| servicios               | si       | si                | si          | no     |
| lubfiltros              | si       | si                | si          | no     |
| equipos                 | si       | si                | si          | no     |
| alquiler                | si       | si                | si          | no     |
| sucursal                | no       | no                | si          | no     |
| asesor (vista personal) | no       | no                | no          | si     |

## Scoping esperado por rol

- gerencia: sin restriccion (all).
- gerente_comercial: `unidad_negocio_id = profile.unidad_negocio_id`.
- coordinador: `sucursal_id = profile.sucursal_id`.
- asesor: `asesor_id = auth.uid()` o equivalente en tabla (`responsable_id` en minutas).

## Redirección inicial por rol

- gerencia -> /gerencia-nacional
- gerente_comercial -> /gerencia-nacional
- coordinador -> /coordinador
- asesor -> /asesor

## Criterios de aceptación

1. Un usuario nunca ve módulos no autorizados en navegación.
2. Todas las vistas protegidas relevantes usan `scoped(...)`.
3. Las acciones de minutas y administración se muestran según contrato.
4. Pareto sólo visible para gerencia y gerente_comercial.
5. Usuarios y carga sólo visibles para gerencia.
