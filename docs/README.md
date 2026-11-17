# Govi Isuru documentation (v2)

These docs cover the whole system: the **web app** (`govi-isuru-web`), this **API** (`govi-isuru-api`) and the
**AI service** (`govi-isuru-ai-service`). They are carried over from the v1 monorepo and updated where v2 changed
something.

| Document | Contents |
|---|---|
| [FEATURE_WORKFLOWS.md](FEATURE_WORKFLOWS.md) | End-to-end workflows: disease report to community alert, marketplace, consultations, AI Doctor, unknown-disease review, notifications, admin |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | MongoDB collections, fields, relationships, indexes (including `UnknownCase`) |
| [diagrams/](diagrams/) | Mermaid diagrams. Open any `.mmd` file in [mermaid.live](https://mermaid.live) or a Mermaid preview in your editor |
| AI service | `govi-isuru-ai-service/docs/`: ARCHITECTURE, DATASETS, RESEARCH, INTEGRATION, `openapi.json` |

## Diagrams

| # | Diagram | v2 |
|---|---|---|
| 01 | [High-level system architecture](diagrams/01-high-level-system-architecture.mmd) | **updated:** 3 repos, Next.js, new AI tier |
| 01 | [MongoDB collections](diagrams/01-mongodb-collections-architecture.mmd) | unchanged |
| 01-1 | [Disease detection to community alert](diagrams/01-1-complete-disease-detection-to-community-alert-fl.mmd) | unchanged |
| 02 | [Role-based architecture](diagrams/02--user-role-based-system-architecture.mmd) | unchanged |
| 02 | [Data relationships](diagrams/02-data-relationships-diagram.mmd) | unchanged |
| 02-2 | [Marketplace transaction](diagrams/02-2-marketplace-transaction-complete-workflow.mmd) | unchanged |
| 03 | [Registration and authentication](diagrams/03--user-registration-authentication-flow.mmd) | unchanged |
| 03-3 | [Officer consultation booking](diagrams/03-3-officer-consultation-booking-complete-workflow.mmd) | unchanged |
| 04 | [AI disease detection pipeline](diagrams/04--ai-disease-detection-prediction-pipeline.mmd) | **rewritten:** crop gate, open-set statuses |
| 04-4 | [AI Doctor request flow](diagrams/04-4-ai-doctor-system---complete-request-flow.mmd) | **rewritten:** refunds, unknown cases, outbreak alerts |
| 05 | [Crop suitability](diagrams/05--crop-suitability-analysis-flow.mmd) | **rewritten:** FAO EcoCrop + ERA5 climate |
| 05-5 | [Hub navigation matrix](diagrams/05-5-hub-navigation-feature-access-matrix.mmd) | unchanged |
| 06 | [Yield prediction](diagrams/06--yield-prediction-workflow.mmd) | **rewritten:** official DCS statistics |
| 06-6 | [Notifications](diagrams/06-6-real-time-notification-system.mmd) | unchanged |
| 07 | [Four farmer hubs](diagrams/07--four-farmer-hubs-integration.mmd) | unchanged |
| 07-7 | [Admin user lifecycle](diagrams/07-7-admin-dashboard---user-lifecycle-management.mmd) | unchanged |
| 08 | [Crowdsourced disease alerts](diagrams/08--disease-alert-crowdsourced-warning-system.mmd) | unchanged |
| 09 | [Credits](diagrams/09--credit-system-subscription-flow.mmd) | unchanged |
| 10 | [Reputation and feedback](diagrams/10--reputation-feedback-system.mmd) | unchanged |
| 11 | [Data flow web → API → AI](diagrams/11--data-flow-frontend-backend-ai-service.mmd) | **rewritten** |
| 12 | [Officer approves a disease alert](diagrams/12--event-workflow-officer-approves-new-disease-alert.mmd) | unchanged |
| 13 | [Marketplace transaction flow](diagrams/13--marketplace-transaction-flow.mmd) | unchanged |
| 14 | [Analytics dashboard](diagrams/14--analytics-reporting-dashboard.mmd) | unchanged |
| 15 | [Security and permissions](diagrams/15--security-permission-control-flow.mmd) | unchanged; v2 adds rate limits and helmet headers |
| 16 | [Deployment](diagrams/16--docker-deployment-container-architecture.mmd) | **rewritten:** Vercel + Render + Atlas |
| 17 | [Mobile responsiveness](diagrams/17--mobile-responsiveness-adaptive-ui.mmd) | unchanged |
| 18 | [Unknown-disease officer review](diagrams/18--unknown-disease-officer-review.mmd) | **new** |

## What changed from v1

* **Repositories:** the monorepo is split into `govi-isuru-web` (Next.js), `govi-isuru-api` (Express) and
  `govi-isuru-ai-service` (FastAPI + ONNX). Deployment uses Vercel, Render and MongoDB Atlas instead of EC2 or
  DigitalOcean.
* **AI Doctor:** a new model with seven answer types (known, low confidence, unknown, wrong crop, unsupported plant,
  not a plant, bad photo), credit refunds, and officer review of unknown diseases with outbreak notifications.
* **Real data:** yield uses official DCS statistics instead of mock numbers, and suitability uses FAO EcoCrop with
  ERA5 climate instead of hand-set weights.
* **Performance and safety:**
  * screens load on demand
  * WebP images
  * gzip
  * caching
  * paged listings
  * rate limits
  * no hard-coded secrets
