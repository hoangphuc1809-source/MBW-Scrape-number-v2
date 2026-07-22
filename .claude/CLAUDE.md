# Project Instructions for Claude Code

## Available Skills

This workspace has the `popular-web-designs` skill installed at `.claude/skills/popular-web-designs/`.

### When to use it
- User asks to build/design a website, landing page, dashboard, or UI
- User mentions a specific brand style: Stripe, Linear, Vercel, Apple, Notion, etc.
- User wants HTML/CSS that matches a real design system

### How it works
1. Load the skill: `skill_view(name="popular-web-designs")` to see the full catalog
2. Pick a template from the catalog (54 designs available)
3. Load a specific template: `skill_view(name="popular-web-designs", file_path="templates/<site>.md")`
4. Use the design tokens, color palette, typography, and component specs to generate HTML/CSS
5. Write the HTML file and verify visually with `browser_vision`

### Quick catalog hints
- **Developer tools/dashboards:** Linear, Vercel, Supabase, Raycast, Sentry
- **Marketing/landing:** Stripe, Framer, Apple, SpaceX
- **Dark mode UIs:** Linear, Cursor, ElevenLabs, Warp
- **Light/clean:** Vercel, Stripe, Notion, Cal.com
- **Premium/luxury:** Apple, BMW, Stripe, Superhuman

## Other Rules
- Always verify generated HTML visually with `browser_vision` before reporting done
- Use the exact CSS values, colors, and fonts from the chosen template
- Do not invent design tokens; stick to the template specs
