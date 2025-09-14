import { Handlebars } from '../../../lib.js';

/**
 * Main settings template
 */
export const settingsTemplate = Handlebars.compile(`
    <h3>🪄 Semantix Settings</h3>
    
    <div class="info-block">
        <span>Semantix enhances your world information (lore book) system using semantic similarity search. Select entries to vectorize and dynamically inject relevant lore into your RPs.</span>
    </div>
    
    {{#if hasSelection}}
    <div id="semantix-selection" class="padding10 marginBot10">
        <div class="marginBot5" style="font-weight: bold;">Selected Entries:</div>
        <div class="padding10 marginTop5 stmb-box">
            <pre><code id="semantix-selection-block">Start: Entry #{{selectionData.startId}} ({{selectionData.startTitle}})
{{selectionData.startExcerpt}}

End: Entry #{{selectionData.endId}} ({{selectionData.endTitle}})
{{selectionData.endExcerpt}}

Entries: {{selectionData.entryCount}}</code></pre>
        </div>
        <div class="buttons_block marginTop5" style="justify-content: center;">
            <div class="menu_button" id="semantix-process-selection">Process Selected Entries</div>
        </div>
    </div>
    {{else}}
    <div class="info-block warning">
        <span>No entries selected. Use the chevron buttons in world info entries to mark start (►) and end (◄) points.</span>
    </div>
    {{/if}}
    
    <h4>Embedding Provider:</h4>
    <div class="world_entry_form_control">
        <select id="semantix-provider-select" class="text_pole">
            {{#each providers}}
            <option value="{{@key}}" {{#if (eq @key ../defaultProvider)}}selected{{/if}}>{{@key}}</option>
            {{/each}}
        </select>
    </div>
    
    <div id="semantix-provider-details" class="padding10 marginBot10">
        <div class="marginBot5" style="font-weight: bold;">Provider Settings:</div>
        <div>Base URL: <span id="semantix-base-url">{{selectedProvider.baseUrl}}</span></div>
        <div>Endpoint: <span id="semantix-endpoint">{{selectedProvider.embeddingEndpoint}}</span></div>
        <div>Model: <span id="semantix-model">{{selectedProvider.modelName}}</span></div>
    </div>

    <div class="world_entry_form_control">
        <label for="semantix-chunk-size">
            <h4>Chunk Size:</h4>
            <small class="opacity50p">Size of text chunks in characters for vectorization.</small>
            <input type="number" id="semantix-chunk-size" class="text_pole" 
                value="{{moduleSettings.defaultChunkSize}}" min="100" max="2000" step="50"
                placeholder="450">
        </label>
    </div>
    
    <div class="world_entry_form_control">
        <label for="semantix-overlap-size">
            <h4>Overlap Size:</h4>
            <small class="opacity50p">Size of overlap between chunks in characters.</small>
            <input type="number" id="semantix-overlap-size" class="text_pole" 
                value="{{moduleSettings.defaultOverlapSize}}" min="0" max="500" step="10"
                placeholder="50">
        </label>
    </div>
    
    <div class="world_entry_form_control">
        <label class="checkbox_label">
            <input type="checkbox" id="semantix-show-notifications" {{#if moduleSettings.showNotifications}}checked{{/if}}>
            <span>Show notifications</span>
        </label>
    </div>
`);