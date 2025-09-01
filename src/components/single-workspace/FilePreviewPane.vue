<template>
  <div class="file-preview-pane" v-if="file">
    <!-- Rename Dialog -->
    <el-dialog
      v-model="renameDialogVisible"
      title="Rename File"
      width="400px"
    >
      <el-form :model="renameForm" label-width="80px">
        <el-form-item label="New Name">
          <el-input v-model="renameForm.newName" placeholder="Enter new filename" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renameDialogVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="renaming" @click="handleRename">
          Rename
        </el-button>
      </template>
    </el-dialog>
    
    <div class="preview-content" ref="previewContentRef">
      <!-- Loading State -->
      <div v-if="loading" class="loading-indicator">
        <el-icon class="is-loading"><Document /></el-icon>
        <p>Loading file...</p>
      </div>
      
      <!-- Error State -->
      <div v-else-if="error" class="no-preview">
        <el-icon class="no-preview-icon"><Warning /></el-icon>
        <h4>{{ error }}</h4>
        <el-button @click="retryLoad">Try Again</el-button>
      </div>
      
      <!-- PDF Viewer with MuPDF -->
      <div v-else-if="isPdf" class="pdf-viewer">
        <MuPdfViewer
          :file="file"
          :url="getAuthenticatedDownloadUrl(file.download_url)"
          @save="handlePdfSave"
          @error="handlePdfError"
          @load-complete="handlePdfLoadComplete"
        />
      </div>
      
      <!-- Image Viewer -->
      <div v-else-if="isImage" class="image-container">
        <img 
          :src="getAuthenticatedDownloadUrl(file.download_url)" 
          :alt="file.name"
          class="image-preview"
          @load="handleImageLoad"
          @error="handleImageError"
        />
      </div>
      
      <!-- Text Files -->
      <div v-else-if="isTextFile" class="text-preview">
        <pre>{{ textContent }}</pre>
      </div>
      
      <!-- Markdown Files -->
      <div v-else-if="isMarkdown" class="markdown-preview">
        <MarkDownEditor 
          v-model="markdownContent"
          :readonly="false"
          @change="handleMarkdownChange"
        />
        <div class="markdown-actions">
          <el-button 
            type="primary" 
            :loading="saving" 
            @click="saveMarkdownContent"
            :disabled="!hasUnsavedChanges"
          >
            {{ hasUnsavedChanges ? 'Save Changes' : 'Saved' }}
          </el-button>
        </div>
      </div>
      
      <!-- Univer Documents -->
      <div v-else-if="isUniverDoc" class="univer-document-preview">
        <UniverDocument
          ref="univerDocumentComponent"
          :documentData="univerDocumentData"
          :file="file"
          :showHeader="false"
          height="100%"
          @save="handleUniverDocumentSave"
          @unsaved-changes="handleUnsavedChanges"
        />
      </div>
      
      <!-- No Preview Available -->
      <div v-else class="no-preview">
        <el-icon class="no-preview-icon"><Document /></el-icon>
        <h4>No preview available</h4>
        <p>{{ file.name }}</p>
        <el-button type="primary" @click="downloadFile">Download to view</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick, computed, onUnmounted } from 'vue';
import { Close, Edit, Document, Warning, Download, RefreshLeft } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import MuPdfViewer from '../common/MuPdfViewer.vue';
import MarkDownEditor from '../common/MarkDownEditor.vue';
import UniverDocument from '../common/UniverDocument.vue';

const props = defineProps({
  file: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['close', 'update:file']);

// Component state
const textContent = ref('');
const loading = ref(true);
const error = ref(null);
const renameDialogVisible = ref(false);
const renameForm = ref({ newName: '' });
const renaming = ref(false);
const markdownContent = ref('');
const saving = ref(false);
const isLoadingPdf = ref(false);
const hasUnsavedChanges = ref(false);
const downloading = ref(false);
const univerDocumentData = ref(null);
const univerDocumentComponent = ref(null);
const previewContentRef = ref(null);
const pdfLoadTimeout = ref(null);
const pdfInstance = ref(null);

// File type checks
const isPdf = computed(() => props.file?.name?.toLowerCase().endsWith('.pdf'));
const isImage = computed(() => {
  const ext = props.file?.name?.toLowerCase().split('.').pop();
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext);
});
const isTextFile = computed(() => {
  const ext = props.file?.name?.toLowerCase().split('.').pop();
  return ['txt', 'log', 'json', 'xml', 'yaml', 'yml', 'js', 'ts', 'css', 'html'].includes(ext);
});
const isMarkdown = computed(() => {
  const ext = props.file?.name?.toLowerCase().split('.').pop();
  return ['md', 'markdown'].includes(ext);
});
const isUniverDoc = computed(() => props.file?.name?.toLowerCase().endsWith('.univer'));

