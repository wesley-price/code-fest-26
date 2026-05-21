#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

const apiBaseUrl = process.env.HOTEL_API_BASE_URL ?? "http://localhost:8080";
const httpPort = Number(process.env.MCP_HTTP_PORT ?? 8790);
const transportMode = process.env.MCP_TRANSPORT ?? "stdio";
const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";

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
  history?: ChatHistoryMessage[];
  hotels?: Hotel[];
};

type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
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

function isHotelList(value: unknown): value is Hotel[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as Hotel).id === "number" &&
        typeof (item as Hotel).name === "string"
    )
  );
}

function formatHotelContext(hotels: Hotel[]) {
  if (hotels.length === 0) {
    return "No hotels have been loaded in the website yet.";
  }

  return hotels
    .map(
      (hotel) =>
        `${hotel.id}. ${hotel.name} | ${hotel.city}, ${hotel.country} | ${hotel.currency} ${hotel.nightlyRate}/night | ${hotel.availableRooms} rooms | ${hotel.description}`
    )
    .join("\n");
}

function extractResponseText(value: unknown) {
  if (value && typeof value === "object" && "output_text" in value && typeof value.output_text === "string") {
    return value.output_text;
  }

  if (!value || typeof value !== "object" || !("output" in value) || !Array.isArray(value.output)) {
    return null;
  }

  const textParts: string[] = [];
  for (const outputItem of value.output) {
    if (!outputItem || typeof outputItem !== "object" || !("content" in outputItem) || !Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (
        contentItem &&
        typeof contentItem === "object" &&
        "text" in contentItem &&
        typeof contentItem.text === "string"
      ) {
        textParts.push(contentItem.text);
      }
    }
  }

  return textParts.length > 0 ? textParts.join("\n") : null;
}

async function openAiRequest(body: unknown) {
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  const responseBody = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`OpenAI request failed with ${response.status}: ${JSON.stringify(responseBody)}`);
  }

  return responseBody;
}

function createOpenAiChatBody(message: string, hotels: Hotel[], history: ChatHistoryMessage[] = [], stream = false) {
  const recentHistory = history.slice(-8).map((item) => ({
    role: item.role,
    content: item.content
  }));

  return {
    model: openAiModel,
    instructions:
      "You are a friendly travel concierge embedded in a hotel-booking chat. Your job is to help the user discover where to go and which hotel fits — beach, tropical, Caribbean, Europe, jungle, city break, mountain, and so on — by drawing only from the inventory listed in Current website hotel context below.\n\n" +
      "Conversation style:\n" +
      "- Sound like a helpful person, not a search endpoint. Acknowledge what the user said in one short sentence before asking or recommending.\n" +
      "- Carry forward recent preferences from the conversation history: vibe, budget, party size, dates, region, and any rejected options.\n" +
      "- If the user's request is vague (e.g., 'somewhere warm', 'I want a beach trip'), ask one or two short clarifying questions about vibe, rough budget per night, approximate dates, or party size before listing picks. Don't ask more than two at a time.\n" +
      "- If the user answers a previous clarifying question, do not restart. Use the answer with the previous context and move the trip forward.\n" +
      "- Once you have enough signal, recommend 3-4 hotels that best fit. Group by region when helpful so the user can compare.\n" +
      "- For each pick, give: hotel ID, name, city, country, nightly rate with currency, available rooms, one sentence on why it fits the user's request, and one short sentence on what the surrounding area or neighborhood is known for (beaches, food, landmarks, day trips).\n" +
      "- Keep responses scannable. No markdown formatting — the UI renders plain text.\n\n" +
      "Grounding rules:\n" +
      "- Hotel-specific facts (name, city, country, nightly rate, available rooms, on-property description) must come ONLY from the provided context. Never invent properties, prices, room counts, amenities, confirmation numbers, or policies.\n" +
      "- You MAY describe what a city, beach, island, or neighborhood is generally known for using common geographic knowledge (e.g., 'Tulum is known for cenotes and Mayan ruins', 'Lahaina sits on Maui's west coast with Black Rock snorkeling nearby'). Keep area context to one short sentence per pick and don't fabricate specific businesses near the hotel.\n" +
      "- If nothing in the inventory matches what the user asked for, say so plainly and suggest the closest alternatives that ARE in the inventory.\n" +
      "- If the user wants to hold, book, reserve, complete, or change a reservation, tell them the exact details you still need (hotel id or name, dates, guest name/email or loyalty number) instead of claiming you completed it.\n\n" +
      `Current website hotel context:\n${formatHotelContext(hotels)}`,
    input: [
      ...recentHistory,
      {
        role: "user",
        content: message
      }
    ],
    max_output_tokens: 700,
    stream
  };
}

