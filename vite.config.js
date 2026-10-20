import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* ---------- Mock wearable REST API (runs inside the Vite dev server) ----------
   GET  /api/wearable/v1/activity/daily?date=YYYY-MM-DD&provider=healthkit|googlefit
        header: Authorization: Bearer demo-token
        add &fail=1 to simulate a 503
   POST /api/meals   (JSON body)  -> 201 Created
   Because it is a real HTTP endpoint, Postman can call it too. */
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function mockApi() {
  const handler = (req, res, next) => {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/")) return next();
    const send = (code, body) => {
      res.statusCode = code;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    };
    const delay = (fn) => setTimeout(fn, 600); // simulate network latency

    if (req.method === "GET" && url.pathname === "/api/wearable/v1/activity/daily") {
      return delay(() => {
        if (req.headers.authorization !== "Bearer demo-token")
          return send(401, { error: "unauthorized", message: "Missing or invalid bearer token" });
        if (url.searchParams.get("fail")) return send(503, { error: "service_unavailable" });
        const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
        const provider = url.searchParams.get("provider") || "healthkit";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return send(400, { error: "bad_request", message: "date must be YYYY-MM-DD" });
        const h = hash(provider + date);
        const steps = 3000 + (h % 9000);
        const active = Math.round(steps * 0.04 + ((h >> 3) % 120));
        send(200, {
          provider, date, steps,
          activeEnergyBurned: { value: active, unit: "kcal" },
          source: provider === "googlefit" ? "com.google.android.gms:estimated_steps" : "HKQuantityTypeIdentifierStepCount",
          syncedAt: new Date().toISOString(),
        });
      });
    }

    if (req.method === "POST" && url.pathname === "/api/meals") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => delay(() => {
        try {
          const meal = JSON.parse(body || "{}");
          if (!meal.description) return send(422, { error: "validation_failed", message: "description is required" });
          send(201, { id: "srv_" + Math.random().toString(36).slice(2, 9), ...meal, photo: meal.photo ? "[omitted]" : null });
        } catch { send(400, { error: "invalid_json" }); }
      }));
      return;
    }
    send(404, { error: "not_found" });
  };
  return {
    name: "mock-wearable-api",
        configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({ plugins: [react(), mockApi()] });
