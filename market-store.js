import { db, appId, recalculateOVR, generatePlayerName, POSITIONS, RICH_CLUBS } from './firebase-config.js';
import { showLoading, hideLoading, showToast } from './ui-helpers.js';
import { doc, setDoc, deleteDoc, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { gameState, POS_COLORS, POS_ORDER, STORE_ITEMS, assignRandomTrait, getRarityClass, playHaptic, updateHeaderDisplay, pushNews } from './state.js';

let pendingGachaPlayer = null;

export function generateMarketPlayers() {
    gameState.currentMarketList = [];
    for (let i = 0; i < 8; i++) {
        const isStar = Math.random() > 0.8;
        const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
        const ovr = isStar ? Math.floor(Math.random() * 15) + 80 : Math.floor(Math.random() * 20) + 50;
        const val = ovr * (isStar ? 150000 : 80000);
        let stats = { PAC: ovr, SHO: ovr, PAS: ovr, DRI: ovr, DEF: ovr, PHY: ovr };
        const age = isStar ? Math.floor(Math.random() * 5) + 25 : Math.floor(Math.random() * 12) + 18;

        gameState.currentMarketList.push({
            id: 'market_' + Date.now() + i,
            name: generatePlayerName(isStar),
            pos: pos,
            ovr: ovr,
            value: val,
            stats: stats,
            bonusStats: { PAC: 0, SHO: 0, PAS: 0, DRI: 0, DEF: 0, PHY: 0 },
            stamina: 100,
            injury: 0,
            age: age,
            isListed: false,
            itemsUsed: 0,
            trait: assignRandomTrait(pos, ovr)
        });
    }
    gameState.currentMarketList.sort(function(a, b) {
        return POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ovr - a.ovr;
    });
}

export function renderTransferMarket() {
    if (gameState.currentMarketList.length === 0) generateMarketPlayers();
    const tbody = document.getElementById('market-list-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    gameState.currentMarketList.forEach(function(p) {
        let isPending = gameState.leagueState.pendingBuys?.find(function(b) { return b.marketId === p.id; });
        const rarity = getRarityClass(p.ovr);

        tbody.innerHTML += `<tr class="hover:bg-slate-700/50 transition-colors">
            <td class="p-3 text-center whitespace-nowrap"><span class="${POS_COLORS[p.pos]} text-white text-[10px] md:text-xs font-bold px-1.5 md:px-2 py-1 rounded w-10 md:w-12 inline-block text-center">${p.pos}</span></td>
            <td class="p-3 font-medium text-white min-w-[150px]"><div class="whitespace-nowrap">${p.name} <span class="text-[10px] text-slate-400 font-normal ml-1">(${p.age || 20}T)</span> ${p.ovr >= 85 ? '<span class="text-[9px] text-yellow-400 ml-1">(Fame > 60)</span>' : ''}</div></td>
            <td class="p-3 text-center font-bold whitespace-nowrap ${rarity.text}">${p.ovr}</td>
            <td class="p-3 text-right text-yellow-400 whitespace-nowrap">€${p.value.toLocaleString()}</td>
            <td class="p-3 text-center whitespace-nowrap">${isPending ? `<button disabled class="bg-slate-700 text-slate-400 text-[10px] md:text-xs px-2 md:px-3 py-1.5 rounded font-bold cursor-not-allowed">Chờ</button>` : `<button onclick="window.makeBuyOffer('${p.id}')" class="bg-blue-600 hover:bg-blue-500 text-white text-[10px] md:text-xs px-2 md:px-3 py-1.5 rounded font-bold shadow transition">Mua</button>`}</td>
        </tr>`;
    });
}

export async function makeBuyOffer(marketId) {
    const p = gameState.currentMarketList.find(function(x) { return x.id === marketId; });
    if (!p) return;
    if (p.ovr >= 85 && gameState.myFame < 60) { showToast(`Cần Fame > 60 để đàm phán!`, "error"); return; }
    if (gameState.globalPlayersList.length + (gameState.leagueState.pendingBuys?.length || 0) >= 25) { showToast("Đội hình đã đầy!"); return; }

    const oStr = prompt(`Đề nghị mua ${p.name} (Gốc: €${p.value.toLocaleString()}):`, p.value);
    if (oStr === null) return;
    const bidAmount = parseInt(oStr.replace(/,/g, ''));
    if (isNaN(bidAmount) || bidAmount <= 0) { showToast("Giá không hợp lệ!"); return; }
    if (gameState.myBudget < bidAmount) { showToast("Không đủ ngân sách!"); return; }

    showLoading("ĐANG GỬI FAX...");
    try {
        gameState.myBudget -= bidAmount;
        updateHeaderDisplay();
        await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), { budget: gameState.myBudget }, { merge: true });
        if (!gameState.leagueState.pendingBuys) gameState.leagueState.pendingBuys = [];
        gameState.leagueState.pendingBuys.push({ marketId: p.id, playerInfo: p, bidAmount: bidAmount });
        await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'league', 'state'), gameState.leagueState);
        renderTransferMarket();
        showToast(`Đã gửi Fax mua ${p.name}!`, "success");
    } catch (e) {
        showToast("Lỗi!");
    } finally {
        hideLoading();
    }
}

