import { BaseAdapter, DataSourceParams } from "./base";
import { InsertCity } from "@shared/schema";

export class OverpassCitiesAdapter extends BaseAdapter<InsertCity> {
  protected sourceName = "OpenStreetMap Overpass";

  async fetch(params: DataSourceParams): Promise<any> {
    const { countryCode } = params;
    const query = `[out:json][timeout:25];
      area["ISO3166-1"="${countryCode}"]["admin_level"="2"]->.searchArea;
      (
        node["place"="city"](area.searchArea);
        node["place"="town"](area.searchArea);
      );
      out body;`;
    
    const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error("Overpass API failed for cities");
    return response.json();
  }

  normalize(data: any): InsertCity[] {
    const elements = (data.elements || []) as any[];
    return elements.map(e => ({
      name: e.tags.name,
      asciiName: e.tags["name:en"] || e.tags.name,
      population: parseInt(e.tags.population || "0"),
      latitude: e.lat.toString(),
      longitude: e.lon.toString(),
      osmId: e.id.toString(),
      isCapital: e.tags.admin_level === "2" || e.tags.capital === "yes"
    }))
    .sort((a, b) => (b.population || 0) - (a.population || 0))
    .slice(0, 50)
    .map(c => ({
      ...c,
      countryId: "", // To be filled by caller
      population: c.population > 0 ? c.population : undefined,
      isTourismCity: (c.population || 0) > 100000,
      isAirportCity: c.isCapital,
      sourceName: this.sourceName,
      lastSyncedAt: new Date(),
      isActive: true
    }));
  }

  validate(data: InsertCity[]): boolean {
    return Array.isArray(data) && data.length > 0;
  }
}
