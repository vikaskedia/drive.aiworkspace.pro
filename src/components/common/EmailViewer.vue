<template>
  <div class="email-viewer">
    <!-- Loading State -->
    <div v-if="loading" class="email-loading">
      <el-icon class="is-loading"><Message /></el-icon>
      <p>Loading email...</p>
    </div>
    
    <!-- Error State -->
    <div v-else-if="error" class="email-error">
      <el-icon class="email-error-icon"><Warning /></el-icon>
      <h4>Failed to load email</h4>
      <p>{{ error }}</p>
      <el-button @click="retryLoad" size="small">Retry</el-button>
    </div>
    
    <!-- Email Content -->
    <div v-else class="email-content">
      <!-- Email Header -->
      <div class="email-header">
        <div class="email-header-item" v-if="emailData.subject">
          <span class="email-label">Subject:</span>
          <span class="email-value subject-value">{{ emailData.subject }}</span>
        </div>
        <div class="email-header-item" v-if="emailData.from">
          <span class="email-label">From:</span>
          <span class="email-value">{{ emailData.from }}</span>
        </div>
        <div class="email-header-item" v-if="emailData.to">
          <span class="email-label">To:</span>
          <span class="email-value">{{ emailData.to }}</span>
        </div>
        <div class="email-header-item" v-if="emailData.cc">
          <span class="email-label">CC:</span>
          <span class="email-value">{{ emailData.cc }}</span>
        </div>
        <div class="email-header-item" v-if="emailData.bcc">
          <span class="email-label">BCC:</span>
          <span class="email-value">{{ emailData.bcc }}</span>
        </div>
        <div class="email-header-item" v-if="emailData.date">
          <span class="email-label">Date:</span>
          <span class="email-value">{{ emailData.date }}</span>
        </div>
        <div class="email-header-item" v-if="emailData.attachments && emailData.attachments.length > 0">
          <span class="email-label">Attachments:</span>
          <span class="email-value">
            <div v-for="attachment in emailData.attachments" :key="attachment.filename" class="attachment-item">
              <el-button 
                size="small" 
                type="primary" 
                :icon="Download" 
                @click="downloadAttachment(attachment)"
                class="attachment-button"
                :title="`Download ${attachment.filename} (${attachment.contentType})`"
              >
                {{ attachment.filename }}
              </el-button>
              <span class="attachment-info">
                {{ formatFileSize(attachment.size) }}
                <span v-if="attachment.disposition === 'inline'" class="inline-indicator">(inline)</span>
              </span>
            </div>
          </span>
        </div>
      </div>
      
      <!-- Email Body -->
      <div class="email-body">
        <div v-if="emailData.htmlBody" class="email-html-body" v-html="sanitizedHtmlBody"></div>
        <div v-else-if="emailData.textBody" class="email-text-body">
          <pre v-html="processEmailTextContent(emailData.textBody)"></pre>
        </div>
        <div v-else class="email-no-body">
          <p>No email body content found</p>
          <details class="debug-info" v-if="debugMode">
            <summary>Debug Information (click to expand)</summary>
            <pre>{{ debugInfo }}</pre>
          </details>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { Message, Warning, Download } from '@element-plus/icons-vue';

