<template>
  <div class="markdown-editor">
    <div class="editor-container">
      <el-input
        v-model="content"
        type="textarea"
        :rows="20"
        placeholder="Start typing your markdown content..."
        @input="handleInput"
        class="markdown-textarea"
      />
      <div class="preview-container" v-html="previewHtml"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  readonly: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue', 'change']);

const content = ref(props.modelValue);

// Simple markdown to HTML converter
const previewHtml = computed(() => {
  if (!content.value) return '<p>No content to preview</p>';
  
  let html = content.value;
  
  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Bold
  html = html.replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>');
  
  // Italic
  html = html.replace(/\*(.*)\*/gim, '<em>$1</em>');
  
  // Code blocks
  html = html.replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>');
  
  // Inline code
  html = html.replace(/`([^`]*)`/gim, '<code>$1</code>');
  
  // Lists
  html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  // Line breaks
  html = html.replace(/\n/gim, '<br>');
  
  return html;
});

const handleInput = () => {
  emit('update:modelValue', content.value);
  emit('change', content.value);
};

// Clear local storage method
const clearLocalStorage = () => {
  // Implementation for clearing local storage if needed
  console.log('Clearing local storage for markdown editor');
};

// Watch for external changes
watch(() => props.modelValue, (newValue) => {
  content.value = newValue;
});

defineExpose({
  clearLocalStorage
});
</script>

<style scoped>
.markdown-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.editor-container {
  display: flex;
  gap: 16px;
  height: 100%;
}

.markdown-textarea {
  flex: 1;
}

.markdown-textarea :deep(.el-textarea__inner) {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 14px;
  line-height: 1.5;
}

.preview-container {
  flex: 1;
  padding: 16px;
  background: white;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow-y: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.preview-container :deep(h1),
.preview-container :deep(h2),
.preview-container :deep(h3) {
  margin-top: 0;
  margin-bottom: 16px;
}

.preview-container :deep(p) {
  margin-bottom: 16px;
}

.preview-container :deep(pre) {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
}

.preview-container :deep(code) {
  background: #f5f7fa;
  padding: 2px 4px;
  border-radius: 2px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.preview-container :deep(ul) {
  padding-left: 20px;
}

.preview-container :deep(li) {
  margin-bottom: 4px;
}

@media (max-width: 768px) {
  .editor-container {
    flex-direction: column;
  }
}
</style>
