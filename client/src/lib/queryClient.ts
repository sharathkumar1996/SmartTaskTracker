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
  
  // Debug info about cookies
  console.log(`Raw cookie string:`, document.cookie || 'No cookies');
  
  // Parse cookie string into object for better debugging
  const cookies = document.cookie.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key) acc[key] = value;
    return acc;
  }, {} as Record<string, string>);
  
  console.log(`Current cookies:`, cookies);
  
  // Check for user info in cookie as first option
  let cookieUserObject = null;
  try {
    if (cookies.user_info) {
      cookieUserObject = JSON.parse(decodeURIComponent(cookies.user_info));
      console.log('Found user info in cookie:', cookieUserObject);
    }
  } catch (e) {
    console.error('Error parsing user_info cookie:', e);
  }
  
  // Check for user in session storage as backup option
  if (!cookieUserObject && userObject) {
    console.log('Found backup user session in sessionStorage:', userObject?.username);
  }
  
  // Use cookie data first, fall back to session storage
  const finalUserObject = cookieUserObject || userObject;
  
  // Make sure we have auth headers if any auth data is available
  const authHeaders = {};
  if (finalUserObject) {
    console.log(`Adding auth headers for user ID: ${finalUserObject.id}, role: ${finalUserObject.role}`);
    Object.assign(authHeaders, {
      "X-User-ID": finalUserObject.id.toString(),
      "X-User-Role": finalUserObject.role,
    });
  }
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        "Accept": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate", // Prevent caching
        ...authHeaders // Add our authentication headers
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
      
      const res = await fetch(endpoint, {
        credentials: "include", // Essential for session cookies
        cache: "no-store", // Prevent caching of auth responses
        headers: {
          "Accept": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          ...authHeaders
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