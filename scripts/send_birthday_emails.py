import os
import smtplib
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultottom
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
        today = datetime.now()
        month = str(today.month).zfill(2)
        day = str(today.day).zfill(2)
        mmdd = f"{month}-{day}"

        print(f"Checking for birthdays on {mmdd}")

        # Query members collection for today's birthdays
        members_ref = db.collection('members')
        query = members_ref.where('fechaNacimientoMMdd', '==', mmdd)
        members_snapshot = query.get()

        if len(members_snapshot) == 0:
            print('No birthdays today')
            return

        print(f"Found {len(members_snapshot)} birthday(s) today")

        # Gmail SMTP settings
        gmail_user = os.environ['GMAIL_USER']
        gmail_app_password = os.environ['GMAIL_APP_PASSWORD']

        # Set up the SMTP server
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(gmail_user, gmail_app_password)

        for doc in members_snapshot:
            member = doc.to_dict()
            nombre = member.get('nombre', 'Miembro')
            email = member.get('email')

            if not email:
                print(f"Member {nombre} has no email, skipping")
                continue

            # Create the email
            msg = MIMEMultipart()
            msg['From'] = gmail_user
            msg['To'] = email
            msg['Subject'] = f'¡Feliz cumpleaños, {nombre}! 🎂'

            body = f'''
            ¡Feliz cumpleaños, {nombre}!

            Esperamos que tengas un día lleno de bendiciones, alegría y muchas razones para celebrar.
            Que Dios te siga guiando y protegiendo en este nuevo año de vida.

            ¡Con cariño,
            El grupo Luz de Cristo
            '''

            msg.attach(MIMEText(body, 'plain'))

            # Send the email
            text = msg.as_string()
            server.sendmail(gmail_user, email, text)
            print(f"Birthday email sent to {nombre} ({email})")

        server.quit()
        print("All birthday emails sent successfully")

    except Exception as e:
        print(f"Error in birthday email job: {e}")
        raise e

if __name__ == "__main__":
    send_birthday_emails()