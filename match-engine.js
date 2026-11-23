import { db, appId, VN_CLUBS_POOL, getPrizeMoney, recalculateOVR } from './firebase-config.js';
import { showLoading, hideLoading, showToast } from './ui-helpers.js';
import { doc, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { gameState, STADIUM_STATS, toggleNavLock, playHaptic, updateHeaderDisplay, pushNews } from './state.js';
import { processTransferMarket } from './market-store.js';
import { processFacilitiesAndStamina, autoAssignFacilities } from './facilities-staff.js';
import { finishPvpMatch } from './pvp.js';

export function sortStandings() {
    gameState.leagueState.standings.sort(function(a, b) {
        if (b.points !== a.points) return b.points - a.points;
        const gdA = a.gf - a.ga;
        const gdB = b.gf - b.ga;
        if (gdB !== gdA) return gdB - gdA;
        return b.gf - a.gf;
    });
}

export function renderLeagueView() {
    sortStandings();

    if (gameState.leagueState.currentRound > 31) {
        document.getElementById('match-setup').classList.add('hidden');
        const panel = document.getElementById('season-end-panel');
        panel.classList.remove('hidden');

        if (!window.hasCelebratedSeason) {
            window.hasCelebratedSeason = true;
            panel.classList.remove('animate-fade-in-scale');
            void panel.offsetWidth;
            panel.classList.add('animate-fade-in-scale');

            playHaptic('heavy');
            setTimeout(function() { playHaptic('heavy'); }, 300);
            setTimeout(function() { playHaptic('heavy'); }, 600);

            for (let i = 0; i < 40; i++) {
                let conf = document.createElement('div');
                conf.className = 'confetti-piece text-2xl md:text-3xl drop-shadow-lg';
                conf.textContent = ['🎊', '✨', '🏆', '🏅', '💸', '🎉'][Math.floor(Math.random() * 6)];
                conf.style.left = Math.random() * 100 + 'vw';
                conf.style.animationDelay = Math.random() * 1.5 + 's';
                conf.style.animationDuration = (Math.random() * 2 + 2.5) + 's';
                document.body.appendChild(conf);
                setTimeout(function() { conf.remove(); }, 5000);
            }
        }

        let userRank = gameState.leagueState.standings.findIndex(function(t) { return t.isUser; }) + 1;
        let prize = getPrizeMoney(userRank);
        document.getElementById('final-rank').textContent = userRank;
        document.getElementById('final-prize').textContent = `€${prize.toLocaleString()}`;

        const summaryBoard = document.getElementById('season-summary-board');
        summaryBoard.className = "w-full max-w-2xl mx-auto flex flex-col";

        let goldTeam = gameState.leagueState.standings[0];
        let silverTeam = gameState.leagueState.standings[10];
        let bronzeTeam = gameState.leagueState.standings[20];

        let podiumHtml = `
            <div class="w-full flex flex-col md:flex-row gap-4 justify-center items-end mb-6 pt-4">
                <div class="flex-1 flex flex-col items-center bg-slate-800/90 p-4 rounded-t-xl border-b-4 border-slate-300 shadow-[0_0_15px_rgba(203,213,225,0.2)] order-2 md:order-1 h-32 justify-end relative">
                    <div class="absolute -top-6 text-5xl drop-shadow-lg">🥈</div>
                    <div class="text-slate-300 font-black text-sm tracking-widest">HẠNG 11</div>
                    <div class="text-white font-bold text-center text-sm md:text-base truncate w-full px-1">${silverTeam?.name || 'N/A'}</div>
                </div>
                <div class="flex-[1.2] flex flex-col items-center bg-gradient-to-t from-yellow-900/90 to-yellow-700/50 p-4 rounded-t-xl border-b-4 border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.4)] order-1 md:order-2 h-40 justify-end relative animate-pop z-10">
                    <div class="absolute -top-10 text-7xl drop-shadow-xl animate-bounce">🏆</div>
                    <div class="text-yellow-400 font-black text-lg tracking-widest drop-shadow-md">VÔ ĐỊCH</div>
                    <div class="text-white font-bold text-center text-base md:text-lg truncate w-full px-1">${goldTeam?.name || 'N/A'}</div>
                </div>
                <div class="flex-1 flex flex-col items-center bg-slate-800/90 p-4 rounded-t-xl border-b-4 border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.2)] order-3 h-28 justify-end relative">
                    <div class="absolute -top-5 text-4xl drop-shadow-lg">🥉</div>
                    <div class="text-orange-400 font-black text-sm tracking-widest">HẠNG 21</div>
                    <div class="text-white font-bold text-center text-sm md:text-base truncate w-full px-1">${bronzeTeam?.name || 'N/A'}</div>
                </div>
            </div>
        `;

        let botStandings = gameState.leagueState.standings.filter(function(t) { return !t.isUser; });
        let relegatedBots = botStandings.slice(-2);
        if (!gameState.leagueState.promotedBots || gameState.leagueState.promotedBots.length === 0) {
            let currentNames = gameState.leagueState.standings.map(function(t) { return t.name; });
            let availableReserves = VN_CLUBS_POOL.filter(function(name) { return !currentNames.includes(name); });
            availableReserves.sort(function() { return Math.random() - 0.5; });
            gameState.leagueState.promotedBots = [{ name: availableReserves[0] }, { name: availableReserves[1] }];
            setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'league', 'state'), gameState.leagueState);
        }

        let relegateBoard = `
            <div class="w-full grid grid-cols-2 gap-4 text-sm mt-2">
                <div class="bg-red-950/40 p-3 rounded-xl border border-red-900/50 flex flex-col justify-center items-center text-center shadow-inner">
                    <div class="text-red-500 font-black mb-1 flex items-center gap-1 tracking-widest">🔻 XUỐNG HẠNG</div>
                    <div class="text-slate-300 font-medium leading-relaxed">${relegatedBots.map(function(b) { return b.name; }).join('<br>')}</div>
                </div>
                <div class="bg-green-950/40 p-3 rounded-xl border border-green-900/50 flex flex-col justify-center items-center text-center shadow-inner">
                    <div class="text-green-500 font-black mb-1 flex items-center gap-1 tracking-widest">🔺 THĂNG HẠNG</div>
                    <div class="text-slate-300 font-medium leading-relaxed">${gameState.leagueState.promotedBots.map(function(b) { return b.name; }).join('<br>')}</div>
                </div>
            </div>
        `;

        summaryBoard.innerHTML = podiumHtml + relegateBoard;

        const friendlyBtn = document.getElementById('play-friendly-btn');
        const playedFriendly = gameState.leagueState.friendlyMatchesPlayed || 0;
        if (playedFriendly >= 5) {
            friendlyBtn.disabled = true;
            friendlyBtn.classList.add('opacity-50', 'cursor-not-allowed');
            friendlyBtn.textContent = `⚽ Hết lượt Giao Hữu`;
        } else {
            friendlyBtn.disabled = false;
            friendlyBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            friendlyBtn.textContent = `⚽ Đá Giao Hữu (${playedFriendly}/5)`;
        }
    } else {
        window.hasCelebratedSeason = false;
        document.getElementById('match-setup').classList.remove('hidden');
        document.getElementById('season-end-panel').classList.add('hidden');
        document.getElementById('league-current-round').textContent = gameState.leagueState.currentRound;
        document.getElementById('league-home-name').textContent = gameState.myClubName;

        const opponentId = gameState.leagueState.schedule[gameState.leagueState.currentRound - 1];
        const opponent = gameState.leagueState.standings.find(function(t) { return t.id === opponentId; });

        if (opponent) {
            document.getElementById('league-away-name').textContent = opponent.name;
            document.getElementById('setup-home-ovr').textContent = gameState.teamPower.OVR;
            document.getElementById('setup-home-att').textContent = gameState.teamPower.ATT;
            document.getElementById('setup-home-mid').textContent = gameState.teamPower.MID;
            document.getElementById('setup-home-def').textContent = gameState.teamPower.DEF;

            const botOvr = opponent.ovr;
            document.getElementById('setup-away-ovr').textContent = botOvr;
            document.getElementById('setup-away-att').textContent = botOvr + ((gameState.leagueState.currentRound + 1) % 5 - 2);
            document.getElementById('setup-away-mid').textContent = botOvr + ((gameState.leagueState.currentRound + 2) % 5 - 2);
            document.getElementById('setup-away-def').textContent = botOvr + ((gameState.leagueState.currentRound + 3) % 5 - 2);
        }
    }

    const tbody = document.getElementById('league-table-body');
    tbody.innerHTML = '';
    gameState.leagueState.standings.forEach(function(team, index) {
        const rank = index + 1;
        const gd = team.gf - team.ga;
        let rowClass = "hover:bg-slate-700/30 transition-colors ";
        if (team.isUser) rowClass += "bg-green-900/30 font-bold ";
        if (rank <= 2) rowClass += "rank-gold";
        else if (rank === 11 || rank === 12) rowClass += "rank-silver";
        else if (rank === 21 || rank === 22) rowClass += "rank-bronze";
        else if (rank >= 31) rowClass += "rank-relegate";

        tbody.innerHTML += `<tr class="${rowClass}"><td class="p-2 sm:p-3 text-center font-mono text-slate-400">${rank}</td><td class="p-2 sm:p-3 ${team.isUser ? 'text-green-400' : 'text-white'} min-w-[150px] whitespace-nowrap">${team.name}</td><td class="p-2 sm:p-3 text-center text-slate-400">${team.played}</td><td class="p-2 sm:p-3 text-center text-slate-300">${team.won}</td><td class="p-2 sm:p-3 text-center text-slate-300">${team.drawn}</td><td class="p-2 sm:p-3 text-center text-slate-300">${team.lost}</td><td class="p-2 sm:p-3 text-center ${gd > 0 ? 'text-green-400' : gd < 0 ? 'text-red-400' : 'text-slate-400'}">${gd > 0 ? '+' + gd : gd}</td><td class="p-2 sm:p-3 text-center font-bold text-white text-sm md:text-base">${team.points}</td></tr>`;
    });
}

