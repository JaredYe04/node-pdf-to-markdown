#!/usr/bin/env node

/**
 * Preinstall script to prevent canvas from being installed
 * This prevents build failures due to missing native dependencies (GTK on Windows)
 * Since this package doesn't use canvas (uses custom PNG encoder), we can safely remove it
 */

const fs = require('fs')
const path = require('path')

function removeCanvas(dir) {
    const canvasPath = path.join(dir, 'canvas')
    if (fs.existsSync(canvasPath)) {
        try {
            fs.rmSync(canvasPath, { recursive: true, force: true })
            console.log(`Removed canvas module from ${dir} to prevent build issues`)
        } catch (err) {
            // Ignore errors - canvas might be locked or not installed yet
        }
    }
}

// Remove canvas from current package's node_modules
const nodeModulesPath = path.join(__dirname, '..', 'node_modules')
if (fs.existsSync(nodeModulesPath)) {
    removeCanvas(nodeModulesPath)
    
    // Also remove from pdfjs-dist's node_modules if nested
    const pdfjsPath = path.join(nodeModulesPath, 'pdfjs-dist')
    if (fs.existsSync(pdfjsPath)) {
        removeCanvas(pdfjsPath)
    }
}

