import { db, appId, recalculateOVR } from './firebase-config.js';
import { showLoading, hideLoading, showToast } from './ui-helpers.js';
import { doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { gameState, POS_COLORS, POS_ORDER, getRarityClass, playHaptic, updateHeaderDisplay, calcTeamPower, pushNews } from './state.js';

let playerChartInstance = null;
let currentFuseTargetId = null;

export function renderSquadList() {
    const tbody = document.getElementById('squad-list-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    [...gameState.globalPlayersList].sort(function(a, b) {
        return (POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ovr - a.ovr);
    }).forEach(function(p) {
        let statusHtml = p.isListed
            ? '<span class="text-[10px] md:text-xs bg-red-900 text-red-300 px-1 md:px-2 py-1 rounded inline-block whitespace-nowrap w-14 text-center">Chờ bán</span>'
            : (gameState.myFacilities.medicalSlots.includes(p.id)
                ? '<span class="text-[10px] md:text-xs bg-yellow-900 text-yellow-300 px-1 md:px-2 py-1 rounded inline-block whitespace-nowrap w-14 text-center">🏥 Y tế</span>'
                : (gameState.myFacilities.trainingSlots.includes(p.id)
                    ? '<span class="text-[10px] md:text-xs bg-blue-900 text-blue-300 px-1 md:px-2 py-1 rounded inline-block whitespace-nowrap w-14 text-center">🏋️ Tập</span>'
                    : (gameState.startingXI.includes(p.id)
                        ? '<span class="text-[10px] md:text-xs bg-green-900 text-green-300 px-1 md:px-2 py-1 rounded inline-block whitespace-nowrap w-14 text-center">⚽ Sân</span>'
                        : '<span class="text-[10px] md:text-xs bg-slate-700 text-slate-300 px-1 md:px-2 py-1 rounded inline-block whitespace-nowrap w-14 text-center">🪑 Dự bị</span>')));

        const stColor = p.injury > 0 ? 'text-red-500 font-bold' : (p.stamina >= 80 ? 'text-green-400' : (p.stamina >= 50 ? 'text-yellow-400' : 'text-red-400'));
        const stBg = p.stamina >= 80 ? 'bg-green-400' : (p.stamina >= 50 ? 'bg-yellow-400' : 'bg-red-500');
        const rarity = getRarityClass(p.ovr);

        tbody.innerHTML += `<tr class="hover:bg-slate-700/50 transition-colors cursor-pointer" onclick="window.openPlayerDetail('${p.id}')">
            <td class="p-3 text-center whitespace-nowrap"><span class="${POS_COLORS[p.pos]} text-white text-[10px] md:text-xs font-bold px-1.5 md:px-2 py-1 rounded w-10 md:w-12 inline-block text-center">${p.pos}</span></td>
            <td class="p-3 font-medium text-white min-w-[150px]"><div class="whitespace-nowrap truncate max-w-[120px] md:max-w-[200px]">${p.name} <span class="text-[10px] text-slate-400 font-normal ml-1">(${p.age || 20}T)</span></div></td>
            <td class="p-3 text-center whitespace-nowrap"><div class="flex flex-col items-center gap-1 text-[9px] md:text-[10px] ${stColor}"><span>${p.injury > 0 ? '🚑 Chấn thương' : `⚡ ${p.stamina}%`}</span>${p.injury > 0 ? '' : `<div class="w-12 bg-slate-700 h-1 rounded-full overflow-hidden hidden sm:block"><div class="${stBg} h-full" style="width: ${p.stamina}%"></div></div>`}</div></td>
            <td class="p-3 text-center font-bold whitespace-nowrap ${rarity.text}">${p.ovr}</td>
            <td class="p-3 text-center whitespace-nowrap">${statusHtml}</td>
            <td class="p-3 text-right text-yellow-400 whitespace-nowrap">€${(p.value || p.ovr * 100000).toLocaleString()}</td>
        </tr>`;
    });
}

