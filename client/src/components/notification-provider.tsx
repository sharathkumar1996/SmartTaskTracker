import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface Notification {
  id: number;
  title: string;
  message: string;
  type: "payment" | "reminder" | "system";
  isRead: boolean;
  createdAt: string;
}

interface NotificationContextType {
  notifications: Notification[];
  markAsRead: (id: number) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;

    // Setup WebSocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      const notification: Notification = JSON.parse(event.data);
      setNotifications(prev => [notification, ...prev]);

      // Show toast notification
      toast({
        title: notification.title,
        description: notification.message,
      });
    };

    // Cleanup on unmount
    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [user]);

  const markAsRead = async (id: number) => {
    try {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        setNotifications(prev =>
          prev.map(notification =>
            notification.id === id
              ? { ...notification, isRead: true }
              : notification
          )
        );
      }
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  return (
    <NotificationContext.Provider value={{ notifications, markAsRead }}>
      {children}
    </NotificationContext.Provider>
  );
}
