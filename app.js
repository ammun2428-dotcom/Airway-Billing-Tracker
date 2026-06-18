// ==========================================================================
// APP STATE & CONSTANTS
// ==========================================================================
const state = {
  shipments: [],
  activeShipmentId: null,
  dbMode: 'local',
  aiMode: 'simulated'
};

const IATA_AIRPORTS = {
  'DEL': 'Indira Gandhi Int\'l Airport, Delhi',
  'BOM': 'Chhatrapati Shivaji Maharaj Int\'l Airport, Mumbai',
  'LHR': 'London Heathrow Airport, London',
  'JFK': 'John F. Kennedy Int\'l Airport, New York',
  'DXB': 'Dubai International Airport, Dubai',
  'SIN': 'Changi Airport, Singapore',
  'FRA': 'Frankfurt Airport, Frankfurt',
  'HKG': 'Hong Kong International Airport, Hong Kong'
};

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // Navigation Tabs Setup
  setupTabs();
  
  // Real-time Calculator Setup
  setupCalculator();
  
  // Initialize Lucide Icons
  lucide.createIcons();

  // Load Initial Shipments List
  fetchShipments();

  // Setup Event Listeners
  setupEventListeners();

  // Trigger system health checks
  checkSystemStatus();
}

// ==========================================================================
// SYSTEM HEALTH CHECKS
// ==========================================================================
async function checkSystemStatus() {
  const dbStatusDot = document.querySelector('#status-db .status-dot');
  const dbStatusLabel = document.querySelector('#status-db .status-label');
  const aiStatusDot = document.querySelector('#status-ai .status-dot');
  const aiStatusLabel = document.querySelector('#status-ai .status-label');

  try {
    // Check Database status by calling shipments endpoint
    const dbRes = await fetch('/api/shipments');
    if (dbRes.ok) {
      const mode = dbRes.headers.get('x-database-type') || 'local';
      state.dbMode = mode;
      
      dbStatusDot.className = 'status-dot active';
      if (mode === 'supabase') {
        dbStatusLabel.textContent = 'Database: Supabase (Live)';
      } else {
        dbStatusLabel.textContent = 'Database: Local JSON (Fallback)';
      }
    } else {
      throw new Error('Database api offline');
    }
  } catch (error) {
    dbStatusDot.className = 'status-dot danger';
    dbStatusLabel.textContent = 'Database: Offline';
  }

  try {
    // Check AI status by firing a preflight check to AI endpoint
    const aiRes = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preflight_ping', data: {} })
    });
    
    const mode = aiRes.headers.get('x-ai-type') || 'simulated';
    state.aiMode = mode;
    
    if (mode === 'groq') {
      aiStatusDot.className = 'status-dot active';
      aiStatusLabel.textContent = 'Groq AI: LLaMA-3.1 (Live)';
    } else {
      aiStatusDot.className = 'status-dot warning';
      aiStatusLabel.textContent = 'Groq AI: Simulation Mode';
    }
  } catch (error) {
    // Since preflight_ping isn't a real LLaMA action, it will return 400 or succeed.
    // We just check the headers returned. If we failed connection entirely:
    aiStatusDot.className = 'status-dot warning';
    aiStatusLabel.textContent = 'Groq AI: Simulation Mode';
  }
}

