#!/usr/bin/env node
/**
 * Kairo setup doctor.
 *
 *   npm run check          verify your provider + key actually work
 *   npm run check -- --models   list the model IDs your key can use
 *
 * Runs one small real request so you find out now, not from a broken chat UI.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const RESET = "\x1b[0m", RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", DIM = "\x1b[2m", BOLD = "\x1b[1m";
const ok = (m) => console.log(`${GREEN}  ✓${RESET} ${m}`);
const bad = (m) => console.log(`${RED}  ✗${RESET} ${m}`);
const info = (m) => console.log(`${DIM}    ${m}${RESET}`);

// --- Minimal .env parser (Next.js does this for you at runtime; a plain
// --- node script does not, so we do it by hand.) ------------------------
function loadEnvFile(path) {
  if (!existsSync(path)) return null;
  const env = {};
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const envPath = resolve(process.cwd(), ".env.local");
const env = loadEnvFile(envPath);

console.log(`\n${BOLD}Kairo setup check${RESET}\n`);

if (!env) {
  bad(".env.local not found");
  info("Run:  cp .env.example .env.local");
  info("Then open it and fill in LLM_PROVIDER and one API key.");
  process.exit(1);
}
ok(".env.local found");

const PROVIDERS = {
  anthropic: {
    keyVar: "ANTHROPIC_API_KEY",
    keyPrefix: "sk-ant-",
    signup: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-sonnet-4-5",
    modelsUrl: "https://api.anthropic.com/v1/models",
  },
  openai: {
    keyVar: "OPENAI_API_KEY",
    keyPrefix: "sk-",
    signup: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-4o-mini",
    modelsUrl: "https://api.openai.com/v1/models",
  },
  groq: {
    keyVar: "GROQ_API_KEY",
    keyPrefix: "gsk_",
    signup: "https://console.groq.com/keys",
    defaultModel: "llama-3.3-70b-versatile",
    modelsUrl: "https://api.groq.com/openai/v1/models",
  },
  ollama: {
    keyVar: null,
    signup: "https://ollama.com/download",
    defaultModel: "llama3.2",
    modelsUrl: () => `${(env.OLLAMA_BASE_URL || "http://localhost:11434/v1").replace(/\/$/, "")}/models`,
  },
};

const providerName = (env.LLM_PROVIDER || "").trim().toLowerCase();
if (!providerName) {
  bad("LLM_PROVIDER is empty");
  info(`Set it to one of: ${Object.keys(PROVIDERS).join(", ")}`);
  process.exit(1);
}
const provider = PROVIDERS[providerName];
if (!provider) {
  bad(`Unknown LLM_PROVIDER "${providerName}"`);
  info(`Valid values: ${Object.keys(PROVIDERS).join(", ")}`);
  process.exit(1);
}
ok(`Provider: ${BOLD}${providerName}${RESET}`);

let apiKey = null;
if (provider.keyVar) {
  apiKey = (env[provider.keyVar] || "").trim();
  if (!apiKey) {
    bad(`${provider.keyVar} is empty`);
    info(`Get a key here: ${provider.signup}`);
    info(`Then put it in .env.local as:  ${provider.keyVar}=your-key-here`);
    process.exit(1);
  }
  if (provider.keyPrefix && !apiKey.startsWith(provider.keyPrefix)) {
    console.log(`${YELLOW}  !${RESET} Key does not start with "${provider.keyPrefix}" — double-check you copied the right one`);
  }
  const masked = apiKey.slice(0, 8) + "…" + apiKey.slice(-4);
  ok(`${provider.keyVar} present (${masked})`);
} else {
  ok("No API key needed for this provider");
}

const model = (env.LLM_MODEL || "").trim() || provider.defaultModel;
ok(`Model: ${BOLD}${model}${RESET}${env.LLM_MODEL?.trim() ? "" : `  ${DIM}(default)${RESET}`}`);

const authHeaders =
  providerName === "anthropic"
    ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    : { authorization: `Bearer ${apiKey ?? "local"}` };

// --- --models: list what this key can actually call ---------------------
if (process.argv.includes("--models")) {
  const url = typeof provider.modelsUrl === "function" ? provider.modelsUrl() : provider.modelsUrl;
  console.log(`\n${BOLD}Available models${RESET}`);
  try {
    const res = await fetch(url, { headers: authHeaders });
    if (!res.ok) {
      bad(`${res.status} ${res.statusText}`);
      info((await res.text()).slice(0, 300));
      process.exit(1);
    }
    const json = await res.json();
    const ids = (json.data ?? json.models ?? []).map((m) => m.id ?? m.name).filter(Boolean).sort();
    for (const id of ids) console.log(`    ${id}`);
    console.log(`\n${DIM}    Put any of these in .env.local as LLM_MODEL=...${RESET}\n`);
  } catch (error) {
    bad(`Could not reach ${url}`);
    info(String(error.message ?? error));
    process.exit(1);
  }
  process.exit(0);
}

// --- One real request ---------------------------------------------------
console.log(`\n${BOLD}Calling the model…${RESET}`);

const isAnthropic = providerName === "anthropic";
const url = isAnthropic
  ? "https://api.anthropic.com/v1/messages"
  : `${
      providerName === "openai"
        ? "https://api.openai.com/v1"
        : providerName === "groq"
          ? "https://api.groq.com/openai/v1"
          : (env.OLLAMA_BASE_URL || "http://localhost:11434/v1").replace(/\/$/, "")
    }/chat/completions`;

const body = isAnthropic
  ? { model, max_tokens: 32, messages: [{ role: "user", content: "Reply with exactly: Kairo is connected." }] }
  : { model, max_tokens: 32, messages: [{ role: "user", content: "Reply with exactly: Kairo is connected." }] };

try {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders },
    body: JSON.stringify(body),
  });

  const text = await res.text();

  if (!res.ok) {
    bad(`${res.status} ${res.statusText}`);
    let detail = text.slice(0, 400);
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.error?.message ?? parsed?.message ?? detail;
    } catch {}
    info(detail);
    console.log("");
    if (res.status === 401 || res.status === 403) {
      console.log(`${YELLOW}  What this means:${RESET} the key is wrong, revoked, or has no permissions.`);
      console.log(`  Make a fresh one at ${provider.signup} and paste the whole string.`);
    } else if (res.status === 404) {
      console.log(`${YELLOW}  What this means:${RESET} the model ID "${model}" is not available to you.`);
      console.log(`  Run:  npm run check -- --models     to see what is.`);
    } else if (res.status === 429) {
      console.log(`${YELLOW}  What this means:${RESET} rate limited, or you are out of credit.`);
      console.log(`  Wait a minute, or top up at ${provider.signup}`);
    } else if (res.status === 400) {
      console.log(`${YELLOW}  What this means:${RESET} the request was rejected — usually a bad model ID.`);
      console.log(`  Run:  npm run check -- --models`);
    }
    console.log("");
    process.exit(1);
  }

  const json = JSON.parse(text);
  const reply = isAnthropic
    ? json.content?.map((block) => block.text).join("")
    : json.choices?.[0]?.message?.content;

  ok(`Model replied: "${(reply ?? "").trim()}"`);

  const usage = json.usage;
  if (usage) {
    const inTok = usage.input_tokens ?? usage.prompt_tokens;
    const outTok = usage.output_tokens ?? usage.completion_tokens;
    info(`Tokens used: ${inTok} in, ${outTok} out`);
  }

  console.log(`\n${GREEN}${BOLD}  Everything works.${RESET}  Run ${BOLD}npm run dev${RESET} and open http://localhost:3000\n`);
} catch (error) {
  bad(`Could not reach ${url}`);
  info(String(error.message ?? error));
  if (providerName === "ollama") {
    console.log(`\n${YELLOW}  What this means:${RESET} Ollama is not running.`);
    console.log(`  Start it with:  ollama serve`);
    console.log(`  And make sure you have pulled the model:  ollama pull ${model}\n`);
  } else {
    console.log(`\n${YELLOW}  What this means:${RESET} a network problem, or the URL is unreachable.\n`);
  }
  process.exit(1);
}
