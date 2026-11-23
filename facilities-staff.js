import { db, appId, recalculateOVR, generatePlayerName, POSITIONS } from './firebase-config.js';
import { showLoading, hideLoading, showToast } from './ui-helpers.js';
import { doc, setDoc, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { gameState, STAFF_TIERS, STADIUM_STATS, updateHeaderDisplay, pushNews } from './state.js';

export function renderFacilities() {
    const container = document.getElementById('facilities-container');
    if (!container) return;
    container.innerHTML = '';

    const staffHtml = `
        <div class="lg:col-span-2 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-4 shadow-lg mb-4 flex justify-between items-center gap-3">
            <div>
                <h3 class="text-white font-bold mb-2 flex items-center gap-2">👔 Ban Huấn Luyện & Y Tế (Staff)</h3>
                <div class="flex flex-wrap gap-2 text-xs">
                    <div class="bg-slate-900 p-2 rounded border ${gameState.myStaff.physio ? 'border-green-500/50 text-green-400' : 'border-slate-700 text-slate-500'}">
                        ${gameState.myStaff.physio ? `🏥 ${gameState.myStaff.physio.name} (Hạng ${gameState.myStaff.physio.grade})` : '🏥 Chưa thuê Bác sĩ'}
                    </div>
                    <div class="bg-slate-900 p-2 rounded border ${gameState.myStaff.coach ? 'border-blue-500/50 text-blue-400' : 'border-slate-700 text-slate-500'}">
                        ${gameState.myStaff.coach ? `📋 ${gameState.myStaff.coach.name} (Hạng ${gameState.myStaff.coach.grade})` : '📋 Chưa thuê Trợ lý HLV'}
                    </div>
                </div>
            </div>
            <button onclick="window.openStaffMarket()" class="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg transition text-xs sm:text-sm whitespace-nowrap">Tuyển Dụng</button>
        </div>
    `;
    container.innerHTML = staffHtml;

    let medSlotsHtml = `<div class="mt-4 text-[11px] md:text-sm border-t border-slate-700 pt-3"><div class="text-slate-400 mb-2 font-bold">Nằm viện (${gameState.myFacilities.medicalSlots.length}/${gameState.myFacilities.medical}):</div>`;
    if (gameState.myFacilities.medicalSlots.length === 0) {
        medSlotsHtml += `<div class="text-slate-500 italic bg-slate-900 p-2 rounded border border-dashed border-slate-700 text-center">Trống</div>`;
    } else {
        gameState.myFacilities.medicalSlots.forEach(function(id) {
            const p = gameState.globalPlayersMap[id];
            if (p) {
                medSlotsHtml += `<div class="flex justify-between items-center text-white bg-slate-900 p-2 rounded mb-1 border border-slate-700"><span>🚑 ${p.name}</span><button onclick="window.removeFromFacility('${id}', 'medical')" class="text-red-400 hover:text-red-300 font-bold text-[10px] md:text-xs bg-red-900/30 px-2 py-1 rounded">Rút ra</button></div>`;
            }
        });
    }
    medSlotsHtml += `</div>`;

    let trainSlotsHtml = `<div class="mt-4 text-[11px] md:text-sm border-t border-slate-700 pt-3"><div class="text-slate-400 mb-2 font-bold">Tập luyện (${gameState.myFacilities.trainingSlots.length}/${gameState.myFacilities.training}):</div>`;
    if (gameState.myFacilities.trainingSlots.length === 0) {
        trainSlotsHtml += `<div class="text-slate-500 italic bg-slate-900 p-2 rounded border border-dashed border-slate-700 text-center">Trống</div>`;
    } else {
        gameState.myFacilities.trainingSlots.forEach(function(id) {
            const p = gameState.globalPlayersMap[id];
            if (p) {
                trainSlotsHtml += `<div class="flex justify-between items-center text-white bg-slate-900 p-2 rounded mb-1 border border-slate-700"><span>🏋️ ${p.name}</span><button onclick="window.removeFromFacility('${id}', 'training')" class="text-blue-400 hover:text-blue-300 font-bold text-[10px] md:text-xs bg-blue-900/30 px-2 py-1 rounded">Rút ra</button></div>`;
            }
        });
    }
    trainSlotsHtml += `</div>`;

    const facs = [
        { id: 'medical', name: '🏥 Y tế', desc: `Chữa chấn thương & hồi 100% thể lực.`, level: gameState.myFacilities.medical, slotsHtml: medSlotsHtml },
        { id: 'training', name: '🏋️ Huấn luyện', desc: `Tăng +1 chỉ số ngẫu nhiên sau mỗi trận.`, level: gameState.myFacilities.training, slotsHtml: trainSlotsHtml },
        { id: 'scouting', name: '🕵️ Tuyển trạch', desc: `Tìm tài năng trẻ (hoặc Sách tập luyện).`, level: gameState.myFacilities.scouting, slotsHtml: '' },
        { id: 'finance', name: '🏦 Tài chính', desc: `Tăng ${gameState.myFacilities.finance * 5}% tổng doanh thu.`, level: gameState.myFacilities.finance, slotsHtml: '' }
    ];

    facs.forEach(function(f) {
        const isMax = f.level >= 5;
        const cost = f.level * 3000000;
        const upgradeTime = Math.pow(2, f.level - 1);
        let actionHtml = '';
        if (gameState.myFacilities.pendingUpgrade && gameState.myFacilities.pendingUpgrade.id === f.id) {
            actionHtml = `<button disabled class="w-full py-2 bg-yellow-700 text-yellow-200 font-bold text-sm rounded-lg cursor-not-allowed">Đang thi công (${gameState.myFacilities.pendingUpgrade.remaining} trận)</button>`;
        } else if (gameState.myFacilities.pendingUpgrade) {
            actionHtml = `<button disabled class="w-full py-2 bg-slate-700 text-slate-400 font-bold text-sm rounded-lg cursor-not-allowed">Chờ công trình khác</button>`;
        } else if (isMax) {
            actionHtml = `<button disabled class="w-full py-2 bg-slate-700 text-slate-400 font-bold text-sm rounded-lg cursor-not-allowed">Đã max (Lv.5)</button>`;
        } else {
            actionHtml = `<button onclick="window.upgradeFacility('${f.id}', ${cost}, ${upgradeTime})" class="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-lg shadow-lg transition">Nâng cấp: €${(cost / 1000000).toFixed(1)}M (${upgradeTime} trận)</button>`;
        }

        if (f.id === 'scouting') {
            if (gameState.myFacilities.scoutedPlayer) {
                actionHtml = `<div class="bg-green-900/50 border border-green-500 p-2 rounded-lg text-center mb-2"><div class="text-green-400 font-bold text-xs">Phát hiện Tài năng!</div><div class="text-white text-xs">${gameState.myFacilities.scoutedPlayer.name} (OVR ${gameState.myFacilities.scoutedPlayer.ovr})</div><button onclick="window.claimScoutedPlayer()" class="mt-1 w-full py-1 bg-green-600 hover:bg-green-500 text-white font-bold text-xs rounded">Ký Hợp Đồng</button></div>` + actionHtml;
            } else {
                actionHtml = `<div class="text-[10px] md:text-xs text-slate-400 text-center mb-3 border-t border-slate-700 pt-3">Báo cáo sau: <span class="font-bold text-yellow-400">${gameState.myFacilities.scoutingCooldown}</span> trận</div>` + actionHtml;
            }
        }
        container.innerHTML += `<div class="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-lg flex flex-col justify-between hover:border-blue-500/50 transition-colors"><div class="mb-4"><div class="flex justify-between items-center mb-2"><h3 class="text-lg font-bold text-white">${f.name}</h3><span class="bg-blue-900 text-blue-300 text-[10px] font-bold px-2 py-1 rounded">Lv. ${f.level}</span></div><p class="text-slate-400 text-xs md:text-sm">${f.desc}</p>${f.slotsHtml}</div><div>${actionHtml}</div></div>`;
    });
}

export async function upgradeFacility(facId, cost, time) {
    if (gameState.myBudget < cost) { showToast("Không đủ ngân sách!", "error"); return; }
    if (gameState.myFacilities.pendingUpgrade) { showToast("Đang thi công công trình khác!", "warning"); return; }
    showLoading("ĐANG KÝ HỢP ĐỒNG...");
    try {
        gameState.myBudget -= cost;
        gameState.myFacilities.pendingUpgrade = { id: facId, remaining: time };
        await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), {
            budget: gameState.myBudget,
            facilities: gameState.myFacilities
        }, { merge: true });
        updateHeaderDisplay();
        renderFacilities();
        if (facId === 'stadium') renderStadium();
        showToast("Bắt đầu thi công!", "success");
    } catch (e) {
        showToast("Lỗi!");
    } finally {
        hideLoading();
    }
}