export function openPlayerDetail(playerId) {
    const p = gameState.globalPlayersMap[playerId];
    if (!p) return;
    gameState.currentlyViewingPlayerId = playerId;
    const rarity = getRarityClass(p.ovr);

    const cardContainer = document.getElementById('player-card-container');
    cardContainer.className = `w-full max-w-[340px] rounded-3xl border-2 ${rarity.border} ${rarity.cardBg} shadow-[0_15px_50px_rgba(0,0,0,0.6)] relative overflow-hidden flex flex-col max-h-[90vh] transition-all duration-300 transform scale-100`;

    const av = document.getElementById('detail-avatar-container');
    if (av) {
        av.innerHTML = `<img src="https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(p.name.replace(/⭐/g, '').trim())}&backgroundColor=transparent" class="w-[120%] h-[120%] object-cover object-top drop-shadow-xl" loading="lazy" />`;
        av.className = `w-28 h-28 bg-transparent border-b-4 ${rarity.border.split(' ')[0]} rounded-b-3xl flex items-end justify-center overflow-hidden drop-shadow-2xl z-10 relative`;
    }

    document.getElementById('detail-bg-pos').textContent = p.pos;
    document.getElementById('detail-name').textContent = p.name;
    document.getElementById('detail-name').className = `text-xl md:text-2xl font-bold tracking-wider uppercase drop-shadow-md mb-1 border-b border-white/20 pb-2 inline-block px-4 ${rarity.text}`;
    document.getElementById('detail-pos').textContent = p.pos;
    document.getElementById('detail-ovr').textContent = p.ovr;
    document.getElementById('detail-ovr').className = `text-6xl font-black drop-shadow-lg ${rarity.text} leading-none`;
    document.getElementById('detail-items-used').textContent = p.itemsUsed || 0;
    document.getElementById('detail-value').textContent = `€${(p.value || p.ovr * 100000).toLocaleString()}`;
    if (document.getElementById('detail-age')) document.getElementById('detail-age').textContent = p.age || 20;

    const traitBadge = document.getElementById('detail-trait-badge');
    if (p.trait) {
        traitBadge.innerHTML = p.trait.icon;
        traitBadge.classList.remove('hidden');
        traitBadge.setAttribute('title', `${p.trait.name}: ${p.trait.desc}`);
    } else {
        traitBadge.classList.add('hidden');
    }

    const ctx = document.getElementById('playerRadarChart');
    if (playerChartInstance) playerChartInstance.destroy();

    const pStats = [p.stats.PAC, p.stats.SHO, p.stats.PAS, p.stats.DEF, p.stats.PHY, p.stats.DRI];
    let chartColor = '#f97316';
    if (p.ovr >= 90) chartColor = '#d946ef';
    else if (p.ovr >= 80) chartColor = '#facc15';
    else if (p.ovr >= 65) chartColor = '#cbd5e1';

    playerChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['PAC', 'SHO', 'PAS', 'DEF', 'PHY', 'DRI'],
            datasets: [{
                data: pStats,
                backgroundColor: chartColor + '50',
                borderColor: chartColor,
                pointBackgroundColor: '#fff',
                pointBorderColor: chartColor,
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: chartColor,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: 'rgba(255, 255, 255, 0.2)' },
                    grid: { color: 'rgba(255, 255, 255, 0.2)' },
                    pointLabels: { color: 'rgba(255, 255, 255, 0.9)', font: { size: 10, weight: 'bold', family: "'Inter', sans-serif" } },
                    ticks: { display: false, min: 0, max: 100 }
                }
            },
            plugins: { legend: { display: false }, tooltip: { enabled: true } }
        }
    });

    let stDiv = document.getElementById('detail-stamina-bar');
    if (p.injury > 0) {
        stDiv.innerHTML = `<div class="text-xs font-bold text-red-400 bg-red-950/80 p-2 rounded-xl text-center border border-red-500/50 mb-3 drop-shadow-md">🚑 Chấn thương (${p.injury} vòng)</div>`;
    } else {
        stDiv.innerHTML = `
            <div class="flex justify-between text-[10px] text-white/70 mb-1 uppercase tracking-widest font-bold">
                <span>Thể lực</span><span class="${p.stamina >= 80 ? 'text-green-400' : (p.stamina >= 50 ? 'text-yellow-400' : 'text-red-400')}">${p.stamina}%</span>
            </div>
            <div class="w-full bg-black/60 h-2.5 rounded-full overflow-hidden border border-white/10 mb-3">
                <div class="${p.stamina >= 80 ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : (p.stamina >= 50 ? 'bg-yellow-500' : 'bg-red-500')} h-full transition-all duration-500" style="width: ${p.stamina}%"></div>
            </div>`;
    }

    const sCont = document.getElementById('sell-player-container');
    let fBtn = '';
    if (gameState.myFacilities.medicalSlots.includes(p.id)) {
        fBtn = `<button onclick="window.removeFromFacility('${p.id}', 'medical')" class="col-span-2 py-2.5 bg-gradient-to-r from-yellow-700 to-yellow-600 hover:from-yellow-600 text-white rounded-xl font-bold shadow-lg transition text-xs uppercase tracking-wider">Thoát Y tế</button>`;
    } else if (gameState.myFacilities.trainingSlots.includes(p.id)) {
        fBtn = `<button onclick="window.removeFromFacility('${p.id}', 'training')" class="col-span-2 py-2.5 bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-600 text-white rounded-xl font-bold shadow-lg transition text-xs uppercase tracking-wider">Thoát Huấn luyện</button>`;
    } else {
        if (p.injury > 0 || p.stamina < 100) {
            fBtn += `<button onclick="window.assignToFacility('${p.id}', 'medical')" class="py-2.5 bg-green-900/60 hover:bg-green-700 text-green-300 border border-green-500/50 rounded-xl font-bold transition text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1"><span class="text-lg leading-none">🏥</span>Y Tế</button>`;
        }
        if (p.injury === 0) {
            fBtn += `<button onclick="window.assignToFacility('${p.id}', 'training')" class="py-2.5 bg-blue-900/60 hover:bg-blue-700 text-blue-300 border border-blue-500/50 rounded-xl font-bold transition text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1"><span class="text-lg leading-none">🏋️</span>Tập Luyện</button>`;
        }
    }

    if (p.isListed) {
        sCont.innerHTML = fBtn + `<button disabled class="col-span-2 py-2.5 bg-slate-800 text-slate-500 rounded-xl font-bold cursor-not-allowed mt-1 text-xs uppercase tracking-wider shadow-inner">Đang Chờ Bán</button>`;
    } else {
        sCont.innerHTML = fBtn + `
            <div class="col-span-2 grid grid-cols-2 gap-2 mt-1">
                <button onclick="window.listPlayerForSale()" class="py-2.5 bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 text-white rounded-xl font-bold shadow-lg transition text-[10px] uppercase tracking-wider">Lên TTCN</button>
                <button onclick="window.terminateContract()" class="py-2.5 bg-black/40 border border-red-500/30 text-red-400 hover:bg-red-900/80 rounded-xl font-bold transition text-[10px] uppercase tracking-wider">Thanh lý</button>
            </div>
            <button onclick="window.openFuseModal('${p.id}')" class="col-span-2 mt-2 w-full py-3 bg-gradient-to-r from-fuchsia-700 to-pink-600 hover:from-fuchsia-600 hover:to-pink-500 text-white rounded-xl font-black shadow-[0_0_15px_rgba(217,70,239,0.5)] transition text-xs uppercase tracking-widest flex justify-center items-center gap-2">
                <span>🔥</span> ÉP THẺ NÂNG CẤP <span>🔥</span>
            </button>
        `;
    }

    const modal = document.getElementById('player-detail-modal');
    modal.classList.remove('hidden');
    void modal.offsetWidth;
    modal.classList.remove('opacity-0');
    modal.classList.add('opacity-100');
}

