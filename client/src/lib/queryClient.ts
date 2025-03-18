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
  
  // Check for session in local storage - this is our alternative auth mechanism
  const sessionStorageKey = 'chitfund_user_session';
  const userSession = sessionStorage.getItem(sessionStorageKey);
  let userObject = null;
  
  if (userSession) {
    try {
      const sessionData = JSON.parse(userSession);
      userObject = sessionData;
      console.log("Using backup session for API request:", { userId: userObject?.id, role: userObject?.role });
    } catch (e) {
      console.error("Error parsing session data:", e);
    }
  }
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        "Accept": "application/json",
        // Add our local authentication if available
        ...(userObject ? { "X-User-ID": userObject.id.toString(), "X-User-Role": userObject.role } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include", // Always include cookies
    });
    
    console.log(`API Response: ${response.status} ${response.statusText}`, 
                {url, method, status: response.status});
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = errorText;
      
      try {
        // Try to parse as JSON if possible
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorJson.error || JSON.stringify(errorJson);
      } catch (e) {
        // If not JSON, just use the text
      }
      
      console.error(`API Error (${response.status}): ${errorMessage}`);
      throw new Error(errorMessage || `Request failed with status ${response.status}`);
    }
    
    // Special handling for auth endpoints
    if (url.includes('/login') || url.includes('/register')) {
      console.log('Auth operation successful');
    }
    
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json() as T;
    }
    
    // Handle non-JSON responses
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
    try {
      const savedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
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
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
        } catch (e) {
          console.warn('Failed to clear session storage:', e);
        }
        return null;
      }
    }
    
    try {
      const res = await fetch(endpoint, {
        credentials: "include", // Essential for session cookies
        cache: "no-store", // Prevent caching of auth responses
        headers: {
          "Accept": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache"
        },
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