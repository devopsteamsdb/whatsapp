document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('reportDate');
    const generateBtn = document.getElementById('generateBtn');

    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;

    generateBtn.addEventListener('click', () => {
        loadReport(dateInput.value);
    });

    // Initial load for today
    loadReport(today);
});

async function loadReport(date) {
    const loadingState = document.getElementById('loadingState');
    const reportContent = document.getElementById('reportContent');
    const noDataState = document.getElementById('noDataState');
    const summaryText = document.getElementById('summaryText');

    // Show loading
    loadingState.style.display = 'block';
    reportContent.style.display = 'none';
    noDataState.style.display = 'none';

    try {
        const response = await fetch(`/api/reports/daily?date=${date}`);
        const data = await response.json();

        loadingState.style.display = 'none';

        if (data.success) {
            if (data.count > 0) {
                summaryText.innerText = data.summary;
                document.getElementById('sourceBadge').innerText = `Source: ${data.source || 'Database'}`;
                document.getElementById('msgCount').innerText = `${data.count} messages`;
                reportContent.style.display = 'block';
            } else {
                noDataState.style.display = 'block';
            }
        } else {
            alert('Error generating report: ' + (data.error || 'Unknown error'));
            noDataState.style.display = 'block';
        }
    } catch (error) {
        console.error('Error fetching report:', error);
        loadingState.style.display = 'none';
        alert('Failed to connect to server.');
        noDataState.style.display = 'block';
    }
}