// Scroll to top function
function scrollToTop() {
  console.log('scrollToTop called');
  
  if (previewContentRef.value) {
    previewContentRef.value.scrollTop = 0;
  }
  
  setTimeout(() => {
    if (previewContentRef.value && previewContentRef.value.scrollTop > 0) {
      previewContentRef.value.scrollTop = 0;
    }
  }, 100);
}

// Load text content
async function loadTextContent() {
  if (!props.file) return;
  
  loading.value = true;
  try {
    const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
    const giteaHost = import.meta.env.VITE_GITEA_HOST;
    
    // Use the API endpoint instead of raw file URL
    const response = await fetch(
      `${giteaHost}/api/v1/repos/${props.file.repository}/contents/${props.file.path}`,
      {
        method: 'GET',
        headers: getGiteaHeaders(giteaToken)
      }
    );
    
    if (!response.ok) throw new Error('Failed to load file content');
    
    const data = await response.json();
    // Content from API is base64 encoded
    textContent.value = atob(data.content);
    
    if (isMarkdown.value) {
      markdownContent.value = textContent.value;
    }
    
    // Scroll to top after content loads
    setTimeout(() => {
      scrollToTop();
    }, 100);
  } catch (err) {
    error.value = 'Failed to load text content';
    console.error('Error loading text content:', err);
  } finally {
    loading.value = false;
  }
}

// Load Univer document
async function loadUniverDocument() {
  if (!props.file) return;
  
  loading.value = true;
  try {
    const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
    const giteaHost = import.meta.env.VITE_GITEA_HOST;
    
    // Use the API endpoint to get file content
    const response = await fetch(
      `${giteaHost}/api/v1/repos/${props.file.repository}/contents/${props.file.path}`,
      {
        method: 'GET',
        headers: getGiteaHeaders(giteaToken)
      }
    );
    
    if (!response.ok) throw new Error('Failed to load Univer document');
    
    const data = await response.json();
    // Content from API is base64 encoded
    const documentContent = atob(data.content);
    
    try {
      univerDocumentData.value = JSON.parse(documentContent);
      setTimeout(() => {
        scrollToTop();
      }, 100);
    } catch (parseError) {
      console.error('Error parsing Univer document:', parseError);
      error.value = 'Invalid Univer document format';
    }
  } catch (err) {
    error.value = 'Failed to load Univer document';
    console.error('Error loading Univer document:', err);
  } finally {
    loading.value = false;
  }
}

// Handle errors
function handleError() {
  loading.value = false;
  error.value = 'Failed to load file preview';
}

// Retry loading
function retryLoad() {
  loading.value = true;
  error.value = null;
  if (isTextFile.value || isMarkdown.value) {
    loadTextContent();
  } else if (isUniverDoc.value) {
    loadUniverDocument();
  } else {
    loading.value = false;
  }
}

// Download file
async function downloadFile() {
  try {
    downloading.value = true;
    
    // Fetch the file as blob to force download instead of opening in browser
    const response = await fetch(getAuthenticatedDownloadUrl(props.file.download_url));
    
    if (!response.ok) {
      throw new Error('Failed to download file');
    }
    
    const blob = await response.blob();
    
    // Create object URL and download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = props.file.name;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the object URL
    URL.revokeObjectURL(url);
    
    ElMessage.success(`Downloaded ${props.file.name}`);
  } catch (error) {
    console.error('Error downloading file:', error);
    ElMessage.error('Failed to download file: ' + error.message);
  } finally {
    downloading.value = false;
  }
}

// Handle image load/error
function handleImageLoad() {
  loading.value = false;
  error.value = null;
  setTimeout(() => {
    scrollToTop();
  }, 100);
}

function handleImageError(e) {
  console.error('Image load error:', e);
  loading.value = false;
  error.value = 'Failed to load image';
}

// Open PDF in new tab
function openPdfInNewTab() {
  const url = getAuthenticatedDownloadUrl(props.file.download_url);
  console.log('Opening PDF in new tab:', url);
  window.open(url, '_blank');
}

