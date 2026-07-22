import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebaseConfig";

export type NearbyWalker = {
  uid: string;
  displayName: string;
  email: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  rating: number;
  totalRatings: number;
};

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function useNearbyWalkers(
  userLat?: number,
  userLon?: number,
  radiusKm = 10
) {
  const { user } = useAuth();
  const [walkers, setWalkers] = useState<NearbyWalker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || userLat == null || userLon == null) {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(
      collection(db, "live_users"),
      (snap) => {
        const results: NearbyWalker[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data.uid === user!.uid) return;
          if (data.onJourney) return;
          if (!data.isOnline) return;
          if (data.lastUpdate && Date.now() - data.lastUpdate > 300000) return;

          const dist = haversine(userLat, userLon, data.latitude, data.longitude);
          if (dist <= radiusKm) {
            results.push({
              uid: data.uid,
              displayName: data.displayName,
              email: data.email,
              latitude: data.latitude,
              longitude: data.longitude,
              distanceKm: Math.round(dist * 10) / 10,
              rating: data.rating ?? 5.0,
              totalRatings: data.totalRatings ?? 0,
            });
          }
        });

        results.sort((a, b) => a.distanceKm - b.distanceKm);
        setWalkers(results);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [user, userLat, userLon, radiusKm]);

  return { walkers, loading };
}
