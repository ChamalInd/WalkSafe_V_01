import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/firebaseConfig";

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber?: string;
  createdAt?: unknown;
};

export type ApprovalStatus = "pending" | "approved" | "rejected" | null;

type AuthContextType = {
  user: User | null;
  profile: UserProfile | null;
  initializing: boolean;
  approvalStatus: ApprovalStatus;
  signUp: (email: string, password: string, displayName: string, phoneNumber: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));
        setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      } else {
        setProfile(null);
      }

      setInitializing(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setApprovalStatus(null);
      return;
    }

    const unsub = onSnapshot(
      doc(db, "approval_requests", user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setApprovalStatus(data.status ?? "pending");
        } else {
          setApprovalStatus("pending");
        }
      },
      () => {
        setApprovalStatus("pending");
      }
    );

    return () => unsub();
  }, [user?.uid]);

  const signUp = async (email: string, password: string, displayName: string, phoneNumber: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);

    await updateProfile(credential.user, { displayName });

    const newProfile: UserProfile = {
      uid: credential.user.uid,
      email,
      displayName,
      phoneNumber,
      createdAt: serverTimestamp(),
    };

    await setDoc(doc(db, "users", credential.user.uid), {
      ...newProfile,
      rating: 5.0,
      totalRatings: 0,
    });

    await setDoc(doc(db, "approval_requests", credential.user.uid), {
      uid: credential.user.uid,
      displayName,
      email,
      phoneNumber,
      status: "pending",
      createdAt: serverTimestamp(),
    });

    setProfile(newProfile);
  };

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    if (user) {
      await deleteDoc(doc(db, "live_users", user.uid)).catch(() => {});
    }
    await firebaseSignOut(auth);
  };

  const value = useMemo(
    () => ({ user, profile, initializing, approvalStatus, signUp, signIn, signOut }),
    [user, profile, initializing, approvalStatus]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