export async function listPlayerForSale() {
    if (!gameState.currentlyViewingPlayerId) return;
    const p = gameState.globalPlayersMap[gameState.currentlyViewingPlayerId];
    if (!p || p.isListed) return;

    const aStr = prompt(`Giá bán cho ${p.name} (Gốc: €${(p.value).toLocaleString()}):`, p.value);
    if (aStr === null) return;
    const askAmount = parseInt(aStr.replace(/,/g, ''));
    if (isNaN(askAmount) || askAmount <= 0) { showToast("Giá sai!"); return; }

    showLoading("ĐANG RAO BÁN...");
    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'players', p.id), { isListed: true }, { merge: true });
        p.isListed = true;
        if (!gameState.leagueState.pendingSells) gameState.leagueState.pendingSells = [];
        gameState.leagueState.pendingSells.push({ playerId: p.id, playerName: p.name, askAmount: askAmount, baseValue: p.value });
        await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'league', 'state'), gameState.leagueState);
        document.getElementById('player-detail-modal').classList.add('hidden');
        if (gameState.activeSubView === 'squad-list' && typeof window.renderSquadList === 'function') window.renderSquadList();
        showToast(`Đã rao bán ${p.name}!`, "success");
    } catch (e) {
        showToast("Lỗi!");
    } finally {
        hideLoading();
    }
}

export async function terminateContract() {
    if (!gameState.currentlyViewingPlayerId) return;
    const p = gameState.globalPlayersMap[gameState.currentlyViewingPlayerId];
    if (!p) return;

    const penaltyFee = Math.floor(p.value * (0.10 + (Math.random() * 0.05)));
    if (gameState.myBudget < penaltyFee) { showToast(`Cần €${penaltyFee.toLocaleString()} đền bù hợp đồng!`, "error"); return; }

    if (confirm(`ĐUỔI ${p.name}? Phạt: -€${penaltyFee.toLocaleString()}`)) {
        showLoading("ĐANG ĐỀN BÙ...");
        try {
            document.getElementById('player-detail-modal').classList.add('hidden');
            gameState.myBudget -= penaltyFee;
            updateHeaderDisplay();
            await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), { budget: gameState.myBudget }, { merge: true });
            await deleteDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'players', p.id));

            gameState.globalPlayersList = gameState.globalPlayersList.filter(function(x) { return x.id !== p.id; });
            delete gameState.globalPlayersMap[p.id];
            gameState.startingXI = gameState.startingXI.map(function(id) { return id === p.id ? null : id; });
            await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'tactics'), {
                formation: gameState.currentFormation, startingXI: gameState.startingXI
            });

            if (gameState.leagueState.pendingSells) {
                gameState.leagueState.pendingSells = gameState.leagueState.pendingSells.filter(function(x) { return x.playerId !== p.id; });
                await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'league', 'state'), gameState.leagueState);
            }
            if (gameState.activeSubView === 'squad-list' && typeof window.renderSquadList === 'function') window.renderSquadList();
            if (typeof window.renderPitch === 'function') window.renderPitch();
            showToast(`Đã thanh lý ${p.name}.`, "warning");
        } catch (e) {
            showToast("Lỗi!");
        } finally {
            hideLoading();
        }
    }
}

export function renderStore() {
    const container = document.getElementById('store-items-container');
    if (!container) return;
    container.innerHTML = '';
    STORE_ITEMS.forEach(function(item) {
        container.innerHTML += `<div class="bg-slate-800/80 border border-slate-700 rounded-xl p-6 shadow-lg flex flex-col justify-between hover:border-indigo-500/50 transition-colors"><div><div class="text-4xl mb-3">${item.icon}</div><h3 class="text-xl font-bold text-white mb-1">${item.name}</h3><p class="text-slate-400 text-sm mb-4">${item.desc}</p></div><div><div class="text-yellow-400 font-bold mb-3 text-lg">€${item.price.toLocaleString()}</div><button onclick="window.buyItem('${item.id}')" class="w-full py-2 ${item.type === 'gacha' ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-indigo-600 hover:bg-indigo-500'} text-white font-bold rounded-lg transition shadow-lg">${item.type === 'gacha' ? 'Mở Gói Ngay' : 'Mua & Sử dụng'}</button></div></div>`;
    });
}

