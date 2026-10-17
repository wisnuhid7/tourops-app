/**
 * Dynamic Staged Installment Generator Engine (US-04).
 *
 * Generates staged payment schedules based on D = number of calendar days
 * between booking date and tour departure date.
 *
 * Rules:
 *  - D <= 30 days:  1 installment  (100% full payment due at checkout)
 *  - 31 <= D <= 90: 2 installments (30% deposit at checkout, 70% due at D-30)
 *  - D >= 91 days:  3 installments (20% deposit at checkout, 30% due at D-90, 50% due at D-30)
 *
 * Constraints & Invariants:
 *  - No dueDate may be earlier than bookingDate (AC-04.1).
 *  - Strict mathematical invariant: sum of installments equals totalPrice exactly (AC-04.2).
 *    All installments except the last are rounded with ROUND_HALF_UP, and the last
 *    installment = totalPrice - sum(earlier installments).
 *  - Multi-language labels (labelEn, labelId).
 */
import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type InstallmentPlanOption = "auto" | "full" | "staged";

export interface GenerateInstallmentScheduleInput {
  totalPrice: number | string | Decimal;
  currency?: string;
  bookingDate: Date | string;
  departureDate?: Date | string | null;
  bookingId?: string;
  plan?: InstallmentPlanOption;
}

export interface GeneratedInstallment {
  bookingId?: string;
  installmentNumber: number;
  label: string;
  labelEn: string;
  labelId: string;
  percentage: string;
  amount: string;
  paidAmount: string;
  currency: string;
  dueDate: Date;
  status: "pending";
}

interface InstallmentStageConfig {
  installmentNumber: number;
  percentage: number;
  labelEn: string;
  labelId: string;
  dueDate: Date;
}

/**
 * Calculates calendar days between bookingDate and departureDate (D).
 * D = departureDate - bookingDate in UTC calendar days.
 */
export function calculateDaysBetween(
  departureDate: Date | string,
  bookingDate: Date | string
): number {
  const dep = new Date(departureDate);
  const bkg = new Date(bookingDate);

  const utcDep = Date.UTC(dep.getUTCFullYear(), dep.getUTCMonth(), dep.getUTCDate());
  const utcBkg = Date.UTC(bkg.getUTCFullYear(), bkg.getUTCMonth(), bkg.getUTCDate());

  return Math.round((utcDep - utcBkg) / (1000 * 60 * 60 * 24));
}

/**
 * Returns minor currency decimal places (0 for IDR, JPY; 2 for USD, EUR, etc.)
 */
export function getCurrencyDecimals(currency = "USD"): number {
  const c = currency.toUpperCase();
  if (c === "IDR" || c === "JPY" || c === "KRW" || c === "VND") {
    return 0;
  }
  return 2;
}

/**
 * Helper to clamp a dueDate so it is never earlier than the bookingDate.
 */
function clampDueDate(targetDate: Date, bookingDate: Date): Date {
  return targetDate.getTime() < bookingDate.getTime() ? new Date(bookingDate.getTime()) : targetDate;
}

/**
 * Generates the staged installment schedule according to US-04 specifications.
 */
