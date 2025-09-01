# Enhanced Search Functionality

This document describes the comprehensive search functionality implemented for the file management system.

## Features

### 1. Enhanced Filters Search (All Folders)
- **Location**: Filters section in the main file view
- **Scope**: Searches through all cached folders and subfolders
- **Usage**: Click "Filters" button and type in the search box to find files and folders across the entire workspace
- **Features**:
  - Real-time search across all cached folders
  - Shows search statistics (e.g., "5 result(s) found")
  - Displays full path information for search results
  - One-click navigation to search results
  - Smart relevance scoring with exact matches prioritized

### 2. Search Algorithm

#### Relevance Scoring:
1. **Exact Match**: 100 points (highest priority)
2. **Starts With**: 50 points
3. **Contains**: 25 points
4. **Path Depth Bonus**: Up to 10 points (shorter paths preferred)
5. **Case Match Bonus**: 5 points

#### Sorting Order:
1. **Relevance Score** (higher first)
2. **Path Depth** (shorter paths first)
3. **Alphabetical** (A-Z)

### 3. Cache-Based Search

The search functionality leverages the existing repository cache system:
- **Ultra-Fast**: Searches through cached data (no API calls)
- **Comprehensive**: Includes all previously visited folders
- **Smart**: Only searches through valid, non-expired cache entries
- **Efficient**: Uses both memory cache and localStorage for optimal performance

### 4. User Experience Features

#### Enhanced Search Display:
- **Search Statistics**: Shows "X result(s) found" for current results
- **Path Information**: Displays folder path for each search result
- **Loading States**: Shows loading indicator during search
- **Real-time Results**: Updates as you type (with 300ms debounce)

#### Navigation Integration:
- **Smart Navigation**: Automatically navigates to the correct folder
- **File Selection**: Selects the found file/folder
- **Breadcrumb Updates**: Updates navigation breadcrumbs
- **URL Updates**: Updates browser URL for sharing

## Technical Implementation

### Cache Search Functions:
- `searchCachedData()`: Main search function with options
- `getAllCachedPaths()`: Gets all cached paths for a repository
- `calculateMatchScore()`: Calculates relevance score for results
- `getAllCachedData()`: Gets all cached data with path information

### Component Integration:
- **State Management**: Vue 3 reactive state for search UI
- **Debounced Search**: 300ms delay to prevent excessive searches
- **Event Handling**: Click events for navigation
- **Navigation**: Integration with existing folder navigation system

### Performance Optimizations:
- **Memory Cache**: Ultra-fast access to frequently used data
- **Debounced Input**: Prevents excessive search operations
- **Result Limiting**: Maximum 200 results to prevent UI lag
- **Lazy Loading**: Search results loaded on demand

## Usage Examples

### Basic Search:
1. Click "Filters" button to show search box
2. Type search term to find files and folders across all directories
3. Click any result to navigate to its location

### Advanced Search:
1. Use partial terms to find related items
2. Search results show full path information
3. Results are sorted by relevance (exact matches first)

## Benefits

1. **Improved Discovery**: Find files across entire workspace quickly
2. **Better UX**: Intuitive search integrated into existing filters
3. **Performance**: Fast cache-based search without API calls
4. **Flexibility**: Comprehensive search across all folders
5. **Integration**: Seamless navigation to search results
6. **Clean UI**: No separate popup, uses existing interface
