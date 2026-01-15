// @flow

/*::
import PageItem from '../models/PageItem'
import LineItemBlock from '../models/LineItemBlock'
*/

exports.minXFromBlocks = function minXFromBlocks(blocks /*: LineItemBlock[] */) /*: number */ {
    var minX = 999
    if (!blocks || !Array.isArray(blocks)) {
        return null
    }
    blocks.forEach(block => {
        if (block && block.items && Array.isArray(block.items)) {
            block.items.forEach(item => {
                if (item && typeof item.x === 'number') {
                    minX = Math.min(minX, item.x)
                }
            })
        }
    })
    if (minX === 999) {
        return null
    }
    return minX
}

exports.minXFromPageItems = function minXFromPageItems(items /*: PageItem */) /*: number */ {
    var minX = 999
    if (!items || !Array.isArray(items)) {
        return null
    }
    items.forEach(item => {
        if (item && typeof item.x === 'number') {
            minX = Math.min(minX, item.x)
        }
    })
    if (minX === 999) {
        return null
    }
    return minX
}

exports.sortByX = function sortByX(items /*: PageItem */) {
    if (!items || !Array.isArray(items)) {
        return
    }
    items.sort((a, b) => {
        const aX = (a && typeof a.x === 'number') ? a.x : 0
        const bX = (b && typeof b.x === 'number') ? b.x : 0
        return aX - bX
    })
}
