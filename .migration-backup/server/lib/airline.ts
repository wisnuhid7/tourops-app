import { storage } from "../storage";

/**
 * AirlineService provides tools for searching and generating realistic airline ticket prices.
 */
export class AirlineService {
  /**
   * Searches for flight prices based on parameters with realistic volatility.
   */
  async searchFlights(params: {
    origin: string;
    destination: string;
    date: string;
    passengers?: number;
    cabinClass?: "economy" | "business" | "first";
  }) {
    const { origin, destination, date, passengers = 1, cabinClass = "economy" } = params;

    const airlines = [
      { name: "Global Airways", code: "GA", baseMultiplier: 1.0 },
      { name: "SkyLink Airlines", code: "SL", baseMultiplier: 1.2 },
      { name: "SwiftJet", code: "SJ", baseMultiplier: 0.85 },
      { name: "Oceanic Air", code: "OA", baseMultiplier: 1.5 },
    ];

    const cabinMultipliers = {
      economy: 1.0,
      business: 2.8,
      first: 6.0,
    };

    // 1. Base Distance Calculation (Simulated)
    const getHash = (s: string) => Math.abs(s.split("").reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0));
    const distanceSeed = (getHash(origin) + getHash(destination)) % 5000 + 500;
    const basePrice = (distanceSeed * 0.1) + 150; // $0.1 per "unit" + base fee

    // 2. Lead Time Factor (Days until departure)
    const departureDate = new Date(date);
    const today = new Date();
    const daysUntilDeparture = Math.max(0, Math.ceil((departureDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    
    let leadTimeMultiplier = 1.0;
    if (daysUntilDeparture < 7) leadTimeMultiplier = 2.5; // Last minute surge
    else if (daysUntilDeparture < 21) leadTimeMultiplier = 1.8;
    else if (daysUntilDeparture < 60) leadTimeMultiplier = 1.2;
    else leadTimeMultiplier = 0.95; // Early bird discount

    // 3. Seasonality Factor (Simulated)
    const month = departureDate.getMonth();
    const isHighSeason = [5, 6, 11].includes(month); // June, July, December
    const seasonalityMultiplier = isHighSeason ? 1.4 : 1.0;

    const flights = airlines.map(airline => {
      const pricePerPerson = Math.floor(
        basePrice * 
        airline.baseMultiplier * 
        cabinMultipliers[cabinClass] * 
        leadTimeMultiplier * 
        seasonalityMultiplier * 
        (0.9 + Math.random() * 0.2) // 10% random jitter
      );
      
      const durationHours = Math.max(1, Math.floor(distanceSeed / 500));
      const flightNumber = `${airline.code}${Math.floor(Math.random() * 900) + 100}`;
      
      const flightResult = {
        id: `FL-${airline.code}-${getHash(date).toString().slice(0, 4)}`,
        airlineName: airline.name,
        airlineCode: airline.code,
        flightNumber,
        origin,
        destination,
        departureTime: `${date}T${10 + (getHash(airline.name) % 10)}:00:00`,
        arrivalTime: `${date}T${10 + (getHash(airline.name) % 10) + durationHours}:00:00`,
        duration: `${durationHours}h 00m`,
        price: pricePerPerson * passengers,
        pricePerPerson,
        currency: "USD",
        cabinClass,
        seatsAvailable: 2 + Math.floor(Math.random() * 40),
      };

      // 4. Save to Price Snapshots (Background)
      storage.createFlightPriceSnapshot({
        originAirport: origin,
        destinationAirport: destination,
        departureDate: date,
        airline: airline.name,
        priceTotal: String(pricePerPerson),
        currency: "USD",
        supplierName: "Tourop Simulated API"
      }).catch(e => console.error("Failed to save flight snapshot:", e));

      return flightResult;
    });

    return flights.sort((a, b) => a.price - b.price);
  }
}

export const airlineService = new AirlineService();
