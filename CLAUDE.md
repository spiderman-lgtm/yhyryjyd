# Project instructions

## App design: always use the apple-design skill

Whenever you build, scaffold, redesign, or add UI to any app in this repository (web, mobile,
or desktop, in any framework), design it to Apple's Human Interface Guidelines using the
`apple-design` skill in `.claude/skills/apple-design/`. Do not wait to be asked.

1. **Before writing UI code**, invoke the `apple-design` skill and follow its
   "Design improvement mode": load `references/hig-lookup.md`, then the `references/hig/*.md`
   pages for the components on screen, and `references/cross-platform.md` for the framework in
   use. Plan the token system (color with light and dark variants and contrast ratios, type
   scale, layout, one signature element, motion) before building screens.
2. **While building**, use the platform's system components and conventions (navigation, tab
   bars, sheets, controls, SF Symbols or the framework's equivalent), support light and dark
   mode, Dynamic Type or scalable text, reduced motion, reduced transparency, keyboard focus on
   desktop, and layouts that hold down to the smallest supported width.
3. **Before calling the work done**, run the skill's review process (the five lenses) on what
   you built, fix every Critical and High finding, and give a short summary of the design
   decisions and any remaining findings.

For web apps, apply the same principles with web primitives: a system font stack
(`-apple-system, BlinkMacSystemFont, "SF Pro Text", ...`), `prefers-color-scheme`,
`prefers-reduced-motion`, rem-based type, 44 px minimum touch targets, and WCAG AA contrast.
