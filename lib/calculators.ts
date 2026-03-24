// lib/calculators.ts
// Pure TypeScript calculator engine — no dependencies, fully testable
// Powers all calculator pages on the site

// ============================================================
// MORTGAGE CALCULATORS
// ============================================================

export interface MortgagePaymentInput {
  homePrice: number
  downPayment: number
  annualRate: number        // e.g. 5.25 for 5.25%
  amortizationYears: number // e.g. 25
  paymentFrequency: 'monthly' | 'biweekly' | 'accelerated-biweekly' | 'weekly'
}

export interface MortgagePaymentResult {
  regularPayment: number
  totalPayments: number
  totalInterest: number
  totalCost: number
  mortgageAmount: number
  cmhcInsurance: number | null
  schedule: AmortizationRow[]
}

export interface AmortizationRow {
  period: number
  payment: number
  principal: number
  interest: number
  balance: number
}

export function calculateMortgagePayment(input: MortgagePaymentInput): MortgagePaymentResult {
  const { homePrice, downPayment, annualRate, amortizationYears, paymentFrequency } = input

  const ltvRatio = (homePrice - downPayment) / homePrice
  let mortgageAmount = homePrice - downPayment

  // CMHC insurance (required if down payment < 20%)
  let cmhcInsurance: number | null = null
  if (ltvRatio > 0.8) {
    const cmhcRate =
      ltvRatio > 0.95 ? 0.04 :
      ltvRatio > 0.90 ? 0.031 :
      ltvRatio > 0.85 ? 0.028 : 0.024
    cmhcInsurance = mortgageAmount * cmhcRate
    mortgageAmount += cmhcInsurance
  }

  // Number of payments per year by frequency
  const paymentsPerYear = {
    monthly: 12,
    biweekly: 26,
    'accelerated-biweekly': 26,
    weekly: 52,
  }[paymentFrequency]

  const periodicRate = annualRate / 100 / paymentsPerYear
  const n = amortizationYears * paymentsPerYear

  // Standard mortgage payment formula
  const payment = periodicRate === 0
    ? mortgageAmount / n
    : (mortgageAmount * periodicRate * Math.pow(1 + periodicRate, n)) /
      (Math.pow(1 + periodicRate, n) - 1)

  // For accelerated bi-weekly: payment = monthly / 2 (pays extra ~1 month/year)
  const finalPayment = paymentFrequency === 'accelerated-biweekly'
    ? (mortgageAmount * (annualRate / 100 / 12) * Math.pow(1 + annualRate / 100 / 12, amortizationYears * 12)) /
      (Math.pow(1 + annualRate / 100 / 12, amortizationYears * 12) - 1) / 2
    : payment

  // Build amortization schedule (first 12 periods for preview)
  const schedule: AmortizationRow[] = []
  let balance = mortgageAmount
  for (let i = 1; i <= Math.min(n, 12); i++) {
    const interest = balance * periodicRate
    const principal = finalPayment - interest
    balance = Math.max(0, balance - principal)
    schedule.push({ period: i, payment: finalPayment, principal, interest, balance })
  }

  const totalPayments = finalPayment * n
  const totalInterest = totalPayments - mortgageAmount

  return {
    regularPayment: round2(finalPayment),
    totalPayments: round2(totalPayments),
    totalInterest: round2(totalInterest),
    totalCost: round2(homePrice + totalInterest + (cmhcInsurance ?? 0)),
    mortgageAmount: round2(mortgageAmount),
    cmhcInsurance: cmhcInsurance ? round2(cmhcInsurance) : null,
    schedule,
  }
}

// -----------------------------------------------
// Maximum Mortgage (stress test)
// -----------------------------------------------
export interface MaxMortgageInput {
  grossAnnualIncome: number
  monthlyDebts: number      // Car payments, student loans, etc.
  downPayment: number
  annualRate: number
  amortizationYears: number
}

export interface MaxMortgageResult {
  maxMortgage: number
  maxHomePrice: number
  stressTestRate: number
  monthlyPayment: number
  gdsRatio: number          // Gross Debt Service ratio
  tdsRatio: number          // Total Debt Service ratio
  qualifies: boolean
  limitingFactor: 'GDS' | 'TDS' | 'OK'
}

