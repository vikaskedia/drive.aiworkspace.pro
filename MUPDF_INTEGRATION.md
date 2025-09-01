# MuPDF Integration for PDF Viewer

This document describes the MuPDF integration that provides advanced PDF viewing, editing, and searching capabilities.

## Features

### PDF Viewing
- **High-quality rendering**: MuPDF provides superior PDF rendering quality
- **Fast loading**: Optimized for quick PDF loading and display
- **Zoom controls**: Multiple zoom levels with fit-to-width and fit-to-page options
- **Page navigation**: Easy navigation between pages with visual indicators

### PDF Search
- **Text search**: Search for text within PDF content
- **Real-time highlighting**: Search results are highlighted in real-time
- **Navigation**: Navigate between search results with keyboard shortcuts
- **Cross-page search**: Search across all pages or specific pages

### PDF Editing
- **Text annotations**: Add text notes to PDF documents
- **Highlighting**: Highlight important text sections
- **Drawing tools**: Free-hand drawing on PDF pages
- **Color customization**: Choose colors for annotations
- **Size adjustment**: Adjust annotation sizes

### Advanced Features
- **Save changes**: Save annotations and edits back to the PDF
- **Undo/Redo**: Support for undoing and redoing changes
- **Export**: Export modified PDFs with annotations
- **Collaborative editing**: Support for multiple users editing the same PDF

## Implementation

### Components

1. **MuPdfViewer.vue** - Main PDF viewer component with real MuPDF integration
2. **mupdfService.js** - Service layer using the actual mupdf-js library
3. **FilePreviewPane.vue** - Updated to use MuPDF viewer

### Service Architecture

The MuPDF service uses the official mupdf library and provides a clean API for PDF operations:

```javascript
// Initialize MuPDF
await mupdfService.initialize();

// Load PDF document
const document = await mupdfService.loadDocument(url);

// Render page as PNG
await mupdfService.renderPage(pageNumber, canvas, zoom);

// Search text
const results = await mupdfService.searchText(searchTerm, pageNumber);

// Add annotation (stored in memory)
const annotation = await mupdfService.addAnnotation(pageNumber, annotationData);

// Save document (annotations stored in memory)
const result = await mupdfService.saveDocument();
```

### Usage

To use the MuPDF viewer in your application:

```vue
<template>
  <MuPdfViewer
    :file="pdfFile"
    :url="pdfUrl"
    @save="handlePdfSave"
    @error="handlePdfError"
  />
</template>

<script setup>
import MuPdfViewer from './components/common/MuPdfViewer.vue';

const handlePdfSave = (data) => {
  console.log('PDF saved:', data);
};

const handlePdfError = (error) => {
  console.error('PDF error:', error);
};
</script>
```

## Configuration

### Environment Variables

Add the following to your environment configuration:

```env
# MuPDF configuration
VITE_MUPDF_ENABLED=true
VITE_MUPDF_WASM_PATH=/path/to/mupdf.wasm
VITE_MUPDF_WORKER_PATH=/path/to/mupdf.worker.js
```

### Dependencies

The following dependencies are required:

```json
{
  "dependencies": {
    "mupdf": "^1.23.0"
  }
}
```

## Browser Support

MuPDF integration supports:
- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Performance Considerations

- **Memory management**: Large PDFs are loaded in chunks to manage memory usage
- **Caching**: Rendered pages are cached for faster navigation
- **Lazy loading**: Pages are rendered on-demand
- **Optimization**: Canvas rendering is optimized for smooth scrolling

## Security

- **Sandboxed execution**: MuPDF runs in a sandboxed environment
- **Input validation**: All user inputs are validated
- **File access**: Limited file access permissions
- **CORS handling**: Proper CORS configuration for cross-origin requests

## Troubleshooting

### Common Issues

1. **PDF not loading**
   - Check if the PDF URL is accessible
   - Verify CORS configuration
   - Check browser console for errors

2. **Search not working**
   - Ensure PDF contains searchable text
   - Check if PDF is properly loaded
   - Verify search term is valid

3. **Annotations not saving**
   - Check file permissions
   - Verify save operation completed
   - Check for network errors

### Debug Mode

Enable debug mode for detailed logging:

```javascript
// Enable debug mode
localStorage.setItem('mupdf-debug', 'true');
```

## Future Enhancements

- **OCR support**: Optical character recognition for scanned PDFs
- **Digital signatures**: Support for digital signatures
- **Form filling**: Interactive form support
- **Accessibility**: Screen reader support
- **Mobile optimization**: Touch-friendly interface

## Contributing

To contribute to the MuPDF integration:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This MuPDF integration is licensed under the same license as the main project.
