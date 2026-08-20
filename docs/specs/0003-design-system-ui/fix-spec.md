## Summary

This document lists UI issues found in the design system and provides clear. For each issue we include: current behaviour, expected behaviour, screenshot reference, suggested implementation, and acceptance criteria.

Scope: visual and interaction fixes for the chat UI, sidebar, links, copy behavior, and input controls.

Usage: implement each item below and verify acceptance criteria with screenshots or automated visual checks.

---

### Issue 1 — Sidebar width and toggle

- Current behavior: Sidebar is too wide and does not support a compact toggle.
- Expected behavior: Reduce sidebar width to a compact breakpoint and add a toggle icon at the top to collapse/expand the sidebar with a slide animation.
- Screenshot: C:\Users\DELL\Pictures\Screenshots\Screenshot 2026-08-16 220748.png
- Suggested implementation: update sidebar CSS (width, max-width at responsive breakpoints), add a top-left toggle button that toggles a collapsed CSS class and animates transform/translateX.
- Acceptance criteria: Sidebar collapses to a compact width, toggle appears at the top, slide animation runs smoothly, and layout remains responsive.

### Issue 2 — Chat padding and content spacing

- Current behavior: Chat messages and responses lack sufficient horizontal padding, causing cramped layout.
- Expected behavior: Increase horizontal padding inside message bubbles and the chat container at medium and larger breakpoints.
- Screenshots: C:\Users\DELL\Pictures\Screenshots\Screenshot 2026-08-16 221231.png (current), C:\Users\DELL\Pictures\Screenshots\Screenshot 2026-08-16 223005.png (target)
- Suggested implementation: adjust padding utilities (e.g., Tailwind `px-4` -> `px-6` at md+), ensure message-scroller and container use consistent spacing tokens.
- Acceptance criteria: Messages match the target spacing in the reference screenshot and do not overlap the viewport on small screens.

### Issue 3 — Inline link styling

- Current behavior: Links use a filled background and `rounded-full`, which is visually heavy.
- Expected behavior: Use a simple underline for URLs (no filled background), retaining accessible color contrast and hover states.
- Screenshot: C:\Users\DELL\Pictures\Screenshots\Screenshot 2026-08-16 221512.png
- Suggested implementation: replace the filled link style with just `underline`; keep focus outline for accessibility.
- Acceptance criteria: Links render with underline only, tab-focus is visible, and color contrast passes AA.

### Issue 4 — Copy button behavior (copy response text)

- Current behavior: Copy action copies raw Markdown and the copy hover shows a background highlight.
- Expected behavior: Copy action should copy only the rendered plain text of the visible response (no Markdown), and the copy button hover should only change text intensity (no background rectangle).
- Suggested implementation: when copying, strip Markdown (or render to plain text) and use a hover style that reduces/increases font weight or opacity rather than adding a background color.
- Acceptance criteria: Pasting the copied content yields plain text without Markdown; hover on copy button shows no background, only subtle text intensity change.

### Issue 5 — Send button / input state contrast

- Current behavior: The send button changes background color when typing, but the send icon's foreground color is not adjusted and becomes visually buried.
- Expected behavior: When active, the send icon must receive sufficient contrast (e.g., switch to white on dark bg) so the icon remains visible.
- Screenshot: C:\Users\DELL\Pictures\Screenshots\Screenshot 2026-08-16 222135.png
- Suggested implementation: update active state CSS to set icon `fill`/`color` to contrast color when background changes.
- Acceptance criteria: Icon contrast meets WCAG AA against active button background.

### Issue 6 — Input rounding on long text

- Current behavior: Input grows and becomes fully rounded (`rounded-full`) with lots of text, which spoils layout.
- Expected behavior: Use a capped border-radius (e.g., `rounded-lg`) once input exceeds single-line height and wrap text properly; preserve a clean edge on multi-line content.
- Screenshots: current: C:\Users\DELL\Pictures\Screenshots\Screenshot 2026-08-16 222517.png, target: C:\Users\DELL\Pictures\Screenshots\Screenshot 2026-08-16 222322.png
- Suggested implementation: change input container styles to use `rounded-lg` instead of `rounded-full`, set `max-height` and enable vertical scrolling if necessary.
- Acceptance criteria: Long input content displays with `rounded-lg`, does not overflow layout, and matches target appearance.
