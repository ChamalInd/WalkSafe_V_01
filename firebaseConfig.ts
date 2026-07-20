import { getApp, getApps, initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

// 1. Go to https://console.firebase.google.com
// 2. Create a project (or use an existing one)
// 3. Project settings (gear icon) -> General -> "Your apps" -> Add a Web app
// 4. Copy the values Firebase gives you into the object below
const firebaseConfig = {
  apiKey: "AIzaSyB9CR_nRVaWCq97xnGcF6JQen53r5jOYS8",
  authDomain: "walksafe-a41b3.firebaseapp.com",
  projectId: "walksafe-a41b3",
  storageBucket: "walksafe-a41b3.firebasestorage.app",
  messagingSenderId: "326854952183",
  appId: "1:326854952183:web:9ed98a05be8ff3d6df3ff2",
};

// Prevents "Firebase app already initialized" error with fast refresh
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// initializeAuth with AsyncStorage persistence so the user stays logged in
// between app restarts on iOS/Android. Must only be called once.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);

export default app;
