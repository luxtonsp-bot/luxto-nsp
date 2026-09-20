export default [
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        // Firebase v10 modular SDK globals
        initializeApp: 'readonly',
        getAuth: 'readonly',
        onAuthStateChanged: 'readonly',
        signInWithEmailAndPassword: 'readonly',
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
        // DOM and globals
        document: 'readonly',
        window: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error'
    }
  }
];