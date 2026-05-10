/**
 * FrappeDeskTheme - Main theme management class
 * Handles loading, applying, and managing custom theme configurations for Frappe Desk
 * Supports dynamic theme changes, user role-based hiding, and real-time DOM updates
 */
class FrappeDeskTheme {
	constructor() {
		// Store theme configuration data from server
		this.themeData = null;
		// Cache configuration
		this.cacheKey = "frappe_desk_theme_cache";
		this.footerCacheStorageKey = "frappe_desk_theme_footer_cache";
		this.cacheTimeout = 30 * 24 * 60 * 60 * 1000; // 30 days (1 month) in milliseconds
		// Footer creation throttling and caching
		this.footerCreating = false;
		this.footerHtmlCache = null;
		this.footerCacheKey = null; // Track what theme data the footer was cached for
		this.stickyFooterListenerSetup = false;
		this.init();
	}

	/**
	 * Initialize the theme system
	 * First applies cached theme immediately, then loads fresh data if needed
	 * Uses async/await pattern with graceful error handling
	 */
	async init() {
		try {
			// Apply cached theme immediately to prevent flickering
			this.applyCachedTheme();

			// Load fresh theme data if needed (async)
			await this.loadThemeIfNeeded();

			// Apply fresh theme if we got new data
			if (this.themeData) {
				this.applyTheme();
			}

			this.setupEventListeners();
			this.setupSidebarObserver();
		} catch (error) {
			// Production-ready silent fail - apply default theme and show login box
			this.applyTheme();
			this.showLoginBoxFallback();
		}
	}

	/**
	 * Fallback method to show login box if theme loading fails
	 * Ensures login form is always visible even if theme fails to load
	 */
	showLoginBoxFallback() {
		const loginBox = document.querySelector(".for-login");
		if (loginBox && !loginBox.classList.contains("theme-ready")) {
			setTimeout(() => {
				loginBox.classList.add("theme-ready");
			}, 100);
		}
	}

	/**
	 * Apply cached theme immediately to prevent UI flickering
	 */
	applyCachedTheme() {
		const cachedData = this.getCachedTheme();
		if (cachedData && cachedData.data) {
			this.themeData = cachedData.data;
			this.applyTheme();
		} else {
			// No cached theme, but still show login box to prevent indefinite hiding
			this.showLoginBoxFallback();
		}
	}

	/**
	 * Get cached theme data from localStorage
	 * @returns {Object|null} Cached theme data with timestamp
	 */
	getCachedTheme() {
		try {
			const cached = localStorage.getItem(this.cacheKey);
			return cached ? JSON.parse(cached) : null;
		} catch (error) {
			return null;
		}
	}

	/**
	 * Save theme data to localStorage with timestamp
	 * @param {Object} themeData Theme configuration data
	 */
	setCachedTheme(themeData) {
		try {
			const cacheData = {
				data: themeData,
				timestamp: Date.now(),
				version: 1, // Increment this when theme structure changes
			};
			localStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
		} catch (error) {
			// localStorage might be full or disabled
		}
	}

	/**
	 * Check if cached theme is still valid
	 * @returns {boolean} True if cache is valid and not expired
	 */
	isCacheValid() {
		const cachedData = this.getCachedTheme();
		if (!cachedData) return false;

		const now = Date.now();
		const cacheAge = now - cachedData.timestamp;

		return cacheAge < this.cacheTimeout; // 30 days
	}

	/**
	 * Load theme only if cache is invalid or doesn't exist
	 */
	async loadThemeIfNeeded() {
		// Skip API call if cache is still valid
		if (this.isCacheValid()) {
			return;
		}

		await this.loadTheme();
	}