export function calculateMaxMortgage(input: MaxMortgageInput): MaxMortgageResult {
  const { grossAnnualIncome, monthlyDebts, downPayment, annualRate, amortizationYears } = input

  // OSFI stress test: higher of contract rate + 2% or 5.25%
  const stressTestRate = Math.max(annualRate + 2, 5.25)
  const monthlyIncome = grossAnnualIncome / 12
  const periodicRate = stressTestRate / 100 / 12
  const n = amortizationYears * 12

  // GDS limit: 39% of gross income (CMHC) or 44% (conventional)
  // TDS limit: 44% of gross income (CMHC) or 46% (conventional)
  const isInsured = downPayment / (downPayment + 500000) < 0.2  // rough check
  const gdsLimit = isInsured ? 0.39 : 0.44
  const tdsLimit = isInsured ? 0.44 : 0.46

  // Max payment from GDS (heating ~$150/mo estimated)
  const maxFromGDS = monthlyIncome * gdsLimit - 150
  // Max payment from TDS
  const maxFromTDS = monthlyIncome * tdsLimit - monthlyDebts - 150

  const maxPayment = Math.min(maxFromGDS, maxFromTDS)
  const limitingFactor = maxFromGDS < maxFromTDS ? 'GDS' : maxFromTDS < maxFromGDS ? 'TDS' : 'OK'

  // Reverse mortgage formula: given payment, find PV
  const maxMortgageFromPayment =
    periodicRate === 0
      ? maxPayment * n
      : (maxPayment * (1 - Math.pow(1 + periodicRate, -n))) / periodicRate

  const maxHomePrice = maxMortgageFromPayment + downPayment

  // Calculate actual payment for this mortgage amount
  const monthlyPayment =
    periodicRate === 0
      ? maxMortgageFromPayment / n
      : (maxMortgageFromPayment * periodicRate * Math.pow(1 + periodicRate, n)) /
        (Math.pow(1 + periodicRate, n) - 1)

  const gdsRatio = (monthlyPayment + 150) / monthlyIncome
  const tdsRatio = (monthlyPayment + 150 + monthlyDebts) / monthlyIncome

  return {
    maxMortgage: round2(maxMortgageFromPayment),
    maxHomePrice: round2(maxHomePrice),
    stressTestRate,
    monthlyPayment: round2(monthlyPayment),
    gdsRatio: round2(gdsRatio * 100),
    tdsRatio: round2(tdsRatio * 100),
    qualifies: gdsRatio <= gdsLimit && tdsRatio <= tdsLimit,
    limitingFactor,
  }
}

// ============================================================
// CREDIT CARD CALCULATORS
// ============================================================

export interface CardRewardsInput {
  monthlySpend: {
    groceries: number
    dining: number
    gas: number
    travel: number
    other: number
  }
  cardEarnRates: {
    groceries: number   // points per $1
    dining: number
    gas: number
    travel: number
    other: number
  }
  cppValue: number     // cents per point (e.g. 1.8 for Amex MR)
  annualFee: number
}

export interface CardRewardsResult {
  monthlyPoints: number
  annualPoints: number
  annualDollarValue: number
  netAnnualValue: number   // After fee
  monthlyBreakdown: Record<string, { points: number; value: number }>
}

export function calculateCardRewards(input: CardRewardsInput): CardRewardsResult {
  const { monthlySpend, cardEarnRates, cppValue, annualFee } = input
  const categories = ['groceries', 'dining', 'gas', 'travel', 'other'] as const

  const monthlyBreakdown: Record<string, { points: number; value: number }> = {}
  let totalMonthlyPoints = 0

  for (const cat of categories) {
    const points = monthlySpend[cat] * cardEarnRates[cat]
    const value = (points * cppValue) / 100
    monthlyBreakdown[cat] = { points: round2(points), value: round2(value) }
    totalMonthlyPoints += points
  }

  const annualPoints = totalMonthlyPoints * 12
  const annualDollarValue = (annualPoints * cppValue) / 100

  return {
    monthlyPoints: round2(totalMonthlyPoints),
    annualPoints: round2(annualPoints),
    annualDollarValue: round2(annualDollarValue),
    netAnnualValue: round2(annualDollarValue - annualFee),
    monthlyBreakdown,
  }
}

// -----------------------------------------------
// Balance Transfer Savings Calculator
// -----------------------------------------------
export interface BalanceTransferInput {
  balance: number
  currentAPR: number         // e.g. 19.99
  promoAPR: number           // e.g. 0 or 1.99
  promoMonths: number        // e.g. 12
  transferFee: number        // % e.g. 3
  monthlyPayment: number
}

export interface BalanceTransferResult {
  transferFeeAmount: number
  interestSavedDuringPromo: number
  totalInterestOriginal: number
  totalInterestPromo: number
  netSavings: number
  monthsToPayOff: number
  recommendation: string
}

export function calculateBalanceTransfer(input: BalanceTransferInput): BalanceTransferResult {
  const { balance, currentAPR, promoAPR, promoMonths, transferFee, monthlyPayment } = input

  const transferFeeAmount = balance * (transferFee / 100)
  const totalBalance = balance + transferFeeAmount

  // Calculate interest on original card
  let origBalance = balance
  let origInterest = 0
  for (let i = 0; i < promoMonths; i++) {
    const monthInterest = origBalance * (currentAPR / 100 / 12)
    origInterest += monthInterest
    origBalance = Math.max(0, origBalance + monthInterest - monthlyPayment)
  }

  // Calculate interest on balance transfer card during promo
  let promoBalance = totalBalance
  let promoInterest = 0
  for (let i = 0; i < promoMonths; i++) {
    const monthInterest = promoBalance * (promoAPR / 100 / 12)
    promoInterest += monthInterest
    promoBalance = Math.max(0, promoBalance + monthInterest - monthlyPayment)
  }

  // Months to pay off at promo rate
  let monthsToPayOff = 0
  let tempBalance = totalBalance
  while (tempBalance > 0 && monthsToPayOff < 360) {
    const rate = monthsToPayOff < promoMonths ? promoAPR : currentAPR
    tempBalance = tempBalance * (1 + rate / 100 / 12) - monthlyPayment
    monthsToPayOff++
  }

  const netSavings = origInterest - promoInterest - transferFeeAmount

  return {
    transferFeeAmount: round2(transferFeeAmount),
    interestSavedDuringPromo: round2(origInterest - promoInterest),
    totalInterestOriginal: round2(origInterest),
    totalInterestPromo: round2(promoInterest),
    netSavings: round2(netSavings),
    monthsToPayOff,
    recommendation: netSavings > 0
      ? `You'd save $${round2(netSavings)} by transferring this balance.`
      : `The transfer fee outweighs the interest savings for this scenario.`,
  }
}

