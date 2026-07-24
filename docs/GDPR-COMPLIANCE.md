# AUDITORÍA Y CUMPLIMIENTO GDPR / PROTECCIÓN DE DATOS

## Dashboard Comercial 2026

---

## 1. Identificación de Datos Personales Tratados
En la plataforma **Dashboard Comercial 2026**, se procesan los siguientes datos personales y de negocio:
- **Datos de Usuarios Internos:** Nombre, correo electrónico institucional, rol comercial (`gerencia`, `gerente_comercial`, `coordinador`, `asesor`), hash de contraseña (Argon2), tokens de sesión.
- **Datos de Clientes Comerciales:** RIF/Identificación fiscal, Razón Social, teléfono de contacto, dirección física, historial de facturación y cobranza.

---

## 2. Bases Legales del Tratamiento (Art. 6 GDPR)
- **Ejecución de Contrato:** Necesario para la gestión comercial, cobranza y asignación de metas.
- **Interés Legítimo:** Análisis de rendimiento comercial, detección de anomalías y prevención de fraude.
- **Consentimiento:** Otorgado mediante el banner de cookies y la aceptación de los Términos & Condiciones.

---

## 3. Derechos de los Interesados
La plataforma implementa los mecanismos para garantizar los derechos GDPR:
1. **Derecho de Acceso:** Los usuarios pueden descargar/exportar su perfil y reportes en formato CSV/Excel.
2. **Derecho de Rectificación:** La administración de usuarios permite corregir datos desactualizados.
3. **Derecho al Olvido / Supresión:** Procedimiento seguro de eliminación de cuenta mediante anonimización en BD.
4. **Portabilidad de Datos:** Exportación estructurada mediante endpoints de consulta.

---

## 4. Política de Retención de Datos
- **Registros de Auditoría y Logs:** Retenidos por un máximo de 90 días.
- **Sesiones Activas:** Expiración automática tras 7 días de inactividad.
- **Datos Comerciales Históricos:** Mantenidos durante el tiempo requerido por las leyes tributarias y comerciales locales.

---

## 5. Medidas Técnicas de Seguridad (TOMs)
- Cifrado en tránsito mediante HTTPS / TLS 1.3.
- Hashing de contraseñas mediante **Argon2id**.
- Control de acceso basado en roles (RBAC) reforzado a nivel de base de datos Drizzle ORM.
- Desactivación inmediata de cuentas comprometidas.
