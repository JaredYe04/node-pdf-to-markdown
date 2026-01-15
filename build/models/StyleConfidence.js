// @flow

/**
 * StyleConfidence represents the confidence scores for text style detection.
 * All scores are in the range [0, 1], where:
 * - 0: definitely not this style
 * - 1: definitely this style
 * 
 * This replaces the boolean-based font format detection with a more nuanced
 * multi-feature scoring system.
 */
class StyleConfidence {
  constructor (bold = 0, italic = 0) {
    this.bold = Math.max(0, Math.min(1, bold))
    this.italic = Math.max(0, Math.min(1, italic))
  }

  /**
   * Returns the WordFormat enum value if confidence exceeds threshold
   * @param {number} threshold - Minimum confidence (default: 0.5)
   * @returns {WordFormat|null}
   */
  toWordFormat (threshold = 0.5) {
    const WordFormat = require('./markdown/WordFormat')
    
    if (this.bold >= threshold && this.italic >= threshold) {
      return WordFormat.BOLD_OBLIQUE
    } else if (this.bold >= threshold) {
      return WordFormat.BOLD
    } else if (this.italic >= threshold) {
      return WordFormat.OBLIQUE
    }
    return null
  }

  /**
   * Combines multiple confidence scores (takes maximum)
   */
  static combine (...confidences) {
    return new StyleConfidence(
      Math.max(...confidences.map(c => c.bold)),
      Math.max(...confidences.map(c => c.italic))
    )
  }
}

module.exports = StyleConfidence

