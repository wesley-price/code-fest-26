import React, { FormEvent, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BedDouble,
  Bot,
  Building2,
  Menu,
  Mic,
  MicOff,
  PanelLeft,
  Plus,
  Search,
  Send,
  UserRound
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

type ChatResponse = {
  reply?: string;
  data?: unknown;
};

type Starter = {
  label: string;
  action: "viewAllHotels" | "sendMessage";
};

const starters: Starter[] = [
  { label: "View all hotels", action: "viewAllHotels" },
  { label: "Find hotels in Chicago", action: "sendMessage" },
  { label: "Hold Riverfront from May 28th to May 30th with loyalty number LOYALTY-12345", action: "sendMessage" },
  { label: "Reserve hotel 2 from 2026-07-10 to 2026-07-12 for Jane Guest jane@example.com", action: "sendMessage" }
];

function fallbackReply(message: string) {
  return `I could not reach the MCP hotel assistant. Your message was: "${message}". Make sure the Spring API is running on port 8080 and the MCP HTTP adapter is running on port 8790.`;
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

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      content:
        "I can search hotel locations and place a temporary room hold. Ask for hotels by city, or say something like: Hold Riverfront from May 28th to May 30th with loyalty number LOYALTY-12345."
    }
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [lastHotels, setLastHotels] = useState<Hotel[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const committedSpeechRef = useRef("");

  const chats = useMemo(
    () => ["Hotel search", "Loyalty holds", "Guest holds", "Reservation completion"],
    []
  );

  const canUseSpeech = typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || isSending) return;
    const prepared = prepareOutboundMessage(trimmed, lastHotels);

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: trimmed
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");

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

    try {
      const response = await fetch("/mcp/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prepared.message })
      });

      if (!response.ok) throw new Error("API request failed");
      const data = (await response.json()) as ChatResponse;
      const responseHotels = extractHotelsFromResponse(data.data);
      if (responseHotels) {
        setLastHotels(responseHotels);
      }

      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: data.reply ?? fallbackReply(trimmed)
        }
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: fallbackReply(trimmed)
        }
      ]);
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
          <strong>HotelGPT</strong>
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
              <p>{message.content}</p>
            </article>
          ))}

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
        </section>

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about locations or reserve a room"
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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
