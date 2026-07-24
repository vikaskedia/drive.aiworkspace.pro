/**
 * Gitea File Upload Utility
 * Handles uploading files to Gitea repositories via API
 */

/**
 * Convert ArrayBuffer to Base64 string (chunk-based for large files)
 * @param {ArrayBuffer} buffer 
 * @returns {string} Base64 encoded string
 */
function arrayBufferToBase64(buffer) {
  const uint8Array = new Uint8Array(buffer);
  const chunkSize = 8192; // Process in 8KB chunks to avoid call stack issues
  let result = '';
  
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, i + chunkSize);
    result += String.fromCharCode.apply(null, chunk);
  }
  
  return btoa(result);
}

/**
 * Upload a file to Gitea repository
 * @param {Object} options - Upload options
 * @param {string} options.giteaHost - Gitea host URL
 * @param {string} options.giteaToken - Gitea API token
 * @param {string} options.repoName - Repository name
 * @param {string} options.filePath - File path in repository (e.g., 'documents/file.pdf')
 * @param {ArrayBuffer|Blob} options.fileContent - File content as ArrayBuffer or Blob
 * @param {string} options.message - Commit message
 * @param {string} options.branch - Branch name (default: 'main')
 * @param {string} options.authorName - Author name for commit
 * @param {string} options.authorEmail - Author email for commit
 * @returns {Promise<Object>} - Response from Gitea API
 */

/**
 * Upload or update a file to Gitea repository
 * @param {Object} options - Upload options
 * @param {string} options.giteaHost - Gitea host URL (e.g., 'https://g.grmtech.com')
 * @param {string} options.giteaToken - Gitea API token
 * @param {string} options.repoName - Repository name
 * @param {string} options.filePath - File path in repository (e.g., 'documents/file.pdf')
 * @param {ArrayBuffer|Blob} options.fileContent - File content as ArrayBuffer or Blob
 * @param {string} options.message - Commit message
 * @param {string} options.branch - Branch name (default: 'main')
 * @param {string} options.authorName - Author name for commit
 * @param {string} options.authorEmail - Author email for commit
 * @returns {Promise<Object>} - Response from Gitea API
 */
