document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
});

async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const data = await response.json();

        if (data.success) {
            document.getElementById('settingPort').value = data.settings.PORT || '';
            document.getElementById('settingSession').value = data.settings.SESSION_PATH || '';
            document.getElementById('settingGeminiKey').value = data.settings.GEMINI_API_KEY || '';

            const model = data.settings.GEMINI_MODEL || 'gemini-1.5-flash';
            document.getElementById('settingGeminiModel').value = model;
            document.getElementById('settingLiteMode').checked = model.includes('lite');

            // Toggle visibility of model selector based on lite mode
            toggleModelSelector();

            document.getElementById('settingWebhook').value = data.settings.EXTERNAL_API_URL || '';
            document.getElementById('settingReportPrompt').value = data.settings.DAILY_REPORT_PROMPT || '';

            // Populate models if key exists
            if (data.settings.GEMINI_API_KEY) {
                fetchModels(data.settings.GEMINI_MODEL);
            }
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        showStatus('Failed to load settings', 'error');
    }
}

async function saveSettings() {
    const port = document.getElementById('settingPort').value;
    const session = document.getElementById('settingSession').value;
    const geminiKey = document.getElementById('settingGeminiKey').value;
    const isLite = document.getElementById('settingLiteMode').checked;
    const geminiModel = isLite ? 'gemini-2.5-flash-lite' : document.getElementById('settingGeminiModel').value;
    const webhook = document.getElementById('settingWebhook').value;
    const reportPrompt = document.getElementById('settingReportPrompt').value;
    const btn = document.getElementById('saveBtn');

    btn.disabled = true;
    btn.innerText = 'Saving...';

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                PORT: port,
                SESSION_PATH: session,
                GEMINI_API_KEY: geminiKey,
                GEMINI_MODEL: geminiModel,
                EXTERNAL_API_URL: webhook,
                DAILY_REPORT_PROMPT: reportPrompt
            })
        });

        const data = await response.json();

        if (data.success) {
            showStatus(data.message || 'Settings saved successfully', 'success');
        } else {
            showStatus('Error saving settings: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showStatus('Failed to save settings', 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = 'Save Settings';
    }
}

function showStatus(message, type) {
    const statusEl = document.getElementById('statusMessage');
    statusEl.style.display = 'block';
    statusEl.innerText = message;

    if (type === 'error') {
        statusEl.style.color = '#dc3545';
        statusEl.style.backgroundColor = '#ffe6e6';
        statusEl.style.padding = '10px';
        statusEl.style.borderRadius = '4px';
    } else {
        statusEl.style.color = '#28a745';
        statusEl.style.backgroundColor = '#e6fffa';
        statusEl.style.padding = '10px';
        statusEl.style.borderRadius = '4px';
    }

    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 5000);
}
async function fetchModels(currentModel) {
    try {
        const response = await fetch('/api/gemini/models');
        const data = await response.json();

        if (data.success && data.models.length > 0) {
            const select = document.getElementById('settingGeminiModel');
            // Keep current selection if not in list
            const options = data.models.map(m =>
                `<option value="${m.name}" ${m.name === currentModel ? 'selected' : ''}>${m.displayName || m.name}</option>`
            );
            select.innerHTML = options.join('');

            // Handle lite model selection logic if needed
            if (document.getElementById('settingLiteMode').checked && !currentModel.includes('lite')) {
                // Find a lite model if one exists
                const lite = data.models.find(m => m.name.includes('lite'))?.name;
                if (lite) select.value = lite;
            }
        }
    } catch (error) {
        console.error('Error fetching models:', error);
    }
}

function toggleModelSelector() {
    const isLite = document.getElementById('settingLiteMode').checked;
    const container = document.getElementById('modelContainer');
    if (container) {
        container.style.opacity = isLite ? '0.5' : '1';
        container.style.pointerEvents = isLite ? 'none' : 'auto';
    }
}

// Add event listener for lite mode toggle
const liteModeEl = document.getElementById('settingLiteMode');
if (liteModeEl) {
    liteModeEl.addEventListener('change', toggleModelSelector);
}
