import OpenAI from "openai";
import { storage } from "../storage";

// Initialize OpenAI client. Prefer the Replit AI Integrations proxy (no API key
// required, billed to Replit credits); fall back to a raw OPENAI_API_KEY if set.
const openai = new OpenAI({
  apiKey:
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "sk-placeholder-not-configured",
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
});

// True when a usable AI backend is configured (integration proxy or raw key).
const AI_ENABLED = !!(
  (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL &&
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY) ||
  process.env.OPENAI_API_KEY
);

export interface TourGenerationParams {
  destination: string;
  duration: number;
  travelerType: string;
  interests: string[];
  budget: string;
  pace: string;
}

export class AIService {
  /**
   * Generates a structured tour itinerary based on user preferences.
   * Now includes verified context from our database.
   */
  async generateItinerary(params: TourGenerationParams) {
    const { destination, duration, travelerType, interests, budget, pace } = params;

    // Fetch verified context from DB (Top 10 sights and hotels for the destination)
    // For now we search by destination name in city/country
    const allSights = await storage.getAllSights();
    const verifiedSights = allSights
      .filter(s => s.name.toLowerCase().includes(destination.toLowerCase()))
      .slice(0, 15)
      .map(s => ({ id: s.id, name: s.name, description: s.description, cost: s.individualTicketCost }));

    const allHotels = await storage.getAllHotels();
    const verifiedHotels = allHotels
      .filter(h => h.name.toLowerCase().includes(destination.toLowerCase()))
      .slice(0, 10)
      .map(h => ({ id: h.id, name: h.name, cost: h.basePrice }));

    const systemPrompt = `
      You are Tourop AI Tour Builder.
      Your goal is to build a realistic day-by-day travel itinerary with structured items.
      
      VERIFIED DATA (Use these if applicable):
      Sights: ${JSON.stringify(verifiedSights)}
      Hotels: ${JSON.stringify(verifiedHotels)}

      RULES:
      1. Use only realistic geography and travel times.
      2. Priority: Use VERIFIED DATA provided above. If you use a verified sight/hotel, include its "id".
      3. If you suggest something NOT in the verified data, set "needsConfirmation" to true.
      4. Each day must have 3-5 structured items (Sight, Meal, Hotel, Transport).
      5. The output MUST be a valid JSON object matching the requested schema.
      6. Tone: Professional, inspiring, and helpful.
    `;

    const userPrompt = `
      Create a ${duration}-day itinerary for ${destination}.
      Traveler Type: ${travelerType}
      Interests: ${interests.join(", ")}
      Budget Level: ${budget}
      Pace: ${pace}
      
      The JSON output should have:
      - title: A catchy name for the tour.
      - description: A brief summary.
      - category: One of [cultural, adventure, religious, leisure].
      - highlights: A short string of key highlights (max 3 sentences).
      - inclusions: A string describing what is included (comma separated).
      - exclusions: A string describing what is not included (comma separated).
      - internalNotes: Any recommendations or notes for the travel agent (string).
      - basePrice: An estimated base price for the tour per person (number).
      - childPrice: An estimated price for a child (number, usually 70-80% of base).
      - singleSupplement: Estimated extra cost for solo traveler (number).
      - tags: An array of string tags (e.g., ["adventure", "beach", "family"]).
      - countryCode: The 2-letter ISO country code of the main destination (e.g., "ID" for Indonesia).
      - imageUrl: A highly descriptive prompt for an AI image generator to create a beautiful 16:9 4k travel photography cover image for this tour.
      - days: An array of ${duration} objects, each with:
        - dayNumber: number
        - title: Title of the day
        - city: The name of the city for this day (string).
        - countryCode: 2-letter ISO country code for this day.
        - description: Summary of the day
        - activities: A comma-separated string of sights/activities for the day.
        - imageUrl: A descriptive prompt for an AI image generator focusing on the key sight of the day.
        - items: Array of objects:
          - itemType: [sight, meal, hotel, transport, flight, custom]
          - startTime: "HH:MM"
          - title: Name of activity
          - description: Short detail
          - cost: estimated cost (number)
          - sightId: (string, if from verified sights)
          - hotelId: (string, if from verified hotels)
          - needsConfirmation: boolean
    `;

    try {
      if (!AI_ENABLED) {
        console.warn("No AI backend configured. Generating fallback itinerary.");
        return generateFallbackItinerary(params, verifiedSights, verifiedHotels);
      }

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      if (!content) throw new Error("AI returned empty content");
      
      return JSON.parse(content);
    } catch (error) {
      console.error("AI generation failed, returning fallback:", error);
      return generateFallbackItinerary(params, verifiedSights, verifiedHotels);
    }
  }

