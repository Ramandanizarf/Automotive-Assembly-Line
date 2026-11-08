# MES Dashboard Design Direction

## Product identity
A focused manufacturing operations console for an automotive assembly line. The interface should feel precise, dependable, technical, and calm under operational pressure.

## Visual direction
- **Personality:** industrial, measured, confident, information-dense without feeling crowded.
- **Palette:** deep ink/navy surfaces, charcoal panels, cool neutral text, one electric-blue interaction accent. Green, amber, and red are reserved for operational states.
- **Typography:** system sans-serif for clear operational reading; tabular numerals for KPI values and timestamps.
- **Composition:** asymmetric two-column control-room layout. The 3D line is the primary focal area; production KPIs and station health are the secondary operational summary; event log and work-order controls form the lower working row.
- **Components:** restrained corner radii, fine structural borders, compact section labels, strong value hierarchy, clear button priority.
- **Motion:** subtle and functional only, with reduced-motion support.

## Liveliness dials
- **ENERGY 3/5:** confident blue accents and clear state colors, without decorative glow everywhere.
- **RHYTHM 3/5:** varied section density; the simulation gets the largest footprint, while operational data remains compact.
- **MOTION 1/5:** short transitions only; no ambient or looping decorative animation.

## Decision rationale
- The simulation receives the largest area because it is the primary visual representation of the production line.
- KPI values use tabular numerals so changing values remain easy to scan.
- State colors are limited to machine status and quality outcomes so color retains operational meaning.
- The dark theme is the default because this is an industrial monitoring console, while the existing light-theme toggle remains supported.
- No new navigation, fabricated metrics, logos, people, or external visual assets are introduced.
