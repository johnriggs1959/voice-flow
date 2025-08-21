export class ThemeManager {
    constructor() {
        console.log('=== ThemeManager Constructor START ===');
        this.currentTheme = 'dark'; // Default theme to dark
        this.themes = new Map();
        this.eventListeners = new Set();
        this.transitionTimeout = null;
        
        // Initialize themes
        this.initializeThemes();
        
        // Load saved theme
        console.log('About to load saved theme...');
        this.loadSavedTheme();
        console.log('Current theme after load:', this.currentTheme);
        
        // DON'T apply theme here - it's already applied by index.html
        // and applying it here will overwrite the saved preference
        // REMOVED: this.applyTheme(this.currentTheme, false);
        
        // Listen for system theme changes
        this.setupSystemThemeListener();
        console.log('=== ThemeManager Constructor END ===');
    }
    
    // Initialize available themes
    initializeThemes() {
        this.themes.set('current', {
            name: 'Purple',
            description: 'Purple gradient theme',
            category: 'default'
        });
        
        this.themes.set('dark', {
            name: 'Dark',
            description: 'Dark theme with subtle accents',
            category: 'standard'
        });
        
        this.themes.set('light', {
            name: 'Light',
            description: 'Clean light theme',
            category: 'standard'
        });
    }
    
    // Load theme from localStorage
    loadSavedTheme() {
        try {
            const savedTheme = localStorage.getItem('ai-assistant-theme');
            if (savedTheme && this.themes.has(savedTheme)) {
                this.currentTheme = savedTheme;
                console.log(`Loaded saved theme: ${savedTheme}`);
            } else {
                // Only set default if nothing saved
                console.log('No saved theme found, using default: dark');
                this.currentTheme = 'dark';
            }
        } catch (error) {
            console.warn('Failed to load saved theme:', error);
            this.currentTheme = 'dark';
        }
    }
    
    // Save theme to localStorage
    saveTheme(themeName) {
        try {
            localStorage.setItem('ai-assistant-theme', themeName);
            console.log(`Saved theme: ${themeName}`);
        } catch (error) {
            console.warn('Failed to save theme:', error);
        }
    }
    
    // Apply theme with smooth transition
    applyTheme(themeName, animate = true) {
        if (!this.themes.has(themeName)) {
            console.warn(`Theme "${themeName}" not found, falling back to dark`);
            themeName = 'dark';
        }
        
        const previousTheme = this.currentTheme;
        this.currentTheme = themeName;
        
        // Get document element
        const documentElement = document.documentElement;
        
        if (animate) {
            // Add transition loading class to prevent flash
            documentElement.classList.add('theme-loading');
            
            // Clear any existing transition timeout
            if (this.transitionTimeout) {
                clearTimeout(this.transitionTimeout);
            }
            
            // Apply new theme after a brief delay
            requestAnimationFrame(() => {
                this.setThemeAttribute(themeName);
                
                // Remove loading class after transition
                this.transitionTimeout = setTimeout(() => {
                    documentElement.classList.remove('theme-loading');
                    this.transitionTimeout = null;
                }, 50); // Brief delay to ensure theme is applied
            });
        } else {
            // Apply immediately without animation
            documentElement.classList.add('theme-loading');
            this.setThemeAttribute(themeName);
            
            // Remove loading class after next frame
            requestAnimationFrame(() => {
                documentElement.classList.remove('theme-loading');
            });
        }
        
        // Save theme
        this.saveTheme(themeName);
        
        // Notify listeners of theme change
        this.notifyThemeChange(themeName, previousTheme);
        
        console.log(`Applied theme: ${themeName}${animate ? ' (animated)' : ' (instant)'}`);
    }
    
    // Set theme attribute on document element
    setThemeAttribute(themeName) {
        document.documentElement.setAttribute('data-theme', themeName);
    }
    
    // Get current theme
    getCurrentTheme() {
        return this.currentTheme;
    }
    
    // Get theme information
    getThemeInfo(themeName) {
        return this.themes.get(themeName) || null;
    }
    
    // Get all available themes
    getAllThemes() {
        return Array.from(this.themes.entries()).map(([key, info]) => ({
            key,
            ...info
        }));
    }
    
    // Get themes by category
    getThemesByCategory(category) {
        return this.getAllThemes().filter(theme => theme.category === category);
    }
    
    // Check if theme exists
    hasTheme(themeName) {
        return this.themes.has(themeName);
    }
    
    // Toggle between light and dark themes
    toggleLightDark() {
        const currentTheme = this.getCurrentTheme();
        let newTheme;
        
        switch (currentTheme) {
            case 'light':
                newTheme = 'dark';
                break;
            case 'dark':
                newTheme = 'light';
                break;
            case 'current':
                newTheme = 'dark'; // Purple to dark
                break;
            default:
                newTheme = 'dark';
        }
        
        this.applyTheme(newTheme);
        return newTheme;
    }
    
    // Reset to default theme - Now defaults to dark
    resetToDefault() {
        this.applyTheme('dark');
    }
    
    // Setup system theme change listener
    setupSystemThemeListener() {
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            
            const handleSystemThemeChange = (e) => {
                // Only auto-switch if user hasn't manually selected a theme
                const hasManualTheme = localStorage.getItem('ai-assistant-theme');
                if (!hasManualTheme) {
                    const systemTheme = e.matches ? 'dark' : 'light';
                    console.log(`System theme changed to: ${systemTheme}`);
                    this.applyTheme(systemTheme);
                }
            };
            
            // Add listener
            mediaQuery.addEventListener('change', handleSystemThemeChange);
            
            // Store reference for cleanup
            this.systemThemeListener = {
                mediaQuery,
                handler: handleSystemThemeChange
            };
        }
    }
    
    // Add theme change event listener
    addEventListener(callback) {
        if (typeof callback === 'function') {
            this.eventListeners.add(callback);
        }
    }
    
    // Remove theme change event listener
    removeEventListener(callback) {
        this.eventListeners.delete(callback);
    }
    
    // Notify all listeners of theme change
    notifyThemeChange(newTheme, previousTheme) {
        const event = {
            type: 'themechange',
            newTheme,
            previousTheme,
            themeInfo: this.getThemeInfo(newTheme),
            timestamp: Date.now()
        };
        
        this.eventListeners.forEach(callback => {
            try {
                callback(event);
            } catch (error) {
                console.error('Error in theme change listener:', error);
            }
        });
    }
    
    // Get theme CSS variables for a specific theme
    getThemeVariables(themeName) {
        if (!this.hasTheme(themeName)) {
            return null;
        }
        
        // This would return the CSS variables for the theme
        // For now, we rely on CSS classes, but this could be extended
        // to programmatically generate or retrieve theme variables
        return {
            theme: themeName,
            variables: `[data-theme="${themeName}"]`
        };
    }
    
    // Validate theme configuration
    validateTheme(themeName) {
        if (!this.hasTheme(themeName)) {
            return {
                valid: false,
                error: `Theme "${themeName}" does not exist`
            };
        }
        
        // Additional validation could check if CSS variables are properly defined
        return {
            valid: true,
            theme: this.getThemeInfo(themeName)
        };
    }
    
    // Export current theme settings
    exportSettings() {
        return {
            currentTheme: this.currentTheme,
            availableThemes: this.getAllThemes(),
            timestamp: Date.now()
        };
    }
    
    // Import theme settings
    importSettings(settings) {
        try {
            if (settings && settings.currentTheme && this.hasTheme(settings.currentTheme)) {
                this.applyTheme(settings.currentTheme);
                return {
                    success: true,
                    message: `Theme "${settings.currentTheme}" imported successfully`
                };
            } else {
                return {
                    success: false,
                    error: 'Invalid theme settings or theme not available'
                };
            }
        } catch (error) {
            return {
                success: false,
                error: `Failed to import theme settings: ${error.message}`
            };
        }
    }
    
    // Get system color scheme preference - Changed fallback to dark
    getSystemColorScheme() {
        if (window.matchMedia) {
            if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return 'dark';
            } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
                return 'light';
            }
        }
        return 'dark'; // Fallback to dark
    }
    
    // Cleanup resources
    cleanup() {
        console.log('Starting ThemeManager cleanup...');
        
        // Clear transition timeout
        if (this.transitionTimeout) {
            clearTimeout(this.transitionTimeout);
            this.transitionTimeout = null;
        }
        
        // Remove system theme change listener
        if (this.systemThemeListener) {
            const { mediaQuery, handler } = this.systemThemeListener;
            mediaQuery.removeEventListener('change', handler);
            this.systemThemeListener = null;
        }
        
        // Clear event listeners
        this.eventListeners.clear();
        
        // Remove theme attribute from document (optional, only if you want to visually reset)
        document.documentElement.removeAttribute('data-theme');
        
        // DO NOT clear localStorage here!
        // Only clear localStorage if the user explicitly requests it (e.g., via a "Clear All Data" button)
        
        console.log('ThemeManager cleanup completed');
    }
}
