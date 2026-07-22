import { useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import * as Location from "expo-location";
import { collection, doc, onSnapshot, setDoc, deleteDoc, getDoc } from "firebase/firestore";

import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebaseConfig";

export default function useLiveUsers() {
  const { user } = useAuth();
  const [onlineCount, setOnlineCount] = useState(0);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastWriteRef = useRef({ lat: 0, lon: 0, time: 0 });
  const ratingRef = useRef({ rating: 5.0, totalRatings: 0 });
  const appStateRef = useRef(AppState.currentState);
  const isTrackingRef = useRef(false);

  async function goOnline() {
    if (!user || isTrackingRef.current) return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const loc = await Location.getCurrentPositionAsync({});

      const userDoc = await getDoc(doc(db, "users", user!.uid));
      const userData = userDoc.data();
      ratingRef.current = { rating: userData?.rating ?? 5.0, totalRatings: userData?.totalRatings ?? 0 };

      await setDoc(doc(db, "live_users", user!.uid), {
        uid: user!.uid,
        displayName: user!.displayName ?? user!.email ?? "Unknown",
        email: user!.email ?? "",
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        onJourney: false,
        isOnline: true,
        rating: ratingRef.current.rating,
        totalRatings: ratingRef.current.totalRatings,
        lastUpdate: Date.now(),
      });

      lastWriteRef.current = { lat: loc.coords.latitude, lon: loc.coords.longitude, time: Date.now() };
      isTrackingRef.current = true;

      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
        async (updated) => {
          const { latitude, longitude } = updated.coords;
          const prev = lastWriteRef.current;
          const dist = Math.sqrt(Math.pow(latitude - prev.lat, 2) + Math.pow(longitude - prev.lon, 2));
          const elapsed = Date.now() - prev.time;
          if (dist > 0.0001 || elapsed > 10000) {
            lastWriteRef.current = { lat: latitude, lon: longitude, time: Date.now() };
            await setDoc(doc(db, "live_users", user!.uid), {
              uid: user!.uid,
              displayName: user!.displayName ?? user!.email ?? "Unknown",
              email: user!.email ?? "",
              latitude,
              longitude,
              onJourney: false,
              isOnline: true,
              rating: ratingRef.current.rating,
              totalRatings: ratingRef.current.totalRatings,
              lastUpdate: Date.now(),
            });
          }
        }
      );
    } catch {}
  }

  async function goOffline() {
    watchRef.current?.remove();
    watchRef.current = null;
    isTrackingRef.current = false;
    if (user) {
      await deleteDoc(doc(db, "live_users", user.uid)).catch(() => {});
    }
  }

  useEffect(() => {
    if (!user) return;

    goOnline();

    const handleAppState = (next: AppStateStatus) => {
      if (appStateRef.current.match(/active/) && next.match(/inactive|background/)) {
        goOffline();
      } else if (appStateRef.current.match(/inactive|background/) && next === "active") {
        goOnline();
      }
      appStateRef.current = next;
    };

    const sub = AppState.addEventListener("change", handleAppState);

    return () => {
      sub.remove();
      goOffline();
    };
  }, [user]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "live_users"), (snap) => {
      let count = 0;
      snap.forEach((d) => {
        const data = d.data();
        if (data.isOnline && data.lastUpdate && Date.now() - data.lastUpdate < 300000) {
          count++;
        }
      });
      setOnlineCount(count);
    }, () => {});

    return () => unsub();
  }, []);

  return { onlineCount };
}
