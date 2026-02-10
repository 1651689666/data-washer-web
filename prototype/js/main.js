
import { dbService } from './core/database.js';
import { store } from './core/store.js';
import { transformRegistry } from './core/transform-registry.js';
import { excelLoader } from './services/excel-loader.js';
import { sidebar } from './components/sidebar.js';
import { grid } from './components/grid.js';
import { joinPanel } from './components/join-panel.js';
import { preview } from './components/preview.js';
import { fieldPanel } from './components/field-panel.js';
import { rulesPanel } from './components/rules-panel.js';
import { validationPanel } from './components/validation-panel.js';
import { layoutManager } from './components/layout.js';
import { validationRegistry } from './core/validation-registry.js';
import { regionService } from './services/region-service.js';

console.log('App Initializing...');

async function initApp() {
    // Initialize DB
    await dbService.init();

    // 0. Sync TransformRegistry with Store (Critical: do this before components init)
    // Initial sync
    const initialCustomRules = store.getState().customRules || [];
    transformRegistry.setCustomRules(initialCustomRules);

    // Subscribe to store changes to keep registry in sync
    store.subscribe((state) => {
        transformRegistry.setCustomRules(state.customRules);
        validationRegistry.setCustomRules(state.validationRules);
    });

    // Initialize Components
    try { excelLoader.init(); } catch (e) { console.error('excelLoader init failed', e); }
    try { sidebar.init(); } catch (e) { console.error('sidebar init failed', e); }
    try { joinPanel.init(); } catch (e) { console.error('joinPanel init failed', e); }
    try { grid.init(); } catch (e) { console.error('grid init failed', e); }
    try { preview.init(); } catch (e) { console.error('preview init failed', e); }
    try { fieldPanel.init(); } catch (e) { console.error('fieldPanel init failed', e); }
    try { rulesPanel.init(); } catch (e) { console.error('rulesPanel init failed', e); }
    try { validationPanel.init(); } catch (e) { console.error('validationPanel init failed', e); }
    try { layoutManager.init(); } catch (e) { console.error('layoutManager init failed', e); }

    // Bind Run/Preview Button
    const runBtn = document.getElementById('run-btn');
    if (runBtn) {
        runBtn.addEventListener('click', async () => {
            runBtn.disabled = true;
            runBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 处理中...';

            try {
                const state = store.getState();
                const regions = state.configs.regions || [];

                // Ensure all regions are sync'd to DB tables before execution
                await regionService.saveAllRegionsToDB(regions);

                const fieldConfigs = state.fieldConfigs || [];
                const mergeStrategy = state.configs.mergeStrategy || { type: 'vertical', verticalConfig: { matchMode: 'byName' } };

                // Use the new centralized SQL builder that handles joins/unions and mapping correctly
                const finalSql = dbService.buildExecutionSql(regions, mergeStrategy, fieldConfigs);
                console.log("Final Processing SQL:", finalSql);

                const res = await dbService.execute(finalSql);

                if (res && res.rows.length >= 0) {
                    const headers = res.fields.map(f => f.name);
                    let rows = res.rows.map(r => headers.map(h => r[h]));

                    // --- Apply JS-only transforms (that SQL couldn't handle) ---
                    const fieldConfigs = store.getState().fieldConfigs || [];
                    const configMap = new Map();
                    fieldConfigs.forEach(c => {
                        if (c.physAlias) configMap.set(c.physAlias, c);
                    });

                    rows = rows.map((row) => {
                        // Create context object for rules that need row access
                        const rowObj = {};
                        headers.forEach((h, i) => rowObj[h] = row[i]);

                        return row.map((val, colIndex) => {
                            const header = headers[colIndex];
                            const config = configMap.get(header);
                            // Support multiple strategies
                            const strategies = config?.strategies || (config?.strategy ? [config.strategy] : []);

                            if (strategies.length > 0) {
                                // Apply JS transforms for rules that are not handled by SQL
                                // applyJsTransforms internally filters out SQL-only rules
                                const { value } = transformRegistry.applyJsTransforms(val, rowObj, strategies);
                                return value;
                            }
                            return val;
                        });
                    });
                    // -----------------------------------------------------------

                    await dbService.createTableFromData("t_result", headers, rows);
                    preview.refresh("t_result");
                } else {
                    alert("执行结果为空。");
                }

            } catch (e) {
                console.error("Run failed:", e);
                alert("执行失败: " + e.message);
            } finally {
                runBtn.disabled = false;
                runBtn.innerHTML = '<i data-lucide="play"></i> 执行清洗并预览';
                if (window.lucide) window.lucide.createIcons();
            }
        });
    }
}

// Bind Clear All Button
const clearBtn = document.getElementById('clear-all-btn');
if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
        if (confirm('确定要清空所有配置（表格区域、合并策略、字段清洗）和清洗结果吗？')) {
            // 1. Reset Store
            store.resetAllConfigs();

            // 2. Reset Sidebar (Regions)
            sidebar.reset();

            // 3. Reset Preview (Results)
            preview.reset();

            // 4. Force re-render of dependent panels
            joinPanel.render();
            fieldPanel.render();
            grid.init(); // Redraw grid highlights

            if (window.lucide) window.lucide.createIcons();
            console.log("All configurations and results cleared.");
        }
    });
}

console.log('App Initialized.');

document.addEventListener('DOMContentLoaded', initApp);
