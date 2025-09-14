import { getContext, extension_settings, saveSettingsDebounced } from "../../../extensions.js";
import { eventSource, event_types } from "../../../../script.js";
import { world_info } from "../../../../world-info.js";
import { Popup, POPUP_TYPE } from "../../../popup.js";
import { settingsTemplate } from './templates.js';


const MODULE_NAME = 'Semantix';
let hasBeenInitialized = false;

// Cache for current vectorization state
let currentVectorizationState = {
    start: null,
    end: null
};

// Default settings
const defaultSettings = {
    moduleSettings: {
        showNotifications: true,
        defaultProvider: 'bananabread',
        defaultChunkSize: 450,
        defaultOverlapSize: 50,
    },
    embeddingProviders: {
        bananabread: {
            baseUrl: 'http://localhost:8008',
            embeddingEndpoint: '/embedding',
            modelName: 'mixedbread-ai/mxbai-embed-large-v1',
            headers: {},
            defaultParams: {
                normalize: true,
                truncate: true
            }
        }
    }
};

/**
 * Initialize and validate extension settings
 */
function initializeSettings() {
    extension_settings[MODULE_NAME] = extension_settings[MODULE_NAME] || {};
    Object.assign(extension_settings[MODULE_NAME], defaultSettings);
    saveSettingsDebounced();
    return extension_settings[MODULE_NAME];
}

/**
 * Create main menu UI
 */
function createUI() {
    console.log('Semantix: Creating UI...');
    
    try {
        // Validate that jQuery and required elements are available
        if (typeof $ === 'undefined') {
            throw new Error('jQuery not available');
        }
        
        const extensionsMenu = $('#extensionsMenu');
        if (extensionsMenu.length === 0) {
            throw new Error('Extensions menu not found');
        }
        
        const menuItem = $(`
            <div id="semantix-menu-item-container" class="extension_container interactable" tabindex="0">            
                <div id="semantix-menu-item" class="list-group-item flex-container flexGap5 interactable" tabindex="0">
                    <div class="fa-fw fa-solid fa-wand-magic-sparkles extensionsMenuExtensionButton"></div>
                    <span>Semantix</span>
                </div>
            </div>
        `);
        
        extensionsMenu.append(menuItem);
        console.log('Semantix: UI created successfully');
        
    } catch (error) {
        console.error('Semantix: Error creating UI:', error);
        throw error;
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    const { eventSource, event_types } = getContext();
    console.log('Semantix: Setting up event listeners...');
    
    // Add click listener for menu item
    $(document).on('click', '#semantix-menu-item', showSettingsPopup);
    console.log('Semantix: Menu item click listener added');
    
    // Listen for world info panel being opened
    if (eventSource && event_types && event_types.WORLDINFO_PANEL_OPEN) {
        eventSource.on(event_types.WORLDINFO_PANEL_OPEN, processExistingWorldInfoEntries);
        console.log('Semantix: World info panel open listener added');
    } else {
        console.warn('Semantix: World info panel events not available');
    }
    
    // Listen for new world info entries being added
    try {
        const worldInfoContainer = document.getElementById('world_popup_entries_list');
        if (worldInfoContainer) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('world_entry')) {
                            createVectorizationButtons(node);
                        }
                    });
                });
            });
            
            observer.observe(worldInfoContainer, {
                childList: true,
                subtree: true
            });
            console.log('Semantix: World info mutation observer added');
        } else {
            console.warn('Semantix: World info container not found, mutation observer not added');
        }
    } catch (error) {
        console.error('Semantix: Error setting up mutation observer:', error);
    }
}

/**
 * Show main settings popup
 */
function showSettingsPopup() {
    const settings = initializeSettings();
    
    // Get selection data if any entries are selected
    const selectionData = getSelectionData();
    
    const templateData = {
        hasSelection: !!(currentVectorizationState.start && currentVectorizationState.end),
        selectionData: selectionData,
        moduleSettings: settings.moduleSettings,
        providers: settings.embeddingProviders,
        defaultProvider: settings.moduleSettings.defaultProvider,
        selectedProvider: settings.embeddingProviders[settings.moduleSettings.defaultProvider] || {}
    };

    const content = settingsTemplate(templateData);
    
    const popupOptions = {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        cancelButton: 'Close',
        okButton: false
    };
    
    const popup = new Popup(content, POPUP_TYPE.TEXT, '', popupOptions);
    popup.show();
    
    // Setup event listeners for the popup
    setupSettingsEventListeners(popup);
}

