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
    event: { active: false, endTime: null },
    lastEventTime: 0,
};

// ==========================================
// HELPERS
// ==========================================

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

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
    loadGame();
    updateUI();
    startGameLoop();
    
    // Check for event
    maybeStartEvent();
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
        
        if (state.event.active) cell.classList.add('event-mode');
        
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
    // Event mode - grab item for free!
    if (state.event.active && state.grid[index]) {
        const item = state.grid[index];
        const value = GRADES[item.grade].basePrice;
        state.money += value;
        state.grid[index] = null;
        showToast(`🔥 Украдено! +₽${value}`, 'event');
        renderGrid();
        updateUI();
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
                saveGame();
            }
        }, i * 100);
    }
}

// ==========================================
// SELLING
// ==========================================

function sellAll() {
    let total = 0;
    let count = 0;
    
    const sellMultiplier = 1 + (state.upgrades.sellBonus.level - 1) * 0.2;
    
    for (let i = 0; i < 30; i++) {
        const item = state.grid[i];
        if (item) {
            total += Math.floor(GRADES[item.grade].basePrice * sellMultiplier);
            count++;
            state.grid[i] = null;
        }
    }
    
    if (count === 0) {
        showToast('Нечего продавать!', 'warning');
        return;
    }
    
    state.money += total;
    state.selectedCell = null;
    renderGrid();
    updateUI();
    showToast(`+₽${total} за ${count} вещей`, 'money');
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

    // Add items with staggered animation to avoid N full re-renders
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
        endTime: Date.now() + 30000, // 30 seconds per bid round
    };
    
    renderAuctions();
    saveGame();
}

function generateBids(basePrice) {
    const bids = [];
    const numBids = 2 + Math.floor(Math.random() * 3);
    
    for (let i = 0; i < numBids; i++) {
        const multiplier = 0.7 + Math.random() * 0.8; // 70% - 150% of base
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
                    <div class="auction-timer">⏱️ ${remaining}с до следующей ставки</div>
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
    state.auctions[slotIndex] = null;
    
    renderAuctions();
    updateUI();
    showToast(`${bestBid.buyer} купил за ₽${bestBid.price}!`, 'money');
    saveGame();
}

function waitForBetterBid(slotIndex) {
    const auction = state.auctions[slotIndex];
    if (!auction) return;
    
    // Risk: buyer might leave
    if (Math.random() < 0.3) {
        auction.bids.splice(auction.currentBid, 1);
        if (auction.bids.length === 0) {
            // Everyone left!
            const item = auction.item;
            state.auctions[slotIndex] = null;
            addItemToGrid(item, true);
            showToast('Все покупатели ушли! Вещь вернулась на склад.', 'warning');
            renderAuctions();
            saveGame();
            return;
        }
        // After splice, currentBid already points to the next bidder
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
    showToast('Улучшение куплено! ⬆️', 'success');
    saveGame();
}

// ==========================================
// EVENT: День воровства
// ==========================================

function maybeStartEvent() {
    // Event every 3-5 minutes
    const timeSinceLastEvent = Date.now() - state.lastEventTime;
    const minInterval = 3 * 60 * 1000;
    
    if (timeSinceLastEvent > minInterval && Math.random() < 0.3) {
        startEvent();
    }
}

function startEvent() {
    state.event.active = true;
    state.event.endTime = Date.now() + 30000; // 30 seconds
    state.lastEventTime = Date.now();
    
    // Fill grid with free items!
    const itemsToAdd = Math.min(10, countEmptyCells());
    for (let i = 0; i < itemsToAdd; i++) {
        const type = getRandomType();
        const grade = getRandomGrade({ 1: 40, 2: 35, 3: 20, 4: 5 });
        addItemToGrid(createItem(type, grade), true);
    }
    
    $('event-timer').classList.add('active');
    $('event-overlay').classList.add('active');
    $('btn-event').style.display = 'flex';
    $('btn-event').className = 'btn btn-event';
    
    renderGrid();
    showToast('🔥 ДЕНЬ ВОРОВСТВА! Хватай всё бесплатно!', 'event');
    saveGame();
}

function endEvent() {
    state.event.active = false;
    state.event.endTime = null;
    
    $('event-timer').classList.remove('active');
    $('event-overlay').classList.remove('active');
    $('btn-event').style.display = 'none';
    
    renderGrid();
    showToast('День воровства окончен!', 'event');
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
    // Find random item and grab it
    const items = [];
    state.grid.forEach((item, idx) => {
        if (item) items.push(idx);
    });
    
    if (items.length === 0) return;
    
    const idx = items[Math.floor(Math.random() * items.length)];
    handleCellClick(idx);
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
        }
    } catch (e) {
        console.error('Load failed:', e);
    }
}

// ==========================================
// START
// ==========================================

document.addEventListener('DOMContentLoaded', init);
