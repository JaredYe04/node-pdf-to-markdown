// @flow

/**
 * Configuration for style detection algorithms.
 * All thresholds and weights are parameterized here for easy tuning.
 */
module.exports = {
  // Style confidence thresholds
  styleConfidence: {
    boldThreshold: 0.3,        // Minimum confidence to mark as bold (lowered for better detection)
    italicThreshold: 0.3,      // Minimum confidence to mark as italic (lowered for better detection)
  },

  // Font style detection weights
  fontStyleWeights: {
    fontDescriptorWeight: 0.40,  // FontDescriptor.FontWeight (if available)
    widthComparison: 0.35,       // Character width comparison
    bodyWidthRatio: 0.20,        // Width relative to body text
    fontNameMatch: 0.05,         // Font name string matching (weak)
  },

  // Header detection configuration
  headerDetection: {
    minScore: 0.4,              // Minimum HeaderScore to consider as header
    maxLevel: 4,                // Maximum header level (H1-H4, rest become paragraphs)
    fontSizeRatioThreshold: 1.15, // Minimum fontSize/bodyFontSize to consider
    verticalSpacingMultiplier: 1.5, // Multiplier for vertical spacing normalization
  },

  // Character width comparison
  widthComparison: {
    minSamples: 3,             // Minimum samples needed for width comparison
    widthRatioThreshold: 1.1,   // Bold text is typically 10-20% wider
  },
}

