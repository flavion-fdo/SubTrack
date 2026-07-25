/**
 * Utility for resolving API host and safely parsing JSON responses.
 * Prevents "Unexpected token 'A' ... is not valid JSON" errors when servers return HTML or text errors.
 */

export const getApiHost = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl !== undefined && envUrl !== null && envUrl !== '') {
    return envUrl;
  }
  return import.meta.env.DEV ? 'http://localhost:5000' : '';
};

export const safeParseJson = async (res) => {
  const text = await res.text();
  let data;
  
  try {
    data = JSON.parse(text);
  } catch {
    // Strip HTML tags if response is HTML error page
    const cleanText = text.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
    throw new Error(cleanText || `Server Error (${res.status})`);
  }
  
  if (!res.ok) {
    throw new Error(data.message || data.error || `Request failed with status ${res.status}`);
  }
  
  return data;
};
