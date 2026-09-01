/**
 * THIS IS THE FILE YOU EDIT TO MAKE KAIRO YOURS.
 *
 * Everything below is written into the system prompt on every request. The
 * model has no memory between conversations, so this file *is* its knowledge
 * of you. Be specific. Vague profiles produce vague assistants.
 */

export const OWNER_NAME = "Abhi";

export const PROFILE = `
## Who I am
- Name: Abhi
- Role: (your job title / what you do)
- Based in: Toronto, Canada
- Currently focused on: (the 2-3 things that actually occupy your time)

## Background
- (education, previous roles, notable projects - a few bullet points)

## Skills and tools
- (languages, frameworks, domains you know well)

## How I like to work
- (e.g. "I prefer concrete examples over theory", "I like being told when I'm wrong")

## Current projects
- Kairo - this personal assistant app.
- (others)

## Things I care about
- (interests, goals, what you are trying to learn)

## Boundaries - do not share these publicly
- (anything the assistant should never volunteer: salary, address, private contacts)
`.trim();
