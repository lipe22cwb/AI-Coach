// Task 1: Check that this AI-Coach checkout points at the expected Mindsweeper
// Supabase project. This script makes no network calls and prints no secret keys.
// Run from the project root:
//   node --env-file=.env.local scripts/verify-ranked-config.mjs

const EXPECTED_PROJECT_REF = "squusumcekygqdkaabcm";
const EXPECTED_HOST = `${EXPECTED_PROJECT_REF}.supabase.co`;

let failures = 0;
let warnings = 0;

function pass(message) {
  console.log(`PASS  ${message}`);
}
function fail(message) {
  failures += 1;
  console.error(`FAIL  ${message}`);
}
function warn(message) {
  warnings += 1;
  console.warn(`WARN  ${message}`);
}

console.log("AI-Coach | Task 1: Ranked Supabase configuration check\n");

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
if (!rawUrl) {
  fail("NEXT_PUBLIC_SUPABASE_URL is missing from .env.local.");
} else {
  try {
    const parsedUrl = new URL(rawUrl);
    if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== EXPECTED_HOST) {
      fail(
        `Supabase URL does not point to the expected Mindsweeper project (${EXPECTED_HOST}).`,
      );
    } else if (
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.search ||
      parsedUrl.hash
    ) {
      fail("Supabase URL should not contain credentials, a query, or a fragment.");
    } else {
      pass(`Supabase URL points to the correct project (${EXPECTED_HOST}).`);
    }
  } catch {
    fail("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
}

const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const secret = process.env.SUPABASE_SECRET_KEY?.trim();

if (publishable) {
  pass("Browser publishable key is configured.");
} else if (anon) {
  // Ranked's server client currently reads the PUBLISHABLE_KEY specifically.
  fail(
    "Only NEXT_PUBLIC_SUPABASE_ANON_KEY is present; Ranked needs NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  );
} else {
  fail("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing.");
}

if (secret) {
  pass("Server-only Supabase secret key is configured.");
} else {
  fail("SUPABASE_SECRET_KEY is missing; Ranked's privileged server routes cannot work.");
}

if (secret && ((publishable && secret === publishable) || (anon && secret === anon))) {
  fail(
    "The server secret is identical to a public key. Check your Supabase API key setup.",
  );
}

const leakedPublicNames = Object.keys(process.env).filter(
  (name) =>
    name.startsWith("NEXT_PUBLIC_") &&
    /(SECRET|SERVICE_ROLE|PRIVATE_KEY|API_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY)/i.test(
      name,
    ) &&
    Boolean(process.env[name]?.trim()),
);
if (leakedPublicNames.length > 0) {
  fail(
    `Potentially sensitive NEXT_PUBLIC_ variables detected: ${leakedPublicNames.join(", ")}.`,
  );
} else {
  pass("No obviously sensitive server keys are configured under NEXT_PUBLIC_ names.");
}

if (warnings) console.log(`\n${warnings} warning(s).`);
if (failures) {
  console.error(`\n${failures} failure(s). Fix .env.local, then run this check again.`);
  process.exitCode = 1;
} else {
  console.log(
    "\nConfiguration checks passed. This does not replace live database or gameplay testing.",
  );
}
