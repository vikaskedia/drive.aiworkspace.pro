<template>
  <div class="mupdf-viewer">
    <!-- PDF Viewer Header with Controls -->
    <div class="pdf-header" :class="{ 'edit-mode-header': editMode }">
      <!-- First Row: Main Controls -->
      <div class="header-row-1">
        <div class="zoom-controls">
          <el-button @click="zoomOut" size="small" :icon="ZoomOut" />
          <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
          <el-button @click="zoomIn" size="small" :icon="ZoomIn" />
          <el-button @click="fitToWidth" size="small">Fit</el-button>
        </div>

        <div class="search-controls">
          <el-input
            v-model="searchTerm"
            placeholder="Search..."
            size="small"
            style="width: 160px;"
            @keyup.enter="searchInPdf"
            @input="debouncedSearch"
          >
            <template #append>
              <el-button @click="searchInPdf" :icon="Search" />
            </template>
          </el-input>
          <div v-if="searchResults.length > 0" class="search-results-compact">
            <span class="result-count">{{ currentSearchResult + 1 }}/{{ searchResults.length }}</span>
            <el-button @click="previousSearchResult" size="small" :icon="ArrowUp" />
            <el-button @click="nextSearchResult" size="small" :icon="ArrowDown" />
            <el-button @click="clearSearch" size="small" :icon="Close" />
          </div>
        </div>

        <div class="edit-toggle-compact">
          <el-button 
            @click="toggleEditMode" 
            :type="editMode ? 'danger' : 'primary'"
            size="small"
          >
            {{ editMode ? '✖ Exit' : '✏️ Edit' }}
          </el-button>
        </div>
      </div>

      <!-- Second Row: Annotation Tools (only visible in edit mode) -->
      <div v-if="editMode" class="header-row-2">
        <div class="annotation-tools">
          <div class="tool-buttons">
            <el-button 
              @click="setEditTool('text')" 
              :type="editTool === 'text' ? 'primary' : 'default'"
              size="small"
              class="tool-btn"
            >
              📝 Text
            </el-button>
            <el-button 
              @click="setEditTool('highlight')" 
              :type="editTool === 'highlight' ? 'primary' : 'default'"
              size="small"
              class="tool-btn"
            >
              🖍️ Highlight
            </el-button>
            <el-button 
              @click="setEditTool('draw')" 
              :type="editTool === 'draw' ? 'primary' : 'default'"
              size="small"
              class="tool-btn"
            >
              ✏️ Draw
            </el-button>
          </div>
          
          <div class="tool-settings">
            <el-color-picker v-model="annotationColor" size="small" />
            <el-input-number 
              v-model="annotationSize" 
              :min="1" 
              :max="20" 
              size="small"
              controls-position="right"
              style="width: 70px;"
            />
          </div>

          <div class="annotation-info">
            <span class="current-tool-badge">{{ editTool.toUpperCase() }}</span>
            <span class="annotation-count-compact">{{ annotations.length }}</span>
          </div>

          <div class="edit-actions-compact">
            <el-button @click="clearAllAnnotations" size="small" type="warning">Clear</el-button>
            <el-button @click="saveChanges" type="success" size="small" :loading="saving">
              {{ saving ? 'Saving...' : '💾 Save to Repo' }}
            </el-button>
            <el-button @click="cancelEdit" size="small">Cancel</el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- PDF Content Area -->
    <div class="pdf-content" ref="pdfContainer" :class="{ 'edit-mode-active': editMode }">
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
import { uploadFileToGitea, generateEditedFilename, getWorkspaceGitInfo } from '../../utils/giteaFileUpload';
import { useWorkspaceStore } from '../../store/workspace';

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

