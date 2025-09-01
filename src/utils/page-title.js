export function setOutlineTitle(focusedText, workspaceName) {
  const title = focusedText 
    ? `${focusedText} - ${workspaceName}`
    : `${workspaceName} - Outline`
  document.title = title
}

export function setWorkspaceTitle(section, workspaceName) {
  const title = section 
    ? `${section} - ${workspaceName}`
    : `${workspaceName} - Files`
  document.title = title
}

export function getCleanText(text) {
  if (!text) return ''
  // Remove HTML tags and clean up text for title display
  return text.replace(/<[^>]*>/g, '').trim()
}
