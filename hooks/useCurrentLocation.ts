import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";

export interface coords {
  latitude: number;
  longitude: number;
}

export default function useCurrentLocation() {
  const [location, setLocation] = useState<coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    async function start() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Permission to access location was denied.");
        setLoading(false);
        return;
      }

      const current = await Location.getCurrentPositionAsync({});
      setLocation({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      });
      setLoading(false);

      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10,
          timeInterval: 5000,
        },
        (updated) => {
          setLocation({
            latitude: updated.coords.latitude,
            longitude: updated.coords.longitude,
          });
        }
      );
    }

    start();

    return () => {
      watchRef.current?.remove();
    };
  }, []);

  return { location, error, loading };
}
