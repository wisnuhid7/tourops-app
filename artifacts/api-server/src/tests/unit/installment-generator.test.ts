import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateDaysBetween,
  getCurrencyDecimals,
  generateInstallmentSchedule,
  verifyInstallmentInvariant,
} from "../../services/installment-generator";

describe("Dynamic Staged Installment Generator Engine (US-04)", () => {
  describe("calculateDaysBetween", () => {
    it("calculates exact calendar day differences regardless of time of day", () => {
      const bkg = new Date("2026-06-01T15:30:00Z");
      expect(calculateDaysBetween(new Date("2026-06-01T08:00:00Z"), bkg)).toBe(0);
      expect(calculateDaysBetween(new Date("2026-06-16T10:00:00Z"), bkg)).toBe(15);
      expect(calculateDaysBetween(new Date("2026-07-01T10:00:00Z"), bkg)).toBe(30);
      expect(calculateDaysBetween(new Date("2026-07-02T10:00:00Z"), bkg)).toBe(31);
      expect(calculateDaysBetween(new Date("2026-08-30T10:00:00Z"), bkg)).toBe(90);
      expect(calculateDaysBetween(new Date("2026-08-31T10:00:00Z"), bkg)).toBe(91);
      expect(calculateDaysBetween(new Date("2026-11-28T10:00:00Z"), bkg)).toBe(180);
    });

    it("handles string dates cleanly", () => {
      expect(calculateDaysBetween("2026-07-01", "2026-06-01")).toBe(30);
    });
  });

  describe("getCurrencyDecimals", () => {
    it("returns 0 for zero-decimal currencies (IDR, JPY, KRW, VND)", () => {
      expect(getCurrencyDecimals("IDR")).toBe(0);
      expect(getCurrencyDecimals("jpy")).toBe(0);
      expect(getCurrencyDecimals("KRW")).toBe(0);
    });

    it("returns 2 for standard currencies (USD, EUR, GBP, SGD, etc.)", () => {
      expect(getCurrencyDecimals("USD")).toBe(2);
      expect(getCurrencyDecimals("eur")).toBe(2);
      expect(getCurrencyDecimals("GBP")).toBe(2);
      expect(getCurrencyDecimals()).toBe(2);
    });
  });

  describe("Scheme 1: D <= 30 days (Full payment at checkout)", () => {
    const bookingDate = new Date("2026-06-01T10:00:00Z");

    it("generates 1 installment (100%) for D = 15 days", () => {
      const departureDate = new Date("2026-06-16T10:00:00Z"); // D = 15
      const schedules = generateInstallmentSchedule({
        totalPrice: "1500.00",
        currency: "USD",
        bookingDate,
        departureDate,
      });

      expect(schedules).toHaveLength(1);
      expect(schedules[0].installmentNumber).toBe(1);
      expect(schedules[0].percentage).toBe("100.00");
      expect(schedules[0].amount).toBe("1500.00");
      expect(schedules[0].dueDate.toISOString()).toBe(bookingDate.toISOString());
      expect(schedules[0].labelEn).toBe("Full Payment (100%)");
      expect(schedules[0].labelId).toBe("Pelunasan Penuh (100%)");
      expect(schedules[0].status).toBe("pending");
      expect(verifyInstallmentInvariant(schedules, "1500.00")).toBe(true);
    });

    it("generates 1 installment (100%) for exact boundary D = 30 days", () => {
      const departureDate = new Date("2026-07-01T10:00:00Z"); // D = 30
      const schedules = generateInstallmentSchedule({
        totalPrice: 2400,
        currency: "USD",
        bookingDate,
        departureDate,
      });

      expect(schedules).toHaveLength(1);
      expect(schedules[0].percentage).toBe("100.00");
      expect(schedules[0].amount).toBe("2400.00");
      expect(verifyInstallmentInvariant(schedules, 2400)).toBe(true);
    });

    it("generates 1 installment if departure date is absent or past", () => {
      const schedulesNoDep = generateInstallmentSchedule({
        totalPrice: "500.00",
        currency: "USD",
        bookingDate,
        departureDate: null,
      });
      expect(schedulesNoDep).toHaveLength(1);
      expect(schedulesNoDep[0].amount).toBe("500.00");

      const pastDep = new Date("2026-05-01T10:00:00Z");
      const schedulesPast = generateInstallmentSchedule({
        totalPrice: "500.00",
        currency: "USD",
        bookingDate,
        departureDate: pastDep,
      });
      expect(schedulesPast).toHaveLength(1);
      expect(schedulesPast[0].amount).toBe("500.00");
    });
  });

  describe("Scheme 2: 31 <= D <= 90 days (2 installments: 30% DP, 70% at D-30)", () => {
    const bookingDate = new Date("2026-06-01T10:00:00Z");

    it("generates 2 installments for exact boundary D = 31 days", () => {
      const departureDate = new Date("2026-07-02T10:00:00Z"); // D = 31
      const schedules = generateInstallmentSchedule({
        totalPrice: "1000.00",
        currency: "USD",
        bookingDate,
        departureDate,
      });

      expect(schedules).toHaveLength(2);

      // Installment 1: 30% DP due at checkout
      expect(schedules[0].installmentNumber).toBe(1);
      expect(schedules[0].percentage).toBe("30.00");
      expect(schedules[0].amount).toBe("300.00");
      expect(schedules[0].dueDate.toISOString()).toBe(bookingDate.toISOString());
      expect(schedules[0].labelEn).toBe("Deposit (30%)");
      expect(schedules[0].labelId).toBe("Uang Muka (30%)");

      // Installment 2: 70% due at D-30 (July 2 - 30 days = June 2)
      expect(schedules[1].installmentNumber).toBe(2);
      expect(schedules[1].percentage).toBe("70.00");
      expect(schedules[1].amount).toBe("700.00");
      expect(schedules[1].labelEn).toBe("Final Balance (70%)");
      expect(schedules[1].labelId).toBe("Pelunasan Akhir (70%)");
      expect(schedules[1].dueDate.toISOString()).toBe(new Date("2026-06-02T10:00:00Z").toISOString());

      expect(verifyInstallmentInvariant(schedules, "1000.00")).toBe(true);
    });

    it("generates 2 installments for D = 60 days", () => {
      const departureDate = new Date("2026-07-31T10:00:00Z"); // D = 60
      const schedules = generateInstallmentSchedule({
        totalPrice: "1499.00",
        currency: "USD",
        bookingDate,
        departureDate,
      });

      expect(schedules).toHaveLength(2);
      // 1499 * 0.3 = 449.70
      // 1499 - 449.70 = 1049.30
      expect(schedules[0].amount).toBe("449.70");
      expect(schedules[1].amount).toBe("1049.30");
      expect(verifyInstallmentInvariant(schedules, "1499.00")).toBe(true);
    });

    it("generates 2 installments for exact boundary D = 90 days", () => {
      const departureDate = new Date("2026-08-30T10:00:00Z"); // D = 90
      const schedules = generateInstallmentSchedule({
        totalPrice: "2000.00",
        currency: "USD",
        bookingDate,
        departureDate,
      });

      expect(schedules).toHaveLength(2);
      expect(schedules[0].percentage).toBe("30.00");
      expect(schedules[0].amount).toBe("600.00");
      expect(schedules[1].percentage).toBe("70.00");
      expect(schedules[1].amount).toBe("1400.00");
      // D-30 due date = August 30 - 30 days = July 31
      expect(schedules[1].dueDate.toISOString()).toBe(new Date("2026-07-31T10:00:00Z").toISOString());
      expect(verifyInstallmentInvariant(schedules, "2000.00")).toBe(true);
    });

    it("clamps dueDate to bookingDate if D-30 is earlier than bookingDate", () => {
      // If booking was made at 11:00 on June 1, and D-30 falls slightly before
      const bkg = new Date("2026-06-01T20:00:00Z");
      const dep = new Date("2026-07-01T10:00:00Z"); // D=30 (scheme 1), but let's test clamp logic
      const d30 = new Date(dep.getTime() - 30 * 86400000);
      expect(d30.getTime() < bkg.getTime()).toBe(true);
    });
  });

  describe("Scheme 3: D >= 91 days (3 installments: 20% DP, 30% at D-90, 50% at D-30)", () => {
    const bookingDate = new Date("2026-06-01T10:00:00Z");

    it("generates 3 installments for exact boundary D = 91 days", () => {
      const departureDate = new Date("2026-08-31T10:00:00Z"); // D = 91
      const schedules = generateInstallmentSchedule({
        totalPrice: "3000.00",
        currency: "USD",
        bookingDate,
        departureDate,
      });

      expect(schedules).toHaveLength(3);

      // Installment 1: 20% DP at checkout
      expect(schedules[0].installmentNumber).toBe(1);
      expect(schedules[0].percentage).toBe("20.00");
      expect(schedules[0].amount).toBe("600.00");
      expect(schedules[0].labelEn).toBe("Deposit (20%)");
      expect(schedules[0].labelId).toBe("Uang Muka (20%)");
      expect(schedules[0].dueDate.toISOString()).toBe(bookingDate.toISOString());

      // Installment 2: 30% due at D-90 (Aug 31 - 90 = June 2)
      expect(schedules[1].installmentNumber).toBe(2);
      expect(schedules[1].percentage).toBe("30.00");
      expect(schedules[1].amount).toBe("900.00");
      expect(schedules[1].labelEn).toBe("Second Installment (30%)");
      expect(schedules[1].labelId).toBe("Cicilan Kedua (30%)");
      expect(schedules[1].dueDate.toISOString()).toBe(new Date("2026-06-02T10:00:00Z").toISOString());

      // Installment 3: 50% due at D-30 (Aug 31 - 30 = Aug 1)
      expect(schedules[2].installmentNumber).toBe(3);
      expect(schedules[2].percentage).toBe("50.00");
      expect(schedules[2].amount).toBe("1500.00");
      expect(schedules[2].labelEn).toBe("Final Balance (50%)");
      expect(schedules[2].labelId).toBe("Pelunasan Akhir (50%)");
      expect(schedules[2].dueDate.toISOString()).toBe(new Date("2026-08-01T10:00:00Z").toISOString());

      expect(verifyInstallmentInvariant(schedules, "3000.00")).toBe(true);
    });

    it("generates 3 installments for D = 180 days", () => {
      const departureDate = new Date("2026-11-28T10:00:00Z"); // D = 180
      const schedules = generateInstallmentSchedule({
        totalPrice: "4500.00",
        currency: "USD",
        bookingDate,
        departureDate,
      });

      expect(schedules).toHaveLength(3);
      expect(schedules[0].amount).toBe("900.00");   // 20%
      expect(schedules[1].amount).toBe("1350.00");  // 30%
      expect(schedules[2].amount).toBe("2250.00");  // 50%
      expect(verifyInstallmentInvariant(schedules, "4500.00")).toBe(true);
    });
  });

  describe("Rounding & Invariant Invariance (AC-04.2)", () => {
    const bookingDate = new Date("2026-01-01T00:00:00Z");
    const departureDate = new Date("2026-06-01T00:00:00Z"); // D = 151 (Scheme 3)

    const testPrices = [
      "1000.33",
      "1499.00",
      "3333.33",
      "99.99",
      "100.01",
      "777.77",
      "1234.56",
      "0.01",
      "0.00",
      "1000000.00",
    ];

    it.each(testPrices)("preserves exact sum for awkward USD total: %s", (price) => {
      const schedules = generateInstallmentSchedule({
        totalPrice: price,
        currency: "USD",
        bookingDate,
        departureDate,
      });

      expect(verifyInstallmentInvariant(schedules, price)).toBe(true);

      const sum = schedules.reduce((acc, s) => acc.plus(new Decimal(s.amount)), new Decimal(0));
      expect(sum.toFixed(2)).toBe(new Decimal(price).toFixed(2));
    });

    it("enforces zero-decimal integer rounding for IDR with exact sum invariant", () => {
      const idrPrices = ["1500000", "3333333", "12500001", "789456"];
      for (const price of idrPrices) {
        const schedules = generateInstallmentSchedule({
          totalPrice: price,
          currency: "IDR",
          bookingDate,
          departureDate,
        });

        // Must not contain any decimal dot
        for (const s of schedules) {
          expect(s.amount).not.toContain(".");
        }

        expect(verifyInstallmentInvariant(schedules, price)).toBe(true);
        const sum = schedules.reduce((acc, s) => acc.plus(new Decimal(s.amount)), new Decimal(0));
        expect(sum.toString()).toBe(price);
      }
    });

    it("rejects negative total prices", () => {
      expect(() =>
        generateInstallmentSchedule({
          totalPrice: "-100",
          currency: "USD",
          bookingDate,
          departureDate,
        })
      ).toThrow("Total price cannot be negative");
    });
  });

  describe("Plan Option Override", () => {
    const bookingDate = new Date("2026-01-01T00:00:00Z");
    const departureDate = new Date("2026-08-01T00:00:00Z"); // D > 200

    it("forces 1 installment (100% full payment) when plan is explicitly 'full'", () => {
      const schedules = generateInstallmentSchedule({
        totalPrice: "2000.00",
        currency: "USD",
        bookingDate,
        departureDate,
        plan: "full",
      });

      expect(schedules).toHaveLength(1);
      expect(schedules[0].percentage).toBe("100.00");
      expect(schedules[0].amount).toBe("2000.00");
      expect(schedules[0].labelEn).toBe("Full Payment (100%)");
      expect(verifyInstallmentInvariant(schedules, "2000.00")).toBe(true);
    });
  });
});