export async function uploadFileToGitea({
  giteaHost,
  giteaToken,
  repoName,
  filePath,
  fileContent,
  message,
  branch = 'main',
  authorName = 'PDF Editor',
  authorEmail = 'editor@aiworkspace.pro'
}) {
  try {
    console.log('🚀 Starting file upload to Gitea:', {
      repo: repoName,
      path: filePath,
      branch,
      size: fileContent.byteLength || fileContent.size
    });

    // Convert content to base64 (using chunk-based approach for large files)
    let base64Content;
    if (fileContent instanceof ArrayBuffer) {
      base64Content = arrayBufferToBase64(fileContent);
    } else if (fileContent instanceof Blob) {
      const arrayBuffer = await fileContent.arrayBuffer();
      base64Content = arrayBufferToBase64(arrayBuffer);
    } else {
      throw new Error('File content must be ArrayBuffer or Blob');
    }
    
    console.log('📄 File content converted to base64, size:', base64Content.length);

    // First, check if file exists to get SHA (required for updates)
    const checkUrl = `${giteaHost}/api/v1/repos/associateattorney/${repoName}/contents/${filePath}`;
    let existingSha = null;

    try {
      const checkResponse = await fetch(checkUrl, {
        method: 'GET',
        headers: {
          'Authorization': `token ${giteaToken}`,
          'Accept': 'application/json'
        }
      });

      if (checkResponse.ok) {
        const existingFile = await checkResponse.json();
        existingSha = existingFile.sha;
        console.log('📄 File exists, updating with SHA:', existingSha);
      }
    } catch (checkError) {
      console.log('📄 File does not exist, creating new file');
    }

    // Prepare request body
    const requestBody = {
      content: base64Content,
      message: message,
      branch: branch,
      author: {
        name: authorName,
        email: authorEmail
      },
      committer: {
        name: authorName,
        email: authorEmail
      }
    };

    // Add SHA if file exists (for updates)
    if (existingSha) {
      requestBody.sha = existingSha;
    }

    // Upload/update file
    const uploadUrl = `${giteaHost}/api/v1/repos/associateattorney/${repoName}/contents/${filePath}`;
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${giteaToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Gitea API error: ${uploadResponse.status} - ${errorText}`);
    }

    const result = await uploadResponse.json();
    
    console.log('✅ File uploaded successfully to Gitea:', {
      commit: result.commit?.sha,
      url: result.content?.html_url
    });

    return {
      success: true,
      commitSha: result.commit?.sha,
      fileUrl: result.content?.html_url,
      downloadUrl: result.content?.download_url,
      result: result
    };

  } catch (error) {
    console.error('❌ Failed to upload file to Gitea:', error);
    throw new Error(`Failed to upload file to Gitea: ${error.message}`);
  }
}

/**
 * Generate a filename with timestamp for edited PDFs
 * @param {string} originalFilename - Original filename
 * @returns {string} - New filename with timestamp
 */
export function generateEditedFilename(originalFilename) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const nameWithoutExt = originalFilename.replace(/\.[^/.]+$/, "");
  const extension = originalFilename.split('.').pop();
  
  return `${nameWithoutExt}_edited_${timestamp}.${extension}`;
}

/**
 * Get workspace git repository info from current workspace
 * @param {Object} workspace - Current workspace object
 * @returns {Object|null} - Git repo info or null if not found
 */
export function getWorkspaceGitInfo(workspace) {
  if (!workspace?.git_repo) {
    console.warn('No git_repo found in workspace:', workspace);
    return null;
  }

  try {
    const gitRepoValue = workspace.git_repo;
    console.log('Parsing git repository value:', gitRepoValue);
    
    let host, owner, repoName, fullUrl;
    
    // Check if it's a full URL or just a repository name
    if (gitRepoValue.startsWith('http://') || gitRepoValue.startsWith('https://')) {
      // Full URL format: "https://g.grmtech.com/associateattorney/repo-name"
      let cleanUrl = gitRepoValue;
      
      // Remove .git suffix if present
      if (cleanUrl.endsWith('.git')) {
        cleanUrl = cleanUrl.slice(0, -4);
      }
      
      // Split URL into parts
      const urlParts = cleanUrl.split('/').filter(part => part.length > 0);
      console.log('URL parts after filtering:', urlParts);
      
      if (urlParts.length < 4) { // https, domain, owner, repo
        throw new Error(`Invalid git_repo URL format: expected at least 4 parts but got ${urlParts.length}. URL: ${gitRepoValue}`);
      }

      // Extract parts: ['https:', 'g.grmtech.com', 'associateattorney', 'repo-name']
      repoName = urlParts[urlParts.length - 1];
      owner = urlParts[urlParts.length - 2];
      
      // Reconstruct host URL (everything before owner/repo)
      const hostParts = urlParts.slice(0, -2);
      host = hostParts.join('/');
      fullUrl = gitRepoValue;
      
    } else {
      // Just repository name format: "legal-studio"
      console.log('Detected repository name format, constructing full URL...');
      
      // Use default Gitea instance and try to get owner from workspace info
      host = 'https://g.grmtech.com';
      repoName = gitRepoValue;
      
      // Try to determine owner from workspace info
      // Look for owner in workspace created_by or other fields
      owner = workspace.created_by_email?.split('@')[0] || 
              workspace.owner || 
              workspace.created_by || 
              'default-user';
      
      // Clean up owner (remove special characters, use lowercase)
      owner = owner.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
      
      // Construct full URL
      fullUrl = `${host}/${owner}/${repoName}`;
      
      console.log('Constructed git info from repository name:', {
        originalValue: gitRepoValue,
        inferredOwner: owner,
        constructedUrl: fullUrl
      });
    }

    const result = {
      host: host,
      owner: owner,
      repo: repoName,
      fullUrl: fullUrl
    };
    
    console.log('Parsed git info successfully:', result);
    return result;
    
  } catch (error) {
    console.error('Failed to parse git repository info:', error);
    console.error('Workspace git_repo value:', workspace.git_repo);
    return null;
  }
}