/**
 * Get selection data for the settings popup
 */
function getSelectionData() {
    if (!currentVectorizationState.start || !currentVectorizationState.end) {
        return null;
    }
    
    // Get world info entries - use the correct world_info structure
    const worldInfoData = world_info;
    
    // Find start and end entries
    const startEntry = worldInfoData.entries?.find(entry => entry.uid == currentVectorizationState.start);
    const endEntry = worldInfoData.entries?.find(entry => entry.uid == currentVectorizationState.end);
    
    if (!startEntry || !endEntry) {
        return null;
    }
    
    const getExcerpt = (content) => {
        return content.length > 100 ? content.substring(0, 100) + '...' : content;
    };
    
    return {
        startId: currentVectorizationState.start,
        endId: currentVectorizationState.end,
        startTitle: startEntry.comment || 'Untitled',
        endTitle: endEntry.comment || 'Untitled',
        startExcerpt: getExcerpt(startEntry.content),
        endExcerpt: getExcerpt(endEntry.content),
        entryCount: currentVectorizationState.end - currentVectorizationState.start + 1
    };
}

/**
 * Setup event listeners for settings popup
 */
function setupSettingsEventListeners(popup) {
    if (!popup || !popup.dlg) return;
    
    const popupElement = popup.dlg;
    
    // Handle process selection button
    popupElement.addEventListener('click', (e) => {
        if (e.target.matches('#semantix-process-selection')) {
            processSelectedEntries();
        }
    });
    
    // Handle input changes
    popupElement.addEventListener('input', (e) => {
        const settings = initializeSettings();
        
        if (e.target.matches('#semantix-chunk-size')) {
            const value = parseInt(e.target.value);
            if (!isNaN(value) && value >= 100 && value <= 2000) {
                settings.moduleSettings.defaultChunkSize = value;
                saveSettingsDebounced();
            }
        }
        
        if (e.target.matches('#semantix-overlap-size')) {
            const value = parseInt(e.target.value);
            if (!isNaN(value) && value >= 0 && value <= 500) {
                settings.moduleSettings.defaultOverlapSize = value;
                saveSettingsDebounced();
            }
        }
    });
    
    // Handle checkbox changes
    popupElement.addEventListener('change', (e) => {
        const settings = initializeSettings();
        
        if (e.target.matches('#semantix-show-notifications')) {
            settings.moduleSettings.showNotifications = e.target.checked;
            saveSettingsDebounced();
        }
        
        if (e.target.matches('#semantix-provider-select')) {
            settings.moduleSettings.defaultProvider = e.target.value;
            saveSettingsDebounced();
            // Refresh the popup to show new provider details
            refreshPopupContent(popup);
        }
    });
}

/**
 * Refresh popup content while preserving popup properties
 */
function refreshPopupContent(popup) {
    if (!popup || !popup.dlg || !popup.dlg.hasAttribute('open')) {
        return;
    }
    
    try {
        const settings = initializeSettings();
        const selectionData = getSelectionData();
        
        const templateData = {
            hasSelection: !!(currentVectorizationState.start && currentVectorizationState.end),
            selectionData: selectionData,
            moduleSettings: settings.moduleSettings,
            providers: settings.embeddingProviders,
            defaultProvider: settings.moduleSettings.defaultProvider,
            selectedProvider: settings.embeddingProviders[settings.moduleSettings.defaultProvider] || {}
        };
        
        const newHtml = settingsTemplate(templateData);
        
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = newHtml;
        
        // Replace the content
        popup.content.innerHTML = tempContainer.innerHTML;
        
        const requiredClasses = [
            'wide_dialogue_popup',
            'large_dialogue_popup',
            'vertical_scrolling_dialogue_popup'
        ];
        popup.dlg.classList.add(...requiredClasses);
        popup.content.style.overflowY = 'auto';
        
    } catch (error) {
        console.error('Semantix: Error refreshing popup content:', error);
    }
}

/**
 * Process selected entries for vectorization
 */
