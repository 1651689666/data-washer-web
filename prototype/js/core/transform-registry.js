/**
 * TransformRegistry manages all data cleaning rules.
 * Supports both SQL-based and JS-based transformations.
 */
class TransformRegistry {
    constructor() {
        this.builtInRules = {
            'upper': {
                id: 'upper',
                name: '转为大写',
                engine: 'both',
                sqlExpr: (col) => `UPPER(${col})`,
                transform: (val) => (typeof val === 'string' ? val.toUpperCase() : val)
            },
            'lower': {
                id: 'lower',
                name: '转为小写',
                engine: 'both',
                sqlExpr: (col) => `LOWER(${col})`,
                transform: (val) => (typeof val === 'string' ? val.toLowerCase() : val)
            },
            'trim': {
                id: 'trim',
                name: '去除前后空格',
                engine: 'both', // Mark as both to allow JS preview and SQL execution
                sqlExpr: (col) => `TRIM(${col})`,
                transform: (val) => (typeof val === 'string' ? val.trim() : val)
            },
            'date_format': {
                id: 'date_format',
                name: '日期格式化 (yyyy-MM-dd)',
                engine: 'js',
                transform: (val) => {
                    if (!val) return val;
                    const d = new Date(val);
                    if (isNaN(d.getTime())) throw new Error("无效日期");
                    return d.toISOString().split('T')[0];
                },
                validate: (val) => !isNaN(new Date(val).getTime())
            },
            'precision': {
                id: 'precision',
                name: '保留2位小数',
                engine: 'js',
                transform: (val) => {
                    const n = parseFloat(val);
                    if (isNaN(n)) throw new Error("非数值类型");
                    return n.toFixed(2);
                },
                validate: (val) => !isNaN(parseFloat(val))
            },
            'thousands': {
                id: 'thousands',
                name: '添加千分符',
                engine: 'js',
                transform: (val) => {
                    const str = String(val).replace(/,/g, '');
                    const n = parseFloat(str);
                    if (isNaN(n)) throw new Error("非数值类型");
                    // Detect decimals in input to preserve them during formatting
                    const parts = str.split('.');
                    const decimalCount = parts.length > 1 ? parts[1].length : 0;
                    return new Intl.NumberFormat(undefined, {
                        minimumFractionDigits: decimalCount,
                        maximumFractionDigits: decimalCount
                    }).format(n);
                },
                validate: (val) => !isNaN(parseFloat(String(val).replace(/,/g, '')))
            },
            'remove_thousands': {
                id: 'remove_thousands',
                name: '去掉千分符',
                engine: 'js',
                transform: (val) => String(val).replace(/,/g, ''),
                validate: (val) => true
            }
        };
        this.customRules = [];
    }

    setCustomRules(rules) {
        this.customRules = rules || [];
    }

    getAllRules() {
        const custom = this.customRules.map(r => ({
            ...r,
            engine: 'js',
            isCustom: true
        }));
        return { ...this.builtInRules, ...Object.fromEntries(custom.map(r => [r.id, r])) };
    }

    getRule(id) {
        return this.getAllRules()[id];
    }

    /**
     * Applies a chain of JS-based rules to a value.
     * @param {any} value - Cell value
     * @param {Object} row - Full row data object
     * @param {Array} transformIds - Applied rules
     * @returns {Object} { value, warnings }
     */
    applyJsTransforms(value, row, transformIds) {
        const warnings = [];
        let result = value;

        for (const id of transformIds) {
            const rule = this.getRule(id);
            if (!rule || rule.engine === 'sql') continue;

            try {
                // For custom rules, we support (value, row)
                if (rule.isCustom && rule.code) {
                    const fn = new Function('value', 'row', rule.code);
                    result = fn(result, row);
                } else if (rule.transform) {
                    result = rule.transform(result, row);
                }
            } catch (e) {
                warnings.push(`规则 [${rule.name}] 应用失败: ${e.message}`);
                // Return original value on error as per requirement
                return { value, warnings };
            }
        }
        return { value: result, warnings };
    }

    /**
     * Validates a value against a rule without transforming it.
     * Used for Preview to highlight errors on already-transformed data.
     * @returns {Array} warnings
     */
    validateValue(value, ruleId) {
        const warnings = [];
        const rule = this.getRule(ruleId);
        if (!rule) return warnings;

        // 1. Built-in validation
        if (rule.validate && !rule.validate(value)) {
            warnings.push(`数据格式不符合规则 [${rule.name}]`);
        }

        // 2. Custom rule validation (if any, currently custom rules rely on try-catch in transform)
        // For custom rules, we assume they are valid if they don't crash, but we can't test crash without running.
        // If we want to skip running, we skip validation for custom rules unless we add a specific validate function.

        return warnings;
    }
}

export const transformRegistry = new TransformRegistry();
