module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  env: {
    browser: true,
    es2022: true,
    module: true
  },
  globals: {
    // Firebase v10 modular SDK globals
    initializeApp: 'readonly',
    getAuth: 'readonly',
    onAuthStateChanged: 'readonly',
    signInWithEmailAndPassword: 'readonly',
    createUserWithEmailAndPassword: 'readonly',
    signOut: 'readonly',
    getFirestore: 'readonly',
    collection: 'readonly',
    getCountFromServer: 'readonly',
    doc: 'readonly',
    setDoc: 'readonly',
    getDoc: 'readonly',
    updateDoc: 'readonly',
    deleteDoc: 'readonly',
    getDocs: 'readonly',
    query: 'readonly',
    where: 'readonly',
    orderBy: 'readonly',
    limit: 'readonly',
    startAfter: 'readonly',
    endBefore: 'readonly',
    serverTimestamp: 'readonly',
    // Firebase Database
    getDatabase: 'readonly',
    ref: 'readonly',
    set: 'readonly',
    onValue: 'readonly',
    onDisconnect: 'readonly',
    serverTimestamp: 'readonly',
    get: 'readonly',
    update: 'readonly',
    remove: 'readonly',
    push: 'readonly',
    // DOM and globals
    document: 'readonly',
    window: 'readonly',
    localStorage: 'readonly',
    console: 'readonly',
    setTimeout: 'readonly',
    setInterval: 'readonly',
    clearTimeout: 'readonly',
    clearInterval: 'readonly',
    requestAnimationFrame: 'readonly',
    cancelAnimationFrame: 'readonly',
    customElements: 'readonly',
    HTMLElement: 'readonly',
    HTMLButtonElement: 'readonly',
    HTMLDivElement: 'readonly',
    HTMLSpanElement: 'readonly',
    HTMLInputElement: 'readonly',
    Image: 'readonly',
    // Chart.js
    Chart: 'readonly',
    // html2canvas
    html2canvas: 'readonly',
    // Browser APIs
    btoa: 'readonly',
    atob: 'readonly',
    confirm: 'readonly',
    alert: 'readonly',
    prompt: 'readonly',
    fetch: 'readonly',
    Headers: 'readonly',
    Request: 'readonly',
    Response: 'readonly',
    FormData: 'readonly',
    Blob: 'readonly',
    File: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',
    crypto: 'readonly',
    navigator: 'readonly',
    location: 'readonly',
    history: 'readonly',
    screen: 'readonly',
    performance: 'readonly',
    Intl: 'readonly'
  },
  rules: {
    'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
    'no-console': ['warn', { 'allow': ['warn', 'error'] }],
    'no-undef': 'off',
    semi: ['error', 'always'],
    quotes: ['error', 'single'],
    indent: ['error', 2],
    'max-len': ['warn', { 'code': 120, 'ignoreStrings': true, 'ignoreTemplateLiterals': true }],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    'comma-dangle': ['error', 'never'],
    'no-trailing-spaces': 'error',
    'eol-last': 'error'
  },
  overrides: [
    {
      files: ['**/*.mjs'],
      rules: {
        'no-undef': 'off'
      }
    },
    {
      files: ['**/*.test.js'],
      rules: {
        'no-undef': 'off'
      }
    }
  ],
  ignorePatterns: [
    'node_modules/',
    'migrate-*.mjs',
    'new_script.js',
    'send-birthday-emails.js',
    'proyector_logic.js',
    'test_css.js',
    'audit.mjs'
  ]
};