export function startMatchEngine(opponent, isFriendly, isPvp) {
    if (gameState.startingXI.includes(null) || gameState.teamPower.OVR === 0) {
        showToast("Xếp đủ 11 cầu thủ vào Sân!");
        return;
    }
    let lowStaminaCount = gameState.startingXI.filter(function(id) {
        return gameState.globalPlayersMap[id] && gameState.globalPlayersMap[id].stamina < 30;
    }).length;
    if (lowStaminaCount >= 3 && !isPvp) {
        showToast("Cảnh báo: Đội có nhiều người kiệt sức. Dễ chấn thương!", "warning");
    }

    toggleNavLock(true);
    document.getElementById('quick-play-btn').classList.add('hidden');
    document.getElementById('match-setup').classList.add('hidden');
    document.getElementById('season-end-panel').classList.add('hidden');
    document.getElementById('league-table-container').classList.add('hidden');

    const liveMatchContainer = document.getElementById('match-live');
    liveMatchContainer.classList.remove('hidden', 'animate-shake');
    document.getElementById('finish-match-btn').classList.add('hidden');

    let minute = 0;
    let homeScore = 0;
    let awayScore = 0;
    const logContainer = document.getElementById('match-logs-container');
    const matchLabel = isPvp ? "Đấu Trường PvP" : (isFriendly ? "Giao Hữu" : "");

    logContainer.innerHTML = `<div class="text-slate-400 text-center text-xs md:text-sm py-2 animate-fade-in-up">Trọng tài thổi còi bắt đầu trận đấu ${matchLabel}!</div>`;

    document.getElementById('live-home-name').textContent = gameState.myClubName;
    document.getElementById('live-away-name').textContent = opponent.name;

    const scoreHomeEl = document.getElementById('score-home');
    const scoreAwayEl = document.getElementById('score-away');
    scoreHomeEl.textContent = "0";
    scoreAwayEl.textContent = "0";
    document.getElementById('match-minute').textContent = "0";

    function addLog(htmlString) {
        logContainer.insertAdjacentHTML('beforeend', htmlString);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    function triggerGoalEffect(isHome) {
        const el = isHome ? scoreHomeEl : scoreAwayEl;
        el.classList.remove('animate-pop');
        void el.offsetWidth;
        el.classList.add('animate-pop');
        liveMatchContainer.classList.remove('animate-shake');
        void liveMatchContainer.offsetWidth;
        liveMatchContainer.classList.add('animate-shake');
    }

    let baseHomeOVR = gameState.teamPower.OVR;
    let baseAwayOVR = opponent.ovr;
    let homeTacticLog = "";

    if (gameState.currentFormation === '4-3-3') {
        baseHomeOVR += Math.round(gameState.teamPower.ATT * 0.15) - Math.round(gameState.teamPower.DEF * 0.05);
        homeTacticLog = `⚔️ Đội hình 4-3-3: Phủ đầu tấn công! (Tăng sức mạnh Hàng Công)`;
    } else if (gameState.currentFormation === '5-3-2') {
        baseHomeOVR += Math.round(gameState.teamPower.DEF * 0.15) - Math.round(gameState.teamPower.ATT * 0.05);
        homeTacticLog = `🛡️ Đội hình 5-3-2: Tử thủ & Rình rập! (Tăng sức mạnh Hàng Thủ)`;
    } else {
        homeTacticLog = `⚖️ Đội hình 4-4-2: Thế trận cân bằng.`;
    }

    addLog(`<div class="text-indigo-300 font-bold bg-indigo-900/40 p-2 rounded text-center border border-indigo-500/30 text-xs mb-2 animate-fade-in-up">${homeTacticLog}</div>`);

    let currentHomeOVR = baseHomeOVR;
    let currentAwayOVR = baseAwayOVR;
    let homeRedCards = 0;
    let awayRedCards = 0;

    let myActiveTraits = [];
    let myAttackers = [];
    gameState.startingXI.forEach(function(id) {
        if (id && gameState.globalPlayersMap[id]) {
            let p = gameState.globalPlayersMap[id];
            if (p.trait) myActiveTraits.push({ name: p.name, trait: p.trait });
            if (p.pos === 'FWD' || p.pos === 'MID') myAttackers.push(p);
        }
    });

    const matchTimer = setInterval(function() {
        minute += Math.floor(Math.random() * 4) + 2;
        if (minute >= 90) minute = 90;
        document.getElementById('match-minute').textContent = minute;

        const rng = Math.random() * 100;
        let homeGoalChance = (currentHomeOVR / (currentHomeOVR + currentAwayOVR)) * 14;
        let awayGoalChance = (currentAwayOVR / (currentAwayOVR + currentHomeOVR)) * 14;

        if (gameState.currentFormation === '5-3-2' && currentAwayOVR > currentHomeOVR && Math.random() < 0.2) {
            homeGoalChance += 5;
        }

        let triggeredTrait = null;
        if (myActiveTraits.length > 0 && Math.random() < 0.15) {
            triggeredTrait = myActiveTraits[Math.floor(Math.random() * myActiveTraits.length)];
        }

        if (rng < homeGoalChance || (triggeredTrait && ['speedster', 'sniper', 'playmaker', 'fox'].includes(triggeredTrait.trait.id))) {
            homeScore++;
            scoreHomeEl.textContent = homeScore;
            triggerGoalEffect(true);

            if (triggeredTrait) {
                addLog(`<div class="text-fuchsia-300 font-bold bg-gradient-to-r from-fuchsia-900/60 to-transparent p-3 rounded-lg border-l-4 border-fuchsia-500 shadow-[0_0_15px_rgba(217,70,239,0.3)] animate-fade-in-up">
                    ${triggeredTrait.trait.icon} KỸ NĂNG: ${triggeredTrait.trait.name.toUpperCase()}!<br>
                    <span class="text-white text-xs">${triggeredTrait.name} ${triggeredTrait.trait.desc} và ghi bàn ngoạn mục!</span>
                </div>`);
                playHaptic('heavy');
            } else {
                addLog(`<div class="text-green-300 font-bold bg-gradient-to-r from-green-900/60 to-transparent p-3 rounded-lg border-l-4 border-green-500 shadow-md animate-fade-in-up">⚽ Phút ${minute}': VÀO!!! Bàn thắng tuyệt đẹp cho ${gameState.myClubName.toUpperCase()}!</div>`);
            }
        } else if (rng > 100 - awayGoalChance) {
            if (triggeredTrait && ['wall', 'spider'].includes(triggeredTrait.trait.id)) {
                addLog(`<div class="text-cyan-300 font-bold bg-gradient-to-r from-cyan-900/60 to-transparent p-3 rounded-lg border-l-4 border-cyan-500 shadow-md animate-fade-in-up">
                    ${triggeredTrait.trait.icon} KỸ NĂNG: ${triggeredTrait.trait.name.toUpperCase()}!<br>
                    <span class="text-white text-xs">${triggeredTrait.name} cứu thua xuất thần cho ${gameState.myClubName}! Nguy hiểm trôi qua.</span>
                </div>`);
            } else {
                awayScore++;
                scoreAwayEl.textContent = awayScore;
                triggerGoalEffect(false);
                addLog(`<div class="text-red-300 font-bold bg-gradient-to-r from-red-900/60 to-transparent p-3 rounded-lg border-l-4 border-red-500 shadow-md animate-fade-in-up">⚽ Phút ${minute}': VÀO! ${opponent.name.toUpperCase()} chọc thủng lưới!</div>`);
            }
        } else if (rng > 30 && rng < 35 && myAttackers.length > 0) {
            let kicker = myAttackers[Math.floor(Math.random() * myAttackers.length)];
            let isPenalty = Math.random() > 0.5;
            let situation = isPenalty ? 'Phạt đền 11m' : 'Sút phạt trực tiếp';

            addLog(`<div class="text-yellow-300 italic px-2 animate-fade-in-up">⚡ Phút ${minute}': Cơ hội! ${kicker.name} đứng trước chấm ${situation}...</div>`);

            setTimeout(function() {
                let shootRNG = Math.random() * 100;
                let goalProb = (kicker.stats.SHO / (kicker.stats.SHO + currentAwayOVR)) * 100;

                if (shootRNG < goalProb + (isPenalty ? 20 : 0)) {
                    homeScore++;
                    scoreHomeEl.textContent = homeScore;
                    triggerGoalEffect(true);
                    addLog(`<div class="text-green-300 font-bold bg-gradient-to-r from-green-900/60 to-transparent p-3 rounded-lg border-l-4 border-green-500 shadow-md animate-fade-in-up">🎯 VÀO!!! Cú sút quá hiểm hóc của ${kicker.name}!</div>`);
                } else {
                    addLog(`<div class="text-slate-400 italic px-2 animate-fade-in-up">❌ Không vào! ${kicker.name} đã sút bóng đi trúng thủ môn đội bạn.</div>`);
                }
            }, 800);
        } else if (rng > 80 && rng < 83) {
            let isHomeCard = Math.random() > 0.5;
            if (isHomeCard && homeRedCards < 3) {
                homeRedCards++;
                currentHomeOVR = Math.floor(currentHomeOVR * 0.9);
                addLog(`<div class="text-red-500 font-black bg-red-950/50 p-2 rounded border border-red-500/50 animate-fade-in-up">🟥 Phút ${minute}': THẺ ĐỎ cho ${gameState.myClubName}! Đội bạn chỉ còn ${11 - homeRedCards} người. Sức mạnh giảm 10%!</div>`);
            } else if (!isHomeCard && awayRedCards < 3) {
                awayRedCards++;
                currentAwayOVR = Math.floor(currentAwayOVR * 0.9);
                addLog(`<div class="text-orange-500 font-black bg-orange-950/50 p-2 rounded border border-orange-500/50 animate-fade-in-up">🟥 Phút ${minute}': THẺ ĐỎ cho ${opponent.name}! Đội khách mất người!</div>`);
            }
        } else if (rng > 40 && rng < 45) {
            addLog(`<div class="text-slate-400 italic px-2 animate-fade-in-up">⏱ Phút ${minute}': Thế trận giằng co ở khu vực giữa sân...</div>`);
        } else if (rng > 70 && rng < 74) {
            addLog(`<div class="text-yellow-400 px-2 animate-fade-in-up">Phút ${minute}': 🧤 Thủ môn cản phá xuất thần! Một pha bóng thót tim!</div>`);
        }

        if (minute >= 90) {
            clearInterval(matchTimer);
            addLog('<div class="text-yellow-400 font-black text-center mt-4 mb-2 text-xl uppercase tracking-widest drop-shadow-md animate-fade-in-up">HẾT GIỜ!</div>');

            if (isPvp) {
                const finishBtn = document.getElementById('finish-match-btn');
                finishBtn.textContent = "Nhận Điểm Rank & Quay Về PvP";
                finishBtn.classList.remove('hidden');
                finishBtn.classList.add('animate-fade-in-up');
                finishBtn.onclick = function() {
                    finishPvpMatch(homeScore, awayScore, opponent);
                };
                return;
            }

            let matchFee = isFriendly ? 0 : -50000;
            let perfBonus = (homeScore > awayScore) ? (isFriendly ? 50000 : 300000) : (homeScore === awayScore ? (isFriendly ? 20000 : 100000) : 0);
            let cleanSheet = (awayScore === 0) ? (isFriendly ? 20000 : 150000) : 0;
            let bigWin = (homeScore - awayScore >= 3) ? (isFriendly ? 20000 : 200000) : 0;
            let sponsorMoney = isFriendly ? 100000 : 0;

            if (!gameState.myFacilities.stadium) gameState.myFacilities.stadium = 1;
            let currentStadium = STADIUM_STATS[gameState.myFacilities.stadium - 1];
            let ticketRevenue = currentStadium.capacity * currentStadium.ticketPrice;
            if (isFriendly) ticketRevenue = Math.floor(ticketRevenue * 0.3);

            let staffSalary = 0;
            if (gameState.myStaff.physio) staffSalary += gameState.myStaff.physio.salary;
            if (gameState.myStaff.coach) staffSalary += gameState.myStaff.coach.salary;

            let income = perfBonus + cleanSheet + bigWin + sponsorMoney + ticketRevenue;
            let financeBonus = Math.floor(income * (gameState.myFacilities.finance * 0.05));
            let totalEarnings = matchFee + income + financeBonus - staffSalary;

            addLog(`<div class="mt-3 mb-2 bg-slate-800 border border-yellow-500/50 p-4 rounded-xl text-xs sm:text-sm shadow-xl animate-fade-in-up">
                <div class="font-bold text-yellow-400 mb-3 border-b border-slate-700 pb-2 text-center tracking-widest uppercase">📊 Báo cáo Tài chính</div>
                <div class="space-y-1.5">
                    <div class="flex justify-between text-slate-300"><span>Phí tổ chức:</span><span class="text-red-400 font-medium">${matchFee < 0 ? '- €50,000' : 'Miễn phí'}</span></div>
                    ${ticketRevenue ? `<div class="flex justify-between text-slate-300"><span>Doanh thu Bán vé:</span><span class="text-green-400 font-medium">+ €${ticketRevenue.toLocaleString()}</span></div>` : ''}
                    ${sponsorMoney ? `<div class="flex justify-between text-slate-300"><span>Tài trợ giao hữu:</span><span class="text-green-400 font-medium">+ €${sponsorMoney.toLocaleString()}</span></div>` : ''}
                    ${perfBonus ? `<div class="flex justify-between text-slate-300"><span>Thưởng thành tích:</span><span class="text-green-400 font-medium">+ €${perfBonus.toLocaleString()}</span></div>` : ''}
                    ${cleanSheet ? `<div class="flex justify-between text-slate-300"><span>Sạch lưới:</span><span class="text-green-400 font-medium">+ €${cleanSheet.toLocaleString()}</span></div>` : ''}
                    ${bigWin ? `<div class="flex justify-between text-slate-300"><span>Thắng đậm:</span><span class="text-green-400 font-medium">+ €${bigWin.toLocaleString()}</span></div>` : ''}
                    ${staffSalary > 0 ? `<div class="flex justify-between text-slate-300"><span>Lương BHL:</span><span class="text-red-400 font-medium">- €${staffSalary.toLocaleString()}</span></div>` : ''}
                </div>
                <div class="flex justify-between font-bold mt-3 pt-3 border-t border-slate-700 text-sm bg-slate-900/50 p-2 rounded">
                    <span>Tổng nhận:</span>
                    <span class="${totalEarnings > 0 ? 'text-green-400' : 'text-red-400'} text-base">${totalEarnings > 0 ? '+' : ''} €${totalEarnings.toLocaleString()}</span>
                </div>
            </div>`);

            setTimeout(function() {
                const liveMatchView = document.getElementById('match-live');
                liveMatchView.scrollTop = liveMatchView.scrollHeight;
            }, 300);

            const finishBtn = document.getElementById('finish-match-btn');
            finishBtn.textContent = "Tiếp tục";
            finishBtn.classList.remove('hidden');
            finishBtn.classList.add('animate-fade-in-up');

            finishBtn.onclick = async function() {
                finishBtn.textContent = "Đang xử lý ngầm...";
                finishBtn.disabled = true;
                await processTransferMarket();
                await processFacilitiesAndStamina();

                let staffLog = await autoAssignFacilities();
                if (staffLog) {
                    logContainer.insertAdjacentHTML('beforeend', `<div class="mt-3 mb-2 bg-slate-800/80 border border-slate-600 p-4 rounded-xl text-xs sm:text-sm shadow-xl animate-fade-in-up">
                        <div class="font-bold text-white mb-2 border-b border-slate-700 pb-2 flex items-center gap-2">👔 Báo cáo Ban Huấn Luyện</div>
                        <div class="space-y-2">${staffLog}</div>
                    </div>`);
                    const liveMatchView = document.getElementById('match-live');
                    liveMatchView.scrollTop = liveMatchView.scrollHeight;
                }

                finishBtn.textContent = "Lưu thành tích vòng đấu";
                finishBtn.disabled = false;
                finishBtn.onclick = function() {
                    if (isFriendly) finishFriendlyMatch(totalEarnings);
                    else finishLeagueRound(homeScore, awayScore, totalEarnings);
                };
            };
        }
    }, 400);
}

export async function finishLeagueRound(userScore, botScore, totalEarnings) {
    showLoading("ĐANG CẬP NHẬT BXH...");
    try {
        let currentTotalEarnings = totalEarnings;
        let userTeam = gameState.leagueState.standings.find(function(t) { return t.isUser; });
        let botTeam = gameState.leagueState.standings.find(function(t) { return t.id === gameState.activeOpponent.id; });

        userTeam.played++;
        botTeam.played++;
        userTeam.gf += userScore;
        botTeam.gf += botScore;
        userTeam.ga += botScore;
        botTeam.ga += userScore;

        if (userScore > botScore) { userTeam.won++; botTeam.lost++; userTeam.points += 3; }
        else if (userScore < botScore) { botTeam.won++; userTeam.lost++; botTeam.points += 3; }
        else { userTeam.drawn++; botTeam.drawn++; userTeam.points += 1; botTeam.points += 1; }

        let playedIds = [userTeam.id, botTeam.id];
        let remainingBots = gameState.leagueState.standings.filter(function(t) { return !playedIds.includes(t.id); });
        remainingBots.sort(function() { return Math.random() - 0.5; });

        for (let i = 0; i < remainingBots.length; i += 2) {
            if (i + 1 >= remainingBots.length) break;
            let t1 = remainingBots[i];
            let t2 = remainingBots[i + 1];
            let diff = t1.ovr - t2.ovr;
            let t1Score = 0, t2Score = 0;
            let matchRng = Math.random();
            if (diff > 5) { t1Score = Math.floor(Math.random() * 3) + 1; t2Score = Math.floor(Math.random() * 2); }
            else if (diff < -5) { t2Score = Math.floor(Math.random() * 3) + 1; t1Score = Math.floor(Math.random() * 2); }
            else {
                if (matchRng < 0.4) { t1Score = Math.floor(Math.random() * 2) + 1; t2Score = 0; }
                else if (matchRng < 0.8) { t2Score = Math.floor(Math.random() * 2) + 1; t1Score = 0; }
                else { t1Score = Math.floor(Math.random() * 2); t2Score = t1Score; }
            }
            t1.played++; t2.played++; t1.gf += t1Score; t2.gf += t2Score; t1.ga += t2Score; t2.ga += t1Score;
            if (t1Score > t2Score) { t1.won++; t2.lost++; t1.points += 3; }
            else if (t1Score < t2Score) { t2.won++; t1.lost++; t2.points += 3; }
            else { t1.drawn++; t2.drawn++; t1.points += 1; t2.points += 1; }
        }

        sortStandings();
        if (!gameState.leagueState.rankHistory) gameState.leagueState.rankHistory = [];
        let finalRankInRound = gameState.leagueState.standings.findIndex(function(t) { return t.isUser; }) + 1;
        gameState.leagueState.rankHistory.push(finalRankInRound);
        gameState.leagueState.currentRound++;

        let endSeasonMessage = "";
        if (gameState.leagueState.currentRound === 32) {
            let finalRank = gameState.leagueState.standings.findIndex(function(t) { return t.isUser; }) + 1;
            let seasonPrize = getPrizeMoney(finalRank);
            let fameDiff = 0;
            if (finalRank === 1) fameDiff = 20;
            else if (finalRank === 11 || finalRank === 12) fameDiff = 10;
            else if (finalRank === 21 || finalRank === 22) fameDiff = 5;
            else if (finalRank >= 30) fameDiff = -15;
            else fameDiff = 2;

            gameState.myFame = Math.max(0, Math.min(100, gameState.myFame + fameDiff));
            currentTotalEarnings += seasonPrize;
            endSeasonMessage = `MÙA GIẢI ĐÃ KẾT THÚC! Xếp thứ ${finalRank}, nhận €${seasonPrize.toLocaleString()}!`;
            gameState.leagueState.promotedBots = [];
        }

        gameState.myBudget += currentTotalEarnings;
        updateHeaderDisplay();

        if (gameState.myQuest) {
            if (gameState.myQuest.type === 'goals') gameState.myQuest.progress += userScore;
            if (gameState.myQuest.type === 'cleansheet' && botScore === 0) gameState.myQuest.progress += 1;
            if (gameState.myQuest.type === 'win' && userScore > botScore) gameState.myQuest.progress += 1;
            if (gameState.myQuest.type === 'score_first' && userScore > 0) gameState.myQuest.progress += 1;

            if (gameState.myQuest.progress >= gameState.myQuest.target) {
                gameState.myBudget += gameState.myQuest.reward;
                pushNews('Hoàn thành Hợp đồng Tài trợ', `Đội bóng đã hoàn thành mục tiêu: ${gameState.myQuest.desc}. Nhận khoản thưởng nóng €${gameState.myQuest.reward.toLocaleString()}!`, true);
                if (typeof window.generateNewQuest === 'function') window.generateNewQuest();
            } else {
                setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), { quest: gameState.myQuest }, { merge: true });
            }
        }

        if (Math.random() < 0.15) {
            if (Math.random() > 0.5) {
                gameState.myBudget += 200000;
                pushNews('Nhà tài trợ vui vẻ', 'Lối đá đẹp mắt, nhà tài trợ thưởng nóng €200,000!', true);
            } else {
                gameState.myBudget -= 100000;
                pushNews('Án Phạt Nguội', 'LĐBĐ Việt Nam phạt CLB €100,000 do CĐV ném đồ xuống sân.', false);
            }
        }

        const batch = writeBatch(db);
        batch.set(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), {
            budget: gameState.myBudget, fame: gameState.myFame, facilities: gameState.myFacilities, news: gameState.newsInbox
        }, { merge: true });
        batch.set(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'league', 'state'), gameState.leagueState);
        batch.set(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'tactics'), {
            formation: gameState.currentFormation, startingXI: gameState.startingXI
        });
        await batch.commit();

        if (endSeasonMessage) showToast(endSeasonMessage, "success");
        else showToast("Đã lưu kết quả vòng đấu!", "success");

        document.getElementById('match-live').classList.add('hidden');
        document.getElementById('league-table-container').classList.remove('hidden');
        renderLeagueView();
        toggleNavLock(false);
        if (gameState.leagueState.currentRound <= 31 && document.getElementById('quick-play-btn')) {
            document.getElementById('quick-play-btn').classList.remove('hidden');
        }
    } catch (e) {
        showToast("Lỗi lưu kết quả!");
    } finally {
        hideLoading();
    }
}

