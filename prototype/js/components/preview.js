import { dbService } from '../core/database.js';
import { transformRegistry } from '../core/transform-registry.js';
import { validationRegistry } from '../core/validation-registry.js';
import { store } from '../core/store.js';

class Preview {
    constructor() {
        this.container = null;
        this.table = null;
    }

    init() {
        this.container = document.getElementById('preview-panel');
        this.table = document.getElementById('preview-table');
        if (!this.container || !this.table) return;

        // Listen for data load events
        document.addEventListener('region-data-loaded', (e) => {
            this.refresh(e.detail.tableName);
        });

        // Bind Export Button
        const exportBtn = document.getElementById('preview-export-btn');
        if (exportBtn) {
            exportBtn.onclick = () => this.export();
        }
    }

    async refresh(tableName = 't_main') {
        const skeleton = document.getElementById('preview-skeleton');

        try {
            // PGlite/Postgres does not guarantee order without ORDER BY.
            // We use the hidden _row_idx column created during table loading.
            let res;
            try {
                res = await dbService.execute(`SELECT * FROM "${tableName}" ORDER BY "_row_idx" LIMIT 100`);
            } catch (err) {
                // Fallback if _row_idx doesn't exist (legacy tables)
                console.warn("Table missing _row_idx, falling back to unordered select", err);
                res = await dbService.execute(`SELECT * FROM "${tableName}" LIMIT 100`);
            }

            if (res.rows) {
                this.renderTable(res.fields, res.rows);
                if (skeleton) skeleton.style.display = 'none';
                this.table.style.display = 'table';
            }

        } catch (e) {
            console.warn("Preview load failed (maybe table empty):", e);
            if (skeleton) {
                skeleton.style.display = 'flex';
                skeleton.querySelector('.skeleton-hint').textContent = "暂无数据或数据加载失败";
            }
            this.table.style.display = 'none';
        }
    }

    renderTable(fields, rows) {
        const state = store.getState();
        const fieldConfigs = state.fieldConfigs || [];
        const thead = this.table.querySelector('thead');
        const tbody = this.table.querySelector('tbody');

        thead.innerHTML = '';
        tbody.innerHTML = '';

        // Filter out hidden fields (those starting with _)
        const visibleFields = fields.filter(f => !f.name.startsWith('_'));

        // Headers
        const trHead = document.createElement('tr');
        visibleFields.forEach(f => {
            const th = document.createElement('th');
            // Translate: find the config whose physAlias or id matches the SQL column name
            const config = fieldConfigs.find(c => c.physAlias === f.name || c.id === f.name);
            th.textContent = config ? (config.alias || config.name) : f.name;
            trHead.appendChild(th);
        });
        thead.appendChild(trHead);

        // Rows
        rows.forEach(row => {
            const tr = document.createElement('tr');
            visibleFields.forEach(f => {
                const td = document.createElement('td');
                const config = fieldConfigs.find(c => c.physAlias === f.name || c.id === f.name);

                let rawValue = row[f.name];
                let displayValue = rawValue !== null ? rawValue : "";
                let warnings = [];

                // Apply Transformation if strategy exists
                if (config && config.strategies && config.strategies.length > 0) {
                    // Previous Logic: Apply transform here. 
                    // New Logic: Data is already transformed in main.js/SQL. 
                    // Just validate.
                    config.strategies.forEach(ruleId => {
                        const validationWarnings = transformRegistry.validateValue(displayValue, ruleId);
                        if (validationWarnings.length > 0) {
                            warnings.push(...validationWarnings);
                        }
                    });
                } else if (config && config.strategy && config.strategy !== 'none') {
                    // Backward compatibility
                    const validationWarnings = transformRegistry.validateValue(displayValue, config.strategy);
                    if (validationWarnings.length > 0) {
                        warnings.push(...validationWarnings);
                    }
                }

                td.textContent = displayValue;
                td.contentEditable = "true";

                if (config && config.validations && config.validations.length > 0) {
                    const errors = [];
                    config.validations.forEach(vId => {
                        const error = validationRegistry.validate(displayValue, row, vId);
                        if (error) errors.push(error);
                    });
                    if (errors.length > 0) {
                        td.classList.add('cell-validation-error');
                        td.dataset.warning = errors.join('\n');
                        td.addEventListener('mouseenter', (e) => this.showToast(e, td.dataset.warning));
                        td.addEventListener('mouseleave', () => this.hideToast());
                    }
                }

                if (warnings.length > 0 && !td.classList.contains('cell-validation-error')) {
                    td.classList.add('cell-transform-warning');
                    td.dataset.warning = warnings.join('\n');
                    td.addEventListener('mouseenter', (e) => this.showToast(e, td.dataset.warning));
                    td.addEventListener('mouseleave', () => this.hideToast());
                }

                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    showToast(e, message) {
        let toast = document.getElementById('preview-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'preview-toast';
            toast.className = 'preview-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.display = 'block';
        toast.style.left = (e.pageX + 10) + 'px';
        toast.style.top = (e.pageY + 10) + 'px';
    }

    hideToast() {
        const toast = document.getElementById('preview-toast');
        if (toast) toast.style.display = 'none';
    }

    export() {
        if (!this.table || this.table.style.display === 'none') {
            alert("暂无预览数据可以导出");
            return;
        }

        try {
            // Create workbook from HTML table (SheetJS)
            // This captures all manual edits currently in the DOM
            const wb = XLSX.utils.table_to_book(this.table, { sheet: "清洗结果" });

            // Format Filename: DataWasher_YYYYMMDD_HHMM.xlsx
            const now = new Date();
            const timestamp = now.getFullYear().toString() +
                (now.getMonth() + 1).toString().padStart(2, '0') +
                now.getDate().toString().padStart(2, '0') + "_" +
                now.getHours().toString().padStart(2, '0') +
                now.getMinutes().toString().padStart(2, '0');

            XLSX.writeFile(wb, `清洗结果_${timestamp}.xlsx`);
        } catch (err) {
            console.error("Export failed:", err);
            alert("导出失败: " + err.message);
        }
    }

    reset() {
        const skeleton = document.getElementById('preview-skeleton');
        if (skeleton) {
            skeleton.style.display = 'flex';
            skeleton.querySelector('.skeleton-hint').textContent = "点击「执行清洗并预览」生成清洗结果";
        }
        if (this.table) {
            this.table.style.display = 'none';
            const thead = this.table.querySelector('thead');
            const tbody = this.table.querySelector('tbody');
            if (thead) thead.innerHTML = '';
            if (tbody) tbody.innerHTML = '';
        }
    }
}

export const preview = new Preview();
