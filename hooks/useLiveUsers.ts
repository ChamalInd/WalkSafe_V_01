import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function track() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;

      const loc = await Location.getCurrentPositionAsync({});
      if (cancelled) return;

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
        rating: ratingRef.current.rating,
        totalRatings: ratingRef.current.totalRatings,
        lastUpdate: Date.now(),
      });

      lastWriteRef.current = { lat: loc.coords.latitude, lon: loc.coords.longitude, time: Date.now() };

      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
        async (updated) => {
          if (cancelled) return;
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
              rating: ratingRef.current.rating,
              totalRatings: ratingRef.current.totalRatings,
              lastUpdate: Date.now(),
            });
          }
        }
      );
    }

    track();

    return () => {
      cancelled = true;
      watchRef.current?.remove();
      if (user) deleteDoc(doc(db, "live_users", user.uid)).catch(() => {});
    };
  }, [user]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "live_users"), (snap) => {
      setOnlineCount(snap.size);
    }, () => {});

    return () => unsub();
  }, []);

  return { onlineCount };
}