  /**
   * Enriches a sight's description.
   */
  async enrichSightDescription(name: string, currentDescription: string) {
    const prompt = `
      As a professional travel copywriter, rewrite and enrich the description for the following tourist attraction:
      Name: ${name}
      Original Description: ${currentDescription}
      
      The new description should be engaging, informative (around 100-150 words), and suitable for a high-end travel website. 
      Focus on historical significance, key features, and why it's a must-visit.
    `;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [{ role: "user", content: prompt }]
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error("AI enrichment failed:", error);
      throw new Error("Failed to enrich description with AI");
    }
  }
  /**
   * Analyzes global business performance and provides strategic advice.
   */
  async analyzeBusinessPerformance(stats: any) {
    const prompt = `
      You are a Senior Strategic Consultant for Tourop, a travel operations platform.
      Review the following global sales statistics and provide a professional strategic analysis.
      
      STATS:
      ${JSON.stringify(stats, null, 2)}
      
      OBJECTIVE:
      1. Analyze the Gross Sales vs Net Profit.
      2. Evaluate the top performing tours and their margin health.
      3. Provide 3 specific, actionable recommendations to increase revenue or efficiency.
      4. Suggest pricing adjustments for underperforming or high-demand assets.
      
      OUTPUT FORMAT:
      Return a JSON object with:
      - executiveSummary: string (2-3 sentences)
      - insights: string[] (at least 4 bullet points)
      - recommendations: { title: string, description: string, expectedImpact: string }[]
      - pricingTips: string[]
      
      Tone: Executive, data-driven, and forward-looking.
    `;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      if (!content) throw new Error("AI returned empty analysis");
      
      return JSON.parse(content);
    } catch (error) {
      console.error("AI analysis failed:", error);
      throw new Error("Failed to analyze performance with AI");
    }
  }

  /**
   * Translates tour content to Spanish (ES) and Indonesian (ID).
   */
  async translateTourContent(content: any) {
    const prompt = `
      You are an expert travel translator.
      Translate the following tour data into Spanish (es) and Indonesian (id).
      Maintain the same formatting (e.g. line breaks for bullet points).
      Do NOT translate proper nouns (names of cities, specific hotels) if they shouldn't be translated.
      
      DATA TO TRANSLATE:
      ${JSON.stringify(content, null, 2)}
      
      OUTPUT FORMAT:
      Return a JSON object containing two keys: "es" and "id".
      Inside each key, provide the translated data matching the exact keys passed in the input data.
      Example:
      {
        "es": { "title": "...", "description": "..." },
        "id": { "title": "...", "description": "..." }
      }
    `;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const result = response.choices[0].message.content;
      if (!result) throw new Error("AI returned empty translation");
      
      return JSON.parse(result);
    } catch (error) {
      console.error("AI translation failed:", error);
      throw new Error("Failed to translate content with AI");
    }
  }

  /**
   * Translates a whole tour (marketing fields) plus its itinerary days into
   * Spanish (es) and Indonesian (id) in a single AI call. Days are keyed by
   * their dayNumber so ordering can never be misaligned on the way back.
   */
  async translateTourBundle(input: {
    tour: Record<string, string>;
    days: Array<Record<string, string | number>>;
  }): Promise<{
    es: { tour: Record<string, string>; days: Record<string, Record<string, string>> };
    id: { tour: Record<string, string>; days: Record<string, Record<string, string>> };
  }> {
    if (!AI_ENABLED) {
      throw new Error("No AI backend configured for translation");
    }

    const prompt = `
      You are an expert travel translator.
      Translate the provided tour content into Spanish ("es") and Indonesian ("id").

      RULES:
      1. Preserve formatting exactly (line breaks, bullet separators, commas).
      2. Do NOT translate proper nouns (city, hotel, brand names) unless they have a
         well-established localized form.
      3. Keep the EXACT same content JSON keys as the input for every object.
      4. Every day in input.days MUST appear in both "es".days and "id".days, keyed by
         its "id" value (a string). Do NOT translate or alter the id.
      5. All translated values MUST be plain strings.

      INPUT (JSON):
      ${JSON.stringify(input, null, 2)}

      OUTPUT FORMAT — return ONLY this JSON shape:
      {
        "es": { "tour": { <same content keys as input.tour> }, "days": { "<day id>": { <same content keys as each day except id> } } },
        "id": { "tour": { ... }, "days": { "<day id>": { ... } } }
      }
    `;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const result = response.choices[0].message.content;
      if (!result) throw new Error("AI returned empty translation");

      return JSON.parse(result);
    } catch (error) {
      console.error("AI tour translation failed:", error);
      throw new Error("Failed to translate tour with AI");
    }
  }

  /**
   * Generic record translation: takes a flat list of records ({ id, ...textFields })
   * and returns Spanish + Indonesian translations keyed by record id.
   */
  async translateRecords(
    records: Array<Record<string, string>>,
  ): Promise<{
    es: Record<string, Record<string, string>>;
    id: Record<string, Record<string, string>>;
  }> {
    if (!AI_ENABLED) {
      throw new Error("No AI backend configured for translation");
    }

    const prompt = `
      You are an expert travel translator.
      Translate the text fields of each record into Spanish ("es") and Indonesian ("id").

      RULES:
      1. Preserve formatting exactly (line breaks, bullet separators, commas).
      2. Do NOT translate proper nouns (people, city, hotel, brand names) unless they
         have a well-established localized form.
      3. Keep the EXACT same content keys as each input record (all keys except "id").
      4. Every record MUST appear in both "es" and "id", keyed by its "id" value
         (a string). Do NOT translate or alter the id.
      5. All translated values MUST be plain strings.

      INPUT (JSON array of records):
      ${JSON.stringify(records, null, 2)}

      OUTPUT FORMAT — return ONLY this JSON shape:
      {
        "es": { "<record id>": { <same content keys as that record> } },
        "id": { "<record id>": { ... } }
      }
    `;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const result = response.choices[0].message.content;
      if (!result) throw new Error("AI returned empty translation");

      return JSON.parse(result);
    } catch (error) {
      console.error("AI record translation failed:", error);
      throw new Error("Failed to translate records with AI");
    }
  }
}

