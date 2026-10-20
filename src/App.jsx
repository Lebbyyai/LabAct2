import { useEffect, useState } from "react";
import { compressImage, fetchDailyActivity, postMeal } from "./api";
import "./styles.css";

const STEP_GOAL = 8000;
const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"];
const PROVIDERS = { healthkit: "Apple HealthKit", googlefit: "Google Fit" };
const todayStr = () => new Date().toISOString().slice(0, 10);
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function useStoredMeals() {
  const [meals, setMeals] = useState(() => {
    try { return JSON.parse(localStorage.getItem("meals") || "[]"); } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem("meals", JSON.stringify(meals)); } catch { /* storage full: keep in memory */ }
  }, [meals]);
  return [meals, setMeals];
}

/* ------------------------------ Intake form ------------------------------ */
function MealForm({ onSave }) {
  const blank = { type: "Breakfast", time: nowLocal(), description: "", calories: "", portion: "Medium", photo: "" };
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError("");
    try { setF({ ...f, photo: await compressImage(file) }); }
    catch (err) { setPhotoError(err.message); }
  };

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!f.description.trim()) next.description = "Describe what you ate.";
    if (f.calories !== "" && (Number(f.calories) < 0 || Number(f.calories) > 5000)) next.calories = "Enter calories between 0 and 5000.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const meal = { ...f, id: crypto.randomUUID(), calories: f.calories === "" ? null : Number(f.calories), description: f.description.trim() };
    await onSave(meal);
    setF({ ...blank, time: nowLocal() });
    setBusy(false);
  };

  return (
    <form onSubmit={submit} noValidate className="card">
      <h2>Log a meal</h2>
      <div className="seg" role="radiogroup" aria-label="Meal type">
        {MEAL_TYPES.map((t) => (
          <button type="button" key={t} role="radio" aria-checked={f.type === t}
            className={f.type === t ? "on" : ""} onClick={() => setF({ ...f, type: t })}>{t}</button>
        ))}
      </div>

      <label>What did you eat?
        <textarea rows={3} value={f.description} onChange={set("description")}
          aria-invalid={!!errors.description} placeholder="e.g. Oatmeal with banana and peanut butter" />
        {errors.description && <span className="err">{errors.description}</span>}
      </label>

      <div className="two">
        <label>Portion
          <select value={f.portion} onChange={set("portion")}>
            <option>Small</option><option>Medium</option><option>Large</option>
          </select>
        </label>
        <label>Calories (optional)
          <input type="number" inputMode="numeric" min="0" value={f.calories} onChange={set("calories")} placeholder="kcal" />
          {errors.calories && <span className="err">{errors.calories}</span>}
        </label>
      </div>

      <label>Time
        <input type="datetime-local" value={f.time} onChange={set("time")} />
      </label>

      <div className="photo">
        {f.photo ? (
          <>
            <img src={f.photo} alt="Meal preview" />
            <button type="button" className="ghost" onClick={() => setF({ ...f, photo: "" })}>Remove photo</button>
          </>
        ) : (
          <label className="drop">Add a photo
            {/* capture opens the camera on phones; on desktop it opens a file picker */}
            <input type="file" accept="image/*" capture="environment" onChange={pickPhoto} />
          </label>
        )}
        {photoError && <span className="err">{photoError}</span>}
      </div>

      <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save meal"}</button>
    </form>
  );
}

