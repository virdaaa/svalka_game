// ==========================================
// SVALKA - Vintage Clothing Merge Game
// ==========================================

// ==========================================
// CONSTANTS
// ==========================================

const ITEM_TYPES = {
    jacket: { emoji: '🧥', name: 'Куртка' },
    jeans: { emoji: '👖', name: 'Джинсы' },
    shirt: { emoji: '👕', name: 'Футболка' },
    sneakers: { emoji: '👟', name: 'Кроссовки' },
    hat: { emoji: '🧢', name: 'Кепка' },
    bag: { emoji: '👜', name: 'Сумка' },
    dress: { emoji: '👗', name: 'Платье' },
    watch: { emoji: '⌚', name: 'Часы' },
};

const ITEM_TYPE_KEYS = Object.keys(ITEM_TYPES);

const GRADES = {
    1: { name: 'Масс-маркет', basePrice: 10 },
    2: { name: 'Базовый винтаж', basePrice: 35 },
    3: { name: 'Хороший винтаж', basePrice: 120 },
    4: { name: 'Редкий', basePrice: 400 },
    5: { name: 'Грааль', basePrice: 1500 },
};

const BALES = {
    europe: { price: 100, items: [3, 6], grades: { 1: 80, 2: 20 } },
    japan: { price: 350, items: [2, 4], grades: { 1: 40, 2: 45, 3: 15 } },
    usa: { price: 500, items: [3, 5], grades: { 1: 30, 2: 40, 3: 20, 4: 10 } },
    ussr: { price: 1000, items: [1, 3], grades: { 2: 30, 3: 40, 4: 25, 5: 5 } },
};

const LOCATIONS = {
    grandma: { name: 'Бабушкин чердак', time: 30, items: [1, 3], grades: { 1: 70, 2: 25, 3: 5 } },
    flea: { name: 'Блошиный рынок', time: 60, items: [2, 4], grades: { 1: 50, 2: 35, 3: 12, 4: 3 } },
    warehouse: { name: 'Заброшенный склад', time: 120, items: [3, 5], grades: { 1: 30, 2: 40, 3: 20, 4: 8, 5: 2 } },
};

const NPC_BUYERS = ['Коллекционер', 'Хипстер', 'Перекуп', 'Дизайнер', 'Блогер'];

const EVENT_TYPES = {
    theft: {
        name: 'День воровства',
        icon: '🔥',
        duration: 30000,
        description: 'Хватай всё бесплатно!',
    },
    market: {
        name: 'Рынок на чёрной речке',
        icon: '🏴',
        duration: 45000,
        description: 'Все продажи x2!',
    },
    container: {
        name: 'Контейнер в порту',
        icon: '🚢',
        duration: 30000,
        description: 'Редкие вещи на поле!',
    },
};

// ==========================================
// STATE
// ==========================================

const state = {
    money: 500,
    grid: Array(30).fill(null), // 6x5
    selectedCell: null,
    raiders: [
        { id: 0, name: 'Борис', status: 'idle', location: null, endTime: null, loot: [] },
        { id: 1, name: 'Маша', status: 'idle', location: null, endTime: null, loot: [] },
    ],
    auctions: [null, null],
    upgrades: {
        baleQuality: { level: 1, cost: 500 },
        sellBonus: { level: 1, cost: 750 },
        raiderSpeed: { level: 1, cost: 1000 },
    },
    event: { active: false, type: null, endTime: null },
    lastEventTime: 0,
    tutorialComplete: false,
    tutorialStep: 0,
    stats: {
        totalEarned: 0,
        itemsSold: 0,
        bestGrade: 1,
        balesOpened: 0,
        mergesDone: 0,
    },
    orders: [],
    lastSaveTime: Date.now(),
};

// ==========================================
// HELPERS
// ==========================================

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ==========================================
// SOUND ENGINE (Web Audio API)
// ==========================================

const SoundEngine = {
    ctx: null,
    muted: false,

    init() {
        // Lazy-init on first user gesture
        const unlock = () => {
            if (!this.ctx) {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            }
            document.removeEventListener('click', unlock);
            document.removeEventListener('touchstart', unlock);
        };
        document.addEventListener('click', unlock);
        document.addEventListener('touchstart', unlock);
    },

    _play(fn) {
        if (this.muted || !this.ctx) return;
        try { fn(this.ctx); } catch(e) { /* ignore */ }
    },

    // Merge: ascending tone, higher for rare grades
    merge(grade) {
        this._play(ctx => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            const baseFreq = 400 + grade * 150;
            osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(baseFreq + 300 + grade * 100, ctx.currentTime + 0.2);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.35);
        });
    },

    // Bale open: unpack crinkle sound
    baleOpen() {
        this._play(ctx => {
            const bufferSize = ctx.sampleRate * 0.15;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
            }
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 3000;
            filter.Q.value = 0.5;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            noise.start(ctx.currentTime);
        });
    },

    // Sell: coin jingle
    sell() {
        this._play(ctx => {
            [0, 0.06, 0.12].forEach(delay => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(2200 + Math.random() * 400, ctx.currentTime + delay);
                gain.gain.setValueAtTime(0.08, ctx.currentTime + delay);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.12);
                osc.start(ctx.currentTime + delay);
                osc.stop(ctx.currentTime + delay + 0.12);
            });
        });
    },

    // Event start: siren
    eventStart() {
        this._play(ctx => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.3);
            osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.6);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.6);
        });
    },

    // Cell tap
    tap() {
        this._play(ctx => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.06);
        });
    },

    toggle() {
        this.muted = !this.muted;
        return this.muted;
    }
};

// ==========================================
// YANDEX GAMES SDK
// ==========================================

let ysdk = null;
let ysdkPlayer = null;