// -----------------------------------------------
// Debt Payoff: Avalanche vs Snowball
// -----------------------------------------------
export interface Debt {
  name: string
  balance: number
  apr: number
  minimumPayment: number
}

export interface DebtPayoffInput {
  debts: Debt[]
  extraMonthlyPayment: number
  method: 'avalanche' | 'snowball'
}

export interface DebtPayoffResult {
  method: 'avalanche' | 'snowball'
  monthsToPayOff: number
  totalInterest: number
  totalPaid: number
  payoffOrder: string[]
  comparisonSavings?: number   // vs the other method
}

export function calculateDebtPayoff(input: DebtPayoffInput): DebtPayoffResult {
  const { debts, extraMonthlyPayment, method } = input

  // Sort debts by method
  const sorted = [...debts].sort((a, b) =>
    method === 'avalanche'
      ? b.apr - a.apr              // Highest APR first
      : a.balance - b.balance      // Lowest balance first
  )

  const balances = sorted.map(d => d.balance)
  const payoffOrder: string[] = []
  let month = 0
  let totalInterest = 0

  while (balances.some(b => b > 0) && month < 600) {
    month++
    let extra = extraMonthlyPayment

    // Accrue interest on all debts
    for (let i = 0; i < sorted.length; i++) {
      if (balances[i] <= 0) continue
      totalInterest += balances[i] * (sorted[i].apr / 100 / 12)
      balances[i] += balances[i] * (sorted[i].apr / 100 / 12)
    }

    // Pay minimums first
    for (let i = 0; i < sorted.length; i++) {
      if (balances[i] <= 0) continue
      const pay = Math.min(sorted[i].minimumPayment, balances[i])
      balances[i] -= pay
    }

    // Apply extra to focus debt (first non-zero in sorted order)
    for (let i = 0; i < sorted.length; i++) {
      if (balances[i] <= 0) continue
      const pay = Math.min(extra, balances[i])
      balances[i] -= pay
      extra -= pay

      if (balances[i] <= 0.01) {
        balances[i] = 0
        if (!payoffOrder.includes(sorted[i].name)) {
          payoffOrder.push(sorted[i].name)
        }
      }
      if (extra <= 0) break
    }
  }

  const totalMinimums = debts.reduce((s, d) => s + d.minimumPayment, 0)
  const totalPaid = (totalMinimums + extraMonthlyPayment) * month - extraMonthlyPayment * Math.max(0, month - (month - 1))

  return {
    method,
    monthsToPayOff: month,
    totalInterest: round2(totalInterest),
    totalPaid: round2(totalPaid),
    payoffOrder,
  }
}

// -----------------------------------------------
// Points value estimator
// -----------------------------------------------
export function estimatePointsValue(
  points: number,
  program: string,
  redemptionType: 'economy' | 'business' | 'hotel' | 'cashback'
): { dollarValue: number; cpp: number; tier: 'poor' | 'fair' | 'good' | 'great' } {
  const cppTable: Record<string, Record<string, number>> = {
    'Amex MR':    { economy: 1.5, business: 2.2, hotel: 0.9, cashback: 1.0 },
    'Aeroplan':   { economy: 1.8, business: 2.8, hotel: 1.0, cashback: 1.0 },
    'Scene+':     { economy: 1.0, business: 1.0, hotel: 1.0, cashback: 1.0 },
    'BMO Rewards':{ economy: 0.67, business: 0.67, hotel: 0.5, cashback: 0.67 },
    'Avion':      { economy: 1.2, business: 2.0, hotel: 0.8, cashback: 1.0 },
    'TD Rewards': { economy: 0.5, business: 0.5, hotel: 0.5, cashback: 0.5 },
  }

  const cpp = cppTable[program]?.[redemptionType] ?? 1.0
  const dollarValue = (points * cpp) / 100

  const tier =
    cpp >= 2.0 ? 'great' :
    cpp >= 1.5 ? 'good' :
    cpp >= 1.0 ? 'fair' : 'poor'

  return { dollarValue: round2(dollarValue), cpp, tier }
}

// -----------------------------------------------
// Helpers
// -----------------------------------------------
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
