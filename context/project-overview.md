# ADJUJA

## Overview

ADJUJA is a copilot for Moroccan companies that respond to public tenders (marches
publics) and simpler public purchase orders (bons de commande). It replaces the
manual cycle of watching portals by hand, deciding blind whether a tender is worth
pursuing, and drafting response documents from scratch. It does not replace the
professional's judgment, it assists and accelerates the repetitive parts.

The full technical architecture is `conception/2. Architecture/architecture.md` and
`context/architecture-context.md` (condensed reference for implementation). Roadmap
is `conception/1.Roadmap/roadmap_technique.md`. This file is a working summary of
scope and user flow, those are the source of truth for depth.

## Goals

1. Surface relevant tenders automatically instead of a human checking portals daily.
2. Give a fast, defensible Go/No-Go signal before a company invests time drafting a
   response.
3. Generate a real first draft of the response documents (methodology note,
   technical offer, filled administrative forms), grounded in the company's own
   references and the tender's actual requirements, not a generic template.
4. Keep every legal/regulatory claim the product makes (deadlines, eligibility
   rules) traceable to a real source document, never invented.

## Core User Flow

1. User signs in (email/password or Google), lands on the dashboard.
2. Veille tab shows tenders scraped from public portals (marchespublics.gov.ma and
   others running the same platform), filterable by sector/region/category.
3. User favorites a tender they might respond to -- this triggers automatic
   document download (DCE) from the source portal.
4. User runs Go/No-Go analysis: the CPS/RC get read against the company's profile,
   a Go/Risque/No-Go verdict comes back with reasons.
5. On Go, user imports the tender into the main pipeline, generates a methodology
   note or technical offer, fills administrative forms, signs, exports.
6. Separately, user can ask the chat assistant questions about their own tenders,
   Moroccan procurement law, or how ADJUJA itself works.

## Features

- **Veille**: two independent scraped sources (AO -- full tenders, BDC -- simpler
  purchase orders), sector/category/region filtering, favorite-triggers-download,
  daily cleanup of expired never-actioned entries.
- **Go/No-Go**: eligibility analysis reading CPS/RC against the company's
  qualifications, certifications, references.
- **Generation**: methodology note (8 fixed sections), separate "offre technique"
  module for intellectual-service tenders, both enrichable by the company's own
  uploaded reference documents via RAG.
- **Tools**: automatic form filling from a template document, electronic
  signature/stamp on exported documents.
- **Company profile**: legal identity, qualifications, certifications, past
  references, team members with CVs.
- **Billing**: four plans (Free/Essentiel/Pro/Cabinet), self-serve checkout via CMI
  for the three paid tiers.
- **Notifications**: daily email digest of new tenders matching an org's followed
  sectors.
- **Chatbot**: conversational assistant, grounded via RAG in the company's own
  documents plus (once `context/feature-spec/chatbot/` ships) Moroccan procurement
  law and ADJUJA's own feature set.

## Scope

### In Scope, current

Everything under Features above. Self-serve billing for all three paid tiers.
Single-region focus: Morocco, French primary language (English also supported via
i18n).

### Out of Scope, current

- Multi-country procurement portals (Morocco only).
- Real-time collaborative editing of generated documents (single-editor model
  today).
- A fully automated submission flow (the product stops at "documents ready to
  submit," submission itself stays a human action on the source portal).
- Native mobile app.

## Success Criteria

1. A user can go from "tender published on a public portal" to "documents ready to
   submit" without ever leaving ADJUJA or re-typing information already on file.
2. A Go/No-Go verdict is available before a user has read the full CPS themselves.
3. A generated methodology note or technical offer references the company's real
   qualifications and past references, not generic placeholder content.
4. Billing enforcement (plan limits) is real, not marketing copy: exceeding a limit
   returns a clear, actionable error, not a silent failure.
