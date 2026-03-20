/**
 * ComfyUI Theme Color Utility
 * 
 * This utility provides easy access to ComfyUI's active theme colors.
 * All color names are from the official ComfyUI documentation.
 * 
 * @file comfy-theme-colors.js
 * @version 1.0.0
 * @see https://docs.comfy.org/interface/appearance
 * 
 * USAGE EXAMPLES:
 * 
 * // Basic usage - Get colors once
 * const theme = getComfyTheme();
 * console.log(theme.background);  // "#202020" (dark) or "#ffffff" (light)
 * console.log(theme.text);        // "#fff" (dark) or "#1a1a1a" (light)
 * console.log(theme.isLight);     // false or true
 * 
 * // Apply to your plugin window
 * myWindow.style.backgroundColor = theme.menuBg;
 * myWindow.style.color = theme.text;
 * myWindow.style.border = `1px solid ${theme.border}`;
 * 
 * // Watch for theme changes (reactive)
 * watchThemeChanges((newTheme) => {
 *     console.log('Theme changed to:', newTheme.theme);
 *     updateMyPluginUI(newTheme);
 * });
 * 
 * // Check if light theme for conditional logic
 * if (theme.isLight) {
 *     myWindow.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
 * } else {
 *     myWindow.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';
 * }
 */

function isThemeColorsDebugEnabled() {
    if (typeof globalThis === "undefined") {
        return false;
    }
    return !!globalThis.OpenPoseEditorDebug?.themeColors;
}

/**
 * Gets the current ComfyUI theme colors with automatic fallbacks.
 * 
 * This function extracts colors from CSS variables and provides safe fallbacks
 * only when CSS variables are unavailable. It always returns valid color values,
 * even if CSS variables are not available.
 * 
 * @returns {Object} Theme object with the following properties:
 * @property {boolean} isLight - True if light theme is active
 * @property {string} theme - Theme name: "light" or "dark"
 * @property {string} background - Main background color
 * @property {string} text - Main text/foreground color
 * @property {string} menuBg - Menu background color
 * @property {string} menuBgSecondary - Secondary menu background color
 * @property {string} inputBg - Input field background color
 * @property {string} inputText - Input text color
 * @property {string} border - Border color
 * @property {string} error - Error text color
 * @property {string} primaryBg - Primary accent background color
 * @property {string} primaryHover - Primary accent hover background color
 * @property {string} rowEven - Table even row background
 * @property {string} rowOdd - Table odd row background
 * @property {string} contentHover - Content hover background
 * 
 * @example
 * const theme = getComfyTheme();
 * console.log(theme);
 * // {
 * //   isLight: false,
 * //   theme: "dark",
 * //   background: "#202020",
 * //   text: "#fff",
 * //   menuBg: "#353535",
 * //   ...
 * // }
 */
function getComfyTheme() {
    const root = document.documentElement || document.body;

    // Get computed styles from :root (where CSS variables are defined)
    const styles = getComputedStyle(root);
    
    // Mapping of friendly names to official CSS variable names
    // All variable names are from the official ComfyUI documentation
    const cssVarMapping = {
        background:      '--bg-color',
        text:            '--fg-color',
        menuBg:          '--comfy-menu-bg',
        menuBgSecondary: '--comfy-menu-secondary-bg',
        inputBg:         '--comfy-input-bg',
        inputText:       '--input-text',
        border:          '--border-color',
        error:           '--error-text',
        rowEven:         '--tr-even-bg-color',
        rowOdd:          '--tr-odd-bg-color',
        contentHover:    '--content-hover-bg',
        primaryBg:       ['--primary-bg', '--primary-bg-color'],
        primaryHover:    ['--primary-hover-bg', '--primary-bg-hover']
    };
    
    // Extract colors from CSS variables first
    const theme = {};
    const missingKeys = [];
    for (const [key, varName] of Object.entries(cssVarMapping)) {
        let cssValue = "";
        if (Array.isArray(varName)) {
            for (const candidate of varName) {
                const value = styles.getPropertyValue(candidate).trim();
                if (value) {
                    cssValue = value;
                    break;
                }
            }
        } else {
            cssValue = styles.getPropertyValue(varName).trim();
        }
        if (cssValue) {
            theme[key] = cssValue;
        } else {
            missingKeys.push(key);
        }
    }

    const isLightFromClass = root?.classList.contains('comfy-theme-light') ?? false;
    const inferredIsLight = inferThemeLightness(theme);
    const isLight = inferredIsLight ?? (missingKeys.length ? isLightFromClass : false);

    // Official fallback palettes from ComfyUI documentation
    // These are used when CSS variables are not available
    const fallbacks = isLight ? {
        background: '#ffffff',
        text: '#1a1a1a',
        menuBg: '#f5f5f5',
        menuBgSecondary: '#fafafa',
        inputBg: '#fafafa',
        inputText: '#333',
        border: '#e0e0e0',
        error: '#d32f2f',
        rowEven: '#fafafa',
        rowOdd: '#f5f5f5',
        contentHover: '#f5f5f5',
        primaryBg: '#2563eb',
        primaryHover: '#3b82f6'
    } : {
        background: '#202020',
        text: '#fff',
        menuBg: '#353535',
        menuBgSecondary: '#303030',
        inputBg: '#222',
        inputText: '#ddd',
        border: '#4e4e4e',
        error: '#ff4444',
        rowEven: '#222',
        rowOdd: '#353535',
        contentHover: '#222',
        primaryBg: '#2f8cff',
        primaryHover: '#7db7ff'
    };

    missingKeys.forEach((key) => {
        theme[key] = fallbacks[key];
    });

    theme.isLight = !!isLight;
    theme.theme = isLight ? 'light' : 'dark';
    
    return theme;
}