function generateFallbackItinerary(params: TourGenerationParams, verifiedSights: any[], verifiedHotels: any[]) {
  const { destination, duration, travelerType } = params;
  
  const days = [];
  for (let i = 1; i <= duration; i++) {
    const sight = verifiedSights[(i - 1) % Math.max(1, verifiedSights.length)] || { id: "s-1", name: `Sightseeing in ${destination}`, description: "Local highlights", cost: 0 };
    const hotel = verifiedHotels[(i - 1) % Math.max(1, verifiedHotels.length)] || { id: "h-1", name: `Hotel in ${destination}`, cost: 150 };
    
    days.push({
      dayNumber: i,
      title: `Day ${i} in ${destination}`,
      city: destination,
      countryCode: "ID",
      description: `Exploring the highlights of ${destination}.`,
      activities: `${sight.name}, Local exploring`,
      imageUrl: `A beautiful travel photo of ${sight.name} in ${destination}`,
      items: [
        {
          itemType: "sight",
          startTime: "09:00",
          title: sight.name,
          description: sight.description || "Sightseeing tour",
          cost: String(sight.cost || 0),
          sightId: sight.id,
          needsConfirmation: false
        },
        {
          itemType: "meal",
          startTime: "13:00",
          title: "Local Lunch",
          description: "Enjoy local cuisine",
          cost: "25",
          needsConfirmation: true
        },
        {
          itemType: "hotel",
          startTime: "18:00",
          title: hotel.name,
          description: "Check-in for the night",
          cost: String(hotel.cost || 150),
          hotelId: hotel.id,
          needsConfirmation: false
        }
      ]
    });
  }

  return {
    title: `${duration} Days in ${destination} for ${travelerType}`,
    description: `A generated itinerary for ${destination}.`,
    category: "leisure",
    highlights: `Experience the best of ${destination}. Enjoy the local culture and attractions.`,
    inclusions: "Accommodation, Breakfast, Transport",
    exclusions: "Flights, Personal expenses, Insurance",
    internalNotes: "Standard package",
    basePrice: 500 * duration,
    childPrice: 400 * duration,
    singleSupplement: 150 * duration,
    tags: ["leisure", "sightseeing", destination.toLowerCase()],
    countryCode: "ID",
    imageUrl: `A stunning wide-angle travel photography shot of ${destination}`,
    days
  };
}

export const aiService = new AIService();
