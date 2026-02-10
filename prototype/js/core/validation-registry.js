/**
 * ValidationRegistry manages data validation rules.
 * Supports "Config Mode" (built-in logic) and "Script Mode" (custom JS).
 */
class ValidationRegistry {
    constructor() {
        this.builtInRules = {
            'sum_equals': {
                id: 'sum_equals',
                name: '分项之和校验',
                type: 'config',
                handler: (value, row, config) => {
                    const fields = config.sourceFields || [];
                    const sum = fields.reduce((acc, f) => {
                        const val = parseFloat(String(row[f] || 0).replace(/,/g, ''));
                        return acc + (isNaN(val) ? 0 : val);
                    }, 0);
                    const targetVal = parseFloat(String(value || 0).replace(/,/g, ''));
                    const tolerance = config.tolerance || 0.001;
                    if (Math.abs(sum - targetVal) > tolerance) {
                        return `分项之和 (${sum.toFixed(2)}) 不等于当前值 (${targetVal.toFixed(2)})`;
                    }
                    return null; // Success
                }
            },
            'avg_equals': {
                id: 'avg_equals',
                name: '平均值校验',
                type: 'config',
                handler: (value, row, config) => {
                    const fields = config.sourceFields || [];
                    if (fields.length === 0) return null;
                    const sum = fields.reduce((acc, f) => {
                        const val = parseFloat(String(row[f] || 0).replace(/,/g, ''));
                        return acc + (isNaN(val) ? 0 : val);
                    }, 0);
                    const avg = sum / fields.length;
                    const targetVal = parseFloat(String(value || 0).replace(/,/g, ''));
                    const tolerance = config.tolerance || 0.001;
                    if (Math.abs(avg - targetVal) > tolerance) {
                        return `平均值 (${avg.toFixed(2)}) 不等于当前值 (${targetVal.toFixed(2)})`;
                    }
                    return null;
                }
            }
        };
        this.customRules = [];
    }

    setCustomRules(rules) {
        this.customRules = rules || [];
    }

    getAllRules() {
        const custom = Object.fromEntries(this.customRules.map(r => [r.id, r]));
        return { ...this.builtInRules, ...custom };
    }

    getRule(id) {
        return this.getAllRules()[id];
    }

    /**
     * Validates a value against a rule.
     * @param {any} value - Current field value
     * @param {Object} row - Full row data
     * @param {string} ruleId - Validation rule ID
     * @returns {string|null} - Error message or null if valid
     */
    validate(value, row, ruleId) {
        const rule = this.getRule(ruleId);
        if (!rule) return null;

        try {
            if (rule.type === 'script' || rule.code) {
                // Script Mode
                const fn = new Function('value', 'row', rule.code);
                const result = fn(value, row);
                if (result === false) return `校验失败: ${rule.name}`;
                if (typeof result === 'string') return result;
                return null;
            } else if (rule.handler) {
                // Built-in Config Mode
                return rule.handler(value, row, rule.config || {});
            } else if (rule.type === 'config') {
                // Persistent custom config rule
                const baseRule = this.builtInRules[rule.config.operator];
                if (baseRule && baseRule.handler) {
                    return baseRule.handler(value, row, rule.config);
                }
            }
        } catch (e) {
            return `校验执行出错 [${rule.name}]: ${e.message}`;
        }
        return null;
    }
}

export const validationRegistry = new ValidationRegistry();
