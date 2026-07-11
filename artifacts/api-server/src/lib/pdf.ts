import puppeteer from "puppeteer";
import { storage } from "../storage";
import { pricingService } from "./pricing";

export class PdfService {
  /**
   * Generates a professional PDF itinerary for a tour.
   */
  async generateItinerary(tourId: string): Promise<Buffer> {
    const tour = await storage.getTour(tourId);
    if (!tour) throw new Error("Tour not found");

    const days = await storage.getTourDays(tourId);
    const pricing = await pricingService.calculateTourPrice(tourId);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Helvetica', 'Arial', sans-serif; color: #333; line-height: 1.6; padding: 40px; }
          .header { text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 30px; }
          .logo { font-size: 28px; font-weight: bold; color: #3b82f6; font-style: italic; }
          .tour-title { font-size: 32px; margin: 10px 0; color: #1e293b; }
          .meta { color: #64748b; font-size: 14px; margin-bottom: 20px; }
          .section { margin-bottom: 30px; }
          .section-title { font-size: 20px; color: #3b82f6; border-left: 4px solid #3b82f6; padding-left: 10px; margin-bottom: 15px; }
          .day { margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 8px; }
          .day-header { font-weight: bold; color: #1e293b; margin-bottom: 5px; }
          .price-box { background: #3b82f6; color: white; padding: 20px; border-radius: 8px; text-align: right; margin-top: 40px; }
          .price-val { font-size: 24px; font-weight: bold; }
          .footer { margin-top: 50px; font-size: 10px; text-align: center; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">TourOps HQ</div>
          <h1 class="tour-title">${tour.title}</h1>
          <div class="meta">${tour.duration} Days | ${tour.countries?.join(", ")}</div>
        </div>

        <div class="section">
          <p>${tour.description || ""}</p>
        </div>

        <div class="section">
          <div class="section-title">Daily Itinerary</div>
          ${await Promise.all(days.map(async day => {
            const items = await storage.getTourDayItems(day.id);
            return `
              <div class="day">
                <div class="day-header">Day ${day.dayNumber}: ${day.title}</div>
                <div class="day-content">
                  ${day.description ? `<p style="margin-bottom: 10px; font-style: italic;">${day.description}</p>` : ''}
                  <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                    ${items.map(item => `
                      <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 5px 0; width: 60px; color: #64748b; font-family: monospace;">${item.startTime || '--:--'}</td>
                        <td style="padding: 5px 0; font-weight: bold;">${item.title}</td>
                        <td style="padding: 5px 0; color: #64748b;">${item.description || ''}</td>
                      </tr>
                    `).join('')}
                  </table>
                </div>
              </div>
            `;
          })).then(results => results.join(''))}
        </div>

        <div class="price-box">
          <div>Estimated Total Price</div>
          <div class="price-val">${pricing.currency} ${pricing.totalPrice.toLocaleString()}</div>
          <div style="font-size: 12px; opacity: 0.8;">Per person, including taxes and fees</div>
        </div>

        <div class="footer">
          &copy; ${new Date().getFullYear()} Tourop Travel Infrastructure. All rights reserved. 
          Generated on ${new Date().toLocaleDateString()}.
        </div>
      </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'load' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
    });

    await browser.close();
    return Buffer.from(pdfBuffer);
  }
}

export const pdfService = new PdfService();
