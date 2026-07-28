// ═══════════════════════════════════════════════════════════════
//  Gestor Patrimonial — Frontend App v3.0.0
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // ── Utilidades ──────────────────────────────────────────────
    const getMonthStr = (d = new Date()) => d.toISOString().slice(0, 7);
    const formatDateEs = (dateStr) => {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('-');
        const d = new Date(year, parseInt(month) - 1, day);
        return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
    };
    const formatMonthEs = (monthStr) => {
        const [year, month] = monthStr.split('-');
        const d = new Date(year, parseInt(month) - 1, 1);
        return d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    };

    // ── Estado Global ──────────────────────────────────────────
    let state = {
        billeteras: [],
        propositos: [],
        transactions: [],
        monthlySummary: [],
        currentRealMonth: getMonthStr(),
        viewingMonth: getMonthStr(),
        activeCardFilter: null // 'ingreso' | 'egreso' | null
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

    // ── Modales Base ───────────────────────────────────────────
    const setupModal = (overlayId, openBtnId, closeBtnId, backdropId = null) => {
        const overlay = document.getElementById(overlayId);
        const openBtn = openBtnId ? document.getElementById(openBtnId) : null;
        const closeBtns = document.querySelectorAll(closeBtnId);
        const backdrop = backdropId ? document.getElementById(backdropId) : overlay;

        if(openBtn) openBtn.addEventListener('click', () => overlay.classList.remove('hidden'));
        closeBtns.forEach(btn => btn.addEventListener('click', () => overlay.classList.add('hidden')));
        if(backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) overlay.classList.add('hidden'); });
        
        return {
            open: () => overlay.classList.remove('hidden'),
            close: () => overlay.classList.add('hidden')
        };
    };

    const modalTx = setupModal('modal-overlay', 'btn-new-transaction', '#btn-close-modal', 'modal-backdrop-click');
    const modalBilletera = setupModal('modal-billetera', 'btn-new-billetera', '#modal-billetera .btn-close-sec', 'modal-billetera');
    const modalProposito = setupModal('modal-proposito', 'btn-new-proposito', '#modal-proposito .btn-close-sec', 'modal-proposito');
    const modalEvidencias = setupModal('modal-evidencias', null, '#modal-evidencias .btn-close-sec');
    const modalViewer = setupModal('modal-image-viewer', null, '#btn-close-viewer', 'modal-image-viewer');

    // Override open de modal tx para limpiar campos si es nuevo
    document.getElementById('btn-new-transaction').addEventListener('click', () => {
        document.getElementById('transaction-form').reset();
        document.getElementById('tx-id-input').value = "";
        document.getElementById('tx-type-section').classList.remove('hidden');
        document.getElementById('tx-modal-title').innerText = "Nueva Transacción";
        document.getElementById('tx-date').value = new Date().toISOString().slice(0, 10);
        document.getElementById('tx-current-invoice').classList.add('hidden');
        document.getElementById('tx-delete-invoice-flag').value = "false";
        updateFormVisibility();
    });

    // ── Filtros Visuales en Registros ──────────────────────────
    const filterCards = document.querySelectorAll('.card-filter');
    filterCards.forEach(card => {
        card.addEventListener('click', () => {
            const filter = card.dataset.filter;
            if (state.activeCardFilter === filter) {
                // Toggle off
                state.activeCardFilter = null;
                card.classList.remove('ring-2');
                card.classList.remove(filter === 'ingreso' ? 'ring-income' : 'ring-expense');
            } else {
                // Toggle on
                filterCards.forEach(c => c.classList.remove('ring-2', 'ring-income', 'ring-expense'));
                state.activeCardFilter = filter;
                card.classList.add('ring-2');
                card.classList.add(filter === 'ingreso' ? 'ring-income' : 'ring-expense');
            }
            loadTransactions(); // Recargar tabla
        });
    });

    document.getElementById('btn-back-to-current').addEventListener('click', () => {
        state.viewingMonth = state.currentRealMonth;
        document.getElementById('mes-actual-lbl').innerText = "Mes Actual";
        document.getElementById('btn-back-to-current').classList.add('hidden');
        document.getElementById('read-only-banner').classList.add('hidden');
        loadAll();
    });

    // ── Visor de Imágenes ──────────────────────────────────────
    window.openImageViewer = (src) => {
        document.getElementById('viewer-img').src = src;
        modalViewer.open();
    };

    document.getElementById('btn-view-invoice').addEventListener('click', () => {
        const url = document.getElementById('btn-view-invoice').dataset.url;
        if (url) openImageViewer(url);
    });

    document.getElementById('btn-remove-invoice').addEventListener('click', () => {
        document.getElementById('tx-current-invoice').classList.add('hidden');
        document.getElementById('tx-delete-invoice-flag').value = "true";
    });

    // ── Lógica Dinámica del Formulario TX ──────────────────────
    const typeRadios = document.querySelectorAll('input[name="type"]');
    const subAhorroRadios = document.querySelectorAll('input[name="sub_ahorro"]');
    
    function updateFormVisibility() {
        const typeEl = document.querySelector('input[name="type"]:checked');
        const subEl = document.querySelector('input[name="sub_ahorro"]:checked');
        if (!typeEl) return;
        
        const type = typeEl.value;
        const sub = subEl ? subEl.value : null;

        const grpOrigen = document.getElementById('group-origen');
        const grpDestino = document.getElementById('group-destino');
        const grpProposito = document.getElementById('group-proposito');
        const grpPriority = document.getElementById('group-priority');
        const subAhorroDiv = document.getElementById('sub-tipo-ahorro');

        grpOrigen.classList.add('hidden');
        grpDestino.classList.add('hidden');
        grpProposito.classList.add('hidden');
        grpPriority.classList.add('hidden');
        subAhorroDiv.classList.add('hidden');
        
        document.getElementById('tx-origen').removeAttribute('required');
        document.getElementById('tx-destino').removeAttribute('required');
        document.getElementById('tx-proposito').removeAttribute('required');
        document.getElementById('tx-priority').removeAttribute('required');

        if (type === 'ingreso') {
            grpDestino.classList.remove('hidden');
            document.getElementById('tx-destino').setAttribute('required', 'true');
        } 
        else if (type === 'egreso') {
            grpOrigen.classList.remove('hidden');
            grpPriority.classList.remove('hidden');
            document.getElementById('tx-origen').setAttribute('required', 'true');
            document.getElementById('tx-priority').setAttribute('required', 'true');
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
                grpOrigen.classList.remove('hidden');
                document.getElementById('tx-origen').setAttribute('required', 'true');
            } else {
                grpDestino.classList.remove('hidden');
                document.getElementById('tx-destino').setAttribute('required', 'true');
            }
        }
    }

    typeRadios.forEach(r => r.addEventListener('change', updateFormVisibility));
    subAhorroRadios.forEach(r => r.addEventListener('change', updateFormVisibility));

    // ── Carga de Datos (Fetch) ─────────────────────────────────
    async function loadAll() {
        await Promise.all([
            loadBilleteras(),
            loadPropositos(),
            loadSummary(),
            loadMonthlySummary(),
            loadTransactions()
        ]);
        renderSelects();
        renderBilleterasTab();
        renderPropositosTab();
        renderArchive();
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
        
        document.getElementById('total-ingresos').innerHTML = `${Number(data.ingresos || 0).toFixed(2)} <span class="text-sm font-medium text-gray-500">USD</span>`;
        document.getElementById('total-egresos').innerHTML = `${Number(data.egresos || 0).toFixed(2)} <span class="text-sm font-medium text-gray-500">USD</span>`;
        document.getElementById('total-ahorros').innerHTML = `${Number(data.ahorros || 0).toFixed(2)} <span class="text-sm font-medium text-gray-500">USD</span>`;
        document.getElementById('total-balance').innerHTML = `${Number(data.balance || 0).toFixed(2)} <span class="text-sm font-medium text-gray-500">USD</span>`;
    }

    async function loadMonthlySummary() {
        const res = await fetch('/api/monthly-summary');
        const json = await res.json();
        state.monthlySummary = json.data || [];
    }

    async function loadTransactions() {
        let url = `/api/transactions?month=${state.viewingMonth}`;
        if (state.activeCardFilter) url += `&type=${state.activeCardFilter}`;
        
        const res = await fetch(url);
        const json = await res.json();
        state.transactions = json.data || [];
        renderTransactions();
    }

    // ── Renderización de UI ────────────────────────────────────
    function renderSelects() {
        const selectOrigen = document.getElementById('tx-origen');
        const selectDestino = document.getElementById('tx-destino');
        const selectProposito = document.getElementById('tx-proposito');

        const optsBilleteras = `<option value="" disabled selected>Selecciona una Billetera...</option>` + 
                               state.billeteras.map(b => `<option value="${b.id}">${b.nombre} ($${b.saldo_actual.toFixed(2)})</option>`).join('');
        
        selectOrigen.innerHTML = optsBilleteras;
        selectDestino.innerHTML = optsBilleteras;

        // Solo mostrar metas activas
        const activas = state.propositos.filter(p => p.estado !== 'completado');
        selectProposito.innerHTML = `<option value="" disabled selected>Selecciona una Meta...</option>` + 
                                     activas.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    }

    function renderArchive() {
        const container = document.getElementById('archive-container');
        container.innerHTML = '';
        
        if (state.monthlySummary.length === 0) {
            container.innerHTML = '<p class="text-xs text-gray-500">No hay datos históricos aún.</p>';
            return;
        }

        // Agrupar por año
        const byYear = {};
        state.monthlySummary.forEach(m => {
            if (m.month === state.currentRealMonth) return; // No mostrar el mes actual en archivo
            const year = m.month.split('-')[0];
            if (!byYear[year]) byYear[year] = [];
            byYear[year].push(m);
        });

        for (const [year, months] of Object.entries(byYear).sort((a,b) => b[0] - a[0])) {
            let html = `
                <div class="mb-4">
                    <h4 class="text-xs font-bold text-gray-400 mb-2">${year}</h4>
                    <div class="flex flex-wrap gap-2">
            `;
            
            months.forEach(m => {
                const isActive = m.month === state.viewingMonth;
                html += `
                    <button onclick="changeViewingMonth('${m.month}')" class="px-3 py-1.5 rounded-lg border ${isActive ? 'bg-accent-600/20 border-accent-500 text-accent-400' : 'bg-surface-850 border-white/5 text-gray-400 hover:bg-white/5'} text-xs font-medium transition">
                        ${formatMonthEs(m.month).split(' ')[0]}
                    </button>
                `;
            });
            
            html += `</div></div>`;
            container.innerHTML += html;
        }
    }

    window.changeViewingMonth = (month) => {
        state.viewingMonth = month;
        
        document.getElementById('mes-actual-lbl').innerText = formatMonthEs(month).toUpperCase();
        document.getElementById('btn-back-to-current').classList.remove('hidden');
        
        // Mostrar banner de solo lectura
        const banner = document.getElementById('read-only-banner');
        if (month !== state.currentRealMonth) {
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
        
        loadTransactions();
        renderArchive();
    };

    function renderBilleterasTab() {
        const grid = document.getElementById('billeteras-grid');
        const bar = document.getElementById('liquidez-bar');
        const leyenda = document.getElementById('liquidez-leyenda');
        
        const totalLiquidez = state.billeteras.reduce((sum, b) => sum + (b.saldo_actual > 0 ? b.saldo_actual : 0), 0);
        document.getElementById('liquidez-total').innerText = `${totalLiquidez.toFixed(2)} USD`;

        grid.innerHTML = ''; bar.innerHTML = ''; leyenda.innerHTML = '';

        state.billeteras.forEach(b => {
            const isNegative = b.saldo_actual < 0;
            
            grid.innerHTML += `
                <div class="bg-surface-900 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition relative group">
                    <div class="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition flex gap-1">
                        <button onclick="editBilletera(${b.id}, '${b.nombre}')" class="p-1 text-gray-400 hover:text-accent-400 bg-surface-950 rounded"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></button>
                        <button onclick="hideBilletera(${b.id}, '${b.nombre}')" class="p-1 text-gray-400 hover:text-expense bg-surface-950 rounded" title="Ocultar (Eliminado lógico)"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0a10.05 10.05 0 015.71-2.29c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0l-3.29-3.29"/></svg></button>
                    </div>
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-8 h-8 rounded-full" style="background-color: ${b.color}"></div>
                        <h3 class="font-semibold text-white">${b.nombre}</h3>
                    </div>
                    <p class="text-2xl font-bold ${isNegative ? 'text-expense' : 'text-white'}">
                        $${b.saldo_actual.toFixed(2)}
                    </p>
                </div>
            `;

            if (b.saldo_actual > 0 && totalLiquidez > 0) {
                const pct = (b.saldo_actual / totalLiquidez) * 100;
                bar.innerHTML += `<div class="h-full progress-bar-inner" style="width: ${pct}%; background-color: ${b.color};" title="${b.nombre}: ${pct.toFixed(1)}%"></div>`;
                leyenda.innerHTML += `<div class="flex items-center gap-1.5"><div class="w-2.5 h-2.5 rounded-full" style="background-color: ${b.color}"></div><span>${b.nombre} (${pct.toFixed(1)}%)</span></div>`;
            }
        });
    }

    function renderPropositosTab() {
        const gridActivos = document.getElementById('propositos-grid');
        const gridLogrados = document.getElementById('logradas-grid');
        const sectionLogradas = document.getElementById('metas-logradas-section');
        
        gridActivos.innerHTML = '';
        gridLogrados.innerHTML = '';
        let hasLogradas = false;

        state.propositos.forEach(p => {
            const pct = p.monto_objetivo > 0 ? Math.min(100, (p.monto_actual / p.monto_objetivo) * 100) : 0;
            const isDone = p.estado === 'completado';
            
            if (isDone) {
                hasLogradas = true;
                gridLogrados.innerHTML += `
                    <div class="bg-surface-900 border-2 border-income/30 rounded-2xl p-5 relative overflow-hidden group">
                        <div class="absolute inset-0 bg-income/5"></div>
                        <div class="relative z-10 flex flex-col h-full">
                            <div class="flex justify-between items-start mb-4">
                                <h3 class="font-bold text-lg text-white">${p.nombre}</h3>
                                <span class="text-xs px-2 py-1 rounded-full bg-income/20 text-income font-bold">100%</span>
                            </div>
                            <p class="text-2xl font-bold text-white mb-4">$${p.monto_actual.toFixed(2)}</p>
                            
                            <div class="mt-auto pt-4">
                                <button onclick="openEvidenciaModal(${p.id}, '${p.nombre.replace(/'/g, "\\'")}')" class="w-full py-2 rounded-xl bg-surface-950 border border-income/20 text-income text-sm font-semibold hover:bg-income/10 transition flex items-center justify-center gap-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                                    Ver Evidencias
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                // Activo
                gridActivos.innerHTML += `
                    <div class="bg-surface-900 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition relative group">
                        <!-- Menú rápido (Editar/Eliminar) -->
                        <div class="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition flex gap-1 z-20">
                            <button onclick="editProposito(${p.id}, '${p.nombre}', ${p.monto_objetivo}, '${p.color}')" class="p-1 text-gray-400 hover:text-accent-400 bg-surface-950 rounded"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></button>
                            ${!p.is_default ? `<button onclick="deleteProposito(${p.id})" class="p-1 text-gray-400 hover:text-expense bg-surface-950 rounded"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>` : ''}
                        </div>
                        
                        <div class="relative z-10">
                            <div class="flex justify-between items-start mb-4 pr-16">
                                <h3 class="font-bold text-lg text-white" style="color: ${p.color}">${p.nombre}</h3>
                            </div>
                            <p class="text-2xl font-bold text-white mb-1">$${p.monto_actual.toFixed(2)}</p>
                            <p class="text-xs text-gray-500 mb-4">de $${p.monto_objetivo.toFixed(2)} objetivo</p>
                            
                            <div class="h-2 w-full bg-surface-800 rounded-full overflow-hidden mb-4">
                                <div class="h-full progress-bar-inner" style="width: ${pct}%; background-color: ${p.color};"></div>
                            </div>

                            ${pct >= 100 ? `
                                <button onclick="marcarCompletada(${p.id})" class="w-full py-2 rounded-xl bg-income hover:bg-emerald-500 text-surface-950 text-sm font-bold transition flex items-center justify-center gap-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                    Reclamar Logro
                                </button>
                            ` : `
                                <div class="flex gap-2">
                                    <button onclick="quickAction('ahorro', 'aporte', ${p.id})" class="flex-1 text-center py-1.5 rounded-lg bg-savings/10 hover:bg-savings/20 text-savings text-xs font-semibold transition">+ Aportar</button>
                                    <button onclick="quickAction('ahorro', 'retiro', ${p.id})" class="flex-1 text-center py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-gray-400 text-xs font-semibold transition">- Retirar</button>
                                </div>
                            `}
                        </div>
                    </div>
                `;
            }
        });

        sectionLogradas.classList.toggle('hidden', !hasLogradas);
    }

    window.marcarCompletada = async (id) => {
        if (!confirm('¿Marcar esta meta como completada y bloquearla? Podrás añadir evidencias luego.')) return;
        try {
            await fetch(`/api/propositos/${id}/completar`, { method: 'PUT' });
            showToast('¡Meta lograda! 🎉');
            loadAll();
        } catch (e) {
            showToast('Error', 'error');
        }
    };

    window.openEvidenciaModal = async (id, nombre) => {
        document.getElementById('evidencia-proposito-id').value = id;
        document.getElementById('evidencias-meta-nombre').innerText = nombre;
        document.getElementById('evidencia-preview-names').innerText = '';
        document.getElementById('btn-upload-evidencia').classList.add('hidden');
        document.getElementById('form-evidencias').reset();
        
        const gallery = document.getElementById('evidencias-gallery');
        gallery.innerHTML = '<p class="text-xs text-gray-500 text-center col-span-2 py-4">Cargando...</p>';
        
        modalEvidencias.open();
        
        try {
            const res = await fetch(`/api/propositos/${id}/evidencias`);
            const json = await res.json();
            
            gallery.innerHTML = '';
            if (json.data && json.data.length > 0) {
                json.data.forEach(ev => {
                    gallery.innerHTML += `
                        <div class="relative group rounded-lg overflow-hidden border border-white/10 cursor-pointer h-24 bg-black" onclick="openImageViewer('${ev.image_path}')">
                            <img src="${ev.image_path}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition duration-500">
                        </div>
                    `;
                });
            } else {
                gallery.innerHTML = '<p class="text-xs text-gray-500 text-center col-span-2 py-4">No hay fotos de evidencia aún.</p>';
            }
        } catch (e) {
            gallery.innerHTML = '<p class="text-xs text-expense">Error al cargar evidencias</p>';
        }
    };

    document.getElementById('evidencia-files').addEventListener('change', (e) => {
        const files = e.target.files;
        const names = Array.from(files).map(f => f.name).join(', ');
        document.getElementById('evidencia-preview-names').innerText = names;
        if (files.length > 0) {
            document.getElementById('btn-upload-evidencia').classList.remove('hidden');
        }
    });

    document.getElementById('form-evidencias').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const id = document.getElementById('evidencia-proposito-id').value;
        const btn = document.getElementById('btn-upload-evidencia');
        
        try {
            btn.innerText = 'Subiendo...';
            btn.disabled = true;
            
            const res = await fetch(`/api/propositos/${id}/evidencias`, {
                method: 'POST',
                body: formData
            });
            
            if (res.ok) {
                showToast('Evidencia guardada');
                openEvidenciaModal(id, document.getElementById('evidencias-meta-nombre').innerText); // reload
            }
        } catch (error) {
            showToast('Error subiendo imagen', 'error');
        } finally {
            btn.innerText = 'Subir y Guardar';
            btn.disabled = false;
        }
    });

    window.quickAction = (type, sub, propositoId) => {
        document.getElementById('btn-new-transaction').click();
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

        const isEditable = state.viewingMonth === state.currentRealMonth;

        state.transactions.forEach(t => {
            const style = typeLabels[t.type] || typeLabels.egreso;
            
            let routingText = '-';
            if (t.type === 'ingreso') routingText = `A: ${t.billetera_destino_nombre || 'No asignada'}`;
            if (t.type === 'egreso') routingText = `De: ${t.billetera_origen_nombre || 'No asignada'}`;
            if (t.type === 'transferencia') routingText = `${t.billetera_origen_nombre} → ${t.billetera_destino_nombre}`;
            if (t.type === 'ahorro') routingText = `${t.billetera_origen_nombre} → Meta: ${t.proposito_nombre}`;
            if (t.type === 'retiro_ahorro') routingText = `Meta: ${t.proposito_nombre} → ${t.billetera_destino_nombre}`;

            const sign = (t.type === 'ingreso' || t.type === 'retiro_ahorro') ? '+' : (t.type === 'transferencia' ? '' : '-');

            tbody.innerHTML += `
                <tr class="hover:bg-white/[0.02] transition">
                    <td class="px-5 py-4 whitespace-nowrap text-sm text-gray-400 capitalize">${formatDateEs(t.date)}</td>
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
                        <div class="flex justify-center gap-3">
                            <button onclick="viewTx(${t.id})" class="text-gray-400 hover:text-accent-400 transition" title="Ver detalle">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                            </button>
                            ${isEditable ? `
                            <button onclick="editTx(${t.id})" class="text-gray-400 hover:text-white transition" title="Editar">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                            </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    window.editTx = (id) => {
        const tx = state.transactions.find(t => t.id === id);
        if (!tx) return;
        
        document.getElementById('transaction-form').reset();
        document.getElementById('tx-id-input').value = tx.id;
        document.getElementById('tx-modal-title').innerText = "Editar Transacción";
        
        // Hide type selector
        document.getElementById('tx-type-section').classList.add('hidden');
        
        // Fill base data
        document.getElementById('tx-date').value = tx.date;
        document.getElementById('tx-amount').value = tx.amount;
        document.getElementById('tx-desc').value = tx.description;
        document.getElementById('tx-priority').value = tx.priority;
        document.getElementById('tx-note').value = tx.note || '';

        // Routing text mock (read-only in edit)
        const routing = document.getElementById('routing-container');
        routing.innerHTML = `<p class="text-xs text-accent-400 font-semibold mb-1">Ruta: ${tTypeToStr(tx)}</p><p class="text-[10px] text-gray-500">El origen/destino no se puede modificar.</p>`;

        // Invoice handling
        const invoiceDiv = document.getElementById('tx-current-invoice');
        document.getElementById('tx-delete-invoice-flag').value = "false";
        if (tx.invoice_path) {
            invoiceDiv.classList.remove('hidden');
            document.getElementById('btn-view-invoice').dataset.url = tx.invoice_path;
        } else {
            invoiceDiv.classList.add('hidden');
        }

        modalTx.open();
    };

    window.viewTx = (id) => {
        // En esta versión, Ver = Editar pero con los campos bloqueados (o simplemente abrimos el modal de Editar sin botón guardar)
        // Para simplificar, delegamos a editTx si es mes actual. Si no, abrimos modal pero ocultamos submit.
        const isEditable = state.viewingMonth === state.currentRealMonth;
        editTx(id);
        
        if (!isEditable) {
            document.getElementById('tx-modal-title').innerText = "Detalle Transacción (Solo Lectura)";
            document.getElementById('tx-submit-btn').classList.add('hidden');
            document.getElementById('tx-invoice-help').classList.add('hidden');
            document.getElementById('btn-remove-invoice').classList.add('hidden');
            // disable inputs
            ['tx-date', 'tx-amount', 'tx-desc', 'tx-priority', 'tx-note', 'tx-invoice'].forEach(id => {
                const el = document.getElementById(id);
                if(el) el.disabled = true;
            });
        } else {
            document.getElementById('tx-submit-btn').classList.remove('hidden');
            document.getElementById('tx-invoice-help').classList.remove('hidden');
            document.getElementById('btn-remove-invoice').classList.remove('hidden');
            ['tx-date', 'tx-amount', 'tx-desc', 'tx-priority', 'tx-note', 'tx-invoice'].forEach(id => {
                const el = document.getElementById(id);
                if(el) el.disabled = false;
            });
        }
    };

    function tTypeToStr(tx) {
        if (tx.type === 'ingreso') return `Ingreso a ${tx.billetera_destino_nombre}`;
        if (tx.type === 'egreso') return `Egreso de ${tx.billetera_origen_nombre}`;
        if (tx.type === 'transferencia') return `Transferencia de ${tx.billetera_origen_nombre} a ${tx.billetera_destino_nombre}`;
        if (tx.type === 'ahorro') return `Aporte de ${tx.billetera_origen_nombre} a Meta ${tx.proposito_nombre}`;
        if (tx.type === 'retiro_ahorro') return `Retiro de Meta ${tx.proposito_nombre} a ${tx.billetera_destino_nombre}`;
        return '';
    }

    // ── Envíos de Formularios ──────────────────────────────────
    document.getElementById('transaction-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const txId = document.getElementById('tx-id-input').value;
        const isEdit = txId !== "";

        if (!isEdit) {
            // Logica de creacion
            let txType = document.querySelector('input[name="type"]:checked').value;
            const sub = document.querySelector('input[name="sub_ahorro"]:checked').value;
            if (txType === 'ahorro' && sub === 'retiro') txType = 'retiro_ahorro';
            
            formData.set('type', txType);
            if (!formData.get('priority')) formData.set('priority', 'no_prioritario');
        }

        try {
            const url = isEdit ? `/api/transactions/${txId}` : '/api/transactions';
            const method = isEdit ? 'PUT' : 'POST';

            const res = await fetch(url, { method, body: formData });
            if (res.ok) {
                modalTx.close();
                e.target.reset();
                showToast(isEdit ? 'Transacción actualizada' : 'Transacción registrada');
                // Restaurar UI de routing en caso de que fuera sobrescrito por Edit
                location.reload(); // Recargar para limpiar el DOM hack del routing
            } else {
                const err = await res.json();
                throw new Error(err.error || "Error guardando transacción");
            }
        } catch (error) {
            console.error(error);
            showToast('Error: ' + error.message, 'error');
        }
    });

    // ── CRUD Billetera ─────────────────────────────────────────
    const saldoInput = document.getElementById('billetera-saldo');
    const saldoConfirm = document.getElementById('billetera-saldo-confirm');
    const btnBilletera = document.getElementById('billetera-submit-btn');
    const errBilletera = document.getElementById('billetera-error');
    
    function validateBilletera() {
        const v1 = parseFloat(saldoInput.value) || 0;
        const v2 = parseFloat(saldoConfirm.value) || 0;
        if (v1 !== v2 && !document.getElementById('billetera-id').value) {
            btnBilletera.disabled = true;
            errBilletera.classList.remove('hidden');
        } else {
            btnBilletera.disabled = false;
            errBilletera.classList.add('hidden');
        }
    }
    
    saldoInput.addEventListener('input', validateBilletera);
    saldoConfirm.addEventListener('input', validateBilletera);

    window.editBilletera = (id, nombre) => {
        document.getElementById('billetera-modal-title').innerText = 'Renombrar Billetera';
        document.getElementById('billetera-id').value = id;
        document.getElementById('billetera-nombre').value = nombre;
        document.getElementById('billetera-saldo-group').classList.add('hidden');
        document.getElementById('billetera-color-group').classList.add('hidden');
        btnBilletera.disabled = false;
        modalBilletera.open();
    };

    window.hideBilletera = async (id, nombre) => {
        if (!confirm(`¿Ocultar la billetera "${nombre}"? Sus fondos ya no se sumarán al patrimonio total, pero el historial de transacciones se mantendrá.`)) return;
        try {
            await fetch(`/api/billeteras/${id}/ocultar`, { method: 'PUT' });
            showToast('Billetera ocultada');
            loadAll();
        } catch(e) {
            showToast('Error', 'error');
        }
    };

    document.getElementById('btn-new-billetera').addEventListener('click', () => {
        document.getElementById('billetera-modal-title').innerText = 'Nueva Billetera';
        document.getElementById('billetera-id').value = '';
        document.getElementById('billetera-saldo-group').classList.remove('hidden');
        document.getElementById('billetera-color-group').classList.remove('hidden');
        document.getElementById('form-billetera').reset();
        validateBilletera();
    });

    document.getElementById('form-billetera').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('billetera-id').value;
        const isEdit = id !== "";

        const data = {
            nombre: e.target.nombre.value,
            saldo_inicial: parseFloat(e.target.saldo_inicial.value) || 0,
            color: e.target.color.value
        };

        const url = isEdit ? `/api/billeteras/${id}` : '/api/billeteras';
        const method = isEdit ? 'PUT' : 'POST';

        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (res.ok) {
            modalBilletera.close();
            e.target.reset();
            loadAll();
            showToast(isEdit ? 'Billetera renombrada' : 'Billetera agregada');
        }
    });

    // ── CRUD Propósitos ─────────────────────────────────────────
    window.editProposito = (id, nombre, monto, color) => {
        document.getElementById('proposito-modal-title').innerText = 'Editar Meta';
        document.getElementById('proposito-id').value = id;
        document.getElementById('proposito-nombre').value = nombre;
        document.getElementById('proposito-monto').value = monto;
        document.getElementById('proposito-color-group').classList.add('hidden');
        modalProposito.open();
    };

    window.deleteProposito = async (id) => {
        if (!confirm('¿Eliminar esta meta? Las transacciones asociadas pasarán al "Ahorro General".')) return;
        try {
            const res = await fetch(`/api/propositos/${id}`, { method: 'DELETE' });
            if (res.ok) {
                showToast('Meta eliminada');
                loadAll();
            } else {
                const err = await res.json();
                showToast(err.error, 'error');
            }
        } catch(e) { showToast('Error', 'error'); }
    };

    document.getElementById('btn-new-proposito').addEventListener('click', () => {
        document.getElementById('proposito-modal-title').innerText = 'Nueva Meta';
        document.getElementById('proposito-id').value = '';
        document.getElementById('proposito-color-group').classList.remove('hidden');
        document.getElementById('form-proposito').reset();
    });

    document.getElementById('form-proposito').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('proposito-id').value;
        const isEdit = id !== "";

        const data = {
            nombre: e.target.nombre.value,
            monto_objetivo: parseFloat(e.target.monto_objetivo.value),
            color: e.target.color.value
        };

        const url = isEdit ? `/api/propositos/${id}` : '/api/propositos';
        const method = isEdit ? 'PUT' : 'POST';

        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (res.ok) {
            modalProposito.close();
            e.target.reset();
            loadAll();
            showToast(isEdit ? 'Meta actualizada' : 'Meta agregada');
        }
    });

    // ── Toast Helper ───────────────────────────────────────────
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `px-4 py-3 rounded-xl text-sm font-medium text-white shadow-xl transform transition-all duration-300 translate-y-10 opacity-0 flex items-center gap-2 ${type === 'success' ? 'bg-accent-600' : 'bg-expense'}`;
        toast.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>${message}`;
        container.appendChild(toast);
        
        requestAnimationFrame(() => toast.classList.remove('translate-y-10', 'opacity-0'));
        setTimeout(() => {
            toast.classList.add('translate-y-10', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Init
    document.getElementById('mes-actual-lbl').innerText = "Mes Actual";
    loadAll();
});
