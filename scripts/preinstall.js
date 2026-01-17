#!/usr/bin/env node

/**
 * Preinstall/Postinstall script to prevent canvas from being installed
 * This prevents build failures due to missing native dependencies (GTK on Windows)
 * Since this package doesn't use canvas (uses custom PNG encoder), we can safely remove it
 */

const fs = require('fs')
const path = require('path')

function removeCanvas(dir) {
    const canvasPath = path.join(dir, 'canvas')
    if (fs.existsSync(canvasPath)) {
        try {
            // Try to remove build artifacts first to unlock files
            const buildPath = path.join(canvasPath, 'build')
            if (fs.existsSync(buildPath)) {
                fs.rmSync(buildPath, { recursive: true, force: true, maxRetries: 3 })
            }
            // Remove the entire canvas directory
            fs.rmSync(canvasPath, { recursive: true, force: true, maxRetries: 3 })
            console.log(`✓ Removed canvas module from ${dir}`)
        } catch (err) {
            // Silently ignore errors - canvas might be locked or not installed yet
            // In postinstall phase, this is expected if canvas is being used elsewhere
        }
    }
}

// Get the package root directory (where package.json is located)
const packageRoot = path.join(__dirname, '..')
const nodeModulesPath = path.join(packageRoot, 'node_modules')

// Remove canvas from current package's node_modules
if (fs.existsSync(nodeModulesPath)) {
    removeCanvas(nodeModulesPath)
    
    // Also remove from pdfjs-dist's node_modules if nested
    const pdfjsPath = path.join(nodeModulesPath, 'pdfjs-dist')
    if (fs.existsSync(pdfjsPath)) {
        const pdfjsNodeModules = path.join(pdfjsPath, 'node_modules')
        if (fs.existsSync(pdfjsNodeModules)) {
            removeCanvas(pdfjsNodeModules)
        }
    }
}