async function processSelectedEntries() {
    if (!currentVectorizationState.start || !currentVectorizationState.end) {
        return;
    }
    
    console.log(`Semantix: Processing entries from ${currentVectorizationState.start} to ${currentVectorizationState.end}`);
    
    // Show processing notification
    if (extension_settings[MODULE_NAME].moduleSettings.showNotifications) {
        toastr.info('Processing selected entries for vectorization...', 'Semantix');
    }
    
    try {
        // Get the world info data - use correct structure
        const worldInfoData = world_info;
        
        if (!worldInfoData || !worldInfoData.entries) {
            throw new Error('No world info available');
        }
        
        // Extract the selected entries
        const selectedEntries = [];
        for (let i = currentVectorizationState.start; i <= currentVectorizationState.end; i++) {
            const entry = worldInfoData.entries.find(e => e.uid == i);
            if (entry) {
                selectedEntries.push(entry);
            }
        }
        
        // Prepare the data to send to the backend
        const payload = {
            entries: selectedEntries
        };
        
        // Get settings
        const settings = initializeSettings();
        const provider = settings.embeddingProviders[settings.moduleSettings.defaultProvider];
        const baseUrl = provider.baseUrl || 'http://localhost:8000';
        
        // Send to backend
        const response = await fetch(`${baseUrl}/vectorize-and-store`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`Backend request failed with status ${response.status}`);
        }
        
        const result = await response.json();
        
        // Show success notification
        if (extension_settings[MODULE_NAME].moduleSettings.showNotifications) {
            toastr.success(`Successfully processed ${result.chunksProcessed} chunks and stored ${result.pointsStored} vectors`, 'Semantix');
        }
        
        console.log('Semantix: Vectorization result', result);
        
    } catch (error) {
        console.error('Semantix: Error processing entries', error);
        if (extension_settings[MODULE_NAME].moduleSettings.showNotifications) {
            toastr.error(`Failed to process entries: ${error.message}`, 'Semantix');
        }
    }
}

/**
 * Vector generator interceptor function
 * This function is called before each chat generation
 */