export async function finishFriendlyMatch(totalEarnings) {
    showLoading("ĐANG LƯU...");
    try {
        gameState.myBudget += totalEarnings;
        updateHeaderDisplay();
        gameState.leagueState.friendlyMatchesPlayed = (gameState.leagueState.friendlyMatchesPlayed || 0) + 1;

        const batch = writeBatch(db);
        batch.set(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), {
            budget: gameState.myBudget, facilities: gameState.myFacilities, news: gameState.newsInbox
        }, { merge: true });
        batch.set(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'league', 'state'), gameState.leagueState);
        batch.set(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'tactics'), {
            formation: gameState.currentFormation, startingXI: gameState.startingXI
        });
        await batch.commit();

        document.getElementById('match-live').classList.add('hidden');
        document.getElementById('season-end-panel').classList.remove('hidden');
        document.getElementById('league-table-container').classList.remove('hidden');
        showToast("Hoàn tất trận giao hữu!", "success");
        renderLeagueView();
        toggleNavLock(false);
        if (gameState.leagueState.currentRound <= 31 && document.getElementById('quick-play-btn')) {
            document.getElementById('quick-play-btn').classList.remove('hidden');
        }
    } catch (e) {
        showToast("Lỗi!");
    } finally {
        hideLoading();
    }
}

