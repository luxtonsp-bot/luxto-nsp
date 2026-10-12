const admin = require('firebase-admin');
const fetch = require('node-fetch');

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function sendBirthdayEmails() {
  try {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(today.getDate()).padStart(2, '0');
    const mmdd = `${month}-${day}`;

    console.log(`Checking for birthdays on ${mmdd}`);

    // Query members collection for today's birthdays
    // Note: We're storing fechaNacimiento as a string in MM-DD format for easier querying
    const membersSnapshot = await db.collection('members')
      .where('fechaNacimientoMMdd', '==', mmdd)
      .get();

    if (membersSnapshot.empty) {
      console.log('No birthdays today');
      return;
    }

    console.log(`Found ${membersSnapshot.size} birthday(s) today`);

    // Process each member with a birthday
    for (const doc of membersSnapshot.docs) {
      const member = doc.data();
      const { nombre, email, fechaNacimiento } = member;

      if (!email) {
        console.log(`Member ${nombre} has no email, skipping`);
        continue;
      }

      // Prepare email data
      const emailData = {
        service_id: process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_TEMPLATE_ID,
        user_id: process.env.EMAILJS_USER_ID,
        template_params: {
          to_name: nombre,
          from_name: 'Luz de Cristo',
          from_email: 'noreply@luxto-nsp.firebaseapp.com',
          subject: `¡Feliz cumpleaños, ${nombre}! 🎂`,
          message: `¡Feliz cumpleaños, ${nombre}! Esperamos que tengas un día lleno de bendiciones, alegría y muchas razones para celebrar. Que Dios te siga guiando y protegiendo en este nuevo año de vida. ¡Con cariño, el grupo Luz de Cristo!`
        }
      };

      // Send email via EmailJS
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailData)
      });

      if (response.ok) {
        console.log(`Birthday email sent to ${nombre} (${email})`);
      } else {
        const errorText = await response.text();
        console.error(`Failed to send email to ${nombre}:`, response.status, errorText);
      }
    }

  } catch (error) {
    console.error('Error in birthday email job:', error);
    throw error;
  }
}

// Run the function
sendBirthdayEmails().catch(console.error);