const API_URL = 'http://localhost:3000/api';

// State
let currentTable = null;
let currentSchema = [];
let currentData = [];
let editingId = null; // null if adding, else { field, value }

// DOM Elements
const elements = {
    tableList: document.getElementById('table-list'),
    currentTableTitle: document.getElementById('current-table-title'),
    addBtn: document.getElementById('add-btn'),
    loadingState: document.getElementById('loading-state'),
    emptyState: document.getElementById('empty-state'),
    tableContainer: document.getElementById('table-container'),
    dataTable: document.getElementById('data-table'),
    dataThead: document.getElementById('data-thead'),
    dataTbody: document.getElementById('data-tbody'),
    formModal: document.getElementById('form-modal'),
    modalTitle: document.getElementById('modal-title'),
    dynamicForm: document.getElementById('dynamic-form'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    cancelBtn: document.getElementById('cancel-btn'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message'),
    confirmModal: document.getElementById('confirm-modal'),
    confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
    confirmCancelBtn: document.getElementById('confirm-cancel-btn')
};

// Initialize
document.addEventListener('DOMContentLoaded', fetchTables);

// Toast logic
function showToast(message, isError = false) {
    elements.toastMessage.textContent = message;
    elements.toast.classList.toggle('error', isError);
    elements.toast.classList.add('show');
    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 3000);
}

// Fetch list of tables for sidebar
async function fetchTables() {
    try {
        const res = await fetch(`${API_URL}/tables`);
        const tables = await res.json();

        elements.tableList.innerHTML = '';
        tables.forEach(table => {
            const li = document.createElement('li');
            li.className = 'nav-item';
            li.innerHTML = `<span class="nav-icon">⬡</span> ${table.replace(/_/g, ' ')}`;

            li.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                li.classList.add('active');
                loadTable(table);
            });

            elements.tableList.appendChild(li);
        });
    } catch (err) {
        showToast('Failed to load tables', true);
        console.error(err);
    }
}

// Load specific table schema and data
async function loadTable(tableName) {
    currentTable = tableName;
    elements.currentTableTitle.textContent = tableName.replace(/_/g, ' ');
    elements.addBtn.style.display = 'inline-flex';

    // Show loading
    elements.tableContainer.style.display = 'none';
    elements.emptyState.style.display = 'none';
    elements.loadingState.style.display = 'block';

    try {
        const [schemaRes, dataRes] = await Promise.all([
            fetch(`${API_URL}/schema/${tableName}`),
            fetch(`${API_URL}/data/${tableName}`)
        ]);

        if (!schemaRes.ok || !dataRes.ok) throw new Error('API Error');

        currentSchema = await schemaRes.json();
        currentData = await dataRes.json();

        renderTable();
    } catch (err) {
        showToast('Failed to load table data', true);
        elements.loadingState.style.display = 'none';
    }
}

// Render data table
function renderTable() {
    elements.loadingState.style.display = 'none';

    if (currentData.length === 0) {
        elements.emptyState.style.display = 'block';
        elements.tableContainer.style.display = 'none';
        return;
    }

    elements.emptyState.style.display = 'none';
    elements.tableContainer.style.display = 'block';

    // Headers
    elements.dataThead.innerHTML = `<tr>
        ${currentSchema.map(col => `<th>${col.field.replace(/_/g, ' ')}</th>`).join('')}
        <th>Actions</th>
    </tr>`;

    // Primary Key identification
    const pk = currentSchema.find(c => c.key === 'PRI')?.field;

    // Rows
    elements.dataTbody.innerHTML = '';
    currentData.forEach(row => {
        const tr = document.createElement('tr');

        currentSchema.forEach(col => {
            const td = document.createElement('td');
            let value = row[col.field];
            if (col.key === 'PRI' || col.field.toLowerCase().includes('id')) {
                td.className = 'mono';
                if (col.key === 'PRI') td.innerHTML = `<strong>#${value}</strong>`;
                else td.textContent = value !== null ? value : '-';
            } else if (value && col.type.includes('datetime')) {
                td.textContent = new Date(value).toLocaleString();
            } else if (value && col.type.includes('date')) {
                td.textContent = new Date(value).toLocaleDateString();
            } else {
                td.textContent = value !== null ? value : '-';
            }
            tr.appendChild(td);
        });

        const actionsTd = document.createElement('td');
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'actions';

        if (pk) {
            const pkValue = row[pk];

            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-ghost btn-xs';
            editBtn.textContent = 'Edit';
            editBtn.onclick = () => openModal(row);

            const delBtn = document.createElement('button');
            delBtn.className = 'btn btn-danger btn-xs';
            delBtn.textContent = 'Delete';
            delBtn.onclick = () => deleteRecord(pk, pkValue);

            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(delBtn);
        } else {
            actionsDiv.textContent = '-';
        }

        actionsTd.appendChild(actionsDiv);
        tr.appendChild(actionsTd);
        elements.dataTbody.appendChild(tr);
    });
}