async function initYandexSDK() {
    try {
        ysdk = await YaGames.init();

        // Try to get player (may not be authenticated)
        try {
            ysdkPlayer = await ysdk.getPlayer({ scopes: false });
        } catch (e) {
            ysdkPlayer = null;
        }

        // Show leaderboard button
        $('btn-leaderboard').style.display = 'block';

        // Signal game ready
        ysdk.features.LoadingAPI?.ready();
    } catch (e) {
        // SDK not available (local dev, etc.)
        ysdk = null;
    }
}

async function submitLeaderboardScore() {
    if (!ysdk) return;
    try {
        const lb = await ysdk.getLeaderboards();
        await lb.setLeaderboardScore('total_earned', Math.floor(state.stats.totalEarned));
    } catch (e) {
        // Not authenticated — silently ignore
    }
}

async function showLeaderboard() {
    const modal = $('leaderboard-modal');
    const list = $('leaderboard-list');

    modal.classList.add('active');
    list.innerHTML = '<div class="lb-loading">Загрузка...</div>';

    if (!ysdk) {
        list.innerHTML = '<div class="lb-error">Рейтинг недоступен</div>';
        return;
    }

    // Check auth — prompt if needed
    if (!ysdkPlayer || ysdkPlayer.getMode() === 'lite') {
        try {
            await ysdk.auth.openAuthDialog();
            ysdkPlayer = await ysdk.getPlayer({ scopes: false });
            // Submit current score after auth
            await submitLeaderboardScore();
        } catch (e) {
            // User declined auth — still show board
        }
    }

    try {
        const lb = await ysdk.getLeaderboards();
        const result = await lb.getLeaderboardEntries('total_earned', {
            quantityTop: 10,
            includeUser: true,
        });

        if (!result.entries || result.entries.length === 0) {
            list.innerHTML = '<div class="lb-error">Пока нет записей</div>';
            return;
        }

        const selfId = ysdkPlayer ? ysdkPlayer.getUniqueID() : null;

        list.innerHTML = result.entries.map(entry => {
            const name = entry.player.publicName || 'Игрок';
            const isSelf = selfId && entry.player.uniqueID === selfId;
            return `
                <div class="lb-row ${isSelf ? 'lb-self' : ''}">
                    <span class="lb-rank">#${entry.rank}</span>
                    <span class="lb-name">${name}</span>
                    <span class="lb-score">₽${formatNumber(entry.score)}</span>
                </div>
            `;
        }).join('');
    } catch (e) {
        list.innerHTML = '<div class="lb-error">Не удалось загрузить рейтинг</div>';
    }
}

function closeLeaderboard() {
    $('leaderboard-modal').classList.remove('active');
}

// ==========================================
// INITIALIZATION
// ==========================================

function init() {
    createGrid();
    setupTabs();
    setupMergeControls();
    setupBales();
    setupRaiders();
    setupAuction();
    setupSoundToggle();
    setupLeaderboard();
    SoundEngine.init();
    MusicManager.init();
    initYandexSDK();
    loadGame();
    updateUI();
    startGameLoop();

    // Start main music
    MusicManager.play('main');

    // Check for event
    maybeStartEvent();
}

function setupLeaderboard() {
    $('btn-leaderboard').addEventListener('click', showLeaderboard);
    $('leaderboard-close').addEventListener('click', closeLeaderboard);
    $('leaderboard-modal').addEventListener('click', (e) => {
        if (e.target === $('leaderboard-modal')) closeLeaderboard();
    });
}

function createGrid() {
    const field = $('merge-field');
    field.innerHTML = '';
    for (let i = 0; i < 30; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell empty';
        cell.dataset.index = i;
        cell.addEventListener('click', () => handleCellClick(i));
        field.appendChild(cell);
    }
}

function setupTabs() {
    $$('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.tab').forEach(t => t.classList.remove('active'));
            $$('.panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            $(`panel-${tab.dataset.tab}`).classList.add('active');

            // Switch music based on tab (event music takes priority)
            if (!state.event.active) {
                if (tab.dataset.tab === 'auction') {
                    MusicManager.play('auction');
                } else {
                    MusicManager.play('main');
                }
            }

            // Update stats when switching to stats tab
            if (tab.dataset.tab === 'stats') {
                renderStats();
            }
        });
    });
}

function setupMergeControls() {
    $('btn-quick-bale').addEventListener('click', () => openBale('europe'));
    $('btn-sell-all').addEventListener('click', sellAll);
    $('btn-upgrades').addEventListener('click', openUpgradesModal);
    $('btn-event').addEventListener('click', grabEventItem);
}

function setupBales() {
    $$('.bale-btn').forEach(btn => {
        btn.addEventListener('click', () => openBale(btn.dataset.bale));
    });
}

function setupRaiders() {
    $$('.raider-card').forEach(card => {
        const raiderId = parseInt(card.dataset.raider);

        card.querySelectorAll('.location-btn').forEach(btn => {
            btn.addEventListener('click', () => sendRaider(raiderId, btn.dataset.location));
        });

        card.querySelector('.raider-collect').addEventListener('click', () => collectRaiderLoot(raiderId));
    });
}

function setupAuction() {
    $$('.auction-slot.empty').forEach((slot, i) => {
        slot.addEventListener('click', () => openItemPicker(i));
    });

    $('picker-close').addEventListener('click', closeItemPicker);
    $('item-picker').addEventListener('click', (e) => {
        if (e.target === $('item-picker')) closeItemPicker();
    });

    // Upgrades modal
    $('upgrades-close').addEventListener('click', closeUpgradesModal);
    $('upgrades-modal').addEventListener('click', (e) => {
        if (e.target === $('upgrades-modal')) closeUpgradesModal();
    });
    $('btn-upgrade-bale').addEventListener('click', () => buyUpgrade('baleQuality'));
    $('btn-upgrade-sell').addEventListener('click', () => buyUpgrade('sellBonus'));
    $('btn-upgrade-raider').addEventListener('click', () => buyUpgrade('raiderSpeed'));
}

