import { getFirebaseStatusMessage, watchCurrentClientProfile, watchSubscriptionSettings } from "./shared/firebase.js";

const defaultProducts = [
  {
    id: "p1",
    title: "Organic Dried Apricot",
    description: "Naturally sweet, preservative-free sun-dried apricots.",
    price: 39000,
    category: "Dried Fruits",
    accessLevel: "ALL",
    image: "https://images.unsplash.com/photo-1596591868231-05e5f17c9c68?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: "p2",
    title: "Energy Nut Mix Box",
    description: "Protein-rich almonds, walnuts, and cashews in one box.",
    price: 56000,
    category: "Boxes",
    accessLevel: "ALL",
    image: "https://images.unsplash.com/photo-1505576399279-565b52d4ac71?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: "p3",
    title: "Oat & Honey Bar",
    description: "Soft baked bar with whole oats and floral honey.",
    price: 18000,
    category: "Bars",
    accessLevel: "ALL",
    image: "https://images.unsplash.com/photo-1603569283847-aa295f0d016a?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: "p4",
    title: "Detox Green Cocktail",
    description: "Fresh spinach, apple, and cucumber cold-pressed blend.",
    price: 32000,
    category: "Cocktails",
    accessLevel: "ALL",
    image: "https://images.unsplash.com/photo-1505253216365-4c7f3db8f515?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: "p5",
    title: "Classic Kombucha",
    description: "Fermented tea drink with a light sparkling finish.",
    price: 27000,
    category: "Drinks",
    accessLevel: "ALL",
    image: "https://images.unsplash.com/photo-1563227812-0ea4c22e6cc8?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: "p6",
    title: "Homemade Granola Jar",
    description: "Crunchy granola with seeds and dried berries.",
    price: 44000,
    category: "Homemade Products",
    accessLevel: "ALL",
    image: "https://images.unsplash.com/photo-1517093157656-b9eccef91cb1?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: "p7",
    title: "Premium Date Selection",
    description: "Soft Medjool dates ideal for healthy snacking.",
    price: 61000,
    category: "Dried Fruits",
    accessLevel: "PREMIUM",
    image: "https://images.unsplash.com/photo-1621112904887-419379ce6824?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: "p8",
    title: "Weekend Sale Fruit Box",
    description: "Special seasonal fruit box with discounted pricing.",
    price: 49000,
    category: "Sales",
    accessLevel: "VIP",
    image: "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=900&q=80"
  }
];

const PRODUCTS_STORAGE_KEY = "salomatlik-products-v1";
const STORAGE_KEY = "salomatlik-cart-items-v1";
const BOT_USERNAME = "Salomatlikbufeti_bot";
const categories = ["All", "Sales", "Dried Fruits", "Boxes", "Bars", "Cocktails", "Drinks", "Homemade Products"];
const TIER_EXTRA_DISCOUNT_PERCENT = { PREMIUM: 7, VIP: 15 };

let activeCategory = "All";
let searchTerm = "";
let cart = loadCart();
let products = loadProducts();
let currentTier = "NONE";
let subscriptionConfig = {
  premiumPrice: 98,
  vipPrice: 148,
  premiumEnabled: true,
  vipEnabled: true
};

const productsGrid = document.getElementById("productsGrid");
const categoryStrip = document.getElementById("categoryStrip");
const searchInput = document.getElementById("searchInput");
const emptyState = document.getElementById("emptyState");
const cartCount = document.getElementById("cartCount");
const imageModal = document.getElementById("imageModal");
const modalImage = document.getElementById("modalImage");
const closeModalBtn = document.getElementById("closeModalBtn");
const burgerBtn = document.getElementById("burgerBtn");
const mobileNavPanel = document.getElementById("mobileNavPanel");

function formatPrice(value) {
  return `${value.toLocaleString("en-US")} UZS`;
}

function loadCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function loadProducts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRODUCTS_STORAGE_KEY));
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(defaultProducts));
      return [...defaultProducts];
    }
    return parsed;
  } catch (error) {
    localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(defaultProducts));
    return [...defaultProducts];
  }
}

function saveCart() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

function totalCartItems() {
  return cart.length;
}

function getProductCountMap() {
  return cart.reduce((acc, item) => {
    acc[item.id] = (acc[item.id] || 0) + 1;
    return acc;
  }, {});
}

