export const showLoading = (msg = "ĐANG XỬ LÝ...") => {
    let loaderDiv = document.getElementById('global-loader');
    if (!loaderDiv) {
        loaderDiv = document.createElement('div'); loaderDiv.id = 'global-loader';
        loaderDiv.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] hidden flex-col items-center justify-center transition-opacity duration-300';
        loaderDiv.innerHTML = `<div class="w-16 h-16 border-4 border-slate-600 border-t-green-500 rounded-full animate-spin mb-4 shadow-[0_0_20px_rgba(34,197,94,0.4)]"></div><div id="global-loader-text" class="text-green-400 font-bold text-lg tracking-widest animate-pulse drop-shadow-md"></div>`;
        document.body.appendChild(loaderDiv);
    }
    document.getElementById('global-loader-text').textContent = msg;
    loaderDiv.classList.remove('hidden'); loaderDiv.classList.add('flex');
};

export const hideLoading = () => {
    const loaderDiv = document.getElementById('global-loader');
    if (loaderDiv) { loaderDiv.classList.add('hidden'); loaderDiv.classList.remove('flex'); }
};

export const showToast = (message, type = 'error') => {
    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-lg shadow-lg text-white text-sm animate-log transition-all duration-300 pointer-events-auto z-[999] ${type === 'error' ? 'bg-red-600' : (type === 'warning' ? 'bg-yellow-600' : 'bg-green-600')}`;
    toast.textContent = message; document.getElementById('toast-container').appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 5000);
};