// Handle PDF save from MuPDF
function handlePdfSave(data) {
  console.log('PDF saved with MuPDF:', data);
  ElMessage.success('PDF changes saved successfully');
}

// Handle PDF load (legacy - kept for compatibility)
function handlePdfLoad(event) {
  console.log('PDF loaded successfully', event);
  
  // Clear timeout if PDF loads successfully
  if (pdfLoadTimeout.value) {
    clearTimeout(pdfLoadTimeout.value);
    pdfLoadTimeout.value = null;
  }
  
  loading.value = false;
  error.value = null;
  isLoadingPdf.value = false;
}

// Handle PDF error
function handlePdfError(err) {
  console.error('PDF load error:', err);
  
  // Clear timeout
  if (pdfLoadTimeout.value) {
    clearTimeout(pdfLoadTimeout.value);
    pdfLoadTimeout.value = null;
  }
  
  loading.value = false;
  isLoadingPdf.value = false;
  error.value = `Failed to load PDF. This might be due to CORS restrictions or authentication issues.`;
}

// Handle PDF load complete
function handlePdfLoadComplete() {
  console.log('PDF load complete event received from MuPdfViewer');
  
  // Clear any existing timeout
  if (pdfLoadTimeout.value) {
    clearTimeout(pdfLoadTimeout.value);
    pdfLoadTimeout.value = null;
  }
  
  // Update loading states
  loading.value = false;
  isLoadingPdf.value = false;
  error.value = null;
}

// Cancel PDF loading
function cancelPdfLoad() {
  console.log('PDF loading cancelled by user');
  
  if (pdfLoadTimeout.value) {
    clearTimeout(pdfLoadTimeout.value);
    pdfLoadTimeout.value = null;
  }
  
  loading.value = false;
  isLoadingPdf.value = false;
  error.value = 'PDF loading cancelled by user';
}

// Retry PDF load
function retryPdfLoad() {
  console.log('Retrying PDF load with MuPDF');
  error.value = null;
  isLoadingPdf.value = true;
  
  // MuPdfViewer will handle its own loading and timeout
}

// Handle rename
async function handleRename() {
  if (!renameForm.value.newName || renameForm.value.newName === props.file.name) {
    return;
  }

  try {
    renaming.value = true;
    const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
    const giteaHost = import.meta.env.VITE_GITEA_HOST;
    
    // This is a simplified rename implementation
    // In a real implementation, you'd need to handle the file move/rename in Gitea
    ElMessage.success('Rename functionality would be implemented here');
    renameDialogVisible.value = false;
    
  } catch (error) {
    console.error('Error renaming file:', error);
    ElMessage.error('Failed to rename file: ' + error.message);
  } finally {
    renaming.value = false;
  }
}

// Save markdown content
async function saveMarkdownContent() {
  if (!markdownContent.value || !hasUnsavedChanges.value) return;

  try {
    saving.value = true;
    const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
    const giteaHost = import.meta.env.VITE_GITEA_HOST;
    
    const base64Content = btoa(markdownContent.value);

    // This is a simplified save implementation
    // In a real implementation, you'd save to Gitea
    ElMessage.success('Markdown save functionality would be implemented here');
    hasUnsavedChanges.value = false;

  } catch (error) {
    console.error('Error saving markdown:', error);
    ElMessage.error('Failed to save changes: ' + error.message);
  } finally {
    saving.value = false;
  }
}

// Get authenticated download URL
function getAuthenticatedDownloadUrl(originalUrl) {
  if (!originalUrl) {
    console.warn('No original URL provided');
    return '';
  }
  
  try {
    console.log('Getting authenticated URL for:', originalUrl);
    
    // If the URL already contains token (raw URL format), return as-is for iframe
    if (originalUrl.includes('?token=')) {
      console.log('URL already contains token, using as-is for iframe');
      return originalUrl;
    }
    
    // Fallback for old format URLs - shouldn't happen with new implementation
    const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
    if (!giteaToken) {
      console.error('VITE_GITEA_TOKEN not found');
      return originalUrl;
    }
    
    const url = new URL(originalUrl);
    
    // Remove any existing token parameter
    url.searchParams.delete('token');
    
    // Add token as a single query parameter
    url.searchParams.set('token', giteaToken);
    
    const finalUrl = url.toString();
    console.log('Final authenticated URL (fallback):', finalUrl);
    return finalUrl;
  } catch (error) {
    console.error('Error creating authenticated URL:', error, 'Original URL:', originalUrl);
    return originalUrl;
  }
}

