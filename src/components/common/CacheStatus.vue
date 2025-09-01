<template>
  <div class="cache-status" v-if="showCacheInfo">
    <el-alert 
      :title="cacheStatusTitle" 
      :type="cacheStatusType" 
      :description="cacheStatusDescription"
      show-icon 
      :closable="false"
      effect="light"
    />
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import { getCacheStats } from '../../utils/repositoryCache';

const props = defineProps({
  repoName: {
    type: String,
    default: null
  },
  showInfo: {
    type: Boolean,
    default: true
  }
});

const cacheStats = ref({ totalEntries: 0, totalSize: 0, repositories: [] });
const hasInitialLoad = ref(false);

const showCacheInfo = computed(() => {
  // Only show if:
  // 1. showInfo prop is true
  // 2. We have cache entries 
  // 3. We've had time for initial load (avoid showing "2 entries" immediately)
  return props.showInfo && 
         cacheStats.value.totalEntries > 0 && 
         hasInitialLoad.value;
});

const cacheStatusType = computed(() => {
  if (cacheStats.value.totalEntries === 0) return 'info';
  if (cacheStats.value.totalSize > 1024 * 1024) return 'warning'; // > 1MB
  return 'success';
});

const cacheStatusTitle = computed(() => {
  if (cacheStats.value.totalEntries === 0) {
    return 'No cache data';
  }
  return `Cache: ${cacheStats.value.totalEntries} entries`;
});

const cacheStatusDescription = computed(() => {
  if (cacheStats.value.totalEntries === 0) {
    return 'File data will be cached for faster loading';
  }
  
  const sizeKB = Math.round(cacheStats.value.totalSize / 1024);
  const memorySizeKB = Math.round((cacheStats.value.memoryCacheSize || 0) / 1024);
  const repoCount = cacheStats.value.repositories.length;
  const memoryEntries = cacheStats.value.memoryEntries || 0;
  
  let description = `${sizeKB}KB cached across ${repoCount} repositories.`;
  
  if (memoryEntries > 0) {
    description += ` ${memoryEntries} in memory (${memorySizeKB}KB) for ultra-fast access.`;
  } else {
    description += ' Next load will be instant if no commits changed.';
  }
  
  return description;
});

function updateCacheStats() {
  cacheStats.value = getCacheStats();
}

onMounted(() => {
  updateCacheStats();
  
  // Allow cache status to show after initial load delay
  setTimeout(() => {
    hasInitialLoad.value = true;
  }, 3000); // Show cache status after 3 seconds, when user has seen the UI
  
  // Update stats every 10 seconds (less frequent)
  const interval = setInterval(updateCacheStats, 10000);
  
  // Cleanup on unmount
  return () => clearInterval(interval);
});

// Expose method to manually update stats
defineExpose({
  updateStats: updateCacheStats
});
</script>

<style scoped>
.cache-status {
  margin-bottom: 16px;
}

:deep(.el-alert) {
  border-radius: 6px;
}

:deep(.el-alert__description) {
  font-size: 12px;
  margin-top: 4px;
}
</style>