export function closeDetailModal() {
    const modal = document.getElementById('player-detail-modal');
    const cardContainer = document.getElementById('player-card-container');
    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0');
    cardContainer.classList.remove('scale-100');
    cardContainer.classList.add('scale-95');
    setTimeout(function() {
        modal.classList.add('hidden');
    }, 300);
}

export function openFuseModal(targetId) {
    const targetPlayer = gameState.globalPlayersMap[targetId];
    if (!targetPlayer) return;
    currentFuseTargetId = targetId;

    document.getElementById('fuse-target-name').textContent = `${targetPlayer.name} (${targetPlayer.ovr})`;
    const container = document.getElementById('fuse-list-container');
    container.innerHTML = '';

    let fodderCandidates = gameState.globalPlayersList.filter(function(p) {
        return p.id !== targetId &&
            !p.isListed &&
            !gameState.myFacilities.medicalSlots.includes(p.id) &&
            !gameState.myFacilities.trainingSlots.includes(p.id) &&
            !gameState.startingXI.includes(p.id);
    });

    if (fodderCandidates.length === 0) {
        container.innerHTML = `<div class="text-center text-slate-500 p-6 italic text-sm">Không có cầu thủ phôi hợp lệ (Cần rút khỏi Đội hình chính/Y tế trước).</div>`;
    } else {
        fodderCandidates.sort(function(a, b) { return a.ovr - b.ovr; }).forEach(function(fodder) {
            let diff = fodder.ovr - targetPlayer.ovr;
            let successRate = Math.max(5, Math.min(100, 50 + (diff * 2)));
            let rateColor = successRate >= 70 ? 'text-green-400' : (successRate >= 40 ? 'text-yellow-400' : 'text-red-500');
            const cost = 200000;

            container.innerHTML += `
                <div class="flex justify-between items-center p-3 mb-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-xl transition cursor-pointer" onclick="window.executeFuse('${fodder.id}', ${successRate}, ${cost})">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center font-bold ${getRarityClass(fodder.ovr).text} border border-slate-600">
                            ${fodder.ovr}
                        </div>
                        <div class="flex flex-col">
                            <span class="text-white text-sm font-bold">${fodder.name}</span>
                            <span class="text-[10px] text-slate-400 uppercase tracking-wider">${fodder.pos}</span>
                        </div>
                    </div>
                    <div class="flex flex-col items-end">
                        <div class="text-[10px] text-slate-400">Tỷ lệ: <span class="font-black text-sm ${rateColor}">${successRate}%</span></div>
                        <div class="text-[10px] text-yellow-400 font-bold">-€${(cost / 1000).toFixed(0)}k</div>
                    </div>
                </div>
            `;
        });
    }

    document.getElementById('player-detail-modal').classList.add('hidden');
    const modal = document.getElementById('fuse-player-modal');
    modal.classList.remove('hidden');
    void modal.offsetWidth;
    modal.classList.remove('opacity-0');
    modal.classList.add('opacity-100');
}

