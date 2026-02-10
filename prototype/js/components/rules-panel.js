import { store } from '../core/store.js';
import { transformRegistry } from '../core/transform-registry.js';

class RulesPanel {
    constructor() {
        this.container = document.getElementById('rules-panel-container');
        this.modal = document.getElementById('rule-editor-modal');
        this.editingRuleId = null;
        this.state = {
            isOpen: false
        };
    }

    init() {
        if (!this.container) return;
        this.render();
        this.bindEvents();

        // Sync registry with store initially
        // transformRegistry.setCustomRules(store.getState().customRules); // Moved to main.js

        // Subscribe to store changes
        store.subscribe((state) => {
            // transformRegistry.setCustomRules(state.customRules); // Moved to main.js
            this.render();
        });
    }

    render() {
        const rules = store.getState().customRules || [];

        this.container.innerHTML = `
            <div class="config-item ${this.state.isOpen ? 'open' : ''}">
                <div class="config-item-header">
                    <i data-lucide="settings-2"></i>
                    <span>清洗规则库</span>
                    <button class="btn-icon-sm" id="add-rule-btn" title="添加自定义规则" style="margin-left: auto;">
                        <i data-lucide="plus"></i>
                    </button>
                    <i data-lucide="chevron-down" class="chevron"></i>
                </div>
                <div class="config-item-body">
                    <div class="rule-list" id="custom-rule-list">
                        ${rules.length === 0 ? '<p class="hint">暂无自定义规则</p>' : ''}
                        ${rules.map(rule => `
                            <div class="rule-item" data-id="${rule.id}">
                                <div class="rule-info">
                                    <span class="rule-name">${rule.name}</span>
                                    <small class="rule-type">JS 引擎</small>
                                </div>
                                <div class="rule-actions">
                                    <button class="btn-icon-sm edit-rule" title="编辑"><i data-lucide="pencil"></i></button>
                                    <button class="btn-icon-sm delete-rule" title="删除"><i data-lucide="trash-2"></i></button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();
    }

    bindEvents() {
        this.container.addEventListener('click', (e) => {
            const addBtn = e.target.closest('#add-rule-btn');
            if (addBtn) {
                this.openModal();
                return;
            }

            const editBtn = e.target.closest('.edit-rule');
            if (editBtn) {
                const id = editBtn.closest('.rule-item').dataset.id;
                this.openModal(id);
                return;
            }

            const deleteBtn = e.target.closest('.delete-rule');
            if (deleteBtn) {
                const id = deleteBtn.closest('.rule-item').dataset.id;
                this.deleteRule(id);
                return;
            }

            const header = e.target.closest('.config-item-header');
            if (header) {
                this.state.isOpen = !this.state.isOpen;
                this.render();
            }
        });

        document.getElementById('rule-modal-close').onclick = () => this.closeModal();
        document.getElementById('rule-modal-cancel').onclick = () => this.closeModal();
        document.getElementById('rule-modal-save').onclick = () => this.saveRule();
    }

    openModal(ruleId = null) {
        this.editingRuleId = ruleId;
        const nameInput = document.getElementById('rule-name-input');
        const codeInput = document.getElementById('rule-code-input');

        if (ruleId) {
            const rule = store.getState().customRules.find(r => r.id === ruleId);
            nameInput.value = rule.name;
            codeInput.value = rule.code;
            this.modal.querySelector('h3').textContent = '编辑清洗规则';
        } else {
            nameInput.value = '';
            codeInput.value = 'return value;';
            this.modal.querySelector('h3').textContent = '新增清洗规则';
        }

        this.modal.style.display = 'flex';
    }

    closeModal() {
        this.modal.style.display = 'none';
        this.editingRuleId = null;
    }

    saveRule() {
        const name = document.getElementById('rule-name-input').value.trim();
        const code = document.getElementById('rule-code-input').value.trim();

        if (!name) {
            alert('请输入规则名称');
            return;
        }

        const rules = [...(store.getState().customRules || [])];
        if (this.editingRuleId) {
            const idx = rules.findIndex(r => r.id === this.editingRuleId);
            rules[idx] = { ...rules[idx], name, code };
        } else {
            rules.push({
                id: 'custom_' + Date.now(),
                name,
                code
            });
        }

        store.setCustomRules(rules);
        this.closeModal();
    }

    deleteRule(id) {
        if (!confirm('确定删除该规则吗？')) return;
        const rules = store.getState().customRules.filter(r => r.id !== id);
        store.setCustomRules(rules);
    }
}

export const rulesPanel = new RulesPanel();