function inferAccessLevel(product) {
  if (product.accessLevel) return product.accessLevel;
  if (product.id === "p7") return "PREMIUM";
  if (product.id === "p8") return "VIP";
  return "ALL";
}

function canAccessProduct(product, tier) {
  const accessLevel = inferAccessLevel(product);
  if (accessLevel === "ALL") return true;
  if (accessLevel === "PREMIUM") return tier === "PREMIUM" || tier === "VIP";
  if (accessLevel === "VIP") return tier === "VIP";
  return false;
}

function getTierExtraDiscountPercent(tier) {
  return Number(TIER_EXTRA_DISCOUNT_PERCENT[tier]) || 0;
}

function calcFinalPrice(product, tier) {
  const basePrice = Number(product.price) || 0;
  const baseDiscount = Math.max(0, Math.min(90, Number(product.discountPercent) || 0));
  const tierDiscount = Math.max(0, Math.min(50, getTierExtraDiscountPercent(tier)));
  const afterBase = basePrice * (1 - baseDiscount / 100);
  const afterTier = afterBase * (1 - tierDiscount / 100);
  return Math.round(afterTier);
}

function renderCategories() {
  categoryStrip.innerHTML = categories
    .map(
      (category) => `
      <button
        type="button"
        class="category-btn ${category === activeCategory ? "active" : ""}"
        data-category="${category}"
      >
        ${category}
      </button>
    `
    )
    .join("");
}

function handleCategoryClick(event) {
  const target = event.target.closest(".category-btn");
  if (!target) return;
  activeCategory = target.dataset.category;
  renderCategories();
  renderProducts();
}

function handleSearchInput(event) {
  searchTerm = event.target.value.trim().toLowerCase();
  renderProducts();
}

function getFilteredProducts() {
  return products.filter((product) => {
    const categoryMatch = activeCategory === "All" || product.category === activeCategory;
    const searchMatch = product.title.toLowerCase().includes(searchTerm);
    return categoryMatch && searchMatch && canAccessProduct(product, currentTier);
  });
}

function addToCart(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product || !canAccessProduct(product, currentTier)) return;

  cart.push({
    id: product.id,
    title: product.title,
    price: calcFinalPrice(product, currentTier),
    img: product.image
  });
  saveCart();
  updateCartBadge();
  renderProducts();
}

function updateCartBadge() {
  if (cartCount) {
    cartCount.textContent = String(totalCartItems());
  }
}

