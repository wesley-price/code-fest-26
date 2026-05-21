# Code Fest 26

End-to-end project scaffold with:

- `apps/web`: fake ChatGPT-style React frontend
- `apps/api`: Spring Boot REST API backed by Postgres
- `apps/mcp-server`: TypeScript MCP server that calls the hotel API
- `infra/postgres`: Postgres initialization SQL

## Quick Start

Start the full stack:

```sh
docker compose up --build
```

This starts:

- Postgres
- Spring Boot hotel API
- MCP HTTP chat adapter
- React frontend served by nginx

Or run the Spring API locally with an in-memory dev database:

```sh
npm run dev:api
```

For local non-Docker development, run the frontend in another terminal:

```sh
cd apps/web
npm install
npm run dev
```

Run the stdio MCP server for MCP-compatible clients:

```sh
cd apps/mcp-server
npm install
npm run dev
```

Run the browser chat adapter for the frontend:

```sh
cd apps/mcp-server
npm run dev:http
```

## Service URLs

- Frontend: `http://localhost:5173`
- API: `http://localhost:8080`
- MCP HTTP chat adapter: `http://localhost:8790`
- Postgres: `localhost:5432`

## Docs

- `docs/architecture.md`: overall project layout
- `docs/mcp-architecture.md`: MCP server architecture, setup, and client configuration
- `docs/hotel-reservations.md`: Spring hotel API endpoints and hold behavior

## Default Database

- Database: `codefest`
- User: `codefest`
- Password: `codefest`

## Hotel Hold Flow

The API serves seeded hotel inventory at `GET /api/hotels`.

Create a temporary hold with `POST /api/hotel-holds`. Guests can hold with
`guestName` and `guestEmail`; loyalty members can hold with `loyaltyNumber`
only. Holds expire after `HOTEL_HOLD_DURATION`, which defaults to `12h`. When a
hold is created, the API uses a mock email service to log a confirmation URL for
the guest or loyalty account.

Complete a hold with `POST /api/hotel-holds/{holdId}/complete`.

MCP clients should use:

- `create_hotel_hold` for guest name/email holds
- `create_loyalty_hotel_hold` for loyalty-number holds

The browser UI calls the MCP HTTP chat adapter at `/mcp/chat`, which Vite
proxies to `http://localhost:8790/chat`. The MCP server still defaults to stdio
mode for real MCP clients; use `npm run dev:http` only for the browser chat UI.
