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

// ================= DỮ LIỆU TÊN CLB VIỆT NAM =================
export const VN_CLUBS_POOL = [
    "Hà Nội FC", "CA Hà Nội", "Hồ Chí Minh United", "CA TP.HCM", 
    "Hải Phòng FC", "Thép xanh Nam Định", "SHB Đà Nẵng", "Thép Cần Thơ", 
    "Becamex Sài Gòn", "Đông Á Thanh Hóa", "Sông Lam Nghệ An", "Hồng Lĩnh Hà Tĩnh", 
    "Quảng Nam FC", "Quy Nhơn United", "Khatoco Khánh Hòa", "Hoàng Anh Gia Lai", 
    "Trường Tươi Đồng Nai", "Sài Gòn FC", "Đồng Tâm Long An", "Than Quảng Ninh",
    "Bình Minh SG Đồng Tháp", "Hùng Vương An Giang", "Kiên Long Kiên Giang", "Fico Tây Ninh", 
    "Vĩnh Long FC", "Thể Công Viettel", "Đồng Nai City", "Bắc Ninh FC", 
    "PVF-CAND", "Lâm Đồng FC", "Văn Hiến Univ.", "Gia Định FC",
    "Sanna Khánh Hoà", "Aurora Sài Gòn", "Hải Quan Sài Gòn", "Nam Á Tiền Giang"
];
export const RICH_CLUBS = ["Hà Nội FC", "CA Hà Nội", "Thép Xanh Nam Định", "Becamex Sài Gòn", "CA TP.HCM", "Nam Á Tiền Giang"];

// ================= DỮ LIỆU TÊN CẦU THỦ VIỆT NAM =================
export const VN_HOS = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Cổ", "Tăng"];
export const VN_TENS = [
    "Quang Hải", "Tiến Linh", "Văn Hậu", "Hoàng Đức", "Tuấn Anh", "Công Phượng", "Ngọc Hải", 
    "Văn Lâm", "Tiến Dũng", "Duy Mạnh", "Thành Chung", "Văn Thanh", "Hồng Duy", "Văn Toàn", 
    "Tuấn Hải", "Hùng Dũng", "Thanh Bình", "Việt Anh", "Tấn Tài", "Tuấn Tài", "Văn Khang", 
    "Thái Sơn", "Đình Bắc", "Minh Trọng", "Quốc Việt", "Vĩ Hào", "Thái Quý", "Minh Vương",
    "Phúc Toàn", "Huy Phương", "Thanh Sang", "Hoàng Minh", "Minh Tài", "Thiên Phú", "Hoàng Lộc", "Hữu Duy", "An Lộc"
];
export const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];

// Hàm hỗ trợ render tên ngẫu nhiên
export const generatePlayerName = (isStar = false) => {
    const ho = VN_HOS[Math.floor(Math.random() * VN_HOS.length)];
    const ten = VN_TENS[Math.floor(Math.random() * VN_TENS.length)];
    return `${ho} ${ten}${isStar ? " ⭐" : ""}`;
};

// ================= CỬA HÀNG VÀ CHỈ SỐ =================
export const STORE_ITEMS = [
    { id: 'item_speed', name: 'Giày Khinh Công', icon: '👟', desc: '+3 Tốc độ (PAC)', price: 500000, type: 'stat', stat: 'PAC', amount: 3 },
    { id: 'item_shoot', name: 'Bia Đỡ Đạn', icon: '🎯', desc: '+3 Dứt điểm (SHO)', price: 600000, type: 'stat', stat: 'SHO', amount: 3 },
    { id: 'item_pass', name: 'Băng Đội Trưởng', icon: '🧠', desc: '+3 Chuyền bóng (PAS)', price: 400000, type: 'stat', stat: 'PAS', amount: 3 },
    { id: 'item_def', name: 'Tạ Chân', icon: '🛡️', desc: '+3 Phòng ngự, +2 Thể chất', price: 500000, type: 'stat_multi', stats: {DEF: 3, PHY: 2} },
    { id: 'item_gacha', name: 'Lò Đào Tạo Trẻ', icon: '⭐', desc: 'Tuyển 1 tài năng trẻ nội binh (OVR 60-75)', price: 1000000, type: 'gacha' }
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