const props = defineProps({
  file: {
    type: Object,
    required: true
  },
  url: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['error', 'load-complete']);

// Component state
const loading = ref(true);
const error = ref(null);
const debugMode = ref(false);
const debugInfo = ref('');

// Email data
const emailData = ref({
  subject: '',
  from: '',
  to: '',
  cc: '',
  bcc: '',
  date: '',
  textBody: '',
  htmlBody: '',
  attachments: [] // Each attachment will be: { filename, contentType, data, size }
});

// Sanitized HTML body
const sanitizedHtmlBody = computed(() => {
  if (!emailData.value.htmlBody) return '';
  
  // Basic HTML sanitization - remove potentially dangerous elements
  let html = emailData.value.htmlBody;
  
  // Remove script tags and their content
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove dangerous attributes
  html = html.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
  html = html.replace(/javascript:/gi, '');
  
  // Make links safe
  html = html.replace(/<a\s+([^>]*?)href\s*=\s*["']([^"']*?)["']/gi, (match, attrs, href) => {
    // Only allow http/https/mailto links
    if (href.match(/^(https?:|mailto:)/i)) {
      return `<a ${attrs}href="${href}" target="_blank" rel="noopener noreferrer"`;
    }
    return `<a ${attrs}href="#"`;
  });
  
  return html;
});

// Process email text content to make URLs and emails clickable
const processEmailTextContent = (content) => {
  if (!content) return '';
  
  const urlRegex = /(https?:\/\/(?:[-\w.])+(?::[0-9]+)?(?:\/(?:[\w\._~:/?#[\]@!$&'()*+,;=-])*)?)/gi;
  const emailRegex = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/gi;
  
  const lines = content.split('\n');
  
  return lines.map(line => {
    let processedLine = line.replace(urlRegex, (url) => {
      const cleanUrl = url.replace(/[.,;:!?)\]}]*$/, '');
      const trailingPunct = url.substring(cleanUrl.length);
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="text-link">${cleanUrl}</a>${trailingPunct}`;
    });
    
    processedLine = processedLine.replace(emailRegex, (match, email, offset, string) => {
      const beforeMatch = string.substring(0, offset);
      const openTags = (beforeMatch.match(/<a\b[^>]*>/gi) || []).length;
      const closeTags = (beforeMatch.match(/<\/a>/gi) || []).length;
      
      if (openTags > closeTags) {
        return match;
      }
      
      return `<a href="mailto:${email}" class="text-link">${email}</a>`;
    });
    
    return processedLine;
  }).join('\n');
};

// Load email content
async function loadEmailContent() {
  if (!props.file) return;
  
  loading.value = true;
  error.value = null;
  
  try {
    const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
    const giteaHost = import.meta.env.VITE_GITEA_HOST;
    
    console.log('Loading email file:', props.file.name, props.file.path);
    
    let emailContent = '';
    
    try {
      // First try to use the API endpoint to get file content
      const response = await fetch(
        `${giteaHost}/api/v1/repos/${props.file.repository}/contents/${props.file.path}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `token ${giteaToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        console.log('Email file API response:', data);
        
        // Check if content is available (API doesn't return content for large files)
        if (data.content) {
          // Content from API is base64 encoded
          emailContent = atob(data.content);
          console.log('Loaded email content via API, length:', emailContent.length);
        } else {
          console.log('API response does not contain content field, trying direct download...');
          throw new Error('No content in API response');
        }
      } else {
        console.log('API request failed, trying direct download...');
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
    } catch (apiError) {
      console.log('API method failed, falling back to direct download:', apiError.message);
      
      // Fallback: Use direct download URL for large files
      if (!props.file.download_url) {
        throw new Error('No download URL available for direct file access');
      }
      
      const directUrl = getAuthenticatedDownloadUrl(props.file.download_url);
      console.log('Using direct download URL:', directUrl);
      
      const directResponse = await fetch(directUrl, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!directResponse.ok) {
        throw new Error(`Failed to load email file via direct URL: ${directResponse.status} ${directResponse.statusText}`);
      }
      
      emailContent = await directResponse.text();
      console.log('Loaded email content via direct download, length:', emailContent.length);
    }
    
    console.log('First 500 chars of email content:', emailContent.substring(0, 500));
    
    // Parse the email content
    parseEmailContent(emailContent);
    
    emit('load-complete');
  } catch (err) {
    console.error('Error loading email file:', err);
    error.value = `Failed to load email file: ${err.message}`;
    emit('error', err);
  } finally {
    loading.value = false;
  }
}

// Enhanced email parsing
function parseEmailContent(content) {
  try {
    console.log('Parsing email content...');
    
    // Reset email data
    emailData.value = {
      subject: '',
      from: '',
      to: '',
      cc: '',
      bcc: '',
      date: '',
      textBody: '',
      htmlBody: '',
      attachments: []
    };
    
    // Store debug information
    debugInfo.value = `Raw content length: ${content.length}\n\nFirst 1000 chars:\n${content.substring(0, 1000)}\n\n`;
    
    // More robust splitting - look for first occurrence of double newline
    const headerBodySplit = content.indexOf('\r\n\r\n');
    const headerBodySplit2 = content.indexOf('\n\n');
    
    let splitIndex = -1;
    if (headerBodySplit !== -1 && headerBodySplit2 !== -1) {
      splitIndex = Math.min(headerBodySplit, headerBodySplit2);
    } else if (headerBodySplit !== -1) {
      splitIndex = headerBodySplit;
    } else if (headerBodySplit2 !== -1) {
      splitIndex = headerBodySplit2;
    }
    
    if (splitIndex === -1) {
      console.warn('Could not find header/body separator, treating entire content as body');
      emailData.value.textBody = content;
      emailData.value.subject = 'Email Content (No Headers Found)';
      debugInfo.value += 'No header/body separator found\n';
      return;
    }
    
    const headerPart = content.substring(0, splitIndex);
    const bodyPart = content.substring(splitIndex + (content.charAt(splitIndex + 1) === '\r' ? 4 : 2));
    
    console.log('Header part length:', headerPart.length);
    console.log('Body part length:', bodyPart.length);
    console.log('Body part preview:', bodyPart.substring(0, 200));
    
    debugInfo.value += `Header length: ${headerPart.length}\nBody length: ${bodyPart.length}\n\n`;
    debugInfo.value += `Body preview:\n${bodyPart.substring(0, 500)}\n\n`;
    
    // Parse headers
    const headers = {};
    const headerLines = headerPart.split(/\r?\n/);
    let currentHeader = '';
    
    for (const line of headerLines) {
      if (line.match(/^\s/)) {
        // Continuation of previous header
        if (currentHeader) {
          headers[currentHeader] += ' ' + line.trim();
        }
      } else {
        // New header
        const match = line.match(/^([^:]+):\s*(.*)$/);
        if (match) {
          currentHeader = match[1].toLowerCase().trim();
          headers[currentHeader] = match[2].trim();
        }
      }
    }
    
    console.log('Parsed headers:', headers);
    debugInfo.value += `Headers found: ${Object.keys(headers).join(', ')}\n\n`;
    
    // Extract common headers with proper decoding
    emailData.value.subject = decodeEmailHeader(headers.subject || '');
    emailData.value.from = decodeEmailHeader(headers.from || '');
    emailData.value.to = decodeEmailHeader(headers.to || '');
    emailData.value.cc = decodeEmailHeader(headers.cc || '');
    emailData.value.bcc = decodeEmailHeader(headers.bcc || '');
    emailData.value.date = formatEmailDate(headers.date || '');
    
    // Parse body content
    const contentType = headers['content-type'] || '';
    const contentTransferEncoding = headers['content-transfer-encoding'] || '';
    console.log('Content-Type:', contentType);
    console.log('Content-Transfer-Encoding:', contentTransferEncoding);
    debugInfo.value += `Content-Type: ${contentType}\n`;
    debugInfo.value += `Content-Transfer-Encoding: ${contentTransferEncoding}\n`;
    
    // Decode body content based on transfer encoding
    let decodedBody = bodyPart;
    if (contentTransferEncoding.toLowerCase() === 'base64') {
      try {
        decodedBody = atob(bodyPart.trim());
        console.log('Decoded base64 body content');
      } catch (e) {
        console.warn('Failed to decode base64 body content:', e);
        decodedBody = bodyPart;
      }
    } else if (contentTransferEncoding.toLowerCase() === 'quoted-printable') {
      decodedBody = decodeQuotedPrintable(bodyPart);
      console.log('Decoded quoted-printable body content');
    }
    
    if (contentType.includes('multipart')) {
      // For multipart, pass the original body since parts have their own encoding
      parseMultipartContent(bodyPart, contentType);
    } else if (contentType.includes('text/html')) {
      emailData.value.htmlBody = decodedBody.trim();
      console.log('Set HTML body, length:', emailData.value.htmlBody.length);
    } else if (contentType.includes('text/plain') || !contentType) {
      // If no content-type specified, assume plain text
      emailData.value.textBody = decodedBody.trim();
      console.log('Set text body, length:', emailData.value.textBody.length);
    } else {
      // Fallback: treat as plain text
      emailData.value.textBody = decodedBody.trim();
      console.log('Fallback: set as text body, length:', emailData.value.textBody.length);
    }
    
    // If still no body content, try to extract it differently
    if (!emailData.value.textBody && !emailData.value.htmlBody && decodedBody) {
      console.log('No body content found through normal parsing, using decoded body');
      
      // Try to extract readable content from what might be multipart data
      if (contentType.includes('multipart') && decodedBody.includes('Content-Type: text/')) {
        console.log('Attempting to extract text from multipart structure manually');
        
        // Look for text/plain content in the raw multipart
        const textMatch = decodedBody.match(/Content-Type:\s*text\/plain[\s\S]*?\n\n([\s\S]*?)(?=--[a-zA-Z0-9]|\Z)/i);
        if (textMatch && textMatch[1]) {
          let extractedText = textMatch[1].trim();
          // Decode if it appears to be quoted-printable
          if (extractedText.includes('=')) {
            extractedText = decodeQuotedPrintable(extractedText);
          }
          emailData.value.textBody = extractedText;
          debugInfo.value += 'Manually extracted text content from multipart structure\n';
          console.log('Manually extracted text content:', extractedText.substring(0, 100));
        } else {
          // Look for HTML content
          const htmlMatch = decodedBody.match(/Content-Type:\s*text\/html[\s\S]*?\n\n([\s\S]*?)(?=--[a-zA-Z0-9]|\Z)/i);
          if (htmlMatch && htmlMatch[1]) {
            let extractedHtml = htmlMatch[1].trim();
            if (extractedHtml.includes('=')) {
              extractedHtml = decodeQuotedPrintable(extractedHtml);
            }
            emailData.value.htmlBody = extractedHtml;
            debugInfo.value += 'Manually extracted HTML content from multipart structure\n';
            console.log('Manually extracted HTML content:', extractedHtml.substring(0, 100));
          } else {
            // Last resort - use the decoded body as text
            emailData.value.textBody = decodedBody;
            debugInfo.value += 'Used decoded body content as fallback\n';
          }
        }
      } else {
        emailData.value.textBody = decodedBody;
        debugInfo.value += 'Used decoded body content as fallback\n';
      }
    }
    
    console.log('Final email data:', {
      subject: emailData.value.subject,
      from: emailData.value.from,
      to: emailData.value.to,
      textBodyLength: emailData.value.textBody.length,
      htmlBodyLength: emailData.value.htmlBody.length,
      attachments: emailData.value.attachments
    });
    
  } catch (err) {
    console.error('Error parsing email content:', err);
    debugInfo.value += `Parse error: ${err.message}\n`;
    
    // Fallback: show raw content
    emailData.value.textBody = content;
    emailData.value.subject = 'Email Content (Parse Error)';
  }
}

// Enhanced multipart parsing
function parseMultipartContent(bodyPart, contentType) {
  try {
    console.log('Parsing multipart content...');
    
    // Extract boundary from content-type header
    const boundaryMatch = contentType.match(/boundary=["']?([^"';]+)["']?/i);
    if (!boundaryMatch) {
      console.warn('No boundary found in multipart content');
      emailData.value.textBody = bodyPart;
      debugInfo.value += 'No boundary found in multipart content\n';
      return;
    }
    
    const boundary = boundaryMatch[1];
    console.log('Found boundary:', boundary);
    debugInfo.value += `Boundary: ${boundary}\n`;
    
    // Split by boundary - more robust approach
    const boundaryDelimiter = `--${boundary}`;
    const parts = bodyPart.split(boundaryDelimiter);
    
    console.log('Found', parts.length, 'parts');
    debugInfo.value += `Found ${parts.length} parts\n`;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      
      // Skip empty parts and end markers
      if (!part || part === '--' || part === '') {
        console.log(`Skipping part ${i}: empty or end marker`);
        continue;
      }
      
      console.log(`Processing part ${i}, length:`, part.length);
      console.log(`Part ${i} first 200 chars:`, part.substring(0, 200));
      
      // Find the separation between headers and content in this part
      let headerEndIndex = -1;
      
      // Look for double newline (header/body separator)
      const crlfcrlf = part.indexOf('\r\n\r\n');
      const lflf = part.indexOf('\n\n');
      
      if (crlfcrlf !== -1 && lflf !== -1) {
        headerEndIndex = Math.min(crlfcrlf, lflf);
      } else if (crlfcrlf !== -1) {
        headerEndIndex = crlfcrlf;
      } else if (lflf !== -1) {
        headerEndIndex = lflf;
      }
      
      if (headerEndIndex === -1) {
        console.log(`Part ${i}: No header/body separator found, treating as content`);
        // If no separator, this might be content without headers
        if (part.length > 10) { // Only if it has substantial content
          if (!emailData.value.textBody) {
            emailData.value.textBody = part;
            console.log(`Part ${i}: Used as text body (no headers)`);
          }
        }
        continue;
      }
      
      const partHeaders = part.substring(0, headerEndIndex);
      const partContent = part.substring(headerEndIndex + (part.charAt(headerEndIndex + 1) === '\r' ? 4 : 2));
      
      console.log(`Part ${i} headers:`, partHeaders.substring(0, 150));
      console.log(`Part ${i} content length:`, partContent.length);
      console.log(`Part ${i} content preview:`, partContent.substring(0, 100));
      
      // Parse part headers
      const partHeadersObj = {};
      const partHeaderLines = partHeaders.split(/\r?\n/);
      
      for (const line of partHeaderLines) {
        if (line.match(/^\s/)) {
          // Continuation of previous header - skip for simplicity
          continue;
        }
        const match = line.match(/^([^:]+):\s*(.*)$/);
        if (match) {
          const headerName = match[1].toLowerCase().trim();
          const headerValue = match[2].trim();
          partHeadersObj[headerName] = headerValue;
        }
      }
      
      console.log(`Part ${i} parsed headers:`, partHeadersObj);
      
      const partContentType = partHeadersObj['content-type'] || '';
      const contentDisposition = partHeadersObj['content-disposition'] || '';
      const contentTransferEncoding = partHeadersObj['content-transfer-encoding'] || '';
      
      // Decode part content if needed
      let decodedContent = partContent;
      if (contentTransferEncoding.toLowerCase() === 'base64') {
        try {
          decodedContent = atob(partContent.replace(/\s/g, ''));
          console.log(`Part ${i}: Decoded base64 content`);
        } catch (e) {
          console.warn(`Part ${i}: Failed to decode base64:`, e);
          decodedContent = partContent;
        }
      } else if (contentTransferEncoding.toLowerCase() === 'quoted-printable') {
        decodedContent = decodeQuotedPrintable(partContent);
        console.log(`Part ${i}: Decoded quoted-printable content`);
      }
      
      // Handle the decoded content based on its type and disposition
      if (contentDisposition.includes('attachment') || 
          (contentDisposition.includes('inline') && partContentType && !partContentType.includes('text/'))) {
        // Extract attachment filename
        const filenameMatch = contentDisposition.match(/filename=["']?([^"';]+)["']?/i);
        if (filenameMatch && decodedContent) {
          const attachment = {
            filename: filenameMatch[1],
            contentType: partContentType || 'application/octet-stream',
            data: decodedContent,
            size: decodedContent.length,
            disposition: contentDisposition.includes('attachment') ? 'attachment' : 'inline'
          };
          emailData.value.attachments.push(attachment);
          console.log(`Part ${i}: Found ${attachment.disposition}:`, filenameMatch[1], 'Size:', decodedContent.length, 'bytes');
        } else if (!partContentType.includes('text/') && decodedContent && decodedContent.length > 100) {
          // Handle attachments without proper filename (fallback)
          const extension = getExtensionFromContentType(partContentType);
          const fallbackName = `attachment_${i}${extension}`;
          const attachment = {
            filename: fallbackName,
            contentType: partContentType || 'application/octet-stream',
            data: decodedContent,
            size: decodedContent.length,
            disposition: 'attachment'
          };
          emailData.value.attachments.push(attachment);
          console.log(`Part ${i}: Found unnamed attachment:`, fallbackName, 'Size:', decodedContent.length, 'bytes');
        }
      } else if (partContentType.includes('text/html')) {
        // HTML content
        if (!emailData.value.htmlBody || decodedContent.trim().length > emailData.value.htmlBody.length) {
          emailData.value.htmlBody = decodedContent.trim();
          console.log(`Part ${i}: Set HTML body, length:`, emailData.value.htmlBody.length);
        }
      } else if (partContentType.includes('text/plain') || partContentType.includes('text/')) {
        // Plain text or other text content
        if (!emailData.value.textBody || decodedContent.trim().length > emailData.value.textBody.length) {
          emailData.value.textBody = decodedContent.trim();
          console.log(`Part ${i}: Set text body, length:`, emailData.value.textBody.length);
        }
      } else if (partContentType.includes('multipart/')) {
        // Nested multipart - recursively parse
        console.log(`Part ${i}: Found nested multipart, parsing recursively`);
        parseMultipartContent(partContent, partContentType);
      } else if (!partContentType || partContentType === '') {
        // No content type specified, assume text if it looks like text
        if (decodedContent.trim().length > 0) {
          if (!emailData.value.textBody) {
            emailData.value.textBody = decodedContent.trim();
            console.log(`Part ${i}: Set as text body (no content-type), length:`, emailData.value.textBody.length);
          }
        }
      } else {
        console.log(`Part ${i}: Unknown content type: ${partContentType}, treating as text if no other content found`);
        if (!emailData.value.textBody && !emailData.value.htmlBody && decodedContent.trim().length > 0) {
          emailData.value.textBody = decodedContent.trim();
          console.log(`Part ${i}: Used as fallback text body`);
        }
      }
    }
    
    debugInfo.value += `Multipart parsing completed. Found HTML: ${emailData.value.htmlBody ? 'Yes' : 'No'}, Text: ${emailData.value.textBody ? 'Yes' : 'No'}\n`;
    
  } catch (err) {
    console.error('Error parsing multipart content:', err);
    debugInfo.value += `Multipart parse error: ${err.message}\n`;
    emailData.value.textBody = bodyPart;
  }
}

// Decode quoted-printable content
function decodeQuotedPrintable(str) {
  return str
    .replace(/=\r?\n/g, '') // Remove soft line breaks
    .replace(/=([0-9A-F]{2})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// Decode RFC 2047 encoded-word format (=?charset?encoding?encoded-text?=)
function decodeEncodedWord(str) {
  if (!str) return str;
  
  // Handle encoded-word format: =?charset?encoding?encoded-text?=
  return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (match, charset, encoding, encodedText) => {
    try {
      let decodedText = '';
      
      if (encoding.toLowerCase() === 'b') {
        // Base64 encoding
        decodedText = atob(encodedText);
      } else if (encoding.toLowerCase() === 'q') {
        // Quoted-printable encoding with modified rules for encoded-words
        decodedText = encodedText
          .replace(/_/g, ' ') // Underscores represent spaces in encoded-words
          .replace(/=([0-9A-F]{2})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
      }
      
      // For now, assume the decoded text is in the correct encoding
      // In a full implementation, you might need to handle different charsets
      return decodedText;
    } catch (error) {
      console.warn('Failed to decode encoded-word:', match, error);
      return match; // Return original if decoding fails
    }
  });
}

// Enhanced decode function for email headers
function decodeEmailHeader(headerValue) {
  if (!headerValue) return '';
  
  // First decode encoded-words
  let decoded = decodeEncodedWord(headerValue);
  
  // Then handle any remaining quoted-printable sequences
  decoded = decodeQuotedPrintable(decoded);
  
  return decoded;
}

// Format email date
function formatEmailDate(dateString) {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return dateString; // Return original if parsing fails
    }
    return date.toLocaleString();
  } catch (err) {
    return dateString;
  }
}

// Get authenticated download URL
function getAuthenticatedDownloadUrl(originalUrl) {
  if (!originalUrl) {
    console.warn('No original URL provided');
    return '';
  }
  
  try {
    console.log('Getting authenticated URL for:', originalUrl);
    
    // If the URL already contains token (raw URL format), return as-is
    if (originalUrl.includes('?token=')) {
      console.log('URL already contains token, using as-is');
      return originalUrl;
    }
    
    // Add token for authentication
    const giteaToken = import.meta.env.VITE_GITEA_TOKEN;
    if (!giteaToken) {
      console.error('VITE_GITEA_TOKEN not found');
      return originalUrl;
    }
    
    const url = new URL(originalUrl);
    
    // Remove any existing token parameter
    url.searchParams.delete('token');
    
    // Add token as a query parameter
    url.searchParams.set('token', giteaToken);
    
    const finalUrl = url.toString();
    console.log('Final authenticated URL:', finalUrl);
    return finalUrl;
  } catch (error) {
    console.error('Error creating authenticated URL:', error, 'Original URL:', originalUrl);
    return originalUrl;
  }
}

// Download attachment
function downloadAttachment(attachment) {
  try {
    console.log('Downloading attachment:', attachment.filename, 'Type:', attachment.contentType);
    
    let binaryData;
    
    // Handle different data types
    if (attachment.data instanceof Uint8Array || attachment.data instanceof ArrayBuffer) {
      // Already binary data
      binaryData = attachment.data;
    } else if (typeof attachment.data === 'string') {
      // String data - convert to binary array
      binaryData = new Uint8Array(attachment.data.length);
      for (let i = 0; i < attachment.data.length; i++) {
        binaryData[i] = attachment.data.charCodeAt(i) & 0xFF; // Ensure it stays within byte range
      }
    } else {
      throw new Error('Unsupported attachment data type');
    }
    
    // Create blob and download
    const blob = new Blob([binaryData], { type: attachment.contentType });
    const url = URL.createObjectURL(blob);
    
    // Create temporary download link
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the URL
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    console.log('Successfully downloaded:', attachment.filename, 'Size:', attachment.size, 'bytes');
  } catch (error) {
    console.error('Error downloading attachment:', error);
    // Show user-friendly error message
    alert(`Failed to download ${attachment.filename}: ${error.message}`);
  }
}

// Format file size for display
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Get file extension from content type
function getExtensionFromContentType(contentType) {
  if (!contentType) return '';
  
  const mimeToExt = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg', 
    'image/png': '.png',
    'image/gif': '.gif',
    'text/plain': '.txt',
    'text/html': '.html',
    'application/zip': '.zip',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
  };
  
  return mimeToExt[contentType.toLowerCase()] || '';
}

// Retry loading
function retryLoad() {
  loadEmailContent();
}

// Watch for file changes
watch(() => props.file, (newFile) => {
  if (newFile) {
    loadEmailContent();
  }
}, { immediate: true });

// Toggle debug mode (for development)
onMounted(() => {
  // Enable debug mode in development
  debugMode.value = import.meta.env.DEV || false;
});
</script>

<style scoped>
.email-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: white;
}

.email-loading,
.email-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  text-align: center;
  color: #909399;
  min-height: 200px;
  flex: 1;
}

.email-loading .el-icon,
.email-error .email-error-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.email-loading .el-icon {
  color: #409EFF;
}

.email-error .email-error-icon {
  color: #f56c6c;
}

.email-loading p,
.email-error p {
  margin: 0;
  font-size: 14px;
}

.email-error h4 {
  margin: 16px 0 8px 0;
  color: #606266;
}

.email-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.email-header {
  border-bottom: 2px solid #e1e8ed;
  padding: 20px;
  background: #f8f9fa;
  flex-shrink: 0;
}

.email-header-item {
  display: flex;
  margin-bottom: 12px;
  align-items: flex-start;
}

.email-header-item:last-child {
  margin-bottom: 0;
}

.email-label {
  font-weight: 600;
  color: #333;
  min-width: 80px;
  margin-right: 12px;
  flex-shrink: 0;
}

.email-value {
  color: #555;
  word-break: break-word;
  flex: 1;
}

.subject-value {
  font-weight: 500;
  color: #333;
}

.attachment-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  gap: 8px;
}

.attachment-item:last-child {
  margin-bottom: 0;
}

.attachment-button {
  flex-shrink: 0;
}

.attachment-info {
  font-size: 12px;
  color: #909399;
  font-style: italic;
}

.inline-indicator {
  color: #67C23A;
  font-weight: 500;
}

.email-body {
  flex: 1;
  overflow: auto;
  padding: 20px;
}

.email-html-body {
  line-height: 1.6;
  color: #333;
  word-wrap: break-word;
}

.email-html-body img {
  max-width: 100%;
  height: auto;
}

.email-html-body table {
  border-collapse: collapse;
  width: 100%;
  margin: 16px 0;
}

.email-html-body table td,
.email-html-body table th {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
}

.email-html-body table th {
  background-color: #f2f2f2;
  font-weight: bold;
}

.email-html-body a {
  color: #409EFF;
  text-decoration: none;
}

.email-html-body a:hover {
  color: #337ecc;
  text-decoration: underline;
}

.email-text-body {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 16px;
}

.email-text-body pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 14px;
  line-height: 1.5;
  color: #333;
}

.email-text-body .text-link {
  color: #409EFF;
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: all 0.2s ease;
}

.email-text-body .text-link:hover {
  color: #337ecc;
  text-decoration: underline;
  border-bottom-color: #337ecc;
}

.email-text-body .text-link:visited {
  color: #6b5b95;
}

.email-text-body .text-link:active {
  color: #2d5aa0;
}

.email-no-body {
  text-align: center;
  color: #909399;
  font-style: italic;
  padding: 32px;
}

.email-no-body p {
  margin: 0 0 16px 0;
}

.debug-info {
  margin-top: 24px;
  text-align: left;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.debug-info summary {
  cursor: pointer;
  color: #409EFF;
  font-size: 12px;
  margin-bottom: 8px;
}

.debug-info pre {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.4;
  max-height: 300px;
  overflow-y: auto;
  color: #666;
}
</style>
