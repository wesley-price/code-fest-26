# Hotel Reservations

The hotel reservation flow is owned by the Spring Boot API and exposed to MCP
clients through `apps/mcp-server`.

## API Configuration

Environment variables:

- `HOTEL_HOLD_DURATION`: how long a hold stays active, default `12h`
- `HOTEL_CONFIRMATION_BASE_URL`: base URL used when generating confirmation links

Docker Compose sets:

```sh
HOTEL_HOLD_DURATION=12h
HOTEL_CONFIRMATION_BASE_URL=http://localhost:5173/reservations
```

## API Endpoints

List hotels:

```http
GET /api/hotels
GET /api/hotels?city=Chicago
```

Get one hotel:

```http
GET /api/hotels/{hotelId}
```

Create a hold:

```http
POST /api/hotel-holds
Content-Type: application/json

{
  "hotelId": 1,
  "guestName": "Jane Guest",
  "guestEmail": "jane@example.com",
  "checkIn": "2026-06-01",
  "checkOut": "2026-06-03",
  "rooms": 1
}
```

Create a loyalty-member hold:

```http
POST /api/hotel-holds
Content-Type: application/json

{
  "hotelId": 1,
  "loyaltyNumber": "LOYALTY-12345",
  "checkIn": "2026-06-01",
  "checkOut": "2026-06-03",
  "rooms": 1
}
```

Hold identity modes:

| Mode | Required fields | Email behavior |
| --- | --- | --- |
| Guest | `guestName`, `guestEmail` | Logs a mock email to `guestEmail` with the confirmation URL. |
| Loyalty member | `loyaltyNumber` | Logs that the confirmation URL is available through the loyalty account. |

The same `POST /api/hotel-holds` endpoint supports both modes. A request must
include either guest contact details or a loyalty number.

Get a hold:

```http
GET /api/hotel-holds/{holdId}
```

Complete a reservation:

```http
POST /api/hotel-holds/{holdId}/complete
Content-Type: application/json

{
  "phoneNumber": "555-0100",
  "billingReference": "tok_test_123"
}
```

## Hold Behavior

When a hold is created, the API:

- Requires either `guestName` plus `guestEmail`, or `loyaltyNumber`.
- Validates the requested dates and room count.
- Checks active `HELD` and `CONFIRMED` reservations for overlapping dates.
- Persists the hold with status `HELD`.
- Sets `expiresAt` using the configured hold duration.
- Logs a mock confirmation email with a URL for completing the reservation when
  an email is present. Loyalty-member holds log that the confirmation URL is
  available through the loyalty account.

When a hold is fetched or completed, expired holds are marked `EXPIRED`.
Only `HELD` reservations can be completed. Completing a reservation stores the
final phone number and billing reference on the hold and changes its status to
`CONFIRMED`.

## Hold Response

Both guest and loyalty holds return the same shape:

```json
{
  "id": "7e3fd9aa-8f19-4aa0-9d0f-000000000000",
  "hotel": {
    "id": 1,
    "name": "North Loop House",
    "city": "Minneapolis",
    "country": "US",
    "description": "Modern downtown hotel near restaurants, transit, and event venues.",
    "nightlyRate": 189.00,
    "currency": "USD",
    "availableRooms": 12
  },
  "guestEmail": null,
  "guestName": null,
  "loyaltyNumber": "LOYALTY-12345",
  "checkIn": "2026-06-01",
  "checkOut": "2026-06-03",
  "rooms": 1,
  "status": "HELD",
  "expiresAt": "2026-06-01T18:00:00Z",
  "confirmedAt": null,
  "phoneNumber": null,
  "confirmationUrl": "http://localhost:5173/reservations/holds/7e3fd9aa-8f19-4aa0-9d0f-000000000000/complete"
}
```

For guest holds, `guestEmail` and `guestName` are populated and
`loyaltyNumber` is `null`. For loyalty holds, `loyaltyNumber` is populated and
guest contact fields can stay `null`.

## Email

Email is currently implemented by `MockEmailService`. It logs the recipient,
hold id, and confirmation URL. Replace this service with SMTP, SendGrid, SES, or
another provider when real email delivery is needed.
