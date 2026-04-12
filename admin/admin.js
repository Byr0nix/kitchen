import {
  approveSubscriptionRequest,
  getFirebaseStatusMessage,
  rejectSubscriptionRequest,
  saveSubscriptionSettings,
  watchClients,
  watchPendingSubscriptionRequests,
  watchSubscriptionSettings
} from "../shared/firebase.js";

const AUTH_KEY = "salomatlik-admin-auth";
const AUTH_SESSION_TS_KEY = "salomatlik-admin-auth-ts";
const AUTH_CREDENTIALS_KEY = "salomatlik-admin-credentials-v1";
const PRODUCTS_KEY = "salomatlik-products-v1";
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

const loginSection = document.getElementById("loginSection");
const panelSection = document.getElementById("panelSection");
const loginForm = document.getElementById("loginForm");
const loginInput = document.getElementById("loginInput");
const passwordInput = document.getElementById("passwordInput");
const loginStatus = document.getElementById("loginStatus");
const logoutBtn = document.getElementById("logoutBtn");
const sessionStatus = document.getElementById("sessionStatus");

const productForm = document.getElementById("productForm");
const productTitle = document.getElementById("productTitle");
const productPrice = document.getElementById("productPrice");
const productCategory = document.getElementById("productCategory");
const productAccessLevel = document.getElementById("productAccessLevel");
const productImage = document.getElementById("productImage");
const productDesc = document.getElementById("productDesc");
const productsTable = document.getElementById("productsTable");

const subsForm = document.getElementById("subsForm");
const premiumPrice = document.getElementById("premiumPrice");
const vipPrice = document.getElementById("vipPrice");
const premiumEnabled = document.getElementById("premiumEnabled");
const vipEnabled = document.getElementById("vipEnabled");
const subsStatus = document.getElementById("subsStatus");

const subsRequestsTable = document.getElementById("subsRequestsTable");
const clientsTable = document.getElementById("clientsTable");

const credentialsForm = document.getElementById("credentialsForm");
const newLogin = document.getElementById("newLogin");
const newPassword = document.getElementById("newPassword");
const currentPasswordConfirm = document.getElementById("currentPasswordConfirm");
const credentialsStatus = document.getElementById("credentialsStatus");

let sessionTimer = null;
let editModeProductId = null;
let unsubscribeClients = null;
let unsubscribeRequests = null;
let unsubscribeSubscriptions = null;

function isAuthenticated() {
  return localStorage.getItem(AUTH_KEY) === "1";
}

function setAuthenticated(value) {
  localStorage.setItem(AUTH_KEY, value ? "1" : "0");
  if (value) {
    localStorage.setItem(AUTH_SESSION_TS_KEY, String(Date.now()));
  } else {
    localStorage.removeItem(AUTH_SESSION_TS_KEY);
  }
}

function loadCredentials() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_CREDENTIALS_KEY));
    if (parsed && parsed.login && parsed.password) return parsed;
  } catch (error) {
    // ignore bad local data
  }
  return { login: "admin", password: "admin123" };
}

function saveCredentials(data) {
  localStorage.setItem(AUTH_CREDENTIALS_KEY, JSON.stringify(data));
}

function updateSessionActivity() {
  if (isAuthenticated()) {
    localStorage.setItem(AUTH_SESSION_TS_KEY, String(Date.now()));
    updateSessionStatus();
  }
}

function updateSessionStatus(extra = "") {
  if (!sessionStatus || !isAuthenticated()) return;
  const ts = Number(localStorage.getItem(AUTH_SESSION_TS_KEY) || 0);
  const leftMs = Math.max(0, SESSION_TIMEOUT_MS - (Date.now() - ts));
  const mins = Math.ceil(leftMs / 60000);
  const timeoutText = `Автовыход через ${mins} мин. без активности`;
  sessionStatus.textContent = extra ? `${timeoutText}. ${extra}` : timeoutText;
}

function startSessionTimer() {
  if (sessionTimer) clearInterval(sessionTimer);
  sessionTimer = setInterval(() => {
    const ts = Number(localStorage.getItem(AUTH_SESSION_TS_KEY) || 0);
    if (!isAuthenticated() || !ts) return;
    if (Date.now() - ts > SESSION_TIMEOUT_MS) {
      teardownFirebaseListeners();
      setAuthenticated(false);
      panelSection.classList.add("hidden");
      loginSection.classList.remove("hidden");
      loginStatus.textContent = "Сессия истекла. Войдите снова.";
      clearInterval(sessionTimer);
      sessionTimer = null;
      return;
    }
    updateSessionStatus();
  }, 30000);
}