export async function assignToFacility(playerId, type) {
    const maxSlots = type === 'medical' ? gameState.myFacilities.medical : gameState.myFacilities.training;
    const currentSlots = type === 'medical' ? gameState.myFacilities.medicalSlots : gameState.myFacilities.trainingSlots;
    if (currentSlots.length >= maxSlots) { showToast(`Trung tâm đã hết chỗ!`, "error"); return; }
    if (gameState.startingXI.includes(playerId)) { showToast(`Rút khỏi sân chính trước!`, "warning"); return; }
    currentSlots.push(playerId);
    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), { facilities: gameState.myFacilities }, { merge: true });
        document.getElementById('player-detail-modal').classList.add('hidden');
        renderFacilities();
        if (typeof window.renderSquadList === 'function') window.renderSquadList();
        showToast(`Đã đưa vào Trung tâm!`, "success");
    } catch (e) {
        showToast("Lỗi!");
    }
}

export async function removeFromFacility(playerId, type) {
    if (type === 'medical') {
        gameState.myFacilities.medicalSlots = gameState.myFacilities.medicalSlots.filter(function(id) { return id !== playerId; });
    } else {
        gameState.myFacilities.trainingSlots = gameState.myFacilities.trainingSlots.filter(function(id) { return id !== playerId; });
    }
    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), { facilities: gameState.myFacilities }, { merge: true });
        document.getElementById('player-detail-modal').classList.add('hidden');
        renderFacilities();
        if (typeof window.renderSquadList === 'function') window.renderSquadList();
        showToast(`Đã rút ra!`, "success");
    } catch (e) {
        showToast("Lỗi!");
    }
}

