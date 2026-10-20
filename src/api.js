// REST client for the (mock) wearable service and meal endpoint.
const TOKEN = "demo-token";

async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
  return data;
}

export const fetchDailyActivity = (date, provider, simulateFailure = false) =>
  request(`/api/wearable/v1/activity/daily?date=${date}&provider=${provider}${simulateFailure ? "&fail=1" : ""}`);

export const postMeal = (meal) => request("/api/meals", { method: "POST", body: JSON.stringify(meal) });

// Shrink a photo to <=800px JPEG so it fits in localStorage.
export function compressImage(file, max = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => reject(new Error("That file could not be read as an image."));
    img.src = url;
  });
}
