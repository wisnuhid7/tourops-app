import { BaseAdapter, DataSourceParams } from "./base";
import { InsertCountry } from "@shared/schema";

export class RestCountriesAdapter extends BaseAdapter<InsertCountry> {
  protected sourceName = "REST Countries";

  async fetch(params: DataSourceParams): Promise<any> {
    const response = await fetch("https://restcountries.com/v3.1/all?fields=name,cca2,cca3,region,subregion,currencies,timezones,capital,languages,idd,flags,latlng,population,continents");
    if (!response.ok) throw new Error("Failed to fetch from REST Countries");
    return response.json();
  }

  normalize(data: any[]): InsertCountry[] {
    return data.map(c => ({
      code: c.cca2,
      iso3: c.cca3,
      name: c.name.common,
      capitalCity: c.capital?.[0],
      continent: c.continents?.[0],
      region: c.region,
      subregion: c.subregion,
      currencyCode: Object.keys(c.currencies || {})[0],
      currencyName: c.currencies?.[Object.keys(c.currencies || {})[0]]?.name,
      languages: Object.values(c.languages || {}) as string[],
      phoneCode: c.idd?.root ? `${c.idd.root}${(c.idd.suffixes || [""])[0]}` : undefined,
      flagUrl: c.flags?.svg || c.flags?.png,
      latitude: c.latlng?.[0]?.toString(),
      longitude: c.latlng?.[1]?.toString(),
      population: c.population,
      sourceName: this.sourceName,
      sourceExternalId: c.cca2,
      lastSyncedAt: new Date(),
      isActive: true
    }));
  }

  validate(data: InsertCountry[]): boolean {
    return Array.isArray(data) && data.length > 0 && !!data[0].code && !!data[0].name;
  }
}
