import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Значення підставляються з .env (див. .env.example) під час білду Vite.
// Це той самий Firebase-проєкт, що й у мобільному додатку euroclub-app —
// панель лише читає/пише в ті самі колекції, окремого проєкту не створюємо.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
