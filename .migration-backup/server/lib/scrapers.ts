import { 
  InsertCountry, InsertCity, InsertSight 
} from "@shared/schema";
import { imageService } from "./images";
import { RestCountriesAdapter } from "./adapters/rest-countries";
import { OverpassCitiesAdapter } from "./adapters/overpass-cities";
import { OverpassSightsAdapter } from "./adapters/overpass-sights";

/**
 * ScraperService provides methods to fetch geographic and touristic data.
 * Refactored to use the DataSourceAdapter pattern for unified data pulling.
 */
export class ScraperService {
  private countriesAdapter = new RestCountriesAdapter();
  private citiesAdapter = new OverpassCitiesAdapter();
  private sightsAdapter = new OverpassSightsAdapter();

  /**
   * Scrapes a list of countries using the RestCountriesAdapter.
   */
  async scrapeCountries(): Promise<InsertCountry[]> {
    try {
      const result = await this.countriesAdapter.execute({});
      
      // Background image processing for flags
      imageService.preProcessBatch((result as InsertCountry[]).map(c => c.flagUrl).filter(Boolean) as string[]);

      return result as InsertCountry[];
    } catch (error) {
      console.error("Scraping countries failed:", error);
      return [
        { code: "ID", name: "Indonesia", region: "Asia", isActive: true },
        { code: "US", name: "United States", region: "Americas", isActive: true },
      ] as InsertCountry[];
    }
  }

  /**
   * Scrapes cities for a specific country using the OverpassCitiesAdapter.
   */
  async scrapeCities(countryCode: string, countryId: string): Promise<InsertCity[]> {
    try {
      const result = await this.citiesAdapter.execute({ countryCode });
      return (result as InsertCity[]).map(city => ({ ...city, countryId }));
    } catch (error) {
      console.error("Scraping cities failed:", error);
      return [];
    }
  }

  /**
   * Scrapes sights for a specific city using the OverpassSightsAdapter.
   */
  async scrapeSights(cityId: string, cityName: string, osmId?: string): Promise<InsertSight[]> {
    try {
      const result = await this.sightsAdapter.execute({ cityName, osmId });
      return (result as InsertSight[]).map(sight => ({ ...sight, cityId }));
    } catch (error) {
      console.error("Scraping sights failed:", error);
      return [];
    }
  }

  /**
   * Enriches sight data using external knowledge bases (Placeholder for WikiData).
   */
  async enrichSightData(sightName: string): Promise<Partial<InsertSight>> {
    console.log(`[ScraperService] Enriching data for ${sightName}`);
    // This would be another adapter in a full implementation
    return {
      longDescription: `Full description for ${sightName} fetched from WikiData...`,
      dataQualityScore: 85
    };
  }
}

export const scraperService = new ScraperService();
