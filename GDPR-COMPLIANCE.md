# Documento de Cumplimiento Regulatorio y GDPR

**Proyecto**: `dashboard-comercial-2026`

Este documento certifica las medidas técnicas y organizativas implementadas en el Dashboard Comercial para cumplir con el Reglamento General de Protección de Datos (GDPR / RGPD) y regulaciones locales de privacidad.

---

## 1. Inventario de Datos Personales (PII)

El sistema procesa y almacena las siguientes categorías de datos personales:

| Categoría de Dato                 | Propósito del Tratamiento                | Base Legal                   | Retención                                |
| --------------------------------- | ---------------------------------------- | ---------------------------- | ---------------------------------------- |
| **Correo electrónico de usuario** | Autenticación y acceso al sistema        | Ejecución de Contrato        | Duración de la relación laboral + 5 años |
| **Nombre y Apellido**             | Identificación de asesores/coordinadores | Interés Legítimo / Contrato  | Duración de la relación laboral + 5 años |
| **Rol y Sucursal**                | Control de Acceso Basado en Roles (RBAC) | Ejecución de Contrato        | Duración de la relación laboral          |
| **Dirección IP y User Agent**     | Auditoría de seguridad y logs de accesos | Interés Legítimo (Seguridad) | 365 días                                 |

---

## 2. Derechos de los Interesados (Derechos ARCO / GDPR)

1. **Derecho de Acceso y Portabilidad (Art. 15 y 20 GDPR)**:
   - Los usuarios pueden exportar su expediente de datos en formato JSON legible desde la API de cumplimiento (`gdprManager.exportUserData(userId)`).
2. **Derecho al Olvido / Supresión (Art. 17 GDPR)**:
   - Al desvincular un usuario, se ejecuta el procedimiento de anonimización irreversibles (`gdprManager.executeRightToBeForgotten(userId)`), reemplazando nombres e emails por identificadores anonimizados sin romper la integridad histórica de ventas.
3. **Gestión del Consentimiento y Cookies**:
   - Implementación de banner de consentimiento de cookies técnicas y analíticas (`src/components/cookie-consent.tsx`).

---

## 3. Políticas de Conservación de Datos

- **Logs de Auditoría y Servidor**: Se conservan durante un máximo de **365 días** mediante tareas automáticas de purga (`cleanupExpiredLogs`).
- **Resguardos de Base de Datos**: Copias de seguridad cifradas almacenadas en VPS con rotación de 30 días.