	/**
	 * Load theme configuration from server API
	 * Fetches custom theme data via REST API endpoint
	 * Handles response parsing and error states
	 */
	async loadTheme() {
		try {
			const response = await fetch("/api/method/frappe_desk_theme.api.get_custom_theme", {
				method: "GET",
				headers: {
					Accept: "application/json",
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP error! Status: ${response.status}`);
			}

			const data = await response.json();
			// Handle different response formats - some APIs wrap data in 'message' property
			this.themeData = data?.message || data;

			if (!this.themeData) {
				throw new Error("No theme data received");
			}

			// Cache the new theme data
			this.setCachedTheme(this.themeData);
		} catch (error) {
			// If API fails, try to use cached data as fallback
			const cachedData = this.getCachedTheme();
			if (cachedData && cachedData.data) {
				this.themeData = cachedData.data;
			} else {
				throw error;
			}
		}
	}

	/**
	 * Force refresh theme from server (ignores cache)
	 * Useful for manual theme updates or admin changes
	 */
	async refreshTheme() {
		try {
			// Clear footer cache to ensure fresh data
			this.footerHtmlCache = null;
			this.footerCacheKey = null;

			await this.loadTheme();
			this.applyTheme();

			// Dispatch event for other components
			document.dispatchEvent(
				new CustomEvent("themeRefreshed", {
					detail: { themeData: this.themeData },
				})
			);
		} catch (error) {
			// Silent fail - theme refresh errors should not interrupt user experience
		}
	}

	/**
	 * Save footer cache to localStorage
	 */
	saveFooterCache(footerHtml, cacheKey) {
		try {
			const cacheData = {
				html: footerHtml,
				key: cacheKey,
				timestamp: Date.now(),
			};
			localStorage.setItem(this.footerCacheStorageKey, JSON.stringify(cacheData));
		} catch (error) {
			// localStorage might be full or disabled
		}
	}

	/**
	 * Load footer cache from localStorage
	 */
	loadFooterCache() {
		try {
			const cached = localStorage.getItem(this.footerCacheStorageKey);
			if (!cached) return null;

			const cacheData = JSON.parse(cached);
			const now = Date.now();
			const cacheAge = now - cacheData.timestamp;

			// Return cached data if it's still valid (within 30-day timeout)
			if (cacheAge < this.cacheTimeout) {
				return cacheData;
			} else {
				// Remove expired cache
				localStorage.removeItem(this.footerCacheStorageKey);
				return null;
			}
		} catch (error) {
			return null;
		}
	}

	/**
	 * Clear theme cache (useful for debugging or forced refresh)
	 */
	clearCache() {
		try {
			localStorage.removeItem(this.cacheKey);
			localStorage.removeItem(this.footerCacheStorageKey);
			// Also clear footer cache
			this.footerHtmlCache = null;
			this.footerCacheKey = null;
		} catch (error) {
			// Ignore localStorage errors
		}
	}

	/**
	 * Check if current user's roles match hide_search configuration
	 * Used to conditionally hide search bar based on user permissions
	 * @returns {boolean} True if search should be hidden for current user
	 */
	getUserRoles() {
		const currentUser = frappe?.boot?.user?.roles;
		// Exit early if no user roles or no hide_search config
		if (!currentUser || !this.themeData?.hide_search) {
			return false;
		}

		// Special handling for Administrator role
		if (currentUser.includes("Administrator")) {
			return this.themeData.hide_search.some((u) => u.role === "Administrator");
		}

		// Check if any user role matches hide_search configuration
		return currentUser.some((role) => this.themeData.hide_search.some((u) => u.role === role));
	}

	/**
	 * Clear all theme-related CSS custom properties from document root
	 * Used to reset theme state before applying new theme values
	 * Ensures clean slate for theme updates
	 */
	clearCSSVariables() {
		const root = document.documentElement;
		// Comprehensive list of all theme CSS variables
		const cssVariables = [
			"--login-bg-color",
			"--login-bg-image",
			"--login-box-position",
			"--login-box-right",
			"--login-box-left",
			"--login-btn-bg",
			"--login-btn-color",
			"--login-btn-hover-bg",
			"--login-btn-hover-color",
			"--login-box-bg",
			"--page-heading-color",
			"--input-bg",
			"--input-color",
			"--input-border",
			"--input-label-color",
			"--navbar-bg",
			"--navbar-color",
			"--hide-help",
			"--btn-primary-bg",
			"--btn-primary-color",
			"--btn-primary-hover-bg",
			"--btn-primary-hover-color",
			"--btn-secondary-bg",
			"--btn-secondary-color",
			"--btn-secondary-hover-bg",
			"--btn-secondary-hover-color",
			"--body-bg",
			"--content-bg",
			"--table-head-bg",
			"--table-head-color",
			"--table-body-bg",
			"--table-body-color",
			"--hide-like-comment",
			"--widget-bg",
			"--widget-border",
			"--widget-color",
			"--sidebar-expanded",
			"--sidebar-bg",
			"--sidebar-text-color",
			"--sidebar-hover-bg",
			"--sidebar-hover-text-color",
			"--login-content-border",
			"--login-title-display",
			"--login-title-after-display",
			"--login-title-after-justify",
			"--login-title-after-margin",
			"--login-title-after-content",
			"--login-title-after-color",
			"--login-box-top",
			"--login-box-bg-override",
			"--login-box-border-radius",
			"--search-bar-display",
			"--navbar-toggler-border",
			"--breadcrumb-disabled-color",
			"--help-nav-link-color",
			"--help-nav-link-stroke",
			"--hide-app-switcher",
			"--app-switcher-pointer-events",
			"--footer-bg",
			"--footer-color",
			"--footer-border",
			"--footer-display",
			"--footer-powered-color",
			"--footer-link-color",
			"--footer-link-hover-color",
			"--carousel-fade-opacity",
			"--login-bg-carousel-image",
		];

		// Remove each CSS variable from document root
		cssVariables.forEach((variable) => {
			root.style.removeProperty(variable);
		});
	}

	/**
	 * Set default CSS variable values
	 * Provides fallback values when theme configuration is missing or incomplete
	 * Ensures UI remains functional even without complete theme data
	 */
	setDefaultCSSVariables() {
		const root = document.documentElement;

		// Login page defaults - ensures login form remains usable
		root.style.setProperty("--login-box-position", "static");
		root.style.setProperty("--login-box-right", "auto");
		root.style.setProperty("--login-box-left", "auto");
		root.style.setProperty("--login-box-top", "18%");
		root.style.setProperty("--login-box-bg", "#fff");
		root.style.setProperty("--login-content-border", "2px solid #d1d8dd");
		root.style.setProperty("--login-title-display", "block");
		root.style.setProperty("--login-title-after-display", "none");

		// UI element visibility defaults
		root.style.setProperty("--hide-help", "block");
		root.style.setProperty("--hide-like-comment", "block");
		root.style.setProperty("--hide-app-switcher", "block");
		root.style.setProperty("--app-switcher-pointer-events", "auto");
		root.style.setProperty("--sidebar-expanded", "");
		root.style.setProperty("--sidebar-hover-bg", "#e9ecef");
		root.style.setProperty("--sidebar-hover-text-color", "#212529");
		root.style.setProperty("--login-box-width", "400px");
		root.style.setProperty("--search-bar-display", "block");

		// Navigation and UI component defaults
		root.style.setProperty("--navbar-toggler-border", "#dee2e6");
		root.style.setProperty("--breadcrumb-disabled-color", "#6c757d");
		root.style.setProperty("--help-nav-link-color", "inherit");
		root.style.setProperty("--help-nav-link-stroke", "currentColor");

		// Footer defaults
		root.style.setProperty("--footer-display", "flex");
		root.style.setProperty("--footer-bg", "#f8f9fa");
		root.style.setProperty("--footer-color", "#495057");
		root.style.setProperty("--footer-border", "#dee2e6");
		root.style.setProperty("--footer-powered-color", "#6c757d");
		root.style.setProperty("--footer-link-color", "#007bff");
		root.style.setProperty("--footer-link-hover-color", "#0056b3");

		// Carousel fade default
		root.style.setProperty("--carousel-fade-opacity", "1");
	}

	/**
	 * Apply theme configuration to CSS custom properties
	 * Maps theme data fields to corresponding CSS variables
	 * Only sets variables when theme values are provided (conditional application)
	 */
	setCSSVariables() {
		const root = document.documentElement;
		const theme = this.themeData;

		// Reset all variables to clean state
		this.clearCSSVariables();

		// Establish default values first
		this.setDefaultCSSVariables();

		// Login page background customization
		if (theme.carousel && theme.carousel.images && theme.carousel.images.length > 0) {
			// Skip static background image/color for carousel mode
		} else {
			if (theme.login_page_background_color) {
				root.style.setProperty("--login-bg-color", theme.login_page_background_color);
			}
			if (theme.login_page_background_image) {
				root.style.setProperty(
					"--login-bg-image",
					`url("${theme.login_page_background_image}")`
				);
			}
		}

		// Login box positioning - supports Left, Right, or Default positioning
		if (theme.login_box_position && theme.login_box_position !== "Default") {
			root.style.setProperty("--login-box-position", "absolute");
			root.style.setProperty(
				"--login-box-right",
				theme.login_box_position === "Right" ? "10%" : "auto"
			);
			root.style.setProperty(
				"--login-box-left",
				theme.login_box_position === "Left" ? "10%" : "auto"
			);
			root.style.setProperty(
				"--login-box-padding",
				theme.is_app_details_inside_the_box === 1 ? "18px 40px 40px 40px" : "40px"
			);
		}

		// Login box vertical positioning and app details integration
		if (theme.is_app_details_inside_the_box !== undefined) {
			root.style.setProperty(
				"--login-box-top",
				theme.is_app_details_inside_the_box === 1 ? "26%" : "18%"
			);
		}

		// Special styling when app details are inside the login box
		if (theme.is_app_details_inside_the_box === 1) {
			root.style.setProperty("--login-box-bg-override", theme.login_box_background_color);
			root.style.setProperty("--login-box-border-radius", "10px");
		}

		// Login button styling
		if (theme.login_button_background_color) {
			root.style.setProperty("--login-btn-bg", theme.login_button_background_color);
		}
		if (theme.login_button_text_color) {
			root.style.setProperty("--login-btn-color", theme.login_button_text_color);
		}
		if (theme.login_page_button_hover_background_color) {
			root.style.setProperty(
				"--login-btn-hover-bg",
				theme.login_page_button_hover_background_color
			);
		}
		if (theme.login_page_button_hover_text_color) {
			root.style.setProperty(
				"--login-btn-hover-color",
				theme.login_page_button_hover_text_color
			);
		}
		if (theme.login_box_background_color) {
			root.style.setProperty("--login-box-bg", theme.login_box_background_color);
		}
		if (theme.page_heading_text_color) {
			root.style.setProperty("--page-heading-color", theme.page_heading_text_color);
		}

		// Login content border - removed when app details are inside box
		if (theme.is_app_details_inside_the_box === 1) {
			root.style.setProperty("--login-content-border", "none");
		}

		// Custom login page title - replaces default Frappe title
		if (theme.login_page_title) {
			root.style.setProperty("--login-title-display", "none");
			root.style.setProperty("--login-title-after-display", "flex");
			root.style.setProperty("--login-title-after-justify", "center");
			root.style.setProperty("--login-title-after-margin", "10px");
			root.style.setProperty("--login-title-after-content", `'${theme.login_page_title}'`);
			if (theme.page_heading_text_color) {
				root.style.setProperty("--login-title-after-color", theme.page_heading_text_color);
			}
		}

		// Form input field customization
		if (theme.input_background_color) {
			root.style.setProperty("--input-bg", theme.input_background_color);
		}
		if (theme.input_text_color) {
			root.style.setProperty("--input-color", theme.input_text_color);
		}
		if (theme.input_border_color) {
			root.style.setProperty("--input-border", theme.input_border_color);
		}
		if (theme.input_label_color) {
			root.style.setProperty("--input-label-color", theme.input_label_color);
		}

		// Navigation bar customization
		if (theme.navbar_color) {
			root.style.setProperty("--navbar-bg", theme.navbar_color);
		}
		if (theme.navbar_text_color) {
			root.style.setProperty("--navbar-color", theme.navbar_text_color);
		}
		if (theme.hide_help_button !== undefined) {
			root.style.setProperty("--hide-help", theme.hide_help_button ? "none" : "block");
		}
		if (theme.hide_app_switcher !== undefined) {
			root.style.setProperty(
				"--hide-app-switcher",
				theme.hide_app_switcher ? "none" : "block"
			);
			root.style.setProperty(
				"--app-switcher-pointer-events",
				theme.hide_app_switcher ? "none" : "auto"
			);
		}

		// Primary button styling
		if (theme.button_background_color) {
			root.style.setProperty("--btn-primary-bg", theme.button_background_color);
		}
		if (theme.button_text_color) {
			root.style.setProperty("--btn-primary-color", theme.button_text_color);
		}
		if (theme.button_hover_background_color) {
			root.style.setProperty("--btn-primary-hover-bg", theme.button_hover_background_color);
		}
		if (theme.button_hover_text_color) {
			root.style.setProperty("--btn-primary-hover-color", theme.button_hover_text_color);
		}

		// Secondary button styling
		if (theme.secondary_button_background_color) {
			root.style.setProperty("--btn-secondary-bg", theme.secondary_button_background_color);
		}
		if (theme.secondary_button_text_color) {
			root.style.setProperty("--btn-secondary-color", theme.secondary_button_text_color);
		}
		if (theme.secondary_button_hover_background_color) {
			root.style.setProperty(
				"--btn-secondary-hover-bg",
				theme.secondary_button_hover_background_color
			);
		}
		if (theme.secondary_button_hover_text_color) {
			root.style.setProperty(
				"--btn-secondary-hover-color",
				theme.secondary_button_hover_text_color
			);
		}

		// Main body and content area styling
		if (theme.body_background_color) {
			root.style.setProperty("--body-bg", theme.body_background_color);
		}
		if (theme.main_body_content_box_background_color) {
			root.style.setProperty("--content-bg", theme.main_body_content_box_background_color);
		}
		if (theme.main_body_content_box_text_color) {
			root.style.setProperty("--content-text-color", theme.main_body_content_box_text_color);
		}

		// Sidebar customization
		if (theme.sidebar_background_color) {
			root.style.setProperty("--sidebar-bg", theme.sidebar_background_color);
		}
		if (theme.sidebar_text_color) {
			root.style.setProperty("--sidebar-text-color", theme.sidebar_text_color);
		}
		if (theme.sidebar_hover_background_color) {
			root.style.setProperty("--sidebar-hover-bg", theme.sidebar_hover_background_color);
		}
		if (theme.sidebar_hover_text_color) {
			root.style.setProperty("--sidebar-hover-text-color", theme.sidebar_hover_text_color);
		}

		// Data table styling
		if (theme.table_head_background_color) {
			root.style.setProperty("--table-head-bg", theme.table_head_background_color);
		}
		if (theme.table_head_text_color) {
			root.style.setProperty("--table-head-color", theme.table_head_text_color);
		}
		if (theme.table_body_background_color) {
			root.style.setProperty("--table-body-bg", theme.table_body_background_color);
		}
		if (theme.table_body_text_color) {
			root.style.setProperty("--table-body-color", theme.table_body_text_color);
		}
		if (theme.table_hide_like_comment_section !== undefined) {
			root.style.setProperty(
				"--hide-like-comment",
				theme.table_hide_like_comment_section ? "none" : "block"
			);
		}

		// Widget/card styling (number cards, dashboard widgets)
		if (theme.number_card_background_color) {
			root.style.setProperty("--widget-bg", theme.number_card_background_color);
		}
		if (theme.number_card_border_color) {
			root.style.setProperty("--widget-border", theme.number_card_border_color);
		}
		if (theme.number_card_text_color) {
			root.style.setProperty("--widget-color", theme.number_card_text_color);
		}

		// Footer styling
		if (theme.footer_background_color) {
			root.style.setProperty("--footer-bg", theme.footer_background_color);
		}
		if (theme.footer_text_color) {
			root.style.setProperty("--footer-color", theme.footer_text_color);
			root.style.setProperty("--footer-powered-color", theme.footer_text_color);
		}

		// Sidebar visibility control
		if (theme.hide_side_bar !== undefined) {
			root.style.setProperty(
				"--sidebar-expanded",
				theme.hide_side_bar === 0 ? "expanded" : ""
			);
		}
	}

	/**
	 * Apply all theme configurations to the current page
	 * Orchestrates the application of CSS variables and UI element toggles
	 */
	applyTheme() {
		this.setCSSVariables();
		this.toggleSidebar();
		this.toggleSearchBar();
		this.setDefaultApp();
		if (
			this.themeData.carousel &&
			this.themeData.carousel.images &&
			this.themeData.carousel.images.length > 0
		) {
			this.renderLoginCarousel();
		} else {
			this.removeLoginCarousel();
		}
		this.showLoginBox();
		this.createFooter();
		this.applySidebarIcons();
		this.applyWorkspaceCardIcons();
	}

	/**
	 * Show login box with smooth transition after theme is applied
	 * Prevents flickering by revealing the login form only after positioning is set
	 */
	showLoginBox() {
		const loginBox = document.querySelector(".for-login");
		if (loginBox) {
			// Small delay to ensure CSS variables are applied
			setTimeout(() => {
				loginBox.classList.add("theme-ready");
			}, 50);
		}
	}

	/**
	 * Toggle sidebar visibility based on theme configuration
	 * Adds/removes 'expanded' class to control sidebar state
	 */
	toggleSidebar() {
		const sidebarContainer = document.querySelector(".body-sidebar-container");
		if (!sidebarContainer) {
			return;
		}

		if (this.themeData.hide_side_bar === 0) {
			sidebarContainer.classList.add("expanded");
		} else {
			sidebarContainer.classList.remove("expanded");
		}
	}

	/**
	 * Toggle search bar visibility based on user roles
	 * Hides search bar if current user's role matches hide_search configuration
	 */
	toggleSearchBar() {
		const searchBar = document.querySelector(".input-group.search-bar.text-muted");
		if (!searchBar) {
			return;
		}

		if (this.getUserRoles()) {
			searchBar.style.display = "none";
		}
	}

	/**
	 * Set current app to default app when app switcher is hidden
	 * Similar to breadcrumbs.js line 83 functionality
	 */
	setDefaultApp() {
		// Only proceed if hide_app_switcher is enabled and default_app is set
		if (!this.themeData.hide_app_switcher || !this.themeData.default_app) {
			return;
		}

		// Check if frappe.app.sidebar.apps_switcher exists (similar to breadcrumbs.js)
		if (frappe?.app?.sidebar?.apps_switcher?.set_current_app) {
			try {
				// Set the current app to the default app (same as breadcrumbs.js line 83)
				frappe.app.sidebar.apps_switcher.set_current_app(this.themeData.default_app);
			} catch (error) {
				// Silent fail if app switcher is not available or app doesn't exist
			}
		}
	}

	/**
	 * Create and display footer in desk view using HTML template
	 * Much more efficient than creating DOM elements dynamically
	 */
	async createFooter() {
		// Don't create footer on login page
		if (
			document.body.classList.contains("login-page") ||
			document.querySelector("#page-login")
		) {
			return;
		}

		// Remove existing footer if any
		const existingFooter = document.querySelector("#desk-footer");
		if (existingFooter) {
			existingFooter.remove();
			// Clean up sticky footer classes
			document.body.classList.remove("has-sticky-footer");
			const mainSection = document.querySelector(".main-section");
			if (mainSection) {
				mainSection.classList.remove("has-sticky-footer");
			}
		}

		// Check if footer should be displayed (basic check to avoid unnecessary API calls)
		if (!this.themeData.copyright_text && !this.themeData.footer_powered_by) {
			return;
		}

		// Throttle footer creation to prevent multiple simultaneous calls
		if (this.footerCreating) {
			return;
		}
		this.footerCreating = true;

		try {
			// Create a cache key from footer-related theme data
			const currentFooterKey = JSON.stringify({
				copyright_text: this.themeData.copyright_text,
				footer_powered_by: this.themeData.footer_powered_by,
				sticky_footer: this.themeData.sticky_footer,
			});

			let footerHtml = this.footerHtmlCache;

			// Check in-memory cache first, then localStorage, then API
			if (!footerHtml || this.footerCacheKey !== currentFooterKey) {
				// Try to load from localStorage
				const cachedFooter = this.loadFooterCache();
				if (cachedFooter && cachedFooter.key === currentFooterKey) {
					footerHtml = cachedFooter.html;
					this.footerHtmlCache = footerHtml;
					this.footerCacheKey = currentFooterKey;
				} else {
					// Get rendered footer HTML from server
					const response = await fetch(
						"/api/method/frappe_desk_theme.api.get_footer_html",
						{
							method: "GET",
							headers: {
								Accept: "application/json",
							},
						}
					);

					if (!response.ok) {
						throw new Error(`HTTP error! Status: ${response.status}`);
					}

					const data = await response.json();
					footerHtml = data?.message || "";

					// Cache the HTML and key for subsequent calls (both memory and localStorage)
					this.footerHtmlCache = footerHtml;
					this.footerCacheKey = currentFooterKey;
					this.saveFooterCache(footerHtml, currentFooterKey);
				}
			}

			if (footerHtml.trim()) {
				// Create a temporary container to hold the HTML
				const tempDiv = document.createElement("div");
				tempDiv.innerHTML = footerHtml;

				// Get the footer element from the template
				const footerElement = tempDiv.querySelector("#desk-footer");
				if (footerElement) {
					// Try to append to main-section first, then fall back to body
					const mainSection = document.querySelector(".main-section");
					if (mainSection) {
						mainSection.appendChild(footerElement);
						if (this.themeData.sticky_footer) {
							mainSection.classList.add("has-sticky-footer");
							// Set up sticky footer sidebar toggle listener
							this.setupStickyFooterToggle();
						}
					} else {
						// Fallback to body if main-section doesn't exist
						document.body.appendChild(footerElement);
						if (this.themeData.sticky_footer) {
							document.body.classList.add("has-sticky-footer");
							// Set up sticky footer sidebar toggle listener
							this.setupStickyFooterToggle();
						}
					}
				}
			}
		} catch (error) {
			// Silent fail - footer is optional, don't show errors to user
		} finally {
			this.footerCreating = false;
		}
	}

	/**
	 * Set up dynamic positioning for sticky footer when sidebar toggles
	 * Ensures footer position updates in real-time with sidebar state
	 */
	setupStickyFooterToggle() {
		// Avoid setting up multiple listeners
		if (this.stickyFooterListenerSetup) {
			return;
		}
		this.stickyFooterListenerSetup = true;

		// Function to update sticky footer position
		const updateStickyFooterPosition = () => {
			const footer = document.querySelector("#desk-footer.sticky");
			if (!footer) return;

			const sidebarContainer = document.querySelector(".body-sidebar-container");
			const isExpanded = sidebarContainer && sidebarContainer.classList.contains("expanded");

			// Update footer position based on sidebar state
			if (isExpanded) {
				footer.style.left = "220px";
			} else {
				footer.style.left = "50px";
			}
		};

		// Listen for sidebar toggle events
		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				if (
					mutation.type === "attributes" &&
					mutation.attributeName === "class" &&
					mutation.target.classList.contains("body-sidebar-container")
				) {
					// Delay to ensure CSS transitions complete
					setTimeout(updateStickyFooterPosition, 50);
				}
			});
		});

		// Observe sidebar container for class changes
		const sidebarContainer = document.querySelector(".body-sidebar-container");
		if (sidebarContainer) {
			observer.observe(sidebarContainer, {
				attributes: true,
				attributeFilter: ["class"],
			});
		}

		// Also listen for sidebar toggle via click events
		document.addEventListener("click", (event) => {
			// Check if clicked element or its parent is a sidebar toggle
			const isToggle = event.target.closest(
				'.collapse-sidebar-link, .sidebar-toggle, [data-toggle="sidebar"]'
			);
			if (isToggle) {
				setTimeout(updateStickyFooterPosition, 200); // Allow time for animation
			}
		});

		// Initial position update
		updateStickyFooterPosition();
	}

	/**
	 * Set up event listeners for dynamic theme updates and DOM changes
	 * Handles real-time theme changes and new element detection
	 */
	setupEventListeners() {
		// Listen for theme changes - allows for runtime theme updates
		document.addEventListener("themeChanged", () => {
			this.loadTheme().then(() => this.applyTheme());
		});

		// Listen for DOM changes to apply theme to dynamically added elements
		// Frappe uses dynamic content loading, so we need to monitor for new elements
		let footerTimeout;
		let cardRafScheduled = false;
		let sidebarRafScheduled = false;

		const observer = new MutationObserver((mutations) => {
			this.toggleSearchBar();

			// Smart detection: check if workspace cards or sidebar items were added
			let hasNewCards = false;
			let hasNewSidebarItems = false;

			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (node.nodeType !== 1) continue;
					// Check for new workspace cards
					if (
						node.classList?.contains('links-widget-box') ||
						node.querySelector?.('.links-widget-box:not(.icons-applied)')
					) {
						hasNewCards = true;
					}
					// Check for new sidebar items
					if (
						node.classList?.contains('standard-sidebar-item') ||
						node.classList?.contains('sidebar-item-container') ||
						node.querySelector?.('.standard-sidebar-item:not(.icons-applied)')
					) {
						hasNewSidebarItems = true;
					}
					if (hasNewCards && hasNewSidebarItems) break;
				}
				if (hasNewCards && hasNewSidebarItems) break;
			}

			// Process new workspace cards immediately on next animation frame
			if (hasNewCards && !cardRafScheduled) {
				cardRafScheduled = true;
				requestAnimationFrame(() => {
					this.applyWorkspaceCardIcons();
					cardRafScheduled = false;
				});
			}

			// Process new sidebar items only when new ones appear
			if (hasNewSidebarItems && !sidebarRafScheduled) {
				sidebarRafScheduled = true;
				requestAnimationFrame(() => {
					this.applySidebarIcons();
					sidebarRafScheduled = false;
				});
			}

			// Footer check remains debounced (not performance-critical)
			clearTimeout(footerTimeout);
			footerTimeout = setTimeout(() => {
				if (!document.querySelector("#desk-footer")) {
					this.createFooter();
				}
			}, 150);
		});

		// Observe all changes in document body and its children
		observer.observe(document.body, {
			childList: true, // Watch for element additions/removals
			subtree: true, // Watch all descendant nodes
		});
	}

	// Navigation buttons

	ensureButton(loginPage, images, id, html, onClick) {
		const manual = !!this.themeData.carousel.manual_navigation;
		let btn = document.getElementById(id);
		if (!manual || images.length <= 1) {
			if (btn) btn.remove();
			return null;
		}
		if (!btn) {
			btn = document.createElement("button");
			btn.id = id;
			btn.className = `carousel-nav ${id === "carousel-nav-left" ? "carousel-nav-left" : "carousel-nav-right"
				}`;
			btn.innerHTML = html;
			btn.addEventListener("click", onClick);
			loginPage.appendChild(btn);
		}
		return btn;
	}

	renderLoginCarousel() {
		const loginPage = document.querySelector("#page-login");
		if (!loginPage) return;
		const root = document.documentElement;
		const images = this.themeData.carousel.images;
		if (!images || images.length === 0) return;

		// Set initial state and background
		if (typeof this._carouselIndex !== "number" || this._carouselIndex >= images.length) {
			this._carouselIndex = 0;
		}
		root.style.setProperty(
			"--login-bg-carousel-image",
			`url("${images[this._carouselIndex]}")`
		);

		// Remove any previous timer
		if (this._carouselTimer) {
			clearTimeout(this._carouselTimer);
			this._carouselTimer = null;
		}

		this.ensureButton(loginPage, images, "carousel-nav-left", "&#8592;", (e) => {
			e.stopPropagation();
			e.preventDefault();
			if (this._carouselTimer) {
				clearTimeout(this._carouselTimer);
				this._carouselTimer = null;
			}
			this.carouselShowImage(this._carouselIndex - 1, images, root, -1);
		});
		this.ensureButton(loginPage, images, "carousel-nav-right", "&#8594;", (e) => {
			e.stopPropagation();
			e.preventDefault();
			if (this._carouselTimer) {
				clearTimeout(this._carouselTimer);
				this._carouselTimer = null;
			}
			this.carouselShowImage(this._carouselIndex + 1, images, root, 1);
		});

		// Auto-advance: handled in carouselShowImage after animation
		if (
			this.themeData.carousel.auto_advance !== false &&
			images.length > 1 &&
			!this._carouselTimer
		) {
			this._carouselTimer = setTimeout(() => {
				this._carouselTimer = null;
				this.carouselShowImage(this._carouselIndex + 1, images, root, 1);
			}, 5000);
		}
	}

	carouselShowImage(idx, images, root, direction = 1) {
		const total = images.length;
		idx = (idx + total) % total;
		if (idx === this._carouselIndex || this._carouselSliding) return;

		this._carouselSliding = true;
		// Fade out
		root.style.setProperty("--carousel-fade-opacity", "0");
		setTimeout(() => {
			root.style.setProperty("--login-bg-carousel-image", `url("${images[idx]}")`);
			root.style.setProperty("--carousel-fade-opacity", "1");
			this._carouselIndex = idx;
			this._carouselSliding = false;
			// Auto-advance
			const auto = this.themeData.carousel.auto_advance !== false;
			if (auto && images.length > 1 && !this._carouselTimer) {
				this._carouselTimer = setTimeout(() => {
					this._carouselTimer = null;
					this.carouselShowImage(this._carouselIndex + 1, images, root, 1);
				}, 5000);
			}
		}, 400);
	}

	removeLoginCarousel() {
		// Remove navigation buttons if present
		const left = document.getElementById("carousel-nav-left");
		const right = document.getElementById("carousel-nav-right");
		if (left) left.remove();
		if (right) right.remove();
		if (this._carouselTimer) {
			clearTimeout(this._carouselTimer);
			this._carouselTimer = null;
		}
		// Remove the CSS variable
		document.documentElement.style.removeProperty("--login-bg-carousel-image");
		this._carouselIndex = 0;
	}

	setupSidebarObserver() {
		let sidebarRafPending = false;
		const observer = new MutationObserver((mutations) => {
			// Only re-process if new sidebar items were actually added
			let hasNew = false;
			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (node.nodeType === 1 && (
						node.classList?.contains('standard-sidebar-item') ||
						node.classList?.contains('sidebar-item-container') ||
						node.querySelector?.('.standard-sidebar-item:not(.icons-applied)')
					)) {
						hasNew = true;
						break;
					}
				}
				if (hasNew) break;
			}
			if (hasNew && !sidebarRafPending) {
				sidebarRafPending = true;
				window.requestAnimationFrame(() => {
					this.applySidebarIcons();
					sidebarRafPending = false;
				});
			}
		});

		const sidebarContainer = document.querySelector('.layout-side-section, .list-sidebar');
		if (sidebarContainer) {
			observer.observe(sidebarContainer, { childList: true, subtree: true });
		}
	}

	getIconKey(name) {
		if (!name) return 'default';
		const lowerName = name.toLowerCase();
		const keywordMap = [
			[['home'], 'home'], [['account', 'finance', 'ledger', 'billing'], 'accounting'],
			[['travel', 'flight', 'airline'], 'travel'], [['setting', 'config'], 'settings'],
			[['report', 'analytic'], 'reports'], [['people', 'hr', 'human', 'user'], 'people'],
			[['master'], 'masters'], [['customer', 'client', 'crm'], 'customers'],
			[['supplier', 'vendor'], 'suppliers'], [['invoice', 'bill', 'receipt'], 'invoices'],
			[['payment', 'cash', 'bank'], 'payments'], [['transaction'], 'transactions'],
			[['hotel'], 'hotel'], [['visa'], 'visa'], [['calendar'], 'calendar'],
			[['refund'], 'refund'], [['dashboard', 'workspace'], 'dashboard'],
			[['asset', 'stock'], 'assets'], [['back office'], 'backoffice'],
			[['front office'], 'frontoffice'], [['tool'], 'tools'], [['web'], 'website'],
			[['manufacturing'], 'manufacturing'], [['buying'], 'buying'], [['selling'], 'selling'],
			[['project'], 'projects'], [['support', 'help'], 'support'], [['quality'], 'quality'],
		];
		for (const [keywords, key] of keywordMap) {
			if (keywords.some(k => lowerName.includes(k))) return key;
		}
		return 'default';
	}

	getIcon(key, color) {
		const iconMap = {
			home: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H15v-5h-6v5H4a1 1 0 0 1-1-1z"/></svg>`,
			accounting: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h5M8 17h8M8 9h2"/></svg>`,
			travel: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`,
			settings: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
			reports: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="18" y1="20" x2="18" y2="14"/><line x1="12" y1="20" x2="12" y2="10"/><line x1="8" y1="20" x2="8" y2="16"/></svg>`,
			people: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
			masters: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10v4"/><path d="M10 12h4"/><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
			customers: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M16 11l2 2 4-4"/></svg>`,
			suppliers: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
			invoices: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M14 13.5a2.5 2.5 0 0 0-5 0c0 2.5 5 2.5 5 5a2.5 2.5 0 0 1-5 0"/><path d="M11.5 11v9"/></svg>`,
			payments: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><circle cx="7" cy="15" r="1" fill="${c}"/><circle cx="11" cy="15" r="1" fill="${c}"/></svg>`,
			transactions: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h13l3 3"/><path d="M21 20H8a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1z"/><path d="m14 14 2 2 4-4"/></svg>`,
			hotel: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14"/><rect x="9" y="11" width="6" height="5" rx="1"/><circle cx="9.5" cy="8" r=".5" fill="${c}"/><circle cx="14.5" cy="8" r=".5" fill="${c}"/></svg>`,
			visa: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h3"/><path d="M13 15h5"/></svg>`,
			calendar: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><rect x="8" y="14" width="2" height="2" rx=".4" fill="${c}" stroke="none"/><rect x="14" y="14" width="2" height="2" rx=".4" fill="${c}" stroke="none"/><rect x="8" y="18" width="2" height="2" rx=".4" fill="${c}" stroke="none"/></svg>`,
			refund: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 3"/></svg>`,
			dashboard: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>`,
			assets: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>`,
			backoffice: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 8h4M7 11h2"/></svg>`,
			frontoffice: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M9 8l2 2-2 2"/><path d="M13 12h3"/></svg>`,
			tools: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
			website: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
			manufacturing: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20"/><path d="M6 20V10l4-4v14"/><path d="M14 20V6l4-4v18"/><path d="M10 10h4"/></svg>`,
			stock: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18v4H3z" rx="1"/><path d="M3 11h18v4H3z" rx="1"/><path d="M3 19h18v2H3z" rx="1"/><path d="M7 5v6M7 13v8"/></svg>`,
			buying: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
			selling: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/><path d="M12 14v4M10 16h4"/></svg>`,
			projects: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="5" rx="1.5"/><rect x="3" y="10" width="11" height="5" rx="1.5"/><rect x="3" y="17" width="14" height="4" rx="1.5"/></svg>`,
			support: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v5Z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/></svg>`,
			quality: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>`,
			default: (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>`,
		};
		return iconMap[key] ? iconMap[key](color) : iconMap.default(color);
	}

	hexToRgb(hex) {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '148, 163, 184';
	}

	/**
	 * Apply premium icons to sidebar items only.
	 * Sidebar items persist across workspace navigation, so this only
	 * needs to run once (or when new sidebar items are dynamically added).
	 */
	applySidebarIcons() {
		const colors = {
			home: '#8B5CF6', accounting: '#10B981', travel: '#3ea1af', settings: '#64748B',
			reports: '#F43F5E', people: '#8c0bf5ff', masters: '#6366F1', customers: '#EC4899',
			suppliers: '#8B5CF6', invoices: '#10B981', payments: '#F59E0B', transactions: '#06B6D4',
			hotel: '#6366F1', visa: '#3B82F6', calendar: '#F43F5E', refund: '#64748B',
			dashboard: '#8B5CF6', assets: '#10B981', backoffice: '#3ea1af', frontoffice: '#06B6D4',
			tools: '#64748B', website: '#A855F7', manufacturing: '#475569', stock: '#F59E0B',
			buying: '#F97316', selling: '#EC4899', projects: '#6366F1', support: '#3ea1af',
			quality: '#10B981', default: '#94A3B8'
		};

		// Sidebar items — skip already processed
		const sidebarItems = document.querySelectorAll('.standard-sidebar-item:not(.icons-applied), .sidebar-item-container:not(.icons-applied)');
		if (!sidebarItems.length) return;

		sidebarItems.forEach((item) => {
			const label = item.querySelector('.sidebar-item-label, .item-anchor');
			if (!label) return;

			const itemName = item.getAttribute('item-name') || label.textContent.trim();
			const key = this.getIconKey(itemName);
			const color = colors[key] || colors.default;

			const iconContainer = item.querySelector('.sidebar-item-icon');
			if (iconContainer) {
				iconContainer.innerHTML = this.getIcon(key, color);
				iconContainer.classList.add('premium-icon-container');
				iconContainer.style.setProperty('--icon-brand-color', color);
				iconContainer.style.setProperty('--icon-brand-color-rgb', this.hexToRgb(color));
			}
			item.classList.add('icons-applied');
		});
	}

	/**
	 * Apply premium icons to workspace cards only.
	 * Cards are destroyed and recreated by Frappe on workspace navigation,
	 * so this needs to run on every page-change. Uses requestAnimationFrame
	 * for minimal visual delay.
	 */
	applyWorkspaceCardIcons() {
		const workspaceCards = document.querySelectorAll('.widget.links-widget-box:not(.icons-applied)');
		if (!workspaceCards.length) return;

		workspaceCards.forEach((card) => {
			const cardName = card.closest('[card_name]')?.getAttribute('card_name') || card.querySelector('.widget-title')?.textContent.trim();
			const iconData = this.getCardIconData(cardName);

			// Inject icon inside .widget-label so it aligns flush with the title via CSS gap
			const widgetLabel = card.querySelector('.widget-label');
			if (widgetLabel && !widgetLabel.querySelector('.premium-card-icon')) {
				const iconSpan = document.createElement('span');
				iconSpan.className = 'premium-card-icon';
				iconSpan.style.background = `rgba(${this.hexToRgb(iconData.color)}, 0.12)`;
				iconSpan.innerHTML = iconData.svg;
				widgetLabel.prepend(iconSpan);
			}

			card.classList.add('icons-applied');
		});
	}

	/**
	 * Get card-specific icon data by exact heading name, with keyword fallback.
	 * Returns { color, svg } for each card heading.
	 */
	getCardIconData(name) {
		const n = (name || '').trim();

		// ── Exact heading → unique icon + color ──
		const map = {
			// Back Office
			'Billing': {
				color: '#10B981',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 10h8"/><path d="M8 14h4"/></svg>`
			},
			'Bank Entries': {
				color: '#3B82F6',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M12 3l9 7H3z"/><path d="M6 10v11"/><path d="M10 10v11"/><path d="M14 10v11"/><path d="M18 10v11"/></svg>`
			},
			'Financial Adjustments': {
				color: '#8B5CF6',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="m8 8 4-4 4 4"/><path d="m8 16 4 4 4-4"/></svg>`
			},

			// Reports
			'Customer Report': {
				color: '#EC4899',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#EC4899" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 8v6"/><path d="M19 11h6"/></svg>`
			},
			'Supplier Report': {
				color: '#F97316',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#F97316" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`
			},
			'Sales Report': {
				color: '#14B8A6',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#14B8A6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m22 12-4-4v3H3v2h15v3z"/><path d="M6 20V10"/><path d="M10 20V4"/><path d="M14 20v-6"/></svg>`
			},
			'Account Report': {
				color: '#6366F1',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h3"/><path d="M8 17h6"/><path d="M8 9h1"/></svg>`
			},
			'Management Report': {
				color: '#7C3AED',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>`
			},
			'Financial Statement': {
				color: '#059669',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>`
			},
			'Clients Hunting Engine': {
				color: '#F43F5E',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#F43F5E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`
			},

			// Master
			'Partner Setup': {
				color: '#06B6D4',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#06B6D4" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
			},
			'Travel Setup': {
				color: '#0D9488',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#0D9488" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`
			},
			'Other Configuration': {
				color: '#64748B',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="20" cy="14" r="2"/></svg>`
			},
			'Bank Setup': {
				color: '#2563EB',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h3"/><path d="M13 15h5"/></svg>`
			},
			'Data Import and Settings': {
				color: '#D97706',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>`
			},
			'Accounting': {
				color: '#10B981',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8"/><path d="M8 10h8"/><path d="M8 14h4"/><path d="M14 14h2"/><path d="M8 18h2"/><path d="M14 18h2"/></svg>`
			},

			// Support
			'Issues': {
				color: '#EF4444',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><circle cx="12" cy="17" r=".5" fill="#EF4444"/></svg>`
			},
			'Maintenance': {
				color: '#475569',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`
			},
			'Warranty': {
				color: '#0D9488',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#0D9488" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>`
			},
			'Settings': {
				color: '#6B7280',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/></svg>`
			},
			'Reports': {
				color: '#F43F5E',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#F43F5E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="18" y1="20" x2="18" y2="14"/><line x1="14" y1="20" x2="14" y2="12"/><line x1="10" y1="20" x2="10" y2="16"/></svg>`
			},

			// Users
			'Users': {
				color: '#8B5CF6',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
			},
			'Logs': {
				color: '#D97706',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>`
			},
			'Permissions': {
				color: '#3B82F6',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1" fill="#3B82F6"/></svg>`
			},
			'User Permission': {
				color: '#06B6D4',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#06B6D4" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M16 11l2 2 4-4"/></svg>`
			},

			// Tools
			'Data': {
				color: '#14B8A6',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#14B8A6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>`
			},
			'Email': {
				color: '#3B82F6',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`
			},
			'Printing': {
				color: '#6B7280',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="8"/></svg>`
			},

			// Settings
			'Agency Settings': {
				color: '#0D9488',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#0D9488" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01"/><path d="M9 12v.01"/><path d="M9 15v.01"/><path d="M9 18v.01"/></svg>`
			},
			'Email / Notifications': {
				color: '#F59E0B',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M12 2v1"/></svg>`
			},
			'Module Settings': {
				color: '#6366F1',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`
			},
			'Core': {
				color: '#475569',
				svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>`
			},
		};

		// Exact match (case-insensitive)
		for (const [key, val] of Object.entries(map)) {
			if (key.toLowerCase() === n.toLowerCase()) return val;
		}

		// Keyword fallback — use the existing getIconKey system
		const fallbackKey = this.getIconKey(n);
		const fallbackColor = {
			home: '#8B5CF6', accounting: '#10B981', travel: '#3ea1af', settings: '#64748B',
			reports: '#F43F5E', people: '#8c0bf5', masters: '#6366F1', customers: '#EC4899',
			suppliers: '#8B5CF6', invoices: '#10B981', payments: '#F59E0B', transactions: '#06B6D4',
			hotel: '#6366F1', visa: '#3B82F6', calendar: '#F43F5E', refund: '#64748B',
			dashboard: '#8B5CF6', assets: '#10B981', backoffice: '#3ea1af', frontoffice: '#06B6D4',
			tools: '#64748B', website: '#A855F7', manufacturing: '#475569', stock: '#F59E0B',
			buying: '#F97316', selling: '#EC4899', projects: '#6366F1', support: '#3ea1af',
			quality: '#10B981', default: '#94A3B8'
		}[fallbackKey] || '#94A3B8';

		return { color: fallbackColor, svg: this.getIcon(fallbackKey, fallbackColor) };
	}
}

// Initialize theme system immediately
const initTheme = () => {
	if (!window.frappeDeskTheme) {
		const theme = new FrappeDeskTheme();
		window.frappeDeskTheme = theme;
		// Immediate first pass — both sidebar + cards
		theme.applySidebarIcons();
		theme.applyWorkspaceCardIcons();

		// Page change: only re-process workspace cards (sidebar icons persist)
		// Use requestAnimationFrame for the fastest possible paint
		$(document).on('page-change', () => {
			requestAnimationFrame(() => theme.applyWorkspaceCardIcons());
		});
		// Backup ready listener — full init on first load
		$(document).ready(() => {
			theme.applySidebarIcons();
			theme.applyWorkspaceCardIcons();
		});
	}
};

// Run as soon as script loads if DOM is ready, or wait for DOMContentLoaded
if (document.readyState === "complete" || document.readyState === "interactive") {
	initTheme();
} else {
	document.addEventListener("DOMContentLoaded", initTheme);
}