export function initMatchEngineListeners() {
    document.getElementById('start-league-match-btn')?.addEventListener('click', function() {
        const opponentId = gameState.leagueState.schedule[gameState.leagueState.currentRound - 1];
        gameState.activeOpponent = gameState.leagueState.standings.find(function(t) { return t.id === opponentId; });
        startMatchEngine(gameState.activeOpponent, false, false);
    });

    document.getElementById('play-friendly-btn')?.addEventListener('click', function() {
        if ((gameState.leagueState.friendlyMatchesPlayed || 0) >= 5) {
            showToast("Hết lượt đá giao hữu mùa này!");
            return;
        }
        gameState.activeOpponent = gameState.leagueState.standings[Math.floor(Math.random() * gameState.leagueState.standings.length)];
        while (gameState.activeOpponent.isUser) {
            gameState.activeOpponent = gameState.leagueState.standings[Math.floor(Math.random() * gameState.leagueState.standings.length)];
        }
        startMatchEngine(gameState.activeOpponent, true, false);
    });

    document.getElementById('start-new-season-btn')?.addEventListener('click', async function() {
        window.hasCelebratedSeason = false;
        showLoading("THIẾT LẬP MÙA GIẢI MỚI...");
        try {
            let botStandings = gameState.leagueState.standings.filter(function(t) { return !t.isUser; });
            let relegatedBotIds = botStandings.slice(-2).map(function(b) { return b.id; });
            gameState.leagueState.standings = gameState.leagueState.standings.filter(function(t) { return !relegatedBotIds.includes(t.id); });

            if (gameState.leagueState.promotedBots && gameState.leagueState.promotedBots.length === 2) {
                gameState.leagueState.promotedBots.forEach(function(b) {
                    const ovr = Math.floor(Math.random() * 20) + 60;
                    gameState.leagueState.standings.push({
                        id: `bot_${Date.now()}_${Math.random()}`, name: b.name, isUser: false, ovr: ovr,
                        played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0
                    });
                });
            }

            gameState.leagueState.promotedBots = [];
            gameState.leagueState.currentRound = 1;
            gameState.leagueState.friendlyMatchesPlayed = 0;
            gameState.leagueState.rankHistory = [];
            gameState.leagueState.standings.forEach(function(t) {
                t.played = 0; t.won = 0; t.drawn = 0; t.lost = 0; t.gf = 0; t.ga = 0; t.points = 0;
            });
            gameState.leagueState.schedule = gameState.leagueState.standings
                .filter(function(t) { return !t.isUser; })
                .map(function(b) { return b.id; })
                .sort(function() { return Math.random() - 0.5; });

            const batch = writeBatch(db);
            let retirementLogs = [];
            let declineLogs = [];
            let activePlayers = [];

            gameState.globalPlayersList.forEach(function(p) {
                p.stamina = 100;
                p.injury = 0;
                p.age = (p.age || 20) + 1;

                if (p.age >= 32 && p.age < 35) {
                    let declineAmount = Math.floor(Math.random() * 3) + 1;
                    let statsKeys = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
                    for (let i = 0; i < declineAmount; i++) {
                        let rStat = statsKeys[Math.floor(Math.random() * statsKeys.length)];
                        p.stats[rStat] = Math.max(1, p.stats[rStat] - 1);
                    }
                    p.ovr = recalculateOVR(p.pos, p.stats);
                    p.value = p.ovr * (p.age >= 33 ? 50000 : 80000);
                    declineLogs.push(p.name);
                }

                if (p.age >= 35) {
                    retirementLogs.push(p.name);
                    let idx = gameState.startingXI.indexOf(p.id);
                    if (idx !== -1) gameState.startingXI[idx] = null;

                    gameState.myFacilities.medicalSlots = gameState.myFacilities.medicalSlots.filter(function(id) { return id !== p.id; });
                    gameState.myFacilities.trainingSlots = gameState.myFacilities.trainingSlots.filter(function(id) { return id !== p.id; });

                    batch.delete(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'players', p.id));
                    delete gameState.globalPlayersMap[p.id];
                } else {
                    activePlayers.push(p);
                    batch.update(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'players', p.id), {
                        stamina: 100, injury: 0, age: p.age, stats: p.stats, ovr: p.ovr, value: p.value
                    });
                }
            });

            gameState.globalPlayersList = activePlayers;

            await batch.commit();
            await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'league', 'state'), gameState.leagueState);
            await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'info'), { facilities: gameState.myFacilities }, { merge: true });
            await setDoc(doc(db, 'artifacts', appId, 'users', gameState.currentUserId, 'profile', 'tactics'), {
                formation: gameState.currentFormation, startingXI: gameState.startingXI
            });

            if (typeof window.renderSquadList === 'function') window.renderSquadList();
            if (typeof window.renderPitch === 'function') window.renderPitch();
            renderLeagueView();

            if (retirementLogs.length > 0) {
                pushNews("Treo Giày Giải Nghệ", `Trân trọng cảm ơn những đóng góp vĩ đại của: ${retirementLogs.join(', ')}. Các huyền thoại đã chính thức giã từ sự nghiệp quần đùi áo số do tuổi cao!`, null);
            }
            if (declineLogs.length > 0) {
                pushNews("Dấu Hiệu Tuổi Tác", `Các lão tướng: ${declineLogs.join(', ')} đã bước qua sườn dốc sự nghiệp. Thể lực và phản xạ đang có dấu hiệu chậm lại, OVR bắt đầu sụt giảm!`, false);
            }

            showToast("Mùa giải mới! Thể lực đã hồi phục 100%.", "success");
            if (document.getElementById('quick-play-btn')) document.getElementById('quick-play-btn').classList.remove('hidden');
        } catch (e) {
            showToast("Lỗi khởi tạo mùa giải!");
        } finally {
            hideLoading();
        }
    });

    document.getElementById('quick-play-btn')?.addEventListener('click', function() {
        if (gameState.leagueState.currentRound > 31) {
            showToast("Mùa giải đã kết thúc! Vui lòng bắt đầu mùa mới.", "warning");
            if (typeof window.switchView === 'function') window.switchView('league');
            return;
        }
        if (typeof window.switchView === 'function') window.switchView('league');
        document.getElementById('dashboard-section').scrollIntoView({ behavior: "smooth" });
    });
}