export async function claimScoutedPlayer() {
    if (gameState.globalPlayersList.length >= 25) { showToast("Đội hình đã đầy!", "error"); return; }
    showLoading("ĐANG KÝ HỢP ĐỒNG...");
    try {
        let p = gameState.myFacilities.scoutedPlayer;
        const newPlayerRef = doc(collection(db, 'artifacts', appId, 'users', gameState.currentUserId, 'players'));
        await setDoc(newPlayerRef, p);
        p.id = newPlayerRef.id;
        gameState.globalPlayersList.push(p);
        gameState.globalPlayersMap[p.id] = p;
        gameState.myFacilities.scoutedPlayer = null;
        gameState.myFacilities.scoutingCooldown = 6 - gameState.myFacilities.scouting;
        await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), { facilities: gameState.myFacilities }, { merge: true });
        renderFacilities();
        showToast(`Đã ký ${p.name}!`, "success");
    } catch (e) {
        showToast("Lỗi!");
    } finally {
        hideLoading();
    }
}

export function renderStadium() {
    const container = document.getElementById('stadium-container');
    if (!container) return;

    if (!gameState.myFacilities.stadium) gameState.myFacilities.stadium = 1;
    const currentLvl = gameState.myFacilities.stadium;
    const currentStat = STADIUM_STATS[currentLvl - 1];
    const nextStat = currentLvl < 5 ? STADIUM_STATS[currentLvl] : null;

    let actionHtml = '';
    if (gameState.myFacilities.pendingUpgrade && gameState.myFacilities.pendingUpgrade.id === 'stadium') {
        actionHtml = `<button disabled class="w-full py-3 bg-yellow-700 text-yellow-200 font-bold text-sm rounded-xl cursor-not-allowed shadow-lg">Đang thi công (${gameState.myFacilities.pendingUpgrade.remaining} trận)</button>`;
    } else if (gameState.myFacilities.pendingUpgrade) {
        actionHtml = `<button disabled class="w-full py-3 bg-slate-700 text-slate-400 font-bold text-sm rounded-xl cursor-not-allowed">Chờ công trình Y tế/Huấn luyện thi công xong</button>`;
    } else if (!nextStat) {
        actionHtml = `<button disabled class="w-full py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white font-bold text-sm rounded-xl cursor-not-allowed shadow-lg">Đã đạt chuẩn cao nhất (Max Lv.5)</button>`;
    } else {
        actionHtml = `<button onclick="window.upgradeFacility('stadium', ${nextStat.upgradeCost}, ${nextStat.upgradeTime})" class="w-full py-3 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-bold text-sm rounded-xl shadow-lg transition">Nâng cấp Khán đài: €${(nextStat.upgradeCost / 1000000).toFixed(1)}M (${nextStat.upgradeTime} trận)</button>`;
    }

    container.innerHTML = `
        <div class="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl flex flex-col items-center text-center relative overflow-hidden">
            <div class="absolute -top-10 -right-10 text-9xl opacity-5 pointer-events-none">🏟️</div>
            <div class="text-6xl md:text-7xl mb-4 drop-shadow-[0_0_15px_rgba(249,115,22,0.4)] z-10">${currentStat.img}</div>
            <h3 class="text-2xl font-bold text-orange-400 mb-1 z-10">${currentStat.name}</h3>
            <span class="bg-orange-900/50 text-orange-300 text-[10px] uppercase font-bold px-3 py-1 rounded-full border border-orange-500/50 mb-6 z-10">Cấp độ ${currentLvl}</span>
            <div class="w-full bg-slate-900/80 rounded-xl p-4 border border-slate-700 space-y-3 z-10">
                <div class="flex justify-between items-center border-b border-slate-700/50 pb-2">
                    <span class="text-slate-400 text-sm">Sức chứa tối đa:</span>
                    <span class="font-bold text-white">${currentStat.capacity.toLocaleString()} ghế</span>
                </div>
                <div class="flex justify-between items-center border-b border-slate-700/50 pb-2">
                    <span class="text-slate-400 text-sm">Giá vé trung bình:</span>
                    <span class="font-bold text-green-400">€${currentStat.ticketPrice}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-slate-400 text-sm">Doanh thu dự kiến:</span>
                    <span class="font-bold text-yellow-400">€${(currentStat.capacity * currentStat.ticketPrice).toLocaleString()}/trận</span>
                </div>
            </div>
        </div>
        <div class="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
            <div>
                <h3 class="text-lg md:text-xl font-bold text-white mb-4 border-b border-slate-700 pb-2 flex items-center gap-2">🚧 Dự án Mở rộng</h3>
                ${nextStat ? `
                    <p class="text-sm text-slate-400 mb-6 leading-relaxed">Đầu tư nâng cấp mặt cỏ và xây thêm khán đài để đón lượng lớn người hâm mộ. SVĐ càng lớn, nguồn thu tài chính càng ổn định.</p>
                    <div class="space-y-4 mb-6 text-sm bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                        <div class="flex justify-between items-center text-slate-300">
                            <span>Mở rộng thêm:</span>
                            <span class="font-bold text-green-400">⬆ ${(nextStat.capacity - currentStat.capacity).toLocaleString()} ghế</span>
                        </div>
                        <div class="flex justify-between items-center text-slate-300">
                            <span>Tăng doanh thu:</span>
                            <span class="font-bold text-green-400">⬆ €${((nextStat.capacity * nextStat.ticketPrice) - (currentStat.capacity * currentStat.ticketPrice)).toLocaleString()}</span>
                        </div>
                        <div class="flex justify-between items-center text-slate-300">
                            <span>Thời gian thi công:</span>
                            <span class="font-bold text-yellow-400">⏳ ${nextStat.upgradeTime} trận</span>
                        </div>
                    </div>
                ` : `
                    <div class="flex flex-col items-center justify-center h-48 text-center bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
                        <div class="text-5xl mb-3 text-yellow-400 animate-pulse">👑</div>
                        <p class="text-slate-300 font-bold mb-1">Sân vận động đạt chuẩn FIFA cao nhất.</p>
                        <p class="text-slate-500 text-sm">Không thể mở rộng quy mô thêm nữa.</p>
                    </div>
                `}
            </div>
            <div>${actionHtml}</div>
        </div>
    `;
}

