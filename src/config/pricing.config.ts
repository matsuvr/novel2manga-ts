/**
 * Configuration for token pricing tiers and rates.
 * Keep names stable; consumers should import `pricingConfig` from this module.
 */
export type PricingConfig = {
    tokenTierThreshold: number
    promptRateLowPer1M: number
    promptRateHighPer1M: number
    completionRateLowPer1M: number
    completionRateHighPer1M: number
}

export const pricingConfig: PricingConfig = {
    tokenTierThreshold: 200_000,
    promptRateLowPer1M: 1.25,
    promptRateHighPer1M: 2.5,
    completionRateLowPer1M: 10.0,
    completionRateHighPer1M: 15.0,
}

export function promptRateForTokens(tokens: number) {
    const { tokenTierThreshold, promptRateLowPer1M, promptRateHighPer1M } = pricingConfig
    return tokens <= tokenTierThreshold ? promptRateLowPer1M / 1_000_000 : promptRateHighPer1M / 1_000_000
}

export function completionRateForTokens(tokens: number) {
    const { tokenTierThreshold, completionRateLowPer1M, completionRateHighPer1M } = pricingConfig
    return tokens <= tokenTierThreshold ? completionRateLowPer1M / 1_000_000 : completionRateHighPer1M / 1_000_000
}
