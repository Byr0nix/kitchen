import {
  createSubscriptionRequest,
  getCurrentClientRank,
  getFirebaseStatusMessage,
  signInWithGoogle,
  signOutCurrentUser,
  watchCurrentClientProfile,
  watchTopClients,
  watchSubscriptionSettings
} from "../shared/firebase.js";

const BOT_USERNAME = "Salomatlikbufeti_bot";
const CART_KEY = "salomatlik-cart-items-v1";

const infoBlock = document.getElementById("infoBlock");
const cartCount = document.getElementById("cartCount");
const selectedPlanLabel = document.getElementById("selectedPlanLabel");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authStatus = document.getElementById("authStatus");
const firebaseStatus = document.getElementById("firebaseStatus");
const accountAvatar = document.getElementById("accountAvatar");
const accountName = document.getElementById("accountName");
const accountEmail = document.getElementById("accountEmail");
const accountTierBadge = document.getElementById("accountTierBadge");
const ratingSummary = document.getElementById("ratingSummary");
const ratingTop = document.getElementById("ratingTop");

let requestedTier = null;
let currentProfile = null;

function normalizeTier(tier) {
  return tier === "VIP" ? "VIP" : "PREMIUM";
}

function userHasTier(profile, tier) {
  if (!profile || !profile.subscriptionTier) return false;
  if (tier === "VIP") return profile.subscriptionTier === "VIP";
  return profile.subscriptionTier === "PREMIUM" || profile.subscriptionTier === "VIP";
}

function loadCartItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function updateCartCount() {
  if (cartCount) {
    cartCount.textContent = String(loadCartItems().length);
  }
}

function redirectToTelegram(tier) {
  window.location.href = `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(tier)}`;
}

function renderInfo(profile) {
  if (!infoBlock) return;

  if (!profile) {
    infoBlock.innerHTML = `
      <strong>Status:</strong> Guest<br />
      <strong>Sign in:</strong> Google only<br />
      <strong>Tier:</strong> None
    `;
    return;
  }

  const tierLabel =
    profile.subscriptionTier === "VIP"
      ? "VIP"
      : profile.subscriptionTier === "PREMIUM"
        ? "PREMIUM"
        : "Standard";

  infoBlock.innerHTML = `
    <strong>Name:</strong> ${profile.displayName || "Google User"}<br />
    <strong>Email:</strong> ${profile.email || "-"}<br />
    <strong>Sign in:</strong> Google<br />
    <strong>Tier:</strong> ${tierLabel}<br />
    <strong>Rating:</strong> ${Number(profile.ratingPoints) || 0} points
  `;
}

async function renderRatingSummary(profile) {
  if (!ratingSummary) return;
  if (!profile) {
    ratingSummary.innerHTML = "<strong>Rating:</strong> 0 points<br /><strong>Rank:</strong> -";
    return;
  }

  const points = Number(profile.ratingPoints) || 0;
  let rankText = "-";
  try {
    const rank = await getCurrentClientRank(profile.id);
    rankText = rank ? `#${rank}` : "-";
  } catch (error) {
    rankText = "не удалось загрузить";
  }

  ratingSummary.innerHTML = `
    <strong>Your points:</strong> ${points}<br />
    <strong>Your rank:</strong> ${rankText}<br />
    <strong>Rule:</strong> 1 UZS покупки = 1 балл рейтинга
  `;
}

function renderTopClients(clients) {
  if (!ratingTop) return;
  if (!Array.isArray(clients) || !clients.length) {
    ratingTop.innerHTML = "<strong>Top clients:</strong><br />Пока нет данных.";
    return;
  }

  const list = clients
    .slice(0, 10)
    .map((item) => `#${item.rank} ${item.displayName || item.email || "Client"} — ${Number(item.ratingPoints) || 0} pts`)
    .join("<br />");
  ratingTop.innerHTML = `<strong>Top clients:</strong><br />${list}`;
}

function updatePlanButtons(profile) {
  document.querySelectorAll(".sign-up-btn").forEach((button) => {
    const tier = normalizeTier(String(button.dataset.start || ""));
    const active = userHasTier(profile, tier);
    button.disabled = active;
    button.textContent = active ? "Вы подписаны" : tier === "VIP" ? "Купить VIP" : "Купить Premium";
    button.style.opacity = active ? "0.75" : "";
    button.style.cursor = active ? "not-allowed" : "";
  });
}

function renderAccount(profile) {
  currentProfile = profile;
  renderInfo(profile);
  updatePlanButtons(profile);

  if (!profile) {
    accountAvatar.src = "../img/logo.svg";
    accountName.textContent = "Guest";
    accountEmail.textContent = "Войдите через Google, чтобы отправлять заявки на подписку.";
    accountTierBadge.textContent = "Guest";
    googleLoginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    return;
  }

  accountAvatar.src = profile.photoURL || "../img/logo.svg";
  accountName.textContent = profile.displayName || "Google User";
  accountEmail.textContent = profile.email || "";
  accountTierBadge.textContent = profile.subscriptionTier === "NONE" ? "Standard" : profile.subscriptionTier;
  googleLoginBtn.classList.add("hidden");
  logoutBtn.classList.remove("hidden");
}