// ================= HỆ THỐNG BAN HUẤN LUYỆN (STAFF) =================

export function openStaffMarket() {
    const modal = document.getElementById('staff-market-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    void modal.offsetWidth;
    modal.classList.remove('opacity-0');
    modal.classList.add('opacity-100');
    renderStaffList('physio');
}

export function closeStaffMarket() {
    const modal = document.getElementById('staff-market-modal');
    if (!modal) return;
    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0');
    setTimeout(function() { modal.classList.add('hidden'); }, 300);
}

export function renderStaffList(role) {
    document.getElementById('tab-staff-physio').className = role === 'physio'
        ? "px-4 py-2 font-bold text-green-400 border-b-2 border-green-400 whitespace-nowrap bg-slate-700/50 rounded-t-lg transition"
        : "px-4 py-2 font-medium text-slate-400 hover:text-white transition whitespace-nowrap rounded-t-lg";
    document.getElementById('tab-staff-coach').className = role === 'coach'
        ? "px-4 py-2 font-bold text-green-400 border-b-2 border-green-400 whitespace-nowrap bg-slate-700/50 rounded-t-lg transition"
        : "px-4 py-2 font-medium text-slate-400 hover:text-white transition whitespace-nowrap rounded-t-lg";

    const container = document.getElementById('staff-list-container');
    container.innerHTML = '';

    const staffList = STAFF_TIERS[role];
    const currentStaffId = gameState.myStaff[role] ? gameState.myStaff[role].id : null;

    staffList.forEach(function(s) {
        const isHired = currentStaffId === s.id;
        let gradeColor = s.grade === 'S'
            ? 'text-fuchsia-400 bg-fuchsia-900/30 border-fuchsia-500'
            : (s.grade === 'A' ? 'text-yellow-400 bg-yellow-900/30 border-yellow-500' : (s.grade === 'B' ? 'text-blue-400 bg-blue-900/30 border-blue-500' : 'text-slate-300 bg-slate-700 border-slate-500'));

        let actionBtn = isHired
            ? `<button onclick="window.fireStaff('${role}')" class="px-4 py-2 bg-red-900/80 hover:bg-red-700 border border-red-500 text-white font-bold rounded-lg transition text-xs shadow-lg">Sa Thải</button>`
            : `<button onclick="window.hireStaff('${role}', '${s.id}')" class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition text-xs shadow-lg whitespace-nowrap">Thuê (Lương €${(s.salary / 1000)}k)</button>`;

        container.innerHTML += `
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-800/80 p-4 rounded-xl border border-slate-700 hover:border-slate-500 transition gap-4">
                <div class="flex items-start gap-4">
                    <div class="text-4xl drop-shadow-md">${s.icon}</div>
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            <h4 class="font-bold text-white text-base">${s.name}</h4>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded border ${gradeColor}">Hạng ${s.grade}</span>
                        </div>
                        <p class="text-xs text-slate-300 mb-1 leading-relaxed">${s.desc}</p>
                        <p class="text-[10px] text-yellow-400 font-medium">Lương trả sau mỗi vòng đấu: €${s.salary.toLocaleString()}</p>
                    </div>
                </div>
                <div class="w-full sm:w-auto text-right">
                    ${actionBtn}
                </div>
            </div>
        `;
    });
}

export async function hireStaff(role, tierId) {
    const s = STAFF_TIERS[role].find(function(x) { return x.id === tierId; });
    if (!s) return;
    if (confirm(`Ký hợp đồng với [${s.name}]?\nLương: €${s.salary.toLocaleString()}/trận.`)) {
        showLoading("ĐANG KÝ HỢP ĐỒNG...");
        try {
            gameState.myStaff[role] = s;
            await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), { staff: gameState.myStaff }, { merge: true });
            renderStaffList(role);
            if (gameState.activeSubView === 'facilities') renderFacilities();
            showToast(`Đã bổ nhiệm ${s.name}!`, "success");
        } catch (e) {
            showToast("Lỗi kết nối!");
        } finally {
            hideLoading();
        }
    }
}

