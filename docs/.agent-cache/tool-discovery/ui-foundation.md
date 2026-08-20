# UI foundation tool discovery cache

- **Date**: 2026-08-15
- **Method**: skills.sh + web (CLI unavailable in this agent); installed subtracted
- **Declined**: none

## Already installed (do not re-offer)

- vercel-react-best-practices, vercel-composition-patterns, web-design-guidelines
- deploy-to-vercel; also on disk: vercel-react-view-transitions, vercel-react-native-skills
- trigger-*, neon-* (non-UI)

## Skills candidates

### shadcn /ui
| name | owner/repo | note |
|------|------------|------|
| shadcn | shadcn-ui/ui (also shadcn/ui) | Official: CLI, registries, Tailwind v4, Radix/Base presets |
| migrate-radix-to-base | shadcn-ui/ui | Migrate wrappers from Radix → Base UI |
| shadcn-component-discovery | mattbx/shadcn-skills | Discover ecosystem components before building |
| shadcn-component-review | mattbx/shadcn-skills | Review custom components vs shadcn patterns |
| ai-elements | vercel/ai-elements | AI chat UI components on shadcn (optional) |

### lucide
- none found (agent skill)

### tailwind / v4
| name | owner/repo | note |
|------|------------|------|
| tailwind-design-system | wshobson/agents | Tailwind v4 CSS-first tokens, CVA variants, a11y |
| tailwind-css-patterns | giuseppe-trisciuoglio/developer-kit | Utility patterns, responsive, dark mode |

### class-variance-authority / cva
- none dedicated; covered by wshobson/agents/tailwind-design-system

### next.js UI (beyond installed vercel-react-best-practices)
- none found (UI-specific skill)

### react UI / a11y
| name | owner/repo | note |
|------|------------|------|
| fixing-accessibility | ibelick/ui-skills | ARIA, keyboard, focus, WCAG-style fixes |
| frontend-design | anthropics/skills | General frontend design quality (popular) |

### radix / base-ui
| name | owner/repo | note |
|------|------------|------|
| migrate-radix-to-base | shadcn-ui/ui | Same as above under shadcn |

### wcag / axe
- none found named axe; closest: ibelick/ui-skills/fixing-accessibility

## MCP candidates

### shadcn (official)
- **shadcn MCP**: `npx shadcn@latest mcp` (or `pnpm dlx shadcn@latest mcp init --client <client>`)
- Config: `{ "command": "npx", "args": ["shadcn@latest", "mcp"] }` in `.mcp.json` / `.cursor/mcp.json`
- Browse/search/install registry components via natural language
- Docs: https://ui.shadcn.com/docs/mcp

### lucide
- **lucide-icons-mcp** (community, not Lucide org): `npx lucide-icons-mcp --stdio`
- Search icons, categories, React usage examples
- https://github.com/SeeYangZhi/lucide-icons-mcp

### tailwind
- none found official from Tailwind Labs
- community packages exist (e.g. npm `tailwindcss-mcp-server`) — not listed as official
