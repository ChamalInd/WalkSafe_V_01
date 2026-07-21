import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import useLiveUsers from "@/hooks/useLiveUsers";
import useNearbyWalkers from "@/hooks/useNearbyWalkers";
import { db } from "@/firebaseConfig";

const LEVEL_COLORS: Record<string, string> = { medium: "#FF9500", high: "#FF3B30", risky: "#AF52DE" };
const LEVEL_LABELS: Record<string, string> = { medium: "Medium", high: "High", risky: "Risky" };

interface DangerZone {
  id: string;
  latitude: number;
  longitude: number;
  level: string;
  reports: number;
}

export default function HomeScreen() {
  const { profile, user } = useAuth();
  const { colors } = useTheme();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);
  const { onlineCount } = useLiveUsers();
  const { walkers: nearbyWalkers } = useNearbyWalkers(
    location?.coords.latitude,
    location?.coords.longitude
  );
  const [dangerZones, setDangerZones] = useState<DangerZone[]>([]);

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

  useEffect(() => {
    if (!location) return;
    const lat = location.coords.latitude;
    const lon = location.coords.longitude;
    const latMin = lat - 0.05;
    const latMax = lat + 0.05;
    const lonMin = lon - 0.05;
    const lonMax = lon + 0.05;

    const q = query(
      collection(db, "danger_zones"),
      where("latitude", ">=", latMin),
      where("latitude", "<=", latMax),
    );

    const unsub = onSnapshot(q, (snap) => {
      const zones = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as DangerZone))
        .filter((z) => z.longitude >= lonMin && z.longitude <= lonMax);
      setDangerZones(zones);
    }, () => {});

    return () => unsub();
  }, [location]);

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
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  };

  const highCount = dangerZones.filter((z) => z.level === "high" || z.level === "risky").length;
  const mediumCount = dangerZones.filter((z) => z.level === "medium").length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.mapContainer}>
        <MapView ref={mapRef} style={styles.map} initialRegion={region} showsUserLocation>
          {nearbyWalkers.map((w) => (
            <Marker
              key={w.uid}
              coordinate={{ latitude: w.latitude, longitude: w.longitude }}
              title={w.displayName}
              description={`${w.distanceKm} km away`}
              pinColor={colors.primary}
            />
          ))}
          {dangerZones.map((zone) => (
            <Circle
              key={zone.id}
              center={{ latitude: zone.latitude, longitude: zone.longitude }}
              radius={100}
              fillColor={(LEVEL_COLORS[zone.level] ?? "#FF9500") + "33"}
              strokeColor={LEVEL_COLORS[zone.level] ?? "#FF9500"}
              strokeWidth={2}
            />
          ))}
        </MapView>

        <View style={styles.greetingOverlay}>
          <Text style={[styles.greeting, { color: "#fff" }]}>
            Hi {profile?.displayName?.split(" ")[0] ?? user?.email?.split("@")[0]}
          </Text>
          <Text style={[styles.greetingSub, { color: "rgba(255,255,255,0.85)" }]}>Stay safe out there</Text>
        </View>

        {dangerZones.length > 0 && (
          <View style={[styles.legendCard, { backgroundColor: colors.cardBg + "EE" }]}>
            <View style={styles.legendHeader}>
              <Ionicons name="warning" size={14} color={colors.warning} />
              <Text style={[styles.legendTitle, { color: colors.text }]}>Danger Zones</Text>
              <View style={[styles.legendCountBadge, { backgroundColor: colors.danger }]}>
                <Text style={styles.legendCountText}>{dangerZones.length}</Text>
              </View>
            </View>
            {highCount > 0 && (
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: LEVEL_COLORS.high }]} />
                <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>High / Risky</Text>
                <Text style={[styles.legendNum, { color: colors.text }]}>{highCount}</Text>
              </View>
            )}
            {mediumCount > 0 && (
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: LEVEL_COLORS.medium }]} />
                <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>Medium</Text>
                <Text style={[styles.legendNum, { color: colors.text }]}>{mediumCount}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.cardBg }]}>
          <Ionicons name="people" size={22} color={colors.primary} />
          <Text style={[styles.statNumber, { color: colors.text }]}>{onlineCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Online</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.cardBg }]}>
          <Ionicons name="warning" size={22} color={colors.danger} />
          <Text style={[styles.statNumber, { color: colors.text }]}>{dangerZones.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Danger Zones</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  mapContainer: { flex: 1, position: "relative" },
  map: { width: "100%", height: "100%" },
  greetingOverlay: { position: "absolute", top: 56, left: 16, right: 16 },
  greeting: { fontSize: 22, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.3)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  greetingSub: { fontSize: 14, marginTop: 2, textShadowColor: "rgba(0,0,0,0.3)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  legendCard: { position: "absolute", top: 56, right: 12, borderRadius: 14, padding: 14, minWidth: 150 },
  legendHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  legendTitle: { fontSize: 13, fontWeight: "700", flex: 1 },
  legendCountBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  legendCountText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 12, flex: 1 },
  legendNum: { fontSize: 12, fontWeight: "600" },
  statsRow: { flexDirection: "row", paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8, gap: 10 },
  statCard: { borderRadius: 14, padding: 14, alignItems: "center", flex: 1 },
  statNumber: { fontSize: 22, fontWeight: "700", marginTop: 6 },
  statLabel: { fontSize: 12, marginTop: 2 },
  errorText: { fontSize: 16, textAlign: "center", marginTop: 12 },
  loadingText: { fontSize: 16, marginTop: 12 },
});