function parseColorToRgb(value) {
    if (!value || typeof value !== "string") {
        return null;
    }
    const input = value.trim();
    if (input.startsWith("#")) {
        const hex = input.slice(1);
        if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16);
            const g = parseInt(hex[1] + hex[1], 16);
            const b = parseInt(hex[2] + hex[2], 16);
            return { r, g, b };
        }
        if (hex.length === 6 || hex.length === 8) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            return { r, g, b };
        }
        return null;
    }
    if (input.startsWith("rgb")) {
        const match = input.match(/rgba?\(([^)]+)\)/i);
        if (!match) {
            return null;
        }
        const parts = match[1].split(",").map((part) => part.trim());
        if (parts.length < 3) {
            return null;
        }
        const r = Number(parts[0]);
        const g = Number(parts[1]);
        const b = Number(parts[2]);
        if (![r, g, b].every((v) => Number.isFinite(v))) {
            return null;
        }
        return { r, g, b };
    }
    return null;
}

function inferThemeLightness(theme) {
    if (!theme || typeof theme !== "object") {
        return null;
    }
    const candidate = theme.background || theme.menuBg || theme.menuBgSecondary;
    const rgb = parseColorToRgb(candidate);
    if (!rgb) {
        return null;
    }
    const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return luminance > 0.6;
}

/**
 * Watches for theme changes and calls a callback when the theme switches.
 * 
 * This function sets up a MutationObserver to detect when ComfyUI's theme class
 * changes on the body element. The callback is called immediately with the current
 * theme, and then again whenever the theme changes.
 * 
 * @param {Function} callback - Function to call when theme changes.
 *                              Receives the new theme object as parameter.
 * @returns {Function} Cleanup function to stop watching for changes
 * 
 * @example
 * // Basic usage
 * watchThemeChanges((newTheme) => {
 *     console.log('Theme changed:', newTheme);
 *     myWindow.style.backgroundColor = newTheme.menuBg;
 * });
 * 
 * @example
 * // With cleanup
 * const stopWatching = watchThemeChanges((newTheme) => {
 *     updateUI(newTheme);
 * });
 * // Later, when you want to stop watching:
 * stopWatching();
 */
function watchThemeChanges(callback) {
    // Wait for body to be available
    if (!document.documentElement) {
        setTimeout(() => watchThemeChanges(callback), 100);
        return () => {}; // Return empty cleanup function
    }
    
    // Store last theme to detect actual changes
    let lastTheme = null;
    
    // Create observer to watch for class changes on root
    const observer = new MutationObserver(() => {
        const currentTheme = getComfyTheme();
        
        // Only trigger callback if theme actually changed
        if (!lastTheme || lastTheme.theme !== currentTheme.theme) {
            lastTheme = currentTheme;
            callback(currentTheme);
        }
    });
    
    // Start observing body element for class attribute changes
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
    });
    
    // Call callback immediately with current theme
    const initialTheme = getComfyTheme();
    lastTheme = initialTheme;
    callback(initialTheme);
    
    // Return cleanup function
    return () => observer.disconnect();
}