async function chatWithOpenAi(message: string, hotels: Hotel[], history: ChatHistoryMessage[] = []) {
  const response = await openAiRequest(createOpenAiChatBody(message, hotels, history));

  return extractResponseText(response) ?? "I could not generate a ChatGPT response for that request.";
}

async function openAiStreamRequest(body: unknown) {
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed with ${response.status}: ${text}`);
  }

  if (!response.body) {
    throw new Error("OpenAI streaming response did not include a response body.");
  }

  return response.body;
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

function recentUserText(message: string, history: ChatHistoryMessage[]) {
  return [...history.filter((item) => item.role === "user").slice(-4).map((item) => item.content), message].join(" ");
}

function isGreeting(message: string) {
  return /^(hi|hello|hey|yo|good morning|good afternoon|good evening)\b/i.test(message.trim());
}

function isVagueTravelRequest(message: string) {
  return /\b(somewhere|anything|trip|vacation|getaway|travel|go away|surprise me)\b/i.test(message) &&
    !/\b(beach|tropical|caribbean|mountain|city|downtown|budget|cheap|luxury|food|restaurant|coffee|airport|water|waterfront|bay|new york|boston|miami|denver|seattle|chicago|austin|atlanta|nashville|los angeles|san francisco|minneapolis)\b/i.test(message);
}

function expandTravelQuery(query: string) {
  const normalized = query.toLowerCase();
  const signals = [query];

  if (/\b(beach|tropical|caribbean|island|warm|sun|pool|resort)\b/.test(normalized)) {
    signals.push("miami bay palm resort waterfront san francisco seattle water");
  }
  if (/\b(mountain|hike|ski|outdoor|nature)\b/.test(normalized)) {
    signals.push("denver mountain seattle mountain");
  }
  if (/\b(city|downtown|nightlife|museum|food|restaurant|europe)\b/.test(normalized)) {
    signals.push("new york boston san francisco los angeles chicago downtown restaurants galleries subway");
  }
  if (/\b(quiet|work|business|meeting|conference)\b/.test(normalized)) {
    signals.push("meeting workspace coworking conference quiet downtown");
  }
  if (/\b(budget|cheap|affordable|lower cost)\b/.test(normalized)) {
    signals.push("austin atlanta nashville minneapolis");
  }

  return signals.join(" ");
}

function compareHotelsByFit(query: string) {
  const expandedQuery = expandTravelQuery(query);
  const tokens = tokenizeSearchQuery(expandedQuery);

  return (first: Hotel, second: Hotel) => {
    const score = (hotel: Hotel) => {
      const searchableText = `${hotel.name} ${hotel.city} ${hotel.country} ${hotel.description}`.toLowerCase();
      const tokenScore = tokens.reduce((total, token) => total + (searchableText.includes(token) ? 2 : 0), 0);
      const priceScore = Math.max(0, 350 - hotel.nightlyRate) / 100;
      return tokenScore + priceScore + Math.min(hotel.availableRooms, 12) / 12;
    };

    return score(second) - score(first) || first.nightlyRate - second.nightlyRate;
  };
}

function conversationalHotelReply(message: string, hotels: Hotel[], history: ChatHistoryMessage[] = []) {
  const conversationText = recentUserText(message, history);

  if (isGreeting(message)) {
    return (
      "Hey, I can help you narrow this down like a travel concierge. " +
      "Tell me the kind of trip you want, or give me two signals like 'warm and walkable' or 'mountains under $220 a night.'"
    );
  }

  if (isVagueTravelRequest(conversationText)) {
    return (
      "I can help with that. What kind of trip sounds right: beach and warm, food-focused city break, mountains, or quiet work-friendly stay? " +
      "And do you have a rough nightly budget?"
    );
  }

  const expandedQuery = expandTravelQuery(conversationText);
  const directMatches = searchHotelInventory(hotels, expandedQuery);
  const picks = (directMatches.length > 0 ? directMatches : [...hotels].sort(compareHotelsByFit(expandedQuery))).slice(0, 4);

  if (picks.length === 0) {
    return "I do not have any hotels loaded yet. Click View all hotels, then tell me what kind of stay you want.";
  }

  const noEuropeMatch = /\beurope\b/i.test(conversationText);
  const intro = noEuropeMatch
    ? "I do not have Europe hotels in this inventory yet, but I can give you the closest city-break options from what is available."
    : "Based on what you told me, I would start with these.";

  const body = picks
    .map(
      (hotel, index) =>
        `${index + 1}. ${hotel.name} (${hotel.id}) in ${hotel.city}, ${hotel.country}\n` +
        `${hotel.currency} ${hotel.nightlyRate}/night, ${hotel.availableRooms} rooms available.\n` +
        `${hotel.description}\n` +
        `Why it fits: ${hotelFitReason(hotel, conversationText)}`
    )
    .join("\n\n");

  return `${intro}\n\n${body}\n\nWant me to compare two of these, or place a 12-hour hold on one?`;
}

function hotelFitReason(hotel: Hotel, query: string) {
  const text = `${query} ${hotel.description} ${hotel.city}`.toLowerCase();
  if (/\b(beach|tropical|caribbean|island|warm|water|waterfront|bay|pool|resort)\b/.test(text)) {
    return `${hotel.city} gives you the strongest warm-weather or water-adjacent fit in the current inventory.`;
  }
  if (/\b(mountain|hike|outdoor|nature|shuttle)\b/.test(text)) {
    return `${hotel.city} is the best match for mountain or outdoors access in the current inventory.`;
  }
  if (/\b(food|restaurant|downtown|city|museum|gallery|nightlife|subway)\b/.test(text)) {
    return "It has the strongest city-break fit, with easy access to restaurants, transit, events, or cultural stops.";
  }
  if (/\b(work|business|meeting|conference|quiet|workspace)\b/.test(text)) {
    return "It is a practical business-travel fit with workspace, meeting, or downtown convenience signals.";
  }
  return "It is one of the closest matches from the current hotel inventory.";
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

async function chatWithHotelAssistant(message: string, history: ChatHistoryMessage[] = [], websiteHotels: Hotel[] = []) {
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

  if (openAiApiKey) {
    const reply = await chatWithOpenAi(message, websiteHotels, history);
    return {
      reply,
      data: websiteHotels
    };
  }

  const allHotels = websiteHotels.length > 0 ? websiteHotels : ((await apiRequest("/api/hotels")) as Hotel[]);
  const cityQuery = locationQuery ? `?city=${encodeURIComponent(locationQuery)}` : "";
  const cityHotels = locationQuery ? ((await apiRequest(`/api/hotels${cityQuery}`)) as Hotel[]) : [];
  const searchMatches = cityHotels.length > 0 ? cityHotels : searchHotelInventory(allHotels, locationQuery ?? message);
  const hotels = searchMatches.length > 0 || locationQuery ? searchMatches : allHotels;

  if (hotels.length === 0) {
    return {
      reply: locationQuery
        ? `I did not find hotels matching "${locationQuery}". Try another city, amenity, or ask to see all locations.`
        : "I did not find any hotels yet."
    };
  }

  return {
    reply: conversationalHotelReply(message, hotels, history),
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

function sendSse(response: ServerResponse, event: string, data: unknown) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function streamOpenAiChat(response: ServerResponse, message: string, hotels: Hotel[], history: ChatHistoryMessage[]) {
  const body = await openAiStreamRequest(createOpenAiChatBody(message, hotels, history, true));
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;

      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      const event = JSON.parse(data) as { type?: string; delta?: string; error?: unknown };
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        sendSse(response, "delta", { text: event.delta });
      } else if (event.type === "response.completed") {
        sendSse(response, "done", {});
      } else if (event.type === "error") {
        const openAiError =
          event.error && typeof event.error === "object" && "message" in event.error
            ? String(event.error.message)
            : "OpenAI streaming failed.";
        throw new Error(openAiError);
      }
    }
  }
}

async function sendStreamingChatResponse(response: ServerResponse, body: ChatRequest) {
  const message = body.message?.trim();
  if (!message) {
    sendJson(response, 400, { error: "message is required" });
    return;
  }

  const history = body.history ?? [];
  const websiteHotels = isHotelList(body.hotels) ? body.hotels : [];

  response.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream"
  });

  try {
    if (openAiApiKey && !/\b(hold|reserve|reservation|book)\b/i.test(message)) {
      try {
        await streamOpenAiChat(response, message, websiteHotels, history);
      } catch {
        const fallbackHotels = websiteHotels.length > 0 ? websiteHotels : ((await apiRequest("/api/hotels")) as Hotel[]);
        sendSse(response, "delta", { text: conversationalHotelReply(message, fallbackHotels, history) });
        sendSse(response, "done", { data: fallbackHotels });
      }
    } else {
      const result = await chatWithHotelAssistant(message, history, websiteHotels);
      sendSse(response, "delta", { text: result.reply });
      sendSse(response, "done", { data: result.data ?? null });
    }
  } catch (error) {
    sendSse(response, "error", {
      message: error instanceof Error ? error.message : "Unknown streaming chat error"
    });
  } finally {
    response.end();
  }
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

    if (request.method === "POST" && request.url === "/chat/stream") {
      const body = await readJsonBody(request);
      await sendStreamingChatResponse(response, body);
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

      const result = await chatWithHotelAssistant(
        body.message.trim(),
        body.history ?? [],
        isHotelList(body.hotels) ? body.hotels : []
      );
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
