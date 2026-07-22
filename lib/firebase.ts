import { initializeApp, getApps, getApp } from "firebase/app";
// @ts-ignore
import { initializeAuth, getReactNativePersistence, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyDrqW_zogLwI8khBjUvZ6HPr6sUzLXnwsA",
  authDomain: "equaris-a2e02.firebaseapp.com",
  projectId: "equaris-a2e02",
  storageBucket: "equaris-a2e02.firebasestorage.app",
  messagingSenderId: "187252919751",
  appId: "1:187252919751:web:acb9ff085239ba3345dde2",
  measurementId: "G-1Y58ZDTWR2",
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app);

// @ts-ignore
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export async function logoutUser() {
  await signOut(auth);
}
