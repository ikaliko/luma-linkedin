// ==UserScript==
// @name         Luma Guest Enhancer
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Add LinkedIn profile links to Luma event guest lists
// @author       You
// @match        https://lu.ma/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Single source of truth: unified guests array
    let guests = [];
    
    // State for filters
    let linkedInFilterActive = false;
    
    // Function to extract event ID and ticket key from page
    function getEventInfo() {
        // Try to get event ID from page source or URL
        let eventApiId = null;
        let ticketKey = null;
        
        // Extract ticket key from URL
        const urlParams = new URLSearchParams(window.location.search);
        ticketKey = urlParams.get('tk');
        
        // Try to find event API ID in page source
        const pageSource = document.documentElement.innerHTML;
        const apiIdMatch = pageSource.match(/evt-[a-zA-Z0-9]+/);
        if (apiIdMatch) {
            eventApiId = apiIdMatch[0];
        }
        
        console.log('🔍 Detected event info:', { eventApiId, ticketKey });
        return { eventApiId, ticketKey };
    }
    
    // Function to create enhanced guest object
    function createEnhancedGuest(apiGuest) {
        const name = apiGuest.name.trim();
        
        // Extract LinkedIn URL from various possible sources
        let linkedinUrl = null;
        
        // Check for LinkedIn in social_media_links
        if (apiGuest.social_media_links) {
            apiGuest.social_media_links.forEach(link => {
                if (link.url && link.url.includes('linkedin.com')) {
                    linkedinUrl = link.url;
                }
            });
        }
        
        // Check for LinkedIn handle (most important field!)
        if (!linkedinUrl && apiGuest.linkedin_handle && apiGuest.linkedin_handle.trim()) {
            linkedinUrl = `https://linkedin.com${apiGuest.linkedin_handle.trim()}`;
        }
        
        // Check for LinkedIn in other profile fields
        if (!linkedinUrl && apiGuest.linkedin_url) {
            linkedinUrl = apiGuest.linkedin_url;
        }
        
        // Check other possible LinkedIn field names
        const possibleLinkedInFields = ['linkedin', 'linkedin_profile', 'social_linkedin', 'profile_linkedin'];
        if (!linkedinUrl) {
            possibleLinkedInFields.forEach(field => {
                if (apiGuest[field] && apiGuest[field].includes && apiGuest[field].includes('linkedin.com')) {
                    linkedinUrl = apiGuest[field];
                }
            });
        }
        
        // Create enhanced guest object
        const enhancedGuest = {
            name: name,
            linkedinUrl: linkedinUrl,
            // Keep original API data for reference
            originalData: apiGuest
        };
        
        return enhancedGuest;
    }
    
    // Function to fetch guest data using page-by-page pagination and create unified guests array
    async function fetchGuestData() {
        try {
            console.log('🔄 Fetching guest data with pagination...');
            
            const { eventApiId, ticketKey } = getEventInfo();
            
            if (!eventApiId) {
                throw new Error('Could not find event API ID on page');
            }
            
            if (!ticketKey) {
                console.log('⚠️ No ticket key found - this might limit data access');
            }
            
            // Clear existing guests
            guests = [];
            
            // Pagination state variables
            let allApiGuests = [];
            let hasMore = true;
            let nextCursor = null;
            let pageCount = 0;
            
            // Fetch pages until no more data
            while (hasMore) {
                pageCount++;
                console.log(`📄 Fetching page ${pageCount}...`);
                
                // Build pagination parameters
                let paginationParams = `pagination_limit=100`;
                if (nextCursor) {
                    paginationParams += `&pagination_cursor=${encodeURIComponent(nextCursor)}`;
                }
                
                // Construct API URL
                const url = `https://api.lu.ma/event/get-guest-list?event_api_id=${eventApiId}&${paginationParams}${ticketKey ? `&ticket_key=${ticketKey}` : ''}`;
                console.log(`🌐 API URL (page ${pageCount}):`, url);
                
                try {
                    const response = await fetch(url, {
                        "headers": {
                            "accept": "*/*",
                            "accept-language": "en",
                            "priority": "u=1, i",
                            "sec-ch-ua": "\"Not)A;Brand\";v=\"8\", \"Chromium\";v=\"138\", \"Google Chrome\";v=\"138\"",
                            "sec-ch-ua-mobile": "?0",
                            "sec-ch-ua-platform": "\"macOS\"",
                            "sec-fetch-dest": "empty",
                            "sec-fetch-mode": "cors",
                            "sec-fetch-site": "same-site",
                            "x-luma-client-type": "luma-web",
                            "x-luma-client-version": "b806498a6e659092988dd5eb11fdd42cd437deab",
                            "x-luma-web-url": window.location.href
                        },
                        "referrer": "https://lu.ma/",
                        "body": null,
                        "method": "GET",
                        "mode": "cors",
                        "credentials": "include"
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    
                    if (data.entries && Array.isArray(data.entries)) {
                        console.log(`✅ Page ${pageCount}: Found ${data.entries.length} guests`);
                        
                        // Add to all API guests
                        allApiGuests.push(...data.entries);
                        
                        // Update pagination state
                        hasMore = data.has_more || false;
                        nextCursor = data.next_cursor || null;
                        
                        console.log(`📄 Page ${pageCount} complete`);
                        console.log(`📊 Pagination state: hasMore=${hasMore}, nextCursor=${nextCursor ? 'present' : 'none'}`);
                        
                        // Safety check to prevent infinite loops
                        if (pageCount >= 50) {
                            console.log('⚠️ Reached maximum page limit (50), stopping fetch');
                            break;
                        }
                        
                    } else {
                        console.log(`⚠️ Page ${pageCount}: No guest entries found in API response`);
                        hasMore = false;
                    }
                    
                } catch (pageError) {
                    console.error(`❌ Error fetching page ${pageCount}:`, pageError);
                    hasMore = false; // Stop pagination on error
                }
            }
            
            console.log(`\n🎉 Pagination complete!`);
            console.log(`📊 Total pages fetched: ${pageCount}`);
            console.log(`👥 Total API guests found: ${allApiGuests.length}`);
            
            // Process all API guests into enhanced guest objects
            let linkedinCount = 0;
            
            allApiGuests.forEach((apiGuest, index) => {
                if (apiGuest.name) {
                    const enhancedGuest = createEnhancedGuest(apiGuest);
                    guests.push(enhancedGuest);
                    
                    // Count statistics
                    if (enhancedGuest.linkedinUrl) linkedinCount++;
                    
                    // Debug: log first few guests
                    if (index < 3) {
                        console.log(`DEBUG Enhanced guest ${index + 1}:`, enhancedGuest);
                    }
                }
            });
            
            console.log(`📊 Enhanced guests created: ${guests.length}`);
            console.log(`🔗 LinkedIn profiles: ${linkedinCount}`);
            
        } catch (error) {
            console.error('❌ Error fetching guest data:', error);
            console.log('💡 Make sure you are on a Luma event page with guest list access');
        }
    }
    
    // Function to find guest by name
    function findGuestByName(name) {
        return guests.find(guest => guest.name === name.trim());
    }

    // Function to create LinkedIn link element
    function createLinkedInLink(linkedinUrl, name) {
        const linkedinLink = document.createElement('a');
        linkedinLink.href = linkedinUrl;
        linkedinLink.target = '_blank';
        linkedinLink.rel = 'noopener noreferrer';
        linkedinLink.style.cssText = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            margin: 0 4px;
            background-color: #0077b5;
            border-radius: 4px;
            transition: background-color 0.2s ease;
            cursor: pointer;
        `;
        linkedinLink.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
        `;
        linkedinLink.title = `${name}'s LinkedIn Profile`;
        
        linkedinLink.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#005885';
        });
        
        linkedinLink.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '#0077b5';
        });
        
        // Prevent parent link from intercepting clicks
        linkedinLink.addEventListener('click', function(event) {
            event.stopPropagation();
        });
        
        return linkedinLink;
    }

    // Function to create LinkedIn filter
    function createLinkedInFilter(popup) {
        // Check if filter already exists
        if (popup.querySelector('.filters-container')) {
            return popup.querySelector('.filters-container');
        }
        
        const filtersContainer = document.createElement('div');
        filtersContainer.className = 'filters-container';
        filtersContainer.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 24px;
            padding: 12px 16px;
            border-bottom: 1px solid #e0e0e0;
            background-color: #f8f9fa;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        
        // LinkedIn Filter
        const linkedinFilterGroup = document.createElement('div');
        linkedinFilterGroup.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        
        const linkedinCheckbox = document.createElement('input');
        linkedinCheckbox.type = 'checkbox';
        linkedinCheckbox.id = 'linkedin-filter-checkbox';
        linkedinCheckbox.checked = linkedInFilterActive;
        linkedinCheckbox.style.cssText = `
            cursor: pointer;
            transform: scale(1.2);
        `;
        
        const linkedinLabel = document.createElement('label');
        linkedinLabel.htmlFor = 'linkedin-filter-checkbox';
        linkedinLabel.style.cssText = `
            font-size: 14px;
            font-weight: 500;
            color: #333;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
        `;
        
        const linkedinIcon = document.createElement('span');
        linkedinIcon.style.cssText = `
            display: inline-flex;
            align-items: center;
            width: 18px;
            height: 18px;
            background-color: #0077b5;
            border-radius: 3px;
        `;
        linkedinIcon.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white" style="margin: auto;">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
        `;
        
        linkedinLabel.appendChild(linkedinIcon);
        linkedinLabel.appendChild(document.createTextNode('LinkedIn'));
        
        linkedinFilterGroup.appendChild(linkedinCheckbox);
        linkedinFilterGroup.appendChild(linkedinLabel);
        
        // Add filter group to main container
        filtersContainer.appendChild(linkedinFilterGroup);
        
        // Add event listener
        linkedinCheckbox.addEventListener('change', function() {
            linkedInFilterActive = this.checked;
            console.log(`LinkedIn filter ${linkedInFilterActive ? 'enabled' : 'disabled'}`);
            applyLinkedInFilter(popup);
        });
        
        // Insert the filter at the top of the popup, after any header
        const popupContent = popup.querySelector('[class*="content"]') || popup.firstElementChild;
        if (popupContent) {
            popupContent.insertBefore(filtersContainer, popupContent.firstChild);
        } else {
            popup.insertBefore(filtersContainer, popup.firstChild);
        }
        
        return filtersContainer;
    }

    // Function to apply LinkedIn filter based on guests array
    function applyLinkedInFilter(popup) {
        const guestRows = popup.querySelectorAll('.flex-center.gap-2.spread');
        let visibleCount = 0;
        let hiddenCount = 0;
        
        guestRows.forEach(guestRow => {
            const nameElement = guestRow.querySelector('.name.text-ellipses.fw-medium');
            if (!nameElement) return;
            
            const name = nameElement.textContent.trim();
            const guest = findGuestByName(name);
            
            if (!guest) {
                // If we don't have data for this guest, show them by default
                guestRow.style.display = 'flex';
                visibleCount++;
                return;
            }
            
            // Check LinkedIn filter using guests array data
            const passesLinkedInFilter = !linkedInFilterActive || guest.linkedinUrl;
            
            if (passesLinkedInFilter) {
                guestRow.style.display = 'flex';
                visibleCount++;
            } else {
                guestRow.style.display = 'none';
                hiddenCount++;
            }
        });
        
        console.log(`LinkedIn filter applied: ${visibleCount} shown, ${hiddenCount} hidden`);
        console.log(`LinkedIn filter active: ${linkedInFilterActive}`);
        
        // Update guest count in header
        updateGuestCount(popup, visibleCount);
    }

    // Function to update guest count in header
    function updateGuestCount(popup, visibleCount) {
        const guestCountElement = popup.querySelector('h2, h3, [class*="title"]');
        if (guestCountElement) {
            // Check if this element contains guest count
            const hasGuestCount = guestCountElement.textContent.match(/\d+\s+Guest/) || 
                                 guestCountElement.textContent.match(/\d+\s+LinkedIn\s+Guest/);
            
            if (hasGuestCount) {
                // Store original text if not already stored
                if (!guestCountElement.dataset.originalText) {
                    guestCountElement.dataset.originalText = guestCountElement.textContent;
                }
                
                if (!linkedInFilterActive) {
                    // No filter active - restore original
                    guestCountElement.textContent = guestCountElement.dataset.originalText;
                } else {
                    // LinkedIn filter active
                    guestCountElement.textContent = `${visibleCount} LinkedIn Guests`;
                }
            }
        }
    }

    // Function to load all guest rows by scrolling the popup
    async function loadAllGuestRows(popup) {
        console.log('📜 Starting to load all guest rows...');
        
        // Find the scrollable container - look for the guest list container
        const scrollableContainer = popup.querySelector('.jsx-a348e8d7fc64ad6b.flex-column.outer.overflow-auto') ||
                                   popup.querySelector('[class*="overflow-auto"]') ||
                                   popup.querySelector('.lux-modal-body') ||
                                   popup;
        
        let previousRowCount = popup.querySelectorAll('.flex-center.gap-2.spread').length;
        let attempts = 0;
        const maxAttempts = 100; // Increased for larger guest lists
        
        return new Promise((resolve) => {
            const scrollAndCheck = () => {
                attempts++;
                
                // Scroll to bottom to trigger loading more guests
                scrollableContainer.scrollTo({
                    top: scrollableContainer.scrollHeight,
                    behavior: 'auto'
                });
                
                // Also try scrolling the window as backup
                window.scrollTo({
                    top: document.body.scrollHeight,
                    behavior: 'auto'
                });
                
                setTimeout(() => {
                    const currentRowCount = popup.querySelectorAll('.flex-center.gap-2.spread').length;
                    console.log(`📜 Scroll attempt ${attempts}: ${currentRowCount} guest rows loaded (was ${previousRowCount})`);
                    
                    // Check if we loaded more rows or reached the target
                    if (currentRowCount > previousRowCount && attempts < maxAttempts) {
                        previousRowCount = currentRowCount;
                        
                        // If we still don't have all guests, continue scrolling
                        if (currentRowCount < guests.length) {
                            scrollAndCheck();
                        } else {
                            console.log(`✅ Successfully loaded all ${currentRowCount} guest rows!`);
                            // Re-enhance the guest list with all rows now visible
                            setTimeout(() => enhanceVisibleRows(popup), 500);
                            resolve();
                        }
                    } else if (attempts >= maxAttempts) {
                        console.log(`⚠️ Reached maximum scroll attempts. Loaded ${currentRowCount} of ${guests.length} guests.`);
                        setTimeout(() => enhanceVisibleRows(popup), 500);
                        resolve();
                    } else {
                        // No new rows loaded, we might be done
                        console.log(`📜 No more guests to load. Final count: ${currentRowCount} guest rows.`);
                        setTimeout(() => enhanceVisibleRows(popup), 500);
                        resolve();
                    }
                }, 800); // Increased delay to allow for loading
            };
            
            scrollAndCheck();
        });
    }

    // Function to enhance only the visible guest rows (called after scrolling)
    function enhanceVisibleRows(popup) {
        const guestRows = popup.querySelectorAll('.flex-center.gap-2.spread');
        console.log(`🎨 Enhancing ${guestRows.length} guest rows with icons...`);
        
        guestRows.forEach((guestRow, index) => {
            try {
                const nameElement = guestRow.querySelector('.name.text-ellipses.fw-medium');
                if (!nameElement) return;
                
                const name = nameElement.textContent.trim();
                if (!name || name.length < 2) return;
                
                // Skip if already enhanced
                if (guestRow.querySelector('[data-guest-enhanced]')) {
                    return;
                }
                
                // Find guest data from our unified array
                const guest = findGuestByName(name);
                if (!guest) {
                    return;
                }
                
                // Find or create social container
                let socialContainer = guestRow.querySelector('.flex-center.min-width-0.text-primary.gap-25');
                if (!socialContainer) {
                    socialContainer = guestRow.querySelector('div:last-child');
                }
                
                if (!socialContainer) {
                    socialContainer = document.createElement('div');
                    socialContainer.className = 'social-links-enhanced';
                    guestRow.appendChild(socialContainer);
                }
                
                // Ensure flex layout
                socialContainer.style.cssText += `
                    display: flex !important;
                    align-items: center !important;
                    gap: 4px !important;
                `;
                
                // Add LinkedIn icon
                if (guest.linkedinUrl) {
                    const linkedinLink = createLinkedInLink(guest.linkedinUrl, name);
                    linkedinLink.setAttribute('data-guest-enhanced', name);
                    socialContainer.appendChild(linkedinLink);
                }
                
            } catch (error) {
                console.error(`❌ Error enhancing guest row ${index + 1}:`, error);
            }
        });
        
        // Apply current filter
        applyLinkedInFilter(popup);
        
        console.log(`✅ Enhancement complete for ${guestRows.length} guest rows`);
    }

    // Function to enhance guest list with icons
    function enhanceGuestList() {
        console.log('=== Enhancing guest list ===');
        console.log('Enhanced guests available:', guests.length);
        
        // Look for the guest list popup
        const popupSelectors = [
            '[role="dialog"]',
            '[class*="modal"]', 
            '[class*="popup"]',
            '[class*="overlay"]',
            'div:has(*:contains("Guest"))',
            'div:has(*:contains("Attendee"))'
        ];
        
        let popup = null;
        for (const selector of popupSelectors) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    const text = element.textContent;
                    if (text.includes('Guest') && text.match(/\d+\s+Guest/)) {
                        popup = element;
                        console.log('Found guest popup container:', selector);
                        break;
                    }
                }
                if (popup) break;
            } catch (e) {
                // Skip selectors that don't work
            }
        }
        
        if (!popup) {
            console.log('⚠️ No guest popup found - make sure to click the guest list button first');
            return;
        }
        
        // Add LinkedIn filter checkbox
        createLinkedInFilter(popup);
        
        // Find all guest rows
        const guestRows = popup.querySelectorAll('.flex-center.gap-2.spread');
        console.log(`Found ${guestRows.length} guest rows`);
        
        if (guestRows.length === 0) {
            console.log('⚠️ No guest rows found');
            return;
        }
        
        // If we have more guests than visible rows, try to scroll to load more
        if (guests.length > guestRows.length) {
            console.log(`⚠️ Only ${guestRows.length} of ${guests.length} guests are visible. Attempting to load more...`);
            setTimeout(() => loadAllGuestRows(popup), 100);
            return; // Exit early - enhanceVisibleRows will be called after scrolling
        }
        
        // Process each guest row
        guestRows.forEach((guestRow, index) => {
            try {
                const nameElement = guestRow.querySelector('.name.text-ellipses.fw-medium');
                if (!nameElement) return;
                
                const name = nameElement.textContent.trim();
                if (!name || name.length < 2) return;
                
                // Find guest data from our unified array
                const guest = findGuestByName(name);
                if (!guest) {
                    console.log(`⚠️ No data found for guest: ${name}`);
                    return;
                }
                
                console.log(`Processing: ${name} (LinkedIn: ${!!guest.linkedinUrl})`);
                
                // Find or create social container
                let socialContainer = guestRow.querySelector('.social-links, .jsx-9577fbf62c568ee1.social-links, [class*="social"], div:last-child');
                
                if (!socialContainer) {
                    const divs = guestRow.querySelectorAll('div');
                    if (divs.length >= 2) {
                        socialContainer = divs[1];
                    } else {
                        socialContainer = document.createElement('div');
                        socialContainer.className = 'social-links-enhanced';
                        guestRow.appendChild(socialContainer);
                    }
                }
                
                // Ensure flex layout
                socialContainer.style.cssText += `
                    display: flex !important;
                    align-items: center !important;
                    gap: 4px !important;
                `;
                
                // Clear existing enhanced icons
                const existingEnhanced = socialContainer.querySelectorAll('[data-guest-enhanced]');
                existingEnhanced.forEach(el => el.remove());
                
                // Add LinkedIn icon
                if (guest.linkedinUrl) {
                    const linkedinLink = createLinkedInLink(guest.linkedinUrl, name);
                    linkedinLink.classList.add('linkedin-enhanced');
                    linkedinLink.setAttribute('data-guest-enhanced', name);
                    socialContainer.appendChild(linkedinLink);
                }
                
                // Make Luma profile link open in new tab
                const lumaProfileLink = guestRow.querySelector('a[href^="/user/"]');
                if (lumaProfileLink && !lumaProfileLink.target) {
                    lumaProfileLink.target = '_blank';
                    lumaProfileLink.rel = 'noopener noreferrer';
                }
                
            } catch (error) {
                console.error(`❌ Error processing guest row ${index + 1}:`, error);
            }
        });
        
        // Apply current filter
        applyLinkedInFilter(popup);
        
        console.log('=== Finished enhancing guest list ===');
    }

    // Function to observe DOM changes and detect popup opening
    function setupObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check if this might be a guest list popup
                        if (node.querySelector('[class*="guest"]') || 
                            node.querySelector('[class*="attendee"]') ||
                            node.matches('[class*="popup"]') ||
                            node.matches('[class*="modal"]') ||
                            node.matches('[role="dialog"]')) {
                            
                            // Wait a bit for content to load, then enhance
                            setTimeout(enhanceGuestList, 500);
                        }
                    }
                });
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        return observer;
    }

    // Debug functions
    window.debugGuests = function() {
        console.log('=== GUEST DEBUG ===');
        console.log('Total guests:', guests.length);
        console.log('Sample guests:', guests.slice(0, 5));
        console.log('LinkedIn count:', guests.filter(g => g.linkedinUrl).length);
        enhanceGuestList();
    };
    
    window.fetchGuestData = fetchGuestData;
    
    // Initialize when page loads
    function init() {
        console.log('🔧 Initializing guest enhancer v3.2...');
        
        // Fetch and process guest data immediately
        fetchGuestData();
        
        // Set up observer for dynamic content
        setupObserver();
        
        // Listen for guest list button clicks
        document.addEventListener('click', (event) => {
            const target = event.target.closest('button');
            const targetText = target?.textContent?.toLowerCase() || '';
            
            // Look for buttons that might open guest list
            if (target && (targetText.includes('guest') || 
                          targetText.includes('attendee') ||
                          targetText.match(/\d+\s*(guest|attendee)/))) {
                console.log('🔘 Guest list button clicked:', target.textContent);
                
                // Enhance guest list when popup opens
                if (guests.length === 0) {
                    fetchGuestData().then(() => {
                        setTimeout(() => enhanceGuestList(), 1000);
                    });
                } else {
                    // Try multiple times as the popup might be delayed
                    setTimeout(() => enhanceGuestList(), 1000);
                    setTimeout(() => enhanceGuestList(), 2000);
                }
            }
        });
        
        // Also listen for popup detection
        const checkForPopup = () => {
            const popup = document.querySelector('[role="dialog"]');
            if (popup && popup.textContent.includes('Guest')) {
                console.log('🔘 Guest popup detected, enhancing...');
                setTimeout(() => enhanceGuestList(), 500);
            }
        };
        
        setInterval(checkForPopup, 1000);
        
        console.log('✅ Guest enhancer initialized');
        console.log('💡 Click the guest list button to see enhanced data');
        console.log('💡 Or run debugGuests() in console to manually test');
    }

    // Wait for page to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();