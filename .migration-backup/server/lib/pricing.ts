import { storage } from "../storage";
import { type MarkupRule, type GlobalSetting, type Tour } from "@shared/schema";

export class PricingService {
  /**
   * Calculates the full cost and final price for a tour.
   * Total = (Sum of base costs) + (Sum of markups) + Service Fees
   */
  async calculateTourPrice(tourId: string) {
    const tour = await storage.getTour(tourId);
    if (!tour) throw new Error("Tour not found");

    const tourDays = await storage.getTourDays(tourId);
    const rules = await storage.getMarkupRules();
    const settings = await storage.getGlobalSettings();

    let totalBaseCost = 0;
    let totalMarkupAmount = 0;

    // Breakdown for transparency
    const breakdown: any[] = [];

    // 1. Initial Base Cost (from Tour header)
    if (parseFloat(tour.basePrice?.toString() || "0") > 0) {
      const headerCost = parseFloat(tour.basePrice.toString());
      totalBaseCost += headerCost;
      breakdown.push({
        item: "Tour Header Base Cost",
        cost: headerCost,
        type: "base"
      });
    }

    // 2. Aggregate costs from all Day Items
    for (const day of tourDays) {
      const items = await storage.getTourDayItems(day.id);
      for (const item of items) {
        const itemCost = parseFloat(item.cost.toString() || "0");
        if (itemCost > 0) {
          totalBaseCost += itemCost;
          
          // Determine specific markup for this item type
          const itemMarkupPercent = await this.getMarkupPercentage(rules, day.countryCode || undefined, item.itemType);
          const itemMarkup = itemCost * (itemMarkupPercent / 100);
          totalMarkupAmount += itemMarkup;

          breakdown.push({
            item: `[Day ${day.dayNumber}] ${item.title}`,
            cost: itemCost,
            markup: itemMarkup,
            type: "item"
          });
        }
      }
    }

    // 3. Fallback Markup (for costs not already marked up)
    // For now, if no items were added, apply a general markup to the basePrice
    if (totalMarkupAmount === 0 && totalBaseCost > 0) {
      const primaryCountryId = tour.countries && tour.countries.length > 0 ? tour.countries[0] : undefined;
      const generalMarkupPercent = await this.getMarkupPercentage(rules, primaryCountryId, 'all');
      totalMarkupAmount = totalBaseCost * (generalMarkupPercent / 100);
      
      breakdown.push({
        item: `General Markup (${generalMarkupPercent}%)`,
        amount: totalMarkupAmount,
        type: "markup"
      });
    }

    // 4. Service Fee
    const serviceFeeSetting = settings.find(s => s.key === 'default_service_fee');
    const serviceFee = parseFloat(serviceFeeSetting?.value || "0");
    if (serviceFee > 0) {
      breakdown.push({
        item: "Service Fee",
        amount: serviceFee,
        type: "fee"
      });
    }

    const finalPrice = totalBaseCost + totalMarkupAmount + serviceFee;

    // 5. Profitability Analysis
    const taxSetting = settings.find(s => s.key === 'sales_tax_percent');
    const taxPercent = parseFloat(taxSetting?.value || "0");
    const totalTax = finalPrice * (taxPercent / 100);
    const netProfit = finalPrice - totalBaseCost - totalTax;
    const margin = finalPrice > 0 ? (netProfit / finalPrice) * 100 : 0;

    return {
      tourId,
      baseCost: totalBaseCost,
      markupAmount: totalMarkupAmount,
      serviceFee,
      totalPrice: finalPrice,
      tax: totalTax,
      netProfit,
      marginPercentage: margin,
      currency: "USD",
      breakdown
    };
  }

  /**
   * Internal logic to find the best markup rule.
   */
  private async getMarkupPercentage(rules: MarkupRule[], countryId?: string, serviceType: string = 'all'): Promise<number> {
    // 1. Exact match (Country + Service)
    let rule = rules.find(r => r.isActive && r.countryId === countryId && r.serviceType === serviceType);
    if (rule) return parseFloat(rule.markupPercentage.toString());

    // 2. Country match (All services)
    rule = rules.find(r => r.isActive && r.countryId === countryId && r.serviceType === 'all');
    if (rule) return parseFloat(rule.markupPercentage.toString());

    // 3. Global Service match
    rule = rules.find(r => r.isActive && !r.countryId && r.serviceType === serviceType);
    if (rule) return parseFloat(rule.markupPercentage.toString());

    // 4. Global Fallback
    rule = rules.find(r => r.isActive && !r.countryId && r.serviceType === 'all');
    return parseFloat(rule?.markupPercentage?.toString() || "10");
  }
}

export const pricingService = new PricingService();
