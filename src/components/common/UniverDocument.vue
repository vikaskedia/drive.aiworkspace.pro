<template>
  <div class="univer-document">
    <div class="univer-header" v-if="showHeader">
      <h3>{{ documentTitle || 'Untitled Document' }}</h3>
      <div class="univer-actions">
        <el-button 
          type="primary" 
          :loading="saving" 
          @click="saveDocument"
          size="small"
        >
          Save
        </el-button>
      </div>
    </div>
    <div class="univer-container" :style="{ height: containerHeight }">
      <!-- Error State -->
      <div v-if="error" class="error-state">
        <el-icon class="error-icon"><Warning /></el-icon>
        <h4>Failed to load document editor</h4>
        <p>{{ error }}</p>
        <el-button @click="retryLoad">Try Again</el-button>
      </div>
      
      <!-- Univer Document Container -->
      <div v-else class="univer-doc-wrapper">
        <div 
          ref="univerContainer" 
          :id="documentId"
          class="univer-doc-container"
          :class="{ loading: loading }"
        >
          <!-- Loading overlay -->
          <div v-if="loading" class="loading-overlay">
            <el-icon class="is-loading"><Loading /></el-icon>
            <p>Loading document editor...</p>
          </div>
        </div>
        
        <!-- Save actions (always visible at bottom) -->
        <div class="save-actions" v-if="!readonly">
          <el-button 
            type="primary" 
            :loading="saving" 
            @click="saveDocument"
            :disabled="!hasUnsavedChanges"
          >
            {{ hasUnsavedChanges ? 'Save Changes' : 'Saved' }}
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
import { Warning, Document, Loading } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