globalThis.vectorGeneratorInt = async function (chat, contextSize, abort, type) {
    console.log('Semantix: Interceptor called with type:', type);
    
    try {
        // Validate inputs
        if (!chat || !Array.isArray(chat) || chat.length === 0) {
            console.log('Semantix: No chat data available, returning original');
            return { chat, contextSize, abort };
        }
        
        // Get the latest user message from the chat
        const latestMessage = chat[chat.length - 1]?.mes;
        if (!latestMessage) {
            console.log('Semantix: No latest message found');
            return { chat, contextSize, abort };
        }
        
        // Get settings
        const settings = extension_settings[MODULE_NAME];
        if (!settings || !settings.moduleSettings || !settings.embeddingProviders) {
            console.log('Semantix: Settings not properly initialized');
            return { chat, contextSize, abort };
        }
        
        const provider = settings.embeddingProviders[settings.moduleSettings.defaultProvider];
        if (!provider) {
            console.log('Semantix: No embedding provider configured');
            return { chat, contextSize, abort };
        }
        
        const baseUrl = provider.baseUrl || 'http://localhost:8000';
        
        // Validate world info - use correct structure
        const worldInfoData = world_info;
        if (!worldInfoData) {
            console.log('Semantix: World info not available');
            return { chat, contextSize, abort };
        }
        
        // Get the current world info name - check various possible locations
        let worldInfoName = 'default';
        if (worldInfoData.world_info) {
            worldInfoName = worldInfoData.world_info;
        } else if (worldInfoData.name) {
            worldInfoName = worldInfoData.name;
        }
        
        // Prepare the search payload
        const searchPayload = {
            queryText: latestMessage,
            collectionName: `worldbook_${worldInfoName}`,
            limit: 5,
            rerank: true
        };
        
        console.log('Semantix: Sending search request to backend...');
        
        // Send search request to backend
        const response = await fetch(`${baseUrl}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(searchPayload)
        });
        
        if (!response.ok) {
            throw new Error(`Search request failed with status ${response.status}`);
        }
        
        const searchResult = await response.json();
        console.log('Semantix: Search completed, results:', searchResult.results?.length || 0);
        
        // If we have results, inject them into the prompt
        if (searchResult.results && searchResult.results.length > 0) {
            // Format the relevant entries
            const relevantEntries = searchResult.results
                .map(result => result.payload?.content || '')
                .filter(content => content)
                .join('\n\n');
            
            if (relevantEntries) {
                // Inject the relevant entries at the beginning of the first message
                const firstMessage = chat[0];
                if (firstMessage) {
                    firstMessage.mes = `[Relevant World Info:\n${relevantEntries}\n]\n\n${firstMessage.mes}`;
                    console.log('Semantix: Injected relevant world info into chat');
                }
            }
        }
        
    } catch (error) {
        console.error('Semantix: Error in interceptor', error);
        // If there's an error, just continue with the original chat
    }
    
    return { chat, contextSize, abort };
};

/**
 * Create vectorization buttons in world info entries
 */
function createVectorizationButtons(entryElement) {
    const entryId = entryElement.getAttribute('data-entryid');
    let extraButtonsContainer = entryElement.querySelector('.extraWorldEntryButtons');

    // If the button container doesn't exist, create and append it.
    if (!extraButtonsContainer) {
        extraButtonsContainer = document.createElement('div');
        extraButtonsContainer.classList.add('extraWorldEntryButtons');
        
        // World info entries have a structure we need to append to
        const entryFooter = entryElement.querySelector('.world_entry_footer');
        if (entryFooter) {
            entryFooter.appendChild(extraButtonsContainer);
        } else {
            // As a fallback, append to the main entry element.
            entryElement.appendChild(extraButtonsContainer);
        }
    }
    
    // Check if buttons already exist to prevent duplication
    if (entryElement.querySelector('.semantix-vectorize-start')) return;
    
    // Create start button
    const startButton = document.createElement('div');
    startButton.title = 'Mark for Vectorization Start';
    startButton.classList.add('semantix-vectorize-start', 'world_entry_button', 'fa-solid', 'fa-caret-right', 'interactable');
    startButton.setAttribute('tabindex', '0');
    startButton.setAttribute('data-i18n', '[title]Mark for Vectorization Start');
    startButton.setAttribute('data-entryid', entryId);
    
    // Create end button
    const endButton = document.createElement('div');
    endButton.title = 'Mark for Vectorization End';
    endButton.classList.add('semantix-vectorize-end', 'world_entry_button', 'fa-solid', 'fa-caret-left', 'interactable');
    endButton.setAttribute('tabindex', '0');
    endButton.setAttribute('data-i18n', '[title]Mark for Vectorization End');
    endButton.setAttribute('data-entryid', entryId);
    
    // Add event listeners
    startButton.addEventListener('click', (e) => {
        e.stopPropagation();
        setVectorizationMarker(entryId, 'start');
    });
    
    endButton.addEventListener('click', (e) => {
        e.stopPropagation();
        setVectorizationMarker(entryId, 'end');
    });
    
    // Append buttons
    extraButtonsContainer.appendChild(startButton);
    extraButtonsContainer.appendChild(endButton);
}

/**
 * Set vectorization marker with validation
 */
function setVectorizationMarker(entryId, type) {
    // Store previous state for optimization
    const oldStart = currentVectorizationState.start;
    const oldEnd = currentVectorizationState.end;    
    
    // Calculate new state atomically
    const newState = calculateNewVectorizationState(entryId, type);
    
    // Update cache
    currentVectorizationState.start = newState.start;
    currentVectorizationState.end = newState.end;
    
    // Update visual states of all world info entries
    updateAllButtonStates();    
    
    console.log(`Semantix: Set ${type} marker for entry ${entryId}`);
}

/**
 * Calculate new vectorization state based on marker type and entry ID
 */
function calculateNewVectorizationState(entryId, type) {
    let newStart = currentVectorizationState.start;
    let newEnd = currentVectorizationState.end;
    
    if (type === 'start') {
        // If setting start, clear end if it would be invalid
        if (currentVectorizationState.end !== null && currentVectorizationState.end <= entryId) {
            newEnd = null;
        }
        
        // Toggle start marker
        newStart = currentVectorizationState.start === entryId ? null : entryId;
    } else if (type === 'end') {
        // If setting end, clear start if it would be invalid  
        if (currentVectorizationState.start !== null && currentVectorizationState.start >= entryId) {
            newStart = null;
        }
        
        // Toggle end marker
        newEnd = currentVectorizationState.end === entryId ? null : entryId;
    }
    
    return { start: newStart, end: newEnd };
}

/**
 * Update visual states of all currently rendered world info entry buttons
 */
function updateAllButtonStates() {
    const worldInfoEntries = document.querySelectorAll('#world_popup_entries_list .world_entry');
    
    worldInfoEntries.forEach(entryElement => {
        const entryId = entryElement.getAttribute('data-entryid');
        const startBtn = entryElement.querySelector('.semantix-vectorize-start');
        const endBtn = entryElement.querySelector('.semantix-vectorize-end');
        
        if (!startBtn || !endBtn) return;
        
        // Clear all special classes
        startBtn.classList.remove('on', 'valid-start-point', 'in-scene');
        endBtn.classList.remove('on', 'valid-end-point', 'in-scene');
        
        // Apply appropriate classes based on current state
        if (currentVectorizationState.start !== null && currentVectorizationState.end !== null) {
            // Complete selection - highlight range and markers distinctly
            if (entryId === currentVectorizationState.start) {
                // This is the start marker
                startBtn.classList.add('on');
            } else if (entryId === currentVectorizationState.end) {
                // This is the end marker
                endBtn.classList.add('on');
            } else if (entryId > currentVectorizationState.start && entryId < currentVectorizationState.end) {
                // This is an entry between start and end
                startBtn.classList.add('in-scene');
                endBtn.classList.add('in-scene');
            }
            // Entries outside the selection range should have no special styling

        } else if (currentVectorizationState.start !== null) {
            // Start set, show valid end points
            if (entryId === currentVectorizationState.start) {
                startBtn.classList.add('on');
            } else if (entryId > currentVectorizationState.start) {
                endBtn.classList.add('valid-end-point');
            }
            
        } else if (currentVectorizationState.end !== null) {
            // End set, show valid start points
            if (entryId === currentVectorizationState.end) {
                endBtn.classList.add('on');
            } else if (entryId < currentVectorizationState.end) {
                startBtn.classList.add('valid-start-point');
            }
        }
    });
}

/**
 * Process existing world info entries
 */
function processExistingWorldInfoEntries() {
    const worldInfoEntries = document.querySelectorAll('#world_popup_entries_list .world_entry');
    
    worldInfoEntries.forEach(entryElement => {
        // Check if buttons are already there to prevent duplication
        if (!entryElement.querySelector('.semantix-vectorize-start')) {
            createVectorizationButtons(entryElement);
        }
    });
}

/**
 * Initialize the extension
 */
async function init() {
    if (hasBeenInitialized) {
        console.log('Semantix: Already initialized, skipping');
        return;
    }
    
    console.log('Semantix: Starting initialization...');
    
    try {
        // Wait for SillyTavern to be ready
        let attempts = 0;
        const maxAttempts = 20;
        
        while (attempts < maxAttempts) {
            if ($('#extensionsMenu').length > 0 && eventSource && event_types) {
                console.log('Semantix: Core SillyTavern components detected');
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (attempts >= maxAttempts) {
            console.error('Semantix: Timeout waiting for SillyTavern components');
            return;
        }
        
        // Initialize settings
        console.log('Semantix: Initializing settings...');
        initializeSettings();
        
        // Create UI
        console.log('Semantix: Creating UI...');
        createUI();
        
        // Setup event listeners
        console.log('Semantix: Setting up event listeners...');
        setupEventListeners(context);
        
        // Process any world info entries that are already on the screen
        try {
            console.log('Semantix: Processing existing world info entries...');
            processExistingWorldInfoEntries();
            console.log('Semantix: Processed existing world info entries during initialization');
        } catch (error) {
            console.error('Semantix: Error processing existing world info entries during init:', error);
        }
        
        hasBeenInitialized = true;
        console.log('Semantix: Extension loaded successfully');
        
    } catch (error) {
        console.error('Semantix: Critical error during initialization:', error);
        console.error('Semantix: Stack trace:', error.stack);
    }
}

// Initialize when ready - Use proper SillyTavern extension pattern
$(document).ready(() => {
    if (eventSource && event_types.APP_READY) {
        eventSource.on(event_types.APP_READY, init);
    }    
    setTimeout(init, 2000);
});