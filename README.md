# CARROM CLASH — Modern Precision Arena

Standalone HTML/CSS/JavaScript carrom game. No Node.js, npm, API key, backend or external assets required.

## Modes
- VS Computer
- 2 Player Pass & Play
- 4 Player Pass & Play

## Controls
Touch/click the glowing striker, drag **toward** the target, and release. Drag distance controls power. This is intentionally forward-aiming so a straight drag from the striker toward the center sends the striker toward the center.

## Audio
Uses the browser Web Audio API. No API key. Browser autoplay restrictions mean audio is unlocked on the first user interaction.

## Deploy
Put `index.html`, `css/`, `js/` and `assets/` at the repository root. GitHub Pages can serve it directly.

## QA checklist
- [x] No external JS dependency
- [x] Mobile-first responsive CSS
- [x] Pointer/touch aiming
- [x] Forward aiming direction
- [x] Physics/collision loop
- [x] Pocket detection
- [x] Timer and turn state
- [x] AI mode
- [x] 2P/4P local modes
- [x] Web Audio sound effects
- [x] Winner animation/confetti
- [x] Reduced-motion support
- [x] LocalStorage stats
