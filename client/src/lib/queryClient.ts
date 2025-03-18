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

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  console.log(`API Request: ${method} ${url}`, data ? 'with data' : 'no data');
  
  // Check for existing cookies and log them
  console.log('Cookies being sent:', document.cookie || 'No cookies available');
  
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
        "Accept": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache"
      },
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include", // Always include cookies
      cache: "no-store" // Prevent caching
    });
    
    console.log(`API Response: ${res.status} ${res.statusText}`, 
                {url, method, status: res.status});
    
    // Check and log response cookies
    const setCookieHeader = res.headers.get('set-cookie');
    if (setCookieHeader) {
      console.log('Set-Cookie header received:', setCookieHeader.substring(0, 30) + '...');
    }
    
    // Clone the response to inspect its body while preserving it for later use
    const resClone = res.clone();
    
    try {
      // Log response body only for non-successful responses or auth endpoints
      if (!res.ok || url.includes('login') || url.includes('register') || url.includes('user')) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const bodyText = await resClone.text();
          // Sanitize logged responses to avoid exposing sensitive data
          const sanitizedBody = bodyText.replace(/"password":"[^"]*"/g, '"password":"[REDACTED]"');
          console.log('Response body (sanitized):', 
              url.includes('login') || url.includes('register') ? 
              '[AUTH RESPONSE - DETAILS REDACTED]' : sanitizedBody);
        }
      }
    } catch (e) {
      console.warn('Could not log response body:', e);
    }
    
    await throwIfResNotOk(res);
    
    // For login and register endpoints, force a cookie refresh
    if (url.includes('login') || url.includes('register')) {
      // Successful login/register - ensure cookies are refreshed
      console.log('Auth operation successful, current cookies:', document.cookie || 'No cookies');
    }
    
    return res;
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
    
    // Only log cookie keys, not values for security
    console.log(`Current cookies:`, Object.keys(cookieObj).length ? 
      `Found ${Object.keys(cookieObj).length} cookies: ${Object.keys(cookieObj).join(', ')}` : 
      'No cookies available');
    
    // Check for auth cookie presence - don't even attempt auth-required endpoints without it
    // Check for auth cookie but don't be strict about the format
    // In some environments 'auth_success=true' might be stored differently
    const hasAuthCookie = document.cookie.includes('auth_success');
    const hasManualAuthCookie = document.cookie.includes('manual_auth_success');
    
    // Check for a sessionStorage fallback if cookies aren't working
    let sessionUser = null;
    try {
      const savedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (savedSession && (hasManualAuthCookie || hasAuthCookie)) {
        sessionUser = JSON.parse(savedSession);
        console.log('Found backup user session in sessionStorage:', sessionUser?.username);
      }
    } catch (err) {
      console.error('Error reading from sessionStorage:', err);
    }
    
    // If user endpoint: use sessionStorage fallback if available, otherwise require cookies
    if (endpoint === '/api/user') {
      if (sessionUser) {
        console.log('Using sessionStorage user data instead of fetching');
        return sessionUser;
      } else if (!hasAuthCookie && !hasManualAuthCookie) {
        console.log('No auth cookie found when fetching user data, skipping request');
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
            document.cookie = 'auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
            document.cookie = 'user_info=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
            document.cookie = 'chitfund.sid=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
            document.cookie = 'server_online=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
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
        document.cookie = 'auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
        document.cookie = 'user_info=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
        document.cookie = 'chitfund.sid=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
        document.cookie = 'server_online=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
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