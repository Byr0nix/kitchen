import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  increment,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { adminEmails, firebaseConfig } from "./firebase-config.js";

const REQUIRED_CONFIG_FIELDS = [
  "apiKey",
  "authDomain",
  "projectId",
  "appId"
];

const DEFAULT_SUBSCRIPTIONS = {
  premiumPrice: 98,
  vipPrice: 148,
  premiumEnabled: true,
  vipEnabled: true
};
const DEFAULT_CLIENT_RATING = 0;

function hasRealValue(value) {
  return Boolean(value) && !String(value).startsWith("YOUR_");
}

export function isFirebaseConfigured() {
  return REQUIRED_CONFIG_FIELDS.every((field) => hasRealValue(firebaseConfig[field]));
}

export function getFirebaseStatusMessage() {
  if (isFirebaseConfigured()) return "";
  return "Firebase не настроен. Заполните `shared/firebase-config.js` данными вашего проекта.";
}

const app = isFirebaseConfigured() ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const googleProvider = app ? new GoogleAuthProvider() : null;

if (auth) {
  auth.languageCode = "ru";
}

if (googleProvider) {
  googleProvider.setCustomParameters({ prompt: "select_account", hl: "ru" });
}

function ensureConfigured() {
  if (!app || !auth || !db || !googleProvider) {
    throw new Error(getFirebaseStatusMessage());
  }
}

export function isAdminEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return adminEmails.some((item) => String(item || "").trim().toLowerCase() === normalized);
}

async function upsertClientFromAuth(user) {
  ensureConfigured();
  const ref = doc(db, "clients", user.uid);
  const existing = await getDoc(ref);
  const payload = {
    email: user.email || "",
    displayName: user.displayName || "Google User",
    photoURL: user.photoURL || "",
    role: existing.exists() ? existing.data().role || "client" : "client",
    subscriptionTier: existing.exists() ? existing.data().subscriptionTier || "NONE" : "NONE",
    ratingPoints: existing.exists() ? Number(existing.data().ratingPoints) || DEFAULT_CLIENT_RATING : DEFAULT_CLIENT_RATING,
    createdAt: existing.exists() ? existing.data().createdAt || serverTimestamp() : serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };
  await setDoc(ref, payload, { merge: true });
}

export async function signInWithGoogle() {
  ensureConfigured();
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await upsertClientFromAuth(result.user);
    return result.user;
  } catch (error) {
    const code = String(error?.code || "");
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    if (code === "auth/popup-closed-by-user") {
      throw new Error("Окно входа закрыто. Попробуйте снова.");
    }
    if (code === "auth/network-request-failed") {
      throw new Error("Проблема с сетью. Проверьте интернет и повторите вход.");
    }
    if (code === "auth/unauthorized-domain") {
      throw new Error(
        "Домен не добавлен в Firebase: Console → Authentication → Settings → Authorized domains (добавьте localhost или ваш сайт)."
      );
    }
    if (code === "auth/account-exists-with-different-credential") {
      throw new Error("Этот email уже привязан к другому способу входа.");
    }
    throw error;
  }
}

export async function signOutCurrentUser() {
  ensureConfigured();
  await signOut(auth);
}

export function getCurrentAuthUser() {
  return auth ? auth.currentUser : null;
}

export function watchCurrentClientProfile(callback) {
  if (!auth || !db) {
    callback({
      authUser: null,
      profile: null,
      isAdmin: false,
      firebaseReady: false,
      error: getFirebaseStatusMessage()
    });
    return () => {};
  }

  let unsubscribeProfile = null;
  let unsubscribeAuth = null;
  let cancelled = false;

  async function afterRedirectThenListen() {
    try {
      const redirectCred = await getRedirectResult(auth);
      if (cancelled) return;
      if (redirectCred?.user) {
        try {
          await upsertClientFromAuth(redirectCred.user);
        } catch (e) {
          console.warn("Firestore после Google redirect:", e);
        }
      }
    } catch {
      // Нет активного redirect или ошибка OAuth — дальше сработает onAuthStateChanged
    }

    if (cancelled) return;

    unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (!user) {
        callback({
          authUser: null,
          profile: null,
          isAdmin: false,
          firebaseReady: true,
          error: ""
        });
        return;
      }

      try {
        await upsertClientFromAuth(user);
        const ref = doc(db, "clients", user.uid);
        unsubscribeProfile = onSnapshot(ref, (snapshot) => {
          const profile = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
          callback({
            authUser: user,
            profile,
            isAdmin: isAdminEmail(user.email) || profile?.role === "admin",
            firebaseReady: true,
            error: ""
          });
        });
      } catch (error) {
        callback({
          authUser: user,
          profile: null,
          isAdmin: isAdminEmail(user.email),
          firebaseReady: true,
          error: error instanceof Error ? error.message : "Не удалось получить профиль."
        });
      }
    });
  }

  afterRedirectThenListen();

  return () => {
    cancelled = true;
    if (unsubscribeProfile) {
      unsubscribeProfile();
      unsubscribeProfile = null;
    }
    if (unsubscribeAuth) {
      unsubscribeAuth();
      unsubscribeAuth = null;
    }
  };
}

