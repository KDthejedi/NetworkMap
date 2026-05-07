"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding } from "./actions";

const GOAL_CATEGORIES = [
  "career_move",
  "skill_building",
  "business_development",
  "mentorship",
  "learning",
  "leadership",
  "thought_leadership",
  "board_service",
  "custom",
] as const;

const HORIZONS = [
  { value: "d30", label: "30 days" },
  { value: "d60", label: "60 days" },
  { value: "d90", label: "90 days" },
  { value: "m6", label: "6 months" },
  { value: "y1", label: "1 year" },
  { value: "y_multi", label: "Multi-year" },
] as const;

type Step = "profile" | "goal" | "done";

export function OnboardingWizard({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("profile");

  const [name, setName] = useState(defaultName);
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );

  const [goalTitle, setGoalTitle] = useState("");
  const [goalCategory, setGoalCategory] =
    useState<(typeof GOAL_CATEGORIES)[number]>("career_move");
  const [goalHorizon, setGoalHorizon] =
    useState<(typeof HORIZONS)[number]["value"]>("d90");
  const [goalPriority, setGoalPriority] = useState<"high" | "medium" | "low">(
    "high",
  );
  const [goalWhy, setGoalWhy] = useState("");

  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await completeOnboarding({
        displayName: name,
        city: city || null,
        country: country || null,
        timezone,
        goal: {
          title: goalTitle,
          category: goalCategory,
          horizon: goalHorizon,
          priority: goalPriority,
          whyThisMatters: goalWhy || null,
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/home");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === "profile" && (
        <section className="space-y-4">
          <header>
            <h2 className="text-xl font-semibold">Welcome.</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Let&apos;s set up your basics. Two quick steps.
            </p>
          </header>
          <div className="space-y-3">
            <Field label="Your name" value={name} onChange={setName} required />
            <div className="grid grid-cols-2 gap-3">
              <Field label="City" value={city} onChange={setCity} />
              <Field
                label="Country"
                value={country}
                onChange={setCountry}
                placeholder="US"
              />
            </div>
            <Field
              label="Timezone"
              value={timezone}
              onChange={setTimezone}
              required
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setStep("goal")}
              disabled={!name.trim() || !timezone.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </section>
      )}

      {step === "goal" && (
        <section className="space-y-4">
          <header>
            <h2 className="text-xl font-semibold">Your first goal.</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Goals drive what the agent suggests. You can add more later.
            </p>
          </header>
          <div className="space-y-3">
            <Field
              label="Title"
              value={goalTitle}
              onChange={setGoalTitle}
              placeholder="e.g. Move into a CTO role at a Series B"
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Category"
                value={goalCategory}
                onChange={(v) =>
                  setGoalCategory(v as (typeof GOAL_CATEGORIES)[number])
                }
                options={GOAL_CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, " ") }))}
              />
              <Select
                label="Horizon"
                value={goalHorizon}
                onChange={(v) =>
                  setGoalHorizon(v as (typeof HORIZONS)[number]["value"])
                }
                options={HORIZONS.map((h) => ({ value: h.value, label: h.label }))}
              />
            </div>
            <Select
              label="Priority"
              value={goalPriority}
              onChange={(v) => setGoalPriority(v as "high" | "medium" | "low")}
              options={[
                { value: "high", label: "High" },
                { value: "medium", label: "Medium" },
                { value: "low", label: "Low" },
              ]}
            />
            <label className="block">
              <span className="mb-1 block text-sm font-medium">
                Why this matters
              </span>
              <textarea
                value={goalWhy}
                onChange={(e) => setGoalWhy(e.target.value)}
                rows={3}
                placeholder="The agent uses this to reason about who you should engage."
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-between">
            <button
              onClick={() => setStep("profile")}
              className="rounded-md border px-4 py-2 text-sm font-medium"
            >
              Back
            </button>
            <button
              onClick={submit}
              disabled={pending || !goalTitle.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {pending ? "Setting up..." : "Finish"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const order: Step[] = ["profile", "goal"];
  return (
    <ol className="flex gap-2">
      {order.map((s, i) => (
        <li
          key={s}
          className={`h-1 flex-1 rounded ${
            order.indexOf(step) >= i ? "bg-primary" : "bg-muted"
          }`}
        />
      ))}
    </ol>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm capitalize"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
