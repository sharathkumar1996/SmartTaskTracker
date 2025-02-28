import { QueryClient, QueryFunction } from "@tanstack/react-query";

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
  
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
        "Accept": "application/json"
      },
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
    
    console.log(`API Response: ${res.status} ${res.statusText}`, 
                {url, method, status: res.status});
    
    // Clone the response to inspect its body while preserving it for later use
    const resClone = res.clone();
    
    try {
      // Log response body only for non-successful responses
      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const bodyText = await resClone.text();
          console.log('Response body:', bodyText);
        }
      }
    } catch (e) {
      console.warn('Could not log response body:', e);
    }
    
    await throwIfResNotOk(res);
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
    console.log(`getQueryFn fetching: ${queryKey[0]}`);
    console.log(`Current cookies:`, document.cookie ? JSON.parse(JSON.stringify(document.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      return {...acc, [key]: value};
    }, {}))) : {});
    
    try {
      const res = await fetch(queryKey[0] as string, {
        credentials: "include", // Essential for session cookies
        headers: {
          "Accept": "application/json",
        },
      });
      
      console.log(`getQueryFn response: ${queryKey[0]} - status ${res.status}`);
      
      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        console.log(`getQueryFn: Unauthorized access to ${queryKey[0]}, returning null as configured`);
        return null;
      }
      
      await throwIfResNotOk(res);
      const data = await res.json();
      return data;
    } catch (error) {
      console.error(`getQueryFn error for ${queryKey[0]}:`, error);
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