import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = { 
    apiKey: "AIzaSyCB5E_ENZDTJEp5oKJCgnpz2QYkNSSg1y0", 
    authDomain: "ai-apps-thlong.firebaseapp.com", 
    projectId: "ai-apps-thlong", 
    storageBucket: "ai-apps-thlong.firebasestorage.app", 
    messagingSenderId: "315097410913", 
    appId: "1:315097410913:web:db96ee02cd463c079ea920" 
};

export const app = initializeApp(firebaseConfig); 
export const auth = getAuth(app); 
export const db = getFirestore(app); 
export const appId = 'web-football-manager';

// Dữ liệu Game
export const BOT_CITY_NAMES = ["Hà Nội", "Sài Gòn", "Đà Nẵng", "Hải Phòng", "Cần Thơ", "Bình Dương", "Thanh Hóa", "Nghệ An", "Nam Định", "Quảng Ninh", "Bình Định", "Gia Lai", "Vũng Tàu", "Đồng Nai", "Khánh Hòa", "Huế", "Long An", "Đồng Tháp", "An Giang", "Kiên Giang", "Tây Ninh", "Bình Thuận", "Lâm Đồng", "Đắk Lắk", "Phú Thọ", "Bắc Ninh", "Hải Dương", "Vĩnh Phúc", "Ninh Bình", "Thái Bình", "Hà Tĩnh"];
export const RESERVE_BOT_NAMES = ["Bạc Liêu", "Sóc Trăng", "Cà Mau", "Trà Vinh", "Vĩnh Long", "Hậu Giang", "Bình Phước", "Tuyên Quang", "Yên Bái", "Lào Cai", "Sơn La", "Điện Biên", "Hà Giang", "Cao Bằng", "Bắc Kạn"];
export const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
export const FOREIGN_NAMES = ["Ronaldo", "Messi", "Haaland", "Mbappe", "De Bruyne", "Salah", "Van Dijk", "Alisson", "Pedri", "Bellingham", "Saka", "Odegaard"];
export const RICH_CLUBS = ["PSG", "Man City", "Real Madrid", "Bayern", "Chelsea", "Newcastle"];

export const STORE_ITEMS = [
    { id: 'item_speed', name: 'Giày Khinh Công', icon: '👟', desc: '+3 Tốc độ (PAC)', price: 500000, type: 'stat', stat: 'PAC', amount: 3 },
    { id: 'item_shoot', name: 'Bia Đỡ Đạn', icon: '🎯', desc: '+3 Dứt điểm (SHO)', price: 600000, type: 'stat', stat: 'SHO', amount: 3 },
    { id: 'item_pass', name: 'Băng Đội Trưởng', icon: '🧠', desc: '+3 Chuyền bóng (PAS)', price: 400000, type: 'stat', stat: 'PAS', amount: 3 },
    { id: 'item_def', name: 'Tạ Chân', icon: '🛡️', desc: '+3 Phòng ngự, +2 Thể chất', price: 500000, type: 'stat_multi', stats: {DEF: 3, PHY: 2} },
    { id: 'item_gacha', name: 'Gói Trẻ Vô Danh', icon: '⭐', desc: 'Mở 1 cầu thủ trẻ ngẫu nhiên (OVR 60-75)', price: 1000000, type: 'gacha' }
];

export const getPrizeMoney = (rank) => {
    if(rank === 1) return 5000000; if(rank === 2) return 3000000; if(rank >= 3 && rank <= 10) return 1000000;
    if(rank === 11 || rank === 12) return 2000000; if(rank >= 13 && rank <= 20) return 500000;
    if(rank === 21 || rank === 22) return 1000000; if(rank >= 23 && rank <= 30) return 200000;
    return 0; 
};

export const recalculateOVR = (pos, stats) => {
    let ovr = 0;
    if(pos === 'FWD') ovr = stats.SHO*0.4 + stats.PAC*0.25 + stats.DRI*0.2 + stats.PHY*0.1 + stats.PAS*0.05;
    else if(pos === 'MID') ovr = stats.PAS*0.35 + stats.DRI*0.25 + stats.PAC*0.1 + stats.SHO*0.1 + stats.DEF*0.1 + stats.PHY*0.1;
    else if(pos === 'DEF' || pos === 'GK') ovr = stats.DEF*0.45 + stats.PHY*0.3 + stats.PAC*0.15 + stats.PAS*0.1;
    return Math.round(ovr);
};