async function startTierPurchase(tier) {
  const tierNorm = normalizeTier(tier);
  requestedTier = tierNorm;

  if (selectedPlanLabel) {
    selectedPlanLabel.textContent = `Вы выбрали подписку: ${tierNorm}.`;
  }

  if (userHasTier(currentProfile, tierNorm)) {
    authStatus.textContent = `У вас уже активна подписка ${currentProfile.subscriptionTier}.`;
    return;
  }

  if (!currentProfile) {
    authStatus.textContent = "Сначала войдите через Google.";
    googleLoginBtn.focus();
    return;
  }

  try {
    const result = await createSubscriptionRequest(tierNorm);
    authStatus.textContent = result.alreadyPending
      ? `Заявка на ${tierNorm} уже ожидает подтверждения.`
      : `Заявка на ${tierNorm} отправлена администратору. Переходим к оплате...`;
    redirectToTelegram(tierNorm);
  } catch (error) {
    authStatus.textContent = error instanceof Error ? error.message : "Не удалось создать заявку.";
  }
}

googleLoginBtn.addEventListener("click", async () => {
  authStatus.textContent = "";
  const labelEl = googleLoginBtn.querySelector(".google-sso-btn__label");
  const defaultLabel = labelEl ? labelEl.textContent : "";
  googleLoginBtn.disabled = true;
  if (labelEl) labelEl.textContent = "Подключение к Google…";
  try {
    const user = await signInWithGoogle();
    authStatus.textContent = user
      ? "Вход через Google выполнен."
      : "Открывается страница Google… После входа вы вернётесь в профиль.";
    if (user && requestedTier) {
      await startTierPurchase(requestedTier);
    }
  } catch (error) {
    authStatus.textContent = error instanceof Error ? error.message : "Не удалось войти через Google.";
  } finally {
    googleLoginBtn.disabled = false;
    if (labelEl) labelEl.textContent = defaultLabel || "Войти через Google";
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOutCurrentUser();
    requestedTier = null;
    selectedPlanLabel.textContent = "";
    authStatus.textContent = "Вы вышли из аккаунта.";
  } catch (error) {
    authStatus.textContent = error instanceof Error ? error.message : "Не удалось выйти.";
  }
});

document.querySelectorAll(".sign-up-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const tier = button.dataset.start;
    if (tier) {
      startTierPurchase(tier);
    }
  });
});

document.querySelectorAll(".plan-card").forEach((cardEl) => {
  const baseShadow = "0 10px 24px rgba(59, 130, 246, 0.10)";
  const hoverShadow = "0 18px 40px rgba(139, 92, 246, 0.25), 0 0 22px rgba(59, 130, 246, 0.25)";
  cardEl.style.boxShadow = baseShadow;

  cardEl.addEventListener("mouseenter", () => {
    cardEl.style.transform = "scale(1.03)";
    cardEl.style.boxShadow = hoverShadow;
  });

  cardEl.addEventListener("mouseleave", () => {
    cardEl.style.transform = "scale(1)";
    cardEl.style.boxShadow = baseShadow;
  });
});

watchCurrentClientProfile(({ profile, error }) => {
  renderAccount(profile);
  renderRatingSummary(profile);
  if (error) {
    authStatus.textContent = error;
  } else if (profile) {
    authStatus.textContent = `Аккаунт активен. Тариф: ${profile.subscriptionTier === "NONE" ? "standard" : profile.subscriptionTier}.`;
  }
});

watchTopClients((clients, error) => {
  if (error) {
    if (ratingTop) ratingTop.innerHTML = `<strong>Top clients:</strong><br />${error}`;
    return;
  }
  renderTopClients(clients);
});

watchSubscriptionSettings((config, error) => {
  const vipPrice = document.querySelector('[data-price="VIP"]');
  const premiumPrice = document.querySelector('[data-price="PREMIUM"]');
  const vipCard = document.querySelector('.plan-card[data-plan="VIP"]');
  const premiumCard = document.querySelector('.plan-card[data-plan="PREMIUM"]');

  if (vipPrice) vipPrice.textContent = `$${config.vipPrice}/month`;
  if (premiumPrice) premiumPrice.textContent = `$${config.premiumPrice}/month`;
  if (vipCard) vipCard.style.display = config.vipEnabled === false ? "none" : "";
  if (premiumCard) premiumCard.style.display = config.premiumEnabled === false ? "none" : "";
  firebaseStatus.textContent = error || getFirebaseStatusMessage();
});

updateCartCount();
renderAccount(null);