export function closeFuseModal() {
    const modal = document.getElementById('fuse-player-modal');
    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0');
    setTimeout(function() { modal.classList.add('hidden'); }, 300);
}

export async function executeFuse(fodderId, successRate, cost) {
    if (gameState.myBudget < cost) { showToast("Không đủ kinh phí ép thẻ!", "error"); return; }
    const target = gameState.globalPlayersMap[currentFuseTargetId];
    const fodder = gameState.globalPlayersMap[fodderId];
    if (!target || !fodder) return;

    if (!confirm(`Xác nhận dùng ${fodder.name} (OVR ${fodder.ovr}) làm phôi?\nCầu thủ này sẽ BỊ XÓA vĩnh viễn!\nTỷ lệ thành công: ${successRate}%\nPhí: €${cost.toLocaleString()}`)) return;

    showLoading("ĐANG ÉP THẺ...");
    playHaptic('heavy');

    try {
        gameState.myBudget -= cost;
        const roll = Math.random() * 100;
        const isSuccess = roll <= successRate;

        await deleteDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'players', fodder.id));
        gameState.globalPlayersList = gameState.globalPlayersList.filter(function(x) { return x.id !== fodder.id; });
        delete gameState.globalPlayersMap[fodder.id];

        if (isSuccess) {
            const statsKeys = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
            let buffLog = [];
            for (let i = 0; i < 2; i++) {
                let rStat = statsKeys[Math.floor(Math.random() * statsKeys.length)];
                if (target.stats[rStat] < 99) {
                    target.stats[rStat] = Math.min(99, target.stats[rStat] + 2);
                    buffLog.push(`+2 ${rStat}`);
                }
            }
            target.ovr = recalculateOVR(target.pos, target.stats);
            target.value = target.ovr * 120000;

            await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'players', target.id), {
                stats: target.stats, ovr: target.ovr, value: target.value
            }, { merge: true });

            showToast(`🔥 ÉP THÀNH CÔNG! ${target.name} tăng OVR lên ${target.ovr} (${buffLog.join(', ')})!`, 'success');
            playHaptic('heavy');
            setTimeout(function() { playHaptic('heavy'); }, 200);
            pushNews('Đột phá giới hạn', `Cầu thủ ${target.name} vừa đột phá giới hạn thành công sau khóa huấn luyện đặc biệt, đạt mốc OVR ${target.ovr}!`, true);
        } else {
            showToast(`💀 THẤT BẠI! Phôi ${fodder.name} đã bốc hơi, ${target.name} không tăng chỉ số.`, 'error');
        }

        await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), {
            budget: gameState.myBudget, news: gameState.newsInbox
        }, { merge: true });
        updateHeaderDisplay();

        closeFuseModal();
        if (gameState.activeSubView === 'squad-list') renderSquadList();
        if (gameState.activeSubView === 'tactics') renderPitch();
    } catch (e) {
        showToast("Lỗi kết nối khi ép thẻ!", "error");
    } finally {
        hideLoading();
    }
}