// ==========================================================================
// TAB ROUTING LOGIC
// ==========================================================================
function setupTabs() {
  const navButtons = document.querySelectorAll('.nav-btn');
  const panels = document.querySelectorAll('.tab-panel');
  const titleEl = document.getElementById('active-tab-title');
  const subtitleEl = document.getElementById('active-tab-subtitle');

  const tabMeta = {
    'dashboard-tab': {
      title: 'Dashboard Overview',
      subtitle: 'Real-time status updates and document processing metrics.'
    },
    'shipments-tab': {
      title: 'Cargo Shipments Master Registry',
      subtitle: 'Browse, filter, and track airway bill document compliance.'
    },
    'booking-tab': {
      title: 'New Airway Bill Registration',
      subtitle: 'Register shipments, calculate volumetric charge rates, and verify documents.'
    },
    'ai-tab': {
      title: 'LLaMA AI Cargo Lab',
      subtitle: 'Generate pricing models, check international customs, and standardise cargo.'
    }
  };

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      // Update buttons
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update panels
      panels.forEach(panel => {
        panel.classList.remove('active');
        if (panel.id === targetTab) {
          panel.classList.add('active');
        }
      });

      // Update titles
      if (tabMeta[targetTab]) {
        titleEl.textContent = tabMeta[targetTab].title;
        subtitleEl.textContent = tabMeta[targetTab].subtitle;
      }

      // Special action: if AI tab is opened, reload shipment options
      if (targetTab === 'ai-tab') {
        populateAiShipmentDropdown();
      }
    });
  });
}

// ==========================================================================
// CALCULATION LOGIC (CHARGEABLE WEIGHT)
// ==========================================================================
function setupCalculator() {
  const weightInput = document.getElementById('weight');
  const dimensionsInput = document.getElementById('dimensions');
  
  const actualWtEl = document.getElementById('calc-actual-wt');
  const volumeWtEl = document.getElementById('calc-volume-wt');
  const chargeableWtEl = document.getElementById('calc-chargeable-wt');

  function updateCalculation() {
    const actual = parseFloat(weightInput.value) || 0;
    actualWtEl.textContent = `${actual.toFixed(1)} kg`;

    const dimStr = dimensionsInput.value.trim().toLowerCase().replace(/\s/g, '');
    const parts = dimStr.split('x');
    
    let volumetric = 0;
    if (parts.length === 3) {
      const l = parseFloat(parts[0]) || 0;
      const w = parseFloat(parts[1]) || 0;
      const h = parseFloat(parts[2]) || 0;
      volumetric = (l * w * h) / 6000;
      volumeWtEl.textContent = `${volumetric.toFixed(1)} kg`;
    } else {
      volumeWtEl.textContent = `0.0 kg`;
    }

    const chargeable = Math.max(actual, volumetric);
    chargeableWtEl.textContent = chargeable.toFixed(1);
  }

  weightInput.addEventListener('input', updateCalculation);
  dimensionsInput.addEventListener('input', updateCalculation);
}

// ==========================================================================
// GET SHIPMENTS (FETCH)
// ==========================================================================
async function fetchShipments() {
  try {
    const res = await fetch('/api/shipments');
    if (!res.ok) throw new Error("Could not fetch shipments");
    
    const data = await res.json();
    state.shipments = data;
    
    renderDashboard();
    renderShipmentsList();
    updateDashboardStats();
    generateDocumentAlerts();
  } catch (error) {
    console.error("Error loading shipments:", error);
  }
}

// ==========================================================================
// STATS CALCULATION
// ==========================================================================
function updateDashboardStats() {
  const total = state.shipments.length;
  
  // Calculate counts
  let missingDocsCount = 0;
  let completedDocsCount = 0;
  let readyForAcceptance = 0;

  state.shipments.forEach(s => {
    const hasAllDocs = s.has_invoice && s.has_packing_list && s.has_id_proof && s.has_cargo_declaration;
    
    if (!hasAllDocs) {
      missingDocsCount++;
    } else {
      completedDocsCount++;
    }

    if (s.status === 'Ready for Cargo Acceptance' || s.status === 'In Transit' || s.status === 'Delivered') {
      readyForAcceptance++;
    }
  });

  // Render values
  document.getElementById('stat-total-shipments').textContent = total;
  document.getElementById('stat-missing-docs').textContent = missingDocsCount;
  document.getElementById('stat-completed-docs').textContent = completedDocsCount;
  document.getElementById('stat-ready-acceptance').textContent = readyForAcceptance;

  // Render percentages
  const missingPct = total > 0 ? Math.round((missingDocsCount / total) * 100) : 0;
  const completedPct = total > 0 ? Math.round((completedDocsCount / total) * 100) : 0;

  document.getElementById('stat-missing-percentage').textContent = `${missingPct}% of total load`;
  document.getElementById('stat-completed-percentage').textContent = `${completedPct}% ready for flight`;
}

