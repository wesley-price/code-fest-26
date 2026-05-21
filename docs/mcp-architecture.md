# MCP Architecture

This project includes a local Model Context Protocol server in `apps/mcp-server`.
Its job is to expose hotel search and reservation-hold actions to an
MCP-compatible client while delegating business logic to the Spring Boot API.

## Role In The System

```text
MCP client
  |
  | stdio transport
  v
apps/mcp-server
  |
  | HTTP calls
  v
apps/api
  |
  | JDBC/JPA
  v
postgres

apps/web  ->  apps/api
```

By default, the MCP server does not serve HTTP traffic. It communicates over
standard input and standard output, which is the common local integration mode
for desktop clients and coding agents. The web app still talks to the Spring
Boot API over HTTP, and the API stores hotels and reservation holds in Postgres.

For the browser UI, the same package also has an optional HTTP chat adapter. It
is not the MCP protocol transport; it is a small bridge that lets the React app
send chat text to the same hotel actions that the MCP tools use.

## Current Implementation

The server entrypoint is `apps/mcp-server/src/index.ts`.

It creates an MCP server with:

- Name: `codefest-mcp-server`
- Version: `0.1.0`
- Transport: `StdioServerTransport`
- Browser adapter: `MCP_TRANSPORT=http`, listening on `MCP_HTTP_PORT` or `8790`
- API base URL: `HOTEL_API_BASE_URL`, defaulting to `http://localhost:8080`

The server currently exposes:

- Resource: `project-overview`
- Resource URI: `codefest://project/overview`
- Tool: `list_hotels`
- Tool: `get_hotel`
- Tool: `create_hotel_hold`
- Tool: `create_loyalty_hotel_hold`
- Tool: `get_hotel_hold`
- Tool: `complete_hotel_reservation`
- Tool: `project_health`

## Resource

`project-overview` returns a short text summary of the repo:

```text
Code Fest 26 contains a fake ChatGPT frontend, a Spring Boot hotel reservation API, Postgres, and this MCP server.
```

Use resources for read-only context that a client can fetch when it needs
background information about the project.

## Tools

`list_hotels`

Input:

```json
{
  "city": "optional city filter"
}
```

Output: hotel inventory from `GET /api/hotels`.

`get_hotel`

Input:

```json
{
  "hotelId": 1
}
```

Output: one hotel from `GET /api/hotels/{hotelId}`.

`create_hotel_hold`

Input:

```json
{
  "hotelId": 1,
  "guestName": "Jane Guest",
  "guestEmail": "jane@example.com",
  "checkIn": "2026-06-01",
  "checkOut": "2026-06-03",
  "rooms": 1
}
```

Output: a reservation hold from `POST /api/hotel-holds`, including:

- Hold id
- Hotel details
- Guest email/name
- Dates and room count
- Hold status
- Expiration time
- Confirmation URL

The API enforces room availability and creates a temporary hold. The hold
duration is configured in Spring with `HOTEL_HOLD_DURATION`, defaulting to
`12h`.

Use this tool when the guest is not identified as a loyalty member and the
system has a name and email address.

`create_loyalty_hotel_hold`

Input:

```json
{
  "hotelId": 1,
  "loyaltyNumber": "LOYALTY-12345",
  "checkIn": "2026-06-01",
  "checkOut": "2026-06-03",
  "rooms": 1
}
```

Output: a reservation hold from `POST /api/hotel-holds`. This path is for
loyalty members who can place a hold using only their loyalty number. The API
does not require guest name or email for this path.

Use this tool when the caller says they are a loyalty member or provides a
loyalty number. The returned hold still has the same `expiresAt`,
`confirmationUrl`, and `status` fields as a guest hold.

`get_hotel_hold`

Input:

```json
{
  "holdId": "uuid"
}
```

Output: the current hold state from `GET /api/hotel-holds/{holdId}`. The API
marks expired holds as `EXPIRED` when they are read.

`complete_hotel_reservation`

Input:

```json
{
  "holdId": "uuid",
  "phoneNumber": "555-0100",
  "billingReference": "tok_test_123"
}
```

Output: the confirmed reservation from
`POST /api/hotel-holds/{holdId}/complete`.

`project_health`

Input: none.

Output: MCP status, API base URL, and the Spring Boot actuator health response.

This is useful as a smoke-test tool because it proves the MCP server started and
can reach the Spring Boot API.

## Local Commands

Install dependencies:

```sh
cd apps/mcp-server
npm install
```

Run in development mode:

```sh
npm run dev
```

Run the browser chat adapter:

```sh
npm run dev:http
```

Use a different API URL:

```sh
HOTEL_API_BASE_URL=http://localhost:8080 npm run dev
```

Use a different API URL with the browser chat adapter:

```sh
HOTEL_API_BASE_URL=http://localhost:8080 MCP_HTTP_PORT=8790 npm run dev:http
```

Build:

```sh
npm run build
```

Run the compiled server:

```sh
npm start
```

## Client Configuration

After building, point an MCP-compatible client at the compiled server:

```json
{
  "mcpServers": {
    "codefest": {
      "command": "node",
      "args": [
        "/Users/wesleyprice/Code/code-fest-26/apps/mcp-server/dist/index.js"
      ]
    }
  }
}
```

For development, a client can run the TypeScript source through `npx`:

```json
{
  "mcpServers": {
    "codefest": {
      "command": "npx",
      "args": [
        "tsx",
        "/Users/wesleyprice/Code/code-fest-26/apps/mcp-server/src/index.ts"
      ]
    }
  }
}
```

Use the compiled form for normal local use because it avoids startup dependency
resolution and TypeScript runtime issues.

## Extension Points

Good next additions are:

- A real SMTP/email provider behind the API email service.
- A frontend reservation completion screen for the confirmation URL.
- Payment-provider integration for `billingReference`.
- Separate availability endpoints by date range and room count.
- MCP resources that expose active holds or hotel inventory snapshots.

Keep MCP tools small and explicit. Validate inputs with `zod`, return predictable
text or structured content, and avoid hiding network calls inside tools unless
the tool name makes that behavior clear.
