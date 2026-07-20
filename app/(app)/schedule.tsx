import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
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

interface Walker {
  id: string;
  name: string;
  rating: number;
  trips: number;
}

const ROUTE_COLORS = ["#007AFF", "#FF9500", "#AF52DE"];

const WALKERS: Walker[] = [
  { id: "1", name: "Kamal Perera", rating: 4.8, trips: 124 },
  { id: "2", name: "Nadeesha Silva", rating: 4.6, trips: 89 },
  { id: "3", name: "Amila Fernando", rating: 4.9, trips: 201 },
  { id: "4", name: "Dilini Rajapaksa", rating: 4.5, trips: 67 },
  { id: "5", name: "Tharaka Bandara", rating: 4.7, trips: 153 },
  { id: "6", name: "Hashini Liyana", rating: 4.4, trips: 42 },
  { id: "7", name: "Chamod Weerasinghe", rating: 4.8, trips: 178 },
  { id: "8", name: "Saduni Karunaratne", rating: 4.3, trips: 31 },
];

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

function getDistance(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

type Stage = "selecting" | "routes" | "walkers" | "confirmation" | "navigating" | "feedback";

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

  const [stage, setStage] = useState<Stage>("selecting");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError] = useState<string | null>(null);

  const [selectedWalker, setSelectedWalker] = useState<Walker | null>(null);
  const [userConfirmed, setUserConfirmed] = useState(false);
  const [partnerConfirmed, setPartnerConfirmed] = useState(false);

  const [remainingDistance, setRemainingDistance] = useState(0);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (currentLocation && !originSet.current) {
      originSet.current = true;
      reverseGeocode(currentLocation.latitude, currentLocation.longitude).then((addr) => {
        setOrigin({ latitude: currentLocation.latitude, longitude: currentLocation.longitude, address: addr });
        setOriginText(addr.split(",")[0]);
        setMapRegion((prev) => ({ ...prev, latitude: currentLocation.latitude, longitude: currentLocation.longitude }));
      });
    }
  }, [currentLocation]);

  const checkArrival = useCallback(() => {
    if (stage !== "navigating" || !currentLocation || !destination) return;
    const dist = getDistance(currentLocation, destination);
    setRemainingDistance(dist);
    if (dist < 50) {
      setStage("feedback");
    }
  }, [stage, currentLocation, destination]);

  useEffect(() => {
    checkArrival();
  }, [currentLocation, checkArrival]);

  useEffect(() => {
    if (stage === "confirmation" && userConfirmed && !partnerConfirmed) {
      const timer = setTimeout(() => setPartnerConfirmed(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [stage, userConfirmed, partnerConfirmed]);

  useEffect(() => {
    if (stage === "confirmation" && userConfirmed && partnerConfirmed) {
      const timer = setTimeout(() => {
        setStage("navigating");
        if (currentLocation) {
          setMapRegion((prev) => ({ ...prev, latitude: currentLocation.latitude, longitude: currentLocation.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 }));
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [stage, userConfirmed, partnerConfirmed, currentLocation]);

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
        setMapRegion({ latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2, latitudeDelta: (maxLat - minLat) * 0.3 + 0.01, longitudeDelta: (maxLng - minLng) * 0.3 + 0.01 });
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
    if (origin) setMapRegion((prev) => ({ ...prev, latitude: origin.latitude, longitude: origin.longitude }));
  }

  function handleBackToRoutes() {
    setStage("routes");
    if (origin && destination) {
      const allLats = routes.flatMap((r) => r.geometry.map((p) => p.latitude));
      const allLngs = routes.flatMap((r) => r.geometry.map((p) => p.longitude));
      if (allLats.length > 0) {
        setMapRegion({ latitude: (Math.min(...allLats) + Math.max(...allLats)) / 2, longitude: (Math.min(...allLngs) + Math.max(...allLngs)) / 2, latitudeDelta: (Math.max(...allLats) - Math.min(...allLats)) * 0.3 + 0.01, longitudeDelta: (Math.max(...allLngs) - Math.min(...allLngs)) * 0.3 + 0.01 });
      }
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

  // ─── STAGE: SELECTING / ROUTES ────────────────────────────────────
  if (stage === "selecting" || stage === "routes") {
    return (
      <View style={styles.container}>
        <View style={styles.searchSection}>
          {stage === "routes" && (
            <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
              <Ionicons name="arrow-back" size={20} color="#007AFF" />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          )}
          <LocationSearch label="Starting from" icon="radio-button-on" iconColor="#34C759" value={originText} onChangeText={setOriginText} onSelect={handleOriginSelect} placeholder="Current location" />
          <View style={styles.divider} />
          <LocationSearch label="Going to" icon="location" iconColor="#FF3B30" value={destText} onChangeText={setDestText} onSelect={handleDestSelect} placeholder="Search destination..." />
        </View>

        <View style={styles.mapSection}>
          <MapView ref={mapRef} style={styles.map} region={mapRegion} onRegionChangeComplete={setMapRegion} onPress={stage === "selecting" ? handleMapPress : undefined}>
            {origin && <Marker coordinate={{ latitude: origin.latitude, longitude: origin.longitude }} title="Start" description={origin.address} pinColor="#34C759" />}
            {destination && <Marker coordinate={{ latitude: destination.latitude, longitude: destination.longitude }} title="Destination" description={destination.address} pinColor="#FF3B30" draggable={stage === "selecting"} onDragEnd={stage === "selecting" ? (e) => handleMarkerDrag(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude) : undefined} />}
            {stage === "routes" && routes.map((route, i) => (
              <Polyline key={i} coordinates={route.geometry} strokeColor={i === selectedRoute ? ROUTE_COLORS[i] : "#C7C7CC"} strokeWidth={i === selectedRoute ? 5 : 3} />
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
            <Text style={styles.locationText} numberOfLines={1}>{origin?.address ?? "Current location"}</Text>
          </View>
          <View style={styles.locationCard}>
            <View style={[styles.dot, { backgroundColor: "#FF3B30" }]} />
            <Text style={[styles.locationText, !destination && { color: "#bbb" }]} numberOfLines={1}>{destination?.address ?? "Select destination"}</Text>
          </View>
        </View>

        {stage === "selecting" && (
          <TouchableOpacity style={[styles.continueBtn, !destination && styles.continueBtnDisabled]} disabled={!destination || routesLoading} onPress={fetchRoutes}>
            {routesLoading ? <ActivityIndicator size="small" color="#fff" /> : (
              <>
                <Text style={[styles.continueBtnText, !destination && styles.continueBtnTextDisabled]}>Find Routes</Text>
                <Ionicons name="arrow-forward" size={18} color={!destination ? "#bbb" : "#fff"} />
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
                <Text style={styles.routesTitle}>{routes.length} {routes.length === 1 ? "route" : "routes"} found</Text>
                <FlatList data={routes.slice(0, 3)} keyExtractor={(_, i) => String(i)} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routesList} renderItem={({ item, index }) => (
                  <TouchableOpacity style={[styles.routeCard, index === selectedRoute && styles.routeCardSelected]} onPress={() => setSelectedRoute(index)}>
                    <View style={styles.routeCardHeader}>
                      <View style={[styles.routeColorDot, { backgroundColor: ROUTE_COLORS[index] }]} />
                      <Text style={styles.routeLabel}>{index === 0 ? "Fastest" : index === 1 ? "Alternative" : "Option 3"}</Text>
                      {index === selectedRoute && <Ionicons name="checkmark-circle" size={18} color={ROUTE_COLORS[index]} />}
                    </View>
                    <Text style={styles.routeDistance}>{formatDistance(item.distance)}</Text>
                    <Text style={styles.routeDuration}>{formatDuration(item.duration)}</Text>
                  </TouchableOpacity>
                )} />
              </View>
            )}
            <TouchableOpacity style={styles.confirmBtn} onPress={() => setStage("walkers")}>
              <Text style={styles.confirmBtnText}>Confirm Route</Text>
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  // ─── STAGE: WALKERS ───────────────────────────────────────────────
  if (stage === "walkers") {
    return (
      <View style={styles.container}>
        <View style={styles.searchSection}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBackToRoutes}>
            <Ionicons name="arrow-back" size={20} color="#007AFF" />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.walkersHeader}>
          <Ionicons name="people" size={24} color="#007AFF" />
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.walkersTitle}>Available Walkers</Text>
            <Text style={styles.walkersSubtitle}>{WALKERS.length} walkers online near you</Text>
          </View>
        </View>

        <FlatList data={WALKERS} keyExtractor={(item) => item.id} contentContainerStyle={styles.walkersList} renderItem={({ item }) => (
          <TouchableOpacity style={styles.walkerCard} onPress={() => { setSelectedWalker(item); setStage("confirmation"); setUserConfirmed(false); setPartnerConfirmed(false); }}>
            <View style={styles.walkerAvatar}>
              <Text style={styles.walkerInitial}>{item.name.charAt(0)}</Text>
            </View>
            <View style={styles.walkerInfo}>
              <Text style={styles.walkerName}>{item.name}</Text>
              <View style={styles.walkerMeta}>
                <Ionicons name="star" size={12} color="#FF9500" />
                <Text style={styles.walkerRating}>{item.rating}</Text>
                <Text style={styles.walkerSep}>·</Text>
                <Text style={styles.walkerTrips}>{item.trips} trips</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
          </TouchableOpacity>
        )} />
      </View>
    );
  }

  // ─── STAGE: CONFIRMATION ──────────────────────────────────────────
  if (stage === "confirmation") {
    return (
      <View style={styles.container}>
        <View style={styles.searchSection}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setStage("walkers")}>
            <Ionicons name="arrow-back" size={20} color="#007AFF" />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.confirmCentered}>
          <View style={styles.confirmCard}>
            <Ionicons name="hand-right" size={40} color="#007AFF" />
            <Text style={styles.confirmTitle}>Meet at the Starting Point</Text>
            <Text style={styles.confirmSubtitle}>Both you and {selectedWalker?.name} must confirm arrival at the meeting point before navigation begins.</Text>

            <View style={styles.confirmPeople}>
              <View style={styles.confirmPerson}>
                <View style={[styles.confirmAvatar, userConfirmed && styles.confirmAvatarDone]}>
                  {userConfirmed ? <Ionicons name="checkmark" size={22} color="#fff" /> : <Ionicons name="person" size={22} color="#fff" />}
                </View>
                <Text style={styles.confirmName}>You</Text>
                <Text style={[styles.confirmStatus, userConfirmed && { color: "#34C759" }]}>{userConfirmed ? "Confirmed" : "Waiting..."}</Text>
              </View>

              <View style={styles.confirmLine}>
                <View style={[styles.confirmLineBar, userConfirmed && partnerConfirmed && styles.confirmLineBarDone]} />
              </View>

              <View style={styles.confirmPerson}>
                <View style={[styles.confirmAvatar, partnerConfirmed && styles.confirmAvatarDone]}>
                  {partnerConfirmed ? <Ionicons name="checkmark" size={22} color="#fff" /> : <Ionicons name="person" size={22} color="#fff" />}
                </View>
                <Text style={styles.confirmName}>{selectedWalker?.name?.split(" ")[0]}</Text>
                <Text style={[styles.confirmStatus, partnerConfirmed && { color: "#34C759" }]}>{partnerConfirmed ? "Confirmed" : "Waiting..."}</Text>
              </View>
            </View>

            {!userConfirmed ? (
              <TouchableOpacity style={styles.confirmBtn} onPress={() => setUserConfirmed(true)}>
                <Text style={styles.confirmBtnText}>I&apos;ve Arrived</Text>
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              </TouchableOpacity>
            ) : !partnerConfirmed ? (
              <View style={styles.waitingBanner}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.waitingText}>Waiting for {selectedWalker?.name?.split(" ")[0]}...</Text>
              </View>
            ) : (
              <View style={styles.bothConfirmedBanner}>
                <Ionicons name="checkmark-done-circle" size={22} color="#34C759" />
                <Text style={styles.bothConfirmedText}>Both confirmed! Starting navigation...</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }

  // ─── STAGE: NAVIGATING ────────────────────────────────────────────
  if (stage === "navigating") {
    const activeRoute = routes[selectedRoute];
    return (
      <View style={styles.container}>
        <MapView ref={mapRef} style={styles.navMap} region={{ latitude: currentLocation?.latitude ?? 6.9271, longitude: currentLocation?.longitude ?? 79.8612, latitudeDelta: 0.005, longitudeDelta: 0.005 }} showsUserLocation>
          {activeRoute && <Polyline coordinates={activeRoute.geometry} strokeColor="#007AFF" strokeWidth={5} />}
          {destination && <Marker coordinate={{ latitude: destination.latitude, longitude: destination.longitude }} title="Destination" pinColor="#FF3B30" />}
        </MapView>

        <View style={styles.navOverlay}>
          <View style={styles.navCard}>
            <View style={styles.navCardRow}>
              <View style={styles.navCardItem}>
                <Text style={styles.navCardLabel}>Distance Left</Text>
                <Text style={styles.navCardValue}>{formatDistance(remainingDistance)}</Text>
              </View>
              <View style={styles.navCardDivider} />
              <View style={styles.navCardItem}>
                <Text style={styles.navCardLabel}>Walking With</Text>
                <Text style={styles.navCardValue}>{selectedWalker?.name?.split(" ")[0]}</Text>
              </View>
            </View>
          </View>

          <View style={styles.navInstruction}>
            <Ionicons name="navigate" size={22} color="#007AFF" />
            <Text style={styles.navInstructionText} numberOfLines={2}>
              {remainingDistance > 1000
                ? `Continue for ${formatDistance(remainingDistance)} towards your destination`
                : remainingDistance > 200
                  ? `Almost there — ${formatDistance(remainingDistance)} remaining`
                  : `You're very close! Look for your destination.`}
            </Text>
          </View>

          <View style={styles.navProgress}>
            <View style={styles.navProgressBar}>
              <View style={[styles.navProgressFill, { width: `${Math.min(100, Math.max(0, 100 - (remainingDistance / (activeRoute?.distance ?? 1)) * 100))}%` }]} />
            </View>
            <Text style={styles.navProgressText}>
              {Math.min(100, Math.max(0, Math.round(100 - (remainingDistance / (activeRoute?.distance ?? 1)) * 100)))}% complete
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // ─── STAGE: FEEDBACK ──────────────────────────────────────────────
  if (stage === "feedback") {
    if (feedbackSubmitted) {
      return (
        <View style={styles.container}>
          <View style={styles.feedbackCentered}>
            <Ionicons name="checkmark-done-circle" size={72} color="#34C759" />
            <Text style={styles.feedbackThanks}>Thank You!</Text>
            <Text style={styles.feedbackThanksSub}>Your feedback helps keep the WalkSafe community safe.</Text>
            <TouchableOpacity style={styles.confirmBtn} onPress={() => {
              setStage("selecting");
              setDestination(null);
              setDestText("");
              setRoutes([]);
              setSelectedRoute(0);
              setSelectedWalker(null);
              setUserConfirmed(false);
              setPartnerConfirmed(false);
              setFeedbackRating(0);
              setFeedbackText("");
              setFeedbackSubmitted(false);
              setRemainingDistance(0);
              if (origin) setMapRegion((prev) => ({ ...prev, latitude: origin.latitude, longitude: origin.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }));
            }}>
              <Text style={styles.confirmBtnText}>Plan Another Journey</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <View style={styles.feedbackCentered}>
          <View style={styles.feedbackCard}>
            <Ionicons name="chatbubble-ellipses" size={40} color="#007AFF" />
            <Text style={styles.feedbackTitle}>Journey Complete!</Text>
            <Text style={styles.feedbackSubtitle}>How was your walk with {selectedWalker?.name}?</Text>

            <Text style={styles.feedbackLabel}>Rate this walker</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setFeedbackRating(star)}>
                  <Ionicons name={star <= feedbackRating ? "star" : "star-outline"} size={36} color={star <= feedbackRating ? "#FF9500" : "#C7C7CC"} />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.feedbackLabel}>Comments</Text>
            <TextInput style={styles.feedbackInput} value={feedbackText} onChangeText={setFeedbackText} placeholder="Share your experience..." placeholderTextColor="#bbb" multiline numberOfLines={4} textAlignVertical="top" />

            <TouchableOpacity style={[styles.confirmBtn, feedbackRating === 0 && styles.continueBtnDisabled]} disabled={feedbackRating === 0} onPress={() => setFeedbackSubmitted(true)}>
              <Text style={styles.confirmBtnText}>Submit Feedback</Text>
              <Ionicons name="send-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", paddingHorizontal: 24 },

  // ─── SEARCH ─────────────────
  searchSection: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, backgroundColor: "#fff", zIndex: 2 },
  backBtn: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 4 },
  backBtnText: { fontSize: 15, color: "#007AFF", fontWeight: "500" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#E5E5EA", marginVertical: 10, marginLeft: 28 },

  // ─── MAP ────────────────────
  mapSection: { flex: 1, marginHorizontal: 20, borderRadius: 16, overflow: "hidden" },
  map: { width: "100%", height: "100%" },
  mapHint: { position: "absolute", bottom: 16, left: 16, right: 16, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  mapHintText: { fontSize: 13, color: "#666", marginLeft: 8 },

  // ─── INFO ───────────────────
  infoSection: { paddingHorizontal: 20, paddingVertical: 14, gap: 8 },
  locationCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#F2F2F7", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  locationText: { fontSize: 14, flex: 1, color: "#000" },

  // ─── BUTTONS ────────────────
  continueBtn: { marginHorizontal: 20, marginBottom: 34, backgroundColor: "#007AFF", borderRadius: 12, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  continueBtnDisabled: { backgroundColor: "#F2F2F7" },
  continueBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  continueBtnTextDisabled: { color: "#bbb" },
  confirmBtn: { marginHorizontal: 20, marginBottom: 34, backgroundColor: "#34C759", borderRadius: 12, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  confirmBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  // ─── ROUTES ─────────────────
  routesSection: { paddingBottom: 8 },
  routesTitle: { fontSize: 13, fontWeight: "600", color: "#666", paddingHorizontal: 20, marginBottom: 8 },
  routesList: { paddingHorizontal: 16, gap: 10 },
  routeCard: { width: 180, backgroundColor: "#F2F2F7", borderRadius: 12, padding: 14, borderWidth: 2, borderColor: "transparent" },
  routeCardSelected: { backgroundColor: "#F0F7FF", borderColor: "#007AFF" },
  routeCardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 6 },
  routeColorDot: { width: 10, height: 10, borderRadius: 5 },
  routeLabel: { fontSize: 12, fontWeight: "600", color: "#444", flex: 1 },
  routeDistance: { fontSize: 18, fontWeight: "700", color: "#000" },
  routeDuration: { fontSize: 14, color: "#666", marginTop: 2 },
  errorBanner: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, marginBottom: 12, backgroundColor: "#FFF0F0", borderRadius: 10, padding: 12, gap: 8 },
  errorBannerText: { fontSize: 14, color: "#FF3B30", flex: 1 },

  // ─── WALKERS ────────────────
  walkersHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12 },
  walkersTitle: { fontSize: 20, fontWeight: "700" },
  walkersSubtitle: { fontSize: 13, color: "#888", marginTop: 2 },
  walkersList: { paddingHorizontal: 20, paddingBottom: 20 },
  walkerCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#F2F2F7", borderRadius: 14, padding: 14, marginBottom: 10 },
  walkerAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#007AFF", alignItems: "center", justifyContent: "center" },
  walkerInitial: { color: "#fff", fontSize: 18, fontWeight: "700" },
  walkerInfo: { flex: 1, marginLeft: 12 },
  walkerName: { fontSize: 16, fontWeight: "600" },
  walkerMeta: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 },
  walkerRating: { fontSize: 13, color: "#FF9500", fontWeight: "600" },
  walkerSep: { fontSize: 13, color: "#bbb" },
  walkerTrips: { fontSize: 13, color: "#888" },

  // ─── CONFIRMATION ───────────
  confirmCentered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  confirmCard: { width: "100%", backgroundColor: "#F2F2F7", borderRadius: 20, padding: 28, alignItems: "center" },
  confirmTitle: { fontSize: 22, fontWeight: "700", marginTop: 16, textAlign: "center" },
  confirmSubtitle: { fontSize: 14, color: "#666", textAlign: "center", marginTop: 8, lineHeight: 20 },
  confirmPeople: { flexDirection: "row", alignItems: "center", marginTop: 28, justifyContent: "center" },
  confirmPerson: { alignItems: "center", width: 80 },
  confirmAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#C7C7CC", alignItems: "center", justifyContent: "center" },
  confirmAvatarDone: { backgroundColor: "#34C759" },
  confirmName: { fontSize: 13, fontWeight: "600", marginTop: 8 },
  confirmStatus: { fontSize: 11, color: "#888", marginTop: 2 },
  confirmLine: { width: 40, alignItems: "center", justifyContent: "center" },
  confirmLineBar: { height: 3, width: 30, backgroundColor: "#C7C7CC", borderRadius: 2 },
  confirmLineBarDone: { backgroundColor: "#34C759" },
  waitingBanner: { flexDirection: "row", alignItems: "center", marginTop: 20, gap: 8 },
  waitingText: { fontSize: 14, color: "#007AFF", fontWeight: "500" },
  bothConfirmedBanner: { flexDirection: "row", alignItems: "center", marginTop: 20, gap: 8 },
  bothConfirmedText: { fontSize: 14, color: "#34C759", fontWeight: "600" },

  // ─── NAVIGATION ─────────────
  navMap: { flex: 1 },
  navOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, paddingBottom: 20 },
  navCard: { marginHorizontal: 20, backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  navCardRow: { flexDirection: "row", alignItems: "center" },
  navCardItem: { flex: 1, alignItems: "center" },
  navCardLabel: { fontSize: 12, color: "#888" },
  navCardValue: { fontSize: 20, fontWeight: "700", marginTop: 4 },
  navCardDivider: { width: 1, height: 36, backgroundColor: "#E5E5EA" },
  navInstruction: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, marginTop: 12, backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 12, padding: 14, gap: 10 },
  navInstructionText: { flex: 1, fontSize: 14, color: "#333", lineHeight: 20 },
  navProgress: { marginHorizontal: 20, marginTop: 12 },
  navProgressBar: { height: 6, backgroundColor: "#E5E5EA", borderRadius: 3, overflow: "hidden" },
  navProgressFill: { height: "100%", backgroundColor: "#007AFF", borderRadius: 3 },
  navProgressText: { fontSize: 12, color: "#888", textAlign: "center", marginTop: 6 },

  // ─── FEEDBACK ───────────────
  feedbackCentered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  feedbackCard: { width: "100%", backgroundColor: "#F2F2F7", borderRadius: 20, padding: 28, alignItems: "center" },
  feedbackTitle: { fontSize: 22, fontWeight: "700", marginTop: 16 },
  feedbackSubtitle: { fontSize: 14, color: "#666", textAlign: "center", marginTop: 8 },
  feedbackLabel: { fontSize: 13, fontWeight: "600", color: "#444", alignSelf: "flex-start", marginTop: 20, marginBottom: 8 },
  ratingRow: { flexDirection: "row", gap: 8 },
  feedbackInput: { width: "100%", backgroundColor: "#fff", borderRadius: 12, padding: 14, fontSize: 15, minHeight: 100, borderWidth: 1, borderColor: "#E5E5EA" },
  feedbackThanks: { fontSize: 24, fontWeight: "700", marginTop: 16 },
  feedbackThanksSub: { fontSize: 14, color: "#666", textAlign: "center", marginTop: 8, marginBottom: 24 },

  // ─── COMMON ─────────────────
  loadingText: { fontSize: 16, color: "#666", marginTop: 12 },
  errorText: { fontSize: 16, color: "#666", textAlign: "center", marginTop: 12 },
});
