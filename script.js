// Quick Billing - minimal single-file logic
const productKey = 'qb_products'
const billsKey = 'qb_bills'
const businessKey = 'qb_business'
const settingsKey = 'qb_settings'

let products = {}
let currentBill = []
let bills = []
let businessDetails = {}
let settings = { globalLowThreshold: 5 }

const q = id => document.getElementById(id)

// Audio feedback function - creates beep sound
function playBeep(frequency = 800, duration = 200, volume = 0.3) {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    oscillator.frequency.value = frequency
    oscillator.type = 'sine'
    
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000)
    
    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + duration / 1000)
  } catch(e) {
    console.log('Audio feedback unavailable')
  }
}

// Client-side QR generation (returns data URL)
function generateQRDataURL(productData){
  try{
    const payload = JSON.stringify(productData)
    const qr = new QRious({value: payload, size: 300})
    return qr.toDataURL()
  }catch(e){
    console.error('QR generation failed', e)
    return null
  }
}

function loadStorage(){
  products = JSON.parse(localStorage.getItem(productKey) || '{}')
  bills = JSON.parse(localStorage.getItem(billsKey) || '[]')
  businessDetails = JSON.parse(localStorage.getItem(businessKey) || '{}')
  settings = JSON.parse(localStorage.getItem(settingsKey) || JSON.stringify(settings))
}

function saveProducts(){ localStorage.setItem(productKey, JSON.stringify(products)) }
function saveBills(){ localStorage.setItem(billsKey, JSON.stringify(bills)) }
function saveBusinessDetails(){ localStorage.setItem(businessKey, JSON.stringify(businessDetails)) }
function saveSettings(){ localStorage.setItem(settingsKey, JSON.stringify(settings)) }

// Validate GST format (15 alphanumeric characters for Indian GST)
function validateGST(gst) {
  if (!gst) return true // Optional field
  return /^[A-Z0-9]{15}$/.test(gst.toUpperCase())
}

// Switch page and update sidebar
function switchPage(tabName, navBtn){
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  // Show selected page
  const page = document.getElementById(tabName)
  if(page) page.classList.add('active')
  // Update active nav items
  document.querySelectorAll('.nav-item, .tab-btn').forEach(b => b.classList.remove('active'))
  if(navBtn) navBtn.classList.add('active')
  const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`)
  if(tabBtn) tabBtn.classList.add('active')
  // Update page description
  const pageDescriptions = {
    'add-product': 'Create and manage products with quantity tracking',
    'scan-bill': 'Scan QR codes or manually add products to bills',
    'dashboard': 'View sales analytics, inventory alerts, and export data'
  }
  const desc = q('current-page-desc')
  if(desc) desc.textContent = pageDescriptions[tabName] || ''
}

function currencySymbol(code){
  return ({INR:'₹',USD:'$',EUR:'€',GBP:'£',JPY:'¥'}[code] || '')
}

function renderProducts(){
  const ul = q('product-list')
  ul.innerHTML = ''
  Object.entries(products).forEach(([code,p])=>{
    const li = document.createElement('li')
    const sym = currencySymbol(p.currency)
    const gst = p.gst || 18
    const qty = Number(p.qty || 0)
    const low = (p.lowThreshold !== undefined) ? Number(p.lowThreshold) : (settings.globalLowThreshold || 0)
    const lowBadge = (low > 0 && qty <= low) ? `<span class=\"low-badge\">Low (${qty})</span>` : `<span class=\"qty\">Qty: ${qty}</span>`
    li.innerHTML = `<div><strong>${p.name}</strong><br><small>${code} • ${sym}${p.price.toFixed(2)} (GST: ${gst}%) ${lowBadge}</small></div><div style=\"display:flex; gap:8px; align-items:center;\"><div class=\"product-menu\"><button class=\"menu-btn\" onclick=\"toggleMenu(this)\">⋮</button><div class=\"dropdown-menu\"><button class=\"dropdown-item\" onclick=\"editProduct('${code}')\">✏️ Edit</button><button class=\"dropdown-item\" onclick=\"reprintQR('${code}')\">🖨️ Reprint QR</button><button class=\"dropdown-item danger\" onclick=\"deleteProduct('${code}')\">🗑️ Delete</button></div></div></div>`
    ul.appendChild(li)
  })
  renderLowInventory()
}

function toggleMenu(btn){
  const menu = btn.nextElementSibling
  document.querySelectorAll('.dropdown-menu.show').forEach(m => {
    if(m !== menu) m.classList.remove('show')
  })
  menu.classList.toggle('show')
}

function editProduct(code){
  const p = products[code]
  if(!p) return
  const modal = q('edit-product-modal')
  q('edit-p-code').value = code
  q('edit-p-name').value = p.name
  q('edit-p-price').value = p.price
  q('edit-p-gst').value = p.gst || 18
  q('edit-p-currency').value = p.currency
  q('edit-p-qty').value = p.qty || 0
  q('edit-p-low').value = (p.lowThreshold !== undefined) ? p.lowThreshold : ''
  modal.style.display = 'flex'
  toggleMenu(document.querySelector('.menu-btn'))
}

function deleteProduct(code){
  if(confirm(`Delete "${products[code]?.name}"?`)){
    delete products[code]
    saveProducts()
    renderProducts()
  }
}