// Modals logic
function openModal(rowData = null) {
    editingId = null;
    elements.modalTitle.textContent = rowData ? `Edit ${currentTable}` : `Add New ${currentTable}`;
    elements.dynamicForm.innerHTML = '';

    const pk = currentSchema.find(c => c.key === 'PRI')?.field;

    currentSchema.forEach(col => {
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'field';

        const label = document.createElement('label');
        label.textContent = col.field.replace(/_/g, ' ');

        let input;
        if (col.type.includes('enum')) {
            input = document.createElement('select');
            const options = col.type.match(/'([^']+)'/g).map(o => o.replace(/'/g, ''));
            options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt;
                o.textContent = opt;
                input.appendChild(o);
            });
        } else {
            input = document.createElement('input');
            if (col.type.includes('int') || col.type.includes('decimal')) {
                input.type = 'number';
                if (col.type.includes('decimal')) input.step = '0.01';
            } else if (col.type.includes('date')) {
                input.type = 'date';
            } else {
                input.type = 'text';
            }
        }

        input.name = col.field;

        if (rowData) {
            let val = rowData[col.field];
            if (val && col.type.includes('datetime')) {
                val = new Date(val).toISOString().slice(0, 16);
                input.type = 'datetime-local';
            } else if (val && col.type.includes('date')) {
                val = new Date(val).toISOString().split('T')[0];
            }
            input.value = val !== null ? val : '';

            if (col.field === pk) {
                editingId = { field: pk, value: rowData[pk] };
                input.readOnly = true;
                input.disabled = true;
            }
        } else if (col.extra === 'auto_increment') {
            input.placeholder = 'Auto-generated';
            input.readOnly = true;
            input.disabled = true;
        }

        if (col.null === 'NO' && col.extra !== 'auto_increment') {
            input.required = true;
        }

        fieldDiv.appendChild(label);
        fieldDiv.appendChild(input);
        elements.dynamicForm.appendChild(fieldDiv);
    });

    elements.formModal.classList.add('active');
}

function closeModal() {
    elements.formModal.classList.remove('active');
}

elements.addBtn.addEventListener('click', () => openModal());
elements.closeModalBtn.addEventListener('click', closeModal);
elements.cancelBtn.addEventListener('click', closeModal);

elements.dynamicForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(elements.dynamicForm);
    const data = Object.fromEntries(formData.entries());

    try {
        let url = `${API_URL}/data/${currentTable}`;
        let method = 'POST';
        if (editingId) {
            url += `/${editingId.field}/${editingId.value}`;
            method = 'PUT';
        }
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (res.ok) {
            showToast(result.message);
            closeModal();
            loadTable(currentTable);
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        showToast(err.message, true);
    }
});

let pendingDelete = null;
function deleteRecord(idField, idValue) {
    pendingDelete = { idField, idValue };
    elements.confirmModal.classList.add('active');
}

elements.confirmCancelBtn.addEventListener('click', () => {
    elements.confirmModal.classList.remove('active');
    pendingDelete = null;
});

elements.confirmDeleteBtn.addEventListener('click', async () => {
    if (!pendingDelete) return;
    const { idField, idValue } = pendingDelete;
    elements.confirmModal.classList.remove('active');
    pendingDelete = null;

    try {
        const res = await fetch(`${API_URL}/data/${currentTable}/${idField}/${idValue}`, {
            method: 'DELETE'
        });
        const result = await res.json();
        if (res.ok) {
            showToast(result.message);
            loadTable(currentTable);
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        showToast(err.message, true);
    }
});
