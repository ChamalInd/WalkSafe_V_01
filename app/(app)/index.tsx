import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/contexts/AuthContext";

const ONLINE_USERS = 12;
const DANGER_ZONES = 5;

export default function HomeScreen() {
  const { profile, user } = useAuth();
  const [location, setLocation] = useState<Location.LocationObject | null>(
    null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    async function startLocationTracking() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg("Permission to access location was denied.");
        return;
      }

      const current = await Location.getCurrentPositionAsync({});
      setLocation(current);

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10,
          timeInterval: 5000,
        },
        (updated) => {
          setLocation(updated);
        }
      );
    }

    startLocationTracking();

    return () => {
      subscription?.remove();
    };
  }, []);

  if (errorMsg) {
    return (
      <View style={styles.centered}>
        <Ionicons name="location-outline" size={48} color="#999" />
        <Text style={styles.errorText}>{errorMsg}</Text>
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Getting your location...</Text>
      </View>
    );
  }

  const region = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>
          Hi {profile?.displayName ?? user?.email}
        </Text>
        <Text style={styles.subtitle}>Stay safe out there</Text>
      </View>

      <View style={styles.mapContainer}>
        <MapView ref={mapRef} style={styles.map} initialRegion={region}>
          <Marker
            coordinate={{
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            }}
            title="You are here"
          />
        </MapView>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="people" size={28} color="#007AFF" />
          <Text style={styles.statNumber}>{ONLINE_USERS}</Text>
          <Text style={styles.statLabel}>Users Online</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="warning" size={28} color="#FF3B30" />
          <Text style={styles.statNumber}>{DANGER_ZONES}</Text>
          <Text style={styles.statLabel}>Danger Zones</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#fff",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
  },
  greeting: {
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    marginTop: 2,
  },
  mapContainer: {
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: "hidden",
    height: 300,
    marginTop: 8,
  },
  map: {
    width: "100%",
    height: "100%",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 20,
  },
  statCard: {
    backgroundColor: "#F2F2F7",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 6,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "700",
    marginTop: 8,
  },
  statLabel: {
    fontSize: 13,
    color: "#666",
    marginTop: 4,
  },
  errorText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginTop: 12,
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
    marginTop: 12,
  },
});
