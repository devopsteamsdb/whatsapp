(function () {
    // Check for saved theme preference or system preference
    async function applyTheme() {
        try {
            const response = await fetch('/api/settings');
            const data = await response.json();

            if (data.success && data.settings) {
                const darkMode = data.settings.DARK_MODE;
                if (darkMode === 'false') {
                    document.body.classList.add('light-mode');
                    localStorage.setItem('DARK_MODE', 'false');
                } else {
                    document.body.classList.remove('light-mode');
                    localStorage.setItem('DARK_MODE', 'true');
                }
            }
        } catch (e) {
            console.error('Failed to load theme preference', e);
        }
    }

    // Apply theme immediately on script execution (if available in localStorage)
    const savedMode = localStorage.getItem('DARK_MODE');
    if (savedMode === 'false') {
        document.documentElement.classList.add('light-mode');
        // We handle body in DOMContentLoaded if script is in head
        document.addEventListener('DOMContentLoaded', () => document.body.classList.add('light-mode'));
    }

    // Also fetch from API to ensure sync
    applyTheme();
})();
