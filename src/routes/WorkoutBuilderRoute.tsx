/**
 * WorkoutBuilderRoute — standalone page for /workouts/new and /workouts/:id/edit.
 *
 * Wraps the existing WorkoutBuilder component with routing context:
 *  - /workouts/new  → fresh builder, no initial workout
 *  - /workouts/:id/edit → loads an existing workout by id and passes it as
 *    initialWorkout so the user edits in place
 *
 * After save → navigates to /app (Home) with the Workouts tab pre-selected.
 * "Ride this workout" → loads the workout into rideStore and navigates to /ride.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Dumbbell } from 'lucide-react';

import { WorkoutBuilder } from '@/components/workouts/WorkoutBuilder';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Workout } from '@/lib/workout';
import { loadWorkout } from '@/lib/workoutLibrary';
import { useRideStore } from '@/stores/rideStore';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkoutBuilderRoute() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const loadWorkoutIntoRide = useRideStore((s) => s.loadWorkout);

  const [initialWorkout, setInitialWorkout] = useState<Workout | undefined>(undefined);
  const [loading, setLoading] = useState(!!id);
  const [notFound, setNotFound] = useState(false);

  // Load existing workout when editing
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    loadWorkout(id)
      .then((w) => {
        if (!w) { setNotFound(true); return; }
        setInitialWorkout(w);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSaved = useCallback((_workout: Workout) => {
    // Brief delay so the "Saved!" button state is visible before navigation
    setTimeout(() => navigate('/app'), 800);
  }, [navigate]);

  const handleRide = useCallback((workout: Workout) => {
    loadWorkoutIntoRide(workout);
    navigate('/ride');
  }, [navigate, loadWorkoutIntoRide]);

  // ---- Loading skeleton ----
  if (loading) {
    return (
      <PageShell>
        <div className="flex flex-col gap-3 animate-pulse">
          <div className="h-9 rounded-xl bg-muted/30 w-2/3" />
          <div className="h-40 rounded-xl bg-muted/20" />
          <div className="h-16 rounded-xl bg-muted/15" />
          <div className="h-16 rounded-xl bg-muted/15" />
        </div>
      </PageShell>
    );
  }

  // ---- 404 for /workouts/:id/edit when id not found ----
  if (id && notFound) {
    return (
      <PageShell>
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
          <Dumbbell className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" aria-hidden />
          <p className="text-sm font-semibold text-foreground">Workout not found</p>
          <p className="text-xs text-muted-foreground mt-1">
            The workout with id <code className="font-mono text-[11px]">{id}</code> doesn't exist in your library.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-1.5"
            onClick={() => navigate('/app')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to library
          </Button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <WorkoutBuilder
        initialWorkout={initialWorkout}
        onSaved={handleSaved}
        onRide={handleRide}
      />
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Shell — back button + page title, scrollable on mobile
// ---------------------------------------------------------------------------

function PageShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top nav bar */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground',
              'hover:text-foreground hover:bg-muted/50 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
          <h1 className="text-sm font-semibold text-foreground">Workout Builder</h1>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-2xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
