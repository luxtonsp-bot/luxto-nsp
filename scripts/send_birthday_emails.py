import os
import smtplib
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from zoneinfo import ZoneInfo
import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase Admin SDK
# We expect the service account JSON to be in the current directory as firebase-service-account.json
# This file is created by the GitHub Action from the secret
cred = credentials.Certificate('firebase-service-account.json')
firebase_admin.initialize_app(cred)

db = firestore.client()

def send_birthday_emails():
    try:
        # Hora de Lima (es la fecha de cumpleaños que importa; UTC del runner
        # cruzaría mal: a las 7pm Lima el UTC ya cambió de día)
        today = datetime.now(ZoneInfo('America/Lima'))
        month = str(today.month).zfill(2)
        day = str(today.day).zfill(2)
        today_mmdd = f"{month}-{day}"

        print(f"Checking for birthdays on {today_mmdd}")

        # 1. Detectar TODOS los miembros con cumpleaños hoy (cualquier rol)
        members_ref = db.collection('members')
        all_birthday_query = members_ref.where('fechaNacimientoMMdd', '==', today_mmdd)
        all_birthday_snapshot = all_birthday_query.get()

        birthday_names = []
        for doc in all_birthday_snapshot:
            member = doc.to_dict()
            nombre = member.get('nombre', 'Miembro')
            birthday_names.append(nombre)

        if not birthday_names:
            print('No birthdays today')
            return

        print(f"Birthdays today: {', '.join(birthday_names)}")

        # 2. Obtener SOLO servidores/apoyos (destinatarios de la notificación)
        notify_query = members_ref.where('rol', 'in', ['servidor', 'apoyo'])
        notify_snapshot = notify_query.get()

        notify_emails = []
        for doc in notify_snapshot:
            member = doc.to_dict()
            email = member.get('email')
            nombre = member.get('nombre', 'Miembro')
            if email:
                notify_emails.append((nombre, email))
            else:
                print(f"Notificador {nombre} sin email, saltando")

        if not notify_emails:
            print('No servidores/apoyos con email para notificar')
            return

        # 3. Enviar email a cada servidor/apoyo con la lista de cumpleañeros
        gmail_user = os.environ['GMAIL_USER']
        gmail_app_password = os.environ['GMAIL_APP_PASSWORD']

        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(gmail_user, gmail_app_password)

        cumple_list = '\n'.join([f'• {n}' for n in birthday_names])

        for notif_nombre, notif_email in notify_emails:
            msg = MIMEMultipart()
            msg['From'] = gmail_user
            msg['To'] = notif_email
            msg['Subject'] = f'🎂 Cumpleaños de hoy ({len(birthday_names)})'

            body = f'''Hola {notif_nombre}:

Hoy cumplen años {len(birthday_names)} asambleista(s):

{cumple_list}

Recuerda saludarlos en la asamblea o por el grupo.

¡Bendiciones,
Sistema Luz de Cristo'''

            msg.attach(MIMEText(body, 'plain'))
            server.sendmail(gmail_user, notif_email, msg.as_string())
            print(f"Notification sent to {notif_nombre} ({notif_email})")

        server.quit()
        print("All birthday notifications sent successfully")

    except Exception as e:
        print(f"Error in birthday email job: {e}")
        raise e

if __name__ == "__main__":
    send_birthday_emails()