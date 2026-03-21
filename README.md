# Hangry Home

![Hangry Home demo](docs/hangry-home-demo.gif)

Hangry Home is a work-in-progress meal planning app that generates recipes, lets you customize ingredients, and produces printable recipe cards. It includes a React client with an Apollo/Prisma GraphQL server, supports live updates via SSE, and is intended to automate grocery cart additions via Instacart where configured.

## Dependencies

Local:
- Node.js 20+ and npm
- PostgreSQL (required by Prisma schema)
- Optional: MQTT broker if using the AgentQ job queue provider

Infrastructure (Kubernetes):
- Kubernetes cluster with Ingress controller
- Container registry (for client/server images)
- PostgreSQL database (recommended for multi-user deployments)
- Optional: MQTT broker (AgentQ job queue provider)

## Local setup

1) Install dependencies

```sh
cd server && npm install
cd ../client && npm install
```

2) Configure server environment

```sh
cp server/.env.example server/.env
```

Update `server/.env` as needed (database URL, job queue settings).

3) Initialize the database

```sh
cd server && npm run db:push && npm run db:generate
```

4) Run in development

```sh
cd server && npm run dev
cd ../client && npm run dev
```

The client expects the API at `http://localhost:4000` and SSE at `http://localhost:4001` by default.

## Kubernetes setup

1) Configure non-secret settings

```sh
cp k8s/config.env.example k8s/config.env
```

Edit `k8s/config.env` to set:
- `INGRESS_HOST`
- `CLIENT_IMAGE` / `SERVER_IMAGE`
- CORS and job queue settings

2) Configure secrets

```sh
cp k8s/secret.example.yaml k8s/secret.yaml
```

Edit `k8s/secret.yaml` with your `DATABASE_URL`.

3) Apply resources

```sh
kubectl apply -f k8s/secret.yaml
kubectl apply -k k8s
```

Or run the helper script:

```sh
./k8s/deploy.sh
```

## Notes

- The client is built with Vite and serves static assets via nginx.
- Server runs Apollo Server with Prisma; SSE streams are served separately.
- Tests are not configured yet. `npm run test` in `server/` currently exits with an error.

## AgentQueue backend

Hangry Home can use AgentQueue as its job queue provider. AgentQueue is available at:

- https://github.com/franciswertz/agentqueue

Recipe (local AgentQueue backend):

1) Run AgentQueue locally

```sh
git clone https://github.com/franciswertz/agentqueue
cd agentqueue
cp .env.example .env
docker compose up --build
```

2) Point Hangry Home to AgentQueue

In `server/.env`, set the job queue provider and MQTT/AgentQueue settings:

```env
JOB_QUEUE_PROVIDER=agentq
AGENTQ_APP_ID=hangry
AGENTQ_PROVIDER=openai
AGENTQ_MODEL=gpt-5.1-codex-mini
AGENTQ_TEMPERATURE=0.2
MQTT_BROKER_URL=tcp://localhost:1883
MQTT_ENQUEUE_TOPIC=jobs/enqueue/{app_id}
MQTT_COMPLETE_TOPIC=jobs/complete/{app_id}
MQTT_QOS=1
STATUS_BASE_URL=http://localhost:8080
```

3) Start Hangry Home

```sh
cd server && npm run dev
```
