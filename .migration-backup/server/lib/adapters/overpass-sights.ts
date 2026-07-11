import { BaseAdapter, DataSourceParams } from "./base";
import { InsertSight } from "@shared/schema";

export class OverpassSightsAdapter extends BaseAdapter<InsertSight> {
  protected sourceName = "OpenStreetMap Overpass (Sights)";

  async fetch(params: DataSourceParams): Promise<any> {
    const { cityName, osmId } = params;
    const query = `[out:json][timeout:25];
      ${osmId ? `node(${osmId})->.city;` : `area["name"="${cityName}"]->.city;`}
      (
        node["tourism"~"museum|artwork|attraction|viewpoint|monument|gallery"](area.city);
        way["tourism"~"museum|artwork|attraction|viewpoint|monument|gallery"](area.city);
        node["historic"~"monument|memorial|castle|ruins|archaeological_site"](area.city);
        way["historic"~"monument|memorial|castle|ruins|archaeological_site"](area.city);
      );
      out center;`;
    
    const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error("Overpass API failed for sights");
    return response.json();
  }

  normalize(data: any): InsertSight[] {
    const elements = (data.elements || []) as any[];
    return elements.map(e => ({
      name: e.tags.name || e.tags["name:en"] || "Unnamed Sight",
      description: e.tags.description || e.tags["description:en"] || `${e.tags.tourism || e.tags.historic} in this city`,
      category: "other" as any, // Simple mapping for now
      latitude: (e.lat || e.center?.lat)?.toString(),
      longitude: (e.lon || e.center?.lon)?.toString(),
      officialWebsite: e.tags.website || e.tags["contact:website"],
      cityId: "", // To be filled by caller
      sourceName: this.sourceName,
      sourceExternalId: e.id.toString(),
      lastSyncedAt: new Date(),
      isActive: true
    }));
  }

  validate(data: InsertSight[]): boolean {
    return Array.isArray(data) && data.length > 0;
  }
}
