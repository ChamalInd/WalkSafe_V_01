import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebaseConfig";

export type IncomingRequest = {
  id: string;
  requesterUid: string;
  requesterName: string;
  partnerUid: string;
  partnerName: string;
  status: string;
  createdAt: number;
};

export default function useIncomingRequest() {
  const { user } = useAuth();
  const [request, setRequest] = useState<IncomingRequest | null>(null);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "journey_requests"),
      where("partnerUid", "==", user.uid),
      where("status", "==", "pending")
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setRequest(null);
        return;
      }
      const doc = snap.docs[0];
      setRequest({
        id: doc.id,
        ...doc.data(),
      } as IncomingRequest);
    }, () => setRequest(null));

    return () => unsub();
  }, [user]);

  return request;
}