export async function buyItem(itemId) {
    const item = STORE_ITEMS.find(function(x) { return x.id === itemId; });
    if (!item) return;
    if (gameState.myBudget < item.price) { showToast("Không đủ ngân sách!", "error"); return; }

    if (item.type === 'gacha') {
        if (gameState.globalPlayersList.length + (gameState.leagueState.pendingBuys?.length || 0) >= 25) { showToast("Đội hình đã đầy!"); return; }
        if (confirm(`Chi €${item.price.toLocaleString()} gọi Tuyển trạch viên tìm tài năng trẻ?`)) {
            showLoading("ĐANG LÙNG SỤC...");
            try {
                playHaptic('light');
                gameState.myBudget -= item.price;
                updateHeaderDisplay();
                await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), { budget: gameState.myBudget }, { merge: true });

                const ovr = Math.floor(Math.random() * 16) + 60;
                const randomPos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
                let stats = { PAC: ovr + 2, SHO: ovr - 2, PAS: ovr + 1, DRI: ovr, DEF: ovr, PHY: ovr };
                const age = Math.floor(Math.random() * 4) + 17;

                pendingGachaPlayer = {
                    name: generatePlayerName(false),
                    pos: randomPos,
                    ovr: recalculateOVR(randomPos, stats),
                    stats: stats,
                    bonusStats: { PAC: 0, SHO: 0, PAS: 0, DRI: 0, DEF: 0, PHY: 0 },
                    stamina: 100,
                    injury: 0,
                    age: age,
                    value: ovr * 70000,
                    isListed: false,
                    itemsUsed: 0,
                    trait: assignRandomTrait(randomPos, Math.floor(Math.random() * 16) + 60)
                };

                const modal = document.getElementById('gacha-modal');
                const innerCard = document.getElementById('gacha-card-inner');
                const resultFace = document.getElementById('gacha-result-face');
                if (!modal || !innerCard || !resultFace) {
                    throw new Error("Thiếu HTML Modal Gacha trong index.html");
                }

                innerCard.classList.remove('rotate-y-180');
                document.getElementById('close-gacha-btn').classList.add('hidden');

                const rarity = getRarityClass(pendingGachaPlayer.ovr);
                resultFace.className = `absolute inset-0 backface-hidden rotate-y-180 rounded-2xl border-4 ${rarity.border} ${rarity.cardBg} flex flex-col items-center justify-center overflow-hidden`;
                resultFace.innerHTML = `
                    <div class="text-[80px] absolute -top-4 -left-2 text-white/10 font-black pointer-events-none">${pendingGachaPlayer.pos}</div>
                    <img src="https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(pendingGachaPlayer.name.replace(/⭐/g, '').trim())}&backgroundColor=transparent" class="w-32 h-32 object-cover object-top drop-shadow-xl z-10" />
                    <div class="text-6xl font-black ${rarity.text} drop-shadow-lg z-10 mt-2">${pendingGachaPlayer.ovr}</div>
                    <div class="text-white font-bold tracking-wider text-xl uppercase mt-1 px-2 text-center z-10">${pendingGachaPlayer.name}</div>
                    <div class="bg-black/50 text-white/70 text-xs px-3 py-1 rounded-full mt-3 font-bold tracking-widest uppercase z-10">${pendingGachaPlayer.pos}</div>
                `;

                hideLoading();
                modal.classList.remove('hidden');
                void modal.offsetWidth;
                modal.classList.remove('opacity-0');
                modal.classList.add('opacity-100');
            } catch (e) {
                showToast("Lỗi: " + e.message, "error");
                hideLoading();
            }
        }
    } else {
        playHaptic('light');
        gameState.currentItemToApply = item;
        document.getElementById('apply-item-name').textContent = item.name;
        const c = document.getElementById('apply-item-list-container');
        c.innerHTML = '';
        [...gameState.globalPlayersList].sort(function(a, b) { return b.ovr - a.ovr; }).forEach(function(p) {
            const canUse = (p.itemsUsed || 0) < 5;
            c.innerHTML += `<div class="flex justify-between items-center p-3 hover:bg-slate-700/50 border-b border-slate-700/50 rounded ${canUse ? 'cursor-pointer' : 'opacity-50 grayscale'}" ${canUse ? `onclick="window.applyItemToPlayer('${p.id}')"` : ''}><div><div class="text-white font-medium">${p.name}</div><div class="text-xs text-indigo-300">Đã dùng: ${(p.itemsUsed || 0)}/5</div></div><div class="text-right"><div class="text-green-400 font-bold">OVR ${p.ovr}</div>${!canUse ? `<div class="text-red-400 text-xs">Đạt giới hạn</div>` : ''}</div></div>`;
        });
        document.getElementById('apply-item-modal').classList.remove('hidden');
    }
}