// Store references
const workspaceStore = useWorkspaceStore();

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
const currentDrawingPage = ref(null);
const activePageCanvas = ref(null);

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
        cursor: crosshair;
      `;
      
      // Add mouse event listeners for annotations
      pageCanvas.addEventListener('mousedown', (e) => handlePageMouseDown(e, pageNum, pageCanvas));
      pageCanvas.addEventListener('mousemove', (e) => handlePageMouseMove(e, pageNum, pageCanvas));
      pageCanvas.addEventListener('mouseup', (e) => handlePageMouseUp(e, pageNum, pageCanvas));
      pageCanvas.addEventListener('click', (e) => handlePageClick(e, pageNum, pageCanvas));
      
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
      
      // Re-render annotations on this page after zoom change
      redrawAnnotationsOnPage(index + 1, pageCanvas);
    }
  });
}

// Function to redraw annotations on a specific page
function redrawAnnotationsOnPage(pageNumber, pageCanvas) {
  const pageAnnotations = annotations.value.filter(ann => ann.page === pageNumber);
  if (pageAnnotations.length === 0) return;
  
  const ctx = pageCanvas.getContext('2d');
  
  pageAnnotations.forEach(annotation => {
    if (annotation.type === 'draw') {
      if (annotation.points && annotation.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(annotation.points[0].x, annotation.points[0].y);
        ctx.lineTo(annotation.points[1].x, annotation.points[1].y);
        ctx.strokeStyle = annotation.color;
        ctx.lineWidth = annotation.size;
        ctx.stroke();
      }
    } else if (annotation.type === 'text') {
      ctx.fillStyle = annotation.color;
      ctx.font = `${annotation.size * 4}px Arial`;
      ctx.fillText(annotation.text, annotation.position.x, annotation.position.y);
    } else if (annotation.type === 'highlight') {
      ctx.fillStyle = annotation.color;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(
        annotation.position.x,
        annotation.position.y,
        annotation.width || 100,
        annotation.height || (annotation.size * 3)
      );
      ctx.globalAlpha = 1.0;
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
  pageCanvases.value.forEach(async (pageCanvas, index) => {
    if (pageCanvas) {
      const pageNum = index + 1;
      // Re-render the page without highlights at 1.0 zoom
      await mupdfService.renderPage(pageNum, pageCanvas, 1.0);
      // Re-apply current zoom
      pageCanvas.style.transform = `scale(${zoom.value})`;
      // Redraw annotations after clearing highlights
      redrawAnnotationsOnPage(pageNum, pageCanvas);
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
  console.log('Edit mode toggled:', editMode.value);
  
  if (editMode.value) {
    ElMessage.info(`📝 Edit mode enabled! Use the tools above to annotate the PDF.`);
  } else {
    ElMessage.info('Edit mode disabled.');
  }
}

function setEditTool(tool) {
  editTool.value = tool;
  console.log('Edit tool changed to:', tool);
  ElMessage.success(`Switched to ${tool} tool`);
}

// Mouse interaction functions for individual pages
function handlePageMouseDown(event, pageNumber, pageCanvas) {
  if (!editMode.value) return;
  
  isDrawing.value = true;
  currentDrawingPage.value = pageNumber;
  activePageCanvas.value = pageCanvas;
  
  const rect = pageCanvas.getBoundingClientRect();
  const canvasPos = getCanvasPosition(event, rect, pageCanvas);
  lastMousePos.value = canvasPos;
}

function handlePageMouseMove(event, pageNumber, pageCanvas) {
  if (!editMode.value || !isDrawing.value || currentDrawingPage.value !== pageNumber) return;
  
  const rect = pageCanvas.getBoundingClientRect();
  const currentPos = getCanvasPosition(event, rect, pageCanvas);
  
  if (editTool.value === 'draw') {
    const ctx = pageCanvas.getContext('2d');
    // Draw line
    ctx.beginPath();
    ctx.moveTo(lastMousePos.value.x, lastMousePos.value.y);
    ctx.lineTo(currentPos.x, currentPos.y);
    ctx.strokeStyle = annotationColor.value;
    ctx.lineWidth = annotationSize.value;
    ctx.stroke();
    
    // Add to annotations with page information
    annotations.value.push({
      type: 'draw',
      page: pageNumber,
      points: [lastMousePos.value, currentPos],
      color: annotationColor.value,
      size: annotationSize.value,
      canvasCoords: true
    });
  }
  
  lastMousePos.value = currentPos;
}

function handlePageMouseUp(event, pageNumber, pageCanvas) {
  if (!editMode.value) return;
  
  isDrawing.value = false;
  currentDrawingPage.value = null;
  activePageCanvas.value = null;
  
  if (editTool.value === 'text') {
    const rect = pageCanvas.getBoundingClientRect();
    const pos = getCanvasPosition(event, rect, pageCanvas);
    
    // Add text annotation
    const text = prompt('Enter text:');
    if (text) {
      const ctx = pageCanvas.getContext('2d');
      
      annotations.value.push({
        type: 'text',
        page: pageNumber,
        text: text,
        position: pos,
        color: annotationColor.value,
        size: annotationSize.value,
        canvasCoords: true
      });
      
      // Draw text on canvas
      ctx.fillStyle = annotationColor.value;
      ctx.font = `${annotationSize.value * 4}px Arial`;
      ctx.fillText(text, pos.x, pos.y);
    }
  } else if (editTool.value === 'highlight') {
    const rect = pageCanvas.getBoundingClientRect();
    const pos = getCanvasPosition(event, rect, pageCanvas);
    
    // Create highlight annotation
    const highlightWidth = 100;
    const highlightHeight = annotationSize.value * 3;
    
    const ctx = pageCanvas.getContext('2d');
    ctx.fillStyle = annotationColor.value;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(pos.x, pos.y, highlightWidth, highlightHeight);
    ctx.globalAlpha = 1.0;
    
    // Add highlight annotation
    annotations.value.push({
      type: 'highlight',
      page: pageNumber,
      position: pos,
      width: highlightWidth,
      height: highlightHeight,
      color: annotationColor.value,
      size: annotationSize.value,
      canvasCoords: true
    });
  }
}

function handlePageClick(event, pageNumber, pageCanvas) {
  // Handle canvas clicks for non-edit interactions
}

// Helper function to get correct canvas coordinates accounting for zoom
function getCanvasPosition(event, rect, pageCanvas) {
  // Get the actual canvas dimensions (before CSS scaling)
  const canvasWidth = pageCanvas.getAttribute('data-original-width') || pageCanvas.width;
  const canvasHeight = pageCanvas.getAttribute('data-original-height') || pageCanvas.height;
  
  // Calculate position relative to the canvas, accounting for zoom scaling
  const x = ((event.clientX - rect.left) / zoom.value);
  const y = ((event.clientY - rect.top) / zoom.value);
  
  return { x, y };
}

// Legacy mouse handlers (kept for backward compatibility)
function handleMouseDown(event) {
  // This is now handled by individual page handlers
}

function handleMouseMove(event) {
  // This is now handled by individual page handlers
}

function handleMouseUp(event) {
  // This is now handled by individual page handlers
}

function handleCanvasClick(event) {
  // This is now handled by individual page handlers
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
    
    ElMessage.info('🔄 Starting to save PDF with annotations...');
    
    // Check if workspace has git repository configured
    const currentWorkspace = workspaceStore.currentWorkspace;
    console.log('Current workspace for saving:', currentWorkspace);
    
    if (!currentWorkspace?.git_repo) {
      ElMessage.error('No git repository configured for this workspace. Please set up a repository in workspace settings.');
      console.error('Workspace missing git_repo:', currentWorkspace);
      return;
    }

    // Get git repository info
    const gitInfo = getWorkspaceGitInfo(currentWorkspace);
    if (!gitInfo) {
      ElMessage.error(`Cannot parse git repository URL: ${currentWorkspace.git_repo}. Please check the repository configuration.`);
      return;
    }
    
    console.log('Using git repository:', gitInfo);

    // Group annotations by page
    const annotationsByPage = {};
    annotations.value.forEach(annotation => {
      const page = annotation.page || 1;
      if (!annotationsByPage[page]) {
        annotationsByPage[page] = [];
      }
      annotationsByPage[page].push(annotation);
    });
    
    // Process annotations for burning into PDF
    ElMessage.info('📝 Processing annotations for permanent save...');
    console.log('� Burning annotations into PDF document...');
    
    // Generate the edited PDF as ArrayBuffer with annotations burned in
    ElMessage.info('📄 Generating PDF with annotations...');
    const pdfBuffer = await mupdfService.saveDocumentWithAnnotations(annotationsByPage);
    
    if (!pdfBuffer) {
      throw new Error('Failed to generate PDF buffer');
    }
    
    console.log('✅ PDF buffer generated:', {
      size: pdfBuffer.byteLength,
      type: 'ArrayBuffer',
      isValidBuffer: pdfBuffer instanceof ArrayBuffer
    });
    
    // Create a simple hash of the buffer to see if it changed
    const bufferView = new Uint8Array(pdfBuffer.slice(0, 1000)); // First 1KB
    let simpleHash = 0;
    for (let i = 0; i < bufferView.length; i++) {
      simpleHash += bufferView[i];
    }
    console.log('📊 PDF buffer hash (first 1KB):', simpleHash, 'annotations processed:', annotations.value.length);

    // Use the existing file path to update the same PDF
    const originalFilename = props.file.name;
    
    // Use the original file path from the file object
    const uploadPath = props.file.path || props.file.name;
    
    console.log('Updating existing PDF file:', {
      originalFilename,
      uploadPath,
      fileObject: props.file
    });
    
    // Get Gitea token from various sources
    const giteaToken = localStorage.getItem('gitea_token') || 
                      sessionStorage.getItem('gitea_token') ||
                      localStorage.getItem('gitea_access_token') ||
                      currentWorkspace.gitea_token ||
                      currentWorkspace.git_token ||
                      import.meta.env.VITE_GITEA_TOKEN;
    
    if (!giteaToken) {
      ElMessage.error('Gitea authentication token not found. Please configure your workspace git access.');
      console.error('Missing Gitea token. Checked:', {
        localStorage_gitea_token: !!localStorage.getItem('gitea_token'),
        sessionStorage_gitea_token: !!sessionStorage.getItem('gitea_token'),
        localStorage_gitea_access_token: !!localStorage.getItem('gitea_access_token'),
        workspace_gitea_token: !!currentWorkspace.gitea_token,
        workspace_git_token: !!currentWorkspace.git_token,
        env_gitea_token: !!import.meta.env.VITE_GITEA_TOKEN,
        workspace: currentWorkspace
      });
      return;
    }

    // Upload to Gitea
    ElMessage.info(`🚀 Uploading to repository: ${gitInfo.repo}...`);
    const uploadResult = await uploadFileToGitea({
      giteaHost: gitInfo.host,
      giteaToken: giteaToken,
      repoName: gitInfo.repo,
      filePath: uploadPath,
      fileContent: pdfBuffer,
      message: `Update PDF with ${annotations.value.length} annotations`,
      branch: 'main',
      authorName: currentWorkspace.created_by_name || 'PDF Editor',
      authorEmail: currentWorkspace.created_by_email || 'editor@aiworkspace.pro'
    });

    if (uploadResult.success) {
      ElMessage({
        message: `✅ PDF updated with annotations!<br/>📁 Repository: ${gitInfo.repo}<br/>📄 File: ${originalFilename}<br/>🔥 ${annotations.value.length} annotations permanently saved`,
        type: 'success',
        duration: 5000,
        dangerouslyUseHTMLString: true
      });
      
      console.log('✅ PDF update complete:', {
        filename: originalFilename,
        path: uploadPath,
        annotations: annotations.value.length,
        commitSha: uploadResult.commitSha,
        repository: `${gitInfo.owner}/${gitInfo.repo}`
      });
      
      // Emit save event with Gitea info
      emit('save', {
        annotations: annotations.value,
        annotationsByPage: annotationsByPage,
        filename: originalFilename,
        uploadPath: uploadPath,
        commitSha: uploadResult.commitSha,
        fileUrl: uploadResult.fileUrl,
        downloadUrl: uploadResult.downloadUrl,
        gitInfo: gitInfo,
        success: true
      });
      
      // Clear annotations after successful save to prevent duplicate saves
      annotations.value = [];
      
      // Exit edit mode after successful save
      editMode.value = false;
    } else {
      throw new Error('Upload failed');
    }
    
  } catch (err) {
    console.error('Error saving changes:', err);
    
    if (err.message.includes('Gitea API error')) {
      ElMessage.error(`Failed to save to repository: ${err.message}`);
    } else if (err.message.includes('authentication')) {
      ElMessage.error('Authentication failed. Please check your Gitea token.');
    } else {
      ElMessage.error(`Failed to save changes: ${err.message}`);
    }
  } finally {
    saving.value = false;
  }
}

function clearAllAnnotations() {
  annotations.value = [];
  
  // Re-render all pages to clear annotations
  pageCanvases.value.forEach(async (pageCanvas, index) => {
    if (pageCanvas) {
      const pageNum = index + 1;
      await mupdfService.renderPage(pageNum, pageCanvas, 1.0);
      pageCanvas.style.transform = `scale(${zoom.value})`;
    }
  });
  
  ElMessage.success('All annotations cleared');
}

function cancelEdit() {
  editMode.value = false;
  clearAllAnnotations();
  ElMessage.info('Edit mode cancelled');
}

// Utility function to get page annotations
function getPageAnnotations(pageNumber) {
  return annotations.value.filter(ann => ann.page === pageNumber);
}

// Utility function to count annotations by type
const annotationStats = computed(() => {
  const stats = { text: 0, highlight: 0, draw: 0 };
  annotations.value.forEach(ann => {
    if (stats.hasOwnProperty(ann.type)) {
      stats[ann.type]++;
    }
  });
  return stats;
});

// Debug computed property for edit mode status
const editModeDebug = computed(() => {
  return {
    editMode: editMode.value,
    editTool: editTool.value,
    annotationCount: annotations.value.length,
    shouldShowToolbar: editMode.value === true
  };
});

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

// Watch for edit mode changes (debug)
watch(() => editMode.value, (newVal, oldVal) => {
  console.log('Edit mode changed:', { from: oldVal, to: newVal });
  console.log('Current edit debug state:', editModeDebug.value);
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
  background: white;
  border-bottom: 1px solid #dcdfe6;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.pdf-header.edit-mode-header {
  background: linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%);
  border-bottom: 2px solid #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.1);
}

.header-row-1 {
  padding: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.header-row-2 {
  padding: 6px 16px 8px;
  background: rgba(64, 158, 255, 0.05);
  border-top: 1px solid rgba(64, 158, 255, 0.2);
}

.zoom-controls,
.search-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.page-info {
  font-size: 14px;
  color: #606266;
  min-width: 80px;
  text-align: center;
}

.zoom-level {
  font-size: 12px;
  color: #606266;
  min-width: 40px;
  text-align: center;
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 4px;
}

.search-results-compact {
  display: flex;
  align-items: center;
  gap: 2px;
}

.result-count {
  font-size: 11px;
  color: #909399;
  background: #f5f5f5;
  padding: 2px 4px;
  border-radius: 3px;
  min-width: 30px;
  text-align: center;
}

.edit-toggle-compact {
  display: flex;
  align-items: center;
}

.annotation-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.tool-buttons {
  display: flex;
  gap: 4px;
}

.tool-btn {
  min-width: 70px;
  font-size: 11px;
}

.tool-settings {
  display: flex;
  align-items: center;
  gap: 8px;
}

.annotation-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.current-tool-badge {
  font-size: 10px;
  color: #409eff;
  background: #f0f9ff;
  padding: 2px 6px;
  border-radius: 8px;
  border: 1px solid #409eff;
  font-weight: bold;
}

.annotation-count-compact {
  font-size: 11px;
  color: #606266;
  background: #f0f2f5;
  padding: 2px 6px;
  border-radius: 8px;
  min-width: 16px;
  text-align: center;
}

.edit-actions-compact {
  display: flex;
  gap: 4px;
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

.pdf-content.edit-mode-active {
  background: #f0f8ff;
  border: 2px dashed #409eff;
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

.page-canvas:hover {
  cursor: crosshair;
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



/* Responsive styles */
@media (max-width: 768px) {
  .header-row-1 {
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
  }
  
  .zoom-controls,
  .search-controls {
    justify-content: center;
  }
  
  .annotation-tools {
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
  }
  
  .tool-buttons,
  .tool-settings,
  .annotation-info,
  .edit-actions-compact {
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .header-row-1,
  .header-row-2 {
    padding: 6px 8px;
  }
  
  .search-controls el-input {
    width: 120px !important;
  }
  
  .tool-buttons {
    flex-wrap: wrap;
  }
}
</style>