function formatDate(ts) {
  if (!ts) return "сейчас";
  const date = typeof ts?.toDate === "function" ? ts.toDate() : new Date(ts);
  return date.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function loadProducts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRODUCTS_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveProducts(products) {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
}

function renderProducts() {
  const products = loadProducts();
  if (!products.length) {
    productsTable.innerHTML = '<p class="status-text">Товары пока не заданы. Добавьте первый товар.</p>';
    return;
  }

  productsTable.innerHTML = products
    .map(
      (item) => `
        <article class="product-row" data-id="${item.id}">
          <div style="display:flex; gap:.65rem; align-items:center;">
            <img src="${item.image}" alt="${item.title}" />
            <div>
              <strong>${item.title}</strong><br />
              <small>${item.category} • ${Number(item.price).toLocaleString("en-US")} UZS • ${item.accessLevel || "ALL"}</small>
            </div>
          </div>
          <label>
            Скидка %
            <input class="small-input" type="number" min="0" max="90" value="${item.discountPercent || 0}" data-discount-id="${item.id}" />
          </label>
          <button class="secondary-btn" type="button" data-edit-id="${item.id}">Редактировать</button>
          <button class="danger-btn" type="button" data-delete-id="${item.id}">Удалить</button>
        </article>
      `
    )
    .join("");
}

function renderClients(clients, error = "") {
  if (error) {
    clientsTable.innerHTML = `<p class="status-text">${error}</p>`;
    return;
  }
  if (!clients.length) {
    clientsTable.innerHTML = '<p class="status-text">Клиентов пока нет.</p>';
    return;
  }

  clientsTable.innerHTML = clients
    .map((client) => {
      const tierLabel = client.subscriptionTier === "NONE" ? "Обычный" : client.subscriptionTier || "Обычный";
      return `
        <article class="product-row">
          <div style="display:flex; gap:.65rem; align-items:center;">
            <div style="width:56px;height:56px;border-radius:12px;background:rgba(139,92,246,0.12);display:flex;align-items:center;justify-content:center;font-size:1.2rem;overflow:hidden;">
              ${client.photoURL ? `<img src="${client.photoURL}" alt="${client.displayName || client.email}" style="width:100%;height:100%;object-fit:cover;" />` : "G"}
            </div>
            <div>
              <strong>${client.displayName || "Google User"}</strong><br />
              <small>${client.email || "-"}</small>
            </div>
          </div>
          <div><small style="color:#2e4230; font-weight:600;">${tierLabel}</small></div>
          <div><small>${client.role || "client"}</small></div>
          <div><small>${formatDate(client.lastLoginAt)}</small></div>
        </article>
      `;
    })
    .join("");
}

function renderSubscriptionRequests(requests, error = "") {
  if (error) {
    subsRequestsTable.innerHTML = `<p class="status-text">${error}</p>`;
    return;
  }
  if (!requests.length) {
    subsRequestsTable.innerHTML = '<p class="status-text">Пока нет заявок на Premium/VIP.</p>';
    return;
  }

  subsRequestsTable.innerHTML = requests
    .map((req) => {
      const statusText = req.status === "approved" ? "Одобрено" : req.status === "rejected" ? "Отклонено" : "В ожидании";
      const approveBtn = req.status === "pending"
        ? `<button class="secondary-btn" type="button" data-approve-request-id="${req.id}">Активировать</button>`
        : `<button class="secondary-btn" type="button" disabled>Активировать</button>`;
      const rejectBtn = req.status === "pending"
        ? `<button class="danger-btn" type="button" data-reject-request-id="${req.id}">Отклонить</button>`
        : `<button class="danger-btn" type="button" disabled>Отклонить</button>`;

      return `
        <article class="product-row" data-request-id="${req.id}">
          <div style="display:flex; gap:.65rem; align-items:center;">
            <div style="width:56px;height:56px;border-radius:12px;background:rgba(59,130,246,0.12);display:flex;align-items:center;justify-content:center;font-size:1.2rem;overflow:hidden;">
              ${req.userPhotoURL ? `<img src="${req.userPhotoURL}" alt="${req.userName || req.userEmail}" style="width:100%;height:100%;object-fit:cover;" />` : "G"}
            </div>
            <div>
              <strong>${req.userName || "Google User"}</strong><br />
              <small>${req.userEmail || "-"} • ${req.tier} • ${formatDate(req.createdAt)}</small>
            </div>
          </div>
          <div><small style="color:#2e4230; font-weight:600;">${statusText}</small></div>
          <div>${approveBtn}</div>
          <div>${rejectBtn}</div>
        </article>
      `;
    })
    .join("");
}

function applySubscriptionSettings(data) {
  premiumPrice.value = data.premiumPrice ?? 98;
  vipPrice.value = data.vipPrice ?? 148;
  premiumEnabled.checked = data.premiumEnabled !== false;
  vipEnabled.checked = data.vipEnabled !== false;
}

function teardownFirebaseListeners() {
  unsubscribeClients?.();
  unsubscribeRequests?.();
  unsubscribeSubscriptions?.();
  unsubscribeClients = null;
  unsubscribeRequests = null;
  unsubscribeSubscriptions = null;
}

function connectFirebaseData() {
  teardownFirebaseListeners();

  unsubscribeClients = watchClients((clients, error) => {
    renderClients(clients, error);
    if (error) updateSessionStatus(error);
  });

  unsubscribeRequests = watchPendingSubscriptionRequests((requests, error) => {
    renderSubscriptionRequests(requests, error);
    if (error) updateSessionStatus(error);
  });

  unsubscribeSubscriptions = watchSubscriptionSettings((config, error) => {
    applySubscriptionSettings(config);
    if (error) {
      subsStatus.textContent = error;
      updateSessionStatus(error);
      return;
    }
    const firebaseMessage = getFirebaseStatusMessage();
    if (firebaseMessage) {
      subsStatus.textContent = firebaseMessage;
      updateSessionStatus(firebaseMessage);
    }
  });
}

function showPanel() {
  loginSection.classList.add("hidden");
  panelSection.classList.remove("hidden");
  newLogin.value = loadCredentials().login;
  renderProducts();
  connectFirebaseData();
  updateSessionStatus(getFirebaseStatusMessage());
  startSessionTimer();
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const creds = loadCredentials();
  if (loginInput.value.trim() === creds.login && passwordInput.value.trim() === creds.password) {
    setAuthenticated(true);
    showPanel();
    return;
  }
  loginStatus.textContent = "Неверный логин или пароль.";
});

