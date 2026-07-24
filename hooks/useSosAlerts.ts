import { useEffect, useState } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";

import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebaseConfig";

export interface SosAlert {
  uid: string;
  displayName: string;
  latitude: number;
  longitude: number;
  locationAddress?: string;
  destination: string | null;
  message: string;
  createdAt: number;
}

export default function useSosAlerts() {
  const { user } = useAuth();
  const [alert, setAlert] = useState<SosAlert | null>(null);

  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(doc(db, "live_users", user.uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.sosAlert) {
        setAlert(data.sosAlert as SosAlert);
      } else {
        setAlert(null);
      }
    }, () => setAlert(null));

    return () => unsub();
  }, [user]);

  async function dismissAlert() {
    if (!user) return;
    await updateDoc(doc(db, "live_users", user.uid), { sosAlert: null }).catch(() => {});
    setAlert(null);
  }

  return { alert, dismissAlert };
}