// ==========================================================================
// ALERTS GENERATOR
// ==========================================================================
function generateDocumentAlerts() {
  const alertListContainer = document.getElementById('alert-list-container');
  const alertCountEl = document.getElementById('alert-count');
  const notificationCountEl = document.getElementById('notification-count');

  alertListContainer.innerHTML = '';
  let alertCount = 0;

  state.shipments.forEach(s => {
    const missingDocs = [];
    if (!s.has_invoice) missingDocs.push('Commercial Invoice');
    if (!s.has_packing_list) missingDocs.push('Packing List');
    if (!s.has_id_proof) missingDocs.push('ID Proof');
    if (!s.has_cargo_declaration) missingDocs.push('Cargo Declaration');

    if (missingDocs.length > 0) {
      alertCount++;
      const isCritical = s.cargo_type === 'Hazardous' || s.cargo_type === 'Perishable';
      
      const alertItem = document.createElement('div');
      alertItem.className = `alert-item ${isCritical ? 'critical' : ''}`;
      alertItem.innerHTML = `
        <i data-lucide="${isCritical ? 'alert-triangle' : 'alert-circle'}"></i>
        <div class="alert-item-body">
          <h4>${s.awb_number} Details Missing</h4>
          <p>Lacks: ${missingDocs.join(', ')}</p>
          <span>Route: ${s.origin || 'N/A'} ➔ ${s.destination || 'N/A'} | Type: ${s.cargo_type}</span>
        </div>
      `;
      
      // Make alert click open the details modal
      alertItem.addEventListener('click', () => openShipmentModal(s.id));
      alertListContainer.appendChild(alertItem);
    }
  });

  if (alertCount === 0) {
    alertListContainer.innerHTML = `
      <div class="empty-alerts">
        <i data-lucide="check-circle-2"></i>
        <p>No critical document alerts. All clear!</p>
      </div>
    `;
  }

  alertCountEl.textContent = `${alertCount} Alert${alertCount !== 1 ? 's' : ''}`;
  notificationCountEl.textContent = alertCount;
  lucide.createIcons({ attrs: { class: 'lucide-alert-icon' } });
}

// ==========================================================================
// RENDER: DASHBOARD RECENT LIST
// ==========================================================================
function renderDashboard() {
  const tbody = document.getElementById('dashboard-shipments-tbody');
  tbody.innerHTML = '';

  const recent = state.shipments.slice(0, 5);

  if (recent.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 30px;">
          No active shipments registered. Go to "New Booking" to register!
        </td>
      </tr>
    `;
    return;
  }

  recent.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 700;">${s.awb_number}</td>
      <td>${s.origin} ➔ ${s.destination}</td>
      <td>${s.cargo_type}</td>
      <td>${s.chargeable_weight} kg</td>
      <td>
        <div class="doc-badge-group">
          <span class="doc-badge ${s.has_invoice ? 'active' : 'missing'}">INV</span>
          <span class="doc-badge ${s.has_packing_list ? 'active' : 'missing'}">PKG</span>
          <span class="doc-badge ${s.has_id_proof ? 'active' : 'missing'}">ID</span>
          <span class="doc-badge ${s.has_cargo_declaration ? 'active' : 'missing'}">DEC</span>
        </div>
      </td>
      <td>
        <span class="status-badge ${getStatusClass(s.status)}">${s.status}</span>
      </td>
      <td>
        <button class="btn btn-secondary btn-sm btn-view-awb" data-id="${s.id}">Inspect</button>
      </td>
    `;
    
    tbody.appendChild(tr);
  });

  // Attach inspectors
  document.querySelectorAll('.btn-view-awb').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      openShipmentModal(id);
    });
  });
}

