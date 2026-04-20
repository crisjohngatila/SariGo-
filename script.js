let inventory = JSON.parse(localStorage.getItem('pos_inventory')) || {};
let debts = JSON.parse(localStorage.getItem('pos_debts')) || [];
let historyLog = JSON.parse(localStorage.getItem('pos_history')) || [];
let cart = [];
let scannerRunning = false;
let currentDebtIndex = null;
let html5QrCode = null; 
let newItemScanner = null; 
let debtMode = { active: false, customer: "", notes: "" };
let pendingBarcode = null;

debts = debts.filter(d => d && d.customer);
localStorage.setItem('pos_debts', JSON.stringify(debts));

// CUSTOM MODAL CONFIRMATION LOGIC
function sariConfirm(title, message, icon = '⚠️') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        document.getElementById('confirm-title').innerText = title;
        document.getElementById('confirm-msg').innerText = message;
        document.getElementById('confirm-icon').innerText = icon;
        
        modal.style.display = 'flex';

        const handleYes = () => {
            modal.style.display = 'none';
            cleanup();
            resolve(true);
        };
        const handleNo = () => {
            modal.style.display = 'none';
            cleanup();
            resolve(false);
        };
        const cleanup = () => {
            document.getElementById('confirm-yes').removeEventListener('click', handleYes);
            document.getElementById('confirm-no').removeEventListener('click', handleNo);
        };

        document.getElementById('confirm-yes').addEventListener('click', handleYes);
        document.getElementById('confirm-no').addEventListener('click', handleNo);
    });
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
}

async function stopAllScanners() {
    if (html5QrCode && html5QrCode.isScanning) {
        try { await html5QrCode.stop(); } catch(e) {}
    }
    if (newItemScanner && newItemScanner.isScanning) {
        try { await newItemScanner.stop(); } catch(e) {}
    }
    scannerRunning = false;
}

async function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    await stopAllScanners();
    document.getElementById(id).style.display = 'block';
    const navId = id.split('-')[0];
    const navBtn = document.getElementById('nav-' + navId);
    if(navBtn) navBtn.classList.add('active');
    if(id === 'scan-section') startScanner();
    if(id === 'inventory-section') renderInventory();
    if(id === 'history-section') renderHistory();
    if(id === 'debt-section') renderDebts();
}

async function startScanner() {
    if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
    if (html5QrCode.isScanning) return;
    try {
        await html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, 
            (barcode) => {
                if (navigator.vibrate) navigator.vibrate(60);
                if (inventory[barcode]) {
                    askQuantity(barcode);
                } else {
                    showToast("Item doesn't exist on database", "error");
                }
            }
        );
        scannerRunning = true;
    } catch (err) { console.error(err); }
}

async function startNewItemScanner() {
    await stopAllScanners();
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById('add-item-scan-section').style.display = 'block';
    if (!newItemScanner) newItemScanner = new Html5Qrcode("new-item-reader");
    try {
        await newItemScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, 
            async (barcode) => {
                if (navigator.vibrate) navigator.vibrate(60);
                await stopAllScanners();
                openProductModal(barcode);
            }
        );
    } catch (err) { console.error(err); }
}

function askQuantity(barcode) {
    const item = inventory[barcode];
    pendingBarcode = barcode;
    document.getElementById('qty-item-name').innerText = item.name;
    document.getElementById('qty-input').value = 1;
    document.getElementById('qty-modal').style.display = 'flex';
    stopAllScanners();
}

function confirmQty() {
    const qty = parseInt(document.getElementById('qty-input').value);
    const item = inventory[pendingBarcode];
    if (qty > 0) {
        for(let i=0; i<qty; i++) { cart.push({...item}); }
        renderCart();
        showToast(`Added ${qty} ${item.name}`);
    }
    closeModal();
}

function renderCart() {
    const list = document.getElementById('cart-list');
    let total = 0;
    list.innerHTML = cart.map((item, idx) => {
        total += item.price;
        return `<li class="item-row">
            <div><b>${item.name}</b><br><small>₱${item.price.toFixed(2)}</small></div>
            <button class="btn-del" onclick="removeFromCart(${idx})">🗑️</button>
        </li>`;
    }).join('');
    document.getElementById('cart-total').innerText = total.toFixed(2);
    if (!debtMode.active) calculateChange();
}

function calculateChange() {
    const total = parseFloat(document.getElementById('cart-total').innerText);
    const cash = parseFloat(document.getElementById('cash-received').value) || 0;
    const change = (cash >= total) ? (Math.round((cash - total) * 100) / 100) : 0;
    document.getElementById('change-amount').innerText = change.toFixed(2);
    return { cash, change };
}

function openProductModal(barcode) {
    const codeVal = barcode || "---";
    document.getElementById('new-barcode-val').innerText = codeVal;
    const existing = inventory[codeVal];
    document.getElementById('new-p-name').value = existing ? existing.name : "";
    document.getElementById('new-p-price').value = existing ? existing.price : "";
    document.getElementById('product-modal').style.display = 'flex';
}

