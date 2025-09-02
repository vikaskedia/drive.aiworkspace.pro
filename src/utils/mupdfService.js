import mupdf from 'mupdf';

class MuPDFService {
  constructor() {
    this.document = null;
    this.pages = [];
    this.isInitialized = false;
  }

  async initialize() {
    try {
      console.log('Initializing MuPDF service...');
      
      // Test basic MuPDF functionality
      try {
        // Test if we can create a simple matrix
        const testMatrix = mupdf.Matrix.identity;
        console.log('MuPDF Matrix test passed:', testMatrix);
        
        // Test if we can create a simple rect
        const testRect = mupdf.Rect.empty;
        console.log('MuPDF Rect test passed:', testRect);
        
        // Test if we can create a simple colorspace
        const testColorSpace = mupdf.ColorSpace.DeviceRGB;
        console.log('MuPDF ColorSpace test passed:', testColorSpace);
        
      } catch (testError) {
        console.error('MuPDF basic functionality test failed:', testError);
        throw new Error(`MuPDF library test failed: ${testError.message}`);
      }
      
      // The mupdf library is already loaded, no need for additional initialization
      this.isInitialized = true;
      console.log('MuPDF service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize MuPDF service:', error);
      throw error;
    }
  }

  async loadDocument(url) {
    try {
      console.log('Loading document from URL:', url);
      
      // Fetch the PDF data
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Open the document using MuPDF
      this.document = mupdf.Document.openDocument(uint8Array);
      
      console.log('Document loaded successfully, pages:', this.document.countPages());
      return this.document;
    } catch (error) {
      console.error('Failed to load document:', error);
      throw error;
    }
  }

  getTotalPages() {
    return this.document ? this.document.countPages() : 0;
  }

  async renderPage(pageNum, canvas, zoom = 1.0) {
    try {
      if (!this.document) {
        throw new Error('Document not loaded');
      }

      // Load the page (pageNum is 1-based, but MuPDF uses 0-based indexing)
      const page = this.document.loadPage(pageNum - 1);
      
      // Get page bounds
      const bounds = page.getBounds();
      const pageWidth = bounds[2] - bounds[0];
      const pageHeight = bounds[3] - bounds[1];
      
      // Apply zoom
      const scaledWidth = pageWidth * zoom;
      const scaledHeight = pageHeight * zoom;
      
      // Set canvas dimensions
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      
      // Create transformation matrix for zoom
      const matrix = mupdf.Matrix.scale(zoom, zoom);
      
      // Create a pixmap from the page
      const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, false);
      
      // Get pixel data and dimensions
      const pixels = pixmap.getPixels();
      const width = pixmap.getWidth();
      const height = pixmap.getHeight();
      const components = pixmap.getNumberOfComponents();
      
      console.log('Pixmap info:', { 
        width, 
        height, 
        components, 
        pixelsLength: pixels.length,
        expectedRGBALength: width * height * 4,
        expectedRGBLength: width * height * 3,
        expectedGrayLength: width * height * 1
      });
      
      // Validate pixel data
      if (!pixels || pixels.length === 0) {
        throw new Error('No pixel data received from pixmap');
      }
      
      const expectedLength = width * height * components;
      if (pixels.length !== expectedLength) {
        throw new Error(`Pixel data length mismatch: expected ${expectedLength}, got ${pixels.length}`);
      }
      
      // Create canvas context
      const ctx = canvas.getContext('2d');
      
      // Convert MuPDF pixel data to RGBA format
      const rgbaPixels = new Uint8ClampedArray(width * height * 4);
      
      try {
        console.log('Starting pixel conversion...');
        
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const pixelIndex = (y * width + x) * components;
            const rgbaIndex = (y * width + x) * 4;
            
            if (components === 3) {
              // RGB format - convert to RGBA
              rgbaPixels[rgbaIndex] = pixels[pixelIndex];     // R
              rgbaPixels[rgbaIndex + 1] = pixels[pixelIndex + 1]; // G
              rgbaPixels[rgbaIndex + 2] = pixels[pixelIndex + 2]; // B
              rgbaPixels[rgbaIndex + 3] = 255; // A (fully opaque)
            } else if (components === 4) {
              // RGBA format - copy directly
              rgbaPixels[rgbaIndex] = pixels[pixelIndex];     // R
              rgbaPixels[rgbaIndex + 1] = pixels[pixelIndex + 1]; // G
              rgbaPixels[rgbaIndex + 2] = pixels[pixelIndex + 2]; // B
              rgbaPixels[rgbaIndex + 3] = pixels[pixelIndex + 3]; // A
            } else if (components === 1) {
              // Grayscale - convert to RGBA
              const gray = pixels[pixelIndex];
              rgbaPixels[rgbaIndex] = gray;     // R
              rgbaPixels[rgbaIndex + 1] = gray; // G
              rgbaPixels[rgbaIndex + 2] = gray; // B
              rgbaPixels[rgbaIndex + 3] = 255; // A (fully opaque)
            }
          }
        }
        
