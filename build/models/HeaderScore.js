// @flow

/**
 * HeaderScore represents the confidence that a LineItem is a header,
 * along with metadata about why it was scored that way.
 * 
 * This enables multi-feature weighted scoring instead of simple height sorting.
 */
class HeaderScore {
  constructor (score = 0, features = {}) {
    this.score = Math.max(0, Math.min(1, score))
    this.features = features // For explainability: why this score?
  }

  /**
   * Features that contribute to header score:
   * - fontSizeRatio: fontSize / bodyFontSize (most important)
   * - verticalSpacing: spacing before/after line
   * - isStandalone: whether line is alone (no adjacent text)
   * - positionOnPage: position in page (top half = higher score)
   * - repetitionPattern: how often this fontSize appears
   * - isUppercase: whether text is all uppercase (weak signal)
   * - fontFamilyDiff: whether font differs from body font
   */
  
  static create (features) {
    // Weighted scoring (sum of weighted features, normalized to [0,1])
    const weights = {
      fontSizeRatio: 0.35,      // Most important
      verticalSpacing: 0.20,
      isStandalone: 0.15,
      positionOnPage: 0.10,
      repetitionPattern: 0.10,
      isUppercase: 0.05,         // Weak signal
      fontFamilyDiff: 0.05
    }

    let score = 0
    let totalWeight = 0

    // fontSizeRatio: >1.2 = strong signal, >1.5 = very strong
    if (features.fontSizeRatio !== undefined) {
      const ratioScore = Math.min(1, (features.fontSizeRatio - 1) / 0.5) // 1.0 -> 0, 1.5 -> 1
      score += ratioScore * weights.fontSizeRatio
      totalWeight += weights.fontSizeRatio
    }

    // verticalSpacing: larger spacing = more likely header
    if (features.verticalSpacing !== undefined) {
      const spacingScore = Math.min(1, features.verticalSpacing / 2) // normalized
      score += spacingScore * weights.verticalSpacing
      totalWeight += weights.verticalSpacing
    }

    // isStandalone: boolean -> 0 or 1
    if (features.isStandalone !== undefined) {
      score += (features.isStandalone ? 1 : 0) * weights.isStandalone
      totalWeight += weights.isStandalone
    }

    // positionOnPage: 0 (bottom) to 1 (top)
    if (features.positionOnPage !== undefined) {
      score += features.positionOnPage * weights.positionOnPage
      totalWeight += weights.positionOnPage
    }

    // repetitionPattern: how often this fontSize appears (normalized)
    if (features.repetitionPattern !== undefined) {
      score += features.repetitionPattern * weights.repetitionPattern
      totalWeight += weights.repetitionPattern
    }

    // isUppercase: weak signal
    if (features.isUppercase !== undefined) {
      score += (features.isUppercase ? 0.3 : 0) * weights.isUppercase
      totalWeight += weights.isUppercase
    }

    // fontFamilyDiff: boolean
    if (features.fontFamilyDiff !== undefined) {
      score += (features.fontFamilyDiff ? 0.5 : 0) * weights.fontFamilyDiff
      totalWeight += weights.fontFamilyDiff
    }

    // Normalize by total weight used
    const normalizedScore = totalWeight > 0 ? score / totalWeight : 0

    return new HeaderScore(normalizedScore, features)
  }
}

module.exports = HeaderScore

