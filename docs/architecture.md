# Architecture

```text
apps/web          React fake ChatGPT UI / reservation confirmation surface
   |
   | HTTP /api/chat and hotel reservation endpoints
   v
apps/api          Spring Boot REST API for chat, hotels, and reservation holds
   |
   | JDBC/JPA
   v
postgres          Dockerized Postgres

apps/mcp-server   MCP stdio server that calls the Spring hotel API
```

The frontend is intentionally a fake ChatGPT-style experience. It sends chat turns to the Spring API, which persists them and returns deterministic mock assistant responses. The hotel flow is exposed through Spring REST endpoints and MCP tools, with reservation holds persisted in Postgres.

See `docs/mcp-architecture.md` for the MCP server setup, transport, tools, and client configuration.
