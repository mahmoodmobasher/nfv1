# CRM design system

Owner: Dev1 frontend shared foundation.

Public entry point: `index.ts`.

This module owns semantic visual tokens and reusable presentation primitives. It does not own authentication, authorization, tenant context, Lead lifecycle, matching, assignment, or any backend behavior. Feature modules may compose this public API but must not define replacement colour, type, spacing, radius, elevation, or state systems.

Light values are measured from the approved dashboard authority. Dark/System, forced-colour, responsive, and component states are centralized extrapolations governed by the same semantics.