export function flipGachaCard() {
    const innerCard = document.getElementById('gacha-card-inner');
    if (innerCard.classList.contains('rotate-y-180')) return;
    playHaptic('heavy');
    innerCard.classList.add('rotate-y-180');
    document.getElementById('gacha-title').textContent = "CHÀO MỪNG TÂN BINH!";
    setTimeout(function() {
        document.getElementById('close-gacha-btn').classList.remove('hidden');
    }, 700);
}

export async function closeGachaModal() {
    if (!pendingGachaPlayer) return;
    const modal = document.getElementById('gacha-modal');
    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0');

    showLoading("ĐANG KÝ HỢP ĐỒNG...");
    try {
        const newPlayerRef = doc(collection(db, 'artifacts', appId, 'users', gameState.currentUserId, 'players'));
        await setDoc(newPlayerRef, pendingGachaPlayer);
        pendingGachaPlayer.id = newPlayerRef.id;
        gameState.globalPlayersList.push(pendingGachaPlayer);
        gameState.globalPlayersMap[pendingGachaPlayer.id] = pendingGachaPlayer;
        pendingGachaPlayer = null;
        showToast(`Đã chiêu mộ thành công!`, 'success');
    } catch (e) {
        showToast("Lỗi khi lưu cầu thủ!");
    } finally {
        hideLoading();
        setTimeout(function() { modal.classList.add('hidden'); }, 500);
    }
}

export function closeApplyItemModal() {
    document.getElementById('apply-item-modal').classList.add('hidden');
    gameState.currentItemToApply = null;
}

export async function applyItemToPlayer(playerId) {
    const p = gameState.globalPlayersMap[playerId];
    const item = gameState.currentItemToApply;
    if (!p || !item) return;
    if (gameState.myBudget < item.price) { showToast("Không đủ tiền!", "error"); return; }

    if (confirm(`Dùng [${item.name}] cho ${p.name}?`)) {
        showLoading("ĐANG ÁP DỤNG...");
        try {
            closeApplyItemModal();
            gameState.myBudget -= item.price;
            updateHeaderDisplay();
            await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), { budget: gameState.myBudget }, { merge: true });

            if (!p.bonusStats) p.bonusStats = { PAC: 0, SHO: 0, PAS: 0, DRI: 0, DEF: 0, PHY: 0 };
            if (item.type === 'stat') {
                p.stats[item.stat] += item.amount;
                p.bonusStats[item.stat] = (p.bonusStats[item.stat] || 0) + item.amount;
                if (p.stats[item.stat] > 99) {
                    p.bonusStats[item.stat] -= (p.stats[item.stat] - 99);
                    p.stats[item.stat] = 99;
                }
            } else if (item.type === 'stat_multi') {
                for (const [k, v] of Object.entries(item.stats)) {
                    p.stats[k] += v;
                    p.bonusStats[k] = (p.bonusStats[k] || 0) + v;
                    if (p.stats[k] > 99) {
                        p.bonusStats[k] -= (p.stats[k] - 99);
                        p.stats[k] = 99;
                    }
                }
            }
            p.ovr = recalculateOVR(p.pos, p.stats);
            p.value = p.ovr * 100000;
            p.itemsUsed = (p.itemsUsed || 0) + 1;

            await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'players', p.id), {
                stats: p.stats, bonusStats: p.bonusStats, ovr: p.ovr, value: p.value, itemsUsed: p.itemsUsed
            }, { merge: true });
            if (typeof window.renderPitch === 'function') window.renderPitch();
            showToast(`OVR của ${p.name} tăng thành ${p.ovr}!`, 'success');
        } catch (e) {
            showToast("Lỗi!");
        } finally {
            hideLoading();
        }
    }
}

