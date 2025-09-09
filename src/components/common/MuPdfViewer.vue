<template>
  <div class="mupdf-viewer">
    <!-- PDF Viewer Header with Controls -->
    <div class="pdf-header">
      <div class="pdf-controls">
        <!-- Navigation Controls -->
        <!--div class="nav-controls">
          <el-button 
            @click="previousPage" 
            :disabled="currentPage <= 1"
            size="small"
            :icon="ArrowLeft"
          >
          </el-button>
          <span class="page-info">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <el-button 
            @click="nextPage" 
            :disabled="currentPage >= totalPages"
            size="small"
            :icon="ArrowRight"
          >
          </el-button>
        </div-->

        <!-- Zoom Controls -->
        <div class="zoom-controls">
          <el-button @click="zoomOut" size="small" :icon="ZoomOut">-</el-button>
          <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
          <el-button @click="zoomIn" size="small" :icon="ZoomIn">+</el-button>
          <el-button @click="fitToWidth" size="small">Fit Width</el-button>
          <el-button @click="fitToPage" size="small">Fit Page</el-button>
        </div>

        <!-- Search Controls -->
        <div class="search-controls">
          <el-input
            v-model="searchTerm"
            placeholder="Search in PDF..."
            size="small"
            style="width: 200px;"
            @keyup.enter="searchInPdf"
            @input="debouncedSearch"
          >
            <template #append>
              <el-button @click="searchInPdf" :icon="Search" />
            </template>
          </el-input>
          <div v-if="searchResults.length > 0" class="search-results">
            <span>{{ currentSearchResult + 1 }} of {{ searchResults.length }}</span>
            <el-button @click="previousSearchResult" size="small" :icon="ArrowUp" />
            <el-button @click="nextSearchResult" size="small" :icon="ArrowDown" />
            <el-button @click="clearSearch" size="small" :icon="Close" />
          </div>
        </div>
      </div>

      <!-- Edit Controls -->
      <div class="edit-controls" v-if="editMode">
        <el-button @click="saveChanges" type="primary" size="small" :loading="saving">
          Save Changes
        </el-button>
        <el-button @click="cancelEdit" size="small">
          Cancel
        </el-button>
      </div>
    </div>

    <!-- PDF Content Area -->
    <div class="pdf-content" ref="pdfContainer">
      <!-- Loading Overlay -->
      <div v-if="loading || isRenderingAllPages" class="loading-overlay">
        <el-icon class="is-loading"><Loading /></el-icon>
        <p v-if="loading">Loading PDF with MuPDF...</p>
        <p v-else-if="isRenderingAllPages">Rendering all pages... {{ allPages.length }}/{{ totalPages }}</p>
      </div>

      <!-- Error Overlay -->
      <div v-if="error" class="error-overlay">
        <el-icon class="error-icon"><Warning /></el-icon>
        <h4>Failed to load PDF</h4>
        <p>{{ error }}</p>
        <el-button @click="retryLoad">Try Again</el-button>
      </div>

      <!-- PDF Canvas Container -->
      <div class="pdf-canvas-container" :class="{ 'loading': loading }">
        <canvas 
          ref="pdfCanvas" 
          class="pdf-canvas"
          @mousedown="handleMouseDown"
          @mousemove="handleMouseMove"
          @mouseup="handleMouseUp"
          @click="handleCanvasClick"
        ></canvas>
        
        <!-- Search Highlights -->
        <div 
          v-for="(highlight, index) in searchHighlights" 
          :key="index"
          class="search-highlight"
          :class="{ active: index === currentSearchResult }"
          :style="highlight.style"
          @click="goToSearchResult(index)"
        ></div>

        <!-- Edit Annotations -->
        <div 
          v-for="(annotation, index) in annotations" 
          :key="`annotation-${index}`"
          class="pdf-annotation"
          :class="annotation.type"
          :style="annotation.style"
          @click="selectAnnotation(index)"
        ></div>
      </div>
    </div>

    <!-- Edit Mode Toolbar -->
    <div v-if="editMode" class="edit-toolbar">
      <div class="tool-group">
        <el-button 
          @click="setEditTool('text')" 
          :type="editTool === 'text' ? 'primary' : 'default'"
          size="small"
        >
          Text
        </el-button>
        <el-button 
          @click="setEditTool('highlight')" 
          :type="editTool === 'highlight' ? 'primary' : 'default'"
          size="small"
        >
          Highlight
        </el-button>
        <el-button 
          @click="setEditTool('draw')" 
          :type="editTool === 'draw' ? 'primary' : 'default'"
          size="small"
        >
          Draw
        </el-button>
      </div>
      
      <div class="tool-group">
        <el-color-picker v-model="annotationColor" size="small" />
        <el-input-number 
          v-model="annotationSize" 
          :min="1" 
          :max="20" 
          size="small"
          style="width: 80px;"
        />
      </div>
    </div>

    <!-- Edit Mode Toggle -->
    <div class="edit-toggle">
      <el-button 
        @click="toggleEditMode" 
        :type="editMode ? 'danger' : 'success'"
        size="small"
      >
        {{ editMode ? 'Exit Edit Mode' : 'Edit PDF' }}
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
import { 
  ArrowLeft, 
  ArrowRight, 
  ZoomIn, 
  ZoomOut, 
  Search, 
  ArrowUp, 
  ArrowDown, 
  Close, 
  Loading, 
  Warning 
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import mupdfService from '../../utils/mupdfService';

const props = defineProps({
  file: {
    type: Object,
    required: true
  },
  url: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['save', 'error', 'load-complete']);

// Component state
const loading = ref(true);
const error = ref(null);
const currentPage = ref(1);
const totalPages = ref(0);
const zoom = ref(1.0);
const searchTerm = ref('');
const searchResults = ref([]);
const currentSearchResult = ref(-1);
const searchHighlights = ref([]);
const editMode = ref(false);
const editTool = ref('text');
const annotationColor = ref('#ff0000');
const annotationSize = ref(3);
const annotations = ref([]);
const saving = ref(false);

// Multi-page rendering state
const allPages = ref([]);
const pageCanvases = ref([]);
const isRenderingAllPages = ref(false);

// Canvas and rendering
const pdfContainer = ref(null);
const pdfCanvas = ref(null);
const ctx = ref(null);

// Mouse interaction state
const isDrawing = ref(false);
const lastMousePos = ref({ x: 0, y: 0 });

// MuPDF service instance
let searchTimeout = null;
let scrollTimeout = null;

// Initialize MuPDF
async function initializeMuPDF() {
  try {
    console.log('Starting MuPDF initialization...');
    loading.value = true;
    error.value = null;

    console.log('Initializing MuPDF for:', props.file.name);

    // Initialize MuPDF service first
    await mupdfService.initialize();
    
    // Load PDF document using MuPDF service
    const document = await mupdfService.loadDocument(props.url);
    
    // Get total pages from the service instance
    totalPages.value = mupdfService.getTotalPages();
    currentPage.value = 1;
    
    console.log('PDF loaded with pages:', {
      totalPages: totalPages.value,
      currentPage: currentPage.value
    });

    // Wait for DOM to be ready and canvas to be available
    await nextTick();
    
    // Try multiple times to find the canvas element
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!pdfCanvas.value && attempts < maxAttempts) {
      console.log(`Canvas lookup attempt ${attempts + 1}/${maxAttempts}`);
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
      await nextTick();
      attempts++;
    }
    
    if (pdfCanvas.value) {
      console.log('Canvas element found:', pdfCanvas.value);
      ctx.value = pdfCanvas.value.getContext('2d');
      console.log('Canvas context created:', ctx.value);
      
      // Set initial canvas size
      pdfCanvas.value.width = 800; // Default width
      pdfCanvas.value.height = 600; // Default height
      
      console.log('Canvas initialized with dimensions:', {
        width: pdfCanvas.value.width,
        height: pdfCanvas.value.height
      });
      
      // Load all pages instead of just the first page
      await loadAllPages();
    } else {
      console.error('Canvas element not found after multiple attempts');
      throw new Error('Canvas element not available');
    }

    loading.value = false;
    console.log('MuPDF initialization completed successfully');
    ElMessage.success('PDF loaded successfully');
    
    // Notify parent component that PDF loading is complete
    emit('load-complete');

  } catch (err) {
    console.error('Error initializing MuPDF:', err);
    error.value = 'Failed to initialize MuPDF: ' + err.message;
    loading.value = false;
    console.log('MuPDF initialization failed, loading set to false');
    emit('error', error.value);
  }
}

// Load all pages of the PDF
async function loadAllPages() {
  try {
    console.log('Loading all pages of the PDF...');
    isRenderingAllPages.value = true;
    
    // Clear existing pages
    allPages.value = [];
    pageCanvases.value = [];
    
    // Create a container for all pages
    const pagesContainer = document.createElement('div');
    pagesContainer.className = 'all-pages-container';
    pagesContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 20px;
      align-items: center;
      min-height: 100%;
      width: 100%;
      box-sizing: border-box;
    `;
    
    // Load each page
    for (let pageNum = 1; pageNum <= totalPages.value; pageNum++) {
      console.log(`Loading page ${pageNum}/${totalPages.value}`);
      
      // Create a container for this page
      const pageContainer = document.createElement('div');
      pageContainer.className = 'page-container';
      pageContainer.style.cssText = `
        display: flex;
        justify-content: center;
        align-items: flex-start;
        margin-bottom: 20px;
        width: 100%;
        box-sizing: border-box;
      `;
      
      // Create canvas for this page
      const pageCanvas = document.createElement('canvas');
      pageCanvas.className = 'page-canvas';
      pageCanvas.style.cssText = `
        border: 1px solid #ddd;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        background: white;
        transform-origin: top center;
        transition: transform 0.2s ease;
        display: block;
      `;
      
      // Render page to canvas at 1.0 zoom first
      await mupdfService.renderPage(pageNum, pageCanvas, 1.0);
      
      // Store original dimensions
      pageCanvas.setAttribute('data-original-width', pageCanvas.width);
      pageCanvas.setAttribute('data-original-height', pageCanvas.height);
      
      // Apply current zoom
      pageCanvas.style.transform = `scale(${zoom.value})`;
      
      // Set container size to accommodate scaled canvas with extra padding
      const scaledWidth = pageCanvas.width * zoom.value;
      const scaledHeight = pageCanvas.height * zoom.value;
      pageContainer.style.width = `${scaledWidth}px`;
      pageContainer.style.height = `${scaledHeight}px`;
      pageContainer.style.minHeight = `${scaledHeight}px`;
      
      // Add canvas to page container
      pageContainer.appendChild(pageCanvas);
      
      // Add page info
      const pageInfo = {
        number: pageNum,
        canvas: pageCanvas,
        container: pageContainer,
        width: pageCanvas.width,
        height: pageCanvas.height
      };
      
      allPages.value.push(pageInfo);
      pageCanvases.value.push(pageCanvas);
      
      // Add page container to main container
      pagesContainer.appendChild(pageContainer);
      
      console.log(`Page ${pageNum} loaded successfully`);
    }
    
    // Replace the single canvas with the pages container
    if (pdfCanvas.value && pdfCanvas.value.parentNode) {
      pdfCanvas.value.parentNode.appendChild(pagesContainer);
      pdfCanvas.value.style.display = 'none'; // Hide the single canvas
    }
    
    console.log(`All ${totalPages.value} pages loaded successfully`);
    isRenderingAllPages.value = false;
    
  } catch (error) {
    console.error('Error loading all pages:', error);
    isRenderingAllPages.value = false;
    throw error;
  }
}

// Render current page (kept for backward compatibility)
async function renderPage() {
  if (!ctx.value || !pdfCanvas.value) {
    console.error('Canvas or context not available');
    return;
  }

  try {
    console.log('Starting page render...', {
      page: currentPage.value,
      totalPages: totalPages.value,
      zoom: zoom.value,
      canvasWidth: pdfCanvas.value.width,
      canvasHeight: pdfCanvas.value.height
    });
    
    // Clear the canvas before rendering new page
    ctx.value.clearRect(0, 0, pdfCanvas.value.width, pdfCanvas.value.height);
    
    // Render page using MuPDF service
    await mupdfService.renderPage(currentPage.value, pdfCanvas.value, zoom.value);
    
    console.log('Page rendered, canvas dimensions:', {
      width: pdfCanvas.value.width,
      height: pdfCanvas.value.height
    });
    
    // Draw search highlights on canvas
    drawSearchHighlightsOnCanvas();
    
    // Draw annotations
    drawAnnotations();

  } catch (err) {
    console.error('Error rendering page:', err);
    error.value = 'Failed to render PDF page';
  }
}

// Navigation functions (for page indicator only - actual navigation is via scroll)
function previousPage() {
  if (currentPage.value > 1) {
    currentPage.value--;
    console.log('Page indicator updated to:', currentPage.value);
    // Scroll to the previous page container
    const pageInfo = allPages.value[currentPage.value - 1];
    if (pageInfo && pageInfo.container) {
      pageInfo.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
    console.log('Page indicator updated to:', currentPage.value);
    // Scroll to the next page container
    const pageInfo = allPages.value[currentPage.value - 1];
    if (pageInfo && pageInfo.container) {
      pageInfo.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

// Zoom functions
function zoomIn() {
  zoom.value = Math.min(zoom.value * 1.2, 5.0);
  applyZoomToAllPages(); // Apply zoom to existing canvases
}

function zoomOut() {
  zoom.value = Math.max(zoom.value / 1.2, 0.1);
  applyZoomToAllPages(); // Apply zoom to existing canvases
}

function fitToWidth() {
  if (pdfContainer.value) {
    const containerWidth = pdfContainer.value.clientWidth;
    // We'll need to get the original page width from MuPDF
    // For now, use a reasonable default
    zoom.value = containerWidth / 595; // Standard A4 width in points
    applyZoomToAllPages(); // Apply zoom to existing canvases
  }
}

function fitToPage() {
  if (pdfContainer.value) {
    const containerWidth = pdfContainer.value.clientWidth;
    const containerHeight = pdfContainer.value.clientHeight;
    // Use standard A4 dimensions as fallback
    const pageWidth = 595; // A4 width in points
    const pageHeight = 842; // A4 height in points
    
    const scaleX = containerWidth / pageWidth;
    const scaleY = containerHeight / pageHeight;
    zoom.value = Math.min(scaleX, scaleY);
    applyZoomToAllPages(); // Apply zoom to existing canvases
  }
}

// Apply zoom to all existing page canvases without re-rendering
function applyZoomToAllPages() {
  if (pageCanvases.value.length === 0) return;
  
  console.log('Applying zoom to all pages:', zoom.value);
  
  pageCanvases.value.forEach((pageCanvas, index) => {
    if (pageCanvas && pageCanvas.parentNode) {
      // Apply CSS transform for smooth zooming from top center
      pageCanvas.style.transform = `scale(${zoom.value})`;
      pageCanvas.style.transformOrigin = 'top center';
      
      // Update page container size to accommodate the scaled canvas
      const pageContainer = pageCanvas.parentNode;
      if (pageContainer.classList.contains('page-container')) {
        const originalWidth = pageCanvas.getAttribute('data-original-width') || pageCanvas.width;
        const originalHeight = pageCanvas.getAttribute('data-original-height') || pageCanvas.height;
        
        // Update container size to match scaled canvas
        const scaledWidth = originalWidth * zoom.value;
        const scaledHeight = originalHeight * zoom.value;
        pageContainer.style.width = `${scaledWidth}px`;
        pageContainer.style.height = `${scaledHeight}px`;
        pageContainer.style.minHeight = `${scaledHeight}px`;
      }
    }
  });
}

// Search functions
function debouncedSearch() {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  searchTimeout = setTimeout(() => {
    if (searchTerm.value.trim()) {
      searchInPdf();
    } else {
      clearSearch();
    }
  }, 300);
}

async function searchInPdf() {
  if (!searchTerm.value.trim()) return;

  try {
    console.log('Searching for:', searchTerm.value);
    
    // Search using MuPDF service across all pages
    const results = await mupdfService.searchText(searchTerm.value);
    
    searchResults.value = results;

    if (searchResults.value.length > 0) {
      currentSearchResult.value = 0;
      
      // Debug: Log all search results
      console.log('All search results:', searchResults.value);
      
      // Highlight search results on all pages
      highlightSearchResults();
      goToSearchResult(0);
      ElMessage.success(`Found ${searchResults.value.length} results across all pages`);
    } else {
      ElMessage.info('No results found');
    }

  } catch (err) {
    console.error('Error searching PDF:', err);
    ElMessage.error('Search failed');
  }
}

function clearSearch() {
  searchResults.value = [];
  currentSearchResult.value = -1;
  searchHighlights.value = [];
  searchTerm.value = '';
  // Clear highlights from all pages
  clearSearchHighlights();
}

// Highlight search results on all pages
function highlightSearchResults() {
  if (searchResults.value.length === 0) return;
  
  console.log('Highlighting search results on all pages:', searchResults.value.length, 'results');
  
  // Group results by page
  const resultsByPage = {};
  searchResults.value.forEach((result, index) => {
    if (!resultsByPage[result.page]) {
      resultsByPage[result.page] = [];
    }
    resultsByPage[result.page].push({ ...result, index });
  });
  
  // Highlight each page
  Object.keys(resultsByPage).forEach(pageNum => {
    const pageIndex = parseInt(pageNum) - 1;
    const pageCanvas = pageCanvases.value[pageIndex];
    
    if (pageCanvas) {
      const ctx = pageCanvas.getContext('2d');
      const results = resultsByPage[pageNum];
      
      results.forEach(result => {
        const isActive = result.index === currentSearchResult.value;
        
        // The coordinates from MuPDF are at 1.0 zoom scale
        // Since we render at 1.0 zoom and apply CSS transform, coordinates are correct
        const x = result.x;
        const y = result.y;
        const width = result.width;
        const height = result.height;
        
        // Set highlight color - make it more visible
        ctx.fillStyle = isActive ? 'rgba(255, 255, 0, 0.3)' : 'rgba(255, 255, 0, 0.2)';
        ctx.strokeStyle = isActive ? '#ff6600' : '#ffaa00';
        ctx.lineWidth = isActive ? 2 : 1;
        
        // Draw highlight rectangle
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
      });
    }
  });
}

// Clear search highlights from all pages
function clearSearchHighlights() {
  console.log('Clearing search highlights from all pages');
  
  // Re-render all pages to clear highlights
  pageCanvases.value.forEach((pageCanvas, index) => {
    if (pageCanvas) {
      const pageNum = index + 1;
      // Re-render the page without highlights at 1.0 zoom
      mupdfService.renderPage(pageNum, pageCanvas, 1.0);
      // Re-apply current zoom
      pageCanvas.style.transform = `scale(${zoom.value})`;
    }
  });
}

function previousSearchResult() {
  if (searchResults.value.length > 0) {
    currentSearchResult.value = (currentSearchResult.value - 1 + searchResults.value.length) % searchResults.value.length;
    goToSearchResult(currentSearchResult.value);
    // Re-highlight to show the new active result
    highlightSearchResults();
  }
}

function nextSearchResult() {
  if (searchResults.value.length > 0) {
    currentSearchResult.value = (currentSearchResult.value + 1) % searchResults.value.length;
    goToSearchResult(currentSearchResult.value);
    // Re-highlight to show the new active result
    highlightSearchResults();
  }
}

function goToSearchResult(index) {
  if (index >= 0 && index < searchResults.value.length) {
    currentSearchResult.value = index;
    const result = searchResults.value[index];
    
    // Scroll to the page containing this result
    if (pdfContainer.value) {
      const pageIndex = result.page - 1;
      const pageInfo = allPages.value[pageIndex];
      
      if (pageInfo && pageInfo.container) {
        // Scroll to the page container
        pageInfo.container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Update current page indicator
        currentPage.value = result.page;
        
        console.log(`Scrolled to page ${result.page} for search result ${index}`);
      }
    }
  }
}

function drawSearchHighlightsOnCanvas() {
  if (!ctx.value || searchResults.value.length === 0) return;
  
  console.log('Drawing search highlights on canvas:', searchResults.value.length, 'results');
  
  // Draw each search result on the canvas
  searchResults.value.forEach((result, index) => {
    const isActive = index === currentSearchResult.value;
    
    // The coordinates from MuPDF are already in the correct scale
    // No need for additional scaling since we're rendering at the right size
    const x = result.x;
    const y = result.y;
    const width = result.width;
    const height = result.height;
    
    // Set highlight color
    ctx.value.fillStyle = isActive ? 'rgba(255, 255, 0, 0.8)' : 'rgba(255, 255, 0, 0.4)';
    //ctx.value.strokeStyle = isActive ? '#ff0000' : '#ffaa00';
    //ctx.value.lineWidth = isActive ? 2 : 1;
    
    // Draw highlight rectangle
    ctx.value.fillRect(x, y, width, height);
    ctx.value.strokeRect(x, y, width, height);
    
    /*console.log('Highlighted search result:', {
      index,
      isActive,
      coordinates: { x, y, width, height }
    });*/
  });
}

function drawSearchHighlights() {
  // Keep this for backward compatibility, but it's not used anymore
  searchHighlights.value = searchResults.value.map((result, index) => ({
    style: {
      position: 'absolute',
      left: `${result.x}px`,
      top: `${result.y}px`,
      width: `${result.width}px`,
      height: `${result.height}px`,
      backgroundColor: index === currentSearchResult.value ? '#ffff00' : '#ffff0080',
      border: index === currentSearchResult.value ? '2px solid #ff0000' : '1px solid #ffaa00',
      pointerEvents: 'auto',
      zIndex: 10
    },
    data: result
  }));
}

// Edit mode functions
function toggleEditMode() {
  editMode.value = !editMode.value;
  if (editMode.value) {
    ElMessage.info('Edit mode enabled. Click and drag to add annotations.');
  } else {
    ElMessage.info('Edit mode disabled.');
  }
}

function setEditTool(tool) {
  editTool.value = tool;
}

// Mouse interaction functions
function handleMouseDown(event) {
  if (!editMode.value) return;
  
  isDrawing.value = true;
  const rect = pdfCanvas.value.getBoundingClientRect();
  lastMousePos.value = {
    x: (event.clientX - rect.left) / zoom.value,
    y: (event.clientY - rect.top) / zoom.value
  };
}

function handleMouseMove(event) {
  if (!editMode.value || !isDrawing.value) return;
  
  const rect = pdfCanvas.value.getBoundingClientRect();
  const currentPos = {
    x: (event.clientX - rect.left) / zoom.value,
    y: (event.clientY - rect.top) / zoom.value
  };
  
  if (editTool.value === 'draw') {
    // Draw line
    ctx.value.beginPath();
    ctx.value.moveTo(lastMousePos.value.x, lastMousePos.value.y);
    ctx.value.lineTo(currentPos.x, currentPos.y);
    ctx.value.strokeStyle = annotationColor.value;
    ctx.value.lineWidth = annotationSize.value;
    ctx.value.stroke();
    
    // Add to annotations
    annotations.value.push({
      type: 'draw',
      points: [lastMousePos.value, currentPos],
      color: annotationColor.value,
      size: annotationSize.value,
      style: {
        position: 'absolute',
        left: `${Math.min(lastMousePos.value.x, currentPos.x)}px`,
        top: `${Math.min(lastMousePos.value.y, currentPos.y)}px`,
        width: `${Math.abs(currentPos.x - lastMousePos.value.x)}px`,
        height: `${Math.abs(currentPos.y - lastMousePos.value.y)}px`,
        backgroundColor: annotationColor.value,
        opacity: 0.7,
        pointerEvents: 'auto',
        zIndex: 5
      }
    });
  }
  
  lastMousePos.value = currentPos;
}

function handleMouseUp(event) {
  if (!editMode.value) return;
  
  isDrawing.value = false;
  
  if (editTool.value === 'text') {
    const rect = pdfCanvas.value.getBoundingClientRect();
    const pos = {
      x: (event.clientX - rect.left) / zoom.value,
      y: (event.clientY - rect.top) / zoom.value
    };
    
    // Add text annotation
    const text = prompt('Enter text:');
    if (text) {
      annotations.value.push({
        type: 'text',
        text: text,
        position: pos,
        color: annotationColor.value,
        size: annotationSize.value,
        style: {
          position: 'absolute',
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          color: annotationColor.value,
          fontSize: `${annotationSize.value * 4}px`,
          fontWeight: 'bold',
          pointerEvents: 'auto',
          zIndex: 5
        }
      });
      
      // Draw text on canvas
      ctx.value.fillStyle = annotationColor.value;
      ctx.value.font = `${annotationSize.value * 4}px Arial`;
      ctx.value.fillText(text, pos.x, pos.y);
    }
  } else if (editTool.value === 'highlight') {
    const rect = pdfCanvas.value.getBoundingClientRect();
    const pos = {
      x: (event.clientX - rect.left) / zoom.value,
      y: (event.clientY - rect.top) / zoom.value
    };
    
    // Add highlight annotation
    annotations.value.push({
      type: 'highlight',
      position: pos,
      color: annotationColor.value,
      size: annotationSize.value,
      style: {
        position: 'absolute',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        width: '100px',
        height: `${annotationSize.value * 3}px`,
        backgroundColor: annotationColor.value,
        opacity: 0.3,
        pointerEvents: 'auto',
        zIndex: 5
      }
    });
  }
}

function handleCanvasClick(event) {
  // Handle canvas clicks for non-edit interactions
}

// Handle scroll for auto-pagination
function handleScroll(event) {
  // Debounce scroll events to prevent rapid page changes
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }
  
  scrollTimeout = setTimeout(() => {
    const container = event.target;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    
    console.log('Scroll event:', {
      scrollTop,
      scrollHeight,
      clientHeight,
      currentPage: currentPage.value,
      totalPages: totalPages.value,
      threshold: scrollTop + clientHeight >= scrollHeight - 50
    });
    
    // Check if scrolled to bottom (with small threshold)
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      // Auto-load next page if available
      if (currentPage.value < totalPages.value) {
        console.log('Auto-loading next page due to scroll to bottom');
        nextPage();
      }
    }
    
    // Check if scrolled to top (with small threshold)
    if (scrollTop <= 50) {
      // Auto-load previous page if available
      if (currentPage.value > 1) {
        console.log('Auto-loading previous page due to scroll to top');
        previousPage();
      }
    }
  }, 100); // 100ms debounce
}

function drawAnnotations() {
  // Annotations are drawn as overlay elements
}

function selectAnnotation(index) {
  if (editMode.value) {
    // Handle annotation selection for editing
    console.log('Selected annotation:', index);
  }
}

// Save changes
async function saveChanges() {
  try {
    saving.value = true;
    
    // Save annotations using MuPDF service
    for (const annotation of annotations.value) {
      await mupdfService.addAnnotation(currentPage.value, annotation);
    }
    
    // Save the document
    const result = await mupdfService.saveDocument();
    
    ElMessage.success('PDF changes saved successfully');
    emit('save', {
      annotations: annotations.value,
      page: currentPage.value,
      result: result
    });
    
  } catch (err) {
    console.error('Error saving changes:', err);
    ElMessage.error('Failed to save changes');
  } finally {
    saving.value = false;
  }
}

function cancelEdit() {
  editMode.value = false;
  annotations.value = [];
  renderPage();
  ElMessage.info('Edit cancelled');
}

function retryLoad() {
  initializeMuPDF();
}

// Watch for file changes
watch(() => props.file, () => {
  if (props.file) {
    // Don't initialize immediately, wait for mount
    if (isMounted.value) {
      initializeMuPDF();
    }
  }
});

// Track if component is mounted
const isMounted = ref(false);

// Initialize when component is mounted
onMounted(() => {
  console.log('MuPdfViewer component mounted');
  isMounted.value = true;
  
  // Debug: Check if canvas exists immediately
  setTimeout(() => {
    console.log('Debug: Checking canvas after mount...');
    console.log('pdfCanvas ref:', pdfCanvas.value);
    console.log('Canvas element in DOM:', document.querySelector('canvas.pdf-canvas'));
    console.log('All canvas elements:', document.querySelectorAll('canvas'));
  }, 100);
  
  // Initialize if file is already available
  if (props.file) {
    initializeMuPDF();
  }
});

// Cleanup
onUnmounted(() => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }
  // Cleanup MuPDF service
  mupdfService.destroy();
});
</script>

<style scoped>
.mupdf-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.pdf-header {
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #dcdfe6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.pdf-controls {
  display: flex;
  gap: 20px;
  align-items: center;
}

.nav-controls,
.zoom-controls,
.search-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-info {
  font-size: 14px;
  color: #606266;
  min-width: 80px;
  text-align: center;
}

.zoom-level {
  font-size: 14px;
  color: #606266;
  min-width: 50px;
  text-align: center;
}

.search-results {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #909399;
}

.edit-controls {
  display: flex;
  gap: 8px;
}

.pdf-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: #e0e0e0;
  padding: 20px;
  min-height: 0; /* Allow flex item to shrink */
}

.loading-overlay,
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.9);
  z-index: 10;
  color: #909399;
  padding: 40px;
  text-align: center;
}

.error-icon {
  font-size: 48px;
  margin-bottom: 16px;
  color: #f56c6c;
}

.pdf-canvas-container {
  position: relative;
  transform-origin: top left;
  transition: transform 0.2s ease;
  /*border: 2px solid #ff0000;*/ /* Red border for debugging */
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pdf-canvas-container.loading {
  opacity: 0.5;
  pointer-events: none;
}

.pdf-canvas {
  display: block;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  background: white;
  cursor: crosshair;
  border: 1px solid #ddd; /* Add border for debugging */
  min-width: 100px;
  min-height: 100px;
  transform-origin: top center;
  transition: transform 0.2s ease;
}

.page-container {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  margin-bottom: 20px;
  width: 100%;
  box-sizing: border-box;
  position: relative;
  overflow: visible;
}

.page-canvas {
  display: block;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  background: white;
  border: 1px solid #ddd;
  transform-origin: top center;
  transition: transform 0.2s ease;
}

.all-pages-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  align-items: center;
  min-height: 100%;
  width: 100%;
  box-sizing: border-box;
  overflow: visible;
}

.search-highlight {
  position: absolute;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.search-highlight:hover {
  opacity: 0.8;
}

.search-highlight.active {
  box-shadow: 0 0 0 2px #409eff;
}

.pdf-annotation {
  position: absolute;
  cursor: pointer;
  transition: all 0.2s ease;
}

.pdf-annotation:hover {
  opacity: 0.8;
}

.pdf-annotation.text {
  background: transparent;
  border: none;
}

.pdf-annotation.highlight {
  border-radius: 2px;
}

.pdf-annotation.draw {
  background: transparent;
  border: none;
}

.edit-toolbar {
  padding: 8px 16px;
  background: white;
  border-top: 1px solid #dcdfe6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.tool-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

.edit-toggle {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 100;
}

/* Responsive styles */
@media (max-width: 768px) {
  .pdf-controls {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
  
  .nav-controls,
  .zoom-controls,
  .search-controls {
    justify-content: center;
  }
  
  .edit-toolbar {
    flex-direction: column;
    gap: 12px;
  }
  
  .tool-group {
    justify-content: center;
  }
}
</style>
