// config.template.js — COPIA ESTE ARCHIVO A config.local.js Y LLENA LOS VALORES
// config.local.js está en .gitignore y NO se sube al repo

window.LUXTO_CONFIG = {
  // Firebase Config (puedes dejar estos si restringes dominios en Firebase Console)
  firebase: {
    apiKey: "TU_API_KEY_AQUI",
    authDomain: "luxto-nsp.firebaseapp.com",
    projectId: "luxto-nsp",
    storageBucket: "luxto-nsp.firebasestorage.app",
    messagingSenderId: "3542836325",
    appId: "1:3542836325:web:cf65cd50edcc431500d28c",
    databaseURL: "https://luxto-nsp-default-rtdb.firebaseio.com"
  },

  // Apps Script URL — SECRETO CRÍTICO, NUNCA EN REPO PÚBLICO
  appsScriptUrl: "https://script.google.com/macros/s/TU_DEPLOYMENT_ID_AQUI/exec",

  // Admin emails — Mejor: usar Firebase Custom Claims en producción
  // Si usas este array, no commitees emails reales
  adminEmails: [
    "admin1@ejemplo.com",
    "admin2@ejemplo.com"
    // Agrega tus emails reales solo en config.local.js
  ]
};