// ==========================================================================
// RENDER: SHIPMENTS TAB LIST
// ==========================================================================
function renderShipmentsList() {
  const tbody = document.getElementById('shipments-tbody');
  tbody.innerHTML = '';

  // Get search and filter parameters
  const searchQuery = document.getElementById('shipments-search').value.toLowerCase().trim();
  const filterType = document.getElementById('filter-cargo-type').value;
  const filterStatus = document.getElementById('filter-status').value;

  const filtered = state.shipments.filter(s => {
    const matchesSearch = s.awb_number.toLowerCase().includes(searchQuery) ||
                          s.sender_name.toLowerCase().includes(searchQuery) ||
                          s.receiver_name.toLowerCase().includes(searchQuery) ||
                          s.origin.toLowerCase().includes(searchQuery) ||
                          s.destination.toLowerCase().includes(searchQuery);
                          
    const matchesType = filterType === '' || s.cargo_type === filterType;
    const matchesStatus = filterStatus === '' || s.status === filterStatus;

    return matchesSearch && matchesType && matchesStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-secondary); padding: 40px;">
          No shipments found matching the filters.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 700; font-size: 15px;">${s.awb_number}</td>
      <td>
        <div style="font-weight: 600;">${s.sender_name}</div>
        <div style="font-size: 11px; color: var(--text-muted);">To: ${s.receiver_name}</div>
      </td>
      <td>
        <div style="font-weight: 700;">${s.origin} ➔ ${s.destination}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${IATA_AIRPORTS[s.destination] || 'Int\'l Airport'}</div>
      </td>
      <td>${s.cargo_type}</td>
      <td style="font-weight: 600;">${s.chargeable_weight} kg</td>
      <td>
        <div class="doc-badge-group">
          <span class="doc-badge ${s.has_invoice ? 'active' : 'missing'}">Invoice</span>
          <span class="doc-badge ${s.has_packing_list ? 'active' : 'missing'}">Packing</span>
          <span class="doc-badge ${s.has_id_proof ? 'active' : 'missing'}">ID Proof</span>
          <span class="doc-badge ${s.has_cargo_declaration ? 'active' : 'missing'}">Decl.</span>
        </div>
      </td>
      <td>
        <span class="status-badge ${getStatusClass(s.status)}">${s.status}</span>
      </td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary btn-sm btn-inspect" data-id="${s.id}">
            <i data-lucide="eye" style="width: 14px; height: 14px;"></i> Inspect
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Re-create icons inside table
  lucide.createIcons();

  // Attach Inspector handlers
  document.querySelectorAll('.btn-inspect').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      openShipmentModal(id);
    });
  });
}

function getStatusClass(status) {
  switch (status) {
    case 'Pending Documents': return 'pending';
    case 'Documents Complete': return 'complete';
    case 'Ready for Cargo Acceptance': return 'complete';
    case 'In Transit': return 'in-transit';
    case 'Delivered': return 'delivered';
    default: return '';
  }
}

// ==========================================================================
// MODAL MANAGEMENT (INSPECTION & CRUD UPDATE)
// ==========================================================================
function openShipmentModal(id) {
  const s = state.shipments.find(item => item.id === id);
  if (!s) return;

  state.activeShipmentId = id;

  // Set Modal text fields
  document.getElementById('modal-awb-title').textContent = s.awb_number;
  document.getElementById('modal-sender').textContent = s.sender_name;
  document.getElementById('modal-receiver').textContent = s.receiver_name;
  document.getElementById('modal-origin').textContent = s.origin;
  document.getElementById('modal-destination').textContent = s.destination;
  document.getElementById('modal-cargo-type').textContent = s.cargo_type;
  document.getElementById('modal-weight').textContent = `${s.weight} kg`;
  document.getElementById('modal-dimensions').textContent = s.dimensions;
  document.getElementById('modal-chargeable-weight').textContent = `${s.chargeable_weight} kg`;
  document.getElementById('modal-description').textContent = s.cargo_description || 'No description supplied.';

  // Checkboxes state
  document.getElementById('modal-check-invoice').checked = s.has_invoice;
  document.getElementById('modal-check-packing-list').checked = s.has_packing_list;
  document.getElementById('modal-check-id-proof').checked = s.has_id_proof;
  document.getElementById('modal-check-cargo-declaration').checked = s.has_cargo_declaration;

  // Select Dropdown workflow
  document.getElementById('modal-status-select').value = s.status;

  // Open overlay
  document.getElementById('shipment-modal').classList.remove('hidden');
}

