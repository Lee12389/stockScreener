/** Browser scanner controller that keeps ranking, filters, and chart work local. */
(function () {
    const bootstrap = window.__SCANNER_BOOTSTRAP__ || {};
    const STORAGE_KEY = 'autobot.scanner.v3';
    const PRESET_LABELS = {
        all: 'All',
        quality_momentum: 'Quality Momentum',
        momentum_breakout: 'Momentum Breakout',
        trend_pullback: 'Trend Pullback',
        relative_strength: 'Relative Strength',
        vwap_reclaim: 'VWAP Reclaim',
        supertrend_continuation: 'Supertrend',
        volume_breakout: 'Volume Breakout',
        squeeze_breakout: 'BB Squeeze',
        support_bounce: 'Support Bounce',
        mean_reversion: 'Mean Reversion',
        reversal_sell: 'Reversal Sell',
    };
    const ALL_COLUMNS = ['symbol', 'sector', 'signal', 'score', 'price', 'change', 'rsi', 'trend', 'macd', 'super', 'adx', 'vol', 'sr', 'scans', 'chart', 'buy'];
    const DEFAULT_INDICATORS = {
        ema20: true,
        ema50: true,
        ema200: true,
        vwap: true,
        bollinger: true,
        supertrend: true,
        rsi: true,
        stoch: false,
        macd: true,
        volume: true,
    };
    const state = {
        config: bootstrap.config || {},
        rows: [],
        filteredRows: [],
        rowMap: new Map(),
        boughtMap: new Map(),
        scopeSymbols: Array.isArray(bootstrap.initialSymbols) ? bootstrap.initialSymbols.slice() : [],
        activePreset: 'all',
        chartRow: null,
        chartTimeframe: 'primary',
        prefs: loadPrefs(),
        busy: false,
    };

    const els = {
        configForm: document.getElementById('scanner-config-form'),
        status: document.getElementById('scanner-status'),
        scopeLabel: document.getElementById('scanner-scope-label'),
        refreshBtn: document.getElementById('refresh-data-btn'),
        loadCachedBtn: document.getElementById('load-cached-btn'),
        refetchVisibleBtn: document.getElementById('refetch-visible-btn'),
        resetScopeBtn: document.getElementById('reset-scope-btn'),
        copyVisibleBtn: document.getElementById('copy-visible-btn'),
        downloadVisibleBtn: document.getElementById('download-visible-btn'),
        clearFiltersBtn: document.getElementById('clear-filters'),
        presetBar: document.getElementById('preset-bar'),
        body: document.getElementById('scanner-body'),
        table: document.getElementById('scanner-table'),
        emptyState: document.getElementById('empty-state'),
        sectorFilter: document.getElementById('filter-sector'),
        boughtSummary: document.getElementById('bought-summary'),
        metricUniverse: document.getElementById('metric-universe'),
        metricVisible: document.getElementById('metric-visible'),
        metricBuys: document.getElementById('metric-buys'),
        metricWatch: document.getElementById('metric-watch'),
        metricSells: document.getElementById('metric-sells'),
        metricVolume: document.getElementById('metric-volume'),
        modal: document.getElementById('chart-modal'),
        chartTitle: document.getElementById('chart-title'),
        chartSubtitle: document.getElementById('chart-subtitle'),
        chartSummary: document.getElementById('chart-summary'),
        chartReasons: document.getElementById('chart-reasons'),
        chartCanvas: document.getElementById('expanded-chart'),
        chartBoughtForm: document.getElementById('chart-bought-form'),
        chartBoughtSymbol: document.getElementById('chart-bought-symbol'),
        chartEntryPrice: document.getElementById('chart-entry-price'),
        chartQuantity: document.getElementById('chart-quantity'),
        chartNote: document.getElementById('chart-note'),
        chartRemoveBought: document.getElementById('chart-remove-bought'),
    };
    const filterEls = {
        symbol: document.getElementById('filter-symbol'),
        sector: document.getElementById('filter-sector'),
        signal: document.getElementById('filter-signal'),
        bought: document.getElementById('filter-bought'),
        trend: document.getElementById('filter-trend'),
        scoreMin: document.getElementById('filter-score-min'),
        priceMin: document.getElementById('filter-price-min'),
        priceMax: document.getElementById('filter-price-max'),
        changeMin: document.getElementById('filter-change-min'),
        rsiMin: document.getElementById('filter-rsi-min'),
        weeklyRsiMin: document.getElementById('filter-rsi-weekly-min'),
        monthlyRsiMin: document.getElementById('filter-rsi-monthly-min'),
        volMin: document.getElementById('filter-vol-min'),
        adxMin: document.getElementById('filter-adx-min'),
        level: document.getElementById('filter-level'),
        sort: document.getElementById('filter-sort'),
        limit: document.getElementById('filter-limit'),
    };

    hydrateUiFromPrefs();
    bindEvents();
    setStatus('Fetching scanner dataset...', 'busy');
    fetchDataset({
        refresh: Boolean(bootstrap.initialRefresh),
        symbols: state.scopeSymbols.length ? state.scopeSymbols : null,
    });

    /** Wires all scanner controls, modal actions, and chart toggles. */
    function bindEvents() {
        if (els.configForm) {
            els.configForm.addEventListener('submit', handleConfigSubmit);
        }
        if (els.refreshBtn) {
            els.refreshBtn.addEventListener('click', function () {
                fetchDataset({ refresh: true, symbols: currentScopeSymbols() });
            });
        }
        if (els.loadCachedBtn) {
            els.loadCachedBtn.addEventListener('click', function () {
                fetchDataset({ refresh: false, symbols: currentScopeSymbols() });
            });
        }
        if (els.refetchVisibleBtn) {
            els.refetchVisibleBtn.addEventListener('click', function () {
                if (!state.filteredRows.length) {
                    setStatus('No visible rows to refetch.', 'error');
                    return;
                }
                state.scopeSymbols = state.filteredRows.map(function (row) { return row.symbol; });
                fetchDataset({ refresh: true, symbols: state.scopeSymbols });
            });
        }
        if (els.resetScopeBtn) {
            els.resetScopeBtn.addEventListener('click', function () {
                state.scopeSymbols = [];
                fetchDataset({ refresh: false, symbols: null });
            });
        }
        if (els.copyVisibleBtn) {
            els.copyVisibleBtn.addEventListener('click', copyVisibleSymbols);
        }
        if (els.downloadVisibleBtn) {
            els.downloadVisibleBtn.addEventListener('click', downloadVisibleCsv);
        }
        if (els.clearFiltersBtn) {
            els.clearFiltersBtn.addEventListener('click', clearFilters);
        }
        Object.keys(filterEls).forEach(function (key) {
            const el = filterEls[key];
            if (!el) {
                return;
            }
            const eventName = el.tagName === 'SELECT' ? 'change' : 'input';
            el.addEventListener(eventName, applyFilters);
        });
        if (els.presetBar) {
            els.presetBar.addEventListener('click', function (event) {
                const button = event.target.closest('[data-preset]');
                if (!button) {
                    return;
                }
                state.activePreset = button.getAttribute('data-preset') || 'all';
                state.prefs.activePreset = state.activePreset;
                savePrefs();
                updatePresetUi();
                applyFilters();
            });
        }
        document.querySelectorAll('[data-col-toggle]').forEach(function (input) {
            input.addEventListener('change', function () {
                const key = input.getAttribute('data-col-toggle');
                state.prefs.columns[key] = input.checked;
                savePrefs();
                applyColumnVisibility();
            });
        });
        document.querySelectorAll('[data-default-indicator]').forEach(function (input) {
            input.addEventListener('change', function () {
                const key = input.getAttribute('data-default-indicator');
                state.prefs.chartIndicators[key] = input.checked;
                savePrefs();
                syncChartIndicatorChips();
                if (state.chartRow) {
                    renderExpandedChart();
                }
            });
        });
        if (els.body) {
            els.body.addEventListener('click', handleTableClick);
        }
        if (els.modal) {
            els.modal.addEventListener('click', function (event) {
                if (event.target.matches('[data-close="true"]')) {
                    closeChart();
                }
            });
        }
        document.querySelectorAll('[data-timeframe]').forEach(function (button) {
            button.addEventListener('click', function () {
                state.chartTimeframe = button.getAttribute('data-timeframe') || 'primary';
                syncTimeframeButtons();
                renderExpandedChart();
            });
        });
        document.querySelectorAll('[data-chart-indicator]').forEach(function (button) {
            button.addEventListener('click', function () {
                const key = button.getAttribute('data-chart-indicator');
                state.prefs.chartIndicators[key] = !state.prefs.chartIndicators[key];
                savePrefs();
                syncDefaultIndicatorCheckboxes();
                syncChartIndicatorChips();
                renderExpandedChart();
            });
        });
        if (els.chartBoughtForm) {
            els.chartBoughtForm.addEventListener('submit', handleChartBoughtSubmit);
        }
        if (els.chartRemoveBought) {
            els.chartRemoveBought.addEventListener('click', function () {
                if (!state.chartRow) {
                    return;
                }
                removeBought(state.chartRow.symbol);
            });
        }
        window.addEventListener('resize', function () {
            if (state.chartRow && els.modal && !els.modal.hidden) {
                renderExpandedChart();
            }
        });
    }

    /** Loads persisted scanner UI preferences from localStorage. */
    function loadPrefs() {
        const base = {
            columns: ALL_COLUMNS.reduce(function (acc, key) {
                acc[key] = true;
                return acc;
            }, {}),
            chartIndicators: Object.assign({}, DEFAULT_INDICATORS),
            filterSort: 'score_desc',
            rowLimit: 120,
            activePreset: 'all',
        };
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return base;
            }
            const parsed = JSON.parse(raw);
            return {
                columns: Object.assign({}, base.columns, parsed.columns || {}),
                chartIndicators: Object.assign({}, base.chartIndicators, parsed.chartIndicators || {}),
                filterSort: parsed.filterSort || base.filterSort,
                rowLimit: parsed.rowLimit || base.rowLimit,
                activePreset: parsed.activePreset || base.activePreset,
            };
        } catch (error) {
            return base;
        }
    }

    /** Persists the current scanner UI preferences to localStorage. */
    function savePrefs() {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.prefs));
    }

    /** Applies saved preferences back onto the scanner controls. */
    function hydrateUiFromPrefs() {
        state.activePreset = state.prefs.activePreset || 'all';
        if (filterEls.sort) {
            filterEls.sort.value = state.prefs.filterSort;
        }
        if (filterEls.limit) {
            filterEls.limit.value = String(state.prefs.rowLimit);
        }
        document.querySelectorAll('[data-col-toggle]').forEach(function (input) {
            const key = input.getAttribute('data-col-toggle');
            input.checked = state.prefs.columns[key] !== false;
        });
        syncDefaultIndicatorCheckboxes();
        updatePresetUi();
    }

    function syncDefaultIndicatorCheckboxes() {
        document.querySelectorAll('[data-default-indicator]').forEach(function (input) {
            const key = input.getAttribute('data-default-indicator');
            input.checked = state.prefs.chartIndicators[key] !== false;
        });
    }

    function syncChartIndicatorChips() {
        document.querySelectorAll('[data-chart-indicator]').forEach(function (button) {
            const key = button.getAttribute('data-chart-indicator');
            button.classList.toggle('is-active', state.prefs.chartIndicators[key] !== false);
        });
    }

    function syncTimeframeButtons() {
        document.querySelectorAll('[data-timeframe]').forEach(function (button) {
            button.classList.toggle('is-active', button.getAttribute('data-timeframe') === state.chartTimeframe);
        });
    }

    function updatePresetUi() {
        document.querySelectorAll('[data-preset]').forEach(function (button) {
            button.classList.toggle('is-active', button.getAttribute('data-preset') === state.activePreset);
        });
    }

    async function handleConfigSubmit(event) {
        event.preventDefault();
        const payload = serializeConfigForm();
        setStatus('Saving config...', 'busy');
        const response = await fetch('/api/scanner/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            setStatus('Failed to save scanner config.', 'error');
            return;
        }
        state.config = await response.json();
        setStatus('Config saved. Fetching latest data...', 'success');
        fetchDataset({ refresh: true, symbols: currentScopeSymbols() });
    }

    /** Converts the config form state into the backend payload shape. */
    function serializeConfigForm() {
        const formData = new window.FormData(els.configForm);
        return {
            include_nifty50: formData.has('include_nifty50'),
            include_midcap150: formData.has('include_midcap150'),
            include_nifty500: formData.has('include_nifty500'),
            scan_interval: formData.get('scan_interval') || 'FIFTEEN_MINUTE',
            use_weekly_monthly: formData.has('use_weekly_monthly'),
            volume_multiplier: safeNumber(formData.get('volume_multiplier'), 1.5),
            macd_fast: Math.max(2, Math.round(safeNumber(formData.get('macd_fast'), 12))),
            macd_slow: Math.max(3, Math.round(safeNumber(formData.get('macd_slow'), 26))),
            macd_signal: Math.max(2, Math.round(safeNumber(formData.get('macd_signal'), 9))),
            show_ema: true,
            show_rsi: true,
            show_macd: true,
            show_supertrend: true,
            show_volume: true,
            show_sr: true,
        };
    }

    function currentScopeSymbols() {
        return state.scopeSymbols.length ? state.scopeSymbols.slice() : null;
    }

    /** Fetches the raw scanner dataset and triggers local processing. */
    async function fetchDataset(options) {
        const params = options || {};
        if (state.busy) {
            return;
        }
        state.busy = true;
        setStatus(params.refresh ? 'Fetching latest candles...' : 'Loading cached dataset...', 'busy');

        try {
            const url = new URL('/api/scanner/dataset', window.location.origin);
            if (params.refresh) {
                url.searchParams.set('refresh', 'true');
            }
            if (params.symbols && params.symbols.length) {
                url.searchParams.set('symbols', params.symbols.join(','));
            }
            const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
            const data = await response.json();
            if (!response.ok || data.error) {
                state.rows = [];
                state.filteredRows = [];
                renderSectorOptions([]);
                renderTable();
                updateMetrics();
                setStatus(data.error || 'Unable to fetch scanner dataset.', 'error');
                return;
            }
            state.config = data.config || state.config;
            state.scopeSymbols = Array.isArray(data.scope_symbols) ? data.scope_symbols.slice() : [];
            hydrateConfigForm();
            state.boughtMap = new Map((data.bought || []).map(function (row) {
                return [String(row.symbol || '').toUpperCase(), row];
            }));
            await processDataset(data.items || []);
            const modeText = state.scopeSymbols.length ? 'shortlist' : 'full universe';
            els.scopeLabel.textContent = 'Dataset ready: ' + state.rows.length + ' symbols from ' + modeText + ' at ' + formatTimestamp(data.generated_at);
            setStatus('Dataset ready. Filters and charts are now local.', 'success');
        } catch (error) {
            setStatus('Scanner dataset fetch failed.', 'error');
        } finally {
            state.busy = false;
        }
    }

    function hydrateConfigForm() {
        if (!els.configForm) {
            return;
        }
        setChecked('include_nifty50', state.config.include_nifty50 === 'true');
        setChecked('include_midcap150', state.config.include_midcap150 === 'true');
        setChecked('include_nifty500', state.config.include_nifty500 === 'true');
        setChecked('use_weekly_monthly', state.config.use_weekly_monthly === 'true');
        setValue('scan_interval', state.config.scan_interval || 'FIFTEEN_MINUTE');
        setValue('volume_multiplier', state.config.volume_multiplier || 1.5);
        setValue('macd_fast', state.config.macd_fast || 12);
        setValue('macd_slow', state.config.macd_slow || 26);
        setValue('macd_signal', state.config.macd_signal || 9);

        function setChecked(name, checked) {
            const input = els.configForm.querySelector('[name="' + name + '"]');
            if (input) {
                input.checked = Boolean(checked);
            }
        }

        function setValue(name, value) {
            const input = els.configForm.querySelector('[name="' + name + '"]');
            if (input) {
                input.value = String(value);
            }
        }
    }

    /** Rebuilds scanner rows locally after a dataset fetch completes. */
    async function processDataset(items) {
        state.rows = [];
        state.rowMap = new Map();
        renderSectorOptions([]);
        for (let index = 0; index < items.length; index += 1) {
            const row = buildRowSummary(items[index], state.config, state.boughtMap.get(String(items[index].symbol || '').toUpperCase()));
            state.rows.push(row);
            state.rowMap.set(row.symbol.toUpperCase(), row);
            if (index && index % 12 === 0) {
                setStatus('Computing indicators locally... ' + index + '/' + items.length, 'busy');
                await waitForFrame();
            }
        }
        renderSectorOptions(state.rows);
        applyFilters();
    }

    function renderSectorOptions(rows) {
        if (!els.sectorFilter) {
            return;
        }
        const current = els.sectorFilter.value;
        const sectors = Array.from(new Set((rows || []).map(function (row) {
            return row.sector || 'Unknown';
        }))).sort();
        const options = ['<option value="">All sectors</option>'].concat(sectors.map(function (sector) {
            const selected = current === sector ? ' selected' : '';
            return '<option value="' + escapeHtml(sector) + '"' + selected + '>' + escapeHtml(sector) + '</option>';
        }));
        els.sectorFilter.innerHTML = options.join('');
    }

    /** Applies the current filter stack and sorting to the local rows. */
    function applyFilters() {
        const symbolText = textValue(filterEls.symbol);
        const sector = textValue(filterEls.sector);
        const signal = textValue(filterEls.signal);
        const bought = textValue(filterEls.bought);
        const trend = textValue(filterEls.trend);
        const minScore = safeNullableNumber(filterEls.scoreMin);
        const minPrice = safeNullableNumber(filterEls.priceMin);
        const maxPrice = safeNullableNumber(filterEls.priceMax);
        const minChange = safeNullableNumber(filterEls.changeMin);
        const minRsi = safeNullableNumber(filterEls.rsiMin);
        const minWeeklyRsi = safeNullableNumber(filterEls.weeklyRsiMin);
        const minMonthlyRsi = safeNullableNumber(filterEls.monthlyRsiMin);
        const minVol = safeNullableNumber(filterEls.volMin);
        const minAdx = safeNullableNumber(filterEls.adxMin);
        const level = textValue(filterEls.level);
        const sortKey = textValue(filterEls.sort) || 'score_desc';
        const rowLimit = Math.max(10, Math.min(500, Math.round(safeNumber(filterEls.limit && filterEls.limit.value, state.prefs.rowLimit))));
        state.prefs.filterSort = sortKey;
        state.prefs.rowLimit = rowLimit;
        savePrefs();

        state.filteredRows = state.rows.filter(function (row) {
            if (symbolText && row.symbol.toUpperCase().indexOf(symbolText.toUpperCase()) === -1) {
                return false;
            }
            if (sector && row.sector !== sector) {
                return false;
            }
            if (signal && row.signal !== signal) {
                return false;
            }
            if (bought === 'bought' && !row.isBought) {
                return false;
            }
            if (bought === 'not_bought' && row.isBought) {
                return false;
            }
            if (trend && row.trendBias !== trend) {
                return false;
            }
            if (minScore !== null && row.score < minScore) {
                return false;
            }
            if (minPrice !== null && row.close < minPrice) {
                return false;
            }
            if (maxPrice !== null && row.close > maxPrice) {
                return false;
            }
            if (minChange !== null && row.changePct < minChange) {
                return false;
            }
            if (minRsi !== null && row.dailyRsi < minRsi) {
                return false;
            }
            if (minWeeklyRsi !== null && row.weeklyRsi < minWeeklyRsi) {
                return false;
            }
            if (minMonthlyRsi !== null && row.monthlyRsi < minMonthlyRsi) {
                return false;
            }
            if (minVol !== null && row.volumeRatio < minVol) {
                return false;
            }
            if (minAdx !== null && row.adx < minAdx) {
                return false;
            }
            if (level === 'breakout' && !row.flags.nearBreakout) {
                return false;
            }
            if (level === 'support' && !row.flags.nearSupport) {
                return false;
            }
            if (level === '52w_high' && !row.flags.near52wHigh) {
                return false;
            }
            if (!matchesPreset(row, state.activePreset)) {
                return false;
            }
            return true;
        });

        state.filteredRows.sort(makeSorter(sortKey));
        state.filteredRows = state.filteredRows.slice(0, rowLimit);
        renderTable();
        updateMetrics();
        renderBoughtSummary();
        applyColumnVisibility();
    }

    function makeSorter(sortKey) {
        switch (sortKey) {
            case 'change_desc':
                return sortDesc('changePct');
            case 'volume_desc':
                return sortDesc('volumeRatio');
            case 'rsi_desc':
                return sortDesc('dailyRsi');
            case 'weekly_rsi_desc':
                return sortDesc('weeklyRsi');
            case 'monthly_rsi_desc':
                return sortDesc('monthlyRsi');
            case 'adx_desc':
                return sortDesc('adx');
            case 'symbol_asc':
                return function (left, right) { return left.symbol.localeCompare(right.symbol); };
            case 'score_desc':
            default:
                return sortDesc('score');
        }
    }

    function sortDesc(key) {
        return function (left, right) {
            return (right[key] || 0) - (left[key] || 0);
        };
    }

    function matchesPreset(row, preset) {
        if (!preset || preset === 'all') {
            return true;
        }
        return row.scans.indexOf(PRESET_LABELS[preset]) !== -1;
    }

    /** Renders the visible scanner rows into the table body. */
    function renderTable() {
        if (!els.body) {
            return;
        }
        if (!state.filteredRows.length) {
            els.body.innerHTML = '';
            els.emptyState.hidden = false;
            return;
        }
        els.emptyState.hidden = true;
        els.body.innerHTML = state.filteredRows.map(renderRowHtml).join('');
    }

    function renderRowHtml(row) {
        const signalClass = signalTone(row.signal);
        const boughtMarkup = row.isBought
            ? '<span class="tag bought">Bought</span>' + (row.boughtState && row.boughtState !== 'HOLD'
                ? '<span class="tag ' + escapeHtml(signalTone(row.boughtState)) + '">' + escapeHtml(row.boughtState) + '</span>'
                : '')
            : '';
        const scans = row.scans.length
            ? row.scans.map(function (scan) { return '<span class="tag soft">' + escapeHtml(scan) + '</span>'; }).join('')
            : '<span class="meta">No preset hit</span>';
        const reasons = row.reasons.slice(0, 2).map(function (text) {
            return '<span class="meta-inline">' + escapeHtml(text) + '</span>';
        }).join('<br />');
        return [
            '<tr class="scanner-row ' + signalClass + '">',
            '<td data-col="symbol"><div class="symbol-cell"><div><strong>' + escapeHtml(row.symbol) + '</strong>' + boughtMarkup + '</div><svg class="mini-spark" viewBox="0 0 100 28" preserveAspectRatio="none"><polyline points="' + row.sparkline + '" fill="none" stroke="#1d6f63" stroke-width="2" /></svg></div></td>',
            '<td data-col="sector">' + escapeHtml(row.sector) + '</td>',
            '<td data-col="signal"><span class="signal-pill ' + signalClass + '">' + escapeHtml(row.signal) + '</span></td>',
            '<td data-col="score"><div class="score-wrap"><strong>' + escapeHtml(String(row.score)) + '</strong><div class="score-bar"><span style="width:' + Math.min(100, row.score) + '%"></span></div></div></td>',
            '<td data-col="price"><strong>' + formatNumber(row.close, 2) + '</strong><br /><span class="meta-inline">52W ' + formatNumber(row.high52w, 0) + ' / ' + formatNumber(row.low52w, 0) + '</span></td>',
            '<td data-col="change" class="' + (row.changePct >= 0 ? 'ok' : 'warn') + '">' + formatSigned(row.changePct, 2) + '%</td>',
            '<td data-col="rsi">' + formatNumber(row.dailyRsi, 1) + ' / ' + formatNumber(row.weeklyRsi, 1) + ' / ' + formatNumber(row.monthlyRsi, 1) + '</td>',
            '<td data-col="trend"><strong>' + escapeHtml(row.trendLabel) + '</strong><br /><span class="meta-inline">E20 ' + formatNumber(row.ema20, 0) + ' | E50 ' + formatNumber(row.ema50, 0) + ' | E200 ' + formatNumber(row.ema200, 0) + '</span></td>',
            '<td data-col="macd">' + formatNumber(row.macd, 2) + ' / ' + formatNumber(row.macdSignal, 2) + '<br />' + reasons + '</td>',
            '<td data-col="super">' + escapeHtml(row.superSignal) + '</td>',
            '<td data-col="adx">' + formatNumber(row.adx, 1) + ' ADX<br /><span class="meta-inline">' + formatNumber(row.stochK, 1) + ' / ' + formatNumber(row.stochD, 1) + '</span></td>',
            '<td data-col="vol">' + formatNumber(row.volumeRatio, 2) + 'x<br /><span class="meta-inline">ATR ' + formatNumber(row.atrPct, 1) + '%</span></td>',
            '<td data-col="sr">' + formatNumber(row.support, 2) + ' / ' + formatNumber(row.resistance, 2) + '<br /><span class="meta-inline">' + escapeHtml(row.levelContext) + '</span></td>',
            '<td data-col="scans"><div class="tag-stack">' + scans + '</div></td>',
            '<td data-col="chart"><button type="button" class="ghost-button" data-open-chart="' + escapeHtml(row.symbol) + '">Expand</button></td>',
            '<td data-col="buy"><div class="action-stack">' + renderBoughtAction(row) + '</div></td>',
            '</tr>',
        ].join('');
    }

    function renderBoughtAction(row) {
        if (row.isBought) {
            return '<button type="button" class="ghost-button" data-remove-bought="' + escapeHtml(row.symbol) + '">Remove</button>';
        }
        return '<button type="button" class="ghost-button" data-quick-bought="' + escapeHtml(row.symbol) + '" data-entry="' + formatNumber(row.close, 2) + '">Track</button>';
    }

    function applyColumnVisibility() {
        if (!els.table) {
            return;
        }
        ALL_COLUMNS.forEach(function (key) {
            const visible = state.prefs.columns[key] !== false;
            els.table.querySelectorAll('[data-col="' + key + '"]').forEach(function (cell) {
                cell.style.display = visible ? '' : 'none';
            });
        });
    }

    function updateMetrics() {
        const visible = state.filteredRows;
        const buyCount = visible.filter(function (row) { return row.signal === 'BUY' || row.signal === 'STRONG_BUY'; }).length;
        const watchCount = visible.filter(function (row) { return row.signal === 'WATCH'; }).length;
        const sellCount = visible.filter(function (row) { return row.signal === 'SELL' || row.signal === 'STRONG_SELL'; }).length;
        const avgVolume = visible.length
            ? visible.reduce(function (sum, row) { return sum + row.volumeRatio; }, 0) / visible.length
            : 0;
        if (els.metricUniverse) {
            els.metricUniverse.textContent = String(state.rows.length);
        }
        if (els.metricVisible) {
            els.metricVisible.textContent = String(visible.length);
        }
        if (els.metricBuys) {
            els.metricBuys.textContent = String(buyCount);
        }
        if (els.metricWatch) {
            els.metricWatch.textContent = String(watchCount);
        }
        if (els.metricSells) {
            els.metricSells.textContent = String(sellCount);
        }
        if (els.metricVolume) {
            els.metricVolume.textContent = formatNumber(avgVolume, 2);
        }
    }

    function renderBoughtSummary() {
        if (!els.boughtSummary) {
            return;
        }
        const boughtRows = state.rows.filter(function (row) { return row.isBought; });
        if (!boughtRows.length) {
            els.boughtSummary.innerHTML = '<span class="meta">No bought symbols are being tracked yet.</span>';
            return;
        }
        const strong = boughtRows.filter(function (row) { return row.boughtState === 'STRONG_SELL'; }).length;
        const weak = boughtRows.filter(function (row) { return row.boughtState === 'WEAK_SELL'; }).length;
        const hold = boughtRows.filter(function (row) { return row.boughtState === 'HOLD'; }).length;
        els.boughtSummary.innerHTML = [
            '<span class="tag bought">Tracked: ' + boughtRows.length + '</span>',
            '<span class="tag warn">Weak sell: ' + weak + '</span>',
            '<span class="tag danger">Strong sell: ' + strong + '</span>',
            '<span class="tag soft">Hold: ' + hold + '</span>',
        ].join('');
    }

    /** Handles row-level actions such as opening charts and tracking symbols. */
    function handleTableClick(event) {
        const chartButton = event.target.closest('[data-open-chart]');
        if (chartButton) {
            openChart(chartButton.getAttribute('data-open-chart'));
            return;
        }
        const addButton = event.target.closest('[data-quick-bought]');
        if (addButton) {
            addBought({
                symbol: addButton.getAttribute('data-quick-bought'),
                entry_price: safeNumber(addButton.getAttribute('data-entry'), 0),
                quantity: 1,
                note: 'quick-track',
            });
            return;
        }
        const removeButton = event.target.closest('[data-remove-bought]');
        if (removeButton) {
            removeBought(removeButton.getAttribute('data-remove-bought'));
        }
    }

    async function addBought(payload) {
        const response = await fetch('/api/scanner/bought/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            setStatus('Unable to add bought symbol.', 'error');
            return;
        }
        state.boughtMap.set(String(payload.symbol || '').toUpperCase(), {
            symbol: payload.symbol,
            entry_price: payload.entry_price,
            quantity: payload.quantity,
            note: payload.note || '',
        });
        state.rows = state.rows.map(function (row) {
            return row.symbol === payload.symbol ? rebuildRowWithBought(row, state.boughtMap.get(row.symbol.toUpperCase())) : row;
        });
        state.rowMap = new Map(state.rows.map(function (row) { return [row.symbol.toUpperCase(), row]; }));
        applyFilters();
        if (state.chartRow && state.chartRow.symbol === payload.symbol) {
            state.chartRow = state.rowMap.get(payload.symbol.toUpperCase()) || state.chartRow;
            renderChartDetails();
        }
        setStatus(payload.symbol + ' added to bought monitor.', 'success');
    }

    async function removeBought(symbol) {
        const formData = new window.FormData();
        formData.append('symbol', symbol);
        const response = await fetch('/api/scanner/bought/remove', {
            method: 'POST',
            body: formData,
        });
        if (!response.ok) {
            setStatus('Unable to remove bought symbol.', 'error');
            return;
        }
        state.boughtMap.delete(String(symbol || '').toUpperCase());
        state.rows = state.rows.map(function (row) {
            return row.symbol === symbol ? rebuildRowWithBought(row, null) : row;
        });
        state.rowMap = new Map(state.rows.map(function (row) { return [row.symbol.toUpperCase(), row]; }));
        applyFilters();
        if (state.chartRow && state.chartRow.symbol === symbol) {
            state.chartRow = state.rowMap.get(symbol.toUpperCase()) || state.chartRow;
            renderChartDetails();
        }
        setStatus(symbol + ' removed from bought monitor.', 'success');
    }

    function rebuildRowWithBought(row, boughtInfo) {
        const clone = Object.assign({}, row);
        clone.isBought = Boolean(boughtInfo);
        clone.bought = boughtInfo || null;
        const reversal = evaluateBoughtReversal(clone);
        clone.boughtState = reversal.state;
        clone.boughtReasons = reversal.reasons;
        return clone;
    }

    async function handleChartBoughtSubmit(event) {
        event.preventDefault();
        const symbol = els.chartBoughtSymbol.value;
        if (!symbol) {
            return;
        }
        await addBought({
            symbol: symbol,
            entry_price: safeNumber(els.chartEntryPrice.value, 0),
            quantity: Math.max(1, Math.round(safeNumber(els.chartQuantity.value, 1))),
            note: (els.chartNote.value || '').trim(),
        });
    }

    /** Opens the expanded chart modal for a scanner symbol. */
    function openChart(symbol) {
        const row = state.rowMap.get(String(symbol || '').toUpperCase());
        if (!row || !els.modal) {
            return;
        }
        state.chartRow = row;
        state.chartTimeframe = 'primary';
        syncTimeframeButtons();
        syncChartIndicatorChips();
        renderChartDetails();
        els.modal.hidden = false;
        window.requestAnimationFrame(renderExpandedChart);
    }

    /** Closes the expanded chart modal and clears active row state. */
    function closeChart() {
        if (!els.modal) {
            return;
        }
        els.modal.hidden = true;
        state.chartRow = null;
    }

    /** Renders the summary copy and bought-monitor controls in the chart modal. */
    function renderChartDetails() {
        if (!state.chartRow) {
            return;
        }
        const row = state.chartRow;
        if (els.chartTitle) {
            els.chartTitle.textContent = row.symbol;
        }
        if (els.chartSubtitle) {
            els.chartSubtitle.textContent = row.sector + ' | ' + row.signal + ' | Score ' + row.score + ' | ' + row.intervalLabel + ' | D/W/M RSI ' + formatNumber(row.dailyRsi, 0) + '/' + formatNumber(row.weeklyRsi, 0) + '/' + formatNumber(row.monthlyRsi, 0);
        }
        if (els.chartSummary) {
            els.chartSummary.innerHTML = [
                metricPill('Close', formatNumber(row.close, 2)),
                metricPill('Change', formatSigned(row.changePct, 2) + '%'),
                metricPill('Daily RSI', formatNumber(row.dailyRsi, 1)),
                metricPill('Weekly RSI', formatNumber(row.weeklyRsi, 1)),
                metricPill('Monthly RSI', formatNumber(row.monthlyRsi, 1)),
                metricPill('Vol x', formatNumber(row.volumeRatio, 2)),
                metricPill('ADX', formatNumber(row.adx, 1)),
                metricPill('Stoch', formatNumber(row.stochK, 1) + ' / ' + formatNumber(row.stochD, 1)),
                metricPill('Support', formatNumber(row.support, 2)),
                metricPill('Resistance', formatNumber(row.resistance, 2)),
                metricPill('52W High', formatNumber(row.high52w, 2)),
                metricPill('Bought', row.isBought ? row.boughtState : 'Not tracked'),
            ].join('');
        }
        if (els.chartReasons) {
            const reasons = row.reasons.concat(row.boughtReasons || []).slice(0, 10);
            els.chartReasons.innerHTML = reasons.length
                ? reasons.map(function (text) { return '<span class="tag soft">' + escapeHtml(text) + '</span>'; }).join('')
                : '<span class="meta">No extra reasons.</span>';
        }
        if (els.chartBoughtSymbol) {
            els.chartBoughtSymbol.value = row.symbol;
        }
        if (els.chartEntryPrice) {
            els.chartEntryPrice.value = formatNumber(row.close, 2);
        }
        if (els.chartQuantity) {
            els.chartQuantity.value = row.isBought && row.bought ? String(row.bought.quantity) : '1';
        }
        if (els.chartNote) {
            els.chartNote.value = row.isBought && row.bought ? (row.bought.note || '') : '';
        }
        if (els.chartRemoveBought) {
            els.chartRemoveBought.style.display = row.isBought ? '' : 'none';
        }
    }

    /** Rebuilds the expanded chart canvas for the active symbol and timeframe. */
    function renderExpandedChart() {
        if (!state.chartRow || !els.chartCanvas) {
            return;
        }
        const chartData = buildChartData(state.chartRow, state.chartTimeframe);
        if (!chartData.candles.length) {
            return;
        }
        drawChart(els.chartCanvas, chartData, state.prefs.chartIndicators);
    }

    /** Calculates all derived scanner metrics for one dataset item. */
    function buildRowSummary(item, config, boughtInfo) {
        const candles = unpackCandles(item.candles || []);
        const dailyCandles = unpackCandles((item.daily_candles && item.daily_candles.length ? item.daily_candles : item.candles) || []);
        const weeklyCandles = aggregateCandlesByBucket(dailyCandles, 'week');
        const monthlyCandles = aggregateCandlesByBucket(dailyCandles, 'month');
        const closes = candles.map(function (candle) { return candle.close; });
        const highs = candles.map(function (candle) { return candle.high; });
        const lows = candles.map(function (candle) { return candle.low; });
        const volumes = candles.map(function (candle) { return candle.volume; });
        const dailyCloses = dailyCandles.map(function (candle) { return candle.close; });
        const dailyHighs = dailyCandles.map(function (candle) { return candle.high; });
        const dailyLows = dailyCandles.map(function (candle) { return candle.low; });

        const ema20Series = emaSeries(closes, 20);
        const ema50Series = emaSeries(closes, 50);
        const ema100Series = emaSeries(closes, 100);
        const ema200Series = emaSeries(closes, 200);
        const sma50Series = smaSeries(closes, 50);
        const sma200Series = smaSeries(closes, 200);
        const primaryRsiSeries = rsiSeries(closes, 14);
        const dailyRsiSeries = rsiSeries(dailyCloses, 14);
        const weeklyRsiSeries = rsiSeries(aggregateCloseByBucket(dailyCandles, 'week'), 14);
        const monthlyRsiSeries = rsiSeries(aggregateCloseByBucket(dailyCandles, 'month'), 14);
        const macdSeriesSet = macdSeries(
            closes,
            safeNumber(config.macd_fast, 12),
            safeNumber(config.macd_slow, 26),
            safeNumber(config.macd_signal, 9)
        );
        const atrValues = atrSeries(highs, lows, closes, 14);
        const adxValues = adxSeries(highs, lows, closes, 14);
        const stochasticValues = stochasticSeries(highs, lows, closes, 14, 3);
        const bollingerValues = bollingerSeries(closes, 20, 2);
        const supertrendValues = supertrendSeries(highs, lows, closes, 10, 3);
        const vwapValues = vwapSeries(candles);

        const close = lastNumber(closes);
        const prevClose = closes.length > 1 ? closes[closes.length - 2] : close;
        const changePct = percentChange(close, prevClose);
        const ema20 = lastNumber(ema20Series);
        const ema50 = lastNumber(ema50Series);
        const ema100 = lastNumber(ema100Series);
        const ema200 = lastNumber(ema200Series);
        const sma50 = lastNumber(sma50Series);
        const sma200 = lastNumber(sma200Series);
        const primaryRsi = lastNumber(primaryRsiSeries, 50);
        const prevPrimaryRsi = lastNumber(primaryRsiSeries.slice(0, -1), primaryRsi);
        const dailyRsi = lastNumber(dailyRsiSeries, primaryRsi);
        const prevDailyRsi = lastNumber(dailyRsiSeries.slice(0, -1), dailyRsi);
        const weeklyRsi = lastNumber(weeklyRsiSeries, dailyRsi);
        const monthlyRsi = lastNumber(monthlyRsiSeries, dailyRsi);
        const macd = lastNumber(macdSeriesSet.macd);
        const macdSignal = lastNumber(macdSeriesSet.signal);
        const prevMacd = lastNumber(macdSeriesSet.macd.slice(0, -1), macd);
        const prevMacdSignal = lastNumber(macdSeriesSet.signal.slice(0, -1), macdSignal);
        const macdHist = lastNumber(macdSeriesSet.hist);
        const prevMacdHist = lastNumber(macdSeriesSet.hist.slice(0, -1), macdHist);
        const atr = lastNumber(atrValues);
        const adx = lastNumber(adxValues, 10);
        const stochK = lastNumber(stochasticValues.k, 50);
        const stochD = lastNumber(stochasticValues.d, 50);
        const currentVolume = lastNumber(volumes, 0);
        const avgVolume = average(volumes.slice(-21, -1));
        const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;
        const support = minValue(lows.slice(-21, -1), close);
        const resistance = maxValue(highs.slice(-21, -1), close);
        const high52w = maxValue(dailyHighs.slice(-252), close);
        const low52w = minValue(dailyLows.slice(-252), close);
        const bbUpper = lastNumber(bollingerValues.upper, close);
        const bbLower = lastNumber(bollingerValues.lower, close);
        const bbMiddle = lastNumber(bollingerValues.middle, close);
        const bbWidth = bbMiddle ? ((bbUpper - bbLower) / bbMiddle) * 100 : 0;
        const avgBbWidth = average(bollingerValues.width.slice(-20));
        const superValue = lastNumber(supertrendValues.line, close);
        const superBull = Boolean(last(supertrendValues.bullish));
        const vwap = lastNumber(vwapValues, close);
        const atrPct = close ? (atr / close) * 100 : 0;

        const flags = {
            emaStackBull: close > ema20 && ema20 > ema50 && ema50 > ema200,
            emaStackBear: close < ema20 && ema20 < ema50 && ema50 < ema200,
            macdBullCross: prevMacd <= prevMacdSignal && macd > macdSignal,
            macdBearCross: prevMacd >= prevMacdSignal && macd < macdSignal,
            rsiReclaim: (prevDailyRsi < 50 && dailyRsi >= 50) || (prevPrimaryRsi < 50 && primaryRsi >= 50),
            superBull: superBull,
            nearBreakout: close >= resistance * 0.995,
            nearSupport: close <= support * 1.02,
            near52wHigh: close >= high52w * 0.98,
            goldenCross: lastNumber(sma50Series.slice(0, -1), sma50) <= lastNumber(sma200Series.slice(0, -1), sma200) && sma50 > sma200,
            volumeBreakout: volumeRatio >= Math.max(1.2, safeNumber(config.volume_multiplier, 1.5)),
            trendPullback: close > ema50 && close <= ema20 * 1.015 && close >= ema20 * 0.985,
            squeezeBreakout: bbWidth > 0 && avgBbWidth > 0 && bbWidth <= avgBbWidth * 0.75 && close >= bbUpper * 0.995,
            supportBounce: close > support && close <= support * 1.02 && volumeRatio >= 1.1 && macd > macdSignal,
            meanReversion: dailyRsi <= 38 && close <= bbLower * 1.01 && macdHist >= prevMacdHist,
            vwapReclaim: closes.length > 1 && closes[closes.length - 2] < lastNumber(vwapValues.slice(0, -1), vwap) && close > vwap && volumeRatio >= 1.2,
            relativeStrengthLeader: close >= high52w * 0.985 && close > ema50 && weeklyRsi >= 55 && monthlyRsi >= 55,
            bearishReversal: (prevMacd >= prevMacdSignal && macd < macdSignal) || (close < ema20 && ema20 < ema50) || !superBull,
        };

        let score = 34;
        const reasons = [];
        if (flags.emaStackBull) {
            score += 16;
            reasons.push('EMA stack is bullish (20 > 50 > 200).');
        }
        if (dailyRsi >= 60) {
            score += 12;
            reasons.push('Daily RSI is in the power zone.');
        } else if (dailyRsi >= 52) {
            score += 7;
        } else if (dailyRsi < 45) {
            score -= 8;
        }
        if (weeklyRsi >= 55) {
            score += 8;
        }
        if (monthlyRsi >= 55) {
            score += 6;
        }
        if (flags.macdBullCross) {
            score += 10;
            reasons.push('MACD bullish crossover is active.');
        } else if (flags.macdBearCross) {
            score -= 11;
        }
        if (flags.superBull) {
            score += 8;
            reasons.push('Supertrend remains bullish.');
        } else {
            score -= 8;
        }
        if (flags.volumeBreakout) {
            score += 12;
            reasons.push('Volume expansion confirms the move.');
        }
        if (flags.nearBreakout) {
            score += 10;
            reasons.push('Price is pressing prior resistance.');
        }
        if (flags.near52wHigh) {
            score += 8;
        }
        if (flags.relativeStrengthLeader) {
            score += 8;
            reasons.push('Relative strength is holding near 52W highs.');
        }
        if (adx >= 20) {
            score += 8;
            reasons.push('ADX shows trend strength.');
        }
        if (stochK >= stochD && stochK >= 55) {
            score += 4;
        } else if (stochK < stochD && stochK <= 45) {
            score -= 4;
        }
        if (flags.trendPullback) {
            score += 6;
            reasons.push('Pullback is holding near EMA20 in an uptrend.');
        }
        if (flags.squeezeBreakout) {
            score += 7;
            reasons.push('Bollinger squeeze is expanding.');
        }
        if (flags.supportBounce) {
            score += 7;
            reasons.push('Support bounce is developing with volume.');
        }
        if (flags.vwapReclaim) {
            score += 5;
            reasons.push('VWAP reclaim is holding with better participation.');
        }
        if (flags.goldenCross) {
            score += 6;
        }
        if (flags.meanReversion) {
            score += 4;
        }
        if (flags.emaStackBear) {
            score -= 14;
            reasons.push('EMA stack is bearish.');
        }
        if (flags.bearishReversal) {
            score -= 10;
        }
        score = clamp(Math.round(score), 0, 100);

        const scans = [];
        if (score >= 58 && weeklyRsi >= 50 && monthlyRsi >= 50) scans.push(PRESET_LABELS.quality_momentum);
        if (flags.nearBreakout && flags.volumeBreakout && flags.macdBullCross && dailyRsi >= 55) scans.push(PRESET_LABELS.momentum_breakout);
        if (flags.trendPullback && flags.emaStackBull && dailyRsi >= 50) scans.push(PRESET_LABELS.trend_pullback);
        if (flags.relativeStrengthLeader) scans.push(PRESET_LABELS.relative_strength);
        if (flags.vwapReclaim && dailyRsi >= 50) scans.push(PRESET_LABELS.vwap_reclaim);
        if (flags.superBull && adx >= 20) scans.push(PRESET_LABELS.supertrend_continuation);
        if (flags.volumeBreakout && changePct > 0.5) scans.push(PRESET_LABELS.volume_breakout);
        if (flags.squeezeBreakout) scans.push(PRESET_LABELS.squeeze_breakout);
        if (flags.supportBounce) scans.push(PRESET_LABELS.support_bounce);
        if (flags.meanReversion) scans.push(PRESET_LABELS.mean_reversion);
        if (flags.bearishReversal) scans.push(PRESET_LABELS.reversal_sell);

        let signal = 'IGNORE';
        if (score >= 75) signal = 'STRONG_BUY';
        else if (score >= 62) signal = 'BUY';
        else if (score >= 48) signal = 'WATCH';
        else if (flags.bearishReversal && score <= 30) signal = 'STRONG_SELL';
        else if (flags.bearishReversal && score <= 42) signal = 'SELL';

        const intervalLabel = intervalLabelFor(item.interval || 'FIFTEEN_MINUTE');
        const trendBias = flags.emaStackBull ? 'bullish' : flags.emaStackBear ? 'bearish' : 'neutral';
        const trendLabel = flags.emaStackBull ? 'Bullish stack' : flags.emaStackBear ? 'Bearish stack' : 'Mixed';
        const levelContext = flags.nearBreakout
            ? 'Near breakout'
            : flags.nearSupport
                ? 'Near support'
                : flags.near52wHigh
                    ? 'Near 52W high'
                    : 'Inside range';
        const row = {
            symbol: item.symbol,
            exchange: item.exchange || 'NSE',
            sector: item.sector || 'Unknown',
            intervalLabel: intervalLabel,
            close: close,
            changePct: roundNumber(changePct, 2),
            dailyRsi: roundNumber(dailyRsi, 2),
            weeklyRsi: roundNumber(weeklyRsi, 2),
            monthlyRsi: roundNumber(monthlyRsi, 2),
            primaryRsi: roundNumber(primaryRsi, 2),
            ema20: roundNumber(ema20, 2),
            ema50: roundNumber(ema50, 2),
            ema100: roundNumber(ema100, 2),
            ema200: roundNumber(ema200, 2),
            macd: roundNumber(macd, 3),
            macdSignal: roundNumber(macdSignal, 3),
            macdHist: roundNumber(macdHist, 3),
            superSignal: flags.superBull ? (flags.nearBreakout ? 'STRONG_BUY' : 'BUY') : (flags.nearSupport ? 'STRONG_SELL' : 'SELL'),
            volumeRatio: roundNumber(volumeRatio, 2),
            adx: roundNumber(adx, 2),
            stochK: roundNumber(stochK, 2),
            stochD: roundNumber(stochD, 2),
            atr: roundNumber(atr, 2),
            atrPct: roundNumber(atrPct, 2),
            support: roundNumber(support, 2),
            resistance: roundNumber(resistance, 2),
            high52w: roundNumber(high52w, 2),
            low52w: roundNumber(low52w, 2),
            bbUpper: roundNumber(bbUpper, 2),
            bbLower: roundNumber(bbLower, 2),
            bbWidth: roundNumber(bbWidth, 2),
            vwap: roundNumber(vwap, 2),
            score: score,
            signal: signal,
            reasons: reasons,
            scans: scans,
            trendBias: trendBias,
            trendLabel: trendLabel,
            levelContext: levelContext,
            flags: flags,
            sparkline: sparklinePoints(closes.slice(-40)),
            candles: candles,
            dailyCandles: dailyCandles,
            weeklyCandles: weeklyCandles,
            monthlyCandles: monthlyCandles,
            bought: boughtInfo || null,
            isBought: Boolean(boughtInfo),
        };
        const reversal = evaluateBoughtReversal(row);
        row.boughtState = reversal.state;
        row.boughtReasons = reversal.reasons;
        return row;
    }

    /** Grades a tracked row for weak or strong sell conditions. */
    function evaluateBoughtReversal(row) {
        const reasons = [];
        let strength = 0;
        if (row.macd < row.macdSignal) {
            strength += 1;
            reasons.push('MACD has rolled below signal.');
        }
        if (row.close < row.ema20 && row.ema20 < row.ema50) {
            strength += 1;
            reasons.push('EMA20 lost EMA50 with price below both.');
        }
        if (row.superSignal.indexOf('SELL') !== -1) {
            strength += 1;
            reasons.push('Supertrend has flipped bearish.');
        }
        if (row.dailyRsi < 45) {
            strength += 1;
            reasons.push('Daily RSI is losing momentum.');
        }
        if (strength >= 3) {
            return { state: 'STRONG_SELL', reasons: reasons };
        }
        if (strength >= 1) {
            return { state: 'WEAK_SELL', reasons: reasons };
        }
        return { state: 'HOLD', reasons: ['Trend is still healthy.'] };
    }

    /** Builds the candle, indicator, and panel data for the expanded chart. */
    function buildChartData(row, timeframe) {
        let candles = row.candles;
        if (timeframe === 'daily') {
            candles = row.dailyCandles;
        } else if (timeframe === 'weekly') {
            candles = row.weeklyCandles && row.weeklyCandles.length ? row.weeklyCandles : aggregateCandlesByBucket(row.dailyCandles || row.candles, 'week');
        } else if (timeframe === 'monthly') {
            candles = row.monthlyCandles && row.monthlyCandles.length ? row.monthlyCandles : aggregateCandlesByBucket(row.dailyCandles || row.candles, 'month');
        }
        const closes = candles.map(function (candle) { return candle.close; });
        const highs = candles.map(function (candle) { return candle.high; });
        const lows = candles.map(function (candle) { return candle.low; });
        const volumes = candles.map(function (candle) { return candle.volume; });
        let title = row.intervalLabel;
        if (timeframe === 'daily') {
            title = 'Daily';
        } else if (timeframe === 'weekly') {
            title = 'Weekly';
        } else if (timeframe === 'monthly') {
            title = 'Monthly';
        }
        return {
            candles: candles,
            ema20: emaSeries(closes, 20),
            ema50: emaSeries(closes, 50),
            ema200: emaSeries(closes, 200),
            vwap: vwapSeries(candles),
            bollinger: bollingerSeries(closes, 20, 2),
            supertrend: supertrendSeries(highs, lows, closes, 10, 3),
            rsi: rsiSeries(closes, 14),
            stoch: stochasticSeries(highs, lows, closes, 14, 3),
            macd: macdSeries(
                closes,
                safeNumber(state.config.macd_fast, 12),
                safeNumber(state.config.macd_slow, 26),
                safeNumber(state.config.macd_signal, 9)
            ),
            volume: volumes,
            support: row.support,
            resistance: row.resistance,
            title: title,
        };
    }

    /** Draws the expanded multi-panel chart on the supplied canvas. */
    function drawChart(canvas, chartData, indicatorPrefs) {
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(900, canvas.clientWidth || 900);
        const showStoch = indicatorPrefs.stoch === true;
        const stochHeight = showStoch ? 88 : 0;
        const height = 620 + (showStoch ? 100 : 0);
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.height = height + 'px';
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const showVolume = indicatorPrefs.volume !== false;
        const showRsi = indicatorPrefs.rsi !== false;
        const showMacd = indicatorPrefs.macd !== false;
        const pad = { left: 18, right: 72, top: 20, bottom: 20 };
        const rsiHeight = showRsi ? 88 : 0;
        const macdHeight = showMacd ? 110 : 0;
        const volumeHeight = showVolume ? 90 : 0;
        const mainHeight = height - pad.top - pad.bottom - rsiHeight - macdHeight - stochHeight - volumeHeight - 36;
        const volumeTop = pad.top + mainHeight + 12;
        const rsiTop = volumeTop + volumeHeight + (showVolume ? 12 : 0);
        const macdTop = rsiTop + rsiHeight + (showRsi ? 12 : 0);
        const stochTop = macdTop + macdHeight + (showMacd ? 12 : 0);
        const plotWidth = width - pad.left - pad.right;
        const candles = chartData.candles;
        const bodyWidth = Math.max(3, Math.min(9, plotWidth / Math.max(candles.length, 1) * 0.6));

        const bg = ctx.createLinearGradient(0, 0, width, height);
        bg.addColorStop(0, '#091521');
        bg.addColorStop(1, '#112638');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        drawPanelBackground(ctx, pad.left, pad.top, plotWidth, mainHeight, 'rgba(255,255,255,0.04)');
        if (showVolume) drawPanelBackground(ctx, pad.left, volumeTop, plotWidth, volumeHeight, 'rgba(255,255,255,0.03)');
        if (showRsi) drawPanelBackground(ctx, pad.left, rsiTop, plotWidth, rsiHeight, 'rgba(255,255,255,0.03)');
        if (showMacd) drawPanelBackground(ctx, pad.left, macdTop, plotWidth, macdHeight, 'rgba(255,255,255,0.03)');
        if (showStoch) drawPanelBackground(ctx, pad.left, stochTop, plotWidth, stochHeight, 'rgba(255,255,255,0.03)');

        const priceValues = candles.reduce(function (acc, candle, index) {
            acc.push(candle.high, candle.low);
            if (indicatorPrefs.ema20 !== false) acc.push(chartData.ema20[index]);
            if (indicatorPrefs.ema50 !== false) acc.push(chartData.ema50[index]);
            if (indicatorPrefs.ema200 !== false) acc.push(chartData.ema200[index]);
            if (indicatorPrefs.vwap !== false) acc.push(chartData.vwap[index]);
            if (indicatorPrefs.supertrend !== false) acc.push(chartData.supertrend.line[index]);
            if (indicatorPrefs.bollinger !== false) {
                acc.push(chartData.bollinger.upper[index], chartData.bollinger.lower[index]);
            }
            return acc;
        }, []).filter(isFiniteNumber);
        const priceMin = Math.min.apply(null, priceValues);
        const priceMax = Math.max.apply(null, priceValues);
        const priceSpan = (priceMax - priceMin) || 1;
        const pricePadding = priceSpan * 0.08;
        const finalMin = priceMin - pricePadding;
        const finalMax = priceMax + pricePadding;

        drawHorizontalGrid(ctx, pad.left, pad.top, plotWidth, mainHeight, 5);
        drawPriceAxis(ctx, finalMin, finalMax, width - pad.right + 12, pad.top, mainHeight, 5);

        candles.forEach(function (candle, index) {
            const x = pad.left + (plotWidth / Math.max(candles.length - 1, 1)) * index;
            const openY = scaleY(candle.open, finalMin, finalMax, pad.top, mainHeight);
            const highY = scaleY(candle.high, finalMin, finalMax, pad.top, mainHeight);
            const lowY = scaleY(candle.low, finalMin, finalMax, pad.top, mainHeight);
            const closeY = scaleY(candle.close, finalMin, finalMax, pad.top, mainHeight);
            const up = candle.close >= candle.open;
            ctx.strokeStyle = up ? '#4cd09f' : '#ff7b7b';
            ctx.fillStyle = up ? '#4cd09f' : '#ff7b7b';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, highY);
            ctx.lineTo(x, lowY);
            ctx.stroke();
            const top = Math.min(openY, closeY);
            const h = Math.max(2, Math.abs(openY - closeY));
            ctx.fillRect(x - bodyWidth / 2, top, bodyWidth, h);
        });

        drawOverlayLine(ctx, chartData.ema20, '#ffd166', pad.left, pad.top, plotWidth, mainHeight, finalMin, finalMax, indicatorPrefs.ema20 !== false);
        drawOverlayLine(ctx, chartData.ema50, '#80ed99', pad.left, pad.top, plotWidth, mainHeight, finalMin, finalMax, indicatorPrefs.ema50 !== false);
        drawOverlayLine(ctx, chartData.ema200, '#90caf9', pad.left, pad.top, plotWidth, mainHeight, finalMin, finalMax, indicatorPrefs.ema200 !== false);
        drawOverlayLine(ctx, chartData.vwap, '#ff9f1c', pad.left, pad.top, plotWidth, mainHeight, finalMin, finalMax, indicatorPrefs.vwap !== false);
        if (indicatorPrefs.bollinger !== false) {
            drawOverlayLine(ctx, chartData.bollinger.upper, 'rgba(173,216,230,0.85)', pad.left, pad.top, plotWidth, mainHeight, finalMin, finalMax, true);
            drawOverlayLine(ctx, chartData.bollinger.lower, 'rgba(173,216,230,0.85)', pad.left, pad.top, plotWidth, mainHeight, finalMin, finalMax, true);
        }
        if (indicatorPrefs.supertrend !== false) {
            drawOverlayLine(ctx, chartData.supertrend.line, '#ff5d8f', pad.left, pad.top, plotWidth, mainHeight, finalMin, finalMax, true);
        }
        drawReferenceLine(ctx, chartData.support, '#0ea5e9', pad.left, pad.top, plotWidth, mainHeight, finalMin, finalMax, 'Support');
        drawReferenceLine(ctx, chartData.resistance, '#f97316', pad.left, pad.top, plotWidth, mainHeight, finalMin, finalMax, 'Resistance');
        drawLastPriceMarker(ctx, lastNumber(candles.map(function (candle) { return candle.close; })), finalMin, finalMax, width, pad.right, pad.top, mainHeight);

        if (showVolume) {
            const maxVolume = Math.max.apply(null, chartData.volume.concat([1]));
            candles.forEach(function (candle, index) {
                const x = pad.left + (plotWidth / Math.max(candles.length - 1, 1)) * index;
                const barHeight = (chartData.volume[index] / maxVolume) * (volumeHeight - 10);
                ctx.fillStyle = candle.close >= candle.open ? 'rgba(76,208,159,0.55)' : 'rgba(255,123,123,0.55)';
                ctx.fillRect(x - bodyWidth / 2, volumeTop + volumeHeight - barHeight, bodyWidth, barHeight);
            });
            drawPanelLabel(ctx, 'Volume', pad.left + 8, volumeTop + 16);
        }

        if (showRsi) {
            drawHorizontalGrid(ctx, pad.left, rsiTop, plotWidth, rsiHeight, 3);
            drawRsiBand(ctx, pad.left, rsiTop, plotWidth, rsiHeight, 30, 70);
            drawSeriesPanel(ctx, chartData.rsi, '#ffe082', pad.left, rsiTop, plotWidth, rsiHeight, 0, 100);
            drawPanelLabel(ctx, 'RSI', pad.left + 8, rsiTop + 16);
        }

        if (showMacd) {
            const histValues = chartData.macd.hist.filter(isFiniteNumber);
            const macdValues = chartData.macd.macd.concat(chartData.macd.signal).filter(isFiniteNumber);
            const minMacd = Math.min.apply(null, histValues.concat(macdValues).concat([0]));
            const maxMacd = Math.max.apply(null, histValues.concat(macdValues).concat([0]));
            drawHorizontalGrid(ctx, pad.left, macdTop, plotWidth, macdHeight, 4);
            const zeroY = scaleY(0, minMacd, maxMacd, macdTop, macdHeight);
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.beginPath();
            ctx.moveTo(pad.left, zeroY);
            ctx.lineTo(pad.left + plotWidth, zeroY);
            ctx.stroke();
            chartData.macd.hist.forEach(function (value, index) {
                if (!isFiniteNumber(value)) {
                    return;
                }
                const x = pad.left + (plotWidth / Math.max(chartData.macd.hist.length - 1, 1)) * index;
                const y = scaleY(value, minMacd, maxMacd, macdTop, macdHeight);
                const h = zeroY - y;
                ctx.fillStyle = value >= 0 ? 'rgba(76,208,159,0.55)' : 'rgba(255,123,123,0.55)';
                ctx.fillRect(x - bodyWidth / 2, value >= 0 ? y : zeroY, bodyWidth, Math.abs(h));
            });
            drawSeriesPanel(ctx, chartData.macd.macd, '#7dd3fc', pad.left, macdTop, plotWidth, macdHeight, minMacd, maxMacd);
            drawSeriesPanel(ctx, chartData.macd.signal, '#f9a8d4', pad.left, macdTop, plotWidth, macdHeight, minMacd, maxMacd);
            drawPanelLabel(ctx, 'MACD', pad.left + 8, macdTop + 16);
        }

        if (showStoch) {
            drawHorizontalGrid(ctx, pad.left, stochTop, plotWidth, stochHeight, 3);
            drawRsiBand(ctx, pad.left, stochTop, plotWidth, stochHeight, 20, 80);
            drawSeriesPanel(ctx, chartData.stoch.k, '#93c5fd', pad.left, stochTop, plotWidth, stochHeight, 0, 100);
            drawSeriesPanel(ctx, chartData.stoch.d, '#fda4af', pad.left, stochTop, plotWidth, stochHeight, 0, 100);
            drawPanelLabel(ctx, 'Stochastic', pad.left + 8, stochTop + 16);
        }

        drawPanelLabel(ctx, chartData.title + ' Candles', pad.left + 8, pad.top + 18);
        drawLegend(ctx, indicatorPrefs, width - pad.right - 180, pad.top + 14);
    }

    function drawPanelBackground(ctx, x, y, width, height, fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.strokeRect(x, y, width, height);
    }

    function drawHorizontalGrid(ctx, x, y, width, height, lines) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= lines; i += 1) {
            const py = y + (height / Math.max(lines, 1)) * i;
            ctx.beginPath();
            ctx.moveTo(x, py);
            ctx.lineTo(x + width, py);
            ctx.stroke();
        }
    }

    function drawPriceAxis(ctx, min, max, x, y, height, ticks) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = '12px Segoe UI';
        ctx.textAlign = 'left';
        for (let i = 0; i <= ticks; i += 1) {
            const value = max - ((max - min) / Math.max(ticks, 1)) * i;
            const py = y + (height / Math.max(ticks, 1)) * i;
            ctx.fillText(formatNumber(value, 2), x, py + 4);
        }
    }

    function drawOverlayLine(ctx, series, stroke, x, y, width, height, min, max, visible) {
        if (!visible) {
            return;
        }
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        let started = false;
        series.forEach(function (value, index) {
            if (!isFiniteNumber(value)) {
                return;
            }
            const px = x + (width / Math.max(series.length - 1, 1)) * index;
            const py = scaleY(value, min, max, y, height);
            if (!started) {
                ctx.moveTo(px, py);
                started = true;
            } else {
                ctx.lineTo(px, py);
            }
        });
        ctx.stroke();
    }

    function drawSeriesPanel(ctx, series, stroke, x, y, width, height, min, max) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        series.forEach(function (value, index) {
            if (!isFiniteNumber(value)) {
                return;
            }
            const px = x + (width / Math.max(series.length - 1, 1)) * index;
            const py = scaleY(value, min, max, y, height);
            if (!started) {
                ctx.moveTo(px, py);
                started = true;
            } else {
                ctx.lineTo(px, py);
            }
        });
        ctx.stroke();
    }

    function drawRsiBand(ctx, x, y, width, height, low, high) {
        const lowY = scaleY(low, 0, 100, y, height);
        const highY = scaleY(high, 0, 100, y, height);
        ctx.fillStyle = 'rgba(255,209,102,0.08)';
        ctx.fillRect(x, highY, width, lowY - highY);
        ctx.strokeStyle = 'rgba(255,209,102,0.28)';
        [lowY, highY].forEach(function (py) {
            ctx.beginPath();
            ctx.moveTo(x, py);
            ctx.lineTo(x + width, py);
            ctx.stroke();
        });
    }

    function drawReferenceLine(ctx, value, stroke, x, y, width, height, min, max, label) {
        if (!isFiniteNumber(value)) {
            return;
        }
        const py = scaleY(value, min, max, y, height);
        ctx.strokeStyle = stroke;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(x, py);
        ctx.lineTo(x + width, py);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = stroke;
        ctx.font = '11px Segoe UI';
        ctx.fillText(label, x + 8, py - 4);
    }

    function drawLastPriceMarker(ctx, price, min, max, width, rightPad, y, height) {
        const py = scaleY(price, min, max, y, height);
        const text = formatNumber(price, 2);
        const x = width - rightPad + 4;
        ctx.fillStyle = '#0b1220';
        ctx.fillRect(x - 4, py - 12, 58, 20);
        ctx.fillStyle = '#f8fafc';
        ctx.font = '12px Segoe UI';
        ctx.fillText(text, x, py + 3);
    }

    function drawPanelLabel(ctx, text, x, y) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '600 12px Segoe UI';
        ctx.fillText(text, x, y);
    }

    function drawLegend(ctx, indicatorPrefs, x, y) {
        const legend = [];
        if (indicatorPrefs.ema20 !== false) legend.push(['EMA20', '#ffd166']);
        if (indicatorPrefs.ema50 !== false) legend.push(['EMA50', '#80ed99']);
        if (indicatorPrefs.ema200 !== false) legend.push(['EMA200', '#90caf9']);
        if (indicatorPrefs.vwap !== false) legend.push(['VWAP', '#ff9f1c']);
        if (indicatorPrefs.bollinger !== false) legend.push(['Bollinger', '#add8e6']);
        if (indicatorPrefs.supertrend !== false) legend.push(['Supertrend', '#ff5d8f']);
        if (indicatorPrefs.stoch === true) legend.push(['Stoch', '#93c5fd']);
        ctx.font = '11px Segoe UI';
        legend.forEach(function (item, index) {
            ctx.fillStyle = item[1];
            ctx.fillRect(x, y + index * 16, 10, 10);
            ctx.fillStyle = 'rgba(255,255,255,0.82)';
            ctx.fillText(item[0], x + 16, y + 9 + index * 16);
        });
    }

    function scaleY(value, min, max, y, height) {
        return y + height - (((value - min) / ((max - min) || 1)) * height);
    }

    /** Resets the scanner filter controls to their default values. */
    function clearFilters() {
        Object.keys(filterEls).forEach(function (key) {
            const el = filterEls[key];
            if (!el) {
                return;
            }
            if (key === 'sort') {
                el.value = state.prefs.filterSort || 'score_desc';
            } else if (key === 'limit') {
                el.value = String(state.prefs.rowLimit || 120);
            } else {
                el.value = '';
            }
        });
        state.activePreset = 'all';
        state.prefs.activePreset = 'all';
        savePrefs();
        updatePresetUi();
        applyFilters();
    }

    /** Copies the currently visible symbol list to the clipboard. */
    async function copyVisibleSymbols() {
        if (!state.filteredRows.length) {
            setStatus('No visible rows to copy.', 'error');
            return;
        }
        const text = state.filteredRows.map(function (row) { return row.symbol; }).join(',');
        await navigator.clipboard.writeText(text);
        setStatus('Visible symbols copied to clipboard.', 'success');
    }

    /** Downloads the visible scanner rows as a CSV file. */
    function downloadVisibleCsv() {
        if (!state.filteredRows.length) {
            setStatus('No visible rows to export.', 'error');
            return;
        }
        const header = ['Symbol', 'Sector', 'Signal', 'Score', 'Close', 'ChangePct', 'DailyRSI', 'WeeklyRSI', 'MonthlyRSI', 'ADX', 'VolumeRatio', 'Support', 'Resistance', 'Scans'];
        const rows = state.filteredRows.map(function (row) {
            return [
                row.symbol,
                row.sector,
                row.signal,
                row.score,
                row.close,
                row.changePct,
                row.dailyRsi,
                row.weeklyRsi,
                row.monthlyRsi,
                row.adx,
                row.volumeRatio,
                row.support,
                row.resistance,
                row.scans.join(' | '),
            ];
        });
        const csv = [header].concat(rows).map(function (line) {
            return line.map(csvCell).join(',');
        }).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'scanner-visible-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    }

    function csvCell(value) {
        return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
    }

    function setStatus(message, tone) {
        if (!els.status) {
            return;
        }
        els.status.textContent = message;
        els.status.classList.remove('is-busy', 'is-error', 'is-success');
        if (tone === 'busy') {
            els.status.classList.add('is-busy');
        } else if (tone === 'error') {
            els.status.classList.add('is-error');
        } else if (tone === 'success') {
            els.status.classList.add('is-success');
        }
    }

    function textValue(el) {
        return el && el.value ? String(el.value).trim() : '';
    }

    function safeNumber(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function safeNullableNumber(el) {
        if (!el || el.value === '') {
            return null;
        }
        const number = Number(el.value);
        return Number.isFinite(number) ? number : null;
    }

    function formatNumber(value, decimals) {
        if (!isFiniteNumber(value)) {
            return '-';
        }
        return Number(value).toFixed(decimals == null ? 2 : decimals);
    }

    function formatSigned(value, decimals) {
        if (!isFiniteNumber(value)) {
            return '-';
        }
        const fixed = Number(value).toFixed(decimals == null ? 2 : decimals);
        return (value >= 0 ? '+' : '') + fixed;
    }

    function roundNumber(value, decimals) {
        if (!isFiniteNumber(value)) {
            return 0;
        }
        return Number(Number(value).toFixed(decimals == null ? 2 : decimals));
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function average(values) {
        const clean = values.filter(isFiniteNumber);
        if (!clean.length) {
            return 0;
        }
        return clean.reduce(function (sum, value) { return sum + value; }, 0) / clean.length;
    }

    function percentChange(current, previous) {
        if (!previous) {
            return 0;
        }
        return ((current - previous) / previous) * 100;
    }

    function maxValue(values, fallback) {
        const clean = values.filter(isFiniteNumber);
        return clean.length ? Math.max.apply(null, clean) : fallback;
    }

    function minValue(values, fallback) {
        const clean = values.filter(isFiniteNumber);
        return clean.length ? Math.min.apply(null, clean) : fallback;
    }

    function lastNumber(values, fallback) {
        for (let index = values.length - 1; index >= 0; index -= 1) {
            if (isFiniteNumber(values[index])) {
                return values[index];
            }
        }
        return fallback == null ? 0 : fallback;
    }

    function last(values) {
        return values.length ? values[values.length - 1] : null;
    }

    function isFiniteNumber(value) {
        return typeof value === 'number' && Number.isFinite(value);
    }

    function waitForFrame() {
        return new Promise(function (resolve) { window.setTimeout(resolve, 0); });
    }

    /** Expands packed candle arrays from the API into objects. */
    function unpackCandles(packed) {
        return (packed || []).map(function (row) {
            return {
                ts: String(row[0] || ''),
                open: safeNumber(row[1], 0),
                high: safeNumber(row[2], 0),
                low: safeNumber(row[3], 0),
                close: safeNumber(row[4], 0),
                volume: safeNumber(row[5], 0),
            };
        });
    }

    /** Converts numeric series values into inline sparkline SVG points. */
    function sparklinePoints(values) {
        const clean = values.filter(isFiniteNumber);
        if (!clean.length) {
            return '';
        }
        const min = Math.min.apply(null, clean);
        const max = Math.max.apply(null, clean);
        const span = (max - min) || 1;
        return clean.map(function (value, index) {
            const x = (index / Math.max(clean.length - 1, 1)) * 100;
            const y = 26 - (((value - min) / span) * 22);
            return x.toFixed(2) + ',' + y.toFixed(2);
        }).join(' ');
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /** Formats backend interval constants into short display labels. */
    function intervalLabelFor(value) {
        const mapping = {
            FIVE_MINUTE: '5m',
            FIFTEEN_MINUTE: '15m',
            ONE_HOUR: '1h',
            ONE_DAY: '1D',
            ONE_WEEK: '1W',
            ONE_MONTH: '1M',
        };
        return mapping[value] || value;
    }

    function formatTimestamp(value) {
        if (!value) {
            return '-';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return date.toLocaleString();
    }

    function metricPill(label, value) {
        return '<div class="metric-pill"><span class="metric-pill-label">' + escapeHtml(label) + '</span><strong>' + escapeHtml(String(value)) + '</strong></div>';
    }

    function signalTone(signal) {
        if (signal === 'STRONG_BUY' || signal === 'BUY') return 'good';
        if (signal === 'STRONG_SELL') return 'danger';
        if (signal === 'SELL') return 'warn';
        if (signal === 'WATCH') return 'soft';
        return 'neutral';
    }

    function parseDate(value) {
        const direct = new Date(value);
        if (!Number.isNaN(direct.getTime())) {
            return direct;
        }
        const normalized = String(value || '').replace(' ', 'T');
        const parsed = new Date(normalized);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    /** Aggregates close values into weekly or monthly buckets. */
    function aggregateCloseByBucket(candles, mode) {
        const buckets = new Map();
        candles.forEach(function (candle) {
            const date = parseDate(candle.ts);
            if (!date) {
                return;
            }
            const key = bucketKeyForDate(date, mode);
            buckets.set(key, candle.close);
        });
        return Array.from(buckets.values());
    }

    /** Aggregates full candles into weekly or monthly OHLCV buckets. */
    function aggregateCandlesByBucket(candles, mode) {
        const buckets = new Map();
        const order = [];
        candles.forEach(function (candle) {
            const date = parseDate(candle.ts);
            if (!date) {
                return;
            }
            const key = bucketKeyForDate(date, mode);

            let row = buckets.get(key);
            if (!row) {
                row = {
                    ts: key,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                    volume: candle.volume,
                };
                buckets.set(key, row);
                order.push(key);
                return;
            }

            row.high = Math.max(row.high, candle.high);
            row.low = Math.min(row.low, candle.low);
            row.close = candle.close;
            row.volume += candle.volume;
        });
        return order.map(function (key) { return buckets.get(key); });
    }

    function bucketKeyForDate(date, mode) {
        if (mode === 'week') {
            return isoWeekKey(date);
        }
        return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
    }

    function isoWeekKey(date) {
        const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const day = utc.getUTCDay() || 7;
        utc.setUTCDate(utc.getUTCDate() + 4 - day);
        const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
        return utc.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
    }

    /** Calculates an exponential moving average series. */
    function emaSeries(values, period) {
        if (!values.length) {
            return [];
        }
        const alpha = 2 / (period + 1);
        const output = [values[0]];
        for (let index = 1; index < values.length; index += 1) {
            output.push((values[index] * alpha) + (output[index - 1] * (1 - alpha)));
        }
        return output;
    }

    function smaSeries(values, period) {
        const output = [];
        let sum = 0;
        for (let index = 0; index < values.length; index += 1) {
            sum += values[index];
            if (index >= period) {
                sum -= values[index - period];
            }
            output.push(index >= period - 1 ? sum / period : null);
        }
        return output;
    }

    /** Calculates an RSI series for the supplied closes. */
    function rsiSeries(values, period) {
        if (values.length < period + 1) {
            return values.map(function () { return 50; });
        }
        const deltas = [];
        for (let index = 1; index < values.length; index += 1) {
            deltas.push(values[index] - values[index - 1]);
        }
        let avgGain = average(deltas.slice(0, period).map(function (value) { return Math.max(value, 0); }));
        let avgLoss = average(deltas.slice(0, period).map(function (value) { return Math.max(-value, 0); }));
        const output = new Array(period).fill(50);
        for (let index = period; index < deltas.length; index += 1) {
            const gain = Math.max(deltas[index], 0);
            const loss = Math.max(-deltas[index], 0);
            avgGain = ((avgGain * (period - 1)) + gain) / period;
            avgLoss = ((avgLoss * (period - 1)) + loss) / period;
            if (avgLoss === 0) {
                output.push(100);
            } else {
                const rs = avgGain / avgLoss;
                output.push(100 - (100 / (1 + rs)));
            }
        }
        while (output.length < values.length) {
            output.unshift(50);
        }
        return output.slice(-values.length);
    }

    /** Calculates MACD, signal, and histogram series. */
    function macdSeries(values, fast, slow, signal) {
        const fastEma = emaSeries(values, Math.max(2, fast));
        const slowEma = emaSeries(values, Math.max(3, slow));
        const macd = fastEma.map(function (value, index) {
            return value - slowEma[index];
        });
        const signalSeries = emaSeries(macd, Math.max(2, signal));
        const hist = macd.map(function (value, index) {
            return value - signalSeries[index];
        });
        return { macd: macd, signal: signalSeries, hist: hist };
    }

    function atrSeries(highs, lows, closes, period) {
        const tr = [];
        for (let index = 0; index < closes.length; index += 1) {
            if (index === 0) {
                tr.push(highs[index] - lows[index]);
            } else {
                tr.push(Math.max(
                    highs[index] - lows[index],
                    Math.abs(highs[index] - closes[index - 1]),
                    Math.abs(lows[index] - closes[index - 1])
                ));
            }
        }
        const atr = [];
        for (let index = 0; index < tr.length; index += 1) {
            if (index === 0) {
                atr.push(tr[index]);
            } else if (index < period) {
                atr.push(average(tr.slice(0, index + 1)));
            } else {
                atr.push(((atr[index - 1] * (period - 1)) + tr[index]) / period);
            }
        }
        return atr;
    }

    /** Calculates a simplified ADX trend-strength series. */
    function adxSeries(highs, lows, closes, period) {
        if (closes.length < period + 1) {
            return closes.map(function () { return 10; });
        }
        const tr = [];
        const plusDm = [0];
        const minusDm = [0];
        for (let index = 1; index < closes.length; index += 1) {
            const upMove = highs[index] - highs[index - 1];
            const downMove = lows[index - 1] - lows[index];
            plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
            minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
            tr.push(Math.max(
                highs[index] - lows[index],
                Math.abs(highs[index] - closes[index - 1]),
                Math.abs(lows[index] - closes[index - 1])
            ));
        }
        const atr = atrSeries(highs, lows, closes, period);
        const plusDi = [];
        const minusDi = [];
        const dx = [];
        for (let index = 0; index < closes.length; index += 1) {
            const atrValue = atr[index] || 1;
            const plus = (emaSeries(plusDm.slice(0, index + 1), period).slice(-1)[0] || 0) / atrValue * 100;
            const minus = (emaSeries(minusDm.slice(0, index + 1), period).slice(-1)[0] || 0) / atrValue * 100;
            plusDi.push(plus);
            minusDi.push(minus);
            const denominator = plus + minus;
            dx.push(denominator ? Math.abs((plus - minus) / denominator) * 100 : 0);
        }
        return emaSeries(dx, period);
    }

    /** Calculates stochastic K and D series. */
    function stochasticSeries(highs, lows, closes, period, smooth) {
        const k = closes.map(function (_, index) {
            const start = Math.max(0, index - period + 1);
            const hh = maxValue(highs.slice(start, index + 1), closes[index]);
            const ll = minValue(lows.slice(start, index + 1), closes[index]);
            const span = (hh - ll) || 1;
            return ((closes[index] - ll) / span) * 100;
        });
        return {
            k: k,
            d: smaSeries(k, smooth).map(function (value) { return value == null ? 50 : value; }),
        };
    }

    /** Calculates Bollinger band and band-width series. */
    function bollingerSeries(values, period, multiplier) {
        const middle = smaSeries(values, period);
        const upper = [];
        const lower = [];
        const width = [];
        for (let index = 0; index < values.length; index += 1) {
            if (index < period - 1 || middle[index] == null) {
                upper.push(null);
                lower.push(null);
                width.push(null);
                continue;
            }
            const slice = values.slice(index - period + 1, index + 1);
            const avg = middle[index];
            const variance = slice.reduce(function (sum, value) {
                return sum + Math.pow(value - avg, 2);
            }, 0) / period;
            const std = Math.sqrt(variance);
            upper.push(avg + (multiplier * std));
            lower.push(avg - (multiplier * std));
            width.push(avg ? ((upper[index] - lower[index]) / avg) * 100 : 0);
        }
        return { middle: middle, upper: upper, lower: lower, width: width };
    }

    /** Calculates a client-side Supertrend line and bullish state. */
    function supertrendSeries(highs, lows, closes, period, multiplier) {
        const atr = atrSeries(highs, lows, closes, period);
        const upperBasic = highs.map(function (high, index) {
            return ((high + lows[index]) / 2) + (multiplier * atr[index]);
        });
        const lowerBasic = highs.map(function (high, index) {
            return ((high + lows[index]) / 2) - (multiplier * atr[index]);
        });
        const upperFinal = upperBasic.slice();
        const lowerFinal = lowerBasic.slice();
        const line = [upperBasic[0]];
        const bullish = [false];
        for (let index = 1; index < closes.length; index += 1) {
            upperFinal[index] = (upperBasic[index] < upperFinal[index - 1] || closes[index - 1] > upperFinal[index - 1])
                ? upperBasic[index]
                : upperFinal[index - 1];
            lowerFinal[index] = (lowerBasic[index] > lowerFinal[index - 1] || closes[index - 1] < lowerFinal[index - 1])
                ? lowerBasic[index]
                : lowerFinal[index - 1];
            if (line[index - 1] === upperFinal[index - 1]) {
                if (closes[index] <= upperFinal[index]) {
                    line.push(upperFinal[index]);
                    bullish.push(false);
                } else {
                    line.push(lowerFinal[index]);
                    bullish.push(true);
                }
            } else if (closes[index] >= lowerFinal[index]) {
                line.push(lowerFinal[index]);
                bullish.push(true);
            } else {
                line.push(upperFinal[index]);
                bullish.push(false);
            }
        }
        return { line: line, bullish: bullish };
    }

    /** Calculates a cumulative VWAP series for the active candle set. */
    function vwapSeries(candles) {
        let pv = 0;
        let vv = 0;
        return candles.map(function (candle) {
            const typical = (candle.high + candle.low + candle.close) / 3;
            pv += typical * candle.volume;
            vv += candle.volume;
            return vv ? pv / vv : candle.close;
        });
    }
})();