function setupSoundToggle() {
    // Sync initial state from MusicManager (persisted in localStorage)
    const initialMuted = MusicManager.isMuted();
    if (initialMuted) {
        SoundEngine.muted = true;
        $('btn-mute').textContent = '🔇';
    }

    $('btn-mute').addEventListener('click', () => {
        const muted = SoundEngine.toggle();
        MusicManager.setMuted(muted);
        $('btn-mute').textContent = muted ? '🔇' : '🔊';
    });
}

// ==========================================
// GRID & ITEMS
// ==========================================

function renderGrid() {
    const cells = $('merge-field').children;

    for (let i = 0; i < 30; i++) {
        const cell = cells[i];
        const item = state.grid[i];

        cell.className = 'cell';
        cell.innerHTML = '';

        if (state.event.active && state.event.type === 'theft') cell.classList.add('event-mode');

        if (item) {
            cell.classList.add('has-item');
            if (state.selectedCell === i) cell.classList.add('selected');

            const itemEl = document.createElement('div');
            itemEl.className = `item grade-${item.grade}`;
            itemEl.innerHTML = `
                <span class="emoji">${ITEM_TYPES[item.type].emoji}</span>
                <span class="grade-indicator grade-${item.grade}"></span>
            `;
            cell.appendChild(itemEl);
        } else {
            cell.classList.add('empty');
        }
    }

    // Merge targets
    if (state.selectedCell !== null) {
        const selectedItem = state.grid[state.selectedCell];
        if (selectedItem) {
            for (let i = 0; i < 30; i++) {
                const item = state.grid[i];
                if (i !== state.selectedCell && item && canMerge(selectedItem, item)) {
                    cells[i].classList.add('merge-target');
                }
            }
        }
    }
}

function createItem(type, grade) {
    // Track best grade in stats
    if (grade > state.stats.bestGrade) state.stats.bestGrade = grade;
    return { type, grade };
}

function getRandomType() {
    return ITEM_TYPE_KEYS[Math.floor(Math.random() * ITEM_TYPE_KEYS.length)];
}

function getRandomGrade(gradeChances, applyBonus = true) {
    const qualityBonus = applyBonus ? (state.upgrades.baleQuality.level - 1) * 5 : 0;

    const grades = Object.entries(gradeChances).sort((a, b) => parseInt(b[0]) - parseInt(a[0]));

    // Calculate adjusted chances
    const adjusted = grades.map(([grade, baseChance]) => {
        const gradeNum = parseInt(grade);
        let chance = baseChance;
        if (gradeNum >= 3) {
            chance = baseChance + qualityBonus;
        } else if (gradeNum === 1) {
            chance = Math.max(5, baseChance - qualityBonus * 2);
        }
        return [gradeNum, chance];
    });

    // Normalize to sum to 100
    const total = adjusted.reduce((sum, [, c]) => sum + c, 0);
    const rand = Math.random() * total;

    let cumulative = 0;
    for (const [gradeNum, chance] of adjusted) {
        cumulative += chance;
        if (rand < cumulative) return gradeNum;
    }
    return parseInt(grades[grades.length - 1][0]);
}

function findEmptyCell() {
    const empty = [];
    for (let i = 0; i < 30; i++) {
        if (!state.grid[i]) empty.push(i);
    }
    return empty.length ? empty[Math.floor(Math.random() * empty.length)] : -1;
}

function countEmptyCells() {
    return state.grid.filter(c => c === null).length;
}

function addItemToGrid(item, animate = true) {
    const idx = findEmptyCell();
    if (idx === -1) return false;

    state.grid[idx] = item;
    renderGrid();

    if (animate) {
        const itemEl = $('merge-field').children[idx].querySelector('.item');
        if (itemEl) {
            itemEl.classList.add('dropping');
            setTimeout(() => itemEl.classList.remove('dropping'), 300);
        }
    }
    return true;
}

// ==========================================
// MERGE
// ==========================================

function handleCellClick(index) {
    SoundEngine.tap();

    // Event mode (theft) - grab item for free!
    if (state.event.active && state.event.type === 'theft' && state.grid[index]) {
        const item = state.grid[index];
        const value = GRADES[item.grade].basePrice;
        state.money += value;
        state.stats.totalEarned += value;
        state.grid[index] = null;
        showToast(`🔥 Украдено! +₽${value}`, 'event');
        renderGrid();
        updateUI();
        submitLeaderboardScore();
        saveGame();
        return;
    }

    const clickedItem = state.grid[index];

    if (state.selectedCell === null) {
        if (clickedItem) {
            state.selectedCell = index;
            renderGrid();
        }
        return;
    }

    if (state.selectedCell === index) {
        state.selectedCell = null;
        renderGrid();
        return;
    }

    const selectedItem = state.grid[state.selectedCell];

    if (clickedItem && canMerge(selectedItem, clickedItem)) {
        performMerge(state.selectedCell, index);
        return;
    }

    if (!clickedItem) {
        state.grid[index] = selectedItem;
        state.grid[state.selectedCell] = null;
        state.selectedCell = null;
        renderGrid();
        saveGame();
        return;
    }

    state.selectedCell = index;
    renderGrid();
}

function canMerge(a, b) {
    return a.type === b.type && a.grade === b.grade && a.grade < 5;
}

