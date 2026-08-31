"""
Revertir todos los cambios de Lub/Filtros hechos en el CRM (bismercadeo) durante
la sesion de hoy, hasta el punto donde el "Total Facturado" del /resumen ya
funcionaba correctamente (validado en $1.442.656 para julio 2026).

El codigo local (dashboard-comercial-2026/src/lib/espocrm-client.ts y
bismercadeo/custom/.../entityDefs/{Presupuesto,Opportunity}.json) YA fue
revertido a mano. Este script solo hace lo que requiere conexion al servidor:

1. Sube los 2 archivos .json ya revertidos (enums sin Lub/Filtros/'L')
2. Rebuild + update-app-timestamp del CRM
3. Restaura las tablas `opportunity` y `presupuesto`+`detalle_presupuesto`
   desde los backups tomados ANTES de tocar nada

Credenciales: SOLO por variables de entorno (nunca hardcodeadas).

  SSH_HOST, SSH_PORT, SSH_USER, SSH_PASSWORD
  MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB
  REMOTE_BASE (opcional, default /var/www/bismercadeo)

Uso: python revertir-lubfiltros.py
"""

import os
import sys
import paramiko

HOST = os.environ.get("SSH_HOST", "172.16.4.76")
PORT = int(os.environ.get("SSH_PORT", "22"))
USER = os.environ["SSH_USER"]
PASSWORD = os.environ["SSH_PASSWORD"]
REMOTE_BASE = os.environ.get("REMOTE_BASE", "/var/www/bismercadeo")

MYSQL_USER = os.environ["MYSQL_USER"]
MYSQL_PASSWORD = os.environ["MYSQL_PASSWORD"]
MYSQL_DB = os.environ.get("MYSQL_DB", "espoCRM")

LOCAL_PRESUPUESTO_JSON = r"D:\dev\bismercadeo\custom\Espo\Custom\Resources\metadata\entityDefs\Presupuesto.json"
LOCAL_OPPORTUNITY_JSON = r"D:\dev\bismercadeo\custom\Espo\Custom\Resources\metadata\entityDefs\Opportunity.json"

BACKUP_OPPORTUNITY = f"{REMOTE_BASE}/backup-opportunity-pre-lubfiltros-20260807.sql"
BACKUP_PRESUPUESTO = f"{REMOTE_BASE}/backup-presupuesto-pre-reimport-20260807.sql"


def run_sudo_bash(client, inner_cmd, timeout=300):
    full = f"sudo -S -p '' bash -c \"{inner_cmd}\""
    print(f"\n$ {inner_cmd}")
    stdin, stdout, stderr = client.exec_command(full, timeout=timeout, get_pty=True)
    stdin.write(PASSWORD + "\n")
    stdin.flush()
    out = stdout.read().decode(errors="replace")
    print(out)
    err = stderr.read().decode(errors="replace")
    if err:
        print("STDERR:", err)
    return out


def main():
    required = ["SSH_USER", "SSH_PASSWORD", "MYSQL_USER", "MYSQL_PASSWORD"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"Faltan variables de entorno: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=15)
    print("SSH conectado OK")

    sftp = client.open_sftp()
    sftp.put(
        LOCAL_PRESUPUESTO_JSON,
        REMOTE_BASE + "/custom/Espo/Custom/Resources/metadata/entityDefs/Presupuesto.json",
    )
    print("subido Presupuesto.json (revertido)")
    sftp.put(
        LOCAL_OPPORTUNITY_JSON,
        REMOTE_BASE + "/custom/Espo/Custom/Resources/metadata/entityDefs/Opportunity.json",
    )
    print("subido Opportunity.json (revertido)")
    sftp.close()

    run_sudo_bash(client, f"cd {REMOTE_BASE} && php command.php rebuild")
    run_sudo_bash(client, f"cd {REMOTE_BASE} && php command.php update-app-timestamp")

    run_sudo_bash(
        client,
        f"mysql -u {MYSQL_USER} -p'{MYSQL_PASSWORD}' {MYSQL_DB} < {BACKUP_OPPORTUNITY}",
    )
    run_sudo_bash(
        client,
        f"mysql -u {MYSQL_USER} -p'{MYSQL_PASSWORD}' {MYSQL_DB} < {BACKUP_PRESUPUESTO}",
    )

    client.close()
    print("\nDone. Revert del CRM completo.")
    print(
        "Ultimo paso (correr aparte, en dashboard-comercial-2026):\n"
        "  ESPOCRM_DB_HOST=... ESPOCRM_DB_USER=... ESPOCRM_DB_PASSWORD=... "
        "ESPOCRM_DB_NAME=espoCRM bun run load-espocrm"
    )


if __name__ == "__main__":
    main()
