# `src/lib/ai/` — AI commentary, coach, workout generation, and route recommendation

## What's here

- `provider.ts` — Provider abstraction and `generateWorkout()` entry point; routes to xAI (Grok via `/xai` proxy) or Ollama (`localhost:11434`); one self-repair retry on invalid JSON
- `commentator.ts` — Live ride commentary engine: `detectTriggers()` (pure, called each frame) + `pickAndGenerate()` (async, throttled); static lines for predictable triggers, xAI for dynamic ones
- `commentatorStaticLines.ts` — Hand-curated commentary strings pool; `pickStaticLine(trigger)` and `pickFallbackLine()`; no LLM calls
- `coach.ts` — Training coach: picks a workout from `PRESET_WORKOUTS` catalog by id; never generates raw workout segments — uses the curated catalog for quality control
- `validate.ts` — Validates and repairs AI-generated `Workout` JSON (duration units, %FTP fractions, missing ids, wrong key names); pure, Node-testable
- `validateRoute.ts` — Validates and repairs AI-generated route recommendation JSON (`AIRouteInfo`); pure, Node-testable
- `routeRecommender.ts` — Natural language prompt → `AIRouteInfo` + `Route` polyline via `generateRoute()`

## Public API

```ts
// provider.ts
generateWorkout(prompt: string, ctx: { ftpW: number }): Promise<Workout>

// commentator.ts
createCommentatorState(): CommentatorState
detectTriggers(current: RideSnapshot, prev: RideSnapshot, settings: SettingsSnapshot): CommentaryTrigger[]
pickAndGenerate(triggers: CommentaryTrigger[], ride: RideSnapshot, state: CommentatorState): Promise<{ line: string; state: CommentatorState }>

// commentatorStaticLines.ts
pickStaticLine(trigger: CommentaryTrigger): string | null
pickFallbackLine(): string
// CommentaryTrigger: 'bot_attack' | 'climb_entry' | 'speed_50' | 'speed_60'
//                  | 'speed_70' | 'halfway' | 'final_2km' | 'recovery'
//                  | 'descent_exit' | 'power_dropout' | 'bot_catch'

// coach.ts
coachRecommendation(ctx: CoachContext): Promise<CoachRecommendation>
validateCoachRecommendation(raw: string): CoachValidationResult
// CoachContext: { ftpW, recentWorkouts, riderGoal, fatigueLevel }
// CoachRecommendation: { workoutId, rationale, scheduledFor }

// validate.ts
validateAndRepairWorkout(raw: string, ftpW: number): { ok: boolean; workout?: Workout; errors: string[] }

// validateRoute.ts
validateRouteInfo(raw: string): { ok: boolean; info?: AIRouteInfo; errors: string[] }

// routeRecommender.ts
recommendRoute(prompt: string): Promise<{ info: AIRouteInfo; route: Route }>
```

## How it's consumed

- `src/stores/aiStore.ts` — holds commentary state; calls `detectTriggers` / `pickAndGenerate`
- `src/hooks/useRideLoop.ts` — invokes `detectTriggers` each frame; throttled `pickAndGenerate` on trigger
- `src/components/workouts/AIWorkoutDesigner.tsx` — calls `generateWorkout`
- `src/components/training/AICoach.tsx` — calls `coachRecommendation`
- `src/components/routes/AIRouteRecommender.tsx` — calls `recommendRoute`

## Constraints / gotchas

- **Provider selection**: `VITE_AI_PROVIDER=xai|ollama|auto` (default `auto`). `auto` uses xAI when `VITE_XAI_API_KEY` is set, else Ollama. Never hard-code keys — proxy route `/xai` keeps the key server-side.
- **xAI proxy**: requires `/xai` reverse proxy (configured in `vite.config.ts` for dev; must be replicated in production via Vercel rewrites or a serverless function).
- **Ollama**: runs at `localhost:11434`, no CORS issues. Must be running locally with the target model pulled. No key required.
- **Self-repair**: all generators attempt one repair pass if the first LLM response fails validation. If both attempts fail, an Error is thrown — callers should catch and surface a user-facing message.
- **Coach constraint**: `coachRecommendation` only returns workout ids from `PRESET_WORKOUTS` (`@/lib/presetWorkouts`). It cannot invent new workout structures.
- **Static vs. LLM commentary**: static triggers (`halfway`, `speed_50/60/70`, `recovery`, `descent_exit`, `power_dropout`) never make a network call. LLM triggers (`bot_attack`, `climb_entry`, `final_2km`, `bot_catch`) call xAI/Ollama and have the associated latency.
- **Pure validation modules**: `validate.ts` and `validateRoute.ts` have no React/Cesium/store imports — safe to test in vitest/Node.