function performMerge(from, to) {
    const item = state.grid[from];
    const newGrade = item.grade + 1;

    const cells = $('merge-field').children;
    const fromEl = cells[from].querySelector('.item');
    const toEl = cells[to].querySelector('.item');

    if (fromEl) fromEl.classList.add('merging-out');
    if (toEl) toEl.classList.add('merging-out');

    SoundEngine.merge(newGrade);
    state.stats.mergesDone++;

    setTimeout(() => {
        state.grid[from] = null;
        state.grid[to] = createItem(item.type, newGrade);
        state.selectedCell = null;
        renderGrid();

        const newEl = cells[to].querySelector('.item');
        if (newEl) {
            newEl.classList.add('merging-in');
            setTimeout(() => newEl.classList.remove('merging-in'), 400);
        }

        if (newGrade >= 3) {
            showToast(`${ITEM_TYPES[item.type].emoji} ${GRADES[newGrade].name}!`, 'merge');
        }

        // Tutorial step 2: after first merge
        if (!state.tutorialComplete && state.tutorialStep === 2) {
            advanceTutorial();
        }

        saveGame();
    }, 200);
}

// ==========================================
// BALES
// ==========================================

function openBale(baleType) {
    const bale = BALES[baleType];

    if (state.money < bale.price) {
        showToast('Не хватает денег!', 'warning');
        return;
    }

    const [minItems, maxItems] = bale.items;
    const itemCount = minItems + Math.floor(Math.random() * (maxItems - minItems + 1));

    if (countEmptyCells() < itemCount) {
        showToast(`Нужно минимум ${itemCount} слотов!`, 'warning');
        return;
    }

    state.money -= bale.price;
    state.stats.balesOpened++;
    SoundEngine.baleOpen();
    updateUI();

    let added = 0;
    for (let i = 0; i < itemCount; i++) {
        setTimeout(() => {
            const type = getRandomType();
            const grade = getRandomGrade(bale.grades);
            if (addItemToGrid(createItem(type, grade), true)) added++;

            // Show toast after last item
            if (i === itemCount - 1) {
                showToast(`📦 Тюк открыт: ${added} вещей!`, 'success');

                // Tutorial step 1: after first bale
                if (!state.tutorialComplete && state.tutorialStep === 1) {
                    advanceTutorial();
                }

                saveGame();
            }
        }, i * 100);
    }
}

// ==========================================
// SELLING
// ==========================================

function getEventSellMultiplier() {
    return (state.event.active && state.event.type === 'market') ? 2 : 1;
}

function sellAll() {
    let total = 0;
    let count = 0;

    const sellMultiplier = 1 + (state.upgrades.sellBonus.level - 1) * 0.2;
    const eventMultiplier = getEventSellMultiplier();

    const soldItems = [];

    for (let i = 0; i < 30; i++) {
        const item = state.grid[i];
        if (item) {
            const value = Math.floor(GRADES[item.grade].basePrice * sellMultiplier * eventMultiplier);
            total += value;
            count++;
            soldItems.push({ ...item });
            state.grid[i] = null;
        }
    }

    if (count === 0) {
        showToast('Нечего продавать!', 'warning');
        return;
    }

    state.money += total;
    state.stats.totalEarned += total;
    state.stats.itemsSold += count;
    state.selectedCell = null;

    // Check orders
    checkOrders(soldItems);

    SoundEngine.sell();
    renderGrid();
    updateUI();

    const marketBonus = eventMultiplier > 1 ? ' (x2 рынок!)' : '';
    showToast(`+₽${total} за ${count} вещей${marketBonus}`, 'money');

    // Tutorial step 3: after first sell
    if (!state.tutorialComplete && state.tutorialStep === 3) {
        advanceTutorial();
    }

    submitLeaderboardScore();
    saveGame();
}

// ==========================================
// RAIDERS (Байеры)
// ==========================================

function sendRaider(raiderId, locationKey) {
    const raider = state.raiders[raiderId];
    const location = LOCATIONS[locationKey];

    if (raider.status !== 'idle') return;

    // Apply speed bonus from upgrades (cap at 70% reduction)
    const speedMultiplier = Math.max(0.3, 1 - (state.upgrades.raiderSpeed.level - 1) * 0.15);
    const adjustedTime = Math.max(10, Math.floor(location.time * speedMultiplier));

    raider.status = 'busy';
    raider.location = locationKey;
    raider.endTime = Date.now() + adjustedTime * 1000;
    raider.loot = [];

    updateRaiderUI(raiderId);
    showToast(`${raider.name} отправлен на "${location.name}"`, 'success');
    saveGame();
}

function collectRaiderLoot(raiderId) {
    const raider = state.raiders[raiderId];

    if (raider.status !== 'ready') return;

    const location = LOCATIONS[raider.location];
    const [minItems, maxItems] = location.items;
    const itemCount = minItems + Math.floor(Math.random() * (maxItems - minItems + 1));

    if (countEmptyCells() < itemCount) {
        showToast(`Нужно ${itemCount} свободных слотов!`, 'warning');
        return;
    }

    // Apply raider level bonus to loot quality
    const qualityBonus = state.upgrades.raiderSpeed.level - 1;

    const items = [];
    for (let i = 0; i < itemCount; i++) {
        const type = getRandomType();
        const boostedChances = {...location.grades};
        if (qualityBonus > 0 && boostedChances[3]) {
            boostedChances[3] = (boostedChances[3] || 0) + qualityBonus * 3;
            boostedChances[1] = Math.max(10, (boostedChances[1] || 50) - qualityBonus * 5);
        }
        const grade = getRandomGrade(boostedChances, false);
        items.push(createItem(type, grade));
    }

    // Add items with staggered animation
    items.forEach((item, i) => {
        setTimeout(() => addItemToGrid(item, true), i * 100);
    });

    raider.status = 'idle';
    raider.location = null;
    raider.endTime = null;

    updateRaiderUI(raiderId);
    showToast(`${raider.name} принёс ${itemCount} вещей!`, 'success');

    // Switch to merge tab
    $$('.tab')[0].click();
    saveGame();
}

