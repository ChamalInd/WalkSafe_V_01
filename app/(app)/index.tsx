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
import { useTheme } from "@/contexts/ThemeContext";

const ONLINE_USERS = 12;
const DANGER_ZONES = 5;

export default function HomeScreen() {
  const { profile, user } = useAuth();
  const { colors } = useTheme();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
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
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
        (updated) => setLocation(updated)
      );
    }

    startLocationTracking();
    return () => { subscription?.remove(); };
  }, []);

  if (errorMsg) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="location-outline" size={48} color={colors.textTertiary} />
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>{errorMsg}</Text>
      </View>
    );
  }

  if (!location) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Getting your location...</Text>
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.greeting, { color: colors.text }]}>
          Hi {profile?.displayName ?? user?.email}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Stay safe out there</Text>
      </View>

      <View style={styles.mapContainer}>
        <MapView ref={mapRef} style={styles.map} initialRegion={region}>
          <Marker
            coordinate={{ latitude: location.coords.latitude, longitude: location.coords.longitude }}
            title="You are here"
          />
        </MapView>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.cardBg }]}>
          <Ionicons name="people" size={28} color={colors.primary} />
          <Text style={[styles.statNumber, { color: colors.text }]}>{ONLINE_USERS}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Users Online</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.cardBg }]}>
          <Ionicons name="warning" size={28} color={colors.danger} />
          <Text style={[styles.statNumber, { color: colors.text }]}>{DANGER_ZONES}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Danger Zones</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
  greeting: { fontSize: 24, fontWeight: "700" },
  subtitle: { fontSize: 15, marginTop: 2 },
  mapContainer: { marginHorizontal: 20, borderRadius: 16, overflow: "hidden", height: 300, marginTop: 8 },
  map: { width: "100%", height: "100%" },
  statsRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, marginTop: 20 },
  statCard: { borderRadius: 16, padding: 20, alignItems: "center", flex: 1, marginHorizontal: 6 },
  statNumber: { fontSize: 28, fontWeight: "700", marginTop: 8 },
  statLabel: { fontSize: 13, marginTop: 4 },
  errorText: { fontSize: 16, textAlign: "center", marginTop: 12 },
  loadingText: { fontSize: 16, marginTop: 12 },
});