function saveProduct() {
    let code = document.getElementById('new-barcode-val').innerText;
    let name = document.getElementById('new-p-name').value;
    let price = parseFloat(document.getElementById('new-p-price').value);
    if (!name || isNaN(price)) return showToast("Invalid input", "error");
    if (code === "---") code = "M-" + Date.now();
    inventory[code] = { name, price };
    localStorage.setItem('pos_inventory', JSON.stringify(inventory));
    closeModal();
    showSection('inventory-section');
    showToast("Item Saved!");
}

function renderInventory() {
    const list = document.getElementById('inventory-list');
    const keys = Object.keys(inventory);
    list.innerHTML = keys.length === 0 ? "<p style='text-align:center;'>Empty</p>" : keys.map(code => `
        <div class="item-row">
            <div><b>${inventory[code].name}</b><br>₱${inventory[code].price.toFixed(2)}</div>
            <div>
                <button class="btn-edit" onclick="openProductModal('${code}')">✏️</button>
                <button class="btn-del" onclick="deleteItem('${code}')">🗑️</button>
            </div>
        </div>`).join('');
}

async function deleteItem(code) {
    const proceed = await sariConfirm("Remove Item?", `Are you sure you want to delete ${inventory[code].name}?`, "🗑️");
    if(proceed) { 
        delete inventory[code]; 
        localStorage.setItem('pos_inventory', JSON.stringify(inventory)); 
        renderInventory(); 
        showToast("Item removed", "error");
    }
}

function completeSale() {
    const total = parseFloat(document.getElementById('cart-total').innerText);
    const { cash, change } = calculateChange();
    if (cart.length === 0 || cash < total) return showToast("Check cart/cash", "error");
    const sale = { 
        date: new Date().toLocaleString(), total: total.toFixed(2), 
        cash: cash.toFixed(2), change: change.toFixed(2),
        items: cart.map(i => ({ name: i.name, price: i.price })),
        type: 'cash'
    };
    historyLog.unshift(sale);
    localStorage.setItem('pos_history', JSON.stringify(historyLog));
    cart = []; document.getElementById('cash-received').value = ""; renderCart();
    showSection('history-section');
    showToast("Sale Completed");
}

function renderHistory() {
    document.getElementById('history-list').innerHTML = historyLog.length === 0 ? "<p style='text-align:center;'>No records</p>" : historyLog.map((h, i) => `
        <div class="history-card" onclick="openReceipt(${i})">
            <div class="history-card-top">
                <span>${h.date}</span>
                <span class="text-primary">₱${h.total}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <small>Cash: ₱${h.cash || h.total}</small>
                ${h.type === 'debt' ? '<span class="status-pill status-paid" style="font-size:0.6rem;">DEBT</span>' : ''}
            </div>
        </div>`).join('');
}

function openReceipt(index) {
    const h = historyLog[index];
    document.getElementById('receipt-date').innerText = h.date;
    document.getElementById('receipt-items').innerHTML = h.items.map(i => `<div class="receipt-row"><span>${i.name}</span><span>₱${i.price.toFixed(2)}</span></div>`).join('');
    
    let footerHtml = `<div class="divider"></div><div class="receipt-row"><b>Total:</b> <b>₱${h.total}</b></div>`;
    
    if(h.type === 'debt') {
        footerHtml += `<div class="divider"></div><small><b>Payment History (Debt):</b></small>`;
        h.payments.forEach(p => {
            footerHtml += `<div class="receipt-row"><small>${p.date}</small><small>₱${p.amount.toFixed(2)}</small></div>`;
        });
        footerHtml += `<div class="receipt-row" style="color:var(--success); margin-top:5px;"><b>Fully Paid On:</b> <b>${h.fullyPaidDate}</b></div>`;
    } else {
        footerHtml += `<div class="receipt-row"><small>Cash:</small> <small>₱${h.cash}</small></div>
                       <div class="receipt-row"><small>Change:</small> <small>₱${h.change}</small></div>`;
    }
    
    document.getElementById('receipt-total').innerHTML = footerHtml;
    document.getElementById('receipt-modal').style.display = 'flex';
}

function openNewDebtModal() { document.getElementById('new-debt-modal').style.display = 'flex'; }

function startDebtScanning() {
    const name = document.getElementById('debt-customer').value;
    if (!name) return showToast("Name required", "error");
    debtMode = { active: true, customer: name, notes: document.getElementById('debt-notes').value };
    cart = []; renderCart();
    document.getElementById('cart-title').innerText = "📝 Debt: " + name;
    document.getElementById('normal-checkout-area').style.display = 'none';
    document.getElementById('debt-checkout-area').style.display = 'block';
    closeModal(); showSection('scan-section');
}