function updateRaiderUI(raiderId) {
    const raider = state.raiders[raiderId];
    const card = $$(`.raider-card[data-raider="${raiderId}"]`)[0];

    const statusEl = card.querySelector('.raider-status');
    const progressBar = card.querySelector('.raider-progress-bar');
    const locationBtns = card.querySelectorAll('.location-btn');
    const collectBtn = card.querySelector('.raider-collect');

    if (raider.status === 'idle') {
        statusEl.textContent = 'Свободен';
        statusEl.className = 'raider-status idle';
        progressBar.style.width = '0%';
        locationBtns.forEach(btn => btn.disabled = false);
        collectBtn.classList.remove('ready');
    } else if (raider.status === 'busy') {
        statusEl.textContent = 'В рейде...';
        statusEl.className = 'raider-status busy';
        locationBtns.forEach(btn => btn.disabled = true);
        collectBtn.classList.remove('ready');
    } else if (raider.status === 'ready') {
        statusEl.textContent = 'Вернулся!';
        statusEl.className = 'raider-status idle';
        progressBar.style.width = '100%';
        locationBtns.forEach(btn => btn.disabled = true);
        collectBtn.classList.add('ready');
    }

    // Badge
    const anyReady = state.raiders.some(r => r.status === 'ready');
    $('raiders-badge').style.display = anyReady ? 'block' : 'none';
}

function updateRaiderProgress() {
    state.raiders.forEach((raider, id) => {
        if (raider.status === 'busy' && raider.endTime) {
            const location = LOCATIONS[raider.location];
            const speedMultiplier = Math.max(0.3, 1 - (state.upgrades.raiderSpeed.level - 1) * 0.15);
            const totalTime = Math.max(10, Math.floor(location.time * speedMultiplier)) * 1000;
            const remaining = raider.endTime - Date.now();

            if (remaining <= 0) {
                raider.status = 'ready';
                updateRaiderUI(id);
            } else {
                const progress = ((totalTime - remaining) / totalTime) * 100;
                const card = $$(`.raider-card[data-raider="${id}"]`)[0];
                card.querySelector('.raider-progress-bar').style.width = `${progress}%`;
            }
        }
    });
}

// ==========================================
// AUCTION
// ==========================================

let currentAuctionSlot = null;

function openItemPicker(slotIndex) {
    currentAuctionSlot = slotIndex;
    const picker = $('item-picker');
    const grid = $('picker-grid');

    grid.innerHTML = '';

    state.grid.forEach((item, idx) => {
        if (item) {
            const basePrice = GRADES[item.grade].basePrice;
            const el = document.createElement('div');
            el.className = `picker-item grade-${item.grade}`;
            el.innerHTML = `
                ${ITEM_TYPES[item.type].emoji}
                <span class="grade-dot" style="background: var(--grade-${item.grade})"></span>
                <span class="price-hint">~₽${basePrice}</span>
            `;
            el.addEventListener('click', () => {
                startAuction(slotIndex, idx);
                closeItemPicker();
            });
            grid.appendChild(el);
        }
    });

    if (grid.children.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 20px;">Нет вещей на складе</div>';
    }

    picker.classList.add('active');
}

function closeItemPicker() {
    $('item-picker').classList.remove('active');
    currentAuctionSlot = null;
}

function startAuction(slotIndex, gridIndex) {
    const item = state.grid[gridIndex];
    state.grid[gridIndex] = null;
    renderGrid();

    const basePrice = GRADES[item.grade].basePrice;
    const bids = generateBids(basePrice);

    state.auctions[slotIndex] = {
        item,
        bids,
        currentBid: 0,
        endTime: Date.now() + 30000,
    };

    renderAuctions();
    saveGame();
}

function generateBids(basePrice) {
    const bids = [];
    const numBids = 2 + Math.floor(Math.random() * 3);

    for (let i = 0; i < numBids; i++) {
        const multiplier = 0.7 + Math.random() * 0.8;
        const price = Math.floor(basePrice * multiplier);
        bids.push({
            buyer: NPC_BUYERS[Math.floor(Math.random() * NPC_BUYERS.length)],
            price,
        });
    }

    return bids.sort((a, b) => b.price - a.price);
}

