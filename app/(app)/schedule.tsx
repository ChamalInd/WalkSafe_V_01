import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

import useCurrentLocation from "@/hooks/useCurrentLocation";
import LocationSearch from "@/components/LocationSearch";

interface Point {
  latitude: number;
  longitude: number;
  address: string;
}

export default function ScheduleScreen() {
  const { location: currentLocation, error: locationError, loading: locationLoading } = useCurrentLocation();

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

  useEffect(() => {
    if (currentLocation && !originSet.current) {
      originSet.current = true;
      reverseGeocode(currentLocation.latitude, currentLocation.longitude).then(
        (addr) => {
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
        }
      );
    }
  }, [currentLocation]);

  async function reverseGeocode(lat: number, lon: number): Promise<string> {
    try {
      const results = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lon,
      });
      if (results.length > 0) {
        const r = results[0];
        const parts = [r.name, r.street, r.city, r.region, r.country].filter(
          Boolean
        );
        return parts.join(", ");
      }
    } catch {}
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }

  function handleOriginSelect(s: {
    latitude: number;
    longitude: number;
    title: string;
  }) {
    const point: Point = {
      latitude: s.latitude,
      longitude: s.longitude,
      address: s.title,
    };
    setOrigin(point);
    setMapRegion((prev) => ({
      ...prev,
      latitude: s.latitude,
      longitude: s.longitude,
    }));
  }

  function handleDestSelect(s: {
    latitude: number;
    longitude: number;
    title: string;
  }) {
    const point: Point = {
      latitude: s.latitude,
      longitude: s.longitude,
      address: s.title,
    };
    setDestination(point);
    setMapRegion((prev) => ({
      ...prev,
      latitude: s.latitude,
      longitude: s.longitude,
    }));
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
          onPress={handleMapPress}
        >
          {origin && (
            <Marker
              coordinate={{
                latitude: origin.latitude,
                longitude: origin.longitude,
              }}
              title="Start"
              description={origin.address}
              pinColor="#34C759"
            />
          )}
          {destination && (
            <Marker
              coordinate={{
                latitude: destination.latitude,
                longitude: destination.longitude,
              }}
              title="Destination"
              description={destination.address}
              pinColor="#FF3B30"
              draggable
              onDragEnd={(e) =>
                handleMarkerDrag(
                  e.nativeEvent.coordinate.latitude,
                  e.nativeEvent.coordinate.longitude
                )
              }
            />
          )}
        </MapView>

        {!destination && (
          <View style={styles.mapHint}>
            <Ionicons name="finger-print-outline" size={16} color="#666" />
            <Text style={styles.mapHintText}>
              Tap the map or search to set destination
            </Text>
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
            style={[
              styles.locationText,
              !destination && { color: "#bbb" },
            ]}
            numberOfLines={1}
          >
            {destination?.address ?? "Select destination"}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.continueBtn, !destination && styles.continueBtnDisabled]}
        disabled={!destination}
      >
        <Text
          style={[
            styles.continueBtnText,
            !destination && styles.continueBtnTextDisabled,
          ]}
        >
          Continue
        </Text>
        <Ionicons
          name="arrow-forward"
          size={18}
          color={!destination ? "#bbb" : "#fff"}
        />
      </TouchableOpacity>
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
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E5EA",
    marginVertical: 10,
    marginLeft: 28,
  },
  mapSection: {
    flex: 1,
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: "hidden",
  },
  map: {
    width: "100%",
    height: "100%",
  },
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
  mapHintText: {
    fontSize: 13,
    color: "#666",
    marginLeft: 8,
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 8,
  },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  locationText: {
    fontSize: 14,
    flex: 1,
    color: "#000",
  },
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
  continueBtnDisabled: {
    backgroundColor: "#F2F2F7",
  },
  continueBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  continueBtnTextDisabled: {
    color: "#bbb",
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
    marginTop: 12,
  },
  errorText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginTop: 12,
  },
});