function confirmDebtSale() {
    const total = parseFloat(document.getElementById('cart-total').innerText);
    if (cart.length === 0) return showToast("Cart Empty", "error");
    debts.unshift({ id: Date.now(), customer: debtMode.customer, totalOrig: total, balance: total, notes: debtMode.notes, date: new Date().toLocaleString(), status: 'unpaid', payments: [], items: [...cart] });
    localStorage.setItem('pos_debts', JSON.stringify(debts));
    cancelDebtMode(); showSection('debt-section');
}

function cancelDebtMode() {
    debtMode.active = false;
    document.getElementById('cart-title').innerText = "🛒 Current Cart";
    document.getElementById('normal-checkout-area').style.display = 'block';
    document.getElementById('debt-checkout-area').style.display = 'none';
    cart = []; renderCart();
}

function renderDebts() {
    const s = document.getElementById('debt-search').value.toLowerCase();
    const f = debts.filter(d => d.customer.toLowerCase().includes(s));
    document.getElementById('debt-list').innerHTML = f.map(d => `
        <div class="debt-card" onclick="viewDebtDetail(${debts.indexOf(d)})">
            <div class="debt-card-top"><span>${d.customer}</span><span class="status-pill status-${d.status}">${d.status}</span></div>
            <div class="receipt-row"><small>${d.date}</small><b class="text-primary">₱${d.balance.toFixed(2)}</b></div>
        </div>`).join('');
}

function viewDebtDetail(index) {
    currentDebtIndex = index; const d = debts[index];
    document.getElementById('detail-customer-name').innerText = d.customer;
    document.getElementById('detail-balance').innerText = `₱${d.balance.toFixed(2)}`;
    let h = `<small><b>Items:</b></small><br>` + d.items.map(i => `<div class="receipt-row"><span>${i.name}</span><span>₱${i.price.toFixed(2)}</span></div>`).join('');
    h += `<div class="divider"></div><small><b>Payments:</b></small>`;
    d.payments.forEach(p => { h += `<div class="receipt-row" style="color:green;"><span>${p.date}</span><span>-₱${p.amount.toFixed(2)}</span></div>`; });
    document.getElementById('payment-history-list').innerHTML = h;
    document.getElementById('debt-detail-modal').style.display = 'flex';
}

function submitPayment() {
    const amt = parseFloat(document.getElementById('payment-amount').value);
    if (!amt || amt <= 0) return;
    const d = debts[currentDebtIndex];
    d.balance = Math.round((d.balance - amt) * 100) / 100;
    d.payments.push({ date: new Date().toLocaleString(), amount: amt });
    d.status = d.balance <= 0 ? 'paid' : 'partial';

    if(d.balance <= 0) {
        const archivedDebt = {
            date: d.date, 
            fullyPaidDate: new Date().toLocaleString(),
            total: d.totalOrig.toFixed(2),
            items: d.items,
            payments: d.payments,
            type: 'debt',
            customer: d.customer
        };
        historyLog.unshift(archivedDebt);
        localStorage.setItem('pos_history', JSON.stringify(historyLog));
        debts.splice(currentDebtIndex, 1);
        showToast("Debt Fully Paid & Archived");
    }

    localStorage.setItem('pos_debts', JSON.stringify(debts)); 
    renderDebts(); 
    closeModal();
    document.getElementById('payment-amount').value = ""; 
}

async function deleteDebt() {
    if (currentDebtIndex !== null) {
        const proceed = await sariConfirm("Delete Debt?", "Permanently delete this debt record?", "💸");
        if (proceed) {
            debts.splice(currentDebtIndex, 1);
            localStorage.setItem('pos_debts', JSON.stringify(debts));
            renderDebts(); 
            closeModal(); 
            showToast("Debt record deleted", "error");
        }
    }
}

async function clearDebtHistory() { 
    const proceed = await sariConfirm("Reset Debts?", "Reset all outstanding debt records?", "💸");
    if(proceed) { debts = []; localStorage.setItem('pos_debts', '[]'); renderDebts(); showToast("Debts Reset"); } 
}

async function clearHistory() { 
    const proceed = await sariConfirm("Reset Sales?", "This will permanently erase all sales history records.", "📊");
    if(proceed) { historyLog = []; localStorage.setItem('pos_history', '[]'); renderHistory(); showToast("History Cleared"); } 
}

function closeModal() { 
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); 
    if (document.getElementById('scan-section').style.display !== 'none' && !scannerRunning) startScanner(); 
}

function removeFromCart(i) { cart.splice(i, 1); renderCart(); }

async function clearCart() { 
    const proceed = await sariConfirm("Clear Cart?", "Remove all items from the current cart?", "🛒");
    if(proceed) { cart = []; renderCart(); showToast("Cart Cleared", "error"); } 
}

window.onload = () => { showSection('scan-section'); };
