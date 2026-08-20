---
version: alpha
name: RepoMind
description: Light chat shell for asking a public repository and reading cited answers.
colors:
  background: "#FFFFFF"
  foreground: "#1F1F1F"
  muted: "#F0F4F9"
  muted-foreground: "#5F6368"
  accent: "#6750A4"
  accent-foreground: "#FFFFFF"
  border: "#C4C7C5"
  ring: "#6750A4"
  card: "#F0F4F9"
  primary: "#6750A4"
  primary-foreground: "#FFFFFF"
  secondary: "#F0F4F9"
  secondary-foreground: "#1F1F1F"
typography:
  sans:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    lineHeight: 24px
    fontWeight: 400
  mono:
    fontFamily: Geist Mono
  sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    lineHeight: 20px
    fontWeight: 500
  lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    lineHeight: 28px
    fontWeight: 600
  xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    lineHeight: 32px
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    lineHeight: 40px
    fontWeight: 600
rounded:
  base: 1.5rem
  bubble: 1.25rem
  pill: 9999px
spacing:
  base: 0.25rem
  sidebar: 15rem
  sidebar-collapsed: 4.5rem
---

## Overview

RepoMind is a cited chat tool. The product surface is one light page: a sidebar plus a chat session.

## Colors

Put page chrome on `background` and `foreground`. Put soft surfaces (cards, user bubbles, selected recents) on `muted` and `card`. Use `accent` for the greeting word and for the armed Send control. Keep text on those violet fills as `accent-foreground`. Do not put `muted-foreground` on `accent`. Product tokens stay light. Do not add a `prefers-color-scheme: dark` override.

## Typography

Load Plus Jakarta Sans as `--font-sans` and Geist Mono as `--font-mono`. Greeting copy uses the display scale at weight 600. Assistant headings use the lg scale at weight 600. Body and assistant prose use the sans scale at weight 400. Recents, chips, the URL card body, and settings body use the sm scale. Composer text uses the sans scale. Inline code uses Geist Mono on a `muted` fill.

## Layout

`/` is the only chat surface. The sidebar is 240px and persistent from 768px up. A top toggle collapses it to 72px with a width slide. Below 768px the sidebar is a Sheet overlay opened by the menu button. The thread and composer sit in a 48rem column with 24px padding, 40px from the `md` breakpoint, and 64px from `lg`. Cards use 16px padding. Recents rows use a 4px gap. Thread rows use a 16px gap. User bubbles add 16px horizontal padding, 20px from `md`. Interactive controls keep a 44px minimum hit size.

## Shapes

Cards use `{rounded.base}`. The composer uses `{rounded.pill}` on one line and `{rounded.base}` once the field grows past a single line. User bubbles use `{rounded.bubble}`.

## Components

Thread rows come from `Message`, `Bubble`, and `MessageScroller`. User rows use `Bubble` `variant="muted"` and `align="end"`. The assistant row has no `Bubble`. Citation and markdown URLs are underlined text links with `rel="noopener noreferrer"`, no filled pill. Copy is a ghost `Button` whose hover only changes text intensity. Copy writes the rendered plain text, not Markdown. Settings is a `Dialog` titled About. The mobile menu is a `Sheet` titled Menu. Plus is inert and named Add. Send is the only ask entry. An armed Send control uses `accent-foreground` on `accent` so the icon stays visible.

## Do's and Don'ts

- Don't ship Gemini, Upgrade, Extensions, Public links, a model picker, or a microphone control.
- Don't add a second composer or a `/chat` route.
- Don't persist local user bubbles to Postgres or `localStorage`.
- Don't render images or raw HTML from assistant markdown.
- Don't invent user facing copy in JSX. Import it from `lib/placeholder-data.ts`.
