// studentLayout.js — shared shell for the per-tab student portal pages.
// Injects the sidebar + top header into <div id="layout-root">, marks the
// active nav link from the current URL path, and wires the shared behaviours
// (mobile menu, desktop sidebar collapse, dark mode, clock, logout) that used
// to live in the StudentPortalTailwind.html monolith's DOMContentLoaded block.
//
// Classic script (no modules). Runs SYNCHRONOUSLY on execution: it is loaded at
// the end of <body> (after #layout-root exists), so injection completes before
// any page-specific inline script (e.g. the transcript template copy) runs.
(function () {
    const root = document.getElementById('layout-root');
    if (!root) return;

    // Per-path titles (and the set of real tab paths the nav links point to).
    const PATH_TITLES = {
        '/student/portal': 'Dashboard',
        '/student/portal/profile': 'Profile',
        '/student/portal/financial': 'Financial Information',
        '/student/portal/payments': 'Payment History',
        '/student/portal/uploads': 'Uploads',
        '/student/portal/notes': 'Notes',
        '/student/portal/units': 'Units & Courses',
        '/student/portal/transcript': 'Transcript',
        '/student/portal/graduation': 'Apply for Graduation',
        '/student/portal/attachment': 'Apply for Attachment'
    };

    // Sidebar + header markup, faithful to the monolith (same ids/classes/icons).
    // The only change vs the monolith: nav-link hrefs are real paths, not #hash.
    root.innerHTML = `
    <!-- Mobile Menu Overlay -->
    <div id="mobile-overlay" class="fixed inset-0 bg-black bg-opacity-50 z-40 hidden md:hidden"></div>

    <!-- Sidebar -->
    <aside id="sidebar" class="sidebar fixed left-0 top-0 h-full w-64 bg-white dark:bg-gray-800 shadow-xl z-50 transition-all duration-300 flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                    <i class="ri-graduation-cap-line text-white text-lg"></i>
                </div>
                <div class="sidebar-title">
                    <h1 class="text-lg font-bold text-gray-800 dark:text-white">EDTTI Portal</h1>
                </div>
            </div>
            <button id="sidebar-toggle" class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg md:hidden">
                <i class="ri-close-line text-xl text-gray-600 dark:text-gray-300"></i>
            </button>
        </div>

        <!-- User Profile -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-gradient-to-r from-primary to-secondary rounded-full flex items-center justify-center">
                    <i class="ri-user-line text-white text-lg"></i>
                </div>
                <div class="sidebar-text flex-1 min-w-0">
                    <p class="text-sm font-semibold text-gray-800 dark:text-white truncate student-name">Loading...</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 truncate student-admission">Loading...</p>
                </div>
            </div>
        </div>

        <!-- Navigation -->
        <nav class="flex-1 p-4 overflow-y-auto">
            <ul class="space-y-2">
                <li>
                    <a href="/student/portal" class="nav-link flex items-center gap-3 px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors active">
                        <i class="ri-dashboard-3-line text-lg"></i>
                        <span class="sidebar-text">Dashboard</span>
                    </a>
                </li>
                <li>
                    <a href="/student/portal/profile" class="nav-link flex items-center gap-3 px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <i class="ri-user-3-line text-lg"></i>
                        <span class="sidebar-text">Profile</span>
                    </a>
                </li>
                <li>
                    <a href="/student/portal/financial" class="nav-link flex items-center gap-3 px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <i class="ri-money-dollar-circle-line text-lg"></i>
                        <span class="sidebar-text">Financial Info</span>
                    </a>
                </li>
                <li>
                    <a href="/student/portal/payments" class="nav-link flex items-center gap-3 px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <i class="ri-receipt-line text-lg"></i>
                        <span class="sidebar-text">Payment History</span>
                    </a>
                </li>
                <li>
                    <a href="/student/portal/uploads" class="nav-link flex items-center gap-3 px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <i class="ri-upload-cloud-line text-lg"></i>
                        <span class="sidebar-text">Uploads</span>
                    </a>
                </li>
                <li>
                    <a href="/student/portal/notes" class="nav-link flex items-center gap-3 px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <i class="ri-message-3-line text-lg"></i>
                        <span class="sidebar-text">Notes & Messages</span>
                        <span id="notes-badge" class="hidden ml-auto px-2 py-0.5 text-xs font-semibold text-white bg-red-500 rounded-full">0</span>
                    </a>
                </li>
                <li>
                    <a href="/student/portal/units" class="nav-link flex items-center gap-3 px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <i class="ri-book-open-line text-lg"></i>
                        <span class="sidebar-text">Units & Courses</span>
                    </a>
                </li>
                <li>
                    <a href="/student/portal/transcript" class="nav-link flex items-center gap-3 px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <i class="ri-file-text-line text-lg"></i>
                        <span class="sidebar-text">Transcript</span>
                    </a>
                </li>
                <li>
                    <a href="/student/portal/graduation" class="nav-link flex items-center gap-3 px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <i class="ri-graduation-cap-line text-lg"></i>
                        <span class="sidebar-text">Apply for Graduation</span>
                    </a>
                </li>
                <li>
                    <a href="/student/portal/attachment" class="nav-link flex items-center gap-3 px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <i class="ri-briefcase-line text-lg"></i>
                        <span class="sidebar-text">Apply for Attachment</span>
                    </a>
                </li>
            </ul>
        </nav>

        <!-- Footer Actions -->
        <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div class="space-y-2">
                <button id="dark-mode-toggle" class="w-full flex items-center gap-3 px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                    <i class="ri-moon-line text-lg dark:ri-sun-line"></i>
                    <span class="sidebar-text">Dark Mode</span>
                </button>
                <button id="logout-btn" class="w-full flex items-center gap-3 px-3 py-2.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                    <i class="ri-logout-box-line text-lg"></i>
                    <span class="sidebar-text">Logout</span>
                </button>
            </div>
        </div>
    </aside>

    <!-- Main Content -->
    <main id="main-content" class="md:ml-64 transition-all duration-300">
        <!-- Top Bar -->
        <header class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
            <div class="flex items-center justify-between px-2 py-1.5 text-xs">
                <div class="flex items-center gap-2">
                    <button id="mobile-menu-btn" class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg md:hidden">
                        <i class="ri-menu-line text-xl text-gray-600 dark:text-gray-300"></i>
                    </button>
                    <button id="desktop-sidebar-toggle" class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg hidden md:block">
                        <i class="ri-menu-fold-line text-xl text-gray-600 dark:text-gray-300"></i>
                    </button>
                    <h2 id="page-title" class="text-base md:text-sm md:text-base font-semibold text-gray-800 dark:text-white">Dashboard</h2>
                </div>
                <div class="flex items-center gap-3">
                    <div class="hidden sm:flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <i class="ri-time-line"></i>
                        <span id="current-time">Loading...</span>
                    </div>
                </div>
            </div>
        </header>

        <!-- Content Area: each page drops its own section markup here -->
        <div id="page-content" class="p-2 md:p-4 space-y-3"></div>
    </main>
    `;

    // ---- B. Mark the active nav link + set the page title from the URL path ----
    let path = window.location.pathname.replace(/\/+$/, '');
    if (path === '' || path === '/student/portal/') path = '/student/portal';
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        if (link.getAttribute('href') === path) {
            link.classList.add('active', 'bg-primary', 'text-white');
        }
    });
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = PATH_TITLES[path] || 'Dashboard';

    // ---- C. Wire shared behaviours (faithful to the monolith) ----
    const sidebar = document.getElementById('sidebar');
    const mobileOverlay = document.getElementById('mobile-overlay');
    const mainContent = document.getElementById('main-content');

    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebarToggle = document.getElementById('sidebar-toggle');

    mobileMenuBtn?.addEventListener('click', () => {
        sidebar.classList.add('mobile-open');
        mobileOverlay.classList.remove('hidden');
    });

    sidebarToggle?.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        mobileOverlay.classList.add('hidden');
    });

    mobileOverlay?.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        mobileOverlay.classList.add('hidden');
    });

    // Desktop sidebar toggle
    const desktopSidebarToggle = document.getElementById('desktop-sidebar-toggle');
    let sidebarCollapsed = false;

    desktopSidebarToggle?.addEventListener('click', () => {
        sidebarCollapsed = !sidebarCollapsed;
        if (sidebarCollapsed) {
            sidebar.classList.add('sidebar-collapsed');
            mainContent.classList.remove('md:ml-64');
            mainContent.classList.add('md:ml-16');
            desktopSidebarToggle.innerHTML = '<i class="ri-menu-unfold-line text-xl text-gray-600 dark:text-gray-300"></i>';
        } else {
            sidebar.classList.remove('sidebar-collapsed');
            mainContent.classList.remove('md:ml-16');
            mainContent.classList.add('md:ml-64');
            desktopSidebarToggle.innerHTML = '<i class="ri-menu-fold-line text-xl text-gray-600 dark:text-gray-300"></i>';
        }
    });

    // Dark mode toggle
    function toggleDarkMode() {
        const html = document.documentElement;
        const darkModeToggle = document.getElementById('dark-mode-toggle');
        const icon = darkModeToggle?.querySelector('i');

        html.classList.toggle('dark');

        if (html.classList.contains('dark')) {
            localStorage.setItem('dark-mode', 'enabled');
            if (icon) {
                icon.classList.remove('ri-moon-line');
                icon.classList.add('ri-sun-line');
            }
        } else {
            localStorage.setItem('dark-mode', 'disabled');
            if (icon) {
                icon.classList.remove('ri-sun-line');
                icon.classList.add('ri-moon-line');
            }
        }
    }
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    darkModeToggle?.addEventListener('click', toggleDarkMode);

    // Initialize dark mode from saved preference
    if (localStorage.getItem('dark-mode') === 'enabled') {
        document.documentElement.classList.add('dark');
        const icon = document.querySelector('#dark-mode-toggle i');
        if (icon) {
            icon.classList.remove('ri-moon-line');
            icon.classList.add('ri-sun-line');
        }
    }

    // Current-time clock
    function updateCurrentTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
        const currentTimeElement = document.getElementById('current-time');
        if (currentTimeElement) {
            currentTimeElement.textContent = timeString;
        }
    }
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);

    // Logout modal (identical to the monolith's confirm flow)
    function showLogoutModal() {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm transform transition-all duration-300">
                <div class="p-6">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                            <i class="ri-logout-box-line text-red-600 dark:text-red-400 text-xl"></i>
                        </div>
                        <h3 class="text-sm md:text-base font-semibold text-gray-800 dark:text-white">Confirm Logout</h3>
                    </div>
                    <p class="text-gray-600 dark:text-gray-300 mb-6">Are you sure you want to logout? You will need to login again to access your account.</p>
                    <div class="flex gap-3">
                        <button onclick="cancelLogout()" class="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            Cancel
                        </button>
                        <button onclick="confirmLogout()" class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                            Logout
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Add global functions for modal actions
        window.cancelLogout = function() {
            document.body.removeChild(modal);
            delete window.cancelLogout;
            delete window.confirmLogout;
        };

        window.confirmLogout = async function() {
            document.body.removeChild(modal);
            delete window.cancelLogout;
            delete window.confirmLogout;

            // Wipe the portal's sessionStorage profile cache so a different
            // student logging in on the same browser doesn't see stale data.
            try { sessionStorage.clear(); } catch (e) { /* private mode */ }

            // AUTH.logout clears the cookie server-side (no token_version
            // bump for students — that column is missing from schema) and
            // redirects to /student/login.
            await window.AUTH.logout({ role: 'student' });
        };
    }

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        showLogoutModal();
    });
})();
