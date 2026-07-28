// ═══════════════════════════════════════════════════════════════
//  Gestor Patrimonial — Frontend App
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // ── Estado Global ──────────────────────────────────────────
    let state = {
        billeteras: [],
        propositos: [],
        transactions: []
    };

    // ── Navegación por Pestañas ────────────────────────────────
    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active', 'border-accent-400', 'text-accent-400'));
            tabContents.forEach(c => c.classList.add('hidden'));
            
            tab.classList.add('active', 'border-accent-400', 'text-accent-400');
            document.getElementById(tab.dataset.target).classList.remove('hidden');
        });
    });

    // ── Modales ──────────────────────────────────────────────
    const setupModal = (overlayId, openBtnId, closeBtnId, backdropId = null) => {
        const overlay = document.getElementById(overlayId);
        const openBtn = document.getElementById(openBtnId);
        const closeBtns = document.querySelectorAll(closeBtnId);
        const backdrop = backdropId ? document.getElementById(backdropId) : overlay;

        if(openBtn) openBtn.addEventListener('click', () => overlay.classList.remove('hidden'));
        closeBtns.forEach(btn => btn.addEventListener('click', () => overlay.classList.add('hidden')));
        if(backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) overlay.classList.add('hidden'); });
    };

    setupModal('modal-overlay', 'btn-new-transaction', '#btn-close-modal', 'modal-backdrop-click');
    setupModal('modal-billetera', 'btn-new-billetera', '#modal-billetera .btn-close-sec', 'modal-billetera');
    setupModal('modal-proposito', 'btn-new-proposito', '#modal-proposito .btn-close-sec', 'modal-proposito');

    // ── Lógica Dinámica del Formulario Principal ───────────────
    const typeRadios = document.querySelectorAll('input[name="type"]');
    const subAhorroDiv = document.getElementById('sub-tipo-ahorro');
    const subAhorroRadios = document.querySelectorAll('input[name="sub_ahorro"]');
    
    const grpOrigen = document.getElementById('group-origen');
    const grpDestino = document.getElementById('group-destino');
    const grpProposito = document.getElementById('group-proposito');
    const grpPriority = document.getElementById('group-priority');

    function updateFormVisibility() {
        const type = document.querySelector('input[name="type"]:checked').value;
        const sub = document.querySelector('input[name="sub_ahorro"]:checked').value;

        // Reset
        grpOrigen.classList.add('hidden');
        grpDestino.classList.add('hidden');
        grpProposito.classList.add('hidden');
        grpPriority.classList.add('hidden');
        subAhorroDiv.classList.add('hidden');
        
        document.getElementById('tx-origen').removeAttribute('required');
        document.getElementById('tx-destino').removeAttribute('required');
        document.getElementById('tx-proposito').removeAttribute('required');
        document.querySelector('select[name="priority"]').removeAttribute('required');

        if (type === 'ingreso') {
            grpDestino.classList.remove('hidden');
            document.getElementById('tx-destino').setAttribute('required', 'true');
        } 
        else if (type === 'egreso') {
            grpOrigen.classList.remove('hidden');
            grpPriority.classList.remove('hidden');
            document.getElementById('tx-origen').setAttribute('required', 'true');
            document.querySelector('select[name="priority"]').setAttribute('required', 'true');
        }
        else if (type === 'transferencia') {
            grpOrigen.classList.remove('hidden');
            grpDestino.classList.remove('hidden');
            document.getElementById('tx-origen').setAttribute('required', 'true');
            document.getElementById('tx-destino').setAttribute('required', 'true');
        }
        else if (type === 'ahorro') {
            subAhorroDiv.classList.remove('hidden');
            grpProposito.classList.remove('hidden');
            document.getElementById('tx-proposito').setAttribute('required', 'true');
            
            if (sub === 'aporte') {
                grpOrigen.classList.remove('hidden'); // Sacar plata de la billetera
                document.getElementById('tx-origen').setAttribute('required', 'true');
            } else {
                grpDestino.classList.remove('hidden'); // Meter plata a la billetera
                document.getElementById('tx-destino').setAttribute('required', 'true');
            }
        }
    }

    typeRadios.forEach(r => r.addEventListener('change', updateFormVisibility));
    subAhorroRadios.forEach(r => r.addEventListener('change', updateFormVisibility));
    updateFormVisibility(); // Init

    // ── Carga de Datos (Fetch) ─────────────────────────────────
    async function loadAll() {
        await Promise.all([
            loadBilleteras(),
            loadPropositos(),
            loadSummary(),
            loadTransactions()
        ]);
        renderSelects();
        renderBilleterasTab();
        renderPropositosTab();
    }

    async function loadBilleteras() {
        const res = await fetch('/api/billeteras');
        const json = await res.json();
        state.billeteras = json.data || [];
    }

    async function loadPropositos() {
        const res = await fetch('/api/propositos');
        const json = await res.json();
        state.propositos = json.data || [];
    }

    async function loadSummary() {
        const res = await fetch('/api/summary');
        const json = await res.json();
        const data = json.data || {};
        
        document.getElementById('total-ingresos').innerHTML = `${Number(data.ingresos || 0).toFixed(2)} <span class="text-sm font-medium text-gray-500">USDT</span>`;
        document.getElementById('total-egresos').innerHTML = `${Number(data.egresos || 0).toFixed(2)} <span class="text-sm font-medium text-gray-500">USDT</span>`;
        document.getElementById('total-ahorros').innerHTML = `${Number(data.ahorros || 0).toFixed(2)} <span class="text-sm font-medium text-gray-500">USDT</span>`;
        document.getElementById('total-balance').innerHTML = `${Number(data.balance || 0).toFixed(2)} <span class="text-sm font-medium text-gray-500">USDT</span>`;
    }

    async function loadTransactions() {
        const typeFilter = document.getElementById('filter-type').value;
        const res = await fetch(`/api/transactions?type=${typeFilter}`);
        const json = await res.json();
        state.transactions = json.data || [];
        renderTransactions();
    }
    
    document.getElementById('filter-type').addEventListener('change', loadTransactions);

    // ── Renderización de UI ────────────────────────────────────
    function renderSelects() {
        const selectOrigen = document.getElementById('tx-origen');
        const selectDestino = document.getElementById('tx-destino');
        const selectProposito = document.getElementById('tx-proposito');

        const optsBilleteras = `<option value="" disabled selected>Selecciona una Billetera...</option>` + 
                               state.billeteras.map(b => `<option value="${b.id}">${b.nombre} ($${b.saldo_actual.toFixed(2)})</option>`).join('');
        
        selectOrigen.innerHTML = optsBilleteras;
        selectDestino.innerHTML = optsBilleteras;

        selectProposito.innerHTML = `<option value="" disabled selected>Selecciona un Propósito...</option>` + 
                                     state.propositos.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    }

    function renderBilleterasTab() {
        const grid = document.getElementById('billeteras-grid');
        const bar = document.getElementById('liquidez-bar');
        const leyenda = document.getElementById('liquidez-leyenda');
        
        const totalLiquidez = state.billeteras.reduce((sum, b) => sum + (b.saldo_actual > 0 ? b.saldo_actual : 0), 0);
        document.getElementById('liquidez-total').innerText = `${totalLiquidez.toFixed(2)} USDT`;

        grid.innerHTML = ''; bar.innerHTML = ''; leyenda.innerHTML = '';

        state.billeteras.forEach(b => {
            const isNegative = b.saldo_actual < 0;
            // Tarjeta
            grid.innerHTML += `
                <div class="bg-surface-900 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-8 h-8 rounded-full" style="background-color: ${b.color}"></div>
                        <h3 class="font-semibold text-white">${b.nombre}</h3>
                    </div>
                    <p class="text-2xl font-bold ${isNegative ? 'text-expense' : 'text-white'}">
                        $${b.saldo_actual.toFixed(2)}
                    </p>
                </div>
            `;

            // Barra (solo cuenta saldos positivos)
            if (b.saldo_actual > 0 && totalLiquidez > 0) {
                const pct = (b.saldo_actual / totalLiquidez) * 100;
                bar.innerHTML += `<div class="h-full progress-bar-inner" style="width: ${pct}%; background-color: ${b.color};" title="${b.nombre}: ${pct.toFixed(1)}%"></div>`;
                leyenda.innerHTML += `<div class="flex items-center gap-1.5"><div class="w-2.5 h-2.5 rounded-full" style="background-color: ${b.color}"></div><span>${b.nombre} (${pct.toFixed(1)}%)</span></div>`;
            }
        });
    }

    function renderPropositosTab() {
        const grid = document.getElementById('propositos-grid');
        grid.innerHTML = '';

        state.propositos.forEach(p => {
            const pct = p.monto_objetivo > 0 ? Math.min(100, (p.monto_actual / p.monto_objetivo) * 100) : 0;
            const isDone = pct >= 100;
            const barColor = isDone ? '#10B981' : p.color; // Emerald si completado
            
            grid.innerHTML += `
                <div class="bg-surface-900 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition relative overflow-hidden group">
                    <div class="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div class="relative">
                        <div class="flex justify-between items-start mb-4">
                            <h3 class="font-bold text-lg text-white" style="color: ${p.color}">${p.nombre}</h3>
                            <span class="text-xs px-2 py-1 rounded-full ${isDone ? 'bg-income/20 text-income' : 'bg-white/10 text-gray-400'}">${pct.toFixed(1)}%</span>
                        </div>
                        <p class="text-2xl font-bold text-white mb-1">$${p.monto_actual.toFixed(2)}</p>
                        <p class="text-xs text-gray-500 mb-4">de $${p.monto_objetivo.toFixed(2)} objetivo</p>
                        
                        <div class="h-2 w-full bg-surface-800 rounded-full overflow-hidden mb-4">
                            <div class="h-full progress-bar-inner" style="width: ${pct}%; background-color: ${barColor};"></div>
                        </div>

                        <div class="flex gap-2">
                            <button onclick="quickAction('ahorro', 'aporte', ${p.id})" class="flex-1 text-center py-1.5 rounded-lg bg-savings/10 hover:bg-savings/20 text-savings text-xs font-semibold transition">+ Aportar</button>
                            <button onclick="quickAction('ahorro', 'retiro', ${p.id})" class="flex-1 text-center py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-gray-400 text-xs font-semibold transition">- Retirar</button>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    // Acción rápida desde tarjeta Propósito
    window.quickAction = (type, sub, propositoId) => {
        document.getElementById('btn-new-transaction').click();
        
        // Simular clicks en los radios
        const typeRadio = document.querySelector(`input[name="type"][value="${type}"]`);
        if(typeRadio) { typeRadio.checked = true; typeRadio.dispatchEvent(new Event('change')); }
        
        const subRadio = document.querySelector(`input[name="sub_ahorro"][value="${sub}"]`);
        if(subRadio) { subRadio.checked = true; subRadio.dispatchEvent(new Event('change')); }

        setTimeout(() => {
            const selectProp = document.getElementById('tx-proposito');
            if(selectProp) selectProp.value = propositoId;
        }, 100);
    };

    function renderTransactions() {
        const tbody = document.getElementById('transactions-table-body');
        tbody.innerHTML = '';
        
        if (state.transactions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-gray-500">No hay transacciones registradas.</td></tr>`;
            return;
        }

        const typeLabels = {
            ingreso: { bg: 'bg-income/20', text: 'text-income', lbl: 'Ingreso' },
            egreso: { bg: 'bg-expense/20', text: 'text-expense', lbl: 'Egreso' },
            transferencia: { bg: 'bg-transfer/20', text: 'text-transfer', lbl: 'Transferencia' },
            ahorro: { bg: 'bg-savings/20', text: 'text-savings', lbl: 'Aporte Ahorro' },
            retiro_ahorro: { bg: 'bg-white/10', text: 'text-gray-300', lbl: 'Retiro Ahorro' }
        };

        state.transactions.forEach(t => {
            const style = typeLabels[t.type] || typeLabels.egreso;
            
            // Construir texto de routing
            let routingText = '-';
            if (t.type === 'ingreso') routingText = `A: ${t.billetera_destino_nombre || 'No asignada'}`;
            if (t.type === 'egreso') routingText = `De: ${t.billetera_origen_nombre || 'No asignada'}`;
            if (t.type === 'transferencia') routingText = `${t.billetera_origen_nombre} → ${t.billetera_destino_nombre}`;
            if (t.type === 'ahorro') routingText = `${t.billetera_origen_nombre} → Meta: ${t.proposito_nombre}`;
            if (t.type === 'retiro_ahorro') routingText = `Meta: ${t.proposito_nombre} → ${t.billetera_destino_nombre}`;

            // Determinar si el monto suma o resta en la vista global (puramente estético en la tabla)
            const sign = (t.type === 'ingreso' || t.type === 'retiro_ahorro') ? '+' : (t.type === 'transferencia' ? '' : '-');

            tbody.innerHTML += `
                <tr class="hover:bg-white/[0.02] transition">
                    <td class="px-5 py-4 whitespace-nowrap text-sm text-gray-400">${t.date}</td>
                    <td class="px-5 py-4">
                        <div class="flex flex-col">
                            <span class="text-sm text-white font-medium">${t.description}</span>
                            <span class="text-xs px-2 py-0.5 rounded-full w-max mt-1 ${style.bg} ${style.text}">${style.lbl}</span>
                        </div>
                    </td>
                    <td class="px-5 py-4 text-xs text-gray-400 font-medium">${routingText}</td>
                    <td class="px-5 py-4 whitespace-nowrap text-right font-bold text-sm ${style.text}">
                        ${sign}$${t.amount.toFixed(2)}
                    </td>
                    <td class="px-5 py-4 whitespace-nowrap text-center">
                        <button onclick="deleteTransaction(${t.id})" class="text-gray-500 hover:text-expense transition p-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    // ── Eliminación ─────────────────────────────────────────────
    window.deleteTransaction = async (id) => {
        if (!confirm('¿Eliminar esta transacción permanentemente? Se actualizarán los saldos.')) return;
        
        try {
            const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
            if (res.ok) {
                showToast('Transacción eliminada');
                loadAll();
            }
        } catch (e) {
            console.error(e);
            showToast('Error al eliminar', 'error');
        }
    };

    // ── Envíos de Formularios ──────────────────────────────────
    document.getElementById('transaction-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Hack the type if subAhorro is 'retiro'
        let txType = document.querySelector('input[name="type"]:checked').value;
        const sub = document.querySelector('input[name="sub_ahorro"]:checked').value;
        if (txType === 'ahorro' && sub === 'retiro') {
            txType = 'retiro_ahorro'; // Override para la BD
        }

        const formData = {
            type: txType,
            date: e.target.date.value,
            amount: parseFloat(e.target.amount.value),
            description: e.target.description.value,
            priority: e.target.priority.value || 'no_prioritario', // Opcional en ingresos/transferencias
            billetera_origen_id: e.target.billetera_origen_id.value,
            billetera_destino_id: e.target.billetera_destino_id.value,
            proposito_id: e.target.proposito_id.value
        };

        try {
            const res = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                document.getElementById('modal-overlay').classList.add('hidden');
                e.target.reset();
                updateFormVisibility();
                showToast('Transacción registrada');
                loadAll();
            } else {
                throw new Error("Error guardando transacción");
            }
        } catch (error) {
            console.error(error);
            showToast('Error al guardar', 'error');
        }
    });

    document.getElementById('form-billetera').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            nombre: e.target.nombre.value,
            saldo_inicial: parseFloat(e.target.saldo_inicial.value) || 0,
            color: e.target.color.value
        };
        const res = await fetch('/api/billeteras', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (res.ok) {
            document.getElementById('modal-billetera').classList.add('hidden');
            e.target.reset();
            loadAll();
            showToast('Billetera agregada');
        }
    });

    document.getElementById('form-proposito').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            nombre: e.target.nombre.value,
            monto_objetivo: parseFloat(e.target.monto_objetivo.value),
            color: e.target.color.value
        };
        const res = await fetch('/api/propositos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (res.ok) {
            document.getElementById('modal-proposito').classList.add('hidden');
            e.target.reset();
            loadAll();
            showToast('Propósito agregado');
        }
    });

    // ── Toast Helper ───────────────────────────────────────────
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `px-4 py-3 rounded-xl text-sm font-medium text-white shadow-xl transform transition-all duration-300 translate-y-10 opacity-0 flex items-center gap-2 ${type === 'success' ? 'bg-accent-600' : 'bg-expense'}`;
        toast.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>${message}`;
        container.appendChild(toast);
        
        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-10', 'opacity-0');
        });
        setTimeout(() => {
            toast.classList.add('translate-y-10', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Init
    loadAll();
});