function closeShipmentModal() {
  document.getElementById('shipment-modal').classList.add('hidden');
  state.activeShipmentId = null;
}

// ==========================================================================
// SAVE MODAL CHANGES (PUT)
// ==========================================================================
async function saveModalChanges() {
  if (!state.activeShipmentId) return;

  const payload = {
    id: state.activeShipmentId,
    has_invoice: document.getElementById('modal-check-invoice').checked,
    has_packing_list: document.getElementById('modal-check-packing-list').checked,
    has_id_proof: document.getElementById('modal-check-id-proof').checked,
    has_cargo_declaration: document.getElementById('modal-check-cargo-declaration').checked,
    status: document.getElementById('modal-status-select').value
  };

  try {
    const res = await fetch('/api/shipments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || "Save operational changes failed");
    }

    closeShipmentModal();
    fetchShipments(); // refresh lists
  } catch (error) {
    alert(`Error updating AWB: ${error.message}`);
  }
}

// ==========================================================================
// DELETE SHIPMENT (DELETE)
// ==========================================================================
async function deleteShipment() {
  if (!state.activeShipmentId) return;

  const confirmDelete = confirm("Are you sure you want to delete this shipment? This cannot be undone.");
  if (!confirmDelete) return;

  try {
    const res = await fetch('/api/shipments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: state.activeShipmentId })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || "Delete operational booking failed");
    }

    closeShipmentModal();
    fetchShipments();
  } catch (error) {
    alert(`Error deleting shipment: ${error.message}`);
  }
}

// ==========================================================================
// NEW BOOKING CREATION (POST)
// ==========================================================================
async function handleBookingSubmit(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const payload = {
    awb_number: formData.get('awb_number'),
    cargo_type: formData.get('cargo_type'),
    sender_name: formData.get('sender_name'),
    receiver_name: formData.get('receiver_name'),
    origin: formData.get('origin'),
    destination: formData.get('destination'),
    weight: formData.get('weight'),
    dimensions: formData.get('dimensions'),
    cargo_description: formData.get('cargo_description'),
    has_invoice: !!formData.get('has_invoice'),
    has_packing_list: !!formData.get('has_packing_list'),
    has_id_proof: !!formData.get('has_id_proof'),
    has_cargo_declaration: !!formData.get('has_cargo_declaration')
  };

  try {
    const res = await fetch('/api/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || "Failed to create shipment");
    }

    // Success: reset form and change tab to shipments
    e.target.reset();
    document.getElementById('calc-actual-wt').textContent = '0.0 kg';
    document.getElementById('calc-volume-wt').textContent = '0.0 kg';
    document.getElementById('calc-chargeable-wt').textContent = '0.0';

    fetchShipments();
    
    // Switch active tab to Shipments Tab
    document.getElementById('btn-shipments-tab').click();
  } catch (error) {
    alert(`Error creating booking: ${error.message}`);
  }
}

// Auto-generate unique AWB Number
function autoGenerateAwb() {
  const randomPart = Math.floor(10000000 + Math.random() * 90000000); // 8-digit number
  document.getElementById('awb_number').value = `AWB-${randomPart}`;
}