// Get Gitea headers
function getGiteaHeaders(token) {
  return {
    'Authorization': `token ${token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache'
  };
}

// Handle markdown changes
function handleMarkdownChange(newContent) {
  markdownContent.value = newContent;
  const originalContent = props.file.content || '';
  hasUnsavedChanges.value = newContent !== originalContent;
}

// Handle unsaved changes
function handleUnsavedChanges(hasChanges) {
  hasUnsavedChanges.value = hasChanges;
}

// Handle Univer document save
async function handleUniverDocumentSave(documentData) {
  if (!documentData || !props.file) return;

  try {
    saving.value = true;
    
    // This is a simplified save implementation
    // In a real implementation, you'd save to Gitea
    univerDocumentData.value = documentData;
    ElMessage.success('Univer document save functionality would be implemented here');
    
  } catch (error) {
    ElMessage.error('Failed to save document: ' + error.message);
  } finally {
    saving.value = false;
  }
}

// Initialize when file changes
watch(() => props.file, async (newFile) => {
  if (newFile) {
    loading.value = true;
    error.value = null;
    hasUnsavedChanges.value = false;
    
    // Clear any existing PDF timeout (if any)
    if (pdfLoadTimeout.value) {
      clearTimeout(pdfLoadTimeout.value);
      pdfLoadTimeout.value = null;
    }
    
    // Reset PDF loading state
    if (isPdf.value) {
      isLoadingPdf.value = true; // Show loading while MuPDF loads
      console.log('Loading PDF with MuPDF:', newFile.name, 'with URL:', newFile.download_url);
      
      // MuPdfViewer handles its own loading state and timeout
      // No need to set a timeout here as it interferes with the component's own loading logic
    }
    
    if (isTextFile.value || isMarkdown.value) {
      await loadTextContent();
    } else if (isUniverDoc.value) {
      await loadUniverDocument();
    } else if (isPdf.value || isImage.value) {
      // For PDFs and images, the loading is handled by the component itself
      loading.value = false;
    } else {
      loading.value = false;
    }
  }
}, { immediate: true });

// Reset unsaved changes when file changes
watch(() => props.file, () => {
  hasUnsavedChanges.value = false;
});

// Cleanup on unmount
onUnmounted(() => {
  // Cleanup any remaining timeouts
  if (pdfLoadTimeout.value) {
    clearTimeout(pdfLoadTimeout.value);
  }
});
</script>

<style scoped>
.file-preview-pane {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: white;
  border-left: 1px solid #dcdfe6;
}

.preview-header {
  padding: 8px 16px;
  border-bottom: 1px solid #dcdfe6;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.preview-header h3 {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 16px;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.preview-content {
  flex: 1;
  overflow: auto;
  position: relative;
  padding: 16px;
}

/* Center content for images and other content that needs centering */
.preview-content .image-container,
.preview-content .no-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 16px;
  box-sizing: border-box;
}

.preview-content .loading-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

/* For PDFs, text, markdown, and Univer docs, use block layout */
.preview-content .pdf-viewer,
.preview-content .text-preview,
.preview-content .markdown-preview,
.preview-content .univer-document-preview {
  width: 100%;
  height: 100%;
  padding: 0;
}

.pdf-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pdf-embed-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: block;
  max-height: 100%;
}

.pdf-embed-container :deep(.vue-pdf-embed) {
  height: auto !important;
  min-height: unset !important;
}

.pdf-embed-container :deep(.vue-pdf-embed > div) {
  height: auto !important;
  display: block !important;
}

.pdf-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.image-preview {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

.text-preview {
  width: 100%;
  height: 100%;
  overflow: auto;
  background: #f8f9fa;
  padding: 16px;
}

.text-preview pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 14px;
  line-height: 1.5;
}

.no-preview {
  text-align: center;
  padding: 32px;
  color: #909399;
  flex-direction: column;
}

.no-preview-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.pdf-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  text-align: center;
  color: #909399;
  min-height: 200px;
}

.pdf-fallback h4 {
  margin: 16px 0 8px 0;
  color: #606266;
}

.pdf-fallback p {
  margin: 8px 0 24px 0;
}

.markdown-preview {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.markdown-actions {
  padding: 16px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid #dcdfe6;
  background: #f8f9fa;
}

.univer-document-preview {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>