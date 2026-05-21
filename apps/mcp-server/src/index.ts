#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

const apiBaseUrl = process.env.HOTEL_API_BASE_URL ?? "http://localhost:8080";
const httpPort = Number(process.env.MCP_HTTP_PORT ?? 8790);
const transportMode = process.env.MCP_TRANSPORT ?? "stdio";

const server = new McpServer({
  name: "codefest-mcp-server",
  version: "0.1.0"
});

server.resource("project-overview", "codefest://project/overview", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      text:
        "Code Fest 26 contains a fake ChatGPT frontend, a Spring Boot hotel reservation API, Postgres, and this MCP server."
    }
  ]
}));

async function apiRequest(path: string, init?: RequestInit) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`API request failed with ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

function jsonText(value: unknown) {
  return JSON.stringify(value, null, 2);
}

type Hotel = {
  id: number;
  name: string;
  city: string;
  country: string;
  description: string;
  nightlyRate: number;
  currency: string;
  availableRooms: number;
};

type ChatRequest = {
  message?: string;
};

const monthNumbers = new Map([
  ["january", 1],
  ["jan", 1],
  ["february", 2],
  ["feb", 2],
  ["march", 3],
  ["mar", 3],
  ["april", 4],
  ["apr", 4],
  ["may", 5],
  ["june", 6],
  ["jun", 6],
  ["july", 7],
  ["jul", 7],
  ["august", 8],
  ["aug", 8],
  ["september", 9],
  ["sep", 9],
  ["sept", 9],
  ["october", 10],
  ["oct", 10],
  ["november", 11],
  ["nov", 11],
  ["december", 12],
  ["dec", 12]
]);

function formatHotel(hotel: Hotel) {
  return `${hotel.id}. ${hotel.name} in ${hotel.city}, ${hotel.country} - ${hotel.currency} ${hotel.nightlyRate}/night, ${hotel.availableRooms} rooms. ${hotel.description}`;
}

function extractDateRange(message: string) {
  const dates = [...message.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((match) => match[0]);
  if (dates.length >= 2) {
    return { checkIn: dates[0], checkOut: dates[1] };
  }

  return extractNaturalDateRange(message);
}

function extractNaturalDateRange(message: string) {
  const explicitMonthMatch = message.match(
    /\b(?:from\s+)?([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\s*(?:to|through|until|-)\s*([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i
  );
  if (explicitMonthMatch) {
    const checkInMonth = monthNumbers.get(explicitMonthMatch[1].toLowerCase());
    const checkOutMonth = monthNumbers.get(explicitMonthMatch[4].toLowerCase());
    if (!checkInMonth || !checkOutMonth) return null;

    const checkIn = inferDate(Number(explicitMonthMatch[2]), checkInMonth, explicitMonthMatch[3]);
    const checkOut = inferDate(Number(explicitMonthMatch[5]), checkOutMonth, explicitMonthMatch[6], checkIn);
    return { checkIn, checkOut };
  }

  const sameMonthMatch = message.match(
    /\b(?:from\s+)?([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|through|until|-)\s*(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i
  );
  if (!sameMonthMatch) return null;
  const month = monthNumbers.get(sameMonthMatch[1].toLowerCase());
  if (!month) return null;

  const checkIn = inferDate(Number(sameMonthMatch[2]), month, sameMonthMatch[4]);
  const checkOut = inferDate(Number(sameMonthMatch[3]), month, sameMonthMatch[4], checkIn);
  return { checkIn, checkOut };
}

function inferDate(day: number, month: number, explicitYear?: string, previousDate?: string) {
  let year = explicitYear ? Number(explicitYear) : new Date().getFullYear();
  let candidate = formatDate(year, month, day);

  if (previousDate && candidate <= previousDate) {
    candidate = formatDate(year + 1, month, day);
  } else if (!explicitYear && !previousDate) {
    const today = formatDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    if (candidate < today) {
      candidate = formatDate(year + 1, month, day);
    }
  }

  return candidate;
}

function formatDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractRooms(message: string) {
  const match = message.match(/\b(\d+)\s*(room|rooms)\b/i);
  return match ? Number(match[1]) : 1;
}

function extractHotelId(message: string) {
  const hotelIdMatch = message.match(/\bhotel\s*(?:id\s*)?#?\s*(\d+)\b/i);
  if (hotelIdMatch) return Number(hotelIdMatch[1]);

  const numberedChoiceMatch = message.match(/\b(?:option|choice|number|#)\s*(\d+)\b/i);
  return numberedChoiceMatch ? Number(numberedChoiceMatch[1]) : null;
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const searchStopWords = new Set([
  "a",
  "about",
  "all",
  "an",
  "and",
  "any",
  "as",
  "at",
  "be",
  "for",
  "give",
  "have",
  "hotel",
  "hotels",
  "i",
  "in",
  "it",
  "list",
  "location",
  "locations",
  "me",
  "near",
  "of",
  "on",
  "should",
  "show",
  "the",
  "to",
  "want",
  "with"
]);

function tokenizeSearchQuery(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.replace(/s$/, ""))
    .filter((token) => token.length > 2 && !searchStopWords.has(token));
}

function searchHotelInventory(hotels: Hotel[], query: string) {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return [];

  return hotels
    .map((hotel) => {
      const searchableText = `${hotel.name} ${hotel.city} ${hotel.country} ${hotel.description}`.toLowerCase();
      const score = tokens.reduce((total, token) => {
        if (searchableText.includes(token)) return total + 1;
        return total;
      }, 0);

      return { hotel, score };
    })
    .filter((result) => result.score > 0)
    .sort((first, second) => second.score - first.score || first.hotel.name.localeCompare(second.hotel.name))
    .map((result) => result.hotel);
}

function extractLocationQuery(message: string) {
  const match = message.match(/\b(?:in|near|around)\s+([a-z][a-z\s.'-]{1,40})\b/i);
  if (!match) return null;

  const value = match[1]
    .replace(/\b(?:as|because|that|which|with|for|from|and|or|but|so|it|they|should)\b.*$/i, "")
    .replace(/\b(?:a|an|the)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return value || null;
}

function extractHotelNameHint(message: string) {
  const beforeDate = message.split(/\bfrom\b/i)[0];
  const match = beforeDate.match(/\b(?:hold|reserve|book)\s+(.+?)(?:\s+(?:for|with|using|under)\b|$)/i);
  if (!match) return null;

  const hint = match[1]
    .replace(/\b(?:hotel|room|rooms|at|the|property|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return hint || null;
}

async function resolveHotelId(message: string) {
  const explicitHotelId = extractHotelId(message);
  if (explicitHotelId) return { hotelId: explicitHotelId };

  const hint = extractHotelNameHint(message);
  if (!hint) return { hotelId: null };

  const hotels = (await apiRequest("/api/hotels")) as Hotel[];
  const normalizedHint = normalizeSearchText(hint);
  const matches = hotels.filter((hotel) => normalizeSearchText(hotel.name).includes(normalizedHint));

  if (matches.length === 1) {
    return { hotelId: matches[0].id, hotel: matches[0], hint };
  }

  return { hotelId: null, hint, matches };
}

function extractLoyaltyNumber(message: string) {
  const match = message.match(
    /\b(?:loyalty|member)\s*(?:number|num|#|id)?\s*(?:is|=|:|#|-)?\s*([a-z0-9-]{3,})\b/i
  );
  return match ? match[1] : null;
}

function extractEmail(message: string) {
  const match = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
}

function extractGuestName(message: string) {
  const match = message.match(/\b(?:name is|for|guest)\s+([a-z][a-z\s.'-]{1,40})(?:\s+from|\s+at|\s+with|\s+email|$)/i);
  return match ? match[1].trim() : null;
}

async function chatWithHotelAssistant(message: string) {
  const normalized = message.toLowerCase();

  if (/\b(hold|reserve|reservation|book)\b/.test(normalized)) {
    const hotelResolution = await resolveHotelId(message);
    const hotelId = hotelResolution.hotelId;
    const dateRange = extractDateRange(message);
    const loyaltyNumber = extractLoyaltyNumber(message);
    const guestEmail = extractEmail(message);
    const guestName = extractGuestName(message);

    const missing = [];
    if (!hotelId) {
      if (hotelResolution.matches?.length) {
        return {
          reply:
            `I found multiple hotels matching "${hotelResolution.hint}". Which one should I hold?\n\n` +
            hotelResolution.matches.map(formatHotel).join("\n\n")
        };
      }
      missing.push("hotel id or a recognizable hotel name");
    }
    if (!dateRange) missing.push("check-in and check-out dates, like May 28th to May 30th");
    if (!loyaltyNumber && (!guestEmail || !guestName)) {
      missing.push("either a loyalty number, or guest name and email");
    }

    if (missing.length > 0) {
      return {
        reply:
          `I can place the hold, but I need ${missing.join(", ")}. ` +
          "Example: Hold Riverfront from May 28th to May 30th with loyalty number LOYALTY-12345."
      };
    }

    const hold = await apiRequest("/api/hotel-holds", {
      method: "POST",
      body: JSON.stringify({
        hotelId,
        loyaltyNumber,
        guestEmail,
        guestName,
        checkIn: dateRange!.checkIn,
        checkOut: dateRange!.checkOut,
        rooms: extractRooms(message)
      })
    });

    return {
      reply:
        `I placed a ${hold.rooms}-room hold at ${hold.hotel.name} from ${hold.checkIn} to ${hold.checkOut}. ` +
        `The hold expires at ${hold.expiresAt}. Confirmation URL: ${hold.confirmationUrl}`,
      data: hold
    };
  }

  const locationQuery = extractLocationQuery(message);
  const cityQuery = locationQuery ? `?city=${encodeURIComponent(locationQuery)}` : "";
  const cityHotels = (await apiRequest(`/api/hotels${cityQuery}`)) as Hotel[];
  const allHotels = cityHotels.length > 0 && locationQuery ? cityHotels : ((await apiRequest("/api/hotels")) as Hotel[]);
  const searchMatches =
    cityHotels.length > 0 && locationQuery ? cityHotels : searchHotelInventory(allHotels, locationQuery ?? message);
  const hotels = searchMatches.length > 0 || locationQuery ? searchMatches : allHotels;

  if (hotels.length === 0) {
    return {
      reply: locationQuery
        ? `I did not find hotels matching "${locationQuery}". Try another city, amenity, or ask to see all locations.`
        : "I did not find any hotels yet."
    };
  }

  return {
    reply:
      `I found ${hotels.length} hotel${hotels.length === 1 ? "" : "s"}${locationQuery ? ` matching "${locationQuery}"` : ""}:\n\n` +
      hotels.map(formatHotel).join("\n\n") +
      "\n\nTo hold one, say: Hold hotel 1 from 2026-06-01 to 2026-06-03 with loyalty number LOYALTY-12345.",
    data: hotels
  };
}

function readJsonBody(request: IncomingMessage): Promise<ChatRequest> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(body));
}

function startHttpChatAdapter() {
  createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      sendJson(response, 204, null);
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, { status: "ok", apiBaseUrl });
      return;
    }

    if (request.method !== "POST" || request.url !== "/chat") {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    try {
      const body = await readJsonBody(request);
      if (!body.message?.trim()) {
        sendJson(response, 400, { error: "message is required" });
        return;
      }

      const result = await chatWithHotelAssistant(body.message.trim());
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Unknown MCP chat adapter error"
      });
    }
  }).listen(httpPort, "0.0.0.0", () => {
    console.error(`MCP HTTP chat adapter listening on http://localhost:${httpPort}`);
  });
}