export function renderPitch() {
    const container = document.getElementById('pitch-container');
    if (!container) return;
    container.innerHTML = '';

    const layout = gameState.currentFormation.split('-').map(Number);
    layout.reverse();
    layout.push(1);
    let slotIndex = 0;

    layout.forEach(function(rowCount, rowIndex) {
        const expectedPos = ['FWD', 'MID', 'DEF', 'GK'][rowIndex];
        const rowDiv = document.createElement('div');
        rowDiv.className = "flex justify-center items-center w-full gap-2 sm:gap-6";

        for (let i = 0; i < rowCount; i++) {
            const p = gameState.startingXI[slotIndex] ? gameState.globalPlayersMap[gameState.startingXI[slotIndex]] : null;
            const cIndex = slotIndex;
            let pHtml = "";

            if (p) {
                const penalty = p.stamina < 60 ? Math.floor((60 - p.stamina) / 2) : 0;
                let effOvr = Math.max(1, p.ovr - penalty);
                const isInjured = p.injury > 0;
                if (isInjured) effOvr = '🚑';
                const rarity = getRarityClass(effOvr === '🚑' ? p.ovr : effOvr);

                const staminaColor = p.stamina >= 80 ? '#22c55e' : (p.stamina >= 50 ? '#eab308' : '#ef4444');
                const ringStyle = isInjured
                    ? `background: #ef4444; box-shadow: 0 0 10px #ef4444;`
                    : `background: conic-gradient(${staminaColor} ${p.stamina}%, rgba(0,0,0,0.5) 0);`;

                const wrongPosAlert = (p.pos !== expectedPos)
                    ? '<div class="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] animate-bounce shadow-lg border border-white">⚠️</div>'
                    : '';

                pHtml = `
                    <div class="relative w-10 h-10 sm:w-12 sm:h-12 rounded-full p-[2.5px] shadow-lg transition-transform z-10" style="${ringStyle}">
                        <div class="w-full h-full bg-slate-900 rounded-full flex items-center justify-center border-2 ${(p.pos !== expectedPos) ? 'border-red-500' : rarity.border} ${rarity.bg} overflow-hidden relative">
                            <span class="font-black text-xs sm:text-sm ${rarity.text} drop-shadow-md z-10">${effOvr}</span>
                            ${penalty > 0 && !isInjured ? `<div class="absolute bottom-0 w-full bg-red-600/90 text-white text-[7px] font-bold text-center pt-0.5 pb-0.5 leading-none z-0">-${penalty}</div>` : ''}
                        </div>
                        ${wrongPosAlert}
                    </div>
                    <div class="mt-1.5 w-16 sm:w-20 flex flex-col items-center z-10">
                        <div class="bg-black/80 backdrop-blur-sm border border-white/20 px-1.5 py-0.5 rounded shadow text-[9px] sm:text-[10px] text-white font-bold truncate max-w-full text-center">
                            ${p.name}
                        </div>
                    </div>
                `;
            } else {
                pHtml = `
                    <div class="w-10 h-10 sm:w-12 sm:h-12 bg-black/40 hover:bg-black/60 border-2 border-dashed border-white/30 rounded-full flex items-center justify-center text-white/40 text-[10px] sm:text-xs font-bold transition shadow-inner z-10">
                        ${expectedPos}
                    </div>
                    <div class="mt-1.5 w-16 sm:w-20 flex justify-center z-10">
                        <div class="bg-black/30 border border-dashed border-white/20 px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] text-white/40 font-medium text-center">Trống</div>
                    </div>
                `;
            }

            rowDiv.innerHTML += `<div class="relative flex flex-col items-center w-16 sm:w-20 cursor-pointer hover:scale-110 transition-transform group" onclick="window.openBenchSelect(${cIndex}, '${expectedPos}')">${pHtml}</div>`;
            slotIndex++;
        }
        container.appendChild(rowDiv);
    });
    calcTeamPower();
}

