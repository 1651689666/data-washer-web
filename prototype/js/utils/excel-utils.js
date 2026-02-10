/**
 * Excel Utility Functions
 */

/**
 * Encodes a zero-indexed column number to Excel-style label (0 -> A, 1 -> B, ..., 26 -> AA)
 * @param {number} col 
 * @returns {string}
 */
export function encodeCol(col) {
    let s = "";
    for (++col; col; col = Math.floor((col - 1) / 26)) {
        s = String.fromCharCode(((col - 1) % 26) + 65) + s;
    }
    return s;
}

/**
 * Gets the value of a cell, considering merging information.
 * If the cell is part of a merge range, returns the value of the top-left cell.
 * @param {any[][]} matrix - 2D data matrix
 * @param {Array} merges - Array of {s: {r, c}, e: {r, c}}
 * @param {number} r - row index
 * @param {number} c - col index
 * @returns {any}
 */
export function getCellValueWithMerges(matrix, merges, r, c) {
    if (!merges || merges.length === 0) {
        return matrix[r] ? matrix[r][c] : null;
    }

    // Check if (r,c) is inside any merge range
    const merge = merges.find(m =>
        r >= m.s.r && r <= m.e.r &&
        c >= m.s.c && c <= m.e.c
    );

    if (merge) {
        // Return the top-left cell of the merge range
        return matrix[merge.s.r] ? matrix[merge.s.r][merge.s.c] : null;
    }

    return matrix[r] ? matrix[r][c] : null;
}
