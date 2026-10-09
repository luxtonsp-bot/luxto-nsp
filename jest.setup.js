// jest.setup.js - Configuración global para tests
import { JSDOM } from 'jsdom';

// Configurar DOM global para tests
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable'
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLButtonElement = dom.window.HTMLButtonElement;
global.HTMLDivElement = dom.window.HTMLDivElement;
global.HTMLSpanElement = dom.window.HTMLSpanElement;
global.HTMLInputElement = dom.window.HTMLInputElement;
global.HTMLElement = dom.window.HTMLElement;
global.customElements = dom.window.customElements;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

// Mock Firebase modules
jest.mock('./assets/js/firebase-init.js', () => ({
  auth: {},
  rtdb: {},
  ref: jest.fn(),
  set: jest.fn(),
  onValue: jest.fn(),
  onDisconnect: jest.fn(() => ({ remove: jest.fn(), cancel: jest.fn() })),
  rtdbTS: jest.fn(() => Date.now()),
  esc: (str) => str
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '''),
  KAHOOT_RTDB_PATHS: {
    meta: 'asamblea/kahoot/meta',
    sesionActivaFlag: 'asamblea/kahoot/sesionActiva',
    respuestas: 'asamblea/kahoot/respuestas',
    conectados: 'asamblea/conectados',
    rankingSesion: 'asamblea/kahoot/rankingSesion',
    rankingGlobal: (uid) => `rankingGlobal/${uid}`
  }
}));

// Mock Firebase Auth
jest.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: null }),
  onAuthStateChanged: jest.fn((auth, cb) => cb(null)),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn()
}));

// Mock Firebase Database
jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: jest.fn(),
  set: jest.fn(),
  onValue: jest.fn(),
  onDisconnect: jest.fn(() => ({ remove: jest.fn(), cancel: jest.fn() })),
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
  get: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  push: jest.fn(),
  query: jest.fn(),
  orderByChild: jest.fn(),
  equalTo: jest.fn(),
  limitToFirst: jest.fn(),
  limitToLast: jest.fn()
}));

// Mock Firebase Firestore
jest.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  doc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  getDocs: jest.fn(),
  addDoc: jest.fn(),
  Timestamp: {
    now: () => ({ toMillis: () => Date.now() }),
    fromMillis: (ms) => ({ toMillis: () => ms })
  }
}));

// Mock Firebase App
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({})),
  getApps: () => []
}));

console.log('✅ Jest setup complete');