export interface DataSourceParams {
  [key: string]: any;
}

export interface DataSourceAdapter<T> {
  /**
   * Fetches raw data from the external source.
   */
  fetch(params: DataSourceParams): Promise<any>;

  /**
   * Normalizes the raw data into the expected format.
   */
  normalize(data: any): T | T[];

  /**
   * Validates the normalized data against a schema (e.g., Zod).
   */
  validate(data: T | T[]): boolean;
}

export abstract class BaseAdapter<T> implements DataSourceAdapter<T> {
  protected abstract sourceName: string;

  async execute(params: DataSourceParams): Promise<T | T[]> {
    try {
      const rawData = await this.fetch(params);
      const normalizedData = this.normalize(rawData);
      if (!this.validate(normalizedData)) {
        throw new Error(`Validation failed for data from ${this.sourceName}`);
      }
      return normalizedData;
    } catch (error: any) {
      console.error(`[${this.sourceName} Adapter Error]`, error.message);
      throw error;
    }
  }

  abstract fetch(params: DataSourceParams): Promise<any>;
  abstract normalize(data: any): T | T[];
  abstract validate(data: T | T[]): boolean;
}
