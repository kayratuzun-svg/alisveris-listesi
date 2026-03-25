import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Senin kendi Firebase yapılandırman
const firebaseConfig = {
  apiKey: "AIzaSyBth3A5BJsXBtKDhYs2Zs9jG7pzjxU9CU4",
  authDomain: "alisveris-listesi-a5a2c.firebaseapp.com",
  projectId: "alisveris-listesi-a5a2c",
  storageBucket: "alisveris-listesi-a5a2c.firebasestorage.app",
  messagingSenderId: "434064316303",
  appId: "1:434064316303:web:0ab5a91beebd7359615dfa",
  measurementId: "G-1XN2ZFJ6D2"
};

// Firebase'in arka arkaya kendini başlatıp hata vermesini engelliyoruz
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Sadece veritabanını dışarı aktarıyoruz (Analytics iptal edildi)
export const db = getFirestore(app);