export async function fireStaff(role) {
    if (!confirm("Chấm dứt hợp đồng với nhân viên này?")) return;
    showLoading("ĐANG LÀM THỦ TỤC...");
    try {
        gameState.myStaff[role] = null;
        await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), { staff: gameState.myStaff }, { merge: true });
        renderStaffList(role);
        if (gameState.activeSubView === 'facilities') renderFacilities();
        showToast("Đã sa thải!", "warning");
    } catch (e) {
        showToast("Lỗi kết nối!");
    } finally {
        hideLoading();
    }
}

export async function processFacilitiesAndStamina() {
    if (gameState.myFacilities.pendingUpgrade) {
        gameState.myFacilities.pendingUpgrade.remaining--;
        if (gameState.myFacilities.pendingUpgrade.remaining <= 0) {
            let facId = gameState.myFacilities.pendingUpgrade.id;
            gameState.myFacilities[facId]++;
            let facName = facId === 'medical' ? 'Y tế' : (facId === 'training' ? 'Huấn luyện' : (facId === 'scouting' ? 'Tuyển trạch' : (facId === 'stadium' ? 'Sân vận động' : 'Tài chính')));
            pushNews('Khánh Thành Công Trình', `Hạng mục ${facName} đã hoàn tất thi công nâng cấp lên Cấp ${gameState.myFacilities[facId]}!`, true);
            gameState.myFacilities.pendingUpgrade = null;
        }
    }

    let injuryLogs = [];
    gameState.globalPlayersList.forEach(function(p) {
        if (gameState.startingXI.includes(p.id)) {
            p.stamina = Math.max(0, p.stamina - (Math.floor(Math.random() * 11) + 15));
            let injuryChance = 0.4;
            if (gameState.myStaff.physio && gameState.myStaff.physio.grade === 'A') injuryChance = 0.2;
            if (gameState.myStaff.physio && gameState.myStaff.physio.grade === 'S') injuryChance = 0;

            if (p.stamina < 30 && Math.random() < injuryChance) {
                p.injury = 3;
                injuryLogs.push(p.name);
                let idx = gameState.startingXI.indexOf(p.id);
                if (idx !== -1) gameState.startingXI[idx] = null;
            }
        } else {
            p.stamina = Math.min(100, p.stamina + (Math.floor(Math.random() * 11) + 25));
            if (p.injury > 0) p.injury = Math.max(0, p.injury - 1);
        }
    });
    if (injuryLogs.length > 0) {
        pushNews('Bão Chấn Thương', `Các cầu thủ: ${injuryLogs.join(', ')} đã kiệt sức và chấn thương. Yêu cầu đưa vào Trung tâm Y tế gấp!`, false);
    }

    let healedLogs = [];
    if (gameState.myFacilities.medicalSlots.length > 0) {
        gameState.myFacilities.medicalSlots.forEach(function(id) {
            let p = gameState.globalPlayersMap[id];
            if (p) {
                p.stamina = 100;
                p.injury = 0;
                healedLogs.push(p.name);
            }
        });
        gameState.myFacilities.medicalSlots = [];
        pushNews('Báo cáo Y Tế', `${healedLogs.join(', ')} đã bình phục hoàn toàn và xuất viện!`, true);
    }

    let trainedLogs = [];
    if (gameState.myFacilities.trainingSlots.length > 0) {
        gameState.myFacilities.trainingSlots.forEach(function(id) {
            let p = gameState.globalPlayersMap[id];
            if (p && p.injury === 0) {
                let statsKeys = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
                let rStat = statsKeys[Math.floor(Math.random() * statsKeys.length)];
                let statBonus = 1;
                if (gameState.myStaff.coach && gameState.myStaff.coach.grade === 'S' && Math.random() < 0.5) statBonus = 2;

                if (p.stats[rStat] < 99) {
                    p.stats[rStat] = Math.min(99, p.stats[rStat] + statBonus);
                    p.ovr = recalculateOVR(p.pos, p.stats);
                    p.value = p.ovr * 100000;
                    trainedLogs.push(p.name);
                }
            }
        });
        if (trainedLogs.length > 0) {
            pushNews('Báo cáo Huấn Luyện', `${trainedLogs.join(', ')} đã có sự tiến bộ rõ rệt và tăng chỉ số sau các buổi tập luyện!`, true);
        }
    }

    if (!gameState.myFacilities.scoutedPlayer) {
        gameState.myFacilities.scoutingCooldown--;
        if (gameState.myFacilities.scoutingCooldown <= 0) {
            if (gameState.globalPlayersList.length >= 25) {
                let lowestPlayer = [...gameState.globalPlayersList].sort(function(a, b) { return a.ovr - b.ovr; })[0];
                if (lowestPlayer) {
                    let statsKeys = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
                    let rStat = statsKeys[Math.floor(Math.random() * statsKeys.length)];
                    lowestPlayer.stats[rStat] += 2;
                    lowestPlayer.ovr = recalculateOVR(lowestPlayer.pos, lowestPlayer.stats);
                    lowestPlayer.value = lowestPlayer.ovr * 100000;
                    pushNews('Tuyển trạch ngoại lệ', `Đội hình đã đầy! Bù lại Tuyển trạch viên tặng 1 Giáo án đặc biệt, giúp ${lowestPlayer.name} tăng chỉ số!`, true);
                }
                gameState.myFacilities.scoutingCooldown = 6 - gameState.myFacilities.scouting;
            } else {
                const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
                const name = generatePlayerName(false);
                const ovr = 60 + (gameState.myFacilities.scouting * 4) + Math.floor(Math.random() * 5);
                const val = ovr * 50000;
                let stats = { PAC: ovr + 1, SHO: ovr, PAS: ovr + 2, DRI: ovr, DEF: ovr, PHY: ovr };
                gameState.myFacilities.scoutedPlayer = {
                    name: name, pos: pos, ovr: recalculateOVR(pos, stats), stats: stats,
                    bonusStats: { PAC: 0, SHO: 0, PAS: 0, DRI: 0, DEF: 0, PHY: 0 },
                    stamina: 100, injury: 0, age: 17, value: val, isListed: false, itemsUsed: 0
                };
                pushNews('Phát hiện Tài Năng Mới', `Tuyển trạch viên vừa gửi về hồ sơ của ${name} (OVR ${gameState.myFacilities.scoutedPlayer.ovr}). Hãy vào Trung tâm Tuyển trạch để ký hợp đồng!`, true);
            }
        }
    }
}

