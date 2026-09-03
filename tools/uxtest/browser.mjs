import { existsSync } from 'node:fs'

/**
 * Which Chromium the checkers launch, in one place.
 *
 * Three cases, and the order matters:
 *
 *  1. `CHROMIUM_PATH` wins. An operator who knows where their browser is should not have
 *     to edit four files to say so.
 *  2. Otherwise this container's pre-installed build, IF it is actually there. Playwright's
 *     own default resolution does not find it - it looks for a headless-shell build that is
 *     not installed here - so returning `undefined` unconditionally breaks every checker in
 *     the environment they normally run in.
 *  3. Otherwise `undefined`, which is what tells Playwright to use the browser it
 *     downloaded. That is the clean-clone case, and it was the one that did not work: the
 *     path in case 2 was hardcoded into all four files, so three of the four checkers
 *     could not run anywhere but here.
 *
 * Existence-checked rather than assumed, because the failure of a wrong path is a launch
 * error thirty lines into a checker rather than a clear message.
 */
const IN_CONTAINER = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

export function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  return existsSync(IN_CONTAINER) ? IN_CONTAINER : undefined
}