logoutBtn.addEventListener("click", () => {
  teardownFirebaseListeners();
  setAuthenticated(false);
  panelSection.classList.add("hidden");
  loginSection.classList.remove("hidden");
  if (sessionTimer) {
    clearInterval(sessionTimer);
    sessionTimer = null;
  }
});

productForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const products = loadProducts();
  const payload = {
    title: productTitle.value.trim(),
    description: productDesc.value.trim(),
    price: Number(productPrice.value) || 0,
    category: productCategory.value.trim(),
    accessLevel: productAccessLevel.value || "ALL",
    image: productImage.value.trim()
  };

  if (editModeProductId) {
    saveProducts(products.map((item) => (item.id === editModeProductId ? { ...item, ...payload } : item)));
    editModeProductId = null;
    productForm.querySelector("button[type='submit']").textContent = "Добавить товар";
  } else {
    products.push({ id: `p-${Date.now()}`, ...payload, discountPercent: 0 });
    saveProducts(products);
  }

  productForm.reset();
  renderProducts();
  updateSessionActivity();
});

productsTable.addEventListener("input", (event) => {
  const input = event.target.closest("[data-discount-id]");
  if (!input) return;
  const discount = Math.max(0, Math.min(90, Number(input.value) || 0));
  saveProducts(loadProducts().map((item) => (item.id === input.dataset.discountId ? { ...item, discountPercent: discount } : item)));
  renderProducts();
  updateSessionActivity();
});

productsTable.addEventListener("click", (event) => {
  const editBtn = event.target.closest("[data-edit-id]");
  if (editBtn) {
    const product = loadProducts().find((item) => item.id === editBtn.dataset.editId);
    if (!product) return;
    editModeProductId = product.id;
    productTitle.value = product.title;
    productPrice.value = product.price;
    productCategory.value = product.category;
    productAccessLevel.value = product.accessLevel || "ALL";
    productImage.value = product.image;
    productDesc.value = product.description;
    productForm.querySelector("button[type='submit']").textContent = "Сохранить изменения";
    updateSessionActivity();
    return;
  }

  const deleteBtn = event.target.closest("[data-delete-id]");
  if (!deleteBtn) return;
  saveProducts(loadProducts().filter((item) => item.id !== deleteBtn.dataset.deleteId));
  renderProducts();
  updateSessionActivity();
});

subsRequestsTable.addEventListener("click", async (event) => {
  const approveBtn = event.target.closest("[data-approve-request-id]");
  const rejectBtn = event.target.closest("[data-reject-request-id]");

  try {
    if (approveBtn) {
      await approveSubscriptionRequest(approveBtn.dataset.approveRequestId);
      updateSessionActivity();
      return;
    }
    if (rejectBtn) {
      await rejectSubscriptionRequest(rejectBtn.dataset.rejectRequestId);
      updateSessionActivity();
    }
  } catch (error) {
    subsStatus.textContent = error instanceof Error ? error.message : "Не удалось обновить заявку.";
  }
});

subsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveSubscriptionSettings({
      premiumPrice: Number(premiumPrice.value) || 98,
      vipPrice: Number(vipPrice.value) || 148,
      premiumEnabled: premiumEnabled.checked,
      vipEnabled: vipEnabled.checked
    });
    subsStatus.textContent = "Настройки подписок сохранены.";
    updateSessionActivity();
  } catch (error) {
    subsStatus.textContent = error instanceof Error ? error.message : "Не удалось сохранить тарифы.";
  }
});

credentialsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const creds = loadCredentials();
  if (currentPasswordConfirm.value.trim() !== creds.password) {
    credentialsStatus.textContent = "Текущий пароль введен неверно.";
    return;
  }

  saveCredentials({
    login: newLogin.value.trim(),
    password: newPassword.value.trim()
  });
  currentPasswordConfirm.value = "";
  credentialsStatus.textContent = "Логин и пароль обновлены.";
  updateSessionActivity();
});

if (isAuthenticated()) {
  showPanel();
}

document.addEventListener("click", updateSessionActivity);
document.addEventListener("keydown", updateSessionActivity);