// ==========================================================================
// AI CARGO LAB CONTROLS
// ==========================================================================
function populateAiShipmentDropdown() {
  const select = document.getElementById('ai-shipment-select');
  const actionCards = document.querySelectorAll('.ai-action-card');
  
  // Clear select options keeping default placeholder
  select.innerHTML = '<option value="">-- Choose AWB --</option>';

  if (state.shipments.length === 0) {
    actionCards.forEach(c => c.disabled = true);
    return;
  }

  state.shipments.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.awb_number} (${s.origin}➔${s.destination} - ${s.cargo_type})`;
    select.appendChild(opt);
  });
}

function handleAiShipmentChange(e) {
  const activeId = e.target.value;
  const actionCards = document.querySelectorAll('.ai-action-card');
  
  if (activeId) {
    actionCards.forEach(c => c.disabled = false);
  } else {
    actionCards.forEach(c => {
      c.disabled = true;
      c.classList.remove('active');
    });
  }
}

async function runAiAction(action, data) {
  const loadingEl = document.getElementById('ai-loading');
  const resultEl = document.getElementById('ai-output-result');

  loadingEl.classList.remove('hidden');
  resultEl.innerHTML = ''; // Clear previous

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, data })
    });

    if (!res.ok) {
      throw new Error("AI query failed to execute");
    }

    const resData = await res.json();
    loadingEl.classList.add('hidden');
    
    // Parse markdown into terminal console
    resultEl.innerHTML = marked.parse(resData.result);

    // If description was cleaned, and we were running standardise, we can give a button to update description in DB!
    if (action === 'clean_description') {
      const cleanDescText = resData.result.replace(/["']/g, '').trim();
      resultEl.innerHTML = `
        <div class="terminal-welcome" style="margin-bottom: 20px;">
          <i data-lucide="sparkles"></i>
          <h4>Standardised Description:</h4>
          <p style="font-size: 16px; color:#fff; font-weight:600;">"${cleanDescText}"</p>
          <button class="btn btn-primary btn-sm" id="btn-apply-cleaned-desc" data-desc="${cleanDescText}" data-id="${data.id}">
            Apply Cleaned Description to Shipment
          </button>
        </div>
      `;
      lucide.createIcons();
      
      // Hook up Apply description update
      document.getElementById('btn-apply-cleaned-desc').addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        const desc = e.target.getAttribute('data-desc');
        await updateCargoDescription(id, desc);
        alert("Description successfully updated in the database!");
        fetchShipments(); // reload lists
      });
    }

  } catch (error) {
    loadingEl.classList.add('hidden');
    resultEl.innerHTML = `
      <div class="terminal-welcome" style="color: var(--color-danger);">
        <i data-lucide="alert-octagon"></i>
        <h4>Operational Prompt Error</h4>
        <p>${error.message}</p>
      </div>
    `;
    lucide.createIcons();
  }
}

async function updateCargoDescription(id, cleanDescription) {
  await fetch('/api/shipments', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: id,
      cargo_description: cleanDescription
    })
  });
}

// Helper: Quick Trigger from Shipment Modal to AI Lab
function triggerQuickModalAi(action) {
  const activeModalId = state.activeShipmentId;
  if (!activeModalId) return;

  const s = state.shipments.find(item => item.id === activeModalId);
  if (!s) return;

  closeShipmentModal();
  
  // Switch to AI tab
  document.querySelector('.nav-btn[data-tab="ai-tab"]').click();

  // Set selected dropdown item
  document.getElementById('ai-shipment-select').value = activeModalId;
  document.querySelectorAll('.ai-action-card').forEach(c => c.disabled = false);

  // Set active action card style
  document.querySelectorAll('.ai-action-card').forEach(c => {
    c.classList.remove('active');
    if (c.getAttribute('data-action') === action) {
      c.classList.add('active');
    }
  });

  // Run AI Action
  runAiAction(action, s);
}

// ==========================================================================
// EVENT LISTENERS REGISTER
// ==========================================================================
function setupEventListeners() {
  // Modal buttons
  document.getElementById('btn-close-modal').addEventListener('click', closeShipmentModal);
  document.getElementById('btn-save-modal-changes').addEventListener('click', saveModalChanges);
  document.getElementById('btn-delete-shipment').addEventListener('click', deleteShipment);
  
  // Modal overlay click closure
  document.getElementById('shipment-modal').addEventListener('click', (e) => {
    if (e.target.id === 'shipment-modal') {
      closeShipmentModal();
    }
  });

  // Quick Modal AI button triggers
  document.getElementById('btn-modal-ai-quote').addEventListener('click', () => triggerQuickModalAi('quotation'));
  document.getElementById('btn-modal-ai-customs').addEventListener('click', () => triggerQuickModalAi('customs'));

  // Form submission
  document.getElementById('booking-form').addEventListener('submit', handleBookingSubmit);
  document.getElementById('btn-generate-awb').addEventListener('click', autoGenerateAwb);

  // Shipments filter listeners
  document.getElementById('shipments-search').addEventListener('input', renderShipmentsList);
  document.getElementById('filter-cargo-type').addEventListener('change', renderShipmentsList);
  document.getElementById('filter-status').addEventListener('change', renderShipmentsList);
  
  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    document.getElementById('shipments-search').value = '';
    document.getElementById('filter-cargo-type').value = '';
    document.getElementById('filter-status').value = '';
    renderShipmentsList();
  });

  // Dashboard view all button redirects
  document.getElementById('btn-dashboard-view-all').addEventListener('click', () => {
    document.getElementById('btn-shipments-tab').click();
  });

  // AI Tab controls
  const aiSelect = document.getElementById('ai-shipment-select');
  aiSelect.addEventListener('change', handleAiShipmentChange);

  document.querySelectorAll('.ai-action-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const action = card.getAttribute('data-action');
      const shipmentId = aiSelect.value;
      const s = state.shipments.find(item => item.id === shipmentId);
      
      // Update UI active card selection styling
      document.querySelectorAll('.ai-action-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');

      if (s) {
        runAiAction(action, s);
      }
    });
  });

  // Booking Assistant AI actions
  document.getElementById('btn-assistant-clean-desc').addEventListener('click', () => {
    // Get form data and mock a temporary shipment
    const cargoDescription = document.getElementById('cargo_description').value;
    if (!cargoDescription) {
      alert("Please fill in the Cargo Description field first!");
      return;
    }
    
    // Switch to AI tab and clean
    document.querySelector('.nav-btn[data-tab="ai-tab"]').click();
    
    const mockData = {
      cargo_description: cargoDescription,
      cargo_type: document.getElementById('cargo_type').value,
      origin: document.getElementById('origin').value || 'DEL',
      destination: document.getElementById('destination').value || 'LHR',
      weight: document.getElementById('weight').value || 100,
      chargeable_weight: document.getElementById('weight').value || 100
    };

    // Style clean_description active
    document.querySelectorAll('.ai-action-card').forEach(c => {
      c.classList.remove('active');
      if (c.getAttribute('data-action') === 'clean_description') {
        c.classList.add('active');
      }
    });
    
    runAiAction('clean_description', mockData);
  });

  document.getElementById('btn-assistant-checklist').addEventListener('click', () => {
    const origin = document.getElementById('origin').value;
    const dest = document.getElementById('destination').value;
    if (!origin || !dest) {
      alert("Please enter both Origin and Destination IATA codes first!");
      return;
    }
    
    // Switch to AI tab and check customs
    document.querySelector('.nav-btn[data-tab="ai-tab"]').click();
    
    const mockData = {
      origin: origin,
      destination: dest,
      cargo_type: document.getElementById('cargo_type').value,
      weight: document.getElementById('weight').value || 100,
      chargeable_weight: document.getElementById('weight').value || 100
    };

    // Style customs active
    document.querySelectorAll('.ai-action-card').forEach(c => {
      c.classList.remove('active');
      if (c.getAttribute('data-action') === 'customs') {
        c.classList.add('active');
      }
    });
    
    runAiAction('customs', mockData);
  });
}