function renderAuctions() {
    state.auctions.forEach((auction, i) => {
        const slot = $(`auction-slot-${i}`);

        if (!auction) {
            slot.className = 'auction-slot empty';
            slot.innerHTML = '<div class="plus">+</div><div class="hint">Выставить вещь на аукцион</div>';
            slot.onclick = () => openItemPicker(i);
            return;
        }

        const { item, bids, currentBid } = auction;
        const bestBid = bids[currentBid];
        const remaining = Math.max(0, Math.ceil((auction.endTime - Date.now()) / 1000));

        slot.className = 'auction-slot';
        slot.onclick = null;
        slot.innerHTML = `
            <div class="auction-active">
                <div class="auction-item-display grade-${item.grade}">${ITEM_TYPES[item.type].emoji}</div>
                <div class="auction-details">
                    <div class="auction-item-name">${ITEM_TYPES[item.type].name}</div>
                    <div class="auction-grade" style="color: var(--grade-${item.grade})">${GRADES[item.grade].name}</div>
                    <div class="auction-bids">
                        ${bids.slice(currentBid, currentBid + 2).map((bid, j) => `
                            <div class="auction-bid ${j === 0 ? 'best' : ''}">
                                <span>${bid.buyer}</span>
                                <span class="bid-price">₽${bid.price}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="auction-timer">\u23F1\uFE0F ${remaining}с до следующей ставки</div>
                </div>
                <div class="auction-actions">
                    <button class="auction-accept" onclick="acceptBid(${i})">Продать за ₽${bestBid.price}</button>
                    ${currentBid < bids.length - 1 ? `<button class="auction-wait" onclick="waitForBetterBid(${i})">Подождать</button>` : ''}
                </div>
            </div>
        `;
    });
}

function acceptBid(slotIndex) {
    const auction = state.auctions[slotIndex];
    if (!auction) return;

    const bestBid = auction.bids[auction.currentBid];
    state.money += bestBid.price;
    state.stats.totalEarned += bestBid.price;
    state.stats.itemsSold++;

    // Check orders for auctioned item
    checkOrders([auction.item]);

    state.auctions[slotIndex] = null;

    SoundEngine.sell();
    renderAuctions();
    updateUI();
    showToast(`${bestBid.buyer} купил за ₽${bestBid.price}!`, 'money');
    submitLeaderboardScore();
    saveGame();
}

function waitForBetterBid(slotIndex) {
    const auction = state.auctions[slotIndex];
    if (!auction) return;

    // Risk: buyer might leave
    if (Math.random() < 0.3) {
        auction.bids.splice(auction.currentBid, 1);
        if (auction.bids.length === 0) {
            const item = auction.item;
            state.auctions[slotIndex] = null;
            addItemToGrid(item, true);
            showToast('Все покупатели ушли! Вещь вернулась на склад.', 'warning');
            renderAuctions();
            saveGame();
            return;
        }
        auction.currentBid = Math.min(auction.currentBid, auction.bids.length - 1);
    } else {
        auction.currentBid = Math.min(auction.currentBid + 1, auction.bids.length - 1);
    }
    auction.endTime = Date.now() + 30000;

    renderAuctions();
    showToast('Ждём лучшую ставку...', 'success');
    saveGame();
}

// ==========================================
// UPGRADES
// ==========================================

function openUpgradesModal() {
    updateUpgradesUI();
    $('upgrades-modal').classList.add('active');
}

function closeUpgradesModal() {
    $('upgrades-modal').classList.remove('active');
}

function updateUpgradesUI() {
    const { baleQuality, sellBonus, raiderSpeed } = state.upgrades;

    $('upgrade-bale-level').textContent = baleQuality.level;
    $('upgrade-bale-cost').textContent = baleQuality.cost;
    $('btn-upgrade-bale').disabled = state.money < baleQuality.cost;

    $('upgrade-sell-level').textContent = sellBonus.level;
    $('upgrade-sell-cost').textContent = sellBonus.cost;
    $('btn-upgrade-sell').disabled = state.money < sellBonus.cost;

    $('upgrade-raider-level').textContent = raiderSpeed.level;
    $('upgrade-raider-cost').textContent = raiderSpeed.cost;
    $('btn-upgrade-raider').disabled = state.money < raiderSpeed.cost;
}

function buyUpgrade(upgradeKey) {
    const upgrade = state.upgrades[upgradeKey];

    if (state.money < upgrade.cost) {
        showToast('Не хватает денег!', 'warning');
        return;
    }

    state.money -= upgrade.cost;
    upgrade.level++;
    upgrade.cost = Math.floor(upgrade.cost * 1.8);

    updateUI();
    updateUpgradesUI();
    showToast('Улучшение куплено!', 'success');
    saveGame();
}

// ==========================================
// EVENTS
// ==========================================

function maybeStartEvent() {
    const timeSinceLastEvent = Date.now() - state.lastEventTime;
    const minInterval = 3 * 60 * 1000;

    if (timeSinceLastEvent > minInterval && Math.random() < 0.3) {
        startEvent();
    }
}

function startEvent() {
    // Pick random event type
    const types = Object.keys(EVENT_TYPES);
    const eventType = types[Math.floor(Math.random() * types.length)];
    const eventInfo = EVENT_TYPES[eventType];

    state.event.active = true;
    state.event.type = eventType;
    state.event.endTime = Date.now() + eventInfo.duration;
    state.lastEventTime = Date.now();

    SoundEngine.eventStart();
    MusicManager.play('event');

    if (eventType === 'theft') {
        // Fill grid with free items
        const itemsToAdd = Math.min(10, countEmptyCells());
        for (let i = 0; i < itemsToAdd; i++) {
            const type = getRandomType();
            const grade = getRandomGrade({ 1: 40, 2: 35, 3: 20, 4: 5 });
            addItemToGrid(createItem(type, grade), true);
        }
    } else if (eventType === 'container') {
        // Add 5-8 items of grade 3+
        const itemsToAdd = Math.min(5 + Math.floor(Math.random() * 4), countEmptyCells());
        for (let i = 0; i < itemsToAdd; i++) {
            const type = getRandomType();
            const grade = getRandomGrade({ 3: 50, 4: 35, 5: 15 });
            addItemToGrid(createItem(type, grade), true);
        }
    }
    // market event just enables x2 sell — no items to add

    $('event-timer').classList.add('active');
    $('event-name').textContent = `${eventInfo.icon} ${eventInfo.name}`;
    $('event-overlay').classList.add('active');

    if (eventType === 'theft') {
        $('btn-event').style.display = 'flex';
        $('btn-event').className = 'btn btn-event';
        $('btn-event').querySelector('.btn-text').textContent = 'Воровство!';
    } else {
        $('btn-event').style.display = 'none';
    }

    renderGrid();
    showToast(`${eventInfo.icon} ${eventInfo.name}! ${eventInfo.description}`, 'event');
    saveGame();
}

function endEvent() {
    state.event.active = false;
    state.event.type = null;
    state.event.endTime = null;

    $('event-timer').classList.remove('active');
    $('event-overlay').classList.remove('active');
    $('btn-event').style.display = 'none';

    // Return to appropriate music
    const activeTab = document.querySelector('.tab.active');
    MusicManager.play(activeTab && activeTab.dataset.tab === 'auction' ? 'auction' : 'main');

    renderGrid();
    showToast('Ивент окончен!', 'event');
    saveGame();
}

function updateEventTimer() {
    if (!state.event.active) return;

    const remaining = Math.max(0, state.event.endTime - Date.now());

    if (remaining <= 0) {
        endEvent();
        return;
    }

    const seconds = Math.ceil(remaining / 1000);
    $('event-countdown').textContent = `00:${seconds.toString().padStart(2, '0')}`;
}

function grabEventItem() {
    const items = [];
    state.grid.forEach((item, idx) => {
        if (item) items.push(idx);
    });
    if (items.length === 0) return;
    const idx = items[Math.floor(Math.random() * items.length)];
    handleCellClick(idx);
}

// ==========================================
// ORDERS SYSTEM
// ==========================================

function generateOrder() {
    const types = ITEM_TYPE_KEYS;
    const type = types[Math.floor(Math.random() * types.length)];
    const grade = 2 + Math.floor(Math.random() * 3); // 2-4
    const quantity = 1 + Math.floor(Math.random() * 3); // 1-3
    const reward = GRADES[grade].basePrice * quantity * (1.5 + Math.random());

    return {
        type,
        grade,
        quantity,
        collected: 0,
        reward: Math.floor(reward),
        id: Date.now() + Math.random(),
    };
}

function initOrders() {
    while (state.orders.length < 3) {
        state.orders.push(generateOrder());
    }
}

function checkOrders(soldItems) {
    let ordersCompleted = 0;

    for (const sold of soldItems) {
        for (const order of state.orders) {
            if (order.collected >= order.quantity) continue;
            if (sold.type === order.type && sold.grade >= order.grade) {
                order.collected++;
            }
        }
    }

    // Check completed orders
    for (let i = state.orders.length - 1; i >= 0; i--) {
        const order = state.orders[i];
        if (order.collected >= order.quantity) {
            state.money += order.reward;
            state.stats.totalEarned += order.reward;
            ordersCompleted++;
            showToast(`Заказ выполнен! +₽${order.reward}`, 'money');
            state.orders.splice(i, 1);
        }
    }

    // Refill orders
    if (ordersCompleted > 0) {
        initOrders();
        renderOrders();
        updateUI();
        submitLeaderboardScore();
    }
}

function renderOrders() {
    const container = $('orders-list');
    if (!container) return;

    container.innerHTML = '';

    state.orders.forEach(order => {
        const el = document.createElement('div');
        el.className = 'order-card';
        const gradeName = GRADES[order.grade].name;
        const emoji = ITEM_TYPES[order.type].emoji;
        const progress = `${order.collected}/${order.quantity}`;
        el.innerHTML = `
            <div class="order-target">
                <span class="order-emoji">${emoji}</span>
                <div class="order-info">
                    <div class="order-desc">${ITEM_TYPES[order.type].name} (${gradeName}+)</div>
                    <div class="order-progress">${progress}</div>
                </div>
            </div>
            <div class="order-reward">₽${order.reward}</div>
        `;
        container.appendChild(el);
    });
}

// ==========================================
// STATS
// ==========================================

function renderStats() {
    $('stat-earned').textContent = formatNumber(state.stats.totalEarned);
    $('stat-sold').textContent = state.stats.itemsSold;
    $('stat-best-grade').textContent = GRADES[state.stats.bestGrade]?.name || '—';
    $('stat-bales').textContent = state.stats.balesOpened;
    $('stat-merges').textContent = state.stats.mergesDone;
}

// ==========================================
// TUTORIAL
// ==========================================

const TUTORIAL_STEPS = [
    {
        target: '#btn-quick-bale',
        text: 'Купи свой первый тюк!',
        arrow: 'up',
    },
    null, // wait for bale open, then advance
    {
        target: '#btn-sell-all',
        text: 'Нажми на одну вещь, потом на такую же — они объединятся!',
        arrow: 'none',
        highlightMergeTargets: true,
    },
    {
        target: '#btn-sell-all',
        text: 'Продай всё и заработай!',
        arrow: 'up',
    },
    {
        text: 'Отлично! Теперь ты знаешь основы.\nМержи вещи, повышай грейд, зарабатывай!',
        final: true,
    },
];

function startTutorial() {
    if (state.tutorialComplete) return;
    state.tutorialStep = 0;
    showTutorialStep();
}

function showTutorialStep() {
    removeTutorialOverlay();

    const stepData = TUTORIAL_STEPS[state.tutorialStep];
    if (!stepData) return;

    const overlay = document.createElement('div');
    overlay.id = 'tutorial-overlay';

    if (stepData.final) {
        overlay.innerHTML = `
            <div class="tutorial-final">
                <div class="tutorial-text">${stepData.text}</div>
                <button class="tutorial-btn" id="tutorial-finish">Понял!</button>
            </div>
        `;
        document.body.appendChild(overlay);
        $('tutorial-finish').addEventListener('click', () => {
            state.tutorialComplete = true;
            removeTutorialOverlay();
            saveGame();
        });
        return;
    }

    overlay.innerHTML = `<div class="tutorial-hint">${stepData.text}</div>`;

    if (stepData.target) {
        const targetEl = document.querySelector(stepData.target);
        if (targetEl) {
            targetEl.classList.add('tutorial-highlight');
        }
    }

    document.body.appendChild(overlay);

    // For step 0, clicking overlay or bale button advances
    if (state.tutorialStep === 0) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                // ignore clicks on overlay bg
            }
        });
    }
}

function advanceTutorial() {
    state.tutorialStep++;
    if (state.tutorialStep >= TUTORIAL_STEPS.length) {
        state.tutorialComplete = true;
        removeTutorialOverlay();
        saveGame();
        return;
    }
    showTutorialStep();
}

function removeTutorialOverlay() {
    const overlay = $('tutorial-overlay');
    if (overlay) overlay.remove();
    $$('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
}

// ==========================================
// OFFLINE INCOME
// ==========================================

function checkOfflineIncome(lastSaveTime) {
    const elapsed = Date.now() - lastSaveTime;
    const seconds = Math.floor(elapsed / 1000);

    if (seconds < 60) return; // Less than a minute

    const baseRate = 1; // ₽1/sec
    const tradeMultiplier = state.upgrades.sellBonus.level;
    const income = seconds * baseRate * tradeMultiplier;

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    let timeStr = '';
    if (hours > 0) timeStr += `${hours}ч `;
    if (minutes > 0) timeStr += `${minutes}м`;
    if (!timeStr) timeStr = `${seconds}с`;

    showOfflinePopup(timeStr.trim(), income);
}

function showOfflinePopup(timeStr, income) {
    const popup = document.createElement('div');
    popup.id = 'offline-popup';
    popup.innerHTML = `
        <div class="offline-content">
            <div class="offline-icon">💤</div>
            <div class="offline-title">Пока тебя не было</div>
            <div class="offline-time">${timeStr}</div>
            <div class="offline-text">Байеры заработали</div>
            <div class="offline-amount">₽${formatNumber(income)}</div>
            <button class="offline-btn" id="offline-collect">Забрать</button>
            <button class="offline-btn offline-x2" id="offline-x2">x2 за рекламу</button>
        </div>
    `;
    document.body.appendChild(popup);

    $('offline-collect').addEventListener('click', () => {
        state.money += income;
        state.stats.totalEarned += income;
        updateUI();
        saveGame();
        popup.remove();
    });

    $('offline-x2').addEventListener('click', () => {
        // Placeholder for rewarded ad via Yandex SDK
        // When real ad is integrated, call onAdOpen() before showing,
        // then onAdClose()/onAdError() in callbacks
        onAdOpen();
        // Simulate ad completion
        setTimeout(() => {
            onAdClose();
            const doubled = income * 2;
            state.money += doubled;
            state.stats.totalEarned += doubled;
            updateUI();
            saveGame();
            showToast(`+₽${formatNumber(doubled)} (x2)!`, 'money');
            popup.remove();
        }, 300);
    });
}

// ==========================================
// AD HELPERS (Yandex SDK requirement: mute all audio during ads)
// ==========================================

function onAdOpen() {
    SoundEngine.muted = true;
    MusicManager.pauseAll();
}

function onAdClose() {
    const muted = MusicManager.isMuted();
    SoundEngine.muted = muted;
    MusicManager.resumeAll();
}

function onAdError() {
    onAdClose(); // Same cleanup
}

// ==========================================
// GAME LOOP
// ==========================================

function startGameLoop() {
    setInterval(() => {
        updateRaiderProgress();
        updateEventTimer();
        renderAuctions();

        // Random event check
        if (!state.event.active && Math.random() < 0.001) {
            maybeStartEvent();
        }
    }, 1000);
}

// ==========================================
// UI
// ==========================================

function updateUI() {
    $('money-value').textContent = formatNumber(state.money);

    // Update bale buttons
    $$('.bale-btn').forEach(btn => {
        const bale = BALES[btn.dataset.bale];
        btn.disabled = state.money < bale.price;
    });
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    $('toast-container').appendChild(toast);
    setTimeout(() => toast.remove(), 2300);
}

// ==========================================
// SAVE/LOAD
// ==========================================

function saveGame() {
    const data = {
        money: state.money,
        grid: state.grid,
        raiders: state.raiders,
        auctions: state.auctions,
        upgrades: state.upgrades,
        lastEventTime: state.lastEventTime,
        tutorialComplete: state.tutorialComplete,
        tutorialStep: state.tutorialStep,
        stats: state.stats,
        orders: state.orders,
        lastSaveTime: Date.now(),
    };
    localStorage.setItem('svalka_save', JSON.stringify(data));
}

function loadGame() {
    try {
        const saved = localStorage.getItem('svalka_save');
        if (saved) {
            const data = JSON.parse(saved);
            state.money = data.money || 500;
            state.grid = data.grid || Array(30).fill(null);
            state.raiders = data.raiders || state.raiders;
            state.auctions = data.auctions || [null, null];
            state.upgrades = data.upgrades || state.upgrades;
            state.lastEventTime = data.lastEventTime || 0;
            state.tutorialComplete = data.tutorialComplete || false;
            state.tutorialStep = data.tutorialStep || 0;
            state.stats = data.stats || state.stats;
            state.orders = data.orders || [];
            state.lastSaveTime = data.lastSaveTime || Date.now();

            // Update raider statuses
            state.raiders.forEach((raider, id) => {
                if (raider.status === 'busy' && raider.endTime && Date.now() >= raider.endTime) {
                    raider.status = 'ready';
                }
                updateRaiderUI(id);
            });

            // Handle expired auctions
            state.auctions.forEach((auction, i) => {
                if (auction && auction.endTime && Date.now() >= auction.endTime) {
                    auction.endTime = Date.now() + 30000;
                }
            });

            renderGrid();
            renderAuctions();

            // Init orders if needed
            initOrders();
            renderOrders();
            renderStats();

            // Check offline income
            if (data.lastSaveTime) {
                checkOfflineIncome(data.lastSaveTime);
            }
        } else {
            // First launch — start tutorial
            initOrders();
            renderOrders();
            renderStats();
            setTimeout(() => startTutorial(), 500);
        }
    } catch (e) {
        console.error('Load failed:', e);
    }
}

// ==========================================
// START
// ==========================================

document.addEventListener('DOMContentLoaded', init);