function openModal(imageSrc, title) {
  if (!modalImage || !imageModal) return;
  modalImage.src = imageSrc;
  modalImage.alt = title;
  imageModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeModal() {
  if (!modalImage || !imageModal) return;
  imageModal.classList.add("hidden");
  modalImage.src = "";
  document.body.classList.remove("modal-open");
}

function onModalBackdropClick(event) {
  if (event.target === imageModal) {
    closeModal();
  }
}

function renderProducts() {
  if (!productsGrid || !emptyState) return;
  const filtered = getFilteredProducts();
  const productCountMap = getProductCountMap();

  if (!filtered.length) {
    productsGrid.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  productsGrid.innerHTML = filtered
    .map((product) => {
      const inCart = Boolean(productCountMap[product.id]);
      const finalPrice = calcFinalPrice(product, currentTier);
      const showStrike = finalPrice < Number(product.price);
      return `
        <article class="product-card">
          <div class="card__image">
            <img
              class="product-image"
              src="${product.image}"
              alt="${product.title}"
              data-preview-src="${product.image}"
              data-preview-title="${product.title}"
              loading="lazy"
            />
          </div>
          <h3 class="product-title">${product.title}</h3>
          <p class="product-description">${product.description}</p>
          <div class="product-meta">
            <span class="product-price">
              ${showStrike ? `<small style="display:block;color:#8a8a8a;text-decoration:line-through">${formatPrice(product.price)}</small>` : ""}
              ${formatPrice(finalPrice)}
            </span>
            <button
              type="button"
              class="add-btn ${inCart ? "added" : ""}"
              data-add-id="${product.id}"
              aria-label="Add ${product.title} to cart"
              title="${inCart ? `Added (${productCountMap[product.id]}x)` : "Add to cart"}"
            >
              +
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function onProductsGridClick(event) {
  const addBtn = event.target.closest("[data-add-id]");
  if (addBtn) {
    addToCart(addBtn.dataset.addId);
    return;
  }

  const image = event.target.closest(".card__image img[data-preview-src]");
  if (image) {
    openModal(image.dataset.previewSrc, image.dataset.previewTitle);
  }
}

function toggleMobileNav() {
  if (mobileNavPanel) {
    mobileNavPanel.classList.toggle("open");
  }
}

function closeMobileNav() {
  if (mobileNavPanel) {
    mobileNavPanel.classList.remove("open");
  }
}

function initTopNavigation() {
  document.querySelectorAll("[data-tier-link]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.preventDefault();
      const tier = String(el.dataset.tierLink || "").toUpperCase();
      if (tier === "PREMIUM" || tier === "VIP") {
        openTierModal(tier);
      }
    });
  });

  const tierInfoModal = document.getElementById("tierInfoModal");
  if (tierInfoModal) {
    tierInfoModal.addEventListener("click", (event) => {
      if (event.target === tierInfoModal) closeTierModal();
    });
  }

  document.querySelectorAll('a[href^="#"]:not([data-tier-link])').forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      const href = anchor.getAttribute("href");
      if (!href || href === "#") return;
      const target = document.querySelector(href);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function openTierModal(tier) {
  const tierInfoModal = document.getElementById("tierInfoModal");
  const tierInfoBody = document.getElementById("tierInfoBody");
  const tierInfoCloseBtn = document.getElementById("tierInfoCloseBtn");
  if (!tierInfoModal || !tierInfoBody || !tierInfoCloseBtn) return;

  const isVip = tier === "VIP";
  const title = isVip ? "VIP (топ тариф)" : "ПРЕМИУМ (средний тариф)";
  const priceLine = isVip ? "10–20% скидки, бесплатная доставка" : "5–10% скидки, быстрая доставка";

  tierInfoBody.innerHTML = isVip
    ? `
      <div class="modal-body">
        <h2 style="margin-top:0;">${title}</h2>
        <p class="muted">${priceLine}</p>
        <h3>Что будет включено</h3>
        <ul class="simple-list">
          <li>Максимальные скидки 10–20% и эксклюзивные предложения</li>
          <li>Бесплатная доставка без минимального заказа</li>
          <li>Персональные предложения только для VIP</li>
          <li>Приоритет №1: обработка первым, поддержка быстрее</li>
          <li>Кешбэк 7–10% + подарки к заказу</li>
        </ul>
        <p class="muted" style="margin-top:1rem;">
          Доступ открывается после входа через Google и одобрения администратором.
        </p>
      </div>
    `
    : `
      <div class="modal-body">
        <h2 style="margin-top:0;">${title}</h2>
        <p class="muted">${priceLine}</p>
        <h3>Что будет включено</h3>
        <ul class="simple-list">
          <li>Скидки 5–10% на товары</li>
          <li>Быстрая доставка и приоритетная обработка</li>
          <li>Ранний доступ к новым товарам и акциям</li>
          <li>Кешбэк 3–5% и баллы за покупки</li>
          <li>Упрощённый интерфейс без рекламы</li>
        </ul>
        <p class="muted" style="margin-top:1rem;">
          Доступ открывается после входа через Google и одобрения администратором.
        </p>
      </div>
    `;

  tierInfoModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  tierInfoCloseBtn.onclick = closeTierModal;
}

function closeTierModal() {
  const tierInfoModal = document.getElementById("tierInfoModal");
  if (!tierInfoModal) return;
  tierInfoModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function initPartnersSection() {
  const partnerForm = document.getElementById("partnerForm");
  const partnerPhotosInput = document.getElementById("partnerPhotosInput");
  const partnerPhotosPreview = document.getElementById("partnerPhotosPreview");
  const partnerUploadHint = document.getElementById("partnerUploadHint");
  if (!partnerForm || !partnerPhotosInput || !partnerPhotosPreview) return;

  let partnerPhotos = [];

  function renderPreview() {
    partnerPhotosPreview.innerHTML = "";
    partnerPhotos.forEach((photo, idx) => {
      const thumb = document.createElement("div");
      thumb.className = "photo-thumb";
      thumb.tabIndex = 0;
      thumb.setAttribute("role", "button");
      thumb.setAttribute("aria-label", "View photo");
      thumb.innerHTML = `
        <img src="${photo.dataUrl}" alt="Partner photo ${idx + 1}" />
        <button type="button" aria-label="Remove photo" data-remove-photo-index="${idx}">&times;</button>
      `;

      thumb.addEventListener("click", () => openModal(photo.dataUrl, `Фото партнёра ${idx + 1}`));
      thumb.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openModal(photo.dataUrl, `Фото партнёра ${idx + 1}`);
        }
      });

      thumb.querySelector(`[data-remove-photo-index="${idx}"]`)?.addEventListener("click", (event) => {
        event.stopPropagation();
        partnerPhotos.splice(idx, 1);
        renderPreview();
      });

      partnerPhotosPreview.appendChild(thumb);
    });
  }

  partnerPhotosInput.addEventListener("change", async () => {
    const files = Array.from(partnerPhotosInput.files || []);
    partnerPhotos = [];
    partnerPhotosPreview.innerHTML = "";
    if (partnerUploadHint) partnerUploadHint.textContent = "";
    if (!files.length) return;

    const selected = files.slice(0, 8);
    if (files.length > 8 && partnerUploadHint) {
      partnerUploadHint.textContent = "Можно загрузить максимум 8 фото. Остальные будут проигнорированы.";
    }

    for (const file of selected) {
      if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) continue;
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => resolve("");
        reader.readAsDataURL(file);
      });
      if (dataUrl) {
        partnerPhotos.push({ dataUrl, name: file.name });
      }
    }

    if (partnerUploadHint) {
      partnerUploadHint.textContent = partnerPhotos.length
        ? `Фото загружены: ${partnerPhotos.length}. Превью работает локально.`
        : "Фото не удалось загрузить. Попробуйте другой формат.";
    }

    renderPreview();
  });

  partnerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.getElementById("partnerNameInput")?.value.trim() || "";
    const company = document.getElementById("partnerCompanyInput")?.value.trim() || "";
    const contact = document.getElementById("partnerContactInput")?.value.trim() || "";
    const description = document.getElementById("partnerDescriptionInput")?.value.trim() || "";
    const message = [
      "Заявка в партнёры",
      `Имя: ${name || "-"}`,
      `Компания: ${company || "-"}`,
      `Телефон/Telegram: ${contact || "-"}`,
      `Описание товара: ${description || "-"}`,
      `Фото: ${partnerPhotos.length} (превью локально; при необходимости отправлю в Telegram чате)`
    ].join("\n");

    window.location.href = `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(message)}`;
  });
}

function initVacanciesSection() {
  const vacanciesGrid = document.getElementById("vacanciesGrid");
  const vacanciesEmpty = document.getElementById("vacanciesEmpty");
  const workTypeSelect = document.getElementById("vacWorkTypeSelect");
  const formatSelect = document.getElementById("vacFormatSelect");
  const applyModal = document.getElementById("applyModal");
  const applyCloseBtn = document.getElementById("applyCloseBtn");
  const applyForm = document.getElementById("applyForm");
  const applyVacancyTitle = document.getElementById("applyVacancyTitle");
  if (!vacanciesGrid || !workTypeSelect || !formatSelect || !applyModal || !applyCloseBtn || !applyForm || !applyVacancyTitle) {
    return;
  }

  const vacancies = [
    { id: "v1", title: "Курьер", location: "Tashkent", salary: "по договорённости", workType: "Part-time", format: "Office", badge: "HOT", description: "Доставка заказов и помощь в операционке. Возможна частичная занятость." },
    { id: "v2", title: "Менеджер заказов", location: "Remote", salary: "5–7M UZS", workType: "Full-time", format: "Remote", badge: "NEW", description: "Обработка заявок, контроль статусов и коммуникация с клиентами." },
    { id: "v3", title: "Оператор поддержки", location: "Tashkent", salary: "3–5M UZS", workType: "Full-time", format: "Office", badge: "HOT", description: "Поддержка в Telegram/звонки и решение вопросов клиентов." }
  ];

  function getFilteredVacancies() {
    return vacancies.filter((vacancy) => {
      const workOk = workTypeSelect.value === "ALL" || vacancy.workType === workTypeSelect.value;
      const formatOk = formatSelect.value === "ALL" || vacancy.format === formatSelect.value;
      return workOk && formatOk;
    });
  }

  function renderVacancies() {
    const list = getFilteredVacancies();
    vacanciesGrid.innerHTML = "";
    vacanciesEmpty?.classList.toggle("hidden", list.length !== 0);
    if (!list.length) return;

    vacanciesGrid.innerHTML = list
      .map((vacancy) => {
        const badgeHot = vacancy.badge === "HOT" ? `<span class="badge">Hot</span>` : "";
        const badgeNew = vacancy.badge === "NEW" ? `<span class="badge new">New</span>` : "";
        return `
          <article class="vacancy-card">
            <div class="vacancy-top">
              <div style="display:grid; gap:.15rem;">
                <strong style="font-size:1.05rem;">${vacancy.title}</strong>
                <div class="vacancy-meta">${vacancy.location} • ${vacancy.salary}</div>
              </div>
              <div class="vacancy-badges">${badgeHot}${badgeNew}</div>
            </div>
            <div class="vacancy-meta">${vacancy.workType} • ${vacancy.format}</div>
            <p style="margin:0;color:var(--muted);">${vacancy.description}</p>
            <div style="margin-top:.15rem;">
              <button class="action-btn" type="button" data-apply-vacancy-id="${vacancy.id}">Откликнуться</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function closeApplyModal() {
    applyModal.classList.add("hidden");
    document.body.classList.remove("modal-open");
  }

  applyCloseBtn.addEventListener("click", closeApplyModal);
  applyModal.addEventListener("click", (event) => {
    if (event.target === applyModal) closeApplyModal();
  });

  vacanciesGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-apply-vacancy-id]");
    if (!button) return;
    const vacancy = vacancies.find((item) => item.id === button.dataset.applyVacancyId);
    if (!vacancy) return;
    applyVacancyTitle.value = vacancy.title;
    applyModal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  });

  applyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const telegramMsg = [
      "Отклик на вакансию",
      `Вакансия: ${applyVacancyTitle.value || ""}`,
      `Имя: ${document.getElementById("applyNameInput")?.value.trim() || ""}`,
      `Контакт (телефон/Telegram): ${document.getElementById("applyContactInput")?.value.trim() || ""}`,
      `Опыт: ${document.getElementById("applyExperienceInput")?.value.trim() || "-"}`,
      `Сообщение: ${document.getElementById("applyMessageInput")?.value.trim() || ""}`
    ].join("\n");

    window.location.href = `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(telegramMsg)}`;
  });

  workTypeSelect.addEventListener("change", renderVacancies);
  formatSelect.addEventListener("change", renderVacancies);
  renderVacancies();
}