server.tool("list_hotels", { city: z.string().optional() }, async ({ city }) => {
  const query = city ? `?city=${encodeURIComponent(city)}` : "";
  const hotels = await apiRequest(`/api/hotels${query}`);
  return {
    content: [
      {
        type: "text",
        text: jsonText(hotels)
      }
    ]
  };
});

server.tool("get_hotel", { hotelId: z.number().int().positive() }, async ({ hotelId }) => {
  const hotel = await apiRequest(`/api/hotels/${hotelId}`);
  return {
    content: [
      {
        type: "text",
        text: jsonText(hotel)
      }
    ]
  };
});

server.tool(
  "create_hotel_hold",
  {
    hotelId: z.number().int().positive(),
    guestName: z.string().min(1),
    guestEmail: z.string().email(),
    checkIn: z.string().date().describe("Check-in date in YYYY-MM-DD format."),
    checkOut: z.string().date().describe("Check-out date in YYYY-MM-DD format."),
    rooms: z.number().int().positive().default(1)
  },
  async (request) => {
    const hold = await apiRequest("/api/hotel-holds", {
      method: "POST",
      body: JSON.stringify(request)
    });

    return {
      content: [
        {
          type: "text",
          text: jsonText(hold)
        }
      ]
    };
  }
);

server.tool(
  "create_loyalty_hotel_hold",
  {
    hotelId: z.number().int().positive(),
    loyaltyNumber: z.string().min(1),
    checkIn: z.string().date().describe("Check-in date in YYYY-MM-DD format."),
    checkOut: z.string().date().describe("Check-out date in YYYY-MM-DD format."),
    rooms: z.number().int().positive().default(1)
  },
  async (request) => {
    const hold = await apiRequest("/api/hotel-holds", {
      method: "POST",
      body: JSON.stringify(request)
    });

    return {
      content: [
        {
          type: "text",
          text: jsonText(hold)
        }
      ]
    };
  }
);

server.tool(
  "get_hotel_hold",
  {
    holdId: z.string().uuid()
  },
  async ({ holdId }) => {
    const hold = await apiRequest(`/api/hotel-holds/${holdId}`);
    return {
      content: [
        {
          type: "text",
          text: jsonText(hold)
        }
      ]
    };
  }
);

server.tool(
  "complete_hotel_reservation",
  {
    holdId: z.string().uuid(),
    phoneNumber: z.string().min(1),
    billingReference: z.string().min(1)
  },
  async ({ holdId, phoneNumber, billingReference }) => {
    const reservation = await apiRequest(`/api/hotel-holds/${holdId}/complete`, {
      method: "POST",
      body: JSON.stringify({ phoneNumber, billingReference })
    });

    return {
      content: [
        {
          type: "text",
          text: jsonText(reservation)
        }
      ]
    };
  }
);

server.tool("project_health", {}, async () => {
  const health = await apiRequest("/actuator/health");
  return {
    content: [
      {
        type: "text",
        text: jsonText({
          mcpServer: "running",
          apiBaseUrl,
          apiHealth: health
        })
      }
    ]
  };
});

if (transportMode === "http") {
  startHttpChatAdapter();
} else {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
