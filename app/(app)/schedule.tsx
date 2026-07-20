import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

import useCurrentLocation from "@/hooks/useCurrentLocation";
import LocationSearch from "@/components/LocationSearch";

interface Point {
  latitude: number;
  longitude: number;
  address: string;
}

interface Route {
  distance: number;
  duration: number;
  geometry: { latitude: number; longitude: number }[];
}

const ROUTE_COLORS = ["#007AFF", "#FF9500", "#AF52DE"];

function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export default function ScheduleScreen() {
  const { location: currentLocation, error: locationError, loading: locationLoading } =
    useCurrentLocation();

  const [origin, setOrigin] = useState<Point | null>(null);
  const [destination, setDestination] = useState<Point | null>(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: 6.9271,
    longitude: 79.8612,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  const [originText, setOriginText] = useState("");
  const [destText, setDestText] = useState("");
  const originSet = useRef(false);

  const [stage, setStage] = useState<"selecting" | "routes">("selecting");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<number>(0);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError] = useState<string | null>(null);

  useEffect(() => {
    if (currentLocation && !originSet.current) {
      originSet.current = true;
      reverseGeocode(currentLocation.latitude, currentLocation.longitude).then((addr) => {
        setOrigin({
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          address: addr,
        });
        setOriginText(addr.split(",")[0]);
        setMapRegion((prev) => ({
          ...prev,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        }));
      });
    }
  }, [currentLocation]);

  async function reverseGeocode(lat: number, lon: number): Promise<string> {
    try {
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      if (results.length > 0) {
        const r = results[0];
        const parts = [r.name, r.street, r.city, r.region, r.country].filter(Boolean);
        return parts.join(", ");
      }
    } catch {}
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }

  function handleOriginSelect(s: { latitude: number; longitude: number; title: string }) {
    setOrigin({ latitude: s.latitude, longitude: s.longitude, address: s.title });
    setMapRegion((prev) => ({ ...prev, latitude: s.latitude, longitude: s.longitude }));
  }

  function handleDestSelect(s: { latitude: number; longitude: number; title: string }) {
    setDestination({ latitude: s.latitude, longitude: s.longitude, address: s.title });
    setMapRegion((prev) => ({ ...prev, latitude: s.latitude, longitude: s.longitude }));
  }

  async function handleMarkerDrag(lat: number, lon: number) {
    const addr = await reverseGeocode(lat, lon);
    setDestination({ latitude: lat, longitude: lon, address: addr });
    setDestText(addr.split(",")[0]);
  }

  function handleMapPress(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    handleMarkerDrag(latitude, longitude);
  }

  async function fetchRoutes() {
    if (!origin || !destination) return;

    setRoutesLoading(true);
    setRoutesError(null);

    try {
      const coords = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${coords}?alternatives=true&overview=full&geometries=polyline`
      );
      const data = await res.json();

      if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
        setRoutesError("No routes found between these locations.");
        setRoutes([]);
        return;
      }

      const parsed: Route[] = data.routes.map((r: Record<string, unknown>) => ({
        distance: r.distance as number,
        duration: r.duration as number,
        geometry: decodePolyline(r.geometry as string),
      }));

      setRoutes(parsed);
      setSelectedRoute(0);
      setStage("routes");

      if (parsed.length > 0) {
        const allLats = parsed.flatMap((r) => r.geometry.map((p) => p.latitude));
        const allLngs = parsed.flatMap((r) => r.geometry.map((p) => p.longitude));
        const minLat = Math.min(...allLats);
        const maxLat = Math.max(...allLats);
        const minLng = Math.min(...allLngs);
        const maxLng = Math.max(...allLngs);
        setMapRegion({
          latitude: (minLat + maxLat) / 2,
          longitude: (minLng + maxLng) / 2,
          latitudeDelta: (maxLat - minLat) * 0.3 + 0.01,
          longitudeDelta: (maxLng - minLng) * 0.3 + 0.01,
        });
      }
    } catch {
      setRoutesError("Failed to calculate routes. Please try again.");
      setRoutes([]);
    } finally {
      setRoutesLoading(false);
    }
  }

  function handleBack() {
    setStage("selecting");
    setRoutes([]);
    setRoutesError(null);
    if (origin) {
      setMapRegion((prev) => ({
        ...prev,
        latitude: origin.latitude,
        longitude: origin.longitude,
      }));
    }
  }

  if (locationLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Getting your location...</Text>
      </View>
    );
  }

  if (locationError) {
    return (
      <View style={styles.centered}>
        <Ionicons name="location-outline" size={48} color="#999" />
        <Text style={styles.errorText}>{locationError}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchSection}>
        {stage === "routes" && (
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Ionicons name="arrow-back" size={20} color="#007AFF" />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        )}
        <LocationSearch
          label="Starting from"
          icon="radio-button-on"
          iconColor="#34C759"
          value={originText}
          onChangeText={setOriginText}
          onSelect={handleOriginSelect}
          placeholder="Current location"
        />
        <View style={styles.divider} />
        <LocationSearch
          label="Going to"
          icon="location"
          iconColor="#FF3B30"
          value={destText}
          onChangeText={setDestText}
          onSelect={handleDestSelect}
          placeholder="Search destination..."
        />
      </View>

      <View style={styles.mapSection}>
        <MapView
          style={styles.map}
          region={mapRegion}
          onRegionChangeComplete={setMapRegion}
          onPress={stage === "selecting" ? handleMapPress : undefined}
        >
          {origin && (
            <Marker
              coordinate={{ latitude: origin.latitude, longitude: origin.longitude }}
              title="Start"
              description={origin.address}
              pinColor="#34C759"
            />
          )}
          {destination && (
            <Marker
              coordinate={{ latitude: destination.latitude, longitude: destination.longitude }}
              title="Destination"
              description={destination.address}
              pinColor="#FF3B30"
              draggable={stage === "selecting"}
              onDragEnd={
                stage === "selecting"
                  ? (e) =>
                      handleMarkerDrag(
                        e.nativeEvent.coordinate.latitude,
                        e.nativeEvent.coordinate.longitude
                      )
                  : undefined
              }
            />
          )}
          {stage === "routes" &&
            routes.map((route, i) => (
              <Polyline
                key={i}
                coordinates={route.geometry}
                strokeColor={i === selectedRoute ? ROUTE_COLORS[i] : "#C7C7CC"}
                strokeWidth={i === selectedRoute ? 5 : 3}
              />
            ))}
        </MapView>

        {stage === "selecting" && !destination && (
          <View style={styles.mapHint}>
            <Ionicons name="finger-print-outline" size={16} color="#666" />
            <Text style={styles.mapHintText}>Tap the map or search to set destination</Text>
          </View>
        )}
      </View>

      <View style={styles.infoSection}>
        <View style={styles.locationCard}>
          <View style={[styles.dot, { backgroundColor: "#34C759" }]} />
          <Text style={styles.locationText} numberOfLines={1}>
            {origin?.address ?? "Current location"}
          </Text>
        </View>
        <View style={styles.locationCard}>
          <View style={[styles.dot, { backgroundColor: "#FF3B30" }]} />
          <Text
            style={[styles.locationText, !destination && { color: "#bbb" }]}
            numberOfLines={1}
          >
            {destination?.address ?? "Select destination"}
          </Text>
        </View>
      </View>

      {stage === "selecting" && (
        <TouchableOpacity
          style={[styles.continueBtn, !destination && styles.continueBtnDisabled]}
          disabled={!destination || routesLoading}
          onPress={fetchRoutes}
        >
          {routesLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text
                style={[
                  styles.continueBtnText,
                  !destination && styles.continueBtnTextDisabled,
                ]}
              >
                Find Routes
              </Text>
              <Ionicons
                name="arrow-forward"
                size={18}
                color={!destination ? "#bbb" : "#fff"}
              />
            </>
          )}
        </TouchableOpacity>
      )}

      {stage === "routes" && (
        <>
          {routesError ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color="#FF3B30" />
              <Text style={styles.errorBannerText}>{routesError}</Text>
            </View>
          ) : (
            <View style={styles.routesSection}>
              <Text style={styles.routesTitle}>
                {routes.length} {routes.length === 1 ? "route" : "routes"} found
              </Text>
              <FlatList
                data={routes.slice(0, 3)}
                keyExtractor={(_, i) => String(i)}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.routesList}
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    style={[
                      styles.routeCard,
                      index === selectedRoute && styles.routeCardSelected,
                    ]}
                    onPress={() => setSelectedRoute(index)}
                  >
                    <View style={styles.routeCardHeader}>
                      <View
                        style={[
                          styles.routeColorDot,
                          { backgroundColor: ROUTE_COLORS[index] },
                        ]}
                      />
                      <Text style={styles.routeLabel}>
                        {index === 0 ? "Fastest" : index === 1 ? "Alternative" : "Option 3"}
                      </Text>
                      {index === selectedRoute && (
                        <Ionicons name="checkmark-circle" size={18} color={ROUTE_COLORS[index]} />
                      )}
                    </View>
                    <Text style={styles.routeDistance}>{formatDistance(item.distance)}</Text>
                    <Text style={styles.routeDuration}>{formatDuration(item.duration)}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={() => {
              // TODO: next step of schedule
            }}
          >
            <Text style={styles.confirmBtnText}>Confirm Route</Text>
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 24,
  },
  searchSection: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
    backgroundColor: "#fff",
    zIndex: 2,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 4,
  },
  backBtnText: { fontSize: 15, color: "#007AFF", fontWeight: "500" },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E5EA",
    marginVertical: 10,
    marginLeft: 28,
  },
  mapSection: { flex: 1, marginHorizontal: 20, borderRadius: 16, overflow: "hidden" },
  map: { width: "100%", height: "100%" },
  mapHint: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  mapHintText: { fontSize: 13, color: "#666", marginLeft: 8 },
  infoSection: { paddingHorizontal: 20, paddingVertical: 14, gap: 8 },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  locationText: { fontSize: 14, flex: 1, color: "#000" },
  continueBtn: {
    marginHorizontal: 20,
    marginBottom: 34,
    backgroundColor: "#007AFF",
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  continueBtnDisabled: { backgroundColor: "#F2F2F7" },
  continueBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  continueBtnTextDisabled: { color: "#bbb" },
  routesSection: { paddingBottom: 8 },
  routesTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  routesList: { paddingHorizontal: 16, gap: 10 },
  routeCard: {
    width: 180,
    backgroundColor: "#F2F2F7",
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  routeCardSelected: {
    backgroundColor: "#F0F7FF",
    borderColor: "#007AFF",
  },
  routeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 6,
  },
  routeColorDot: { width: 10, height: 10, borderRadius: 5 },
  routeLabel: { fontSize: 12, fontWeight: "600", color: "#444", flex: 1 },
  routeDistance: { fontSize: 18, fontWeight: "700", color: "#000" },
  routeDuration: { fontSize: 14, color: "#666", marginTop: 2 },
  confirmBtn: {
    marginHorizontal: 20,
    marginBottom: 34,
    backgroundColor: "#34C759",
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  confirmBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: "#FFF0F0",
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  errorBannerText: { fontSize: 14, color: "#FF3B30", flex: 1 },
  loadingText: { fontSize: 16, color: "#666", marginTop: 12 },
  errorText: { fontSize: 16, color: "#666", textAlign: "center", marginTop: 12 },
});
