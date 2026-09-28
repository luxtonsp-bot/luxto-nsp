#!/usr/bin/env python3
"""
Envío de notificaciones de cumpleaños — 100% dinámico desde Firestore.
- Solo notificadores activos este año (estadoAnioActual: activo/perseverante)
- Roles: servidor, apoyo, coordinador
- Formato bonito estilo Apps Script original
- BCC único + fallback individual si hay bounces
"""
import os
import smtplib
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from zoneinfo import ZoneInfo
import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('firebase-service-account.json')
firebase_admin.initialize_app(cred)

db = firestore.client()


def is_valid_email(email: str) -> bool:
    """Validación básica de email"""
    if not email or '@' not in email:
        return False
    local, domain = email.split('@', 1)
    return '.' in domain and len(local) > 0 and len(domain) > 3


def send_birthday_emails():
    try:
        # Hora de Lima
        today = datetime.now(ZoneInfo('America/Lima'))
        month = str(today.month).zfill(2)
        day = str(today.day).zfill(2)
        today_mmdd = f"{month}-{day}"
        fecha_hoy_texto = today.strftime('%d/%m/%Y')

        print(f"Checking for birthdays on {today_mmdd} ({fecha_hoy_texto})")

        # 1. Detectar TODOS los cumpleañeros de HOY que estén ACTIVOS este año
        members_ref = db.collection('members')
        birthday_query = members_ref.where('fechaNacimientoMMdd', '==', today_mmdd)
        birthday_snapshot = birthday_query.get()

        birthday_names = []
        for doc in birthday_snapshot:
            member = doc.to_dict()
            estado = member.get('estadoAnioActual', 'activo')
            if estado in ('activo', 'perseverante'):
                nombre = member.get('nombre', 'Miembro')
                birthday_names.append(nombre)
            else:
                print(f"  ⏭️ Saltando {member.get('nombre')} (estado: {estado})")

        if not birthday_names:
            print('No birthdays today (active members)')
            return

        print(f"Birthdays today (active): {', '.join(birthday_names)}")

        # 2. Obtener notificadores DINÁMICOS: rol + estado activo este año
        notify_query = members_ref.where('rol', 'in', ['servidor', 'apoyo', 'coordinador'])
        notify_snapshot = notify_query.get()

        valid_recipients = []
        skipped_no_email = []
        skipped_inactive = []
        skipped_invalid_email = []

        for doc in notify_snapshot:
            member = doc.to_dict()
            nombre = member.get('nombre', 'Miembro')
            email = member.get('email')
            rol = member.get('rol', 'miembro')
            estado = member.get('estadoAnioActual', 'activo')

            # Solo activos/perseverantes este año
            if estado not in ('activo', 'perseverante'):
                skipped_inactive.append(f"{nombre} ({rol}, estado: {estado})")
                continue

            if not email:
                skipped_no_email.append(f"{nombre} ({rol})")
                continue

            if not is_valid_email(email):
                skipped_invalid_email.append(f"{nombre} ({rol}) - {email}")
                continue

            valid_recipients.append((nombre, email, rol))

        # Logs claros
        if skipped_no_email:
            print(f"⏭️ Sin email ({len(skipped_no_email)}): {', '.join(skipped_no_email)}")
        if skipped_inactive:
            print(f"⏭️ Inactivos este año ({len(skipped_inactive)}): {', '.join(skipped_inactive)}")
        if skipped_invalid_email:
            print(f"⏭️ Email inválido ({len(skipped_invalid_email)}): {', '.join(skipped_invalid_email)}")

        if not valid_recipients:
            print('❌ No hay destinatarios válidos para notificar')
            return

        print(f"✅ Total destinatarios válidos: {len(valid_recipients)}")
        for n, e, r in valid_recipients:
            print(f"  → {n} ({r}) - {e}")

        # 3. Construir email estilo Apps Script original
        lista_estrellas = '\n⭐ ' + '\n⭐ '.join(birthday_names)
        asunto = f'🎂 ¡Recordatorio de Cumpleaños! ({len(birthday_names)})'

        cuerpo = f'''¡Hola servidores y apoyos!

Este es el aviso de cumpleaños para hoy {fecha_hoy_texto}:

{lista_estrellas}

Por favor, saluden a los cumpleañeros en la asamblea o por el grupo. ¡Bendiciones!

Equipo de servidores Luz De Cristo 🧂 y 💡'''

        # 4. Enviar via SMTP con BCC
        gmail_user = os.environ['GMAIL_USER']
        gmail_app_password = os.environ['GMAIL_APP_PASSWORD']

        msg = MIMEMultipart()
        msg['From'] = gmail_user
        msg['To'] = gmail_user  # Remitente recibe copia
        msg['Bcc'] = ', '.join([e for _, e, _ in valid_recipients])
        msg['Subject'] = asunto
        msg.attach(MIMEText(cuerpo, 'plain'))

        try:
            server = smtplib.SMTP('smtp.gmail.com', 587)
            server.starttls()
            server.login(gmail_user, gmail_app_password)

            all_recipients = [gmail_user] + [e for _, e, _ in valid_recipients]
            server.sendmail(gmail_user, all_recipients, msg.as_string())
            server.quit()

            print(f"✅ Email BCC enviado exitosamente a {len(valid_recipients)} destinatarios")
            for n, e, r in valid_recipients:
                print(f"   BCC: {n} ({r}) - {e}")

        except smtplib.SMTPRecipientsRefused as e:
            print(f"⚠️ BCC rechazado por servidor, intentando envío individual...")
            send_individual_fallback(gmail_user, gmail_app_password, asunto, cuerpo, valid_recipients)
        except Exception as e:
            print(f"❌ Error SMTP: {e}")
            raise

    except Exception as e:
        print(f"❌ Error en birthday email job: {e}")
        raise


def send_individual_fallback(gmail_user, gmail_app_password, asunto, cuerpo, recipients):
    """Fallback: enviar uno por uno para aislar bounces"""
    print("🔄 Modo fallback: envío individual...")
    server = smtplib.SMTP('smtp.gmail.com', 587)
    server.starttls()
    server.login(gmail_user, gmail_app_password)

    sent = 0
    failed = 0
    for nombre, email, rol in recipients:
        try:
            msg = MIMEMultipart()
            msg['From'] = gmail_user
            msg['To'] = email
            msg['Subject'] = asunto
            msg.attach(MIMEText(cuerpo, 'plain'))
            server.sendmail(gmail_user, email, msg.as_string())
            print(f"   ✅ {nombre} ({rol}) - {email}")
            sent += 1
        except smtplib.SMTPRecipientsRefused as e:
            print(f"   ❌ REBOTE: {nombre} ({rol}) - {email} → {e}")
            failed += 1
        except Exception as e:
            print(f"   ❌ ERROR: {nombre} ({rol}) - {email} → {e}")
            failed += 1

    server.quit()
    print(f"Fallback: {sent} enviados, {failed} fallaron")


if __name__ == "__main__":
    send_birthday_emails()