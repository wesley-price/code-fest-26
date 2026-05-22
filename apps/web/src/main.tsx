import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  BedDouble,
  Bot,
  Building2,
  Car,
  CheckCircle2,
  Coffee,
  Gift,
  Menu,
  Mic,
  MicOff,
  PanelLeft,
  Plane,
  Plus,
  Search,
  Send,
  Utensils,
  UserRound,
} from "lucide-react";
import "./styles.css";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: {
    transcript: string;
  };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  hotels?: Hotel[];
};

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

type Hold = {
  id: string;
  hotel: Hotel;
  guestName?: string | null;
  guestEmail?: string | null;
  loyaltyNumber?: string | null;
  checkIn: string;
  checkOut: string;
  rooms: number;
  status: string;
  expiresAt?: string;
  confirmedAt?: string | null;
  phoneNumber?: string | null;
  confirmationUrl?: string;
};

function isHold(value: unknown): value is Hold {
  if (!value || typeof value !== "object") return false;
  const h = value as Record<string, unknown>;
  return (
    typeof h.id === "string" &&
    typeof h.checkIn === "string" &&
    typeof h.checkOut === "string" &&
    typeof h.status === "string" &&
    h.hotel != null &&
    typeof (h.hotel as Hotel).id === "number"
  );
}

type ChatResponse = {
  reply?: string;
  data?: unknown;
};

type StreamEvent = {
  event: string;
  data: unknown;
};

type Partnership = {
  name: string;
  category: string;
  description: string;
  offer: string;
  icon: "dining" | "coffee" | "ride" | "air" | "rewards";
  distance: string;
  mapPosition: {
    top: string;
    left: string;
  };
};

type Starter = {
  label: string;
  action: "viewAllHotels" | "sendMessage";
};

const starters: Starter[] = [
  { label: "I'm thinking about going to the beach", action: "sendMessage" },
  { label: "Plan a Europe city break", action: "sendMessage" },
  { label: "Caribbean escape for a long weekend", action: "sendMessage" },
  { label: "Somewhere tropical with my partner", action: "sendMessage" },
  { label: "View all hotels", action: "viewAllHotels" }
];

const initialAssistantMessage =
  "I'm your travel concierge. Tell me what kind of trip you're picturing, even if it's rough. I can help narrow the vibe, compare options, and then place a 12-hour hold when you're ready.";

function fallbackReply(message: string) {
  if (isNewHotelSearch(message)) {
    return (
      "I can help with that. What kind of trip sounds right: beach and warm, food-focused city break, mountains, or a quiet work-friendly stay? " +
      "When the travel assistant is connected, I can compare the MCP hotel inventory and place a hold."
    );
  }

  return "I could not reach the assistant backend. Try again after the chat service is running.";
}

function hotelListFallbackReply() {
  return "I could not load hotels from the Postgres-backed API. Make sure the Spring API is running on port 8080.";
}

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

function formatDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function inferDate(day: number, month: number, explicitYear?: string, previousDate?: string) {
  const year = explicitYear ? Number(explicitYear) : new Date().getFullYear();
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

function extractDateRange(message: string) {
  const isoDates = [...message.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((match) => match[0]);
  if (isoDates.length >= 2) {
    return { checkIn: isoDates[0], checkOut: isoDates[1] };
  }

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

function extractLoyaltyNumber(message: string) {
  const match = message.match(
    /\b(?:loyalty|member)\s*(?:number|num|#|id)?\s*(?:is|=|:|#|-)?\s*([a-z0-9-]{3,})\b/i
  );
  return match ? match[1] : null;
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findHotelFromMessage(message: string, hotels: Hotel[]) {
  const normalizedMessage = normalizeSearchText(message);
  const matches = hotels.filter((hotel) => normalizedMessage.includes(normalizeSearchText(hotel.name)));
  if (matches.length === 1) return matches[0];

  return hotels.find((hotel) => {
    const hotelWords = hotel.name.toLowerCase().split(/\s+/);
    return hotelWords.some((word) => word.length > 3 && message.toLowerCase().includes(word));
  });
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

function extractHotelsFromResponse(data: unknown) {
  if (isHotelList(data)) return data;
  if (
    data &&
    typeof data === "object" &&
    "hotel" in data &&
    (data as { hotel?: unknown }).hotel &&
    typeof (data as { hotel: Hotel }).hotel.id === "number"
  ) {
    return [(data as { hotel: Hotel }).hotel];
  }

  return null;
}

function extractMentionedHotels(content: string, hotels: Hotel[]) {
  if (!content.trim() || hotels.length === 0) return [];

  return hotels
    .filter((hotel) => {
      const idPattern = new RegExp(`(?:^|[^0-9])${hotel.id}(?:[^0-9]|$)`);
      return content.includes(hotel.name) || idPattern.test(content);
    })
    .slice(0, 6);
}

function isNewHotelSearch(message: string) {
  return /\b(beach(es)?|mountain(s)?|tropical|caribbean|city|cities|downtown|europe(an)?|jungle|relaxing|food|restaurant(s)?|coffee|waterfront|budget|luxury|warm|cold|ski|hike|pool|resort(s)?|show|find|search|recommend|options?|instead|else|other|change|in|near|around|somewhere|anything|trip|vacation|getaway|travel|go away|surprise me)\b/i.test(
    message
  );
}

function formatHotelList(hotels: Hotel[]) {
  if (hotels.length === 0) {
    return "There are no hotels in the inventory yet.";
  }

  return (
    `I found ${hotels.length} hotel${hotels.length === 1 ? "" : "s"}:\n\n` +
    hotels
      .map(
        (hotel) =>
          `${hotel.id}. ${hotel.name} - ${hotel.city}, ${hotel.country}\n` +
          `${hotel.description}\n` +
          `${hotel.currency} ${hotel.nightlyRate.toFixed(2)} per night; ${hotel.availableRooms} rooms available`
      )
      .join("\n\n")
  );
}

function prepareOutboundMessage(message: string, hotels: Hotel[]) {
  const dateRange = extractDateRange(message);
  const loyaltyNumber = extractLoyaltyNumber(message);
  const looksLikeHoldFragment = Boolean(dateRange && loyaltyNumber);
  const alreadyHasHoldIntent = /\b(hold|reserve|reservation|book)\b/i.test(message);

  if (!looksLikeHoldFragment || alreadyHasHoldIntent) {
    return { message };
  }

  const hotel = findHotelFromMessage(message, hotels) ?? (hotels.length === 1 ? hotels[0] : null);
  if (!hotel) {
    return {
      error:
        "I found dates and a loyalty number, but I still need the hotel. Say the hotel name, or search a city first and then give the dates."
    };
  }

  return {
    message: `Hold hotel ${hotel.id} from ${dateRange!.checkIn} to ${dateRange!.checkOut} with loyalty number ${loyaltyNumber}`
  };
}

const bostonRestaurantPool = [
  { name: "Neptune Oyster", distance: "0.4 mi", description: "Award-winning raw bar and New England seafood in the North End." },
  { name: "Toro", distance: "0.6 mi", description: "Lively Barcelona-style tapas bar with craft cocktails in the South End." },
  { name: "Island Creek Oyster Bar", distance: "0.3 mi", description: "Farm-to-table oysters and New England coastal cuisine in Kenmore Square." },
  { name: "Eastern Standard Kitchen", distance: "0.5 mi", description: "Classic brasserie fare and an extensive wine list near Fenway." },
  { name: "Oleana", distance: "0.7 mi", description: "Mediterranean and Middle Eastern flavors with a celebrated patio in Cambridge." },
  { name: "The Butcher Shop", distance: "0.4 mi", description: "Charcuterie-driven wine bar and bistro in the South End." },
  { name: "Waypoint", distance: "0.5 mi", description: "Seasonal New American menu with a raw bar in Harvard Square." },
  { name: "Coppa", distance: "0.6 mi", description: "Rustic Italian enoteca with house-made pasta and pizzas in the South End." },
];

const airlinePool = [
  {
    name: "Delta Air Lines",
    description: "Earn SkyMiles on Delta flights booked through your Marriott Bonvoy stay.",
    offer: "Link your SkyMiles number at check-in to start earning automatically.",
  },
  {
    name: "American Airlines",
    description: "Earn AAdvantage miles on American flights connected to your Marriott reservation.",
    offer: "Enter your AAdvantage number at check-in to earn miles on your trip.",
  },
];

function pickRandom<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

function getHotelPartnerships(reservation: Hold): Partnership[] {
  const restaurant = pickRandom(bostonRestaurantPool);
  const airline = pickRandom(airlinePool);

  return [
    {
      name: restaurant.name,
      category: "Eat Around Town · Boston",
      description: `${restaurant.description} Earn Marriott Bonvoy points on eligible checks.`,
      offer: "Link your Bonvoy card before dinner to earn on eligible checks.",
      icon: "dining",
      distance: restaurant.distance,
      mapPosition: { top: "32%", left: "68%" }
    },
    {
      name: "Starbucks",
      category: "Coffee & Breakfast",
      description: "Order ahead for lobby pickup or grab a drink from the nearest café before your day starts.",
      offer: "Show your hotel confirmation for a featured beverage offer.",
      icon: "coffee",
      distance: "0.1 mi",
      mapPosition: { top: "56%", left: "58%" }
    },
    {
      name: "Uber",
      category: "Rides & Transfers",
      description: `Book rides to and from ${reservation.hotel.city} attractions without leaving the trip flow.`,
      offer: "Save your hotel address as the default pickup and drop-off.",
      icon: "ride",
      distance: "Pickup zone",
      mapPosition: { top: "70%", left: "36%" }
    },
    {
      name: airline.name,
      category: "Air Travel",
      description: airline.description,
      offer: airline.offer,
      icon: "air",
      distance: "Logan Int'l",
      mapPosition: { top: "25%", left: "28%" }
    }
  ];
}

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [allHotels, setAllHotels] = useState<Hotel[]>([]);
  const [lastHotels, setLastHotels] = useState<Hotel[]>([]);
  const [pendingHold, setPendingHold] = useState<Hold | null>(null);
  const [completedReservation, setCompletedReservation] = useState<Hold | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [isBookingSubmitting, setIsBookingSubmitting] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  const [holdDraft, setHoldDraft] = useState({
    checkIn: "",
    checkOut: ""
  });
  const [holdDraftError, setHoldDraftError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const committedSpeechRef = useRef("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/hotels")
      .then((response) => (response.ok ? (response.json() as Promise<Hotel[]>) : Promise.resolve([])))
      .then((hotels) => {
        if (!cancelled && Array.isArray(hotels) && hotels.length > 0) {
          setAllHotels(hotels);
          setLastHotels(hotels);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const reservationId = new URLSearchParams(window.location.search).get("reservation");
    if (!reservationId) return;

    let cancelled = false;
    fetch(`/api/hotel-holds/${reservationId}`)
      .then((response) => (response.ok ? (response.json() as Promise<Hold>) : null))
      .then((hold) => {
        if (cancelled || !hold || !isHold(hold)) return;
        if (hold.status === "CONFIRMED") {
          setCompletedReservation(hold);
        } else if (hold.status === "HELD") {
          setPendingHold(hold);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const chats = useMemo(() => ["Hotel search"], []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const canUseSpeech = typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  function updateAssistantMessage(messageId: number, content: string) {
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? { ...message, content } : message))
    );
  }

  function updateAssistantHotels(messageId: number, hotels: Hotel[]) {
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? { ...message, hotels } : message))
    );
  }

  function parseStreamEvents(buffer: string) {
    const chunks = buffer.split("\n\n");
    const remaining = chunks.pop() ?? "";

    const events = chunks
      .map((chunk) => {
        const eventLine = chunk.split("\n").find((line) => line.startsWith("event:"));
        const dataLine = chunk.split("\n").find((line) => line.startsWith("data:"));
        if (!eventLine || !dataLine) return null;

        return {
          event: eventLine.slice("event:".length).trim(),
          data: JSON.parse(dataLine.slice("data:".length).trim()) as unknown
        };
      })
      .filter((event): event is StreamEvent => Boolean(event));

    return { events, remaining };
  }

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || isSending) return;
    const shouldStartNewSearch = isNewHotelSearch(trimmed) && !/\b(hold|book|reserve)\b/i.test(trimmed);
    const activeSelectedHotel = shouldStartNewSearch ? null : selectedHotel;
    const hotelContext = activeSelectedHotel ? [activeSelectedHotel] : (shouldStartNewSearch ? allHotels : lastHotels);
    const prepared = prepareOutboundMessage(trimmed, hotelContext);

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: trimmed
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    if (shouldStartNewSearch) {
      setSelectedHotel(null);
      setHoldDraft({ checkIn: "", checkOut: "" });
      setHoldDraftError(null);
    }

    if (prepared.error) {
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: prepared.error
        }
      ]);
      return;
    }

    setIsSending(true);
    const assistantMessageId = Date.now() + 1;
    let streamError: string | null = null;

    setMessages((current) => [
      ...current,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "Thinking..."
      }
    ]);

    try {
      const response = await fetch("/mcp/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prepared.message,
          history: [...messages, userMessage].map(({ role, content }) => ({ role, content })),
          hotels: hotelContext
        })
      });

      if (!response.ok) throw new Error("API request failed");
      if (!response.body) throw new Error("Streaming response is unavailable");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      let hasStartedReply = false;
      let responseHotels: Hotel[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parsed = parseStreamEvents(buffer);
        buffer = parsed.remaining;

        for (const event of parsed.events) {
          if (event.event === "delta") {
            const delta = event.data as { text?: string };
            assistantContent += delta.text ?? "";
            hasStartedReply = true;
            updateAssistantMessage(assistantMessageId, assistantContent);
          } else if (event.event === "done") {
            const doneEvent = event.data as { data?: unknown };
            const hotelsFromResponse = extractHotelsFromResponse(doneEvent.data);
            if (hotelsFromResponse) {
              responseHotels = hotelsFromResponse;
              setLastHotels(hotelsFromResponse);
              if (!activeSelectedHotel) {
                updateAssistantHotels(assistantMessageId, extractMentionedHotels(assistantContent, hotelsFromResponse));
              }
            }
            if (isHold(doneEvent.data) && doneEvent.data.status === "HELD") {
              setPendingHold(doneEvent.data);
              setBookingError(null);
            }
          } else if (event.event === "error") {
            const errorEvent = event.data as { message?: string };
            streamError = errorEvent.message ?? "Streaming chat failed";
            updateAssistantMessage(assistantMessageId, streamError);
            throw new Error(streamError);
          }
        }
      }

      if (!assistantContent && !streamError && !hasStartedReply) {
        updateAssistantMessage(assistantMessageId, fallbackReply(trimmed));
      } else if (assistantContent && responseHotels.length === 0 && !activeSelectedHotel) {
        updateAssistantHotels(assistantMessageId, extractMentionedHotels(assistantContent, lastHotels));
      }
    } catch {
      updateAssistantMessage(assistantMessageId, streamError ?? fallbackReply(trimmed));
    } finally {
      setIsSending(false);
    }
  }

  async function viewAllHotels() {
    if (isSending) return;

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: "View all hotels"
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsSending(true);

    try {
      const response = await fetch("/api/hotels");
      if (!response.ok) throw new Error("Hotel API request failed");

      const hotels = (await response.json()) as Hotel[];
      setLastHotels(hotels);
      setSelectedHotel(null);

      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: formatHotelList(hotels)
        }
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: hotelListFallbackReply()
        }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    stopListening();
    void sendMessage(input);
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    stopListening();
    void sendMessage(input);
  }

  function handleHotelOptionClick(hotel: Hotel) {
    if (isSending) return;
    setSelectedHotel(hotel);
    setLastHotels([hotel]);
    setHoldDraftError(null);
    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        role: "user",
        content: `I like ${hotel.name}.`
      },
      {
        id: Date.now() + 1,
        role: "assistant",
        content:
          `Good choice. Pick your dates below, then I'll take you to the booking page for guest and payment details.`
      }
    ]);
  }

  function handleHoldDraftSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedHotel || isSending) return;

    if (!holdDraft.checkIn || !holdDraft.checkOut || holdDraft.checkOut <= holdDraft.checkIn) {
      setHoldDraftError("Choose a valid check-in and check-out date.");
      return;
    }

    setHoldDraftError(null);
    setPendingHold({
      id: `draft-${selectedHotel.id}-${Date.now()}`,
      hotel: selectedHotel,
      checkIn: holdDraft.checkIn,
      checkOut: holdDraft.checkOut,
      rooms: 1,
      status: "DRAFT"
    });
  }

  async function handleBookingSubmit(payload: BookingSubmitPayload) {
    if (!pendingHold || isBookingSubmitting) return;
    setBookingError(null);
    setIsBookingSubmitting(true);
    try {
      let holdToComplete = pendingHold;

      if (pendingHold.status === "DRAFT") {
        const holdResponse = await fetch("/api/hotel-holds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hotelId: pendingHold.hotel.id,
            guestName: payload.contactMode === "guest" ? `${payload.firstName} ${payload.lastName}`.trim() : undefined,
            guestEmail: payload.contactMode === "guest" ? payload.email : undefined,
            loyaltyNumber: payload.contactMode === "loyalty" ? payload.loyaltyNumber : undefined,
            checkIn: pendingHold.checkIn,
            checkOut: pendingHold.checkOut,
            rooms: pendingHold.rooms
          })
        });
        if (!holdResponse.ok) {
          const detail = await holdResponse.text();
          throw new Error(detail || `Hold failed (${holdResponse.status})`);
        }
        holdToComplete = (await holdResponse.json()) as Hold;
      }

      const response = await fetch(`/api/hotel-holds/${holdToComplete.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: payload.contactMode === "guest" ? payload.phone : undefined,
          billingReference: `tok_demo_${payload.last4}`
        })
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `Booking failed (${response.status})`);
      }
      const confirmed = (await response.json()) as Hold;
      setCompletedReservation({
        ...confirmed,
        guestName: payload.contactMode === "guest" ? `${payload.firstName} ${payload.lastName}`.trim() : confirmed.guestName,
        loyaltyNumber: payload.contactMode === "loyalty" ? payload.loyaltyNumber : confirmed.loyaltyNumber
      });
      setPendingHold(null);
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : "Booking failed.");
    } finally {
      setIsBookingSubmitting(false);
    }
  }

  function handleBookingCancel() {
    if (isBookingSubmitting) return;
    resetChat();
  }

  function resetChat() {
    setMessages([
      {
        id: Date.now(),
        role: "assistant",
        content: initialAssistantMessage
      }
    ]);
    setSelectedHotel(null);
    setPendingHold(null);
    setBookingError(null);
    setHoldDraft({ checkIn: "", checkOut: "" });
    setHoldDraftError(null);
    setCompletedReservation(null);
  }

  function handleSuccessDismiss() {
    resetChat();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }

  function toggleSpeechInput() {
    if (isListening) {
      stopListening();
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechError("Speech input is not supported in this browser.");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    committedSpeechRef.current = input.trim();

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      if (finalText.trim()) {
        committedSpeechRef.current = [committedSpeechRef.current, finalText.trim()]
          .filter(Boolean)
          .join(" ");
      }

      setInput([committedSpeechRef.current, interimText.trim()].filter(Boolean).join(" "));
    };

    recognition.onerror = () => {
      setSpeechError("Speech input stopped. Check microphone permissions and try again.");
      stopListening();
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    setSpeechError(null);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }

  const completedPartnerships = useMemo(
    () => (completedReservation ? getHotelPartnerships(completedReservation) : []),
    [completedReservation]
  );

  if (pendingHold && !completedReservation) {
    return (
      <BookingPage
        hold={pendingHold}
        onSubmit={handleBookingSubmit}
        onCancel={handleBookingCancel}
        error={bookingError}
        isSubmitting={isBookingSubmitting}
      />
    );
  }

  if (completedReservation) {
    return (
      <PartnershipsPage
        reservation={completedReservation}
        partnerships={completedPartnerships}
        onDone={handleSuccessDismiss}
      />
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Chat history">
        <div className="sidebar-top">
          <button className="icon-button" aria-label="Toggle sidebar">
            <PanelLeft size={18} />
          </button>
          <button className="icon-button" aria-label="New chat">
            <Plus size={18} />
          </button>
        </div>
        <button className="search-button">
          <Search size={16} />
          Search chats
        </button>
        <nav className="chat-list">
          {chats.map((chat) => (
            <button key={chat} className="chat-item">
              {chat}
            </button>
          ))}
        </nav>
      </aside>

      <main className="chat">
        <header className="topbar">
          <button className="icon-button mobile-only" aria-label="Open menu">
            <Menu size={18} />
          </button>
          <strong>Claude</strong>
          <button className="account-button" aria-label="Account">
            <UserRound size={18} />
          </button>
        </header>

        <section className="messages" aria-live="polite">
          {messages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              <div className="avatar" aria-hidden="true">
                {message.role === "assistant" ? <Bot size={18} /> : <UserRound size={18} />}
              </div>
              <div className="message-body">
                <p>{message.content}</p>
                {message.role === "assistant" && message.hotels && message.hotels.length > 0 && (
                  <div className="hotel-options" aria-label="Hotel options">
                    {message.hotels.map((hotel) => (
                      <button
                        key={hotel.id}
                        type="button"
                        className="hotel-option"
                        disabled={isSending}
                        onClick={() => handleHotelOptionClick(hotel)}
                      >
                        <span className="hotel-option-name">{hotel.name}</span>
                        <span>{hotel.city}, {hotel.country}</span>
                        <span>
                          {hotel.currency} {hotel.nightlyRate.toFixed(2)}/night · {hotel.availableRooms} rooms
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
          <div ref={messagesEndRef} />

          {messages.length === 1 && (
            <>
              <div className="status-strip">
                <span>
                  <Building2 size={16} />
                  MCP hotel assistant
                </span>
                <span>
                  <BedDouble size={16} />
                  12-hour holds
                </span>
              </div>
            </>
          )}

          {messages.length === 1 && (
            <div className="starters">
              {starters.map((starter) => (
                <button
                  key={starter.label}
                  disabled={isSending}
                  onClick={() =>
                    starter.action === "viewAllHotels" ? void viewAllHotels() : void sendMessage(starter.label)
                  }
                >
                  {starter.label}
                </button>
              ))}
            </div>
          )}

          {selectedHotel && !pendingHold && !completedReservation && (
            <form className="hold-picker" onSubmit={handleHoldDraftSubmit}>
              <div className="hold-picker-header">
                <div>
                  <span>Selected hotel</span>
                  <strong>{selectedHotel.name}</strong>
                </div>
                <button
                  type="button"
                  className="booking-secondary"
                  onClick={() => {
                    setSelectedHotel(null);
                    setHoldDraftError(null);
                  }}
                  disabled={isSending}
                >
                  Change
                </button>
              </div>
              <div className="booking-row">
                <label>
                  Check-in
                  <input
                    type="date"
                    value={holdDraft.checkIn}
                    onChange={(event) => setHoldDraft((current) => ({ ...current, checkIn: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Check-out
                  <input
                    type="date"
                    value={holdDraft.checkOut}
                    onChange={(event) => setHoldDraft((current) => ({ ...current, checkOut: event.target.value }))}
                    required
                  />
                </label>
              </div>
              {holdDraftError && <p className="booking-error">{holdDraftError}</p>}
              <button type="submit" className="booking-primary" disabled={isSending}>
                Continue to guest details
              </button>
            </form>
          )}
        </section>

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Tell me about the trip you're picturing"
            rows={1}
          />
          <button
            className={`mic-button ${isListening ? "listening" : ""}`}
            type="button"
            aria-label={isListening ? "Stop speech input" : "Start speech input"}
            aria-pressed={isListening}
            disabled={!canUseSpeech || isSending}
            onClick={toggleSpeechInput}
            title={canUseSpeech ? "Dictate message" : "Speech input is not supported in this browser"}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button className="send-button" type="submit" aria-label="Send message" disabled={isSending}>
            <Send size={18} />
          </button>
        </form>
        {speechError && <p className="speech-error">{speechError}</p>}
      </main>
    </div>
  );
}

type BookingSubmitPayload = {
  contactMode: "guest" | "loyalty";
  firstName: string;
  lastName: string;
  email: string;
  loyaltyNumber: string;
  phone: string;
  last4: string;
};

type BookingPageProps = {
  hold: Hold;
  onSubmit: (payload: BookingSubmitPayload) => void;
  onCancel: () => void;
  error: string | null;
  isSubmitting: boolean;
};

function formatCardInput(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiryInput(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function splitName(full: string | null | undefined): { first: string; last: string } {
  if (!full) return { first: "", last: "" };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function getStayNights(checkIn: string, checkOut: string) {
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  const nights = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return Number.isFinite(nights) && nights > 0 ? nights : 1;
}

function BookingPage({ hold, onSubmit, onCancel, error, isSubmitting }: BookingPageProps) {
  const initial = splitName(hold.guestName);
  const [contactMode, setContactMode] = useState<"guest" | "loyalty">("guest");
  const [firstName, setFirstName] = useState(initial.first);
  const [lastName, setLastName] = useState(initial.last);
  const [email, setEmail] = useState(hold.guestEmail ?? "");
  const [loyaltyNumber, setLoyaltyNumber] = useState(hold.loyaltyNumber ?? "");
  const [phone, setPhone] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = cardNumber.replace(/\D/g, "");
    if (contactMode === "guest" && (!firstName.trim() || !lastName.trim())) {
      setLocalError("First and last name are required.");
      return;
    }
    if (contactMode === "loyalty" && !loyaltyNumber.trim()) {
      setLocalError("Enter a loyalty number.");
      return;
    }
    if (contactMode === "guest" && phone.replace(/\D/g, "").length < 7) {
      setLocalError("Enter a valid phone number.");
      return;
    }
    if (contactMode === "guest" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setLocalError("Enter a valid email address.");
      return;
    }
    if (digits.length < 13 || digits.length > 19) {
      setLocalError("Card number must be 13–19 digits.");
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) {
      setLocalError("Expiry must be MM/YY.");
      return;
    }
    if (cardCvc.length < 3) {
      setLocalError("CVV must be 3 or 4 digits.");
      return;
    }
    setLocalError(null);
    onSubmit({
      contactMode,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      loyaltyNumber: loyaltyNumber.trim(),
      phone: phone.trim(),
      last4: digits.slice(-4)
    });
  }

  const displayError = localError ?? error;
  const nights = getStayNights(hold.checkIn, hold.checkOut);
  const estimatedTotal = hold.hotel.nightlyRate * hold.rooms * nights;

  return (
    <main className="booking-page">
      <div className="booking-panel" aria-labelledby="booking-page-title">
        <header className="booking-header">
          <div>
            <button type="button" className="booking-back" onClick={onCancel} disabled={isSubmitting}>
              <ArrowLeft size={16} />
              Back to chat
            </button>
            <p className="booking-eyebrow">Reservation details</p>
            <h1 id="booking-page-title">Complete your stay</h1>
          </div>
          <span className="booking-step">Secure checkout</span>
        </header>

        <section className="booking-layout">
          <aside className="booking-summary">
            <span className="booking-summary-label">Your selected hotel</span>
            <span className="booking-summary-hotel">{hold.hotel.name}</span>
            <span className="booking-summary-location">{hold.hotel.city}, {hold.hotel.country}</span>
            <div className="booking-summary-grid">
              <span>
                <strong>Check-in</strong>
                {hold.checkIn}
              </span>
              <span>
                <strong>Check-out</strong>
                {hold.checkOut}
              </span>
              <span>
                <strong>Rooms</strong>
                {hold.rooms}
              </span>
              <span>
                <strong>Nights</strong>
                {nights}
              </span>
            </div>
            <div className="booking-rate-row">
              <span>Nightly rate</span>
              <strong>
                {hold.hotel.currency} {hold.hotel.nightlyRate.toFixed(2)}
              </strong>
            </div>
            <div className="booking-rate-row booking-rate-total">
              <span>Estimated total</span>
              <strong>
                {hold.hotel.currency} {estimatedTotal.toFixed(2)}
              </strong>
            </div>
            {hold.expiresAt && <span>Hold expires {new Date(hold.expiresAt).toLocaleString()}</span>}
          </aside>

          <form className="booking-form" onSubmit={handleSubmit}>
            <div className="booking-form-heading">
              <p className="booking-eyebrow">Guest information</p>
              <h2>Tell us who is checking in</h2>
            </div>
            <div className="hold-contact-toggle" role="group" aria-label="Contact method">
              <button
                type="button"
                className={contactMode === "guest" ? "active" : ""}
                onClick={() => setContactMode("guest")}
              >
                Guest details
              </button>
              <button
                type="button"
                className={contactMode === "loyalty" ? "active" : ""}
                onClick={() => setContactMode("loyalty")}
              >
                Loyalty number
              </button>
            </div>
            {contactMode === "guest" ? (
              <>
                <div className="booking-row">
                  <label>
                    First name
                    <input
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      autoComplete="given-name"
                      required
                    />
                  </label>
                  <label>
                    Last name
                    <input
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      autoComplete="family-name"
                      required
                    />
                  </label>
                </div>
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    placeholder="jane@example.com"
                    required
                  />
                </label>
                <label>
                  Phone number
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    autoComplete="tel"
                    placeholder="555-0100"
                    required
                  />
                </label>
              </>
            ) : (
              <label>
                Loyalty number
                <input
                  value={loyaltyNumber}
                  onChange={(event) => setLoyaltyNumber(event.target.value)}
                  placeholder="LOYALTY-12345"
                  required
                />
              </label>
            )}
            <div className="booking-form-heading booking-payment-heading">
              <p className="booking-eyebrow">Payment method</p>
              <h2>Guarantee your reservation</h2>
            </div>
            <label>
              Card number
              <input
                inputMode="numeric"
                value={cardNumber}
                onChange={(event) => setCardNumber(formatCardInput(event.target.value))}
                autoComplete="cc-number"
                placeholder="4242 4242 4242 4242"
                required
              />
            </label>
            <div className="booking-row">
              <label>
                Expiry
                <input
                  inputMode="numeric"
                  value={cardExpiry}
                  onChange={(event) => setCardExpiry(formatExpiryInput(event.target.value))}
                  autoComplete="cc-exp"
                  placeholder="MM/YY"
                  required
                />
              </label>
              <label>
                CVV
                <input
                  inputMode="numeric"
                  value={cardCvc}
                  onChange={(event) => setCardCvc(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  autoComplete="cc-csc"
                  placeholder="123"
                  required
                />
              </label>
            </div>

            {displayError && <p className="booking-error">{displayError}</p>}

            <div className="booking-actions">
              <button type="button" className="booking-secondary" onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" className="booking-primary" disabled={isSubmitting}>
                {isSubmitting ? "Booking..." : "Book reservation"}
              </button>
            </div>

            <p className="booking-disclaimer">
              Card details stay in your browser. Only a tokenized reference is sent to the server.
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}

type PartnershipsPageProps = {
  reservation: Hold;
  partnerships: Partnership[];
  onDone: () => void;
};

function PartnershipIcon({ type }: { type: Partnership["icon"] }) {
  if (type === "dining") return <Utensils size={22} />;
  if (type === "coffee") return <Coffee size={22} />;
  if (type === "ride") return <Car size={22} />;
  if (type === "air") return <Plane size={22} />;
  return <Gift size={22} />;
}

function PartnershipsPage({ reservation, partnerships, onDone }: PartnershipsPageProps) {
  const confirmationCode = reservation.id.slice(0, 8).toUpperCase();
  const nights = getStayNights(reservation.checkIn, reservation.checkOut);
  const estimatedTotal = reservation.hotel.nightlyRate * reservation.rooms * nights;

  return (
    <main className="partners-page">
      <section className="partners-hero">
        <div className="success-icon" aria-hidden="true">
          <CheckCircle2 size={48} />
        </div>
        <p className="partners-kicker">Reservation confirmed</p>
        <h1>{reservation.hotel.name}</h1>
        <p>{reservation.hotel.city}, {reservation.hotel.country}</p>
        <div className="confirmation-card" aria-label={`Confirmation number ${confirmationCode}`}>
          <span>Confirmation number</span>
          <strong>{confirmationCode}</strong>
        </div>
        <div className="confirmation-details">
          <span>
            <strong>Check-in</strong>
            {reservation.checkIn}
          </span>
          <span>
            <strong>Check-out</strong>
            {reservation.checkOut}
          </span>
          <span>
            <strong>Guests</strong>
            {reservation.guestName ?? "Guest"}
          </span>
          <span>
            <strong>Total</strong>
            {reservation.hotel.currency} {estimatedTotal.toFixed(2)}
          </span>
        </div>
        <a
          href={`?reservation=${reservation.id}`}
          className="confirmation-link"
        >
          View reservation
        </a>
      </section>

      <section className="partners-content" aria-labelledby="partners-title">
        <div className="partners-heading">
          <div>
            <p className="partners-kicker">Hotel partnerships</p>
            <h2 id="partners-title">Make the trip easier from here</h2>
          </div>
          <button type="button" className="success-button" onClick={onDone}>
            Back to chat
          </button>
        </div>

        <section className="partner-map-section" aria-labelledby="partner-map-title">
          <div>
            <p className="partners-kicker">Nearby map</p>
            <h3 id="partner-map-title">Around {reservation.hotel.name}</h3>
          </div>
          <div className="partner-map" aria-label={`Mock map of partners around ${reservation.hotel.name}`}>
            <div className="map-road map-road-main" />
            <div className="map-road map-road-cross" />
            <div className="map-road map-road-diagonal" />
            <div className="map-block map-block-one" />
            <div className="map-block map-block-two" />
            <div className="map-block map-block-three" />
            <div className="hotel-pin" style={{ top: "48%", left: "48%" }}>
              <Building2 size={18} />
              <span>{reservation.hotel.name}</span>
            </div>
            {partnerships.map((partner) => (
              <div
                key={partner.name}
                className="partner-pin"
                data-category={partner.icon}
                style={{ top: partner.mapPosition.top, left: partner.mapPosition.left }}
              >
                <PartnershipIcon type={partner.icon} />
                <span>{partner.name}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="partners-grid">
          {partnerships.map((partner) => (
            <article key={partner.name} className="partner-card" data-category={partner.icon}>
              <div className="partner-icon" aria-hidden="true">
                <PartnershipIcon type={partner.icon} />
              </div>
              <p>{partner.category}</p>
              <h3>{partner.name}</h3>
              <span>{partner.description}</span>
              <em>{partner.distance} from hotel</em>
              <strong>{partner.offer}</strong>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
