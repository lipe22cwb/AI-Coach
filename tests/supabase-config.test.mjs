import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "../lib/supabase/client.ts";

const KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

function withEnv(changes, run) {
  const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of KEYS) {
      const value = changes[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const key of KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

test("missing Supabase environment is detected without throwing", () => {
  withEnv({}, () => {
    assert.equal(isSupabaseConfigured(), false);
    assert.equal(getSupabaseBrowserClient(), null);
  });
});

test("a public URL and publishable key form a valid public configuration", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "example-public-key",
    },
    () => assert.equal(isSupabaseConfigured(), true),
  );
});

test("legacy anon key is recognized and blank keys are rejected", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-anon-key",
    },
    () => assert.equal(isSupabaseConfigured(), true),
  );
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "   ",
    },
    () => assert.equal(isSupabaseConfigured(), false),
  );
});
