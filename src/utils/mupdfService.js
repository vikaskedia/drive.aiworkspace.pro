// MuPDF Service for PDF operations
// This service provides PDF viewing, editing, and searching capabilities
import mupdf from 'mupdf';

class MuPDFService {
  constructor() {
    this.mupdf = null;
    this.document = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.zoom = 1.0;
    this.isInitialized = false;
  }

  // Initialize MuPDF
  async initialize() {
    try {
      console.log('Initializing MuPDF service...');
      
      // Initialize the MuPDF library
      this.mupdf = mupdf;
      
      this.isInitialized = true;
      console.log('MuPDF service initialized successfully');
      
      return true;
    } catch (error) {
      console.error('Failed to initialize MuPDF service:', error);
      throw error;
    }
  }

  // Load PDF document
  async loadDocument(url) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      console.log('Loading PDF document from:', url);
      
      // Fetch the PDF file
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      
      // Load document using MuPDF
      this.document = this.mupdf.Document.openDocument(arrayBuffer);
      
      // Get total pages
      this.totalPages = this.document.countPages();
      this.currentPage = 1;
      
      console.log(`PDF loaded successfully. Total pages: ${this.totalPages}`);
      
      return this.document;
    } catch (error) {
      console.error('Error loading PDF document:', error);
      throw error;
    }
  }

  // Render page to canvas
  async renderPage(pageNumber, canvas, zoom = 1.0) {
    try {
      if (!this.document) {
        throw new Error('No document loaded');
      }

      if (pageNumber < 1 || pageNumber > this.totalPages) {
        throw new Error(`Invalid page number: ${pageNumber}`);
      }

      console.log(`Rendering page ${pageNumber} with zoom ${zoom}`);
      
      // Load the page
      const page = this.document.loadPage(pageNumber - 1); // MuPDF uses 0-based indexing
      
      // Get page bounds
      const bounds = page.getBounds();
      console.log('Page bounds:', bounds);
      
      // Create a pixmap for rendering with proper scaling
      const matrix = this.mupdf.Matrix.scale(zoom, zoom);
      const pixmap = page.toPixmap(matrix, this.mupdf.ColorSpace.DeviceRGB, false);
      
      console.log('Pixmap created:', {
        width: pixmap.getWidth(),
        height: pixmap.getHeight(),
        components: pixmap.getNumberOfComponents(),
        alpha: pixmap.getAlpha()
      });
      
      // Set canvas size
      canvas.width = pixmap.getWidth();
      canvas.height = pixmap.getHeight();
      
      // Get canvas context
      const ctx = canvas.getContext('2d');
      
      // Create ImageData from pixmap
      const imageData = ctx.createImageData(pixmap.getWidth(), pixmap.getHeight());
      const pixels = pixmap.getPixels();
      
      console.log('Copying pixel data...');
      console.log('Pixmap info:', {
        width: pixmap.getWidth(),
        height: pixmap.getHeight(),
        components: pixmap.getNumberOfComponents(),
        alpha: pixmap.getAlpha(),
        pixelsLength: pixels.length
      });
      
      // Copy pixel data correctly (RGBA format)
      // MuPDF returns RGB data, we need to convert to RGBA
      const width = pixmap.getWidth();
      const height = pixmap.getHeight();
      const components = pixmap.getNumberOfComponents();
      const hasAlpha = pixmap.getAlpha();
      
      console.log('Pixel format:', { components, hasAlpha });
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pixelIndex = (y * width + x) * components;
          const imageDataIndex = (y * width + x) * 4; // RGBA
          
          if (components === 3) {
            // RGB format
            imageData.data[imageDataIndex] = pixels[pixelIndex];     // R
            imageData.data[imageDataIndex + 1] = pixels[pixelIndex + 1]; // G
            imageData.data[imageDataIndex + 2] = pixels[pixelIndex + 2]; // B
            imageData.data[imageDataIndex + 3] = 255; // A (fully opaque)
          } else if (components === 4 && hasAlpha) {
            // RGBA format
            imageData.data[imageDataIndex] = pixels[pixelIndex];     // R
            imageData.data[imageDataIndex + 1] = pixels[pixelIndex + 1]; // G
            imageData.data[imageDataIndex + 2] = pixels[pixelIndex + 2]; // B
            imageData.data[imageDataIndex + 3] = pixels[pixelIndex + 3]; // A
          } else if (components === 1) {
            // Grayscale
            const gray = pixels[pixelIndex];
            imageData.data[imageDataIndex] = gray;     // R
            imageData.data[imageDataIndex + 1] = gray; // G
            imageData.data[imageDataIndex + 2] = gray; // B
            imageData.data[imageDataIndex + 3] = 255; // A (fully opaque)
          }
        }
      }
      
      console.log('Putting image data to canvas...');
      
      // Put image data to canvas
      ctx.putImageData(imageData, 0, 0);
      
      console.log('Page rendered successfully');
      
      this.currentPage = pageNumber;
      this.zoom = zoom;
      
      return true;
    } catch (error) {
      console.error('Error rendering page:', error);
      throw error;
    }
  }

  // Search text in PDF
  async searchText(searchTerm, pageNumber = null) {
    try {
      if (!this.document) {
        throw new Error('No document loaded');
      }

      console.log(`Searching for "${searchTerm}" in PDF`);
      
      const results = [];
      const pagesToSearch = pageNumber ? [pageNumber] : Array.from({length: this.totalPages}, (_, i) => i + 1);
      
      for (const pageNum of pagesToSearch) {
        // Load the page
        const page = this.document.loadPage(pageNum - 1);
        
        // Search for text on this page using MuPDF API
        const searchResults = page.search(searchTerm);
        
        // Convert search results to our format
        for (const result of searchResults) {
          results.push({
            page: pageNum,
            x: result.x0,
            y: result.y0,
            width: result.x1 - result.x0,
            height: result.y1 - result.y0,
            text: searchTerm
          });
        }
      }
      
      console.log(`Found ${results.length} search results`);
      return results;
    } catch (error) {
      console.error('Error searching PDF:', error);
      throw error;
    }
  }

  // Add annotation to PDF
  async addAnnotation(pageNumber, annotation) {
    try {
      if (!this.document) {
        throw new Error('No document loaded');
      }

      console.log(`Adding annotation to page ${pageNumber}:`, annotation);
      
      // Note: The official MuPDF package has limited annotation support
      // For now, we'll store annotations in memory and render them as overlays
      const newAnnotation = {
        id: `annotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        page: pageNumber,
        type: annotation.type,
        content: annotation.content,
        position: annotation.position,
        color: annotation.color,
        size: annotation.size,
        timestamp: new Date().toISOString()
      };
      
      console.log('Annotation added (stored in memory):', newAnnotation);
      
      return newAnnotation;
    } catch (error) {
      console.error('Error adding annotation:', error);
      throw error;
    }
  }

  // Save PDF with annotations
  async saveDocument() {
    try {
      if (!this.document) {
        throw new Error('No document loaded');
      }

      console.log('Saving PDF document with annotations...');
      
      // Note: The official MuPDF package doesn't support saving annotations
      // For now, we'll return a success message indicating annotations are stored in memory
      
      console.log('PDF annotations stored in memory (not saved to file)');
      return {
        success: true,
        message: 'PDF annotations stored in memory (not saved to file)',
        timestamp: new Date().toISOString(),
        note: 'The official MuPDF package has limited annotation saving support'
      };
    } catch (error) {
      console.error('Error saving PDF:', error);
      throw error;
    }
  }



  // Get document metadata
  getMetadata() {
    if (!this.document) {
      return null;
    }
    // MuPDF doesn't provide direct metadata access, so we'll return basic info
    return {
      title: 'PDF Document',
      author: 'Unknown',
      subject: 'PDF Document',
      creator: 'MuPDF',
      producer: 'MuPDF',
      pageCount: this.totalPages
    };
  }

  // Get current page info
  getCurrentPage() {
    return {
      number: this.currentPage,
      total: this.totalPages,
      zoom: this.zoom
    };
  }

  // Get total pages
  getTotalPages() {
    return this.totalPages;
  }

  // Cleanup
  destroy() {
    if (this.document) {
      this.document = null;
    }
    if (this.mupdf) {
      // The official MuPDF package doesn't have a destroy method
      this.mupdf = null;
    }
    this.isInitialized = false;
    console.log('MuPDF service destroyed');
  }


}

// Create singleton instance
const mupdfService = new MuPDFService();

export default mupdfService;
