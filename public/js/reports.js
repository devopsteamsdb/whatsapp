document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('reportDate');
    const generateBtn = document.getElementById('generateBtn');
    const useAIToggle = document.getElementById('useAIToggle');

    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;

    generateBtn.addEventListener('click', () => {
        loadReport(dateInput.value, useAIToggle.checked);
    });

    logToTerminal('System ready. Select a date and click Generate.');
});

function logToTerminal(message, type = 'info') {
    const terminal = document.getElementById('terminalOutput');
    const entry = document.createElement('div');
    const timestamp = new Date().toLocaleTimeString();

    let color = '#00ff00';
    if (type === 'error') color = '#ff4757';
    if (type === 'warning') color = '#ffa502';
    if (type === 'success') color = '#25d366';

    entry.innerHTML = `<span style="color: #666;">[${timestamp}]</span> <span style="color: ${color}">${message}</span>`;
    terminal.appendChild(entry);
    terminal.scrollTop = terminal.scrollHeight;
}

async function loadReport(date, useAI) {
    const loadingState = document.getElementById('loadingState');
    const reportContent = document.getElementById('reportContent');
    const noDataState = document.getElementById('noDataState');
    const summaryText = document.getElementById('summaryText');
    const loadingMessage = document.getElementById('loadingMessage');

    logToTerminal(`Starting report generation for ${date} (AI: ${useAI ? 'ON' : 'OFF'})...`);

    // Show loading
    loadingState.style.display = 'block';
    loadingMessage.textContent = useAI ? 'Generating report using Gemini AI...' : 'Fetching messages and generating list...';
    reportContent.style.display = 'none';
    noDataState.style.display = 'none';

    // Timeout controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
        logToTerminal('Request timed out after 30 seconds.', 'error');
    }, 30000);

    try {
        logToTerminal(`Fetching data from /api/reports/daily?date=${date}&useAI=${useAI}...`);

        const response = await fetch(`/api/reports/daily?date=${date}&useAI=${useAI}`, {
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await response.json();

        loadingState.style.display = 'none';

        if (data.success) {
            logToTerminal(`Received ${data.count} messages from ${data.source}.`, 'success');

            if (data.count > 0) {
                if (useAI) {
                    summaryText.innerText = data.summary;
                    logToTerminal('AI summary generated successfully.', 'success');
                } else {
                    // Manual dump
                    const dump = data.messages.map(m => {
                        const time = new Date(m.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        return `[${time}] ${m.sender_name}: ${m.body || '[Media]'}`;
                    }).join('\n');
                    summaryText.innerText = `### Raw Message Log for ${date}\n\n${dump}`;
                    logToTerminal('Raw message dump generated.', 'success');
                }

                document.getElementById('sourceBadge').innerText = `Source: ${data.source || 'Database'}`;
                document.getElementById('msgCount').innerText = `${data.count} messages`;
                reportContent.style.display = 'block';
            } else {
                logToTerminal('No data found for this date.', 'warning');
                noDataState.style.display = 'block';
            }
        } else {
            logToTerminal(`Error: ${data.error || 'Unknown error'}`, 'error');
            alert('Error generating report: ' + (data.error || 'Unknown error'));
            noDataState.style.display = 'block';
        }
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            logToTerminal('Server response took too long. Please try again.', 'error');
            alert('Report generation timed out.');
        } else {
            console.error('Error fetching report:', error);
            logToTerminal(`Connection Error: ${error.message}`, 'error');
            alert('Failed to connect to server.');
        }
        loadingState.style.display = 'none';
        noDataState.style.display = 'block';
    }
}
