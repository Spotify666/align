// The pages `npm run check:pages` opens. Every page under src/app is either here or in
// NOT_CHECKED with the reason; tests/standards.test.ts holds the two lists to the app.

export const PAGES = [
  "/", "/home", "/check", "/check/pair", "/sample", "/sample/valid_ffd", "/sample/pull", "/sample/valid_ffd/print", "/sessions", "/progress",
  "/profile", "/coach", "/library", "/models", "/models/motion", "/guide", "/science", "/privacy", "/signin", "/design", "/design-system", "/visitors", "/angles",
];

/** Pages the check can't open on its own, and why. Each is covered another way. */
export const NOT_CHECKED = {
  "/analyse": "the same screen as /check (an older address)",
  "/report/[id]": "needs a saved shot; the same report is checked as /sample/valid_ffd and /sample/pull",
  "/report/[id]/print": "needs a saved shot; the same layout is checked as /sample/valid_ffd/print",
  "/sample/[key]": "checked through two of its samples",
  "/sample/[key]/print": "checked through one of its samples",
  "/library/manage": "admins only; checked by hand with the network faked (docs/13, Batch 5)",
  "/models/edit": "needs a model on the device; checked by hand (docs/14)",
  "/design/print": "the PDF's print layout: A4 landscape slides, not a phone screen",
};
