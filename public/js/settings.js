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
            document.getElementById('settingGeminiApiKey').value = data.settings.GEMINI_API_KEY || '';
            document.getElementById('settingDarkMode').checked = data.settings.DARK_MODE !== 'false';

            const model = data.settings.GEMINI_MODEL || 'gemini-1.5-flash';
            document.getElementById('settingGeminiModel').value = model;

            document.getElementById('settingWebhook').value = data.settings.EXTERNAL_API_URL || '';
            document.getElementById('settingReportPrompt').value = data.settings.DAILY_REPORT_PROMPT || '';

            // Apply theme live
            if (data.settings.DARK_MODE === 'false') {
                document.body.classList.add('light-mode');
            } else {
                document.body.classList.remove('light-mode');
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
    const geminiKey = document.getElementById('settingGeminiApiKey').value;
    const geminiModel = document.getElementById('settingGeminiModel').value;
    const webhook = document.getElementById('settingWebhook').value;
    const reportPrompt = document.getElementById('settingReportPrompt').value;
    const darkMode = document.getElementById('settingDarkMode').checked;
    const btn = document.getElementById('saveBtn');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Saving...';

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
                DAILY_REPORT_PROMPT: reportPrompt,
                DARK_MODE: darkMode.toString()
            })
        });

        const data = await response.json();

        if (data.success) {
            showStatus(data.message || 'Settings saved successfully', 'success');
            localStorage.setItem('DARK_MODE', darkMode.toString());
        } else {
            showStatus('Error saving settings: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showStatus('Failed to save settings', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save Settings';
    }
}

// Add live theme toggle
document.getElementById('settingDarkMode').addEventListener('change', (e) => {
    if (e.target.checked) {
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode');
    }
});

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
