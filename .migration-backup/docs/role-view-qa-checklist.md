# Role View QA Checklist

## Preparación

- Disponer de 4 cuentas activas: gerencia, gerente_comercial, coordinador, asesor.
- Verificar que cada perfil tenga campos de alcance correctos (sucursal, unidad, id).

## Navegación

1. Iniciar sesión con cada rol.
2. Validar que el menú muestra sólo módulos autorizados según `role-view-spec-v1.md`.
3. Intentar navegar manualmente a una ruta no autorizada y verificar bloqueo o mensaje de acceso denegado.

## Datos (scoping)

1. Cobranzas:

- gerencia ve todo.
- gerente_comercial ve sólo su unidad.
- coordinador ve sólo su sucursal.
- asesor ve sólo sus registros.

2. Minutas:

- confirmar filtro por alcance para los 4 roles.
- asesor no puede editar/eliminar.

3. Pipeline:

- confirmar que métricas y tablas no mezclan datos fuera de alcance.

4. Alertas:

- confirmar que alertas dependen del subconjunto permitido por rol.

5. Pareto:

- visible para gerencia y gerente_comercial.
- oculto/bloqueado para coordinador y asesor.

## Acciones

1. Gestión de usuarios:

- visible y operable sólo para gerencia.

2. Carga Excel:

- visible y operable sólo para gerencia.

3. Minutas:

- gerencia, gerente_comercial y coordinador pueden crear/editar.
- sólo gerencia puede eliminar.
- asesor sólo lectura.

## Criterios de aprobación

- 100% de checks de navegación cumplidos.
- 100% de checks de alcance de datos cumplidos.
- 0 accesos no autorizados por ruta directa.
- 0 acciones críticas visibles para roles no permitidos.
