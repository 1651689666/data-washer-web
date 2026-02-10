
// Utility functions

export function generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Wrapper for XLSX utils if needed, or just regular helpers
export const ExcelUtils = {
    // Decode "A1" -> {r:0, c:0}
    decodeCell: (address) => {
        if (!window.XLSX) {
            console.error("XLSX library not loaded");
            return { r: 0, c: 0 };
        }
        return window.XLSX.utils.decode_cell(address);
    },

    // Encode {r:0, c:0} -> "A1"
    encodeCell: (pos) => {
        if (!window.XLSX) return "";
        return window.XLSX.utils.encode_cell(pos);
    }
};