function init() {
  products = loadProducts();
  renderCategories();
  renderProducts();
  updateCartBadge();

  if (categoryStrip) categoryStrip.addEventListener("click", handleCategoryClick);
  if (searchInput) searchInput.addEventListener("input", handleSearchInput);
  if (productsGrid) productsGrid.addEventListener("click", onProductsGridClick);
  if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
  if (imageModal) imageModal.addEventListener("click", onModalBackdropClick);

  initTopNavigation();
  initPartnersSection();
  initVacanciesSection();

  document.getElementById("detailsTelegramBtn")?.addEventListener("click", () => {
    const msg = "Привет! Хочу узнать больше о Salomatlik Bufeti.";
    window.location.href = `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(msg)}`;
  });

  burgerBtn?.addEventListener("click", toggleMobileNav);
  document.addEventListener("click", (event) => {
    if (!mobileNavPanel || !burgerBtn) return;
    const clickedInside = mobileNavPanel.contains(event.target) || burgerBtn.contains(event.target);
    if (!clickedInside) closeMobileNav();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileNavPanel?.classList.contains("open")) {
      closeMobileNav();
      return;
    }
    if (event.key === "Escape" && imageModal && !imageModal.classList.contains("hidden")) {
      closeModal();
    }
    if (event.key === "Escape" && !document.getElementById("tierInfoModal")?.classList.contains("hidden")) {
      closeTierModal();
    }
    if (event.key === "Escape" && !document.getElementById("applyModal")?.classList.contains("hidden")) {
      document.getElementById("applyModal")?.classList.add("hidden");
      document.body.classList.remove("modal-open");
    }
  });

  watchCurrentClientProfile(({ profile }) => {
    currentTier = profile?.subscriptionTier || "NONE";
    renderProducts();
  });

  watchSubscriptionSettings((config, error) => {
    subscriptionConfig = config;
    if (error) {
      console.warn(error);
    }
    const firebaseMessage = getFirebaseStatusMessage();
    if (firebaseMessage) {
      console.warn(firebaseMessage);
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
