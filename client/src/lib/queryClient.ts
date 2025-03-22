import { QueryClient, QueryFunction } from "@tanstack/react-query";

// For session backup in case cookies fail
const SESSION_STORAGE_KEY = 'chitfund_user_session';

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage = res.statusText;
    try {
      // Try to parse as JSON first
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const errorData = await res.json();
        errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
      } else {
        // Fall back to text
        errorMessage = await res.text();
      }
    } catch (e) {
      console.error("Error parsing error response:", e);
      // Use the status text if parsing fails
      errorMessage = res.statusText;
    }
    
    // More detailed logging for auth-related errors
    if (res.status === 401) {
      console.error(`Authentication error (401): ${errorMessage}. Make sure you're using the correct credentials.`);
    } else if (res.status === 403) {
      console.error(`Authorization error (403): ${errorMessage}. You don't have permission to access this resource.`);
    } else {
      console.error(`API Error: ${res.status} - ${errorMessage}`);
    }
    
    throw new Error(`${res.status}: ${errorMessage}`);
  }
}

export async function apiRequest<T>({
  url,
  method = "GET",
  body
}: {
  url: string;
  method?: string;
  body?: unknown;
}): Promise<T> {
  console.log(`API Request: ${method} ${url}`, body ? 'with data' : 'no data');
  
  // Get deployment environment details
  // Handle server-side rendering where window may be undefined
  const isRender = typeof window !== 'undefined' && window.location?.hostname ? 
    window.location.hostname.includes('.onrender.com') : false;
  
  const isCustomDomain = typeof window !== 'undefined' && window.location?.hostname ? (
    window.location.hostname === 'srivasavifinancialservices.in' || 
    window.location.hostname === 'www.srivasavifinancialservices.in'
  ) : false;
  
  // Enable debugging for deployment environments
  if (isRender || isCustomDomain) {
    console.log(`Detected special deployment environment:`, {
      isRender,
      isCustomDomain,
      hostname: typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'unknown'
    });
  }
  
  // Collect authentication info from all possible sources
  
  // 1. Try sessionStorage first (fastest, most reliable for same domain)
  const sessionStorageKey = 'chitfund_user_session';
  let sessionUserObject = null;
  try {
    const userSession = sessionStorage.getItem(sessionStorageKey);
    if (userSession) {
      sessionUserObject = JSON.parse(userSession);
      console.log("Found user in sessionStorage:", { 
        userId: sessionUserObject?.id, 
        username: sessionUserObject?.username 
      });
    }
  } catch (e) {
    console.error("Error reading from sessionStorage:", e);
  }
  
  // 2. Look for user info in cookies 
  let cookieUserObject = null;
  try {
    const cookies: Record<string, string> = {};
    document.cookie.split(';').forEach(cookie => {
      const parts = cookie.trim().split('=');
      if (parts.length === 2) {
        cookies[parts[0]] = parts[1];
      }
    });
    
    // Check for user info cookie (more reliable than just auth flag)
    if ('user_info' in cookies) {
      cookieUserObject = JSON.parse(decodeURIComponent(cookies['user_info']));
      console.log('Found user in cookies:', { 
        userId: cookieUserObject?.id, 
        username: cookieUserObject?.username 
      });
    }
  } catch (e) {
    console.error('Error parsing cookie data:', e);
  }
  
  // 3. For Render/custom domain: Check localStorage as fallback
  let localStorageUserObject = null;
  if (isRender || isCustomDomain) {
    try {
      const localStorageKey = 'chitfund_render_user';
      const localStorageData = localStorage.getItem(localStorageKey);
      
      if (localStorageData) {
        localStorageUserObject = JSON.parse(localStorageData);
        console.log('Found user in localStorage (cross-domain):', {
          userId: localStorageUserObject?.id,
          username: localStorageUserObject?.username
        });
      }
    } catch (e) {
      console.error('Error reading from localStorage:', e);
    }
  }
  
  // Use the first valid auth source we find, in order of reliability
  const userObject = cookieUserObject || sessionUserObject || localStorageUserObject;
  
  // Authentication headers are critical for cross-domain environments
  // where cookies don't always work correctly
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  };
  
  // Add content-type for requests with body
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  
  // Add auth headers if we found a user from any source
  if (userObject) {
    console.log(`Adding auth headers for user ID: ${userObject.id}`);
    
    // These custom headers help with cross-domain auth when cookies fail
    headers["X-User-ID"] = userObject.id.toString();
    headers["X-User-Role"] = userObject.role;
    headers["X-User-Auth"] = "true";
    
    // For auth endpoints, add more details to help with verification
    if (url.includes('/login') || url.includes('/register') || url.includes('/user')) {
      headers["X-User-Name"] = userObject.username;
      
      if (userObject.fullName) {
        headers["X-User-FullName"] = userObject.fullName;
      }
    }
  }
  
  // For debugging on Render, add special headers to track origin of request
  if (isRender || isCustomDomain) {
    headers["X-Client-Host"] = typeof window !== 'undefined' && window.location?.hostname ? 
      window.location.hostname : 'unknown';
    headers["X-Deploy-Type"] = isRender ? "render" : "custom-domain";
    headers["X-Special-Render-Access"] = "true";
    
    // Store deployment platform in localStorage for page refreshes
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('deploy_platform', isRender ? 'render' : 'custom-domain');
    }
  }
  
  try {
    // Perform the fetch request with our enhanced headers
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include", // Always include cookies
    });
    
    console.log(`API ${method} ${url} response:`, {
      status: response.status,
      statusText: response.statusText,
      authenticated: !!userObject
    });
    
    // Handle error responses
    if (!response.ok) {
      let errorMessage = response.statusText;
      
      try {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
        } else {
          errorMessage = await response.text();
        }
      } catch (e) {
        console.error("Error parsing error response:", e);
      }
      
      // Special handling for auth-related errors
      if (response.status === 401) {
        console.error(`Authentication error (401): ${errorMessage}`);
        
        // For auth endpoints, sync up our storage to match server state (not authenticated)
        if (url.includes('/user') || url.includes('/login')) {
          try {
            console.log('Clearing inconsistent auth data after 401 error');
            sessionStorage.removeItem(sessionStorageKey);
            
            if (isRender || isCustomDomain) {
              localStorage.removeItem('chitfund_render_user');
            }
            
            // Clear auth cookies
            document.cookie = 'auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            document.cookie = 'manual_auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            document.cookie = 'user_info=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
          } catch (e) {
            console.error('Error clearing auth data:', e);
          }
        }
      }
      
      throw new Error(errorMessage || `Request failed with status ${response.status}`);
    }
    
    // Special handling for successful auth endpoints - ensure data is synced
    if (url.includes('/login') || url.includes('/register')) {
      console.log('Auth operation successful - preserving auth state across all channels');
      
      // For login/register success, server should already set proper cookies
      // but we don't need to handle that here
    }
    
    // Parse and return the response body
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json() as T;
    }
    
    // Handle non-JSON responses (rare)
    return {} as T;
  } catch (error) {
    console.error(`API Request failed: ${method} ${url}`, error);
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const endpoint = queryKey[0] as string;
    console.log(`getQueryFn fetching: ${endpoint}`);
    
    // Parse existing cookies for debugging
    const cookieObj = document.cookie ? 
      document.cookie.split(';').reduce((acc, cookie) => {
        try {
          const [key, value] = cookie.trim().split('=');
          return {...acc, [key]: value};
        } catch (e) {
          return acc;
        }
      }, {} as Record<string, string>) : {};
    
    // Log all cookie details for debugging
    console.log(`Raw cookie string:`, document.cookie || 'No cookies');
    console.log(`Current cookies:`, cookieObj);
    
    // Check for auth cookie presence - don't even attempt auth-required endpoints without it
    // Check for auth cookie but don't be strict about the format
    // In some environments 'auth_success=true' might be stored differently
    const hasAuthCookie = document.cookie.includes('auth_success');
    const hasManualAuthCookie = document.cookie.includes('manual_auth_success');
    
    // Check for a sessionStorage fallback if cookies aren't working
    let sessionUser = null;
    const sessionStorageKey = 'chitfund_user_session';
    try {
      const savedSession = sessionStorage.getItem(sessionStorageKey);
      if (savedSession) {
        sessionUser = JSON.parse(savedSession);
        console.log('Found backup user session in sessionStorage:', sessionUser?.username);
      }
    } catch (err) {
      console.error('Error reading from sessionStorage:', err);
    }
    
    // If user endpoint: use sessionStorage fallback if available, otherwise require cookies
    if (endpoint === '/api/user') {
      // Check sessionStorage first
      if (sessionUser) {
        console.log('Using sessionStorage user data as fallback authentication');
        // Even when using sessionStorage, make a background API request to try to 
        // restore the server session if possible
        try {
          // Silent authentication attempt in the background
          fetch('/api/user', {
            credentials: "include",
            cache: "no-store",
            headers: {
              "Accept": "application/json",
              "Cache-Control": "no-cache, no-store, must-revalidate"
            }
          }).then(res => {
            console.log('Background session validation:', res.status);
          }).catch(err => {
            console.warn('Background session validation failed:', err);
          });
        } catch (e) {
          console.warn('Failed to start background session check:', e);
        }
        
        return sessionUser;
      } else if (!hasAuthCookie && !hasManualAuthCookie) {
        console.log('No auth cookie found when fetching user data, skipping request');
        // Last resort attempt - try to get a fresh session
        try {
          sessionStorage.removeItem(sessionStorageKey);
        } catch (e) {
          console.warn('Failed to clear session storage:', e);
        }
        return null;
      }
    }
    
    try {
      // Add the auth headers from session storage if available
      const authHeaders = {};
      
      if (sessionUser) {
        console.log(`Adding auth headers for user ID: ${sessionUser.id}, role: ${sessionUser.role}`);
        Object.assign(authHeaders, {
          "X-User-ID": sessionUser.id.toString(),
          "X-User-Role": sessionUser.role
        });
      }
      
      // Check if we're on Render.com
      const isRender = typeof window !== 'undefined' && window.location?.hostname ? 
        window.location.hostname.includes('.onrender.com') : false;
      
      const isCustomDomain = typeof window !== 'undefined' && window.location?.hostname ? (
        window.location.hostname === 'srivasavifinancialservices.in' || 
        window.location.hostname === 'www.srivasavifinancialservices.in'
      ) : false;
      
      // Combine all headers
      const headers = {
        "Accept": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        ...authHeaders
      };
      
      // Add Render-specific headers if needed
      if (isRender || isCustomDomain || localStorage.getItem('deploy_platform') === 'render') {
        console.log("Adding special Render.com headers for request to:", endpoint);
        headers["X-Deploy-Type"] = "render";
        headers["X-Special-Render-Access"] = "true";
        headers["X-Client-Host"] = typeof window !== 'undefined' && window.location?.hostname ? 
          window.location.hostname : 'unknown';
      }
      
      const res = await fetch(endpoint, {
        credentials: "include", // Essential for session cookies
        cache: "no-store", // Prevent caching of auth responses
        headers
      });
      
      console.log(`getQueryFn response: ${endpoint} - status ${res.status}`);
      
      // Special handling for unauthorized requests
      if (res.status === 401) {
        // Handle unauthorized access according to specified behavior
        if (unauthorizedBehavior === "returnNull") {
          console.log(`getQueryFn: Unauthorized access to ${endpoint}, returning null as configured`);
          
          // If this is a user endpoint and we have stale cookies, clear them
          if (endpoint === '/api/user' && hasAuthCookie) {
            console.log('Clearing stale authentication cookies');
            // Clear all cookies - standard format
            document.cookie = 'auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            document.cookie = 'user_info=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            document.cookie = 'chitfund.sid=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            document.cookie = 'server_online=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            document.cookie = 'manual_auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
          }
          
          return null;
        }
        // Otherwise let the error handling below take care of it
      }
      
      // Process response normally for other status codes
      await throwIfResNotOk(res);
      const data = await res.json();
      return data;
    } catch (error) {
      console.error(`getQueryFn error for ${endpoint}:`, error);
      
      // If this is a critical auth endpoint, clear cookies on error for a clean slate
      if (endpoint === '/api/user') {
        console.log('Auth error occurred, clearing potentially corrupted cookies');
        // Clear all cookies - standard format
        document.cookie = 'auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        document.cookie = 'user_info=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        document.cookie = 'chitfund.sid=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        document.cookie = 'server_online=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        document.cookie = 'manual_auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      }
      
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30000, // Data stays fresh for 30 seconds
      retry: 1, // Only retry once on failure
    },
    mutations: {
      retry: 1,
    },
  },
});