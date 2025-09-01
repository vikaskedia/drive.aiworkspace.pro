/**
 * Cache Performance Benchmark Tool
 * Measures and compares cache performance before and after optimizations
 */

import { getCachedData, setCachedData, clearRepositoryCache } from './repositoryCache';

export class CacheBenchmark {
  constructor() {
    this.results = {
      memoryCache: [],
      localStorage: [],
      noCacheWithApi: [],
      optimizations: []
    };
  }

  /**
   * Run comprehensive cache performance benchmark
   */
  async runFullBenchmark(iterations = 100) {
    console.group('🏁 Cache Performance Benchmark');
    console.log(`Running ${iterations} iterations of each test...`);
    
    const repoName = 'benchmark-test-repo';
    const path = 'test-folder';
    
    // Generate realistic test data
    const testFiles = this.generateTestData(50); // 50 files
    const testFolders = this.generateTestData(10); // 10 folders
    
    try {
      // Test 1: Memory cache performance
      console.log('\n📊 Testing memory cache performance...');
      await this.benchmarkMemoryCache(repoName, path, testFiles, testFolders, iterations);
      
      // Test 2: localStorage cache performance  
      console.log('\n📊 Testing localStorage cache performance...');
      await this.benchmarkLocalStorageCache(repoName, path, testFiles, testFolders, iterations);
      
      // Test 3: Simulated API call performance
      console.log('\n📊 Testing simulated API call performance...');
      await this.benchmarkApiCalls(iterations);
      
      // Test 4: Test optimizations
      console.log('\n📊 Testing cache optimizations...');
      await this.benchmarkOptimizations(repoName, path, testFiles, testFolders, iterations);
      
      // Generate report
      this.generateReport();
      
    } finally {
      // Cleanup
      clearRepositoryCache(repoName);
    }
    
    console.groupEnd();
    return this.results;
  }

  /**
   * Benchmark memory cache performance
   */
  async benchmarkMemoryCache(repoName, path, files, folders, iterations) {
    // Pre-populate cache
    setCachedData(repoName, path, 'test-commit-sha', files, folders);
    
    // Wait for cache to be ready
    await new Promise(resolve => setTimeout(resolve, 10));
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      
      // This should hit memory cache after first call
      const cachedData = getCachedData(repoName, path);
      
      const duration = performance.now() - start;
      
      if (cachedData) {
        this.results.memoryCache.push(duration);
      }
    }
    
