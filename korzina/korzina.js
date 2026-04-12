import {
  completeOrderAndAddRating,
  getFirebaseStatusMessage,
  watchCurrentClientProfile
} from "../shared/firebase.js";

const CART_KEY = "salomatlik-cart-items-v1";
const cartItemsEl = document.getElementById("cartItems");
const clearCartBtn = document.getElementById("clearCartBtn");
const emptyCartEl = document.getElementById("emptyCart");
const totalPriceEl = document.getElementById("totalPrice");
const cartCount = document.getElementById("cartCount");
const checkoutBtn = document.getElementById("checkoutBtn");
const checkoutStatus = document.getElementById("checkoutStatus");
const BOT_USERNAME = "Salomatlikbufeti_bot";
let currentTier = "NONE";
let isSignedIn = false;

function getDeliveryPriority(tier) {
  if (tier === "VIP") return "Приоритет №1";
  if (tier === "PREMIUM") return "Приоритетная обработка";
  return "Обычная доставка";
}

function getCashbackPercent(tier) {
  if (tier === "VIP") return 9; // в рамках 7–10%
  if (tier === "PREMIUM") return 4; // в рамках 3–5%
  return 0;
}

function loadCartItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveCartItems(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

function formatPrice(value) {
  return `${value.toLocaleString("en-US")} UZS`;
}

function updateCartBadge(items) {
  cartCount.textContent = items.length;
}

function renderCart() {
  const items = loadCartItems();
  updateCartBadge(items);

  if (!items.length) {
    cartItemsEl.innerHTML = "";
    totalPriceEl.textContent = "0 UZS";
    emptyCartEl.classList.remove("hidden");
    return;
  }

  emptyCartEl.classList.add("hidden");
  cartItemsEl.innerHTML = items
    .map(
      (item, index) => `
      <article class="cart-item">
        <img src="${item.img}" alt="${item.title}" />
        <div>
          <h3 class="item-title">${item.title}</h3>
          <p class="item-price">${formatPrice(Number(item.price) || 0)}</p>
        </div>
        <button type="button" class="remove-btn" data-remove-index="${index}">Remove</button>
      </article>
    `
    )
    .join("");

  const total = items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  totalPriceEl.textContent = formatPrice(total);
  if (checkoutBtn) {
    checkoutBtn.disabled = items.length === 0;
  }
}

function onCartClick(event) {
  const removeBtn = event.target.closest("[data-remove-index]");
  if (!removeBtn) return;

  const index = Number(removeBtn.dataset.removeIndex);
  const items = loadCartItems();
  items.splice(index, 1);
  saveCartItems(items);
  renderCart();
}

function clearCart() {
  saveCartItems([]);
  renderCart();
}

function checkoutToTelegram() {
  const items = loadCartItems();
  if (!items.length) return;

  const deliveryPriority = getDeliveryPriority(currentTier);

  const counts = items.reduce((acc, item) => {
    const key = item.id || item.title;
    if (!acc[key]) {
      acc[key] = { title: item.title, qty: 0 };
    }
    acc[key].qty += 1;
    return acc;
  }, {});

  const orderList = Object.values(counts)
    .map((item) => `${item.title} x${item.qty}`)
    .join(", ");
  const total = items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

  if (!isSignedIn) {
    checkoutStatus.textContent = "Сначала войдите через Google в профиле.";
    return;
  }

  completeOrderAndAddRating({
    items,
    totalUzs: total
  })
    .then(() => {
      const cashbackPercent = getCashbackPercent(currentTier);
      const orderText = `Order: ${orderList} | Total: ${total} UZS | Tier: ${currentTier} | ${deliveryPriority} | Rating +${total} points | Cashback ${cashbackPercent}%`;
      saveCartItems([]);
      renderCart();
      checkoutStatus.textContent = `Заказ оформлен. Рейтинг увеличен на ${total} баллов.`;
      window.location.href = `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(orderText)}`;
    })
    .catch((error) => {
      checkoutStatus.textContent = error instanceof Error ? error.message : "Не удалось оформить заказ.";
    });
}

cartItemsEl.addEventListener("click", onCartClick);
clearCartBtn.addEventListener("click", clearCart);
if (checkoutBtn) {
  checkoutBtn.addEventListener("click", checkoutToTelegram);
}

watchCurrentClientProfile(({ profile, error }) => {
  isSignedIn = Boolean(profile);
  currentTier = profile?.subscriptionTier || "NONE";
  const configMessage = getFirebaseStatusMessage();
  if (error) {
    checkoutStatus.textContent = error;
  } else if (configMessage) {
    checkoutStatus.textContent = configMessage;
  } else if (isSignedIn) {
    checkoutStatus.textContent = `Аккаунт активен. Текущий тариф: ${currentTier}.`;
  }
});

renderCart();
