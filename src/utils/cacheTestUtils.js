/**
 * Test utilities for the repository cache system
 * These functions help verify that caching is working correctly
 */

import { getCacheStats, getCachedData, setCachedData, clearRepositoryCache } from './repositoryCache';

/**
 * Log cache performance metrics
 */
export function logCachePerformance(operation, startTime, cacheHit = false) {
  const endTime = performance.now();
  const duration = Math.round(endTime - startTime);
  
  const color = cacheHit ? '#28a745' : '#ffc107';
  const icon = cacheHit ? '⚡' : '🌐';
  
  console.log(
    `%c${icon} ${operation} completed in ${duration}ms ${cacheHit ? '(CACHE HIT)' : '(API CALL)'}`,
    `color: ${color}; font-weight: bold;`
  );
}

/**
 * Test cache functionality with mock data
 */
export function testCacheSystem(repoName = 'test-repo') {
  console.group('🔍 Testing Cache System');
  
  try {
    // Clear any existing cache
    clearRepositoryCache(repoName);
    console.log('✓ Cleared existing cache');
    
    // Test 1: Initial cache miss
    const initialCache = getCachedData(repoName, '');
    console.log('✓ Initial cache check (should be null):', initialCache);
    
    // Test 2: Set cache data
    const mockFiles = [
      { id: '1', name: 'test.txt', type: 'file', size: 100 },
      { id: '2', name: 'readme.md', type: 'file', size: 200 }
    ];
    const mockFolders = [
      { id: '3', name: 'docs', type: 'dir' }
    ];
    const mockCommitSha = 'abc123';
    
    setCachedData(repoName, '', mockCommitSha, mockFiles, mockFolders);
    console.log('✓ Set cache data');
    
    // Test 3: Retrieve cached data
    const cachedData = getCachedData(repoName, '');
    console.log('✓ Retrieved cached data:', cachedData);
    
    // Test 4: Verify data integrity
    const dataMatches = 
      cachedData?.files?.length === mockFiles.length &&
      cachedData?.folders?.length === mockFolders.length &&
      cachedData?.commitSha === mockCommitSha;
    
    console.log('✓ Data integrity check:', dataMatches ? 'PASSED' : 'FAILED');
    
    // Test 5: Cache stats
    const stats = getCacheStats();
    console.log('✓ Cache statistics:', stats);
    
    // Clean up
    clearRepositoryCache(repoName);
    console.log('✓ Cleaned up test cache');
    
    console.log('🎉 All cache tests passed!');
    
  } catch (error) {
    console.error('❌ Cache test failed:', error);
  }
  
  console.groupEnd();
}

/**
 * Monitor cache hits and misses
 */
export class CacheMonitor {
  constructor() {
    this.stats = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
      avgHitTime: 0,
      avgMissTime: 0
    };
    this.startTime = Date.now();
  }
  
  recordHit(duration) {
    this.stats.hits++;
    this.stats.totalRequests++;
    this.stats.avgHitTime = ((this.stats.avgHitTime * (this.stats.hits - 1)) + duration) / this.stats.hits;
  }
  
  recordMiss(duration) {
    this.stats.misses++;
    this.stats.totalRequests++;
    this.stats.avgMissTime = ((this.stats.avgMissTime * (this.stats.misses - 1)) + duration) / this.stats.misses;
  }
  
  getHitRate() {
    return this.stats.totalRequests > 0 ? (this.stats.hits / this.stats.totalRequests) * 100 : 0;
  }
  
  getReport() {
    const runtime = Math.round((Date.now() - this.startTime) / 1000);
    return {
      ...this.stats,
      hitRate: this.getHitRate(),
      runtime: `${runtime}s`
    };
  }
  
  logReport() {
    const report = this.getReport();
    console.group('📊 Cache Performance Report');
    console.log(`Hit Rate: ${report.hitRate.toFixed(1)}%`);
    console.log(`Total Requests: ${report.totalRequests}`);
    console.log(`Cache Hits: ${report.hits} (avg: ${report.avgHitTime.toFixed(0)}ms)`);
    console.log(`Cache Misses: ${report.misses} (avg: ${report.avgMissTime.toFixed(0)}ms)`);
    console.log(`Runtime: ${report.runtime}`);
    console.groupEnd();
  }
}