export async function autoAssignFacilities() {
    let autoLogs = [];
    let updated = false;
    let medicalAssigned = [];
    let trainingAssigned = [];

    if (!gameState.myStaff.physio && !gameState.myStaff.coach) return null;

    if (gameState.myStaff.physio) {
        let pulledOut = 0;
        gameState.globalPlayersList.forEach(function(p) {
            if (gameState.startingXI.includes(p.id) && p.stamina < 30) {
                let idx = gameState.startingXI.indexOf(p.id);
                if (idx !== -1) gameState.startingXI[idx] = null;
                pulledOut++;
                updated = true;
            }
        });

        let candidates = gameState.globalPlayersList.filter(function(p) {
            return !gameState.startingXI.includes(p.id) &&
                !gameState.myFacilities.medicalSlots.includes(p.id) &&
                !gameState.myFacilities.trainingSlots.includes(p.id) &&
                (p.injury > 0 || p.stamina < 50);
        });
        candidates.sort(function(a, b) {
            if (a.injury > 0 && b.injury === 0) return -1;
            if (b.injury > 0 && a.injury === 0) return 1;
            return a.stamina - b.stamina;
        });

        let slotsToFill = Math.min(gameState.myStaff.physio.autoSlots, gameState.myFacilities.medical - gameState.myFacilities.medicalSlots.length);
        let added = 0;
        for (let p of candidates) {
            if (added >= slotsToFill) break;
            gameState.myFacilities.medicalSlots.push(p.id);
            medicalAssigned.push(p.name);
            added++;
        }

        if (added > 0) {
            autoLogs.push(`🏥 <b>Y tế:</b> Đã tiếp nhận <span class="text-yellow-400 font-bold">${medicalAssigned.join(', ')}</span>.`);
            updated = true;
        } else if (pulledOut > 0) {
            autoLogs.push(`🏥 <b>Y tế:</b> Đã rút ${pulledOut} người kiệt sức khỏi sân. Giường bệnh đang đầy!`);
        } else {
            autoLogs.push(`🏥 <b>Y tế:</b> Toàn đội dự bị đang khỏe mạnh, không ai cần cấp cứu.`);
        }
    }

    if (gameState.myStaff.coach) {
        let candidates = gameState.globalPlayersList.filter(function(p) {
            return !gameState.startingXI.includes(p.id) &&
                !gameState.myFacilities.medicalSlots.includes(p.id) &&
                !gameState.myFacilities.trainingSlots.includes(p.id) &&
                p.injury === 0;
        });
        candidates.sort(function(a, b) { return a.ovr - b.ovr; });

        let slotsToFill = Math.min(gameState.myStaff.coach.autoSlots, gameState.myFacilities.training - gameState.myFacilities.trainingSlots.length);
        let added = 0;
        for (let p of candidates) {
            if (added >= slotsToFill) break;
            gameState.myFacilities.trainingSlots.push(p.id);
            trainingAssigned.push(p.name);
            added++;
        }

        if (added > 0) {
            autoLogs.push(`🏋️ <b>Huấn luyện:</b> Đã gọi đi tập kín <span class="text-blue-400 font-bold">${trainingAssigned.join(', ')}</span>.`);
            updated = true;
        } else {
            autoLogs.push(`🏋️ <b>Huấn luyện:</b> Trung tâm đang kín chỗ hoặc không còn mầm non phù hợp.`);
        }
    }

    if (updated) {
        await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), { facilities: gameState.myFacilities }, { merge: true });
        await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'tactics'), {
            formation: gameState.currentFormation, startingXI: gameState.startingXI
        }, { merge: true });
        pushNews('Báo Cáo Staff', autoLogs.join(' | ').replace(/<[^>]*>?/gm, ''), true);
    }

    return autoLogs.join('<br>');
}