export function watchSubscriptionSettings(callback) {
  if (!db) {
    callback({ ...DEFAULT_SUBSCRIPTIONS }, getFirebaseStatusMessage());
    return () => {};
  }

  const ref = doc(db, "appConfig", "subscriptions");
  return onSnapshot(
    ref,
    (snapshot) => {
      callback(
        snapshot.exists() ? { ...DEFAULT_SUBSCRIPTIONS, ...snapshot.data() } : { ...DEFAULT_SUBSCRIPTIONS },
        ""
      );
    },
    (error) => {
      callback({ ...DEFAULT_SUBSCRIPTIONS }, error instanceof Error ? error.message : "Не удалось загрузить тарифы.");
    }
  );
}

export async function saveSubscriptionSettings(data) {
  ensureConfigured();
  await setDoc(doc(db, "appConfig", "subscriptions"), data, { merge: true });
}

export async function createSubscriptionRequest(tier) {
  ensureConfigured();
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Сначала войдите через Google.");
  }

  await upsertClientFromAuth(user);
  const clientRef = doc(db, "clients", user.uid);
  const clientSnapshot = await getDoc(clientRef);
  const profile = clientSnapshot.exists() ? clientSnapshot.data() : {};

  const tierNorm = tier === "VIP" ? "VIP" : "PREMIUM";
  const existingQuery = query(
    collection(db, "subscriptionRequests"),
    where("userId", "==", user.uid),
    where("tier", "==", tierNorm),
    where("status", "==", "pending")
  );
  const existing = await getDocs(existingQuery);
  if (!existing.empty) {
    return { id: existing.docs[0].id, alreadyPending: true };
  }

  const payload = {
    userId: user.uid,
    userEmail: user.email || "",
    userName: user.displayName || "Google User",
    userPhotoURL: user.photoURL || "",
    tier: tierNorm,
    status: "pending",
    clientTier: profile.subscriptionTier || "NONE",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ref = await addDoc(collection(db, "subscriptionRequests"), payload);
  return { id: ref.id, alreadyPending: false };
}

export function watchSubscriptionRequests(callback) {
  if (!db) {
    callback([], getFirebaseStatusMessage());
    return () => {};
  }

  const requestsQuery = query(collection(db, "subscriptionRequests"), orderBy("createdAt", "desc"));
  return onSnapshot(
    requestsQuery,
    (snapshot) => {
      callback(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data()
        })),
        ""
      );
    },
    (error) => {
      callback([], error instanceof Error ? error.message : "Не удалось загрузить заявки.");
    }
  );
}

export function watchPendingSubscriptionRequests(callback) {
  return watchSubscriptionRequests((requests, error) => {
    callback(
      requests.filter((item) => item.status === "pending"),
      error
    );
  });
}

export function watchClients(callback) {
  if (!db) {
    callback([], getFirebaseStatusMessage());
    return () => {};
  }

  const clientsQuery = query(collection(db, "clients"), orderBy("createdAt", "desc"));
  return onSnapshot(
    clientsQuery,
    (snapshot) => {
      callback(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data()
        })),
        ""
      );
    },
    (error) => {
      callback([], error instanceof Error ? error.message : "Не удалось загрузить клиентов.");
    }
  );
}

export async function approveSubscriptionRequest(requestId) {
  ensureConfigured();
  const requestRef = doc(db, "subscriptionRequests", requestId);
  const requestSnapshot = await getDoc(requestRef);
  if (!requestSnapshot.exists()) {
    throw new Error("Заявка не найдена.");
  }

  const requestData = requestSnapshot.data();
  await updateDoc(requestRef, {
    status: "approved",
    updatedAt: serverTimestamp()
  });
  await setDoc(
    doc(db, "clients", requestData.userId),
    {
      subscriptionTier: requestData.tier,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function rejectSubscriptionRequest(requestId) {
  ensureConfigured();
  const requestRef = doc(db, "subscriptionRequests", requestId);
  await updateDoc(requestRef, {
    status: "rejected",
    updatedAt: serverTimestamp()
  });
}

export async function completeOrderAndAddRating(orderPayload) {
  ensureConfigured();
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Сначала войдите через Google.");
  }

  const items = Array.isArray(orderPayload?.items) ? orderPayload.items : [];
  const total = Number(orderPayload?.totalUzs) || 0;
  if (!items.length || total <= 0) {
    throw new Error("Корзина пуста.");
  }

  await upsertClientFromAuth(user);
  await addDoc(collection(db, "orders"), {
    userId: user.uid,
    userEmail: user.email || "",
    userName: user.displayName || "Google User",
    items,
    totalUzs: total,
    createdAt: serverTimestamp()
  });

  await setDoc(
    doc(db, "clients", user.uid),
    {
      ratingPoints: increment(total),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export function watchTopClients(callback, topLimit = 20) {
  if (!db) {
    callback([], getFirebaseStatusMessage());
    return () => {};
  }

  const q = query(collection(db, "clients"), orderBy("ratingPoints", "desc"), limit(topLimit));
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((item, index) => ({
          id: item.id,
          rank: index + 1,
          ...item.data()
        })),
        ""
      );
    },
    (error) => {
      callback([], error instanceof Error ? error.message : "Не удалось загрузить рейтинг.");
    }
  );
}

export async function getCurrentClientRank(userId) {
  ensureConfigured();
  const q = query(collection(db, "clients"), orderBy("ratingPoints", "desc"));
  const snapshot = await getDocs(q);
  const list = snapshot.docs.map((item, index) => ({
    id: item.id,
    rank: index + 1,
    ...item.data()
  }));
  const target = list.find((item) => item.id === userId);
  return target ? target.rank : null;
}

export { DEFAULT_SUBSCRIPTIONS, DEFAULT_CLIENT_RATING };