        console.log('Pixel conversion completed successfully');
        
      } catch (conversionError) {
        console.error('Error during pixel conversion:', conversionError);
        throw new Error(`Pixel conversion failed: ${conversionError.message}`);
      }
      
      // Create ImageData and put it on canvas
      const imageData = new ImageData(rgbaPixels, width, height);
      ctx.putImageData(imageData, 0, 0);
      
      console.log(`Page ${pageNum} rendered successfully with zoom ${zoom}`);
      
      // Clean up
      pixmap.destroy();
      page.destroy();
      
    } catch (error) {
      console.error(`Failed to render page ${pageNum} with pixmap method:`, error);
      
      // Fallback: Try PNG rendering
      try {
        console.log(`Attempting PNG fallback for page ${pageNum}`);
        
        const page = this.document.loadPage(pageNum - 1);
        const matrix = mupdf.Matrix.scale(zoom, zoom);
        
        // Create a pixmap with different settings
        const fallbackPixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, false);
        
        // Try to get PNG data
        const pngData = fallbackPixmap.asPNG();
        
        if (pngData && pngData.length > 0) {
          // Create an image from PNG data
          const blob = new Blob([pngData], { type: 'image/png' });
          const url = URL.createObjectURL(blob);
          
          const img = new Image();
          img.onload = () => {
            // Set canvas size
            canvas.width = img.width;
            canvas.height = img.height;
            
            // Draw the PNG image
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            console.log(`Page ${pageNum} rendered successfully with PNG fallback`);
            
            // Clean up
            URL.revokeObjectURL(url);
          };
          
          img.onerror = () => {
            throw new Error('PNG fallback image loading failed');
          };
          
          img.src = url;
        } else {
          throw new Error('No PNG data received');
        }
        
        // Clean up
        fallbackPixmap.destroy();
        page.destroy();
        
      } catch (fallbackError) {
        console.error(`PNG fallback also failed for page ${pageNum}:`, fallbackError);
        throw new Error(`Both rendering methods failed: ${error.message}, fallback: ${fallbackError.message}`);
      }
    }
  }

  async searchText(searchTerm, maxHits = 100) {
    try {
      if (!this.document) {
        throw new Error('Document not loaded');
      }

      console.log(`Searching for "${searchTerm}" across all pages...`);
      const results = [];
      const totalPages = this.document.countPages();

      for (let pageNum = 0; pageNum < totalPages; pageNum++) {
        try {
          const page = this.document.loadPage(pageNum);
          
          // Search on this page
          const pageResults = page.search(searchTerm, maxHits);
          
          // Convert results to our format
          pageResults.forEach(quads => {
            // Each quad represents a text match
            quads.forEach(quad => {
              // Calculate bounding box from quad coordinates
              const x = Math.min(quad[0], quad[2], quad[4], quad[6]);
              const y = Math.min(quad[1], quad[3], quad[5], quad[7]);
              const width = Math.max(quad[0], quad[2], quad[4], quad[6]) - x;
              const height = Math.max(quad[1], quad[3], quad[5], quad[7]) - y;
              
              results.push({
                page: pageNum + 1, // Convert to 1-based
                x: x,
                y: y,
                width: width,
                height: height,
                quad: quad
              });
            });
          });
          
          page.destroy();
        } catch (pageError) {
          console.warn(`Error searching page ${pageNum + 1}:`, pageError);
          // Continue with other pages
        }
      }

      console.log(`Search completed. Found ${results.length} results.`);
      return results;
      
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  async getPageText(pageNum) {
    try {
      if (!this.document) {
        throw new Error('Document not loaded');
      }

      const page = this.document.loadPage(pageNum - 1);
      const structuredText = page.toStructuredText();
      const text = structuredText.asText();
      
      // Clean up
      structuredText.destroy();
      page.destroy();
      
      return text;
    } catch (error) {
      console.error(`Failed to get text from page ${pageNum}:`, error);
      throw error;
    }
  }

  async addAnnotation(pageNum, annotation) {
    try {
      if (!this.document) {
        throw new Error('Document not loaded');
      }

      // For now, we'll just store annotations in memory
      // In a full implementation, you'd add them to the PDF document
      console.log(`Adding annotation to page ${pageNum}:`, annotation);
      
      // TODO: Implement actual PDF annotation addition
      // This would require using the PDF-specific methods from PDFPage
      
    } catch (error) {
      console.error(`Failed to add annotation to page ${pageNum}:`, error);
      throw error;
    }
  }

  async saveDocument() {
    try {
      if (!this.document) {
        throw new Error('Document not loaded');
      }

      // Save to buffer
      const buffer = this.document.saveToBuffer();
      const uint8Array = buffer.asUint8Array();
      
      // Create a blob and download link
      const blob = new Blob([uint8Array], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = 'document_with_annotations.pdf';
      link.click();
      
      // Clean up
      URL.revokeObjectURL(url);
      buffer.destroy();
      
      console.log('Document saved successfully');
      return { success: true, url };
      
    } catch (error) {
      console.error('Failed to save document:', error);
      throw error;
    }
  }

  destroy() {
    try {
      if (this.document) {
        this.document.destroy();
        this.document = null;
      }
      this.isInitialized = false;
      console.log('MuPDF service destroyed');
    } catch (error) {
      console.error('Error destroying MuPDF service:', error);
    }
  }
}

// Export a singleton instance
const mupdfService = new MuPDFService();
export default mupdfService;
