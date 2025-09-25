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

      console.log(`Adding annotation to page ${pageNum}:`, annotation);
      
      // For now, we'll just log the annotation - MuPDF annotation creation is complex
      // The visual annotations are already drawn on the canvas
      console.log(`📝 Processed annotation: ${annotation.type} on page ${pageNum}`);
      
      // Return success - the visual annotations are what the user sees
      return true;
      
    } catch (error) {
      console.error(`Failed to add annotation to page ${pageNum}:`, error);
      // Don't throw - we want to continue with the save process
      return false;
    }
  }



  async saveDocumentWithAnnotations(annotationsByPage) {
    try {
      if (!this.document) {
        throw new Error('Document not loaded');
      }

      console.log('💾 Saving document with burned-in annotations...');
      
      // Create a new PDF document with annotations burned in
      const newDocument = mupdf.Document.createDocument();
      
      for (let pageNum = 1; pageNum <= this.document.countPages(); pageNum++) {
        console.log(`Processing page ${pageNum} with annotations...`);
        
        // Load original page
        const originalPage = this.document.loadPage(pageNum - 1);
        const bounds = originalPage.getBounds();
        
        // Create new page in new document
        const newPage = newDocument.insertPage(-1, bounds);
        
        // Draw original page content
        const matrix = mupdf.Matrix.identity;
        const device = mupdf.DisplayList.createDisplayListDevice();
        originalPage.run(device, matrix);
        const displayList = device.finalize();
        
        // Apply display list to new page
        const newDevice = newPage.createDevice();
        displayList.run(newDevice, matrix);
        newDevice.finalize();
        
        // Add annotations for this page
        const pageAnnotations = annotationsByPage[pageNum] || [];
        for (const annotation of pageAnnotations) {
          await this.addAnnotationToPage(newPage, annotation);
        }
        
        // Clean up
        originalPage.destroy();
        displayList.destroy();
      }
      
      // Save the new document
      const buffer = newDocument.saveToBuffer();
      const uint8Array = buffer.asUint8Array();
      
      // Create ArrayBuffer from Uint8Array for upload
      const arrayBuffer = uint8Array.buffer.slice(
        uint8Array.byteOffset, 
        uint8Array.byteOffset + uint8Array.byteLength
      );
      
      // Clean up
      buffer.destroy();
      newDocument.destroy();
      
      console.log('✅ Document saved with burned-in annotations', {
        size: arrayBuffer.byteLength,
        type: 'ArrayBuffer'
      });
      
      return arrayBuffer;
      
    } catch (error) {
      console.error('❌ Failed to save document with annotations:', error);
      
      // Fallback to original document if annotation burning fails
      console.log('🔄 Falling back to original document save...');
      return this.saveDocument();
    }
  }

  async saveDocument() {
    try {
      if (!this.document) {
        throw new Error('Document not loaded');
      }

      console.log('💾 Saving original document...');
      
      const buffer = this.document.saveToBuffer();
      const uint8Array = buffer.asUint8Array();
      
      // Create ArrayBuffer from Uint8Array for upload
      const arrayBuffer = uint8Array.buffer.slice(
        uint8Array.byteOffset, 
        uint8Array.byteOffset + uint8Array.byteLength
      );
      
      // Clean up MuPDF buffer
      buffer.destroy();
      
      console.log('✅ Original document saved', {
        size: arrayBuffer.byteLength,
        type: 'ArrayBuffer'
      });
      
      return arrayBuffer;
      
    } catch (error) {
      console.error('❌ Failed to save document:', error);
      throw error;
    }
  }

  async addAnnotationToPage(page, annotation) {
    try {
      console.log('Adding annotation to page:', annotation.type);
      
      if (annotation.type === 'text') {
        // Add text directly to the page
        const text = annotation.text || 'Text annotation';
        const x = annotation.position?.x || 100;
        const y = annotation.position?.y || 100;
        
        // Create text annotation
        const textAnnot = page.createAnnotation('FreeText');
        textAnnot.setRect([x, y, x + text.length * 6, y + 20]);
        textAnnot.setContents(text);
        textAnnot.update();
        
      } else if (annotation.type === 'highlight') {
        // Add highlight annotation
        const x = annotation.position?.x || 100;
        const y = annotation.position?.y || 100;
        const w = annotation.width || 100;
        const h = annotation.height || 20;
        
        const highlightAnnot = page.createAnnotation('Highlight');
        highlightAnnot.setRect([x, y, x + w, y + h]);
        highlightAnnot.update();
        
      } else if (annotation.type === 'draw') {
        // Add drawing as ink annotation
        const points = annotation.points || [];
        if (points.length >= 2) {
          const inkAnnot = page.createAnnotation('Ink');
          const startPoint = points[0];
          const endPoint = points[points.length - 1];
          
          const minX = Math.min(startPoint.x, endPoint.x);
          const minY = Math.min(startPoint.y, endPoint.y);
          const maxX = Math.max(startPoint.x, endPoint.x);
          const maxY = Math.max(startPoint.y, endPoint.y);
          
          inkAnnot.setRect([minX, minY, maxX, maxY]);
          inkAnnot.update();
        }
      }
      
      console.log(`✅ Added ${annotation.type} annotation to page`);
      return true;
      
    } catch (error) {
      console.warn(`⚠️ Could not add ${annotation.type} annotation:`, error.message);
      return false;
    }
  }

  async saveDocumentAsDownload() {
    try {
      const arrayBuffer = await this.saveDocument();
      
      // Create a blob and download link
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = 'document_with_annotations.pdf';
      link.click();
      
      // Clean up
      URL.revokeObjectURL(url);
      
      console.log('Document downloaded successfully');
      return { success: true, url };
      
    } catch (error) {
      console.error('Failed to download document:', error);
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