// Render low inventory list in dashboard
function renderLowInventory(){
  const list = q('low-inventory-list')
  if(!list) return
  list.innerHTML = ''
  const items = Object.entries(products).map(([code,p])=>({code, ...p}))
  const lowItems = items.filter(it=>{
    const low = (it.lowThreshold !== undefined) ? Number(it.lowThreshold) : Number(settings.globalLowThreshold || 0)
    return (low > 0) && (Number(it.qty||0) <= low)
  })
  if(lowItems.length===0){
    list.innerHTML = '<li style="color:#666;">No low inventory items</li>'
    return
  }
  lowItems.forEach(it=>{
    const li = document.createElement('li')
    li.style.padding = '8px 6px'
    li.style.border = '1px solid #eee'
    li.style.borderRadius = '6px'
    li.style.marginBottom = '8px'
    li.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><div><strong>${it.name}</strong><div style="font-size:13px; color:#666">Code: ${it.code} • Qty: ${it.qty||0} • Threshold: ${it.lowThreshold !== undefined ? it.lowThreshold : settings.globalLowThreshold}</div></div><div><button class="btn-secondary" onclick="openAdjustQty('${it.code}')">Adjust</button></div></div>`
    list.appendChild(li)
  })
}

function openAdjustQty(code){
  const p = products[code]
  if(!p) return alert('Product not found')
  const newQty = prompt(`Adjust quantity for ${p.name} (current: ${p.qty||0})`, p.qty||0)
  if(newQty === null) return
  const n = Number(newQty)
  if(Number.isNaN(n) || n<0) return alert('Invalid quantity')
  products[code].qty = n
  saveProducts(); renderProducts(); renderLowInventory()
}

function reprintQR(code){
  const p = products[code]
  if(!p) return
  const modal = q('print-qr-modal')
  q('qr-product-code').value = code
  q('qr-qty').value = 1
  modal.style.display = 'flex'
  toggleMenu(document.querySelector('.menu-btn'))
}

function renderBill(){
  const ul = q('bill-list')
  ul.innerHTML = ''
  let total = 0, totalGST = 0
  currentBill.forEach((item,idx)=>{
    const li = document.createElement('li')
    const sym = currencySymbol(item.currency)
    const gst = item.gst || 18
    const basePrice = item.price / (1 + gst / 100)
    const gstAmount = item.price - basePrice
    total += item.price
    totalGST += gstAmount
    li.innerHTML = `<div>${item.name || item.code} <small>${item.code}</small></div><div>${sym}${item.price.toFixed(2)} <button data-i="${idx}" class="rm">✕</button></div>`
    ul.appendChild(li)
  })
  ul.querySelectorAll('button.rm').forEach(b=>b.addEventListener('click',e=>{currentBill.splice(Number(e.currentTarget.dataset.i),1); renderBill()}))
  const cur = currentBill.length ? currentBill[0].currency : 'INR'
  const sym = currencySymbol(cur)
  q('bill-total').textContent = `${sym}${total.toFixed(2)}`
  
  const breakdown = q('gst-breakdown')
  if(currentBill.length > 0){
    const subtotal = total - totalGST
    breakdown.innerHTML = `<div style="border-top:1px solid #ddd; padding-top:10px; margin-top:10px; font-size:13px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
        <span>Subtotal (Before GST):</span>
        <strong>${sym}${subtotal.toFixed(2)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
        <span>Total GST:</span>
        <strong>${sym}${totalGST.toFixed(2)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; font-weight:bold; color:var(--primary);">
        <span>Total (Incl. GST):</span>
        <strong>${sym}${total.toFixed(2)}</strong>
      </div>
    </div>`
  } else {
    breakdown.innerHTML = ''
  }
}

function makeCode(){
  const rnd = Math.random().toString(36).substring(2,8).toUpperCase()
  return `SKU-${Date.now().toString().slice(-5)}-${rnd}`
}

function addProduct(code,name,price,currency='INR',gst=18, qty=0, lowThreshold){
  let k = code && code.trim()
  if(!k) k = makeCode()
  products[k] = {name,price:Number(price),currency,gst:Number(gst), qty: Number(qty||0)}
  if(lowThreshold !== undefined) products[k].lowThreshold = Number(lowThreshold)
  saveProducts(); renderProducts()
}

function addToBill(code){
  const p = products[code]
  if(p){ currentBill.push({code,name:p.name,price:p.price,currency:p.currency,gst:p.gst||18}) }
  else { currentBill.push({code,name:'Unknown',price:0,currency:'INR',gst:18}) }
  playBeep(800, 200, 0.3) // Beep sound when item added
  renderBill()
}

function checkout(){
  if(currentBill.length===0) return alert('Bill empty')
  const total = currentBill.reduce((s,i)=>s+i.price,0)
  let totalGST = 0
  currentBill.forEach(item => {
    const gst = item.gst || 18
    const basePrice = item.price / (1 + gst / 100)
    const gstAmount = item.price - basePrice
    totalGST += gstAmount
  })
  const customerInfo = {
    name: q('c-name')?.value || '',
    phone: q('c-phone')?.value || '',
    email: q('c-email')?.value || ''
  }
  const bill = {
    id: Date.now(),
    items: currentBill.slice(),
    total,
    totalGST,
    ts: new Date().toISOString(),
    customerInfo
  }
  bills.unshift(bill)
  saveBills()
  // Decrement inventory for sold items
  bill.items.forEach(item => {
    const code = item.code
    if(products[code] && typeof products[code].qty === 'number'){
      products[code].qty = Math.max(0, Number(products[code].qty) - 1)
    }
  })
  saveProducts()
  
  // Show print bill modal
  showPrintBillModal(bill)
  
  // Reset bill
  currentBill = []
  renderBill()
  renderDashboard()
}

function clearBill(){ currentBill = []; renderBill() }

function renderDashboard(){
  q('dash-count').textContent = bills.length
  const sales = bills.reduce((s,b)=>s+b.total,0)
  q('dash-sales').textContent = sales.toFixed(2)
  const rb = q('recent-bills')
  rb.innerHTML = ''
  bills.slice(0,5).forEach(b=>{
    const d = document.createElement('div')
    const subtotal = b.total - (b.totalGST || 0)
    const gstText = b.totalGST ? ` | GST: ${currencySymbol(b.items.length?b.items[0].currency:'INR')}${(b.totalGST || 0).toFixed(2)}` : ''
    d.innerHTML = `<div style="padding:10px; border:1px solid #ddd; border-radius:6px; margin-bottom:8px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
        <strong>#${b.id}</strong>
        <span style="color:#999; font-size:12px;">${new Date(b.ts).toLocaleString()}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:12px;">
        <span>${b.items.length} items</span>
        <span><strong>${currencySymbol(b.items.length?b.items[0].currency:'INR')}${b.total.toFixed(2)}</strong></span>
      </div>
    </div>`
    rb.appendChild(d)
  })
}

function renderDashboardFiltered(filteredBills){
  q('dash-count').textContent = filteredBills.length
  const sales = filteredBills.reduce((s,b)=>s+b.total,0)
  q('dash-sales').textContent = sales.toFixed(2)
  const rb = q('recent-bills')
  rb.innerHTML = ''
  if(filteredBills.length === 0){
    rb.innerHTML = '<p style="color:#999; text-align:center;">No bills found for selected date range</p>'
    return
  }
  filteredBills.forEach(b=>{
    const d = document.createElement('div')
    const subtotal = b.total - (b.totalGST || 0)
    const gstText = b.totalGST ? ` | GST: ${currencySymbol(b.items.length?b.items[0].currency:'INR')}${(b.totalGST || 0).toFixed(2)}` : ''
    d.innerHTML = `<div style="padding:10px; border:1px solid #ddd; border-radius:6px; margin-bottom:8px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
        <strong>#${b.id}</strong>
        <span style="color:#999; font-size:12px;">${new Date(b.ts).toLocaleString()}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:12px;">
        <span>${b.items.length} items</span>
        <span><strong>${currencySymbol(b.items.length?b.items[0].currency:'INR')}${b.total.toFixed(2)}</strong></span>
      </div>
    </div>`
    rb.appendChild(d)
  })
}

// --- Scanner ---
let stream = null
let scanInterval = null
let detector = null
let useJsQR = false
let useZXing = false
let useOpenCV = false
let zxingReader = null

async function startScanner(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return q('scanner-support').textContent = 'Camera not supported.'
  try{
    stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}})
    q('video').srcObject = stream
    q('start-scan').disabled = true
    q('stop-scan').disabled = false

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    // Check which library to use
    if(window.ZXing) {
      useZXing = true
      q('scanner-support').textContent = 'Using ZXing scanner'
    } else if('BarcodeDetector' in window){
      detector = new BarcodeDetector({formats:['ean_13','qr_code','code_128','code_39','upc_e','upc_a']})
      q('scanner-support').textContent = 'Using BarcodeDetector'
    } else if(window.cv && window.cv.QRCodeDetector){
      useOpenCV = true
      q('scanner-support').textContent = 'Using OpenCV QR detection'
    } else if(window.jsQR){
      useJsQR = true
      q('scanner-support').textContent = 'Using jsQR fallback (QR codes only)'
    } else {
      q('scanner-support').textContent = 'No scanner available - use manual entry'
      return
    }

    let lastCode = null
    let lastCodeTime = 0
    
    scanInterval = setInterval(async ()=>{
      try{
        const v = q('video')
        if(v.readyState < 2) return
        canvas.width = v.videoWidth; canvas.height = v.videoHeight
        ctx.drawImage(v,0,0,canvas.width,canvas.height)
        
        let detectedCode = null
        
        // Try ZXing via video decode (preferred)
        if(window.ZXing){
          try{
            if(!zxingReader) zxingReader = new window.ZXing.BrowserMultiFormatReader()
            // If ZXing's decodeFromVideoDevice is available, use it (it will handle continuous decoding)
            if(typeof zxingReader.decodeFromVideoDevice === 'function'){
              // stop our interval loop and hand decoding to ZXing which calls the callback when it finds codes
              clearInterval(scanInterval); scanInterval = null
              q('scanner-support').textContent = 'Using ZXing video decode (scanning)'
              const videoElement = q('video')
              let lastZ = null
              zxingReader.decodeFromVideoDevice(undefined, videoElement, (result, err) => {
                if(result && result.getText){
                  const txt = result.getText()
                  if(txt && txt !== lastZ){ lastZ = txt; console.log('ZXing(video) detected:', txt); handleDetected(txt) }
                }
                // ignore not-found errors, ZXing calls frequently when no code is present
              })
              return
            }
          }catch(e){ console.warn('ZXing video decode failed',e) }
        }
        
        // Try BarcodeDetector
        if(!detectedCode && detector){
          const barcodes = await detector.detect(canvas)
          if(barcodes && barcodes.length){ 
            detectedCode = barcodes[0].rawValue
            console.log('BarcodeDetector detected:', detectedCode)
          }
        }
        
        // Try OpenCV QR detection
        if(!detectedCode && useOpenCV && window.cv){
          try{
            const src = window.cv.imread(canvas)
            const qrDetector = new window.cv.QRCodeDetector()
            const result = qrDetector.detectAndDecode(src)
            src.delete()
            if(result && result[1] && result[1].length > 0){
              detectedCode = result[0]
              console.log('OpenCV detected:', detectedCode)
            }
          }catch(e){ console.warn('OpenCV decode err',e) }
        }
        
        // Try jsQR
        if(!detectedCode && useJsQR){
          const img = ctx.getImageData(0,0,canvas.width,canvas.height)
          const code = jsQR(img.data, img.width, img.height)
          if(code && code.data){ 
            detectedCode = code.data
            console.log('jsQR detected:', detectedCode)
          }
        }
        
        if(detectedCode && detectedCode !== lastCode){
          lastCode = detectedCode
          lastCodeTime = Date.now()
          handleDetected(detectedCode)
        }
      }catch(e){console.warn('scan err',e)}
    },100)
    q('scanner-support').textContent = 'Camera scanner active - show code clearly'
  }catch(err){
    q('scanner-support').textContent = 'Camera permission denied or unavailable.'
    console.error(err)
  }
}

function stopScanner(){
  if(scanInterval) clearInterval(scanInterval)
  scanInterval = null
  if(stream){stream.getTracks().forEach(t=>t.stop()); stream=null}
  if(zxingReader){
    try{ zxingReader.reset() }catch(e){/* ignore */}
    zxingReader = null
  }
  q('video').srcObject = null
  q('start-scan').disabled = false
  q('stop-scan').disabled = true
  q('scanner-support').textContent = 'Scanner stopped'
}

function handleDetected(code){
  // Try to parse as JSON (QR with product data)
  try{
    const productData = JSON.parse(code)
    if(productData.code && productData.name && productData.price !== undefined){
      // It's a product QR - add directly
      currentBill.push({code:productData.code, name:productData.name, price:productData.price, currency:productData.currency||'INR'})
      renderBill()
      console.log('Product from QR added:', productData)
      return
    }
  }catch(e){/* not JSON, treat as plain code */}
  
  // Plain code - set in manual entry
  q('manual-code').value = code
  addToBill(code)
}

// --- Wire up UI ---
function init(){
  console.log('🔄 Initializing app...')
  loadStorage(); renderProducts(); renderDashboard(); renderBill()
  
  // Show business details modal if not yet configured
  if(!businessDetails.name) {
    setTimeout(() => showBusinessModal(), 500)
  }
  
  // Populate global threshold input from settings
  if(q('global-low-threshold')) q('global-low-threshold').value = settings.globalLowThreshold || 5
  if(q('save-global-threshold')) q('save-global-threshold').addEventListener('click', ()=>{
    const val = Number(q('global-low-threshold').value || 0)
    settings.globalLowThreshold = val
    saveSettings()
    renderProducts()
    alert('Global low-stock threshold saved')
  })

  // Tab navigation - legacy (hidden)
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabName = e.target.dataset.tab
      console.log('Tab clicked:', tabName)
      switchPage(tabName, e.target)
    })
  })
  
  // Sidebar navigation (new)
  const navItems = document.querySelectorAll('.nav-item[data-tab]')
  console.log('Found nav items:', navItems.length)
  navItems.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const tabName = btn.dataset.tab
      console.log('Nav item clicked:', tabName)
      switchPage(tabName, btn)
    })
  })
  
  // Show first page by default
  const firstNav = document.querySelector('.nav-item[data-tab="add-product"]')
  console.log('First nav item:', firstNav)
  switchPage('add-product', firstNav)

  if(q('product-form')) q('product-form').addEventListener('submit',e=>{
    e.preventDefault()
    const code = q('p-code').value.trim()
    const name = q('p-name').value.trim()
    const price = Number(q('p-price').value || 0)
    const gst = Number(q('p-gst').value || 18)
    const currency = q('p-currency')? q('p-currency').value : 'INR'
    const qty = Number(q('p-qty')?.value || 0)
    const low = q('p-low')?.value ? Number(q('p-low').value) : undefined
    if(!name) return alert('Name required')
    addProduct(code,name,price,currency,gst,qty,low)
    q('p-code').value=''; q('p-name').value=''; q('p-price').value=''; q('p-gst').value='18'
    if(q('p-qty')) q('p-qty').value = '0'
    if(q('p-low')) q('p-low').value = ''
  })
  
  if(q('start-scan')) q('start-scan').addEventListener('click',startScanner)
  if(q('stop-scan')) q('stop-scan').addEventListener('click',stopScanner)
  
  // Generate QR button
  if(q('gen-qr-btn')) q('gen-qr-btn').addEventListener('click',async (e)=>{
    e.preventDefault()
    const code = q('p-code').value.trim() || makeCode()
    const name = q('p-name').value.trim()
    const price = Number(q('p-price').value || 0)
    const gst = Number(q('p-gst').value || 18)
    const currency = q('p-currency')? q('p-currency').value : 'INR'
    if(!name) return alert('Name required')
    
    const productData = {code, name, price, currency}
    
    try{
      const dataUrl = generateQRDataURL(productData)
      if(dataUrl){
        q('qr-img').src = dataUrl
        q('qr-data-label').textContent = `${name} (${code}) - ${currencySymbol(currency)}${price.toFixed(2)}`
        q('qr-display').style.display = 'block'
        console.log('QR generated (client-side) for:', productData)
      } else {
        alert('QR generation failed')
      }
    }catch(err){
      alert('Error generating QR: ' + err.message)
      console.error(err)
    }
  })
  
  if(q('print-qr-multiple')) q('print-qr-multiple').addEventListener('click',()=>{
    const code = q('p-code').value.trim()
    if(!code){ return alert('Product code required') }
    const modal = q('print-qr-modal')
    q('qr-product-code').value = code
    q('qr-qty').value = 6
    modal.style.display = 'flex'
  })
  
  if(q('manual-add')) q('manual-add').addEventListener('click',()=>{
    const c = q('manual-code').value.trim(); if(!c) return
    addToBill(c); q('manual-code').value=''
  })
  if(q('checkout')) q('checkout').addEventListener('click',checkout)
  if(q('clear-bill')) q('clear-bill').addEventListener('click',clearBill)

  // top actions
  if(q('export-data')) q('export-data').addEventListener('click',()=>{
    const data = {products,bills}
    const blob = new Blob([JSON.stringify(data, null, 2)],{type:'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'quick-billing-data.json'; a.click(); URL.revokeObjectURL(url)
  })
  if(q('import-data')) q('import-data').addEventListener('click',()=> q('import-file').click())
  if(q('import-file')) q('import-file').addEventListener('change',e=>{
    const f = e.target.files && e.target.files[0]
    if(!f) return
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const obj = JSON.parse(reader.result)
        if(obj.products) products = obj.products
        if(obj.bills) bills = obj.bills
        saveProducts(); saveBills(); renderProducts(); renderDashboard()
        alert('Import successful')
      }catch(err){alert('Invalid file')}
    }
    reader.readAsText(f)
  })

  if(q('export-csv')) q('export-csv').addEventListener('click',()=>{
    const rows = [['id','ts','total','items']]
    bills.forEach(b=>rows.push([b.id,b.ts,b.total,b.items.length]))
    const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv],{type:'text/csv'}); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'sales.csv'; a.click(); URL.revokeObjectURL(url)
  })

  if(q('print-bill')) q('print-bill').addEventListener('click',()=>{
    const w = window.open('','_blank')
    const total = currentBill.reduce((s,i)=>s+i.price,0)
    const cur = currentBill.length ? currentBill[0].currency : 'INR'
    const sym = currencySymbol(cur)
    const html = `<html><head><title>Bill</title><style>body{font-family:Arial;padding:20px}li{margin:8px 0}</style></head><body><h3>Bill</h3><ul>${currentBill.map(i=>`<li>${i.name||i.code} (${i.code}) - ${currencySymbol(i.currency)}${i.price.toFixed(2)}</li>`).join('')}</ul><div><strong>Total: ${sym}${total.toFixed(2)}</strong></div></body></html>`
    w.document.write(html); w.document.close(); w.focus(); w.print()
  })

  // Modal handlers
  document.addEventListener('click',e=>{
    const modal = e.target.closest('[role="dialog"]')
    if(!modal) return
    if(e.target === modal){ modal.style.display = 'none' }
  })
  
  // Close modals
  if(q('edit-product-modal')) q('edit-product-modal').style.display='none'
  if(q('print-qr-modal')) q('print-qr-modal').style.display='none'
  if(q('business-details-modal')) q('business-details-modal').style.display='none'
  
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click',()=>{
      btn.closest('[role="dialog"]').style.display = 'none'
    })
  })
  
  // Settings button for business details
  if(q('settings-btn')) q('settings-btn').addEventListener('click', showBusinessModal)
  
  // Save business details
  if(q('biz-gst')) q('biz-gst').addEventListener('input', (e) => {
    if(q('gst-error')) q('gst-error').style.display = 'none'
  })
  
  if(q('save-business')) q('save-business').addEventListener('click', saveBusinessModal)
  
  // Global low-stock threshold initialization
  if(q('global-low-threshold')){
    q('global-low-threshold').value = settings.globalLowThreshold || 0
    q('save-global-threshold').addEventListener('click', ()=>{
      const v = Number(q('global-low-threshold').value || 0)
      settings.globalLowThreshold = Number(v)
      saveSettings()
      renderProducts()
      alert('Global low-stock threshold saved')
    })
  }
  
  // Cancel buttons
  if(q('cancel-edit')) q('cancel-edit').addEventListener('click',()=>{
    if(q('edit-product-modal')) q('edit-product-modal').style.display = 'none'
  })
  
  if(q('cancel-qr-print')) q('cancel-qr-print').addEventListener('click',()=>{
    if(q('print-qr-modal')) q('print-qr-modal').style.display = 'none'
  })
  
  // Edit product modal
  q('confirm-edit').addEventListener('click',()=>{
    const code = q('edit-p-code').value
    const name = q('edit-p-name').value.trim()
    const price = Number(q('edit-p-price').value || 0)
    const gst = Number(q('edit-p-gst').value || 18)
    const currency = q('edit-p-currency').value
    const qty = Number(q('edit-p-qty')?.value || 0)
    const low = q('edit-p-low')?.value ? Number(q('edit-p-low').value) : undefined
    if(!name) return alert('Name required')
    if(products[code]){
      products[code] = Object.assign({}, products[code], {name, price, gst, currency, qty: qty})
      if(low !== undefined) products[code].lowThreshold = low
      else delete products[code].lowThreshold
      saveProducts()
      renderProducts()
      q('edit-product-modal').style.display = 'none'
    }
  })
  
  // Print QR modal
  q('confirm-qr-print').addEventListener('click',async ()=>{
    const code = q('qr-product-code').value
    const qty = Number(q('qr-qty').value || 1)
    if(qty < 1 || qty > 12){ return alert('Qty must be 1-12 for A4 layout') }
    if(!code){ return alert('Product code not found') }
    
    const p = products[code]
    if(!p){ return alert('Product not found') }
    
    // Generate A4 print page with QR codes in 3x4 grid
    try{
      const w = window.open('','_blank')
      const printHTML = await generateA4PrintPage(code, p, qty)
      w.document.write(printHTML)
      w.document.close()
      setTimeout(()=>{ w.focus(); w.print() }, 500)
      q('print-qr-modal').style.display = 'none'
    }catch(err){
      alert('Error generating print page: ' + err.message)
      console.error(err)
    }
  })
  
  if(q('product-list')) q('product-list').addEventListener('click',e=>{
    const li = e.target.closest('li')
    if(!li) return
    const addBtn = e.target.closest('button.add')
    const delBtn = e.target.closest('button.del')
    if(addBtn){ return }
    if(delBtn){ return }
    const small = li.querySelector('small')
    if(!small) return
    const text = small.textContent || ''
    const code = text.split('•')[0].trim()
    const p = products[code]
    if(p){ q('p-code').value = code; q('p-name').value = p.name; q('p-price').value = p.price; if(q('p-currency')) q('p-currency').value = p.currency }
  })
  
  // Print bill modal handlers
  if(q('print-bill-final')) q('print-bill-final').addEventListener('click', printBillFinal)
  if(q('share-whatsapp-btn')) q('share-whatsapp-btn').addEventListener('click', shareViaWhatsApp)
  
  // Dashboard date filtering
  let filteredBills = []
  if(q('apply-filter')) q('apply-filter').addEventListener('click',()=>{
    const fromDate = q('filter-from-date').value
    const toDate = q('filter-to-date').value
    if(!fromDate || !toDate) return alert('Select both from and to dates')
    
    const from = new Date(fromDate).getTime()
    const to = new Date(toDate).getTime() + 86400000 // Include entire day
    
    filteredBills = bills.filter(b => {
      const billTime = new Date(b.ts).getTime()
      return billTime >= from && billTime <= to
    })
    
    renderDashboardFiltered(filteredBills)
  })
  
  if(q('clear-filter')) q('clear-filter').addEventListener('click',()=>{
    q('filter-from-date').value = ''
    q('filter-to-date').value = ''
    filteredBills = []
    renderDashboard()
  })
  
  // Export buttons
  if(q('export-json-btn')) q('export-json-btn').addEventListener('click',()=>{
    const data = {products, bills: filteredBills.length > 0 ? filteredBills : bills}
    const blob = new Blob([JSON.stringify(data, null, 2)],{type:'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `billing-data-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  })
  
  if(q('export-csv-btn')) q('export-csv-btn').addEventListener('click',()=>{
    const rows = [['Bill ID','Date','Customer Name','Total Items','Subtotal','GST','Total']]
    const billsToExport = filteredBills.length > 0 ? filteredBills : bills
    billsToExport.forEach(b=>{
      const subtotal = b.total - (b.totalGST || 0)
      rows.push([
        b.id,
        new Date(b.ts).toLocaleString(),
        b.customerInfo?.name || '',
        b.items.length,
        subtotal.toFixed(2),
        (b.totalGST || 0).toFixed(2),
        b.total.toFixed(2)
      ])
    })
    const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv],{type:'text/csv'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `billing-report-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  })
  
  if(q('print-bills-btn')) q('print-bills-btn').addEventListener('click',()=>{
    const billsToExport = filteredBills.length > 0 ? filteredBills : bills
    if(billsToExport.length === 0) return alert('No bills to print')
    
    const w = window.open('','_blank')
    let billsHTML = '<h2 style="text-align:center;">All Bills Report</h2>'
    billsHTML += `<p style="text-align:center; color:#999; font-size:12px;">Generated: ${new Date().toLocaleString()}</p>`
    
    billsToExport.forEach(bill => {
      const cur = bill.items.length ? bill.items[0].currency : 'INR'
      const sym = currencySymbol(cur)
      const total = bill.total
      const totalGST = bill.totalGST || 0
      const subtotal = total - totalGST
      
      let itemsHTML = ''
      bill.items.forEach(item => {
        const gst = item.gst || 18
        const basePrice = item.price / (1 + gst / 100)
        const gstAmount = item.price - basePrice
        itemsHTML += `<tr><td>${item.name}</td><td>${item.code}</td><td style="text-align:right;">${sym}${basePrice.toFixed(2)}</td><td style="text-align:right;">${sym}${gstAmount.toFixed(2)}</td><td style="text-align:right;">${sym}${item.price.toFixed(2)}</td></tr>`
      })
      
      billsHTML += `<div style="page-break-after: always; padding: 20px; border: 1px solid #ddd; margin-bottom: 20px;">
        <h4>Bill #${bill.id}</h4>
        <p style="color:#999; font-size:12px;">${new Date(bill.ts).toLocaleString()}</p>
        ${bill.customerInfo?.name ? `<p><strong>Customer:</strong> ${bill.customerInfo.name} ${bill.customerInfo.phone ? '| ' + bill.customerInfo.phone : ''}</p>` : ''}
        <table style="width:100%; border-collapse:collapse; margin:10px 0; font-size:12px;">
          <tr style="background:#f5f7fa; border-bottom:1px solid #ddd;"><th style="text-align:left; padding:5px;">Item</th><th>Code</th><th style="text-align:right;">Base</th><th style="text-align:right;">GST</th><th style="text-align:right;">Total</th></tr>
          ${itemsHTML}
        </table>
        <div style="text-align:right; border-top:1px solid #ddd; padding-top:10px; font-size:12px;">
          <p style="margin:5px 0;"><strong>Subtotal:</strong> ${sym}${subtotal.toFixed(2)}</p>
          <p style="margin:5px 0;"><strong>GST:</strong> ${sym}${totalGST.toFixed(2)}</p>
          <p style="font-size:14px; color:#667eea;"><strong>TOTAL: ${sym}${total.toFixed(2)}</strong></p>
        </div>
      </div>`
    })
    
    w.document.write(`<!DOCTYPE html><html><head><title>Bills Report</title><style>body{font-family:Arial; padding:10px;} @media print{.no-print{display:none;}}</style></head><body>${billsHTML}</body></html>`)
    w.document.close()
    setTimeout(()=>{ w.focus(); w.print() }, 500)
  })
  
  if(q('import-json-btn')) q('import-json-btn').addEventListener('click',()=> q('import-json-file').click())
  if(q('import-json-file')) q('import-json-file').addEventListener('change',e=>{
    const f = e.target.files && e.target.files[0]
    if(!f) return
    const reader = new FileReader()
    reader.onload = ()=>{
      try{
        const obj = JSON.parse(reader.result)
        if(obj.products) products = obj.products
        if(obj.bills) bills = obj.bills
        saveProducts(); saveBills(); renderProducts(); renderDashboard()
        alert('✓ Import successful')
      }catch(err){alert('Invalid file')}
    }
    reader.readAsText(f)
  })
}

// Generate A4 print page with QR codes in 3x4 grid
async function generateA4PrintPage(code, product, qty){
  const qrImages = []
  
  // Generate QR images
  for(let i = 0; i < qty; i++){
    try{
      const d = {code, name: product.name, price: product.price, currency: product.currency}
      const dataUrl = generateQRDataURL(d)
      if(dataUrl) qrImages.push(dataUrl)
    }catch(err){
      console.error('Failed to generate QR for item', i, err)
    }
  }
  
  // Create HTML with 3x4 grid layout
  let qrHTML = ''
  for(let i = 0; i < qrImages.length; i++){
    const row = Math.floor(i / 3)
    if(i % 3 === 0) qrHTML += '<tr>'
    qrHTML += `<td style="padding:10px; text-align:center; border:1px solid #ccc;">
      <img src="${qrImages[i]}" style="width:180px; height:180px; margin-bottom:5px;">
      <div style="font-size:10px; font-weight:bold;">${product.name}</div>
      <div style="font-size:9px;">${code}</div>
      <div style="font-size:9px;">${currencySymbol(product.currency)}${product.price.toFixed(2)}</div>
    </td>`
    if((i + 1) % 3 === 0) qrHTML += '</tr>'
  }
  // Complete last row if needed
  const remainder = qrImages.length % 3
  if(remainder !== 0){
    for(let i = 0; i < 3 - remainder; i++){
      qrHTML += '<td style="padding:10px; border:1px solid #ccc;"></td>'
    }
    qrHTML += '</tr>'
  }
  
  return `<!DOCTYPE html>
<html>
<head>
  <title>Print QR Codes</title>
  <style>
    body { margin:0; padding:10px; font-family:Arial, sans-serif; }
    table { width:100%; border-collapse:collapse; }
    @media print {
      body { margin:0; padding:5px; }
      table { width:210mm; height:297mm; }
      td { page-break-inside:avoid; }
    }
  </style>
</head>
<body>
  <table>${qrHTML}</table>
</body>
</html>`
}

// Show print bill modal with full breakdown
function showPrintBillModal(bill){
  const cur = bill.items.length ? bill.items[0].currency : 'INR'
  const sym = currencySymbol(cur)
  const total = bill.total
  const totalGST = bill.totalGST || 0
  const subtotal = total - totalGST
  
  let itemsHTML = ''
  bill.items.forEach(item => {
    const gst = item.gst || 18
    const basePrice = item.price / (1 + gst / 100)
    const gstAmount = item.price - basePrice
    itemsHTML += `<tr>
      <td>${item.name}</td>
      <td>${item.code}</td>
      <td style="text-align:right;">${sym}${basePrice.toFixed(2)}</td>
      <td style="text-align:center;">${gst}%</td>
      <td style="text-align:right;">${sym}${gstAmount.toFixed(2)}</td>
      <td style="text-align:right;">${sym}${item.price.toFixed(2)}</td>
    </tr>`
  })
  
  const customerHTML = bill.customerInfo && (bill.customerInfo.name || bill.customerInfo.phone || bill.customerInfo.email) 
    ? `<div style="background: #f5f7fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
        <h4 style="margin-top: 0;">Customer Details</h4>
        ${bill.customerInfo.name ? `<p style="margin: 5px 0;"><strong>Name:</strong> ${bill.customerInfo.name}</p>` : ''}
        ${bill.customerInfo.phone ? `<p style="margin: 5px 0;"><strong>Phone:</strong> ${bill.customerInfo.phone}</p>` : ''}
        ${bill.customerInfo.email ? `<p style="margin: 5px 0;"><strong>Email:</strong> ${bill.customerInfo.email}</p>` : ''}
      </div>`
    : ''

  const businessHTML = businessDetails.name
    ? `<div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #4caf50;">
        <h4 style="margin-top: 0; color: #2e7d32;">Business Details</h4>
        <p style="margin: 5px 0; font-weight: bold; font-size: 16px;">${businessDetails.name}</p>
        ${businessDetails.address ? `<p style="margin: 5px 0; font-size: 13px;">${businessDetails.address}</p>` : ''}
        ${businessDetails.phone ? `<p style="margin: 5px 0;"><strong>Phone:</strong> ${businessDetails.phone}</p>` : ''}
        ${businessDetails.gst ? `<p style="margin: 5px 0;"><strong>GST:</strong> ${businessDetails.gst}</p>` : ''}
      </div>`
    : ''
  
  const billHTML = `
    <div style="font-family: Arial, sans-serif;">
      ${businessHTML}
      ${customerHTML}
      <h3 style="text-align: center; margin-bottom: 20px;">Bill Receipt</h3>
      <p style="text-align: center; color: #999; font-size: 12px;">Bill ID: ${bill.id} | Date: ${new Date(bill.ts).toLocaleString()}</p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background: #f5f7fa; border-bottom: 2px solid #ddd;">
            <th style="text-align: left; padding: 10px;">Product</th>
            <th style="text-align: left; padding: 10px;">Code</th>
            <th style="text-align: right; padding: 10px;">Base Price</th>
            <th style="text-align: center; padding: 10px;">GST %</th>
            <th style="text-align: right; padding: 10px;">GST Amount</th>
            <th style="text-align: right; padding: 10px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>
      <div style="border-top: 2px solid #ddd; padding-top: 15px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px;">
          <span>Subtotal (Before GST):</span>
          <strong>${sym}${subtotal.toFixed(2)}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 14px;">
          <span>Total GST:</span>
          <strong>${sym}${totalGST.toFixed(2)}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; color: var(--primary);">
          <span>TOTAL (Incl. GST):</span>
          <strong>${sym}${total.toFixed(2)}</strong>
        </div>
      </div>
      <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">Thank you for your purchase!</p>
    </div>
  `
  
  q('bill-preview-content').innerHTML = billHTML
  q('print-bill-modal').style.display = 'flex'
  
  // Store current bill for printing
  window.currentBillToPrint = bill
}

// Print bill to PDF/printer
function printBillFinal(){
  if(!window.currentBillToPrint) return
  const bill = window.currentBillToPrint
  const cur = bill.items.length ? bill.items[0].currency : 'INR'
  const sym = currencySymbol(cur)
  const total = bill.total
  const totalGST = bill.totalGST || 0
  const subtotal = total - totalGST
  
  let itemsHTML = ''
  bill.items.forEach(item => {
    const gst = item.gst || 18
    const basePrice = item.price / (1 + gst / 100)
    const gstAmount = item.price - basePrice
    itemsHTML += `<tr>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.code}</td>
      <td style="text-align:right; padding: 8px; border-bottom: 1px solid #ddd;">${sym}${basePrice.toFixed(2)}</td>
      <td style="text-align:center; padding: 8px; border-bottom: 1px solid #ddd;">${gst}%</td>
      <td style="text-align:right; padding: 8px; border-bottom: 1px solid #ddd;">${sym}${gstAmount.toFixed(2)}</td>
      <td style="text-align:right; padding: 8px; border-bottom: 1px solid #ddd;">${sym}${item.price.toFixed(2)}</td>
    </tr>`
  })
  
  const customerHTML = bill.customerInfo && (bill.customerInfo.name || bill.customerInfo.phone || bill.customerInfo.email) 
    ? `<div style="background: #f5f7fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
        <h4 style="margin-top: 0;">Customer Details</h4>
        ${bill.customerInfo.name ? `<p style="margin: 5px 0;"><strong>Name:</strong> ${bill.customerInfo.name}</p>` : ''}
        ${bill.customerInfo.phone ? `<p style="margin: 5px 0;"><strong>Phone:</strong> ${bill.customerInfo.phone}</p>` : ''}
        ${bill.customerInfo.email ? `<p style="margin: 5px 0;"><strong>Email:</strong> ${bill.customerInfo.email}</p>` : ''}
      </div>`
    : ''

  const businessHTML = businessDetails.name
    ? `<div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #4caf50;">
        <h4 style="margin-top: 0; color: #2e7d32;">Business Details</h4>
        <p style="margin: 5px 0; font-weight: bold; font-size: 16px;">${businessDetails.name}</p>
        ${businessDetails.address ? `<p style="margin: 5px 0; font-size: 13px;">${businessDetails.address}</p>` : ''}
        ${businessDetails.phone ? `<p style="margin: 5px 0;"><strong>Phone:</strong> ${businessDetails.phone}</p>` : ''}
        ${businessDetails.gst ? `<p style="margin: 5px 0;"><strong>GST:</strong> ${businessDetails.gst}</p>` : ''}
      </div>`
    : ''
  
  const w = window.open('','_blank')
  w.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bill Receipt</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #f5f7fa; border-bottom: 2px solid #ddd; padding: 10px; text-align: left; }
        td { padding: 8px; }
        h3 { text-align: center; margin-bottom: 20px; }
        .summary { border-top: 2px solid #ddd; padding-top: 15px; }
        .summary-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
        .total { font-size: 18px; font-weight: bold; color: #667eea; }
        .meta { text-align: center; color: #999; font-size: 12px; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      ${businessHTML}
      ${customerHTML}
      <h3>Bill Receipt</h3>
      <p class="meta">Bill ID: ${bill.id} | Date: ${new Date(bill.ts).toLocaleString()}</p>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Code</th>
            <th style="text-align:right;">Base Price</th>
            <th style="text-align:center;">GST %</th>
            <th style="text-align:right;">GST Amount</th>
            <th style="text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${itemsHTML}</tbody>
      </table>
      <div class="summary">
        <div class="summary-row">
          <span>Subtotal (Before GST):</span>
          <strong>${sym}${subtotal.toFixed(2)}</strong>
        </div>
        <div class="summary-row">
          <span>Total GST:</span>
          <strong>${sym}${totalGST.toFixed(2)}</strong>
        </div>
        <div class="summary-row total">
          <span>TOTAL (Incl. GST):</span>
          <strong>${sym}${total.toFixed(2)}</strong>
        </div>
      </div>
      <p class="meta" style="margin-top: 30px;">Thank you for your purchase!</p>
    </body>
    </html>
  `)
  w.document.close()
  setTimeout(()=>{ w.focus(); w.print() }, 500)
}

// Share bill via WhatsApp
function shareViaWhatsApp(){
  if(!window.currentBillToPrint) return alert('No bill to share')
  const bill = window.currentBillToPrint
  
  // Check if customer phone is available
  if(!bill.customerInfo || !bill.customerInfo.phone){
    alert('Customer phone number is required to share via WhatsApp')
    return
  }
  
  let phoneNumber = bill.customerInfo.phone.replace(/\D/g, '')
  
  // Add country code if not present (default to +91 for India, adjust as needed)
  if(phoneNumber.length === 10){
    // If 10 digits, assume Indian number and add country code 91
    phoneNumber = '91' + phoneNumber
  } else if(phoneNumber.length < 10){
    alert('Invalid phone number. Please enter a valid phone number.')
    return
  }
  
  // Ensure it starts with + for the URL
  if(!phoneNumber.startsWith('+')){
    phoneNumber = '+' + phoneNumber
  }
  
  // Format bill details for WhatsApp
  const cur = bill.items.length ? bill.items[0].currency : 'INR'
  const sym = currencySymbol(cur)
  const total = bill.total
  const totalGST = bill.totalGST || 0
  const subtotal = total - totalGST
  
  let billText = ''
  
  // Add business details if available
  if(businessDetails.name){
    billText += `*${businessDetails.name}*\n`
    if(businessDetails.address) billText += `${businessDetails.address}\n`
    if(businessDetails.phone) billText += `📱 ${businessDetails.phone}\n`
    if(businessDetails.gst) billText += `GST: ${businessDetails.gst}\n`
    billText += '\n'
  }
  
  // Add header
  billText += `*Invoice/Bill Receipt*\n`
  billText += `Bill ID: ${bill.id}\n`
  billText += `Date: ${new Date(bill.ts).toLocaleString()}\n\n`
  
  // Add customer info if available
  if(bill.customerInfo.name){
    billText += `*Customer Details*\n`
    billText += `Name: ${bill.customerInfo.name}\n`
    if(bill.customerInfo.email) billText += `Email: ${bill.customerInfo.email}\n`
    billText += '\n'
  }
  
  // Add items
  billText += `*Items*\n`
  billText += '─'.repeat(40) + '\n'
  
  bill.items.forEach(item => {
    const gst = item.gst || 18
    const basePrice = item.price / (1 + gst / 100)
    const gstAmount = item.price - basePrice
    billText += `${item.name} (${item.code})\n`
    billText += `  Base: ${sym}${basePrice.toFixed(2)} | GST (${gst}%): ${sym}${gstAmount.toFixed(2)}\n`
    billText += `  Total: ${sym}${item.price.toFixed(2)}\n\n`
  })
  
  // Add summary
  billText += '─'.repeat(40) + '\n'
  billText += `Subtotal: ${sym}${subtotal.toFixed(2)}\n`
  billText += `Total GST: ${sym}${totalGST.toFixed(2)}\n`
  billText += `*TOTAL: ${sym}${total.toFixed(2)}*\n\n`
  billText += `Thank you for your purchase!`
  
  // Create WhatsApp link - Remove + from phoneNumber for the URL
  const phoneForURL = phoneNumber.replace('+', '')
  const encodedMessage = encodeURIComponent(billText)
  const whatsappURL = `https://wa.me/${phoneForURL}?text=${encodedMessage}`
  
  // Open WhatsApp
  window.open(whatsappURL, '_blank')
}

// Business details setup & validation
function showBusinessModal(){
  const modal = q('business-details-modal')
  if(businessDetails.name) {
    q('biz-name').value = businessDetails.name || ''
    q('biz-address').value = businessDetails.address || ''
    q('biz-phone').value = businessDetails.phone || ''
    q('biz-gst').value = businessDetails.gst || ''
  }
  modal.style.display = 'flex'
}

function saveBusinessModal(){
  const name = q('biz-name').value.trim()
  const address = q('biz-address').value.trim()
  const phone = q('biz-phone').value.trim()
  const gst = q('biz-gst').value.trim().toUpperCase()
  
  if(!name || !address || !phone) {
    alert('Please fill in all required fields (Business Name, Address, Contact Number)')
    return
  }
  
  if(gst && !validateGST(gst)) {
    q('gst-error').style.display = 'block'
    return
  }
  
  q('gst-error').style.display = 'none'
  businessDetails = { name, address, phone, gst: gst || '' }
  saveBusinessDetails()
  
  const modal = q('business-details-modal')
  modal.style.display = 'none'
  alert('Business details saved!')
}

function updateBillWithBusinessDetails(billHTML) {
  if(!businessDetails.name) return billHTML
  
  const bizHTML = `
    <div style="background: #f5f7fa; padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #667eea;">
      <h4 style="margin-top: 0; color: #667eea;">Business Details</h4>
      <p style="margin: 5px 0;"><strong>${businessDetails.name}</strong></p>
      ${businessDetails.address ? `<p style="margin: 5px 0; font-size: 13px;">${businessDetails.address}</p>` : ''}
      ${businessDetails.phone ? `<p style="margin: 5px 0;"><strong>Phone:</strong> ${businessDetails.phone}</p>` : ''}
      ${businessDetails.gst ? `<p style="margin: 5px 0;"><strong>GST:</strong> ${businessDetails.gst}</p>` : ''}
    </div>
  `
  
  // Insert business details after opening <body>
  return billHTML.replace('<body>', `<body>${bizHTML}`)
}

document.addEventListener('DOMContentLoaded',init)

