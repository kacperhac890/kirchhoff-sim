# Product

## Register

product

## Users
New employees, apprentices and students with no prior SAP experience who need to understand how an automotive structural-parts plant runs end to end. They play on a desktop or laptop, usually in a training room or at home, in focused 20–60 minute sessions. The job: perform real (simulated) ERP transactions — goods receipt, production order, confirmation, inspection, delivery — and see what each one changes on the shop floor.

## Product Purpose
KIRCHHOFF Factory Simulator is an educational 3D simulation of a stamping, hot-forming, welding and e-coat plant inspired by publicly known automotive manufacturing processes. One simulation engine drives the 3D factory and the SAP-inspired modules (PP, MM/EWM, QM, PM, SD/TM, procurement). Success: a player finishes Mission 01 and can explain why a goods receipt, a reservation, a confirmation and a usage decision exist — and the factory visibly reacts to every transaction they post. All plant data, IDs and procedures are simulated, not KIRCHHOFF internal data.

## Brand Personality
Precise, calm, industrial. It should feel like sitting at a modern plant control-room console: confident data, quiet chrome, the factory itself as the hero. Explanations speak like a patient senior colleague, never like a marketing page.

## Anti-references
- Outdated corporate intranet / classic SAP GUI grey forms.
- Generic AI admin dashboards: hero-metric cards, identical card grids, gradient text, glass everywhere.
- Toy-like low-effort 3D (floating primitives without proportion, materials or light).
- Emoji icons, decorative buttons that do nothing, placeholder pages.

## Design Principles
1. The factory is the interface. Every transaction has a visible consequence in the 3D plant, and the 3D plant always reflects engine state.
2. Teach through doing. Explanations appear at the moment of the transaction, in context, and say what changed in the system and why it matters.
3. Earned familiarity. Use SAP/Fiori conventions (document numbers, movement types, statuses, T-codes) so the skills transfer to the real job.
4. Impossible states are impossible. Validation messages state cause and fix, like a good ERP should.
5. Density with calm. Dense tables and panels, but a strict hierarchy so the next action is always obvious.

## Accessibility & Inclusion
WCAG 2.2 AA for text and controls. Status is never conveyed by color alone (icon + label). Full keyboard access to ERP modules and the command palette. `prefers-reduced-motion` reduces UI motion and slows 3D ambient animation. Tabular numerals for all data.