/**
 * Applies theme colors to a DOM element's style properties.
 * 
 * This is a convenience function that automatically applies colors from the
 * current theme to an element's inline styles. It sets up automatic updates
 * when the theme changes.
 * 
 * @param {HTMLElement} element - The DOM element to style
 * @param {Object} colorMapping - Object mapping CSS properties to theme color keys
 * @returns {Function} Cleanup function to stop automatic updates
 * 
 * @example
 * // Create your plugin window
 * const myWindow = document.createElement('div');
 * 
 * // Apply theme colors with auto-update
 * const cleanup = applyThemeColors(myWindow, {
 *     backgroundColor: 'menuBg',
 *     color: 'text',
 *     borderColor: 'border'
 * });
 * 
 * // Later, when destroying your plugin:
 * cleanup();
 * 
 * @example
 * // More complex styling
 * applyThemeColors(myInput, {
 *     backgroundColor: 'inputBg',
 *     color: 'inputText',
 *     borderColor: 'border'
 * });
 */
function applyThemeColors(element, colorMapping) {
    // Apply colors and watch for changes
    const cleanup = watchThemeChanges((theme) => {
        for (const [cssProp, themeKey] of Object.entries(colorMapping)) {
            if (theme[themeKey]) {
                element.style[cssProp] = theme[themeKey];
            }
        }
    });
    
    return cleanup;
}

/**
 * Gets all available theme color keys.
 * Useful for documentation or discovering what colors are available.
 * 
 * @returns {Array<string>} Array of available color property names
 * 
 * @example
 * const availableColors = getAvailableThemeColors();
 * console.log(availableColors);
 * // ['isLight', 'theme', 'background', 'text', 'menuBg', ...]
 */
function getAvailableThemeColors() {
    const theme = getComfyTheme();
    return Object.keys(theme);
}

/**
 * Prints a formatted report of the current theme colors to the console.
 * Useful for debugging and inspecting theme values.
 * 
 * @example
 * printThemeReport();
 * // Outputs formatted table with all theme colors
 */
function printThemeReport() {
    if (!isThemeColorsDebugEnabled()) {
        return;
    }
    const theme = getComfyTheme();
    console.group('🎨 ComfyUI Theme Colors');
    console.log(`Theme: ${theme.theme} (${theme.isLight ? 'Light' : 'Dark'})`);
    console.log('\nColors:');
    console.table(theme);
    console.groupEnd();
}

// ============================================================================
// CONVENIENCE FUNCTIONS FOR COMMON USE CASES
// ============================================================================

/**
 * Creates a styled div element with theme colors already applied.
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.className - CSS class name for the element
 * @param {string} options.innerHTML - HTML content
 * @param {Object} options.colorMapping - Color mapping (see applyThemeColors)
 * @returns {HTMLElement} The created div element
 * 
 * @example
 * const panel = createThemedElement({
 *     className: 'my-plugin-panel',
 *     innerHTML: '<h2>My Plugin</h2>',
 *     colorMapping: {
 *         backgroundColor: 'menuBg',
 *         color: 'text',
 *         borderColor: 'border'
 *     }
 * });
 * document.body.appendChild(panel);
 */
function createThemedElement(options = {}) {
    const element = document.createElement('div');
    
    if (options.className) {
        element.className = options.className;
    }
    
    if (options.innerHTML) {
        element.innerHTML = options.innerHTML;
    }
    
    if (options.colorMapping) {
        applyThemeColors(element, options.colorMapping);
    }
    
    return element;
}

/**
 * Gets a specific color from the current theme.
 * 
 * @param {string} colorKey - The color property name (e.g., 'background', 'text')
 * @returns {string|null} The color value or null if not found
 * 
 * @example
 * const bgColor = getThemeColor('background');
 * myElement.style.backgroundColor = bgColor;
 */
function getThemeColor(colorKey) {
    const theme = getComfyTheme();
    return theme[colorKey] || null;
}

/**
 * Checks if the current theme is light.
 * 
 * @returns {boolean} True if light theme is active
 * 
 * @example
 * if (isLightTheme()) {
 *     myElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
 * } else {
 *     myElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.5)';
 * }
 */