export function generateInstallmentSchedule(
  input: GenerateInstallmentScheduleInput
): GeneratedInstallment[] {
  const total = new Decimal(input.totalPrice);
  if (total.isNegative()) {
    throw new Error(`Total price cannot be negative: ${input.totalPrice}`);
  }

  const currency = (input.currency || "USD").toUpperCase();
  const decimals = getCurrencyDecimals(currency);
  const bkgDate = new Date(input.bookingDate);
  const plan = input.plan || "auto";

  // If plan is explicitly "full" or no departure date is available, generate 1 installment (100%)
  if (plan === "full" || !input.departureDate) {
    const singleStage: InstallmentStageConfig[] = [
      {
        installmentNumber: 1,
        percentage: 100,
        labelEn: "Full Payment (100%)",
        labelId: "Pelunasan Penuh (100%)",
        dueDate: new Date(bkgDate.getTime()),
      },
    ];
    return allocateInstallments(singleStage, total, decimals, currency, input.bookingId);
  }

  const depDate = new Date(input.departureDate);
  const D = calculateDaysBetween(depDate, bkgDate);

  let stages: InstallmentStageConfig[];

  if (D <= 30) {
    // Scheme 1: D <= 30 days -> 1 installment (100% full payment due at checkout)
    stages = [
      {
        installmentNumber: 1,
        percentage: 100,
        labelEn: "Full Payment (100%)",
        labelId: "Pelunasan Penuh (100%)",
        dueDate: new Date(bkgDate.getTime()),
      },
    ];
  } else if (D <= 90) {
    // Scheme 2: 31 <= D <= 90 days -> 2 installments (30% deposit at checkout, 70% due at D-30)
    const dMinus30 = new Date(depDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    stages = [
      {
        installmentNumber: 1,
        percentage: 30,
        labelEn: "Deposit (30%)",
        labelId: "Uang Muka (30%)",
        dueDate: new Date(bkgDate.getTime()),
      },
      {
        installmentNumber: 2,
        percentage: 70,
        labelEn: "Final Balance (70%)",
        labelId: "Pelunasan Akhir (70%)",
        dueDate: clampDueDate(dMinus30, bkgDate),
      },
    ];
  } else {
    // Scheme 3: D >= 91 days -> 3 installments (20% deposit at checkout, 30% due at D-90, 50% due at D-30)
    const dMinus90 = new Date(depDate.getTime() - 90 * 24 * 60 * 60 * 1000);
    const dMinus30 = new Date(depDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    stages = [
      {
        installmentNumber: 1,
        percentage: 20,
        labelEn: "Deposit (20%)",
        labelId: "Uang Muka (20%)",
        dueDate: new Date(bkgDate.getTime()),
      },
      {
        installmentNumber: 2,
        percentage: 30,
        labelEn: "Second Installment (30%)",
        labelId: "Cicilan Kedua (30%)",
        dueDate: clampDueDate(dMinus90, bkgDate),
      },
      {
        installmentNumber: 3,
        percentage: 50,
        labelEn: "Final Balance (50%)",
        labelId: "Pelunasan Akhir (50%)",
        dueDate: clampDueDate(dMinus30, bkgDate),
      },
    ];
  }

  return allocateInstallments(stages, total, decimals, currency, input.bookingId);
}

/**
 * Calculates precision amounts enforcing the mathematical invariant:
 * Sum of installments = totalPrice exactly, with last installment absorbing any rounding difference.
 */
function allocateInstallments(
  stages: InstallmentStageConfig[],
  total: Decimal,
  decimals: number,
  currency: string,
  bookingId?: string
): GeneratedInstallment[] {
  let allocated = new Decimal(0);

  const result: GeneratedInstallment[] = stages.map((stage, idx) => {
    const isLast = idx === stages.length - 1;
    let amount: Decimal;

    if (isLast) {
      amount = total.minus(allocated);
    } else {
      amount = total
        .mul(stage.percentage)
        .div(100)
        .toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
      allocated = allocated.plus(amount);
    }

    return {
      bookingId,
      installmentNumber: stage.installmentNumber,
      label: stage.labelEn,
      labelEn: stage.labelEn,
      labelId: stage.labelId,
      percentage: new Decimal(stage.percentage).toFixed(2),
      amount: amount.toFixed(decimals),
      paidAmount: new Decimal(0).toFixed(decimals),
      currency,
      dueDate: stage.dueDate,
      status: "pending",
    };
  });

  // Verify invariant: sum(amount) === total exactly
  const sum = result.reduce(
    (acc, inst) => acc.plus(new Decimal(inst.amount)),
    new Decimal(0)
  );

  if (!sum.equals(total)) {
    throw new Error(
      `Installment invariant failed: sum of installments (${sum.toFixed(decimals)}) does not equal total price (${total.toFixed(decimals)})`
    );
  }

  return result;
}

/**
 * Verification helper to assert invariant in unit/integration tests.
 */
export function verifyInstallmentInvariant(
  schedules: { amount: string | number | Decimal }[],
  totalPrice: number | string | Decimal
): boolean {
  const total = new Decimal(totalPrice);
  const sum = schedules.reduce(
    (acc, s) => acc.plus(new Decimal(s.amount)),
    new Decimal(0)
  );
  return sum.equals(total);
}
