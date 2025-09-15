export const pricingConfig = {
    promptTierThreshold: 200_000,
    promptRateLowPer1M: 1.25,
    promptRateHighPer1M: 2.5,
    completionRateLowPer1M: 10.0,
    completionRateHighPer1M: 15.0,
}

export function promptRateForTokens(tokens: number) {
    const { promptTierThreshold, promptRateLowPer1M, promptRateHighPer1M } = pricingConfig
    return tokens <= promptTierThreshold ? promptRateLowPer1M / 1_000_000 : promptRateHighPer1M / 1_000_000
}

export function completionRateForTokens(tokens: number) {
    const { promptTierThreshold, completionRateLowPer1M, completionRateHighPer1M } = pricingConfig
    return tokens <= promptTierThreshold ? completionRateLowPer1M / 1_000_000 : completionRateHighPer1M / 1_000_000
}
