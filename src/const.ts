/** Card version. Must equal `package.json` `version` — `release.yml`
 *  refuses to attach a bundle whose package version differs from the tag,
 *  and `tests/version.test.ts` keeps the two in step between releases. */
export const CARD_VERSION = "0.1.0";

export const CARD_TAG = "orrery-card";
export const CARD_NAME = "Orrery Card";

/** Time range the card lets you travel. astronomy-engine stays accurate far
 *  beyond it; the limit keeps year labels and playback in a sensible window. */
export const MIN_TIME = Date.UTC(1800, 0, 1);
export const MAX_TIME = Date.UTC(2200, 11, 31);

export const DAY_MS = 86_400_000;
