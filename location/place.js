"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const CART_KEY = "salomatlik-cart-items-v1";
  const geoBtn = document.getElementById("geoBtn");
  const geoStatus = document.getElementById("geoStatus");
  const distanceStatus = document.getElementById("distanceStatus");
  const cartCount = document.getElementById("cartCount");

  const storeLat = 41.330673;
  const storeLng = 69.223024;

  function loadCartItems() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CART_KEY));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function updateCartCount() {
    if (!cartCount) return;
    cartCount.textContent = loadCartItems().length;
  }

  function toRad(value) {
    return (value * Math.PI) / 180;
  }

  // Haversine formula to calculate distance (km)
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function detectLocation() {
    if (!navigator.geolocation) {
      geoStatus.textContent = "Geolocation is not supported by your browser.";
      return;
    }

    geoStatus.textContent = "Detecting your location...";
    if (distanceStatus) distanceStatus.classList.add("hidden");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const distance = haversineKm(latitude, longitude, storeLat, storeLng);

        geoStatus.textContent = `Latitude: ${latitude.toFixed(
          6
        )}, Longitude: ${longitude.toFixed(6)}`;

        if (distanceStatus) {
          distanceStatus.textContent = `You are ${distance.toFixed(1)} km away from the store`;
          distanceStatus.classList.remove("hidden");
        }
      },
      (error) => {
        geoStatus.textContent = `Could not get location: ${error.message}`;
        if (distanceStatus) distanceStatus.classList.add("hidden");
      }
    );
  }

  if (geoBtn) geoBtn.addEventListener("click", detectLocation);
  updateCartCount();
});
