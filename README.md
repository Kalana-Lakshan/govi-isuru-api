# govi-isuru-api

Backend for **Govi Isuru**, a smart-farming platform for Sri Lankan farmers. It's a REST API (Express 5, MongoDB) used by the
web app ([govi-isuru-web](https://github.com/Kalana-Lakshan/govi-isuru-web)), and it is the only client of the AI service
([govi-isuru-ai-service](https://github.com/Kalana-Lakshan/govi-isuru-ai-service)).

```
browser ──> govi-isuru-web (Next.js, Vercel) ──> govi-isuru-api (this repo) ──> govi-isuru-ai-service (FastAPI + ONNX)
                                                        │
                                                        └──> MongoDB Atlas
```

## Features

| Area | Routes |
|---|---|
| Accounts | `/api/auth/*`: register, login, email verification, password reset, refresh tokens; roles `farmer`, `buyer`, `officer`, `moderator`, `admin` |
| AI Doctor | `POST /api/ai/predict/:crop` (photo, 25 credits; refunded when no diagnosis is possible), `GET /api/ai/classes`, `GET /api/ai/status` |
| New-disease review (officers) | `GET /api/ai/unknown-cases`, `POST /api/ai/unknown-cases/cluster`, `/confirm`, `/dismiss` |
| Paddy yield (official DCS data) | `/api/yield/districts`, `/predict`, `/profit`, `/trends`, `/warning`, `/rankings` |
| Crop suitability (FAO EcoCrop) | `POST /api/suitability/recommend` |
| Disease reports and alerts | `/api/reports/*`, `/api/alerts/*`, `/api/analytics/*` |
| Officers | `/api/officer/*`, `/api/officer-workflow/*` (field visits, internal notes, performance) |
| Marketplace | `/api/listings`, `/api/saved-listings/*`, `/api/reputation/*` |
| Consultations | `/api/manual-bookings/*` (booking workflow, Daily.co video) |
| Assistant | `/api/chatbot/*`, `/api/llama-chatbot/*` |
| Unknown-disease alerts | officers get a notification when 3+ unidentified photos of one crop come from their district within 7 days |
| Other | `/api/news/*`, `/api/weather/*`, `/api/credits/*`, `/api/admin/*`, `/health` |

### AI Doctor responses

`/api/ai/predict/:crop` returns the AI service's `status`, plus a farmer-readable `message`:

| status | what the app shows |
|---|---|
| `KNOWN_DISEASE` | the diagnosis (`prediction`, `si_name`, `confidence`), heatmap (`gradcam.overlay`) and `treatment` |
| `LOW_CONFIDENCE` | possible causes (`all_predictions`); suggest an officer |
| `UNKNOWN_DISEASE` | "sent to an officer". The case is stored (`case_id`) for officer review |
| `WRONG_CROP` | the photo is a `detected_crop`; offer to diagnose it as that crop |
| `UNSUPPORTED_PLANT`, `NOT_A_PLANT` | ask for a rice / tea / chili leaf |
| `BAD_PHOTO` | `advice` for retaking the photo |

`dev_model: true` means the AI service is running its development bundle (random weights). Never show those diagnoses to
farmers.

### New-disease workflow

1. Farmers' unknown photos are stored as `UnknownCase` documents, together with the AI embedding.
2. An officer calls `/api/ai/unknown-cases/cluster` to see similar cases grouped, with the districts involved.
3. `/confirm` with a snake_case name registers the disease in the AI service at once. From then on, matching photos are
   diagnosed as that disease. `/dismiss` closes cases that are not a disease.

## Run locally

**Whole system in one command.** Put the three repos side by side, then:

```bash
.\scripts\start-local.ps1            # Windows: AI service, API and web, each in its own window
./scripts/start-local.sh             # Linux/macOS
.\scripts\start-local.ps1 -Docker    # MongoDB + AI service + API in Docker, web with npm
```

The script creates `.env` files when they're missing. Without a trained model it builds the AI service's development
bundle: diagnoses are random and flagged `dev_model`, while yield and suitability use real data.

**API only:**

```bash
cp .env.example .env        # fill MONGO_URI, JWT_SECRET, REFRESH_TOKEN_SECRET, AI_SERVICE_URL, AI_SERVICE_KEY
npm install
npm run dev                 # http://localhost:5000
npm test
```

To run the full stack, start MongoDB, the AI service and the API with `docker compose up --build`. This needs
`../govi-isuru-ai-service` checked out with its `bundle/`.

## Deploy (low cost)

* **API:** Render free web service from `render.yaml` (Docker). Set `MONGO_URI`, `CORS_ORIGINS` (the Vercel URL),
  `AI_SERVICE_URL` and `AI_SERVICE_KEY`. Render generates the JWT secrets.
* **AI service:** a second Render web service from the AI repo's `service/Dockerfile`, with `GOVI_API_KEY` set to the
  same value as `AI_SERVICE_KEY`.
* **Database:** MongoDB Atlas free tier (M0). Allow Render's outbound IPs, or `0.0.0.0/0` with a strong password.
* **Uploads:** stored in `UPLOADS_DIR`. On Render's free tier the disk is temporary, so mount a disk or move uploads to
  object storage before production use.

In production the server refuses to start without `JWT_SECRET` and `REFRESH_TOKEN_SECRET`, each at least 16 characters.

## Documentation

System docs and diagrams for all three repos, carried over from v1 and updated: [docs/](docs/README.md).

## Layout

```
src/
  index.js        app setup, route mounting, marketplace routes
  config.js       environment and secrets (one place)
  routes/         HTTP routes
  services/       business logic; aiClient.js talks to the AI service, aiPresenter.js shapes its answers
  models/         Mongoose schemas
  domain/         booking state machine
  middleware/     auth and credits
test/             node:test suites (a fake AI service; no database needed)
scripts/          seeding and migrations
```

## Performance and protection

* Responses are gzip-compressed. Uploaded images are served with a 7-day browser cache.
* Marketplace listings are paged (`?page=&limit=`, at most 200; the total is in `X-Total-Count`) and read with
  lean queries.
* Weather lookups are cached per ~1 km area: 10 minutes for current weather, 30 minutes for forecasts. AI news
  summaries are cached with a size limit. Yield history and AI class lists are cached too.
* Rate limits per IP:

  | Routes | Limit |
  |---|---|
  | All API routes | 900 requests per 15 minutes |
  | Sign-in, register, forgot password | 30 requests per 15 minutes |
  | AI, yield and suitability | 40 requests per 10 minutes |

* Security headers are set with `helmet`.
* On shutdown the server finishes in-flight requests and closes the database cleanly.
* District names are matched across data sources (`src/utils/districts.js`).