export async function processTransferMarket() {
    let budgetRefunded = 0;
    let budgetEarned = 0;

    if (gameState.leagueState.pendingBuys && gameState.leagueState.pendingBuys.length > 0) {
        for (let b of gameState.leagueState.pendingBuys) {
            let p = b.playerInfo;
            let bidRatio = b.bidAmount / p.value;
            let fameFactor = gameState.myFame / 100;
            let successChance = (bidRatio * 0.5) + (fameFactor * 0.5);
            let hijackRng = Math.random();

            if (hijackRng <= successChance) {
                const newPlayerRef = doc(collection(db, 'artifacts', appId, 'users', gameState.currentUserId, 'players'));
                p.isListed = false;
                p.itemsUsed = 0;
                p.stamina = 100;
                p.injury = 0;
                await setDoc(newPlayerRef, p);
                p.id = newPlayerRef.id;
                gameState.globalPlayersList.push(p);
                gameState.globalPlayersMap[p.id] = p;
                pushNews(`Thương vụ ${p.name} Hoàn Tất`, `Câu lạc bộ đã chiêu mộ thành công ${p.name} với mức giá €${b.bidAmount.toLocaleString()}.`, true);
            } else {
                let randomClub = RICH_CLUBS[Math.floor(Math.random() * RICH_CLUBS.length)];
                budgetRefunded += b.bidAmount;
                pushNews(`Mua ${p.name} Đổ Vỡ`, `Rất tiếc! Thương vụ đổ vỡ do **${randomClub}** nẫng tay trên. Hoàn €${b.bidAmount.toLocaleString()} về quỹ.`, false);
            }
        }
        gameState.leagueState.pendingBuys = [];
    }

    if (gameState.leagueState.pendingSells && gameState.leagueState.pendingSells.length > 0) {
        let remainingSells = [];
        for (let s of gameState.leagueState.pendingSells) {
            let botOffer = Math.floor(s.baseValue * (0.7 + Math.random() * 0.5));
            if (botOffer >= s.askAmount) {
                budgetEarned += botOffer;
                let currentNames = gameState.leagueState.standings.map(function(t) { return t.name; });
                let randomBot = currentNames[Math.floor(Math.random() * currentNames.length)];
                await deleteDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'players', s.playerId));
                gameState.globalPlayersList = gameState.globalPlayersList.filter(function(x) { return x.id !== s.playerId; });
                delete gameState.globalPlayersMap[s.playerId];
                gameState.startingXI = gameState.startingXI.map(function(id) { return id === s.playerId ? null : id; });
                pushNews(`Bán ${s.playerName} Thành Công`, `${randomBot} đã mua ${s.playerName} với giá €${botOffer.toLocaleString()}. Tiền đã chuyển vào ngân sách.`, true);
            } else {
                remainingSells.push(s);
                pushNews(`Ế ẩm: ${s.playerName}`, `Chưa có đối tác trả giá hợp lý cho ${s.playerName}. Cầu thủ vẫn đang nằm trên danh sách chờ bán.`, null);
            }
        }
        gameState.leagueState.pendingSells = remainingSells;
    }

    generateMarketPlayers();
    gameState.myBudget = gameState.myBudget + budgetRefunded + budgetEarned;
    updateHeaderDisplay();
}

export function initMarketStoreListeners() {
    document.getElementById('tab-transfer-market')?.addEventListener('click', function() {
        document.getElementById('transfer-market-section').classList.remove('hidden');
        document.getElementById('store-section').classList.add('hidden');
        document.getElementById('tab-transfer-market').className = "px-3 py-1.5 font-bold text-green-400 border-b-2 border-green-400 whitespace-nowrap";
        document.getElementById('tab-store').className = "px-3 py-1.5 font-medium text-slate-400 hover:text-white transition whitespace-nowrap";
        renderTransferMarket();
    });

    document.getElementById('tab-store')?.addEventListener('click', function() {
        document.getElementById('transfer-market-section').classList.add('hidden');
        document.getElementById('store-section').classList.remove('hidden');
        document.getElementById('tab-transfer-market').className = "px-3 py-1.5 font-medium text-slate-400 hover:text-white transition whitespace-nowrap";
        document.getElementById('tab-store').className = "px-3 py-1.5 font-bold text-green-400 border-b-2 border-green-400 whitespace-nowrap";
        renderStore();
    });

    document.getElementById('refresh-market-btn')?.addEventListener('click', async function() {
        if (gameState.myBudget < 10000) { showToast("Không đủ €10,000!", "error"); return; }
        if (confirm("Chi €10,000 tìm lứa cầu thủ mới?")) {
            showLoading("ĐANG TÌM...");
            try {
                gameState.myBudget -= 10000;
                updateHeaderDisplay();
                await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), { budget: gameState.myBudget }, { merge: true });
                generateMarketPlayers();
                renderTransferMarket();
                showToast("Đã làm mới TTCN!", "success");
            } catch (e) {
                showToast("Lỗi!");
            } finally {
                hideLoading();
            }
        }
    });
}