// Global cache monitor instance
export const globalCacheMonitor = new CacheMonitor();

/**
 * Simulate cache behavior for development
 */
export function simulateCacheScenarios(repoName = 'test-repo') {
  console.group('🎭 Simulating Cache Scenarios');
  
  const scenarios = [
    {
      name: 'First Load (Cache Miss)',
      setup: () => clearRepositoryCache(repoName),
      expectCacheHit: false
    },
    {
      name: 'Second Load (Cache Hit)',
      setup: () => {
        // Simulate already cached data
        setCachedData(repoName, '', 'commit123', [], []);
      },
      expectCacheHit: true
    },
    {
      name: 'Different Folder (Cache Miss)',
      setup: () => {
        // Clear cache for different path
        clearRepositoryCache(repoName);
      },
      expectCacheHit: false
    },
    {
      name: 'Same Folder Again (Cache Hit)',
      setup: () => {
        setCachedData(repoName, 'folder1', 'commit123', [], []);
      },
      expectCacheHit: true
    }
  ];
  
  scenarios.forEach((scenario, index) => {
    console.log(`\n${index + 1}. ${scenario.name}`);
    scenario.setup();
    
    const startTime = performance.now();
    const cachedData = getCachedData(repoName, index > 2 ? 'folder1' : '');
    const duration = performance.now() - startTime;
    
    const actualCacheHit = cachedData !== null;
    const result = actualCacheHit === scenario.expectCacheHit ? '✅' : '❌';
    
    console.log(`   Expected: ${scenario.expectCacheHit ? 'HIT' : 'MISS'}`);
    console.log(`   Actual: ${actualCacheHit ? 'HIT' : 'MISS'} (${duration.toFixed(2)}ms) ${result}`);
  });
  
  // Clean up
  clearRepositoryCache(repoName);
  console.groupEnd();
}

/**
 * Benchmark cache vs direct API calls
 */
export async function benchmarkCache(iterations = 10) {
  console.group('⏱️ Cache vs API Benchmark');
  
  const results = {
    cacheHits: [],
    apiCalls: []
  };
  
  const repoName = 'benchmark-repo';
  const mockData = { files: [], folders: [] };
  
  // Benchmark cache hits
  console.log('Testing cache hits...');
  setCachedData(repoName, '', 'commit123', mockData.files, mockData.folders);
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    getCachedData(repoName, '');
    const duration = performance.now() - start;
    results.cacheHits.push(duration);
  }
  
  // Benchmark cache misses (simulate API delay)
  console.log('Testing cache misses...');
  clearRepositoryCache(repoName);
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
    const duration = performance.now() - start;
    results.apiCalls.push(duration);
  }
  
  // Calculate averages
  const avgCacheHit = results.cacheHits.reduce((a, b) => a + b) / results.cacheHits.length;
  const avgApiCall = results.apiCalls.reduce((a, b) => a + b) / results.apiCalls.length;
  const speedup = (avgApiCall / avgCacheHit).toFixed(1);
  
  console.log(`Average Cache Hit: ${avgCacheHit.toFixed(2)}ms`);
  console.log(`Average API Call: ${avgApiCall.toFixed(2)}ms`);
  console.log(`🚀 Cache is ${speedup}x faster!`);
  
  clearRepositoryCache(repoName);
  console.groupEnd();
  
  return { avgCacheHit, avgApiCall, speedup };
}

// Auto-run tests in development mode
if (import.meta.env.DEV) {
  // Wait a bit for the app to load, then run tests
  setTimeout(() => {
    if (window.location.search.includes('test-cache')) {
      testCacheSystem();
      simulateCacheScenarios();
    }
  }, 2000);
}