/* ------------------------------ Wearable card ------------------------------ */
function WearableCard({ activity, status, error, provider, setProvider, onSync, simulateFail, setSimulateFail }) {
  const pct = activity ? Math.min(100, Math.round((activity.steps / STEP_GOAL) * 100)) : 0;
  return (
    <section className="card">
      <div className="head">
        <h2>Wearable data</h2>
        <select aria-label="Wearable service" value={provider} onChange={(e) => setProvider(e.target.value)}>
          {Object.entries(PROVIDERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {activity ? (
        <>
          <div className="stats">
            <div><b>{activity.steps.toLocaleString()}</b><span>steps</span></div>
            <div><b>{activity.activeEnergyBurned.value}</b><span>active kcal</span></div>
          </div>
          <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100"
            aria-label="Step goal progress"><i style={{ width: pct + "%" }} /></div>
          <p className="muted">{pct}% of {STEP_GOAL.toLocaleString()} step goal · synced {new Date(activity.syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
        </>
      ) : (
        <p className="muted">Not synced yet. Connect to pull today's steps and active energy.</p>
      )}

      {status === "error" && <p className="err" role="alert">{error} Your meals are still saved. Try syncing again.</p>}
      <button className="primary" onClick={onSync} disabled={status === "loading"}>
        {status === "loading" ? "Syncing…" : activity ? "Sync again" : `Sync ${PROVIDERS[provider]}`}
      </button>
      <label className="check"><input type="checkbox" checked={simulateFail} onChange={(e) => setSimulateFail(e.target.checked)} /> Simulate a server error (for testing)</label>
    </section>
  );
}

/* ------------------------------ Today view ------------------------------ */
function Today({ meals, remove, ...wearable }) {
  const today = meals.filter((m) => m.time.slice(0, 10) === todayStr()).sort((a, b) => a.time.localeCompare(b.time));
  const intake = today.reduce((s, m) => s + (m.calories || 0), 0);
  const burned = wearable.activity?.activeEnergyBurned.value;
  return (
    <>
      <WearableCard {...wearable} />
      <section className="card">
        <h2>Today's meals</h2>
        {today.length > 0 && (
          <p className="balance">
            <b>{intake}</b> kcal eaten{burned != null && <> · <b>{burned}</b> kcal active</>}
          </p>
        )}
        {today.length === 0 && <p className="muted">Nothing logged today. Use the Log tab to add your first meal.</p>}
        <ul className="meals">
          {today.map((m) => (
            <li key={m.id}>
              {m.photo && <img src={m.photo} alt={`${m.type} photo`} />}
              <div>
                <b>{m.type}</b> <span className="muted">{new Date(m.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {m.portion}</span>
                <p>{m.description}</p>
                {m.calories != null && <span className="muted">{m.calories} kcal</span>}
              </div>
              <button className="ghost" onClick={() => remove(m.id)} aria-label={`Delete ${m.type}`}>Delete</button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/* ------------------------------ App ------------------------------ */
export default function App() {
  const [tab, setTab] = useState("log");
  const [meals, setMeals] = useStoredMeals();
  const [provider, setProvider] = useState("healthkit");
  const [activity, setActivity] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [simulateFail, setSimulateFail] = useState(false);
  const [toast, setToast] = useState("");

  const sync = async () => {
    setStatus("loading"); setError("");
    try { setActivity(await fetchDailyActivity(todayStr(), provider, simulateFail)); setStatus("ok"); }
    catch (e) { setError(e.message + "."); setStatus("error"); }
  };

  const saveMeal = async (meal) => {
    setMeals((m) => [meal, ...m]);
    try { await postMeal({ ...meal, photo: meal.photo ? "(base64)" : null }); setToast("Meal saved and sent to the server."); }
    catch { setToast("Meal saved on this device. Server sync failed."); }
    setTimeout(() => setToast(""), 2500);
    setTab("today");
  };

  return (
    <div className="shell">
      <header><h1>Meal &amp; activity</h1></header>
      <main>
        {tab === "log"
          ? <MealForm onSave={saveMeal} />
          : <Today meals={meals} remove={(id) => setMeals((m) => m.filter((x) => x.id !== id))}
              activity={activity} status={status} error={error} provider={provider} setProvider={setProvider}
              onSync={sync} simulateFail={simulateFail} setSimulateFail={setSimulateFail} />}
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
      <nav aria-label="Main">
        <button className={tab === "log" ? "on" : ""} onClick={() => setTab("log")}>Log meal</button>
        <button className={tab === "today" ? "on" : ""} onClick={() => setTab("today")}>Today</button>
      </nav>
    </div>
  );
}
