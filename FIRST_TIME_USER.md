# GlobeRide — First-Time User Journey

This document describes exactly what a cold visitor sees on their first visit:
no localStorage, no Strava connection, no FTP set, no ride history, no saved routes.

---

## 1. Landing page (`/`)

The visitor arrives at the static landing page (`src/routes/Landing.tsx` → `Landing.tsx` renders the marketing shell).

**What they see:**
- Full-screen hero with a photorealistic Cesium globe spinning slowly behind a headline: "Ride anywhere on Earth."
- Three primary CTAs in the hero:
  - **"Try demo route"** — loads a sample iconic route and navigates to `/ride` in Demo Mode (no trainer required).
  - **"Launch app"** — navigates to the app Home (`/app` or `#app`).
  - **"View on GitHub"** — external link.
- Feature grid below the hero: 22 feature cards covering globe, FTMS, avatar, workouts, etc.
- No account prompt, no cookie banner, no paywall.

---

## 2. Path A — "Try demo route" → Ride in Demo Mode

1. A random iconic route (e.g. Alpe d'Huez) is set in `rideStore`.
2. The Daily Ride workout preset is attached automatically.
3. Browser navigates to `/ride`.
4. Cesium globe renders the route. If no Cesium token is in `localStorage`, `CesiumTokenPrompt` appears first.
5. The ride starts in **Demo Mode** — power and speed are simulated by the physics engine.
6. The HUD shows a **Demo Mode** badge (`ConnectionStatus` component, `mode === 'demo'`) — friendly, not error-feeling.
7. On finish, `FinishCard` offers: Export .FIT / Share / Back to home.

---

## 3. Path B — "Launch app" → Home with empty state

Browser navigates to `/` (the `Home` route). Five tabs appear: **Ride, Routes, Workouts, Races, History**.

### 3a. Ride tab (default)

The user lands here. They see:

- **Ride mode** card: Indoor (default) / Outdoor toggle.
- **Step 1 — Pick a route**: `RouteSearch` text field. "Advanced: upload your own GPX" details element (collapsed). "Explore globe" and "Draw a route" ghost buttons.
- **Step 2 — Pair your smart trainer**: `TrainerConnect` component. No trainer → shows Bluetooth pair button. On Safari/iOS: a notice that Web Bluetooth is unavailable; Demo Mode will be used.
- **Step 3 — Roll out**: "No trainer connected — Demo Mode will simulate power and speed for you." The "Enter the world" CTA is always enabled. Physics chips show default rider mass (75 kg), bike type, wind.

The user can click **"Enter the world"** immediately — it auto-selects a random iconic route and attaches the Daily Ride workout.

### 3b. Routes tab — empty state

The "My Routes" library card shows the `EmptyState` component:

> **Your route library is empty — let's add one**
>
> Upload a GPX from Strava or Garmin, pick an iconic climb, or draw a custom route on the globe.
>
> [Upload GPX]  [Pick an iconic route]  [Draw your own]

The rest of the Routes tab (Draw a custom route, Generate a scenic route, Iconic climbs, World Tour stages) is fully populated — these don't require any user data.

### 3c. Workouts tab — default state

- **Daily Ride card** always visible: "Z2 endurance · ERG-guided · X min" with a one-tap Start button.
- **FTP Test** section: explains why FTP matters, offers Ramp Test and 20-Min Test.
- **Workout Picker**, **Training Plans**, **Workout Library** all populated with curated content.
- `AICoach` panel shows two primer banners for cold visitors:
  - **"Set your FTP first"** (amber): explains FTP matters for the coach, directs to FTP Test in Workouts tab.
  - **"Ride once to unlock personalised coaching"** (blue): explains the coach uses ride history; still lets them ask for a recommendation now.

### 3d. Races tab — empty state

`RaceLobby` empty state:

> **No races yet**
>
> Import a race from a friend's share link or .race.json file, or create your own and challenge your club.
>
> [Import a race]  [Create a race]
>
> *Results are stored locally — no account required.*

### 3e. History tab — empty states

Three cards, all showing empty states:

**Training Log** (`RideHistory`):
> **Your ride history will appear here after your first ride**
>
> Complete any route or workout and GlobeRide will automatically log it — distance, power, elevation, and more.
>
> [Start your first ride]

**Fitness & Form** (`FitnessChart`):
> **No training data yet**
>
> Complete a few rides and your fitness (CTL), fatigue (ATL), and form (TSB) will appear here. The chart uses the standard 42-day / 7-day model.
>
> [Start your first ride]

**Personal Records** (`PersonalRecords`):
> **No personal records yet**
>
> Complete your first ride to start tracking personal bests, power curves, and training trends.
>
> [Start your first ride]

`AICoach` (also in History tab) shows the no-FTP and no-rides primer banners described in 3c.

---

## 4. `/replay/:rideId` — no ride in history

If a user navigates directly to a replay URL that doesn't exist in their local IndexedDB, `Replay.tsx` renders:

> (AlertCircle icon)
>
> Ride "xyz" not found
>
> Finish a ride first — GlobeRide records telemetry automatically so you can watch it back in cinematic replay.
>
> [Go back]  [Start a ride →]

---

## 5. `/companion` — first-time phone visitor

`Companion.tsx` shows a **"How to pair"** card before the tablet has connected:

1. Open GlobeRide on your **tablet or laptop** and start a ride.
2. Open this page on your **phone**.
3. Both devices must be on the **same browser profile** — pairing uses BroadcastChannel (no internet needed).

A **"Copy companion link"** button lets the user share the URL easily.

The HR and Cadence sensor cards are always visible and functional — the user can pair sensors even before the tablet connects.

---

## 6. Ride view — no trainer connected (Demo Mode)

`ConnectionStatus` in the HUD shows:

```
[CPU icon]  mode
            Demo mode
```

This is a neutral, informational badge — not an error. The ride proceeds normally via the physics engine simulation.

---

## 7. `/explore` — Cesium token

If no Cesium ion token is stored, `CesiumTokenPrompt` appears as a centred modal over the globe canvas. It explains what Cesium ion is, links to the free token signup, and has a text field + submit button. The token is saved to `localStorage` on submit. This is unchanged from the token-onboarding wave (41.A).

---

## Summary of cold-visitor empty states

| Location | Trigger | Empty state headline | Primary CTA |
|---|---|---|---|
| Routes tab → My Routes | No saved routes | "Your route library is empty — let's add one" | Upload GPX / Pick iconic route / Draw your own |
| History tab → Training Log | No rides | "Your ride history will appear here after your first ride" | Start your first ride |
| History tab → Fitness & Form | No rides | "No training data yet" | Start your first ride |
| History tab → Personal Records | No rides | "No personal records yet" | Start your first ride |
| History tab → AI Coach | FTP = 0 | "Set your FTP first" (amber banner) | — (directs to FTP Test) |
| History tab → AI Coach | Rides < 3 | "X more rides to unlock the full coaching experience" (blue banner) | — (still lets them ask) |
| Races tab | No races | "No races yet" | Import a race / Create a race |
| `/replay/:rideId` | Ride not found | "Finish a ride first…" | Start a ride |
| `/companion` | Tablet not paired | "How to pair" card | Copy companion link |
| Ride HUD | No trainer | "Demo mode" badge | — (ride continues) |