export function openBenchSelect(slotIndex, expectedPos) {
    gameState.currentSlotToFill = slotIndex;
    const container = document.getElementById('bench-list-container');
    container.innerHTML = '';

    [...gameState.globalPlayersList].sort(function(a, b) {
        if (a.pos === expectedPos && b.pos !== expectedPos) return -1;
        if (a.pos !== expectedPos && b.pos === expectedPos) return 1;
        return b.ovr - a.ovr;
    }).forEach(function(p) {
        if (gameState.startingXI.includes(p.id) && gameState.startingXI[slotIndex] !== p.id) return;
        const isCurrent = gameState.startingXI[slotIndex] === p.id;
        const rarity = getRarityClass(p.ovr);
        container.innerHTML += `<div onclick="${p.injury > 0 ? `window.showToast('Cầu thủ đang chấn thương!')` : `window.assignPlayerToSlot('${p.id}')`}" class="flex justify-between items-center p-2 md:p-3 hover:bg-slate-700/50 border-b border-slate-700/50 cursor-pointer rounded ${isCurrent ? 'bg-green-900/30' : (p.injury > 0 ? 'opacity-50' : '')}"><div class="flex items-center gap-2 md:gap-3"><span class="${POS_COLORS[p.pos]} text-white text-[9px] md:text-[10px] font-bold px-1 md:px-2 py-0.5 rounded w-8 md:w-10 text-center">${p.pos}</span><div class="flex flex-col"><span class="text-white text-xs md:text-sm ${isCurrent ? 'font-bold' : ''}">${p.name}</span><span class="text-[9px] md:text-[10px] ${p.injury > 0 ? 'text-red-500 font-bold' : (p.stamina >= 80 ? 'text-green-400' : 'text-yellow-400')}">${p.injury > 0 ? '🚑 Chấn thương' : `⚡ ${p.stamina}%`}</span></div></div><span class="font-bold text-sm md:text-base ${rarity.text}">${p.ovr}</span></div>`;
    });
    document.getElementById('select-player-modal').classList.remove('hidden');
}

export function closeBenchSelect() {
    document.getElementById('select-player-modal').classList.add('hidden');
}

export function assignPlayerToSlot(id) {
    if (gameState.currentSlotToFill !== null) {
        gameState.startingXI[gameState.currentSlotToFill] = id;
        renderPitch();
        closeBenchSelect();
    }
}

export function removePlayerFromSlot() {
    if (gameState.currentSlotToFill !== null) {
        gameState.startingXI[gameState.currentSlotToFill] = null;
        renderPitch();
        closeBenchSelect();
    }
}

export function initSquadTacticsListeners() {
    document.getElementById('close-detail-modal')?.addEventListener('click', function() {
        closeDetailModal();
    });

    document.getElementById('formation-select')?.addEventListener('change', function(e) {
        gameState.currentFormation = e.target.value;
        const layout = gameState.currentFormation.split('-').map(Number);
        layout.reverse();
        layout.push(1);
        let expPos = [];
        layout.forEach(function(count, idx) {
            for (let i = 0; i < count; i++) expPos.push(['FWD', 'MID', 'DEF', 'GK'][idx]);
        });
        let newXI = new Array(11).fill(null);
        let avail = gameState.startingXI.filter(function(id) { return id !== null; }).map(function(id) { return gameState.globalPlayersMap[id]; });
        expPos.forEach(function(reqPos, index) {
            let matchIdx = avail.findIndex(function(p) { return p && p.pos === reqPos; });
            if (matchIdx !== -1) {
                newXI[index] = avail[matchIdx].id;
                avail.splice(matchIdx, 1);
            }
        });
        newXI.forEach(function(val, index) {
            if (!val && avail.length > 0) {
                newXI[index] = avail[0].id;
                avail.splice(0, 1);
            }
        });
        gameState.startingXI = newXI;
        renderPitch();
    });

    document.getElementById('save-tactics-btn')?.addEventListener('click', async function() {
        showLoading("ĐANG LƯU...");
        try {
            await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'tactics'), {
                formation: gameState.currentFormation,
                startingXI: gameState.startingXI
            });
            showToast("Đã lưu chiến thuật!", "success");
        } catch (e) {
            showToast("Lỗi!");
        } finally {
            hideLoading();
        }
    });
}