function isLightTheme() {
    return document.documentElement?.classList.contains('comfy-theme-light') ?? false;
}

// ============================================================================
// EXPORT FOR MODULE USAGE (if using ES6 modules)
// ============================================================================

// Uncomment these lines if you're using ES6 modules:
// export {
//     getComfyTheme,
//     watchThemeChanges,
//     applyThemeColors,
//     getAvailableThemeColors,
//     printThemeReport,
//     createThemedElement,
//     getThemeColor,
//     isLightTheme
// };

// ============================================================================
// GLOBAL API (for direct script inclusion)
// ============================================================================

// Make functions available globally when included as a script tag
if (typeof window !== 'undefined') {
    window.ComfyTheme = {
        getTheme: getComfyTheme,
        watch: watchThemeChanges,
        apply: applyThemeColors,
        getColor: getThemeColor,
        isLight: isLightTheme,
        getAvailableColors: getAvailableThemeColors,
        printReport: printThemeReport,
        createElement: createThemedElement
    };
    
    // Also expose individual functions for convenience
    window.getComfyTheme = getComfyTheme;
    window.watchThemeChanges = watchThemeChanges;
    window.applyThemeColors = applyThemeColors;
    window.printThemeReport = printThemeReport;
}

// ============================================================================
// USAGE EXAMPLES FOR COMFYUI EXTENSIONS
// ============================================================================

/*

// EXAMPLE 1: Basic usage in a ComfyUI extension
app.registerExtension({
    name: "my.themed.extension",
    async setup() {
        const theme = getComfyTheme();
        
        const myWindow = document.createElement('div');
        myWindow.style.cssText = `
            position: fixed;
            top: 100px;
            left: 100px;
            width: 400px;
            padding: 20px;
            background-color: ${theme.menuBg};
            color: ${theme.text};
            border: 2px solid ${theme.border};
            border-radius: 8px;
        `;
        
        document.body.appendChild(myWindow);
    }
});

// EXAMPLE 2: With automatic theme updates
app.registerExtension({
    name: "my.reactive.extension",
    async setup() {
        const myWindow = document.createElement('div');
        myWindow.className = 'my-plugin-window';
        
        // Apply colors with automatic updates
        applyThemeColors(myWindow, {
            backgroundColor: 'menuBg',
            color: 'text',
            borderColor: 'border'
        });
        
        document.body.appendChild(myWindow);
    }
});

// EXAMPLE 3: Conditional styling based on theme
app.registerExtension({
    name: "my.conditional.extension",
    async setup() {
        const theme = getComfyTheme();
        const myWindow = document.createElement('div');
        
        myWindow.style.backgroundColor = theme.menuBg;
        myWindow.style.color = theme.text;
        
        // Different shadow for light/dark theme
        if (theme.isLight) {
            myWindow.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        } else {
            myWindow.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';
        }
        
        document.body.appendChild(myWindow);
    }
});

// EXAMPLE 4: Using the convenience function
app.registerExtension({
    name: "my.convenient.extension",
    async setup() {
        const panel = createThemedElement({
            className: 'my-plugin-panel',
            innerHTML: `
                <h2>My Plugin</h2>
                <p>This is automatically themed!</p>
            `,
            colorMapping: {
                backgroundColor: 'menuBg',
                color: 'text',
                borderColor: 'border'
            }
        });
        
        document.body.appendChild(panel);
    }
});

// EXAMPLE 5: Manual watch for complex updates
app.registerExtension({
    name: "my.watched.extension",
    async setup() {
        const myWindow = document.createElement('div');
        
        // Watch for theme changes
        watchThemeChanges((newTheme) => {
            console.log('Theme changed to:', newTheme.theme);
            
            // Update main colors
            myWindow.style.backgroundColor = newTheme.menuBg;
            myWindow.style.color = newTheme.text;
            
            // Update all child inputs
            myWindow.querySelectorAll('input').forEach(input => {
                input.style.backgroundColor = newTheme.inputBg;
                input.style.color = newTheme.inputText;
            });
            
            // Update status message color
            const statusEl = myWindow.querySelector('.status');
            if (statusEl) {
                statusEl.style.color = newTheme.isLight ? '#666' : '#999';
            }
        });
        
        document.body.appendChild(myWindow);
    }
});

*/
