import fs from "node:fs";
import path from "node:path";

/**
 * THIS IS THE FILE YOU EDIT TO MAKE KAIRO YOURS.
 *
 * Your real details go in two gitignored places instead of here, so that
 * `git push` to a public repo never leaks them:
 *
 *   - OWNER_NAME in .env.local
 *   - src/lib/persona/profile.local.md (copy the template below into it)
 *
 * This file itself stays a generic template, safe to commit and safe to make
 * public. If profile.local.md is missing, PROFILE falls back to the
 * placeholder text below - which is how a fresh clone behaves before setup.
 *
 * Everything in profile.local.md is written into the system prompt on every
 * request. The model has no memory between conversations, so that file *is*
 * its knowledge of you. Be specific. Vague profiles produce vague assistants.
 */

export const OWNER_NAME = process.env.OWNER_NAME?.trim() || "the owner";

const LOCAL_PROFILE_PATH = path.join(process.cwd(), "src/lib/persona/profile.local.md");

const PLACEHOLDER_PROFILE = `
## Who I am
- Name: (your name)
- Role: (your job title and employer)
- Based in: (city, country)
- Currently focused on: (what you're up to right now)

## Background
- Education, past roles, whatever is worth the model knowing

## Skills and tools
- Languages, frameworks, platforms

## How I like to work
- (e.g. "I prefer concrete examples over theory", "I like being told when I'm wrong")

## Current projects
- (what you're building or working through right now)

## Things I care about
- (topics, values, priorities worth reflecting in tone)

## Boundaries - do not share these publicly
- (anything the assistant should never volunteer: salary, address, private contacts, family information)
`.trim();

function loadProfile(): string {
  try {
    return fs.readFileSync(LOCAL_PROFILE_PATH, "utf8").trim();
  } catch {
    return PLACEHOLDER_PROFILE;
  }
}

export const PROFILE = loadProfile();