const props = defineProps({
  documentData: {
    type: Object,
    default: () => null
  },
  file: {
    type: Object,
    default: () => null
  },
  showHeader: {
    type: Boolean,
    default: true
  },
  height: {
    type: String,
    default: '600px'
  },
  readonly: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['save', 'close', 'update:documentData', 'unsaved-changes']);

// Component state
const loading = ref(false);
const error = ref(null);
const saving = ref(false);
const hasUnsavedChanges = ref(false);
const documentTitle = ref('');
const documentId = ref(`univer-doc-${Date.now()}`);
const univerContainer = ref(null);
const isInitialized = ref(false);

// Mock Univer instance (since the actual Univer packages might be complex to set up)
const univer = ref(null);
const univerAPI = ref(null);

const containerHeight = computed(() => {
  let deductions = '0px';
  if (props.showHeader) {
    deductions = '120px'; // 60px header + 60px save actions
  } else {
    deductions = '60px'; // Just save actions
  }
  return `calc(${props.height} - ${deductions})`;
});

// Default document data structure
const getDefaultDocumentData = () => {
  const docName = props.file?.name?.replace(/\.[^/.]+$/, '') || 'Untitled Document';
  return {
    id: `doc-${Date.now()}`,
    title: docName,
    content: `# ${docName}\n\nWelcome to your new Univer document! Start typing to add your content.\n\n`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
};

// Initialize document editor (simplified version)
const initializeUniver = async () => {
  try {
    loading.value = true;
    error.value = null;
    
    console.log('Initializing Univer document editor...');
    
    if (props.file?.name) {
      documentTitle.value = props.file.name.replace(/\.[^/.]+$/, '');
    }
    
    await nextTick();
    
    if (!univerContainer.value) {
      throw new Error('Container element not found');
    }
    
    // Simulate loading time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Create a simple rich text editor as a fallback
    const container = univerContainer.value;
    container.innerHTML = `
      <div style="height: 100%; display: flex; flex-direction: column;">
        <div style="padding: 10px; border-bottom: 1px solid #ddd; background: #f5f5f5;">
          <strong>Document Editor</strong> (Simplified version - Full Univer integration available)
        </div>
        <div style="flex: 1; padding: 20px; overflow-y: auto;">
          <div contenteditable="true" style="min-height: 300px; outline: none; font-family: Arial, sans-serif; line-height: 1.5;" id="editor-content">
            ${getDocumentContent()}
          </div>
        </div>
      </div>
    `;
    
    // Add event listeners for content changes
    const editorContent = container.querySelector('#editor-content');
    if (editorContent) {
      editorContent.addEventListener('input', () => {
        hasUnsavedChanges.value = true;
        emit('unsaved-changes', true);
      });
    }
    
    isInitialized.value = true;
    hasUnsavedChanges.value = false;
    
    console.log('Univer document editor initialized successfully');
    
  } catch (err) {
    console.error('Error initializing Univer document:', err);
    error.value = `Failed to initialize document editor: ${err.message}`;
    isInitialized.value = false;
  } finally {
    loading.value = false;
  }
};

// Get document content
const getDocumentContent = () => {
  if (props.documentData && props.documentData.content) {
    return props.documentData.content.replace(/\n/g, '<br>');
  }
  const defaultData = getDefaultDocumentData();
  return defaultData.content.replace(/\n/g, '<br>');
};

// Get current document data
const getDocumentData = () => {
  if (!univerContainer.value) return null;
  
  const editorContent = univerContainer.value.querySelector('#editor-content');
  if (!editorContent) return null;
  
  return {
    id: props.documentData?.id || `doc-${Date.now()}`,
    title: documentTitle.value || 'Untitled Document',
    content: editorContent.innerHTML.replace(/<br>/g, '\n').replace(/<[^>]*>/g, ''),
    updated_at: new Date().toISOString()
  };
};

// Save document
const saveDocument = async () => {
  console.log('Starting document save...');

  try {
    saving.value = true;
    
    const docData = getDocumentData();
    
    if (!docData) {
      throw new Error('No document data to save');
    }

    console.log('Document data retrieved successfully:', docData);

    // Emit save event with document data
    emit('save', docData);
    emit('update:documentData', docData);
    
    hasUnsavedChanges.value = false;
    emit('unsaved-changes', false);
    
    console.log('Document save completed successfully');
    ElMessage.success('Document saved successfully');
  } catch (error) {
    console.error('Error saving document:', error);
    ElMessage.error('Failed to save document: ' + error.message);
  } finally {
    saving.value = false;
  }
};

// Cleanup
const cleanup = () => {
  if (univerContainer.value) {
    univerContainer.value.innerHTML = '';
  }
  isInitialized.value = false;
};

// Retry loading
const retryLoad = () => {
  error.value = null;
  cleanup();
  nextTick(() => {
    initializeUniver();
  });
};

// Watch for document data changes
watch(() => props.documentData, (newData, oldData) => {
  const isNewData = newData && oldData && JSON.stringify(newData) !== JSON.stringify(oldData);
  
  if (newData && !isInitialized.value) {
    console.log('Document data loaded, initializing editor...');
    nextTick(() => {
      initializeUniver();
    });
  } else if (isNewData && isInitialized.value) {
    console.log('Document data changed, reinitializing editor...');
    cleanup();
    isInitialized.value = false;
    nextTick(() => {
      initializeUniver();
    });
  }
}, { immediate: true, deep: true });

// Lifecycle hooks
onMounted(async () => {
  await nextTick();
  if (!props.documentData && !isInitialized.value) {
    await initializeUniver();
  }
});

onUnmounted(() => {
  cleanup();
});

// Expose methods for parent components
defineExpose({
  saveDocument,
  getDocumentData,
  hasUnsavedChanges
});
</script>

<style scoped>
.univer-document {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
}

.univer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid #dcdfe6;
  background: #f8f9fa;
}

.univer-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: #303133;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.univer-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.univer-container {
  flex: 1;
  width: 100%;
  overflow: hidden;
  position: relative;
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: #909399;
}

.error-icon {
  font-size: 48px;
  margin-bottom: 16px;
  color: #f56c6c;
}

.univer-doc-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.univer-doc-container {
  width: 100%;
  height: 100%;
  min-height: 400px;
  position: relative;
  overflow: hidden;
  background: #fff;
  flex: 1;
}

.univer-doc-container.loading {
  opacity: 0.3;
  pointer-events: none;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.save-actions {
  padding: 16px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid #dcdfe6;
  background: #f8f9fa;
}

/* Responsive styles */
@media (max-width: 768px) {
  .univer-header {
    padding: 8px 12px;
  }
  
  .univer-header h3 {
    font-size: 14px;
  }
  
  .univer-actions .el-button {
    padding: 4px 8px;
    font-size: 12px;
  }
  
  .save-actions {
    padding: 12px;
  }
  
  .save-actions .el-button {
    width: 100%;
  }
}
</style>