    const avg = this.calculateAverage(this.results.memoryCache);
    console.log(`✅ Memory cache average: ${avg.toFixed(3)}ms`);
  }

  /**
   * Benchmark localStorage cache performance (without memory cache)
   */
  async benchmarkLocalStorageCache(repoName, path, files, folders, iterations) {
    const testRepo = repoName + '-localstorage';
    
    // Set up localStorage cache
    setCachedData(testRepo, path, 'test-commit-sha', files, folders);
    
    // Wait for localStorage write
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Clear memory cache to force localStorage reads
    for (let i = 0; i < iterations; i++) {
      // Clear any memory cache that might exist
      const memoryCache = await import('./repositoryCache.js').then(m => m.memoryCache);
      if (memoryCache) {
        memoryCache.clear();
      }
      
      const start = performance.now();
      
      const cachedData = getCachedData(testRepo, path);
      
      const duration = performance.now() - start;
      
      if (cachedData) {
        this.results.localStorage.push(duration);
      }
    }
    
    const avg = this.calculateAverage(this.results.localStorage);
    console.log(`✅ localStorage cache average: ${avg.toFixed(3)}ms`);
    
    clearRepositoryCache(testRepo);
  }

  /**
   * Benchmark simulated API call performance
   */
  async benchmarkApiCalls(iterations) {
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      
      // Simulate realistic API delay
      await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100));
      
      const duration = performance.now() - start;
      this.results.noCacheWithApi.push(duration);
    }
    
    const avg = this.calculateAverage(this.results.noCacheWithApi);
    console.log(`✅ API call average: ${avg.toFixed(3)}ms`);
  }

  /**
   * Benchmark cache optimizations
   */
  async benchmarkOptimizations(repoName, path, files, folders, iterations) {
    const optimizedRepo = repoName + '-optimized';
    
    // Test optimistic caching (load immediately, verify in background)
    setCachedData(optimizedRepo, path, 'test-commit-sha', files, folders);
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      
      // Simulate optimistic loading
      const cachedData = getCachedData(optimizedRepo, path);
      if (cachedData) {
        // Simulate immediate UI update
        const uiUpdateTime = performance.now() - start;
        
        // Simulate background verification (non-blocking)
        setTimeout(() => {
          // Background work doesn't count toward UI performance
        }, 0);
        
        this.results.optimizations.push(uiUpdateTime);
      }
    }
    
    const avg = this.calculateAverage(this.results.optimizations);
    console.log(`✅ Optimized cache average: ${avg.toFixed(3)}ms`);
    
    clearRepositoryCache(optimizedRepo);
  }

  /**
   * Generate realistic test data
   */
  generateTestData(count) {
    const data = [];
    for (let i = 0; i < count; i++) {
      data.push({
        id: `test-${i}`,
        name: `test-file-${i}.txt`,
        type: Math.random() > 0.8 ? 'dir' : 'file',
        size: Math.floor(Math.random() * 10000),
        path: `test-path-${i}`,
        download_url: `https://example.com/file-${i}`,
        repository: 'test/repo',
        sha: `sha-${i}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    return data;
  }

  /**
   * Calculate average of array
   */
  calculateAverage(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  /**
   * Calculate percentile
   */
  calculatePercentile(arr, percentile) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile / 100) - 1;
    return sorted[index] || 0;
  }

  /**
   * Generate comprehensive performance report
   */
  generateReport() {
    console.log('\n📊 PERFORMANCE BENCHMARK REPORT');
    console.log('=====================================');
    
    const memoryAvg = this.calculateAverage(this.results.memoryCache);
    const localStorageAvg = this.calculateAverage(this.results.localStorage);
    const apiAvg = this.calculateAverage(this.results.noCacheWithApi);
    const optimizedAvg = this.calculateAverage(this.results.optimizations);
    
    console.log(`\n🏎️  SPEED COMPARISON:`);
    console.log(`Memory Cache:     ${memoryAvg.toFixed(2)}ms`);
    console.log(`localStorage:     ${localStorageAvg.toFixed(2)}ms`);
    console.log(`Optimized Cache:  ${optimizedAvg.toFixed(2)}ms`);
    console.log(`API Calls:        ${apiAvg.toFixed(2)}ms`);
    
    console.log(`\n🚀 PERFORMANCE GAINS:`);
    console.log(`Memory vs API:    ${(apiAvg / memoryAvg).toFixed(1)}x faster`);
    console.log(`localStorage vs API: ${(apiAvg / localStorageAvg).toFixed(1)}x faster`);
    console.log(`Optimized vs API: ${(apiAvg / optimizedAvg).toFixed(1)}x faster`);
    
    console.log(`\n📈 PERCENTILES (Memory Cache):`);
    console.log(`P50 (median):     ${this.calculatePercentile(this.results.memoryCache, 50).toFixed(2)}ms`);
    console.log(`P95:              ${this.calculatePercentile(this.results.memoryCache, 95).toFixed(2)}ms`);
    console.log(`P99:              ${this.calculatePercentile(this.results.memoryCache, 99).toFixed(2)}ms`);
    
    console.log(`\n💡 OPTIMIZATION SUMMARY:`);
    if (memoryAvg < 1) {
      console.log(`✅ Memory cache is EXTREMELY fast (< 1ms)`);
    } else if (memoryAvg < 5) {
      console.log(`✅ Memory cache is very fast (< 5ms)`);
    } else {
      console.log(`⚠️  Memory cache could be optimized further`);
    }
    
    if (localStorageAvg < 10) {
      console.log(`✅ localStorage cache is fast (< 10ms)`);
    } else if (localStorageAvg < 50) {
      console.log(`✅ localStorage cache is acceptable (< 50ms)`);
    } else {
      console.log(`⚠️  localStorage cache is slow, consider optimization`);
    }
    
    const improvement = ((apiAvg - memoryAvg) / apiAvg * 100).toFixed(1);
    console.log(`\n🎯 OVERALL: ${improvement}% faster than API calls`);
    
    return {
      memoryAvg,
      localStorageAvg,
      apiAvg,
      optimizedAvg,
      improvement: parseFloat(improvement)
    };
  }
}

/**
 * Quick benchmark for development testing
 */
export async function quickBenchmark() {
  const benchmark = new CacheBenchmark();
  return await benchmark.runFullBenchmark(50); // Faster test with 50 iterations
}

/**
 * Comprehensive benchmark for detailed analysis
 */
export async function comprehensiveBenchmark() {
  const benchmark = new CacheBenchmark();
  return await benchmark.runFullBenchmark(200); // More thorough test
}

// Auto-run quick benchmark in development
if (import.meta.env.DEV && window.location.search.includes('benchmark-cache')) {
  console.log('🚀 Auto-running cache benchmark...');
  setTimeout(quickBenchmark, 2000);
}
